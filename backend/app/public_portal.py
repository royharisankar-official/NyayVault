"""Isolated public-tier datastore and service boundary.

This module intentionally has no import of the confidential DMS models or
secure database session. Public requests can only read published snapshots.
"""

import hashlib
import json
import secrets
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class PublicBase(DeclarativeBase):
    pass


class PublicCaseStatus(PublicBase):
    __tablename__ = "public_case_status"

    id = Column(Integer, primary_key=True)
    case_number = Column(String, unique=True, index=True, nullable=False)
    title = Column(String, nullable=False)
    status = Column(String, nullable=False)
    verification_hash = Column(String(64), nullable=False)
    timeline_json = Column(Text, nullable=False, default="[]")
    published_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    active = Column(Boolean, default=True, nullable=False)


class PublicAuditEvent(PublicBase):
    __tablename__ = "public_audit_events"

    id = Column(Integer, primary_key=True)
    action = Column(String, nullable=False, index=True)
    case_number = Column(String, nullable=True, index=True)
    details = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


PUBLIC_DATABASE_URL = f"sqlite:///{(settings.BASE_DIR / 'public_portal.db').as_posix()}"
public_engine = create_engine(PUBLIC_DATABASE_URL, connect_args={"check_same_thread": False})
PublicSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=public_engine)
PublicBase.metadata.create_all(bind=public_engine)


def public_verification_code(case_number: str) -> str:
    return hashlib.sha256(
        f"{case_number}:{settings.SECRET_KEY}".encode()
    ).hexdigest()[:8].upper()


def public_session():
    session = PublicSessionLocal()
    try:
        yield session
    finally:
        session.close()


def write_public_audit(
    db,
    action: str,
    case_number: str | None = None,
    details: dict | None = None,
):
    db.add(PublicAuditEvent(
        action=action,
        case_number=case_number,
        details=json.dumps(details or {}, sort_keys=True, default=str),
    ))


def publish_case_snapshot(
    db,
    case_number: str,
    title: str,
    status: str,
    timeline: list[dict],
    expires_at: datetime | None = None,
):
    snapshot = db.query(PublicCaseStatus).filter(
        PublicCaseStatus.case_number == case_number
    ).first()
    if not snapshot:
        snapshot = PublicCaseStatus(case_number=case_number)
        db.add(snapshot)
    snapshot.title = title
    snapshot.status = status
    snapshot.verification_hash = public_verification_code(case_number)
    snapshot.timeline_json = json.dumps(timeline, default=str)
    snapshot.published_at = datetime.utcnow()
    snapshot.expires_at = expires_at
    snapshot.active = True
    write_public_audit(db, "public.case_status_published", case_number, {
        "timeline_events": len(timeline),
        "expires_at": expires_at,
    })
    db.commit()
    db.refresh(snapshot)
    return snapshot
