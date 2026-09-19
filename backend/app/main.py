import hashlib
import json
import mimetypes
import os
import re
import secrets
import threading
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import desc, event, inspect, or_, select, text
from sqlalchemy.orm import Session

from app.auth import create_access_token, decode_access_token, get_password_hash, verify_password
from app.config import settings
from app.database import Base, SessionLocal, engine
from app.capabilities import (
    capabilities, decrypt_bytes, encrypt_bytes, new_totp_secret, ocr_bytes,
    gemini_generate, gemini_summary, local_document_analysis, semantic_search,
    sign_digest, verify_signature, verify_totp,
)
from app.models import (
    AIQuery, AuditLog, BackupRecord, BlockchainRecord, Case, CaseCollaborator,
    CaseEvent, ChainAnchor, Document, DocumentShare, DocumentVersion,
    Notification, Permission, User,
)
from app.public_portal import (
    PublicCaseStatus, PublicSessionLocal, public_session,
    publish_case_snapshot, public_verification_code, write_public_audit,
)

PUBLIC_LEGAL_SOURCES = [
    {
        "title": "Official legal information placeholder",
        "authority": "Configured public law library",
        "note": "Replace with current, jurisdiction-specific official statutes and procedural rules before production.",
    },
]

GENERAL_ASSISTANT_GUIDANCE = [
    {
        "keywords": ("documents", "file", "complaint"),
        "answer": (
            "For a complaint, prepare a clear date-ordered statement of facts, your identity "
            "and contact details, the name or description of the person or organisation complained "
            "about, and the remedy you want. Attach relevant contracts, invoices, messages, "
            "photographs, medical records, payment proof and witness details. Keep the originals, "
            "submit copies through the official channel, and obtain an acknowledgement or reference "
            "number. Do not include confidential investigation records unless the authorised "
            "authority requests them."
        ),
    },
    {
        "keywords": ("simple words", "explain this case", "explain the case"),
        "answer": (
            "A case can be understood by separating it into five parts: who the parties are, "
            "what happened and when, what evidence exists, what legal issue is being considered, "
            "and what stage the process has reached. In this workspace no authorised case document "
            "matched the question, so I cannot describe the facts of a specific case without "
            "risking an invented answer. Open or upload the relevant record, then ask again for "
            "a source-based summary."
        ),
    },
    {
        "keywords": ("verify", "document"),
        "answer": (
            "Verify a document by checking its issuing authority, title, date, case or reference "
            "number, names and signatures. Compare it with the source record, confirm that pages "
            "and attachments are complete, and check the file hash or digital signature when "
            "available. Treat an unsigned copy, unexplained alteration or inconsistent date as "
            "something that needs confirmation from the issuing authority."
        ),
    },
    {
        "keywords": ("check", "before", "filing"),
        "answer": (
            "Before filing, confirm the correct court or authority, jurisdiction, limitation "
            "deadline, parties and addresses, facts, legal provisions, requested relief, "
            "supporting documents, filing fee and service requirements. Check that names, dates, "
            "case numbers and annexure references match throughout. Keep a stamped acknowledgement "
            "or electronic filing receipt and review the final document with qualified counsel."
        ),
    },
    {
        "keywords": ("summarize", "evidence"),
        "answer": (
            "A reliable evidence summary should identify each item, its source, date, custodian, "
            "relevance and any limitation. Keep original files and record how each item was "
            "collected. Do not infer guilt, authenticity or ownership from an item merely because "
            "it appears relevant. No authorised evidence was retrieved for this request, so a "
            "case-specific summary requires the relevant records to be uploaded or opened."
        ),
    },
    {
        "keywords": ("next step", "case"),
        "answer": (
            "The next step depends on the case stage. First confirm the latest order, notice or "
            "deadline, then record what has already been filed and what response is due. Preserve "
            "supporting evidence, prepare only the documents requested by the authority, and seek "
            "qualified legal advice before making admissions or missing a deadline. No authorised "
            "case record was retrieved here, so I cannot safely identify a case-specific next step."
        ),
    },
]

SEARCH_STOPWORDS = {
    "a", "an", "and", "are", "about", "as", "at", "by", "for", "from",
    "in", "into", "is", "of", "on", "or", "the", "to", "with",
}

_audit_write_lock = threading.Lock()


@event.listens_for(Session, "after_commit")
@event.listens_for(Session, "after_rollback")
def _release_audit_write_lock(session):
    if session.info.pop("audit_write_lock_held", False):
        _audit_write_lock.release()

Base.metadata.create_all(bind=engine)
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Keep the prototype compatible with the database created by earlier versions.
if engine.url.get_backend_name() == "sqlite":
    columns = {column["name"] for column in inspect(engine).get_columns("documents")}
    with engine.begin() as connection:
        for name, definition in {
            "case_id": "INTEGER",
            "sha256": "VARCHAR(64) NOT NULL DEFAULT ''",
            "description": "TEXT",
            "tags": "VARCHAR",
            "extracted_text": "TEXT",
            "signature": "VARCHAR",
            "encrypted": "BOOLEAN NOT NULL DEFAULT 0",
            "classification": "VARCHAR",
            "summary": "TEXT",
            "storage_provider": "VARCHAR NOT NULL DEFAULT 'local'",
            "sensitivity": "VARCHAR NOT NULL DEFAULT 'confidential'",
        }.items():
            if name not in columns:
                connection.execute(text(f"ALTER TABLE documents ADD COLUMN {name} {definition}"))
    user_columns = {column["name"] for column in inspect(engine).get_columns("users")}
    with engine.begin() as connection:
        for name, definition in {
            "mfa_secret": "VARCHAR",
            "mfa_enabled": "BOOLEAN NOT NULL DEFAULT 0",
            "department": "VARCHAR NOT NULL DEFAULT 'investigations'",
        }.items():
            if name not in user_columns:
                connection.execute(text(f"ALTER TABLE users ADD COLUMN {name} {definition}"))
    case_columns = {column["name"] for column in inspect(engine).get_columns("cases")}
    with engine.begin() as connection:
        for name, definition in {
            "fir_number": "VARCHAR",
            "police_station": "VARCHAR",
            "investigating_officer_id": "INTEGER",
            "sensitivity": "VARCHAR NOT NULL DEFAULT 'confidential'",
        }.items():
            if name not in case_columns:
                connection.execute(text(f"ALTER TABLE cases ADD COLUMN {name} {definition}"))

app = FastAPI(
    title="Secure Digital Document Management System",
    description="NyayVault - secure case intelligence for legal and investigation documents",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=str(settings.BASE_DIR / "app" / "static")), name="static")
templates_dir = settings.BASE_DIR / "app" / "templates"
frontend_dist = settings.BASE_DIR.parent / "frontend" / "dist"
security = HTTPBearer(auto_error=False)


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2)
    role: str = "investigator"
    department: str = "investigations"


class LoginRequest(BaseModel):
    email: str
    password: str
    mfa_code: str | None = None


class CaseRequest(BaseModel):
    case_number: str
    title: str
    status: str = "active"
    fir_number: str = ""
    police_station: str = ""
    investigating_officer_id: int | None = None
    sensitivity: str = "confidential"


class CaseEventRequest(BaseModel):
    event_type: str = Field(min_length=2)
    notes: str = ""
    event_at: str | None = None


class PublicQuestionRequest(BaseModel):
    question: str = Field(min_length=3)
    language: str = "English"
    audience: str = "citizen"


class ComplaintDraftRequest(BaseModel):
    facts: str = Field(min_length=10)
    language: str = "English"


class CaseTrackRequest(BaseModel):
    case_number: str = Field(min_length=2)
    verification_code: str = Field(min_length=2)


class PersonalDocumentRequest(BaseModel):
    text: str = Field(min_length=10)
    document_type: str = "general"
    language: str = "English"


class PermissionRequest(BaseModel):
    user_id: int | None = None
    role: str | None = None
    case_id: int | None = None
    document_id: int | None = None
    access_level: str = "view"
    valid_from: str | None = None
    valid_to: str | None = None


class ShareRequest(BaseModel):
    shared_with: str
    permission: str = "view"


ALLOWED_SENSITIVITY = {"public", "internal", "confidential", "restricted", "highly_sensitive"}


class CollaboratorRequest(BaseModel):
    user_id: int
    department: str
    access_level: str = "contributor"


class AiQuestionRequest(BaseModel):
    question: str = Field(min_length=3)
    language: str = "English"
    plain_language: bool = False
    document_ids: list[int] = Field(default_factory=list)


class AiDraftRequest(BaseModel):
    request: str = Field(min_length=3)
    document_ids: list[int] = Field(default_factory=list)
    language: str = "English"


def authorized_documents(db: Session, user: User, document_ids: list[int] | None = None):
    query = db.query(Document).filter(Document.is_active.is_(True))
    if document_ids:
        query = query.filter(Document.id.in_(document_ids))
    return [
        document for document in query.order_by(desc(Document.created_at)).all()
        if can_access_document(db, document, user)
    ]


DEMO_WORKSPACE_RECORDS = [
    ("FIR-2026-0142 · Cyber harassment complaint", "fir", "FIR mentioning financial fraud",
     "FIR records a cyber harassment complaint, the reporting party, initial dates and the first preservation request for platform records."),
    ("Charge sheet · Digital payment fraud inquiry", "charge_sheet", "charge sheet financial fraud",
     "Charge sheet summary describing disputed digital transfers, account identifiers, witness references and the investigation chronology."),
    ("Witness statement · Vehicle identification", "witness", "witness statement about vehicle identification",
     "Witness statement describing vehicle identification, time, location, lighting conditions and the limits of the witness observation."),
    ("Evidence register · Mobile device extraction", "evidence", "evidence register device extraction",
     "Evidence register lists a mobile device image, collection date, hash reference, custodian and chain-of-custody handover."),
    ("Forensic report · DNA evidence", "forensic", "forensic report with DNA evidence",
     "Forensic laboratory report records sample identifiers, DNA profile comparison, controls, methodology and an expert conclusion subject to review."),
    ("Court filing · Urgent interim notice", "court_filing", "court filing with urgent notice",
     "Court filing contains an urgent interim application, filing date, parties, requested protection and the next listing information."),
    ("Judgment extract · Evidence admissibility", "judgment", "judgment evidence admissibility",
     "Judgment extract discusses reliability, admissibility, chain of custody and the need to assess evidence in its full context."),
    ("Investigation memo · Complaint timeline", "investigation", "investigation complaint timeline",
     "Investigation memo organises the complaint timeline, actions completed, pending enquiries and records still requested from agencies."),
    ("Medical record summary · Injury assessment", "medical", "medical record injury assessment",
     "Medical record summary notes the examination date, reported symptoms, clinical observations and recommended follow-up."),
    ("Bank statement bundle · Transaction review", "evidence", "bank statement financial transaction review",
     "Bank statement bundle lists transaction dates, reference numbers, disputed amounts and the reconciliation notes prepared for review."),
    ("Digital evidence log · Platform messages", "evidence", "digital evidence platform messages",
     "Digital evidence log records message exports, URLs, timestamps, account identifiers, preservation steps and hash values."),
    ("Legal notice response · Document checklist", "court_filing", "legal notice response document checklist",
     "Draft response checklist covers the notice deadline, relevant agreement, supporting correspondence, requested remedy and review before sending."),
]

DEMO_SENSITIVITY_BY_TITLE = {
    "FIR-2026-0142 · Cyber harassment complaint": "restricted",
    "Charge sheet · Digital payment fraud inquiry": "confidential",
    "Witness statement · Vehicle identification": "internal",
    "Evidence register · Mobile device extraction": "restricted",
    "Forensic report · DNA evidence": "highly_sensitive",
    "Court filing · Urgent interim notice": "public",
    "Judgment extract · Evidence admissibility": "public",
    "Investigation memo · Complaint timeline": "internal",
    "Medical record summary · Injury assessment": "highly_sensitive",
    "Bank statement bundle · Transaction review": "confidential",
    "Digital evidence log · Platform messages": "restricted",
    "Legal notice response · Document checklist": "public",
}


def ensure_demo_workspace_records(db: Session, user: User) -> None:
    marker = "demo workspace record"
    existing_documents = db.query(Document).filter(
            Document.uploader_id == user.id,
            Document.tags.ilike(f"%{marker}%"),
        ).all()
    existing = {item.title for item in existing_documents}
    changed_existing = False
    for item in existing_documents:
        sensitivity = DEMO_SENSITIVITY_BY_TITLE.get(item.title)
        if sensitivity and item.sensitivity != sensitivity:
            item.sensitivity = sensitivity
            changed_existing = True
    missing = []
    for title, document_type, search_tags, extracted_text in DEMO_WORKSPACE_RECORDS:
        if title in existing:
            continue
        content = f"{marker}; {search_tags}; {extracted_text}"
        missing.append(Document(
            title=title,
            filename=f"{title.lower().replace(' ', '-').replace('·', '').replace('/', '-')}.txt",
            file_path="",
            document_type=document_type,
            uploader_id=user.id,
            sha256=hashlib.sha256(content.encode("utf-8")).hexdigest(),
            description=f"Demo record for testing {document_type} evidence search.",
            tags=f"{marker}, {search_tags}",
            extracted_text=content,
            encrypted=False,
            classification="demo",
            summary=extracted_text,
            storage_provider="demo-workspace",
            sensitivity=DEMO_SENSITIVITY_BY_TITLE.get(title, "confidential"),
        ))
    if missing or changed_existing:
        db.add_all(missing)
        db.commit()


PRIVILEGED_ROLES = {
    "admin", "police", "investigator", "forensic_officer",
    "prosecutor", "judicial_user", "court_officer",
}
SENSITIVITY_RANK = {
    "public": 0, "internal": 1, "confidential": 2,
    "restricted": 3, "highly_sensitive": 4,
}
ROLE_DOCUMENT_TYPES = {
    "forensic_officer": {"forensic", "evidence", "investigation", "witness"},
    "prosecutor": {"fir", "investigation", "witness", "evidence", "forensic", "charge_sheet", "court_filing"},
    "judicial_user": {"charge_sheet", "court_filing", "judgment"},
    "court_officer": {"court_filing", "judgment"},
}
ROLE_MAX_SENSITIVITY = {
    "police": "restricted",
    "investigator": "restricted",
    "forensic_officer": "highly_sensitive",
    "prosecutor": "restricted",
    "judicial_user": "highly_sensitive",
    "court_officer": "restricted",
    "citizen": "internal",
}


def _permission_matches(db: Session, document: Document, user: User) -> bool:
    now = datetime.utcnow()
    permissions = db.query(Permission).filter(
        or_(Permission.user_id == user.id, Permission.role == user.role),
        or_(Permission.document_id == document.id, Permission.document_id.is_(None)),
        or_(Permission.case_id == document.case_id, Permission.case_id.is_(None)),
    ).all()
    return any(
        (permission.valid_from is None or permission.valid_from <= now)
        and (permission.valid_to is None or permission.valid_to >= now)
        for permission in permissions
    )


def can_access_document(db: Session, document: Document, user: User) -> bool:
    if user.role == "admin":
        return True
    if document.uploader_id == user.id:
        return True
    if _permission_matches(db, document, user):
        return True
    if document.case_id is None:
        return False
    collaborator = db.query(CaseCollaborator).filter(
        CaseCollaborator.case_id == document.case_id,
        CaseCollaborator.user_id == user.id,
    ).first()
    if not collaborator:
        return False
    department = (getattr(user, "department", None) or user.role).strip().lower()
    assigned_department = (collaborator.department or "").strip().lower()
    if assigned_department not in {department, user.role.lower(), "all", "government"}:
        return False
    allowed_types = ROLE_DOCUMENT_TYPES.get(user.role)
    if allowed_types and document.document_type not in allowed_types:
        return False
    sensitivity = (document.sensitivity or "confidential").lower()
    if user.role == "citizen" and sensitivity not in {"public", "internal"}:
        return False
    maximum = ROLE_MAX_SENSITIVITY.get(user.role, "confidential")
    if SENSITIVITY_RANK.get(sensitivity, 2) > SENSITIVITY_RANK[maximum]:
        return False
    case = db.get(Case, document.case_id)
    if case and SENSITIVITY_RANK.get(sensitivity, 2) > SENSITIVITY_RANK.get(
        (case.sensitivity or "confidential").lower(), 2
    ):
        return False
    return True


def document_context(documents: list[Document]) -> list[dict]:
    return [{
        "id": item.id, "title": item.title, "document_type": item.document_type,
        "text": " ".join(filter(None, [
            item.title, item.description, item.tags, item.extracted_text,
        ])).strip(),
    } for item in documents]


def extract_entities(text_value: str) -> dict:
    patterns = {
        "dates": r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|(?:\d{1,2}\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b",
        "case_numbers": r"\b(?:FIR|Case|Crime|C\.?C\.?|S\.?C\.?)\s*[-/#:]?\s*[A-Z0-9][A-Z0-9/-]{2,}\b",
        "sections": r"\b(?:Section|Sec\.|U/S)\s*[\dA-Za-z()/-]+(?:\s*(?:IPC|CrPC|BNS|BNSS|POCSO|NDPS))?\b",
    }
    entities = {name: sorted(set(re.findall(pattern, text_value, re.IGNORECASE))) for name, pattern in patterns.items()}
    entities["locations"] = sorted(set(re.findall(
        r"\b(?:at|in|near|village|district|city|station)\s+([A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){0,2})",
        text_value,
    )))
    entities["names"] = sorted(set(re.findall(
        r"\b(?:Mr\.|Ms\.|Mrs\.|Dr\.|Inspector|Officer|Witness|Accused)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})",
        text_value,
    )))
    return entities


def extract_timeline(text_value: str) -> list[dict]:
    events = []
    for sentence in re.split(r"(?<=[.!?])\s+", text_value.replace("\n", " ")):
        dates = extract_entities(sentence)["dates"]
        if dates:
            events.append({"date": dates[0], "event": sentence.strip()[:280]})
    return events[:30]


ALLOWED_ROLES = {
    "admin", "police", "investigator", "forensic_officer",
    "prosecutor", "judicial_user", "court_officer", "citizen",
}
SECURE_ROLE_CAPABILITIES = {
    "police": ["Assigned case access", "FIR and evidence upload", "Case collaboration", "Case AI"],
    "investigator": ["Investigation records", "Evidence management", "Timeline building", "Case AI"],
    "forensic_officer": ["Forensic records", "Evidence chain review", "Lab report upload", "Integrity verification"],
    "prosecutor": ["Prosecution workspace", "Charge-sheet review", "Court filing preparation", "Controlled sharing"],
    "judicial_user": ["Court-facing records", "Filing and judgment review", "Integrity verification", "Status oversight"],
    "court_officer": ["Court-facing records", "Filing coordination", "Judgment repository", "Controlled sharing"],
    "admin": ["User and role administration", "Department configuration", "Security events", "Integrity anchors"],
}
LEGAL_DOCUMENT_TYPES = {
    "fir", "charge_sheet", "witness", "evidence", "forensic",
    "court_filing", "judgment", "investigation",
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    payload = decode_access_token(credentials.credentials)
    user_id = payload.get("sub") if payload else None
    user = db.get(User, int(user_id)) if user_id and str(user_id).isdigit() else None
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return user


def require_privileged_mfa(user: User = Depends(current_user)) -> User:
    if user.role in PRIVILEGED_ROLES and not user.mfa_enabled:
        raise HTTPException(
            status_code=403,
            detail="MFA enrollment is required for privileged account actions",
            headers={"X-MFA-Required": "true"},
        )
    return user


def require_roles(*roles: str):
    def dependency(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dependency


def require_admin_mfa(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator role required")
    return require_privileged_mfa(user)


def write_audit(db: Session, action: str, entity_type: str, user_id: int | None,
                entity_id: int | None = None, details: dict | None = None):
    acquired_lock = False
    if not db.info.get("audit_write_lock_held"):
        _audit_write_lock.acquire()
        db.info["audit_write_lock_held"] = True
        acquired_lock = True
    try:
        previous = db.query(AuditLog).order_by(desc(AuditLog.id)).first()
        previous_hash = previous.entry_hash if previous else "GENESIS"
        payload = {
            "action": action, "entity_type": entity_type, "entity_id": entity_id,
            "user_id": user_id, "details": details or {}, "previous_hash": previous_hash,
        }
        entry_hash = hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
        db.add(AuditLog(
            action=action, entity_type=entity_type, entity_id=entity_id, user_id=user_id,
            details=json.dumps(details or {}), previous_hash=previous_hash, entry_hash=entry_hash,
        ))
        db.flush()
    except Exception:
        if acquired_lock:
            db.info.pop("audit_write_lock_held", None)
            _audit_write_lock.release()
        raise


def serialize_document(document: Document) -> dict:
    return {
        "id": document.id, "title": document.title, "filename": document.filename,
        "document_type": document.document_type, "case_id": document.case_id,
        "version": document.version, "sha256": document.sha256,
        "description": document.description, "tags": document.tags,
        "encrypted": bool(document.encrypted), "signed": bool(document.signature),
        "classification": document.classification, "summary": document.summary,
        "storage_provider": document.storage_provider or "local",
        "sensitivity": document.sensitivity or "confidential",
        "uploader_id": document.uploader_id,
        "ocr_status": "text_extracted" if document.extracted_text else "pending_or_unavailable",
        "ocr_text_length": len(document.extracted_text or ""),
        "created_at": document.created_at.isoformat() if document.created_at else None,
        "updated_at": document.updated_at.isoformat() if document.updated_at else None,
        "download_url": f"/api/documents/{document.id}/download",
    }


@app.get("/")
async def root():
    if frontend_dist.exists():
        return FileResponse(frontend_dist / "index.html")
    return FileResponse(templates_dir / "index.html")


if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="frontend-assets")


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "dms-api", "capabilities": capabilities()}


@app.get("/api/capabilities")
def capability_status(user: User = Depends(current_user)):
    return capabilities()


@app.get("/api/system/overview")
def system_overview(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return {
        "database": {
            "engine": engine.url.get_backend_name(),
            "database": engine.url.database or "configured externally",
            "status": "connected",
            "tables": [
                "users", "cases", "documents", "document_versions",
                "document_shares", "case_collaborators", "backup_records",
                "audit_logs", "chain_anchors",
            ],
            "counts": {
                "users": db.query(User).count(),
                "cases": db.query(Case).count(),
                "documents": db.query(Document).count(),
                "audit_events": db.query(AuditLog).count(),
            },
        },
        "deployment": {
            "container_ready": True,
            "compose_file": "docker-compose.yml",
            "api": "FastAPI + Uvicorn",
            "frontend": "React + Vite + Tailwind",
            "storage": "Local encrypted volume (Cloudflare R2-ready)",
            "cloud_storage": "Cloudflare R2 / S3-compatible integration endpoint",
            "backup": "ZIP backup of database and encrypted uploads",
        },
    }


@app.post("/api/auth/register")
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    email = request.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    role = request.role.strip().lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Unsupported role")
    department = request.department.strip().lower() or "general"
    user = User(email=email, hashed_password=get_password_hash(request.password),
                full_name=request.full_name.strip(), role=role, department=department)
    db.add(user)
    db.flush()
    write_audit(db, "user.registered", "user", user.id, user.id, {"email": email})
    db.commit()
    return {"message": "Account created", "user": {"id": user.id, "email": user.email, "full_name": user.full_name}}


@app.post("/api/auth/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email.strip().lower()).first()
    if not user or not verify_password(request.password, user.hashed_password):
        write_audit(db, "user.login_failed", "user", user.id if user else None, None,
                    {"email": request.email.strip().lower(), "reason": "invalid_credentials"})
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.mfa_enabled and not request.mfa_code:
        write_audit(db, "user.login_mfa_required", "user", user.id, user.id)
        db.commit()
        raise HTTPException(status_code=401, detail="MFA code required", headers={"X-MFA-Required": "true"})
    if user.mfa_enabled and not verify_totp(user.mfa_secret or "", request.mfa_code or ""):
        write_audit(db, "user.login_failed", "user", user.id, user.id,
                    {"reason": "invalid_mfa"})
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid MFA code")
    token = create_access_token({"sub": str(user.id), "role": user.role, "email": user.email},
                                timedelta(hours=8))
    write_audit(db, "user.login", "user", user.id, user.id)
    db.commit()
    return {"access_token": token, "token_type": "bearer",
            "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role}}


@app.post("/api/auth/logout")
def logout(db: Session = Depends(get_db), user: User = Depends(current_user)):
    write_audit(db, "user.logout", "user", user.id, user.id)
    db.commit()
    return {"message": "Session logout recorded"}


@app.post("/api/auth/mfa/setup")
def setup_mfa(db: Session = Depends(get_db), user: User = Depends(current_user)):
    user.mfa_secret = new_totp_secret()
    user.mfa_enabled = False
    db.commit()
    return {"secret": user.mfa_secret, "otpauth": f"otpauth://totp/DMS-Pro:{user.email}?secret={user.mfa_secret}&issuer=DMS-Pro"}


@app.post("/api/auth/mfa/verify")
def enable_mfa(code: str = Form(...), db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not user.mfa_secret or not verify_totp(user.mfa_secret, code):
        raise HTTPException(status_code=400, detail="Invalid MFA code")
    user.mfa_enabled = True
    write_audit(db, "user.mfa_enabled", "user", user.id, user.id)
    db.commit()
    return {"enabled": True}


@app.get("/api/auth/me")
def me(user: User = Depends(current_user)):
    return {
        "id": user.id, "email": user.email, "full_name": user.full_name,
        "role": user.role, "department": user.department,
        "mfa_enabled": bool(user.mfa_enabled),
        "mfa_required": user.role in PRIVILEGED_ROLES,
    }


@app.get("/api/secure/overview")
def secure_overview(db: Session = Depends(get_db), user: User = Depends(current_user)):
    assigned_case_ids = [
        item.case_id for item in db.query(CaseCollaborator).filter(
            CaseCollaborator.user_id == user.id
        ).all()
    ]
    document_query = authorized_documents(db, user)
    return {
        "tier": "secure_investigation",
        "role": user.role,
        "role_label": user.role.replace("_", " ").title(),
        "department": user.department,
        "mfa": {
            "enabled": bool(user.mfa_enabled),
            "required": user.role in PRIVILEGED_ROLES,
        },
        "capabilities": SECURE_ROLE_CAPABILITIES.get(user.role, []),
        "assigned_cases": len(assigned_case_ids) if user.role != "admin"
        else db.query(Case).count(),
        "authorized_documents": len(document_query),
        "controls": [
            "Role + case + sensitivity + department authorization",
            "Time-bound document permissions",
            "Encrypted document storage",
            "Hash and signature verification",
            "Immutable audit history",
            "MFA status for privileged actions",
        ],
        "workspace_note": "This secure tier uses illustrative workspace records and is isolated from public assistance.",
    }


@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(current_user)):
    documents = authorized_documents(db, user)
    # Investigation and court-filing cases are still active workspace matters;
    # only explicitly closed cases should be excluded from the dashboard.
    case_query = db.query(Case).filter(Case.status != "closed")
    if user.role != "admin":
        case_query = case_query.filter(Case.id.in_(select(CaseCollaborator.case_id).where(
            CaseCollaborator.user_id == user.id
        )))
    cases = case_query.order_by(desc(Case.updated_at), desc(Case.created_at)).all()
    counts = {}
    for document in documents:
        counts[document.document_type] = counts.get(document.document_type, 0) + 1
    activities = db.query(AuditLog).order_by(desc(AuditLog.id)).limit(8).all()
    users = {u.id: u.full_name for u in db.query(User).all()}
    return {
        "total_documents": len(documents),
        "active_cases": len(cases),
        "pending_actions": db.query(Notification).filter(
            Notification.user_id == user.id, Notification.status == "pending"
        ).count(),
        "security_alerts": [{
            "title": "Integrity verification required",
            "message": "Review the latest audit and integrity status before release.",
            "severity": "medium",
        }] if not db.query(ChainAnchor).first() else [],
        "recent_cases": [{
            "id": item.id, "case_number": item.case_number, "title": item.title,
            "status": item.status, "updated_at": (item.updated_at or item.created_at).isoformat()
            if (item.updated_at or item.created_at) else None,
            "document_count": db.query(Document).filter(
                Document.case_id == item.id, Document.is_active.is_(True)
            ).count(),
        } for item in cases[:5]],
        "integrity": 100 if all(d.sha256 for d in documents) else 0,
        "by_type": counts,
        "activities": [{
            "action": item.action, "entity_type": item.entity_type,
            "details": json.loads(item.details or "{}"), "user": users.get(item.user_id, "System"),
            "created_at": item.created_at.isoformat() if item.created_at else None,
        } for item in activities],
        "user": {"full_name": user.full_name, "role": user.role},
    }


@app.get("/api/documents")
def list_documents(q: str = "", document_type: str = "", db: Session = Depends(get_db),
                   user: User = Depends(current_user)):
    ensure_demo_workspace_records(db, user)
    documents = authorized_documents(db, user)
    if q.strip():
        term = q.strip().lower()
        documents = [item for item in documents if term in " ".join(filter(
            None, [item.title, item.filename, item.tags, item.description, item.extracted_text]
        )).lower()]
    if document_type:
        documents = [item for item in documents if item.document_type == document_type]
    write_audit(db, "document.listed", "document", user.id, None,
                {"query": q.strip(), "document_type": document_type, "result_count": len(documents)})
    db.commit()
    return [serialize_document(item) for item in documents]


@app.post("/api/documents/upload")
async def upload_document(
    document: UploadFile = File(...),
    title: str = Form(""),
    document_type: str = Form("investigation"),
    case_id: int | None = Form(None),
    description: str = Form(""),
    tags: str = Form(""),
    sensitivity: str = Form("confidential"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    allowed = {".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".txt"}
    if document_type not in LEGAL_DOCUMENT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported legal document type")
    sensitivity = sensitivity.strip().lower()
    if sensitivity not in ALLOWED_SENSITIVITY:
        raise HTTPException(status_code=400, detail="Unsupported sensitivity level")
    if case_id is not None:
        case = db.get(Case, case_id)
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        if user.role != "admin" and not db.query(CaseCollaborator).filter(
            CaseCollaborator.case_id == case_id, CaseCollaborator.user_id == user.id
        ).first():
            raise HTTPException(status_code=403, detail="You are not assigned to this case")
    extension = Path(document.filename or "").suffix.lower()
    if extension not in allowed:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    content = await document.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds the 25 MB limit")
    safe_name = f"{secrets.token_hex(12)}{extension}"
    destination = settings.UPLOAD_DIR / safe_name
    extracted_text = ocr_bytes(content, document.filename or "")
    digest = hashlib.sha256(content).hexdigest()
    stored_content = encrypt_bytes(content)
    destination.write_bytes(stored_content)
    signature = sign_digest(digest)
    item = Document(title=title.strip() or Path(document.filename or "document").stem,
                    filename=document.filename or safe_name, file_path=str(destination),
                    document_type=document_type, uploader_id=user.id, case_id=case_id,
                    description=description.strip(), tags=tags.strip(), sha256=digest,
                    classification=document_type, storage_provider="local",
                    sensitivity=sensitivity)
    item.extracted_text = extracted_text
    item.signature = signature
    item.encrypted = True
    db.add(item)
    db.flush()
    db.add(DocumentVersion(
        document_id=item.id, version=1, file_path=str(destination),
        sha256=digest, created_by=user.id, notes="Initial upload",
    ))
    if case_id is not None:
        event_type = {
            "fir": "fir_registered",
            "evidence": "evidence_collected",
            "charge_sheet": "charge_sheet_prepared",
            "court_filing": "court_filing",
            "judgment": "judgment",
        }.get(document_type, "document_added")
        db.add(CaseEvent(
            case_id=case_id, event_type=event_type, actor_id=user.id,
            notes=f"{document_type.replace('_', ' ').title()} uploaded: {item.title}",
        ))
    write_audit(db, "document.uploaded", "document", user.id, item.id,
                {"filename": item.filename, "sha256": digest})
    db.commit()
    db.refresh(item)
    return serialize_document(item)


@app.get("/api/documents/{document_id}/download")
def download_document(document_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    item = db.get(Document, document_id)
    if not item or not item.is_active or not can_access_document(db, item, user) or not Path(item.file_path).is_file():
        raise HTTPException(status_code=404, detail="Document not found")
    content = decrypt_bytes(Path(item.file_path).read_bytes())
    calculated_hash = hashlib.sha256(content).hexdigest()
    if calculated_hash != item.sha256:
        write_audit(db, "document.verification_failed", "document", user.id, item.id,
                    {"expected_sha256": item.sha256, "actual_sha256": calculated_hash})
        db.commit()
        raise HTTPException(status_code=409, detail="Integrity check failed")
    if not item.signature or not verify_signature(item.sha256, item.signature):
        write_audit(db, "document.verification_failed", "document", user.id, item.id,
                    {"reason": "invalid_signature"})
        db.commit()
        raise HTTPException(status_code=409, detail="Digital signature verification failed")
    write_audit(db, "document.verified", "document", user.id, item.id,
                {"sha256": item.sha256, "signature_valid": True})
    write_audit(db, "document.downloaded", "document", user.id, item.id)
    db.commit()
    return Response(content=content, headers={
        "Content-Disposition": f'attachment; filename="{item.filename}"',
    }, media_type=mimetypes.guess_type(item.filename)[0] or "application/octet-stream")


@app.get("/api/documents/{document_id}/verify")
def verify_document(document_id: int, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    item = db.get(Document, document_id)
    if not item or not item.is_active or not can_access_document(db, item, user):
        raise HTTPException(status_code=404, detail="Document not found")
    if not Path(item.file_path).is_file():
        raise HTTPException(status_code=404, detail="Document content not found")
    content = decrypt_bytes(Path(item.file_path).read_bytes())
    calculated_hash = hashlib.sha256(content).hexdigest()
    hash_valid = calculated_hash == item.sha256
    signature_valid = bool(item.signature) and verify_signature(
        item.sha256, item.signature
    )
    blockchain = db.query(BlockchainRecord).filter(
        BlockchainRecord.document_id == item.id
    ).order_by(desc(BlockchainRecord.id)).first()
    if hash_valid and signature_valid and not blockchain:
        blockchain = BlockchainRecord(
            document_id=item.id,
            document_hash=item.sha256,
            version=item.version,
            transaction_id=f"fabric-doc-{item.id}-{secrets.token_hex(10)}",
            status="anchored",
        )
        db.add(blockchain)
        write_audit(db, "document.block_anchored", "document", user.id, item.id, {
            "document_hash": item.sha256,
            "transaction_id": blockchain.transaction_id,
        })
    write_audit(db, "document.verification_viewed", "document", user.id, item.id, {
        "sha256_valid": hash_valid,
        "signature_valid": signature_valid,
        "blockchain_anchored": bool(blockchain),
    })
    db.commit()
    return {
        "document_id": item.id,
        "sha256": {
            "expected": item.sha256,
            "calculated": calculated_hash,
            "valid": hash_valid,
        },
        "signature": {
            "present": bool(item.signature),
            "valid": signature_valid,
            "algorithm": "Ed25519",
        },
        "blockchain": {
            "anchored": bool(blockchain),
            "status": blockchain.status if blockchain else "prototype-ready",
            "transaction_id": blockchain.transaction_id if blockchain else None,
            "document_hash": blockchain.document_hash if blockchain else None,
        },
    }


@app.post("/api/documents/{document_id}/anchor")
def anchor_document(document_id: int, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    item = db.get(Document, document_id)
    if not item or not item.is_active or not can_access_document(db, item, user):
        raise HTTPException(status_code=404, detail="Document not found")
    if not Path(item.file_path).is_file():
        raise HTTPException(status_code=404, detail="Document content not found")
    content = decrypt_bytes(Path(item.file_path).read_bytes())
    calculated_hash = hashlib.sha256(content).hexdigest()
    if calculated_hash != item.sha256:
        raise HTTPException(status_code=409, detail="Integrity check failed")
    if not item.signature or not verify_signature(item.sha256, item.signature):
        raise HTTPException(status_code=409, detail="Digital signature verification failed")
    blockchain = db.query(BlockchainRecord).filter(
        BlockchainRecord.document_id == item.id
    ).order_by(desc(BlockchainRecord.id)).first()
    if not blockchain:
        blockchain = BlockchainRecord(
            document_id=item.id,
            document_hash=item.sha256,
            version=item.version,
            transaction_id=f"fabric-doc-{item.id}-{secrets.token_hex(10)}",
            status="anchored",
        )
        db.add(blockchain)
        write_audit(db, "document.block_anchored", "document", user.id, item.id, {
            "document_hash": item.sha256,
            "transaction_id": blockchain.transaction_id,
        })
        db.commit()
    return {
        "document_id": item.id,
        "anchored": True,
        "status": blockchain.status,
        "transaction_id": blockchain.transaction_id,
        "document_hash": blockchain.document_hash,
    }


@app.delete("/api/documents/{document_id}")
def archive_document(document_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {"admin", "investigator"}:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    item = db.get(Document, document_id)
    if not item:
        raise HTTPException(status_code=404, detail="Document not found")
    item.is_active = False
    write_audit(db, "document.archived", "document", user.id, item.id)
    db.commit()
    return {"message": "Document archived"}


@app.get("/api/cases")
def list_cases(db: Session = Depends(get_db), user: User = Depends(current_user)):
    cases = db.query(Case).order_by(desc(Case.created_at)).all()
    if user.role != "admin":
        authorized_case_ids = {
            item.case_id for item in db.query(CaseCollaborator).filter(
                CaseCollaborator.user_id == user.id
            ).all()
        }
        cases = [case for case in cases if case.id in authorized_case_ids]
    return [{"id": c.id, "case_number": c.case_number, "title": c.title, "status": c.status,
             "documents": db.query(Document).filter(Document.case_id == c.id, Document.is_active.is_(True)).count()}
            for c in cases]


@app.post("/api/cases")
def create_case(request: CaseRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if db.query(Case).filter(Case.case_number == request.case_number.strip()).first():
        raise HTTPException(status_code=409, detail="Case number already exists")
    case = Case(case_number=request.case_number.strip(), title=request.title.strip(),
                status=request.status, fir_number=request.fir_number.strip() or None,
                police_station=request.police_station.strip() or None,
                investigating_officer_id=request.investigating_officer_id,
                sensitivity=request.sensitivity.strip().lower() or "confidential")
    db.add(case)
    db.flush()
    db.add(CaseCollaborator(case_id=case.id, user_id=user.id,
                            department=user.role, access_level="owner"))
    db.add(CaseEvent(case_id=case.id, event_type="case_created", actor_id=user.id,
                     notes="Case workspace created"))
    write_audit(db, "case.created", "case", user.id, case.id, {"case_number": case.case_number})
    db.commit()
    return {"id": case.id, "case_number": case.case_number, "title": case.title, "status": case.status}


@app.get("/api/cases/workspace")
def case_workspaces(db: Session = Depends(get_db), user: User = Depends(current_user)):
    cases = db.query(Case).order_by(desc(Case.updated_at), desc(Case.created_at)).all()
    if user.role != "admin":
        case_ids = {item.case_id for item in db.query(CaseCollaborator).filter(
            CaseCollaborator.user_id == user.id).all()}
        cases = [item for item in cases if item.id in case_ids]
    return [{
        "id": item.id, "case_number": item.case_number, "fir_number": item.fir_number,
        "title": item.title, "status": item.status, "police_station": item.police_station,
        "sensitivity": item.sensitivity,
        "documents": db.query(Document).filter(Document.case_id == item.id, Document.is_active.is_(True)).count(),
    } for item in cases]


@app.post("/api/cases/demo-seed")
def seed_demo_cases(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Create illustrative case-workspace records for the active workspace."""
    existing = db.query(CaseCollaborator).join(
        Case, Case.id == CaseCollaborator.case_id
    ).filter(CaseCollaborator.user_id == user.id).count()
    if existing:
        return {
            "created": 0,
            "case_numbers": [],
            "fictional_records": True,
            "message": "Workspace case records already exist",
        }

    demo_cases = [
        {
            "case_number": "CASE-2026-0142",
            "title": "Cyber Harassment Inquiry",
            "status": "investigation",
            "fir_number": "FIR-2026-0142",
            "police_station": "Central Cyber Crime Unit",
            "sensitivity": "highly_sensitive",
            "events": [
                ("fir_registered", "Complaint registered and initial digital evidence preserved."),
                ("investigation_started", "Investigation assigned to the cyber crime response team."),
                ("evidence_collected", "Device image and platform records logged under chain of custody."),
            ],
        },
        {
            "case_number": "CASE-2026-0138",
            "title": "Digital Evidence Chain Review",
            "status": "court_filing",
            "fir_number": "FIR-2026-0138",
            "police_station": "North District Investigation Bureau",
            "sensitivity": "confidential",
            "events": [
                ("fir_registered", "Investigation record opened after a financial fraud complaint."),
                ("evidence_collected", "Forensic team completed hash verification of seized media."),
                ("charge_sheet_prepared", "Charge-sheet review package prepared for prosecution."),
                ("court_filing", "Filing bundle marked ready for authorized court submission."),
            ],
        },
        {
            "case_number": "CASE-2026-0119",
            "title": "Digital Fraud Complaint",
            "status": "active",
            "fir_number": "FIR-2026-0119",
            "police_station": "East District Economic Offences Wing",
            "sensitivity": "restricted",
            "events": [
                ("fir_registered", "Complaint accepted and case identity verified."),
                ("investigation_started", "Transaction trail review and witness scheduling initiated."),
            ],
        },
    ]
    created = []
    for item in demo_cases:
        case = db.query(Case).filter(
            Case.case_number == item["case_number"]
        ).first()
        if case:
            continue
        case = Case(
            case_number=item["case_number"],
            title=item["title"],
            status=item["status"],
            fir_number=item["fir_number"],
            police_station=item["police_station"],
            investigating_officer_id=user.id,
            sensitivity=item["sensitivity"],
        )
        db.add(case)
        db.flush()
        db.add(CaseCollaborator(
            case_id=case.id,
            user_id=user.id,
            department=user.department or "investigations",
            access_level="owner",
        ))
        for event_type, notes in item["events"]:
            db.add(CaseEvent(
                case_id=case.id,
                event_type=event_type,
                actor_id=user.id,
                notes=notes,
            ))
        created.append(case.case_number)
    if not created:
        return {
            "created": 0,
            "case_numbers": [],
            "fictional_records": True,
            "message": "Workspace case records already exist",
        }
    write_audit(db, "case.records_seeded", "case", user.id, None, {
        "case_numbers": created,
        "fictional_records": True,
    })
    db.commit()
    return {
        "created": len(created),
        "case_numbers": created,
        "fictional_records": True,
    }


@app.get("/api/cases/{case_id}")
def case_detail(case_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if user.role != "admin" and not db.query(CaseCollaborator).filter(
        CaseCollaborator.case_id == case_id, CaseCollaborator.user_id == user.id).first():
        raise HTTPException(status_code=403, detail="Case access is not authorized")
    write_audit(db, "case.viewed", "case", user.id, case_id)
    db.commit()
    officer = db.get(User, case.investigating_officer_id) if case.investigating_officer_id else None
    return {
        "id": case.id, "case_number": case.case_number, "fir_number": case.fir_number,
        "title": case.title, "status": case.status, "police_station": case.police_station,
        "created_at": case.created_at.isoformat() if case.created_at else None,
        "updated_at": case.updated_at.isoformat() if case.updated_at else None,
        "investigating_officer": {
            "id": officer.id, "name": officer.full_name, "role": officer.role,
        } if officer else None,
        "sensitivity": case.sensitivity,
        "documents": [serialize_document(item) for item in db.query(Document).filter(
            Document.case_id == case_id, Document.is_active.is_(True)).all()],
        "timeline": [{
            "id": item.id, "event_type": item.event_type, "notes": item.notes,
            "event_at": item.event_at.isoformat() if item.event_at else None,
        } for item in db.query(CaseEvent).filter(CaseEvent.case_id == case_id).order_by(CaseEvent.event_at).all()],
        "team": [{
            "user_id": item.user_id,
            "name": db.get(User, item.user_id).full_name if db.get(User, item.user_id) else "Unknown user",
            "role": db.get(User, item.user_id).role if db.get(User, item.user_id) else "unknown",
            "department": item.department, "access_level": item.access_level,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        } for item in db.query(CaseCollaborator).filter(CaseCollaborator.case_id == case_id).all()],
    }


@app.post("/api/cases/{case_id}/events")
def add_case_event(case_id: int, request: CaseEventRequest, db: Session = Depends(get_db),
                   user: User = Depends(current_user)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if user.role != "admin" and not db.query(CaseCollaborator).filter(
        CaseCollaborator.case_id == case_id, CaseCollaborator.user_id == user.id).first():
        raise HTTPException(status_code=403, detail="Case access is not authorized")
    event = CaseEvent(case_id=case_id, event_type=request.event_type.strip(),
                      actor_id=user.id, notes=request.notes.strip())
    db.add(event)
    write_audit(db, "case.timeline_event_added", "case", user.id, case_id,
                {"event_type": event.event_type})
    db.commit()
    db.refresh(event)
    return {"id": event.id, "event_type": event.event_type, "notes": event.notes,
            "event_at": event.event_at.isoformat() if event.event_at else None}


@app.post("/api/cases/{case_id}/publish-public-status")
def publish_public_case_status(
    case_id: int,
    expires_at: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_privileged_mfa),
):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if user.role != "admin" and not db.query(CaseCollaborator).filter(
        CaseCollaborator.case_id == case_id, CaseCollaborator.user_id == user.id
    ).first():
        raise HTTPException(status_code=403, detail="Case access is not authorized")
    try:
        expiry = datetime.fromisoformat(expires_at) if expires_at else None
    except ValueError as error:
        raise HTTPException(status_code=400, detail="expires_at must be ISO-8601") from error
    timeline = [{
        "event_type": event.event_type,
        "notes": event.notes,
        "event_at": event.event_at.isoformat() if event.event_at else None,
    } for event in db.query(CaseEvent).filter(
        CaseEvent.case_id == case_id
    ).order_by(CaseEvent.event_at).all()]
    write_audit(db, "public.case_status_publication_requested", "case", user.id, case_id, {
        "case_number": case.case_number,
        "expires_at": expiry.isoformat() if expiry else None,
    })
    db.commit()
    public_db = PublicSessionLocal()
    try:
        snapshot = publish_case_snapshot(
            public_db, case.case_number, case.title, case.status, timeline, expiry
        )
    finally:
        public_db.close()
    write_audit(db, "public.case_status_published", "case", user.id, case_id, {
        "case_number": case.case_number,
        "expires_at": expiry.isoformat() if expiry else None,
        "public_snapshot_id": snapshot.id,
    })
    db.commit()
    return {
        "published": True,
        "case_number": snapshot.case_number,
        "verification_code": public_verification_code(case.case_number),
        "expires_at": snapshot.expires_at.isoformat() if snapshot.expires_at else None,
    }


@app.get("/api/audit")
def audit_trail(db: Session = Depends(get_db), user: User = Depends(current_user)):
    entries = db.query(AuditLog).order_by(desc(AuditLog.id)).limit(100).all()
    response = [{"id": item.id, "action": item.action, "entity_type": item.entity_type,
             "entity_id": item.entity_id, "details": json.loads(item.details or "{}"),
             "entry_hash": item.entry_hash, "previous_hash": item.previous_hash,
             "created_at": item.created_at.isoformat() if item.created_at else None} for item in entries]
    write_audit(db, "audit.logs_viewed", "audit_log", user.id, None,
                {"result_count": len(response)})
    db.commit()
    return response


@app.get("/api/search/semantic")
def semantic_document_search(
    q: str = "",
    document_type: str = "",
    case_id: int | None = None,
    fir_number: str = "",
    date_from: str = "",
    date_to: str = "",
    department: str = "",
    uploader_id: int | None = None,
    sensitivity: str = "",
    min_similarity: float = 0.0,
    limit: int = 20,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    ensure_demo_workspace_records(db, user)
    query = q.strip()
    documents_query = authorized_documents(db, user)
    if document_type:
        documents_query = [item for item in documents_query if item.document_type == document_type]
    if case_id is not None:
        documents_query = [item for item in documents_query if item.case_id == case_id]
    if fir_number.strip():
        matching_cases = {
            case.id for case in db.query(Case).filter(
                Case.fir_number.ilike(f"%{fir_number.strip()}%")
            ).all()
        }
        documents_query = [item for item in documents_query if item.case_id in matching_cases]
    if sensitivity:
        documents_query = [
            item for item in documents_query
            if (item.sensitivity or "confidential").lower() == sensitivity.strip().lower()
        ]
    if uploader_id is not None:
        documents_query = [item for item in documents_query if item.uploader_id == uploader_id]
    if department.strip():
        department_users = {
            item.id for item in db.query(User).filter(
                User.department.ilike(f"%{department.strip()}%")
            ).all()
        }
        documents_query = [item for item in documents_query if item.uploader_id in department_users]
    try:
        from_date = datetime.fromisoformat(date_from).date() if date_from else None
        to_date = datetime.fromisoformat(date_to).date() if date_to else None
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Dates must use YYYY-MM-DD format") from error
    if from_date:
        documents_query = [item for item in documents_query if item.created_at and item.created_at.date() >= from_date]
    if to_date:
        documents_query = [item for item in documents_query if item.created_at and item.created_at.date() <= to_date]
    documents = documents_query
    case_numbers = {
        case.id: case.fir_number for case in db.query(Case).filter(
            Case.id.in_([item.case_id for item in documents if item.case_id is not None])
        ).all()
    } if documents else {}
    uploader_departments = {
        account.id: account.department for account in db.query(User).filter(
            User.id.in_([item.uploader_id for item in documents])
        ).all()
    } if documents else {}
    ranked = semantic_search(query or "legal investigation document", [{
        "id": item.id,
        "title": item.title,
        "document_type": item.document_type,
        "filename": item.filename,
        "case_id": item.case_id,
        "sensitivity": item.sensitivity or "confidential",
        "uploader_id": item.uploader_id,
        "text": " ".join(filter(None, [
            item.title, item.filename, item.document_type, item.description,
            item.tags, item.extracted_text,
        ])),
    } for item in documents])
    terms = [
        term for term in re.findall(r"[a-z0-9]+", query.lower())
        if len(term) > 2 and term not in SEARCH_STOPWORDS
    ]
    results = []
    for item in ranked[:max(1, min(limit, 50))]:
        text_value = item.get("text", "")
        lower_text = text_value.lower()
        text_terms = set(re.findall(r"[a-z0-9]+", lower_text))
        matched_terms = [term for term in terms if term in text_terms]
        if query and terms and not matched_terms:
            continue
        score = max(0.0, min(1.0, (float(item.get("score", 0)) + 1) / 2))
        if score < max(0.0, min(1.0, min_similarity)):
            continue
        results.append({
            "id": item["id"],
            "title": item["title"],
            "document_type": item["document_type"],
            "filename": item["filename"],
            "case_id": item.get("case_id"),
            "fir_number": case_numbers.get(item.get("case_id")),
            "sensitivity": item.get("sensitivity"),
            "uploader_id": item.get("uploader_id"),
            "department": uploader_departments.get(item.get("uploader_id")),
            "score": score,
            "matched_terms": matched_terms,
            "snippet": text_value[:220] + ("…" if len(text_value) > 220 else ""),
        })
    write_audit(db, "document.semantic_search", "document", user.id, None,
                {"query": query, "document_type": document_type, "case_id": case_id,
                 "fir_number": fir_number, "date_from": date_from, "date_to": date_to,
                 "department": department, "uploader_id": uploader_id,
                 "sensitivity": sensitivity, "min_similarity": min_similarity,
                 "result_count": len(results)})
    db.commit()
    return {"query": query, "total": len(results), "results": results}


@app.post("/api/ai/rag-qa")
def rag_legal_qa(request: AiQuestionRequest, db: Session = Depends(get_db),
                 user: User = Depends(current_user)):
    ensure_demo_workspace_records(db, user)
    documents = authorized_documents(db, user, request.document_ids)
    contexts = document_context(documents)
    ranked = semantic_search(request.question, contexts)[:5]
    sources = [{
        "document_id": item["id"], "title": item["title"],
        "document_type": item["document_type"],
        "excerpt": item["text"][:500],
        "relevance": round(max(0.0, min(1.0, (float(item.get("score", 0)) + 1) / 2)), 3),
    } for item in ranked]
    if not sources:
        question_text = request.question.lower()
        guidance = next(
            (
                item["answer"]
                for item in GENERAL_ASSISTANT_GUIDANCE
                if any(keyword in question_text for keyword in item["keywords"])
            ),
            (
                "I can provide general legal information, but I cannot safely give a "
                "case-specific conclusion without an authorised source record. Check the "
                "relevant deadline, preserve original evidence, keep a dated record of "
                "communications, and consult a qualified legal professional or the "
                "appropriate official authority before acting."
            ),
        )
        answer = guidance
        if request.plain_language and request.language.lower() in {"english", "en"}:
            answer = guidance
        write_audit(db, "ai.rag_qa.general_response", "ai_query", user.id, None,
                    {"question": request.question, "source_ids": []})
        db.commit()
        return {
            "answer": answer, "sources": [], "verified": False,
            "unsupported_claims": ["No authorized source document matched this question."],
            "provider": "general-guidance-fallback", "general_guidance": True,
            "disclaimer": "This is general information, not legal advice.",
            "public_sources": PUBLIC_LEGAL_SOURCES,
        }
    combined = "\n\n".join(f"[Source {index + 1}: {item['title']}]\n{item['text'][:2400]}"
                           for index, item in enumerate(ranked))
    answer = None
    provider = "grounded-extractive"
    if settings.GEMINI_API_KEY:
        prompt = (
            "Answer the user's legal/investigation question only from the provided sources. "
            "Cite sources as [Source N]. If the sources do not establish a fact, say "
            "'Not established by the retrieved documents'. Do not provide legal advice. "
            f"Respond in {request.language}. {'Use plain language.' if request.plain_language else ''}\n"
            f"Question: {request.question}\nSources:\n{combined}"
        )
        try:
            answer = gemini_generate(prompt)
            provider = "gemini-grounded"
        except RuntimeError:
            answer = None
    if not answer:
        terms = [term.lower() for term in request.question.split() if len(term) > 2]
        matched = []
        for item in ranked:
            sentences = re.split(r"(?<=[.!?])\s+", item["text"])
            matched.extend(sentence for sentence in sentences
                           if any(term in sentence.lower() for term in terms))
        answer = " ".join(matched[:4]) or "The retrieved documents do not contain a direct answer."
        if request.language.lower() not in {"english", "en"}:
            answer = f"Source-backed answer available in English. Requested language: {request.language}."
    unsupported = []
    if "do not contain" in answer.lower() or "not established" in answer.lower():
        unsupported.append("The retrieved sources do not establish a complete answer.")
    db.add(AIQuery(user_id=user.id, question=request.question,
                   retrieved_sources=json.dumps([item["id"] for item in ranked]),
                   response=answer))
    write_audit(db, "ai.rag_qa", "ai_query", user.id, None,
                {"question": request.question, "source_ids": [item["id"] for item in ranked]})
    db.commit()
    return {"question": request.question, "answer": answer, "sources": sources,
            "verified": bool(sources and not unsupported), "unsupported_claims": unsupported,
            "provider": provider, "language": request.language}


@app.post("/api/ai/assistant")
def ai_assistant(request: AiQuestionRequest, db: Session = Depends(get_db),
                 user: User = Depends(current_user)):
    """Answer broad assistant questions while preferring authorized case retrieval."""
    return rag_legal_qa(request, db, user)


@app.post("/api/ai/summarize")
def ai_summarize(request: AiQuestionRequest, db: Session = Depends(get_db),
                 user: User = Depends(current_user)):
    documents = authorized_documents(db, user, request.document_ids)
    results = []
    for document in documents[:10]:
        summary = _summarize_document(document)
        results.append({"document_id": document.id, "title": document.title,
                        "summary": summary, "source": document.filename})
    write_audit(db, "ai.document_summarized", "ai_query", user.id, None,
                {"document_ids": [item["document_id"] for item in results]})
    db.commit()
    return {"results": results, "provider": "local-extractive"}


@app.post("/api/ai/entities")
def ai_entities(request: AiQuestionRequest, db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    documents = authorized_documents(db, user, request.document_ids)
    results = []
    for document in documents[:10]:
        text_value = " ".join(filter(None, [
            document.title, document.description, document.extracted_text,
        ]))
        results.append({"document_id": document.id, "title": document.title,
                        "entities": extract_entities(text_value)})
    write_audit(db, "ai.entities_extracted", "ai_query", user.id, None,
                {"document_ids": [item["document_id"] for item in results]})
    db.commit()
    return {"results": results, "provider": "local-ner-patterns"}


@app.post("/api/ai/timeline")
def ai_timeline(request: AiQuestionRequest, db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    documents = authorized_documents(db, user, request.document_ids)
    events = []
    for document in documents[:20]:
        text_value = " ".join(filter(None, [
            document.title, document.description, document.extracted_text,
        ]))
        events.extend({**event, "document_id": document.id, "title": document.title}
                      for event in extract_timeline(text_value))
    write_audit(db, "ai.timeline_generated", "ai_query", user.id, None,
                {"document_ids": sorted({event["document_id"] for event in events})})
    db.commit()
    return {"events": events, "provider": "local-date-event-extraction"}


@app.post("/api/ai/draft")
def ai_draft(request: AiDraftRequest, db: Session = Depends(get_db),
             user: User = Depends(current_user)):
    documents = authorized_documents(db, user, request.document_ids)
    ranked = semantic_search(request.request, document_context(documents))[:4]
    if not ranked:
        write_audit(db, "ai.document_draft_requested", "ai_query", user.id, None,
                    {"request": request.request[:500], "source_ids": [], "grounded": False})
        db.commit()
        return {"draft": "", "sources": [], "editable": True,
                "unsupported_claims": ["No authorized sources selected."]}
    source_lines = "\n".join(f"- {item['title']}: {item['text'][:500]}" for item in ranked)
    draft = (
        f"EDITABLE DRAFT ({request.language})\n\n"
        f"Purpose: {request.request}\n\n"
        "Grounded facts from authorized sources:\n" + source_lines +
        "\n\nReview required: confirm names, dates, sections and jurisdiction before filing."
    )
    write_audit(db, "ai.document_drafted", "ai_query", user.id, None,
                {"request": request.request[:500],
                 "source_ids": [item["id"] for item in ranked], "grounded": True})
    db.commit()
    return {"draft": draft, "editable": True,
            "sources": [{"document_id": item["id"], "title": item["title"]} for item in ranked],
            "unsupported_claims": ["Draft requires human legal review before use."]}


@app.post("/api/ai/similar")
def ai_similar(request: AiQuestionRequest, db: Session = Depends(get_db),
               user: User = Depends(current_user)):
    documents = authorized_documents(db, user, request.document_ids)
    ranked = semantic_search(request.question, document_context(documents))[:10]
    results = [{
        "document_id": item["id"], "title": item["title"],
        "document_type": item["document_type"],
        "similarity": round(max(0.0, min(1.0, (float(item.get("score", 0)) + 1) / 2)), 3),
    } for item in ranked]
    write_audit(db, "ai.similar_documents_searched", "ai_query", user.id, None,
                {"question": request.question, "result_count": len(results)})
    db.commit()
    return {"results": results, "provider": "semantic-retrieval"}


@app.post("/api/ai/verify")
def verify_ai_claims(request: AiQuestionRequest, db: Session = Depends(get_db),
                     user: User = Depends(current_user)):
    documents = authorized_documents(db, user, request.document_ids)
    source_text = " ".join(item["text"].lower() for item in document_context(documents))
    claims = [part.strip() for part in request.question.split(".") if part.strip()]
    unsupported = [claim for claim in claims if not any(
        term in source_text for term in claim.lower().split() if len(term) > 3
    )]
    write_audit(db, "ai.claims_verified", "ai_query", user.id, None,
                {"question": request.question, "checked_sources": len(documents),
                 "unsupported_claims": unsupported})
    db.commit()
    return {"verified": not unsupported, "unsupported_claims": unsupported,
            "checked_sources": len(documents), "method": "source-term-verification"}


def _classify_document(document: Document) -> str:
    text_value = " ".join(filter(None, [
        document.title, document.filename, document.description,
        document.tags, document.extracted_text,
    ])).lower()
    keyword_groups = {
        "fir": ("fir", "first information", "police report"),
        "charge_sheet": ("charge sheet", "chargesheet", "final report"),
        "witness": ("witness", "statement", "testimony"),
        "forensic": ("forensic", "dna", "autopsy", "laboratory"),
        "court_filing": ("court filing", "petition", "motion", "application"),
        "judgment": ("judgment", "judgement", "order", "verdict"),
        "evidence": ("evidence", "exhibit", "seized"),
    }
    for label, keywords in keyword_groups.items():
        if any(keyword in text_value for keyword in keywords):
            return label
    return document.document_type or "investigation"


def _summarize_document(document: Document) -> str:
    text_value = " ".join(filter(None, [
        document.title, document.description, document.extracted_text,
    ])).strip()
    if not text_value:
        return "No extracted text is available. Add a text-based or OCR-readable document for an AI summary."
    sentences = [part.strip() for part in text_value.replace("\n", " ").split(".") if part.strip()]
    summary = ". ".join(sentences[:3])
    return (summary[:480] + "…") if len(summary) > 480 else summary


@app.post("/api/documents/{document_id}/classify")
def classify_document(document_id: int, db: Session = Depends(get_db),
                      user: User = Depends(current_user)):
    document = db.get(Document, document_id)
    if not document or not document.is_active or not can_access_document(db, document, user):
        raise HTTPException(status_code=404, detail="Document not found")
    document.classification = _classify_document(document)
    write_audit(db, "document.classified", "document", user.id, document.id,
                {"classification": document.classification})
    db.commit()
    return {"document_id": document.id, "classification": document.classification, "provider": "local-rules"}


@app.post("/api/documents/{document_id}/summarize")
def summarize_document(document_id: int, db: Session = Depends(get_db),
                       user: User = Depends(current_user)):
    document = db.get(Document, document_id)
    if not document or not document.is_active or not can_access_document(db, document, user):
        raise HTTPException(status_code=404, detail="Document not found")
    text_value = " ".join(filter(None, [
        document.title, document.description, document.extracted_text,
    ])).strip()
    analysis = local_document_analysis(text_value)
    provider = "local-analytical"
    document.summary = analysis["summary"]
    write_audit(db, "document.summarized", "document", user.id, document.id,
                {"provider": provider})
    db.commit()
    return {"document_id": document.id, "provider": provider, **analysis}


@app.post("/api/documents/{document_id}/summarize/gemini")
def summarize_document_with_gemini(document_id: int, db: Session = Depends(get_db),
                                   user: User = Depends(current_user)):
    document = db.get(Document, document_id)
    if not document or not document.is_active or not can_access_document(db, document, user):
        raise HTTPException(status_code=404, detail="Document not found")
    text_value = " ".join(filter(None, [
        document.title, document.description, document.extracted_text,
    ])).strip()
    try:
        document.summary = gemini_summary(text_value)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    provider = "gemini" if settings.GEMINI_API_KEY else "local-extractive"
    write_audit(db, "document.summarized", "document", user.id, document.id,
                {"provider": provider})
    db.commit()
    return {
        "document_id": document.id,
        "summary": document.summary,
        "provider": provider,
        "source_text_available": bool(text_value),
        "source_text_length": len(text_value),
    }


@app.get("/api/documents/{document_id}/versions")
def document_versions(document_id: int, db: Session = Depends(get_db),
                      user: User = Depends(current_user)):
    item = db.get(Document, document_id)
    if not item or not can_access_document(db, item, user):
        raise HTTPException(status_code=404, detail="Document not found")
    versions = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id
    ).order_by(desc(DocumentVersion.version)).all()
    write_audit(db, "document.versions_viewed", "document", user.id, document_id,
                {"version_count": len(versions)})
    db.commit()
    return [{
        "id": version.id, "document_id": version.document_id,
        "version": version.version, "sha256": version.sha256,
        "notes": version.notes, "created_by": version.created_by,
        "created_at": version.created_at.isoformat() if version.created_at else None,
        "is_current": version.version == (item.version or 1),
        "downloadable": Path(version.file_path).is_file(),
    } for version in versions]


@app.get("/api/documents/{document_id}/versions/{version_number}/download")
def download_document_version(document_id: int, version_number: int,
                              db: Session = Depends(get_db),
                              user: User = Depends(current_user)):
    item = db.get(Document, document_id)
    version = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id,
        DocumentVersion.version == version_number,
    ).first()
    if not item or not item.is_active or not version or not can_access_document(db, item, user):
        raise HTTPException(status_code=404, detail="Document version not found")
    path = Path(version.file_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Document version file is unavailable")
    content = decrypt_bytes(path.read_bytes())
    if hashlib.sha256(content).hexdigest() != version.sha256:
        raise HTTPException(status_code=409, detail="Version integrity check failed")
    write_audit(db, "document.version_downloaded", "document", user.id, item.id,
                {"version": version_number, "sha256": version.sha256})
    db.commit()
    filename = item.filename if version.version == item.version else f"{Path(item.filename).stem}.v{version.version}{Path(item.filename).suffix}"
    return Response(content=content, headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
    }, media_type=mimetypes.guess_type(filename)[0] or "application/octet-stream")


@app.post("/api/documents/{document_id}/versions")
async def create_document_version(
    document_id: int,
    document: UploadFile = File(...),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    item = db.get(Document, document_id)
    if not item or not item.is_active or not can_access_document(db, item, user):
        raise HTTPException(status_code=404, detail="Document not found")
    content = await document.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds the 25 MB limit")
    digest = hashlib.sha256(content).hexdigest()
    version_number = (item.version or 1) + 1
    destination = settings.UPLOAD_DIR / f"{secrets.token_hex(12)}.version"
    destination.write_bytes(encrypt_bytes(content))
    version = DocumentVersion(
        document_id=item.id, version=version_number, file_path=str(destination),
        sha256=digest, created_by=user.id, notes=notes.strip(),
    )
    item.version = version_number
    item.file_path = str(destination)
    item.sha256 = digest
    item.filename = document.filename or item.filename
    item.extracted_text = ocr_bytes(content, item.filename)
    item.signature = sign_digest(digest)
    item.encrypted = True
    db.add(version)
    write_audit(db, "document.version_created", "document", user.id, item.id,
                {"version": version_number, "sha256": digest})
    db.commit()
    return {"document_id": item.id, "version": version_number, "sha256": digest}


@app.post("/api/documents/{document_id}/share")
def share_document(document_id: int, request: ShareRequest,
                   db: Session = Depends(get_db), user: User = Depends(current_user)):
    if request.permission not in {"view", "download"}:
        raise HTTPException(status_code=400, detail="Permission must be view or download")
    item = db.get(Document, document_id)
    if not item or not can_access_document(db, item, user):
        raise HTTPException(status_code=404, detail="Document not found")
    share = DocumentShare(
        document_id=document_id, shared_with=request.shared_with.strip(),
        permission=request.permission, share_token=secrets.token_urlsafe(24),
        created_by=user.id,
    )
    db.add(share)
    write_audit(db, "document.shared", "document", user.id, document_id,
                {"shared_with": share.shared_with, "permission": share.permission})
    db.commit()
    return {"share_id": share.id, "share_token": share.share_token,
            "url": f"/api/shared/{share.share_token}", "permission": share.permission}


@app.get("/api/shared/{share_token}")
def download_shared_document(share_token: str, db: Session = Depends(get_db)):
    share = db.query(DocumentShare).filter(DocumentShare.share_token == share_token).first()
    item = db.get(Document, share.document_id) if share else None
    if not share or not item or not item.is_active or not Path(item.file_path).is_file():
        raise HTTPException(status_code=404, detail="Share link not found")
    if share.permission != "download":
        raise HTTPException(status_code=403, detail="This share only permits document preview")
    content = decrypt_bytes(Path(item.file_path).read_bytes())
    if hashlib.sha256(content).hexdigest() != item.sha256:
        raise HTTPException(status_code=409, detail="Integrity check failed")
    if not item.signature or not verify_signature(item.sha256, item.signature):
        raise HTTPException(status_code=409, detail="Digital signature verification failed")
    write_audit(db, "document.shared_downloaded", "document", None, item.id,
                {"share_id": share.id, "shared_with": share.shared_with})
    db.commit()
    return Response(content=content, headers={
        "Content-Disposition": f'attachment; filename="{item.filename}"',
    }, media_type=mimetypes.guess_type(item.filename)[0] or "application/octet-stream")


@app.post("/api/cases/{case_id}/collaborators")
def add_collaborator(case_id: int, request: CollaboratorRequest,
                     db: Session = Depends(get_db),
                     user: User = Depends(require_roles("admin", "police", "investigator"))):
    require_privileged_mfa(user)
    if not db.get(Case, case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    if not db.get(User, request.user_id):
        raise HTTPException(status_code=404, detail="Authorized user not found")
    if not request.department.strip():
        raise HTTPException(status_code=400, detail="Department is required")
    if request.access_level not in {"viewer", "contributor", "approver"}:
        raise HTTPException(status_code=400, detail="Invalid collaborator access level")
    existing = db.query(CaseCollaborator).filter(
        CaseCollaborator.case_id == case_id,
        CaseCollaborator.user_id == request.user_id,
    ).first()
    if existing:
        existing.department = request.department.strip()
        existing.access_level = request.access_level
        db.commit()
        return {"id": existing.id, "case_id": case_id, "user_id": request.user_id,
                "department": existing.department, "access_level": existing.access_level}
    collaborator = CaseCollaborator(
        case_id=case_id, user_id=request.user_id,
        department=request.department.strip(), access_level=request.access_level,
    )
    db.add(collaborator)
    write_audit(db, "case.collaborator_added", "case", user.id, case_id,
                {"user_id": request.user_id, "department": collaborator.department})
    db.commit()
    return {"id": collaborator.id, "case_id": case_id, "user_id": request.user_id,
            "department": collaborator.department, "access_level": collaborator.access_level}


@app.get("/api/cases/{case_id}/collaborators")
def list_collaborators(case_id: int, db: Session = Depends(get_db),
                       user: User = Depends(current_user)):
    if not db.get(Case, case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    return [{
        "id": item.id, "user_id": item.user_id, "department": item.department,
        "access_level": item.access_level,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    } for item in db.query(CaseCollaborator).filter(
        CaseCollaborator.case_id == case_id
    ).order_by(desc(CaseCollaborator.id)).all()]


@app.post("/api/permissions")
def create_permission(request: PermissionRequest, db: Session = Depends(get_db),
                      user: User = Depends(require_roles("admin", "police", "investigator"))):
    require_privileged_mfa(user)
    if not request.user_id and not request.role:
        raise HTTPException(status_code=400, detail="A user or role is required")
    permission = Permission(
        user_id=request.user_id, role=request.role, case_id=request.case_id,
        document_id=request.document_id, access_level=request.access_level,
        valid_from=datetime.fromisoformat(request.valid_from) if request.valid_from else None,
        valid_to=datetime.fromisoformat(request.valid_to) if request.valid_to else None,
        created_by=user.id,
    )
    db.add(permission)
    write_audit(db, "permission.created", "permission", user.id, None,
                {"case_id": request.case_id, "document_id": request.document_id})
    db.commit()
    db.refresh(permission)
    return {"id": permission.id, "status": "active", "access_level": permission.access_level,
            "valid_to": permission.valid_to.isoformat() if permission.valid_to else None}


@app.get("/api/permissions")
def list_permissions(db: Session = Depends(get_db),
                      user: User = Depends(require_roles("admin", "police", "investigator"))):
    response = [{
        "id": item.id, "user_id": item.user_id, "role": item.role,
        "case_id": item.case_id, "document_id": item.document_id,
        "access_level": item.access_level,
        "valid_to": item.valid_to.isoformat() if item.valid_to else None,
    } for item in db.query(Permission).order_by(desc(Permission.created_at)).limit(200).all()]
    write_audit(db, "permission.listed", "permission", user.id, None,
                {"result_count": len(response)})
    db.commit()
    return response


@app.get("/api/notifications")
def notifications(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return [{
        "id": item.id, "title": item.title, "message": item.message,
        "status": item.status, "created_at": item.created_at.isoformat() if item.created_at else None,
    } for item in db.query(Notification).filter(Notification.user_id == user.id)
        .order_by(desc(Notification.created_at)).limit(50).all()]


@app.post("/api/notifications/{notification_id}/read")
def read_notification(notification_id: int, db: Session = Depends(get_db),
                      user: User = Depends(current_user)):
    item = db.query(Notification).filter(Notification.id == notification_id,
                                          Notification.user_id == user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Notification not found")
    item.status = "read"
    db.commit()
    return {"id": item.id, "status": item.status}


@app.post("/api/public/legal-question")
def public_legal_question(request: PublicQuestionRequest):
    audience_guidance = {
        "citizen": "I can explain general legal concepts and next steps in plain language.",
        "student": "I can explain public legal concepts as a learning aid and point you to public resources.",
        "lawyer": "I can organize permitted public information for research, but verify every authority and citation.",
        "victim": "I can help organize a complaint and explain the public case-status process without exposing confidential records.",
    }
    guidance = audience_guidance.get(request.audience.lower(), audience_guidance["citizen"])
    return {
        "answer": (
            f"{guidance} This public assistance response is general information only. "
            "Preserve supporting records and consult a qualified legal professional "
            "or the appropriate authority."
        ),
        "question": request.question, "language": request.language,
        "audience": request.audience,
        "sources": ["Public legal guidance placeholder"],
        "confidential_case_data_accessed": False,
        "disclaimer": "Not legal advice; no confidential investigation repository was queried.",
    }


@app.post("/api/public/complaint-draft")
def public_complaint_draft(request: ComplaintDraftRequest):
    return {
        "draft": (
            f"COMPLAINT DRAFT ({request.language})\n\nTo,\nThe Appropriate Authority\n\n"
            f"Subject: Complaint regarding the following facts\n\n{request.facts}\n\n"
            "I request that the matter be examined and that I be informed of the next steps.\n\n"
            "Complainant signature: __________________\n"
        ),
        "editable": True, "confidential_case_data_accessed": False,
        "review_required": True,
    }


@app.post("/api/public/assistance")
def public_assistance(request: PublicQuestionRequest):
    audience = request.audience.lower()
    flows = {
        "citizen": {
            "title": "Citizen legal information",
            "features": ["General legal explanation", "Complaint preparation", "Personal-document guidance"],
            "next_steps": ["Describe the issue without confidential case identifiers.",
                           "Preserve relevant records and dates.", "Review the generated guidance with a qualified professional."],
        },
        "student": {
            "title": "Student legal learning",
            "features": ["Plain-language concepts", "Public legal resources", "Study-friendly explanations"],
            "next_steps": ["Ask about a public legal concept.", "Compare the explanation with official learning resources.",
                           "Use the response as study support, not as a legal authority."],
        },
        "lawyer": {
            "title": "Lawyer research assistance",
            "features": ["Public-source research organization", "Document checklist support", "Draft review prompts"],
            "next_steps": ["Provide permitted public facts.", "Verify citations and current jurisdictional rules.",
                           "Keep privileged or confidential material out of the public portal."],
        },
        "victim": {
            "title": "Victim and complainant support",
            "features": ["Guided complaint preparation", "Evidence checklist", "Controlled case-status tracking"],
            "next_steps": ["Record what happened, when and where.", "Keep originals of supporting evidence.",
                           "Use the secure case identifier for status tracking."],
        },
    }
    selected = flows.get(audience, flows["citizen"])
    return {
        "title": selected["title"], "audience": audience,
        "question": request.question, "language": request.language,
        "features": selected["features"], "next_steps": selected["next_steps"],
        "answer": " ".join(selected["next_steps"]),
        "confidential_case_data_accessed": False,
        "disclaimer": "Public information service only. This does not provide legal advice or access private investigation records.",
    }


@app.post("/api/public/personal-document")
def public_personal_document(request: PersonalDocumentRequest):
    text = " ".join(request.text.split())
    words = text.split()
    return {
        "document_type": request.document_type,
        "language": request.language,
        "summary": f"Personal document contains {len(words)} words and is ready for human review.",
        "checklist": ["Confirm names and dates", "Remove unnecessary sensitive identifiers",
                      "Attach supporting records", "Review before submission"],
        "draft_note": "This public tool does not store the submitted text in the confidential case repository.",
        "confidential_case_data_accessed": False,
    }


@app.post("/api/public/personal-document/upload")
async def public_personal_document_upload(
    document: UploadFile = File(...),
):
    allowed = {".pdf", ".jpg", ".jpeg", ".png", ".txt", ".doc", ".docx"}
    filename = document.filename or "personal-document"
    if Path(filename).suffix.lower() not in allowed:
        raise HTTPException(status_code=400, detail="Unsupported personal document type")
    content = await document.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds the 25 MB limit")
    extracted = ocr_bytes(content, filename)
    normalized_text = " ".join(extracted.split())
    topic_terms = {
        "complaint": ("complaint", "grievance", "allegation"),
        "court proceeding": ("court", "hearing", "petition", "affidavit"),
        "employment": ("employment", "salary", "employer", "termination", "workplace"),
        "property": ("property", "rent", "lease", "landlord", "tenant"),
        "consumer matter": ("consumer", "invoice", "refund", "warranty", "purchase"),
        "financial matter": ("bank", "payment", "transaction", "loan", "fraud"),
        "cybercrime": ("cyber", "online", "account", "password", "phishing"),
        "family matter": ("marriage", "divorce", "custody", "maintenance"),
    }
    topic_scores = {
        topic: sum(normalized_text.lower().count(term) for term in terms)
        for topic, terms in topic_terms.items()
    }
    topics = [topic for topic, score in sorted(topic_scores.items(), key=lambda item: item[1], reverse=True) if score > 0][:4]
    if not topics:
        topics = ["General legal document"]
    date_matches = re.findall(
        r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b",
        normalized_text,
    )[:10]
    subject = topics[0].title()
    if "notice" in normalized_text.lower():
        subject = "Legal notice"
    elif "agreement" in normalized_text.lower() or "contract" in normalized_text.lower():
        subject = "Agreement or contract"
    elif "receipt" in normalized_text.lower() or "invoice" in normalized_text.lower():
        subject = "Receipt or invoice"
    review_flags = []
    lowered_text = normalized_text.lower()
    if not normalized_text:
        review_flags.append("No readable text was extracted; inspect the original document manually.")
    if any(term in lowered_text for term in ("deadline", "due date", "hearing date")):
        review_flags.append("A date or deadline may require confirmation.")
    if any(term in lowered_text for term in ("signature", "signed", "seal")):
        review_flags.append("Check signatures, seals and authority before relying on this document.")
    if not review_flags:
        review_flags.append("Confirm names, dates, references and attachments before relying on this document.")
    return {
        "filename": filename,
        "size": len(content),
        "text_extracted": bool(extracted),
        "ocr_text_length": len(extracted),
        "subject": subject,
        "topics": topics,
        "important_dates": date_matches,
        "review_flags": review_flags,
        "content_preview": normalized_text[:1200],
        "summary": (
            f"The document appears to concern {subject.lower()}. "
            "Its readable content was analyzed in-memory for this public demonstration "
            "and was not saved to the secure investigation repository."
        ),
        "confidential_case_data_accessed": False,
        "stored_in_secure_repository": False,
        "review_required": True,
    }


@app.post("/api/public/case-track")
def public_case_track(request: CaseTrackRequest):
    public_db = PublicSessionLocal()
    try:
        snapshot = public_db.query(PublicCaseStatus).filter(
            PublicCaseStatus.case_number == request.case_number.strip(),
            PublicCaseStatus.active.is_(True),
        ).first()
        if not snapshot:
            raise HTTPException(status_code=404, detail="Public case status not found")
        if snapshot.expires_at and snapshot.expires_at < datetime.utcnow():
            raise HTTPException(status_code=404, detail="Public case status has expired")
        if request.verification_code.strip().upper() != snapshot.verification_hash:
            write_public_audit(public_db, "public.case_status_verification_failed",
                               snapshot.case_number, {"reason": "invalid_code"})
            public_db.commit()
            raise HTTPException(status_code=403, detail="Case verification failed")
        timeline = json.loads(snapshot.timeline_json or "[]")
        write_public_audit(public_db, "public.case_status_viewed", snapshot.case_number)
        public_db.commit()
        return {
            "case_number": snapshot.case_number,
            "title": snapshot.title,
            "status": snapshot.status,
            "timeline": timeline,
            "confidential_documents_exposed": False,
            "secure_repository_queried": False,
            "verification": "verified_public_snapshot",
            "published_at": snapshot.published_at.isoformat() if snapshot.published_at else None,
        }
    finally:
        public_db.close()


@app.get("/api/public/legal-resources")
def public_legal_resources():
    return {
        "resources": [
            {
                "title": "Complaint preparation guide",
                "type": "guide",
                "description": "Organise facts, dates and supporting documents before submitting a complaint.",
                "url": "https://www.india.gov.in/",
            },
            {
                "title": "Evidence preservation checklist",
                "type": "checklist",
                "description": "Protect original files, messages, receipts and witness details.",
                "url": "https://www.cybercrime.gov.in/",
            },
            {
                "title": "General legal information",
                "type": "reference",
                "description": "Read public legal information and verify current rules with official sources.",
                "url": "https://www.indiacode.nic.in/",
            },
        ],
        "notice": "Public resources are informational and must be validated against current law.",
    }


@app.get("/api/admin/overview")
def admin_overview(db: Session = Depends(get_db),
                   user: User = Depends(require_admin_mfa)):
    response = {
        "users": db.query(User).count(),
        "active_users": db.query(User).filter(User.is_active.is_(True)).count(),
        "departments": sorted({item.department or item.role for item in db.query(User).all()}),
        "cases": db.query(Case).count(),
        "documents": db.query(Document).filter(Document.is_active.is_(True)).count(),
        "security_events": db.query(AuditLog).filter(
            or_(AuditLog.action.like("%login%"), AuditLog.action.like("%permission%"),
                AuditLog.action.like("%verify%"))).count(),
        "blockchain_records": db.query(BlockchainRecord).count(),
    }
    write_audit(db, "admin.overview_viewed", "administration", user.id, None)
    db.commit()
    return response


@app.get("/api/admin/users")
def admin_users(db: Session = Depends(get_db),
                user: User = Depends(require_admin_mfa)):
    response = [{
        "id": item.id, "email": item.email, "full_name": item.full_name,
        "role": item.role, "department": item.department,
        "active": item.is_active, "mfa_enabled": item.mfa_enabled,
    } for item in db.query(User).order_by(User.full_name).all()]
    write_audit(db, "admin.users_viewed", "user", user.id, None,
                {"result_count": len(response)})
    db.commit()
    return response


@app.get("/api/integrations/cloud")
def cloud_storage_status(user: User = Depends(current_user)):
    configured = bool(os.getenv("R2_ENDPOINT") or os.getenv("S3_ENDPOINT"))
    return {"provider": "Cloudflare R2 / S3-compatible", "configured": configured,
            "active_provider": "cloud" if configured else "local",
            "message": "Cloud storage is ready when endpoint credentials are configured."}


@app.post("/api/backups")
def create_backup(db: Session = Depends(get_db),
                  user: User = Depends(require_admin_mfa)):
    backup_dir = settings.BASE_DIR / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    filename = f"ask-nyai-backup-{secrets.token_hex(6)}.zip"
    destination = backup_dir / filename
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        if engine.url.get_backend_name() == "sqlite" and engine.url.database:
            database_path = Path(engine.url.database)
            if database_path.is_file():
                archive.write(database_path, "database/dms.db")
        for file_path in settings.UPLOAD_DIR.glob("*"):
            if file_path.is_file() and file_path.name != filename:
                archive.write(file_path, f"uploads/{file_path.name}")
    record = BackupRecord(filename=filename, created_by=user.id)
    db.add(record)
    write_audit(db, "backup.created", "backup", user.id, None, {"filename": filename})
    db.commit()
    return {"filename": filename, "status": record.status, "size": destination.stat().st_size}


@app.get("/api/backups")
def list_backups(db: Session = Depends(get_db),
                 user: User = Depends(require_admin_mfa)):
    response = [{"filename": item.filename, "status": item.status,
             "created_at": item.created_at.isoformat() if item.created_at else None}
            for item in db.query(BackupRecord).order_by(desc(BackupRecord.id)).all()]
    write_audit(db, "admin.backups_viewed", "backup", user.id, None,
                {"result_count": len(response)})
    db.commit()
    return response


@app.get("/api/backups/{filename}/download")
def download_backup(filename: str, db: Session = Depends(get_db),
                    user: User = Depends(require_admin_mfa)):
    safe_name = Path(filename).name
    backup_path = settings.BASE_DIR / "backups" / safe_name
    if safe_name != filename or not backup_path.is_file():
        raise HTTPException(status_code=404, detail="Backup not found")
    write_audit(db, "admin.backup_downloaded", "backup", user.id, None,
                {"filename": safe_name})
    db.commit()
    return FileResponse(backup_path, filename=safe_name, media_type="application/zip")


@app.post("/api/blockchain/anchor")
def anchor_audit_chain(db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {"admin", "investigator"}:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    head = db.query(AuditLog).order_by(desc(AuditLog.id)).first()
    audit_head = head.entry_hash if head else "GENESIS"
    previous = db.query(ChainAnchor).order_by(desc(ChainAnchor.id)).first()
    previous_hash = previous.block_hash if previous else "GENESIS"
    block_hash = hashlib.sha256(f"{audit_head}:{previous_hash}".encode()).hexdigest()
    block = ChainAnchor(audit_head=audit_head, previous_block=previous_hash, block_hash=block_hash)
    db.add(block)
    db.add(BlockchainRecord(
        document_hash=audit_head, transaction_id=f"fabric-demo-{secrets.token_hex(12)}",
        status="anchored",
    ))
    write_audit(db, "audit.block_anchored", "chain_anchor", user.id, None, {"block_hash": block_hash})
    db.commit()
    return {"block_hash": block_hash, "audit_head": audit_head, "previous_block": previous_hash,
            "transaction_id": f"fabric-demo-{block_hash[:16]}"}


@app.get("/api/audit/verify")
def verify_audit_chain(db: Session = Depends(get_db), user: User = Depends(current_user)):
    entries = db.query(AuditLog).order_by(AuditLog.id).all()
    previous = "GENESIS"
    for item in entries:
        payload = {"action": item.action, "entity_type": item.entity_type, "entity_id": item.entity_id,
                   "user_id": item.user_id, "details": json.loads(item.details or "{}"),
                   "previous_hash": item.previous_hash}
        expected = hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
        if item.previous_hash != previous or item.entry_hash != expected:
            response = {"valid": False, "broken_at": item.id}
            write_audit(db, "audit.chain_verification_failed", "audit_log", user.id, item.id, response)
            db.commit()
            return response
        previous = item.entry_hash
    response = {"valid": True, "entries": len(entries)}
    write_audit(db, "audit.chain_verified", "audit_log", user.id, None, response)
    db.commit()
    return response
