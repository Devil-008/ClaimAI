from sqlalchemy import (
    Column,
    Integer,
    String,
    Enum,
    Boolean,
    DateTime,
    Text,
    DECIMAL,
    Date,
    JSON,
    BigInteger,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(
        Enum("policyholder", "adjuster", "siu_investigator", "supervisor", "it_ops"),
        nullable=False,
        default="policyholder",
    )
    phone = Column(String(30))
    avatar_url = Column(String(500))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    last_login = Column(DateTime)


class Policy(Base):
    __tablename__ = "policies"
    id = Column(Integer, primary_key=True, index=True)
    policy_number = Column(String(50), nullable=False, unique=True, index=True)
    policyholder_id = Column(Integer, nullable=False)
    # Extracted policyholder details
    policyholder_name = Column(String(200))
    date_of_birth = Column(Date)
    nominee_name = Column(String(200))
    insurance_company = Column(String(200))
    plan_name = Column(String(200))
    # Policy terms
    policy_type = Column(
        Enum("auto", "property", "health", "life", "commercial"), nullable=False
    )
    coverage_type = Column(String(100))
    coverage_limit = Column(DECIMAL(15, 2), default=0)
    deductible = Column(DECIMAL(15, 2), default=0)
    premium = Column(DECIMAL(15, 2), default=0)
    effective_date = Column(Date, nullable=False)
    expiry_date = Column(Date, nullable=False)
    status = Column(
        Enum("active", "expired", "suspended", "cancelled"), default="active"
    )
    exclusions = Column(Text)
    benefits = Column(Text)
    extra_details = Column(Text)  # JSON string storing all rich standard details
    file_path = Column(String(500))  # uploaded document path
    raw_extracted_text = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Claim(Base):
    __tablename__ = "claims"
    id = Column(Integer, primary_key=True, index=True)
    claim_number = Column(String(50), nullable=False, unique=True, index=True)
    policy_id = Column(Integer, nullable=False)
    claimant_id = Column(Integer, nullable=False, index=True)
    incident_date = Column(Date, nullable=False)
    incident_description = Column(Text)
    claim_type = Column(
        Enum(
            "auto_accident", "property_damage", "theft", "medical", "weather", "other"
        ),
        nullable=False,
    )
    status = Column(
        Enum(
            "fnol_received",
            "coverage_verification",
            "damage_assessment",
            "fraud_scoring",
            "settlement_pending",
            "settled",
            "escalated_adjuster",
            "escalated_siu",
            "rejected",
            "closed",
        ),
        default="fnol_received",
        index=True,
    )
    priority = Column(Enum("low", "medium", "high", "critical"), default="medium")
    channel = Column(Enum("web", "mobile", "email", "voice", "api"), default="web")
    assigned_adjuster = Column(Integer)
    assigned_siu = Column(Integer)
    escalation_assignee_id = Column(Integer)
    escalation_assignee_role = Column(String(50))
    escalation_level = Column(Integer, default=0)
    escalation_started_at = Column(DateTime)
    escalation_next_check_at = Column(DateTime)
    escalation_last_notified_at = Column(DateTime)
    escalation_last_status = Column(String(50))
    auto_settle_eligible = Column(Boolean, default=False)
    adjuster_recommended_action = Column(String(50))
    adjuster_recommended_amount = Column(DECIMAL(15, 2))
    adjuster_recommended_notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    closed_at = Column(DateTime)


class FNOLSubmission(Base):
    __tablename__ = "fnol_submissions"
    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, nullable=False, index=True)
    raw_input_type = Column(
        Enum("form", "email", "voice", "image", "pdf"), default="form"
    )
    raw_input_path = Column(String(500))
    extracted_entities = Column(JSON)
    ocr_text = Column(Text)
    voice_transcript = Column(Text)
    intake_status = Column(Enum("pending", "processed", "failed"), default="pending")
    processing_notes = Column(Text)
    processed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())


class FraudRiskScore(Base):
    __tablename__ = "fraud_risk_scores"
    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, nullable=False, unique=True)
    fraud_score = Column(DECIMAL(5, 4), default=0)
    risk_level = Column(Enum("low", "medium", "high", "critical"), default="low")
    red_flags = Column(JSON)
    siu_watchlist_hit = Column(Boolean, default=False)
    graph_anomaly = Column(Boolean, default=False)
    model_version = Column(String(50))
    siu_referred = Column(Boolean, default=False)
    siu_referred_at = Column(DateTime)
    agent_reasoning = Column(Text)
    scored_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())


class DamageAssessment(Base):
    __tablename__ = "damage_assessments"
    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, nullable=False, index=True)
    assessor_type = Column(Enum("agent", "human"), default="agent")
    damage_severity = Column(
        Enum("minor", "moderate", "severe", "total"), default="moderate"
    )
    estimated_amount = Column(DECIMAL(15, 2), default=0)
    photos_analyzed = Column(Integer, default=0)
    assessment_notes = Column(Text)
    assessment_date = Column(Date)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())


class PipelineTrace(Base):
    """Stores the full A1–A7 pipeline execution trace per claim."""

    __tablename__ = "pipeline_traces"
    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, nullable=False, unique=True, index=True)
    outcome = Column(String(50))
    outcome_msg = Column(Text)
    elapsed_ms = Column(Integer)
    trace = Column(JSON)  # full step-by-step results
    ran_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Settlement(Base):
    __tablename__ = "settlements"
    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, nullable=False, unique=True)
    gross_amount = Column(DECIMAL(15, 2), default=0)
    deductible_deducted = Column(DECIMAL(15, 2), default=0)
    net_payout = Column(DECIMAL(15, 2), default=0)
    payment_method = Column(
        Enum("bank_transfer", "cheque", "digital_wallet"), default="bank_transfer"
    )
    payment_reference = Column(String(100), index=True)
    payment_status = Column(
        Enum("pending", "initiated", "processing", "completed", "failed"),
        default="pending",
        index=True,
    )
    # payment_initiated_at / payment_expected_by — run migrate_settlement.py to add these columns
    # payment_initiated_at = Column(DateTime)
    # payment_expected_by  = Column(DateTime)
    settlement_letter = Column(String(500))
    approved_by = Column(Integer)
    settled_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(BigInteger, primary_key=True, index=True)
    event_type = Column(String(100), nullable=False, index=True)
    actor_id = Column(Integer)
    actor_type = Column(Enum("user", "agent", "system"), default="user")
    claim_id = Column(Integer, index=True)
    resource_type = Column(String(50))
    resource_id = Column(Integer)
    old_value = Column(JSON)
    new_value = Column(JSON)
    ip_address = Column(String(45))
    user_agent = Column(String(500))
    created_at = Column(DateTime, server_default=func.now(), index=True)


class KPISnapshot(Base):
    __tablename__ = "kpi_snapshots"
    id = Column(Integer, primary_key=True, index=True)
    snapshot_date = Column(Date, nullable=False, unique=True)
    total_claims = Column(Integer, default=0)
    auto_settled = Column(Integer, default=0)
    escalated_adjuster = Column(Integer, default=0)
    escalated_siu = Column(Integer, default=0)
    rejected = Column(Integer, default=0)
    stp_rate = Column(DECIMAL(5, 4))
    avg_tat_minutes = Column(DECIMAL(10, 2))
    avg_fraud_score = Column(DECIMAL(5, 4))
    csat_score = Column(DECIMAL(3, 2))
    tool_call_success_rate = Column(DECIMAL(5, 4))
    p95_latency_ms = Column(Integer)
    created_at = Column(DateTime, server_default=func.now())


class SystemHealth(Base):
    __tablename__ = "system_health"
    id = Column(Integer, primary_key=True, index=True)
    service_name = Column(String(100), nullable=False, index=True)
    status = Column(Enum("healthy", "degraded", "down"), default="healthy")
    response_time_ms = Column(Integer)
    error_rate = Column(DECIMAL(5, 4))
    cpu_usage = Column(DECIMAL(5, 2))
    memory_usage = Column(DECIMAL(5, 2))
    checked_at = Column(DateTime, server_default=func.now(), index=True)


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500))
    file_size = Column(Integer)  # size in bytes
    uploader_id = Column(Integer)
    context_summary = Column(Text)
    risk_analysis = Column(Text)
    suggested_questions = Column(JSON)
    status = Column(Enum("processing", "completed", "failed"), default="processing")
    created_at = Column(DateTime, server_default=func.now())


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    claim_id = Column(Integer, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), index=True)


class EmailConfig(Base):
    __tablename__ = "email_configs"
    id = Column(Integer, primary_key=True, index=True)
    config_name = Column(String(100), nullable=False, unique=True, index=True)
    smtp_host = Column(String(255), nullable=False)
    smtp_port = Column(Integer, nullable=False, default=587)
    smtp_user = Column(String(255), nullable=False)
    smtp_password = Column(String(255), nullable=False)
    smtp_from = Column(String(255), nullable=False)
    smtp_use_tls = Column(Boolean, default=True)
    maintenance_minutes = Column(Integer, default=1)
    check_interval_seconds = Column(Integer, default=15)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class EmailLog(Base):
    __tablename__ = "email_logs"
    __table_args__ = (
        UniqueConstraint(
            "claim_id",
            "escalation_level",
            "event_type",
            name="uq_email_log_claim_level_event",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, nullable=False, index=True)
    claim_number = Column(String(50), nullable=False, index=True)
    email_config_id = Column(Integer)
    event_type = Column(String(50), nullable=False, default="escalation_notice")
    source_status = Column(String(50), nullable=False)
    source_role = Column(String(50))
    recipient_user_id = Column(Integer)
    recipient_name = Column(String(150))
    recipient_role = Column(String(50))
    recipient_email = Column(String(255), nullable=False)
    escalation_level = Column(Integer, nullable=False, default=0)
    next_persona_role = Column(String(50))
    subject = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    smtp_host = Column(String(255))
    smtp_port = Column(Integer)
    smtp_user = Column(String(255))
    smtp_from = Column(String(255))
    smtp_use_tls = Column(Boolean, default=True)
    status = Column(
        Enum("queued", "sent", "failed", "skipped"), default="queued", nullable=False
    )
    error_message = Column(Text)
    action_deadline_at = Column(DateTime)
    sent_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
