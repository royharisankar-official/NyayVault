from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.sql import func
from app.database import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    filename = Column(String, index=True)
    file_path = Column(String, index=True)
    document_type = Column(String, index=True)  # fir, investigation, witness, forensic
    uploader_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_onupdate=func.now())
    version = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=True, index=True)
    sha256 = Column(String(64), nullable=False, default="")
    description = Column(Text, nullable=True)
    tags = Column(String, nullable=True)
    extracted_text = Column(Text, nullable=True)
    signature = Column(String, nullable=True)
    encrypted = Column(Boolean, default=False)
    classification = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    storage_provider = Column(String, default="local")
    sensitivity = Column(String, default="confidential", index=True)


class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True, index=True)
    case_number = Column(String, unique=True, index=True)
    title = Column(String, index=True)
    status = Column(String, default="active")
    fir_number = Column(String, nullable=True, index=True)
    police_station = Column(String, nullable=True)
    investigating_officer_id = Column(Integer, nullable=True)
    sensitivity = Column(String, default="confidential")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_onupdate=func.now())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, default="investigator")
    department = Column(String, default="investigations", index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    mfa_secret = Column(String, nullable=True)
    mfa_enabled = Column(Boolean, default=False)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String, nullable=False, index=True)
    entity_type = Column(String, nullable=False)
    entity_id = Column(Integer, nullable=True)
    user_id = Column(Integer, nullable=True)
    details = Column(Text, nullable=True)
    previous_hash = Column(String(64), nullable=False, default="")
    entry_hash = Column(String(64), nullable=False, unique=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)


class ChainAnchor(Base):
    __tablename__ = "chain_anchors"

    id = Column(Integer, primary_key=True, index=True)
    audit_head = Column(String(64), nullable=False)
    previous_block = Column(String(64), nullable=False, default="GENESIS")
    block_hash = Column(String(64), nullable=False, unique=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    file_path = Column(String, nullable=False)
    sha256 = Column(String(64), nullable=False)
    created_by = Column(Integer, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)


class DocumentShare(Base):
    __tablename__ = "document_shares"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    shared_with = Column(String, nullable=False)
    permission = Column(String, default="view")
    share_token = Column(String, unique=True, nullable=False, index=True)
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), index=True)


class CaseCollaborator(Base):
    __tablename__ = "case_collaborators"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    department = Column(String, nullable=False)
    access_level = Column(String, default="contributor")
    created_at = Column(DateTime, server_default=func.now(), index=True)


class BackupRecord(Base):
    __tablename__ = "backup_records"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    status = Column(String, default="completed")
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), index=True)


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    role = Column(String, nullable=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=True, index=True)
    access_level = Column(String, default="view")
    valid_from = Column(DateTime, nullable=True)
    valid_to = Column(DateTime, nullable=True)
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), index=True)


class CaseEvent(Base):
    __tablename__ = "case_events"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False, index=True)
    event_type = Column(String, nullable=False)
    actor_id = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    event_at = Column(DateTime, server_default=func.now(), index=True)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String, default="pending")
    created_at = Column(DateTime, server_default=func.now(), index=True)


class BlockchainRecord(Base):
    __tablename__ = "blockchain_records"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, nullable=True, index=True)
    document_hash = Column(String(64), nullable=False)
    version = Column(Integer, nullable=True)
    transaction_id = Column(String, nullable=False, unique=True)
    status = Column(String, default="anchored")
    created_at = Column(DateTime, server_default=func.now(), index=True)


class AIQuery(Base):
    __tablename__ = "ai_queries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    case_id = Column(Integer, nullable=True, index=True)
    question = Column(Text, nullable=False)
    retrieved_sources = Column(Text, nullable=True)
    response = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)