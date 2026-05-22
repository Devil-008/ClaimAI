-- ============================================================
-- Claims Automation Agent - Database Schema
-- Run in MySQL Workbench in order: 01 → 02 → 03
-- ============================================================

CREATE DATABASE IF NOT EXISTS claims_automation_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE claims_automation_db;

-- ============================================================
-- TABLE 1: users  (multi-persona authentication)
-- Roles: policyholder | adjuster | siu_investigator | supervisor | it_ops
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name     VARCHAR(150) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM('policyholder','adjuster','siu_investigator','supervisor','it_ops') NOT NULL DEFAULT 'policyholder',
    phone         VARCHAR(30),
    avatar_url    VARCHAR(500),
    is_active     TINYINT(1) NOT NULL DEFAULT 1,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login    DATETIME,
    INDEX idx_role (role),
    INDEX idx_email (email)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 2: policies  (A3 – Coverage Verification)
-- ============================================================
CREATE TABLE IF NOT EXISTS policies (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    policy_number       VARCHAR(50) NOT NULL UNIQUE,
    policyholder_id     INT UNSIGNED NOT NULL,
    policy_type         ENUM('auto','property','health','life','commercial') NOT NULL,
    coverage_type       VARCHAR(100),
    coverage_limit      DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    deductible          DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    premium             DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    effective_date      DATE NOT NULL,
    expiry_date         DATE NOT NULL,
    status              ENUM('active','expired','suspended','cancelled') NOT NULL DEFAULT 'active',
    exclusions          TEXT,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (policyholder_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_policy_number (policy_number),
    INDEX idx_policyholder (policyholder_id)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 3: claims  (Master claim record — A1 Orchestrator state machine)
-- ============================================================
CREATE TABLE IF NOT EXISTS claims (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    claim_number        VARCHAR(50) NOT NULL UNIQUE,
    policy_id           INT UNSIGNED NOT NULL,
    claimant_id         INT UNSIGNED NOT NULL,
    incident_date       DATE NOT NULL,
    incident_description TEXT,
    claim_type          ENUM('auto_accident','property_damage','theft','medical','weather','other') NOT NULL,
    status              ENUM(
                            'fnol_received',
                            'coverage_verification',
                            'damage_assessment',
                            'fraud_scoring',
                            'settlement_pending',
                            'settled',
                            'escalated_adjuster',
                            'escalated_siu',
                            'rejected',
                            'closed'
                        ) NOT NULL DEFAULT 'fnol_received',
    priority            ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
    channel             ENUM('web','mobile','email','voice','api') NOT NULL DEFAULT 'web',
    assigned_adjuster   INT UNSIGNED,
    assigned_siu        INT UNSIGNED,
    escalation_assignee_id INT UNSIGNED,
    escalation_assignee_role VARCHAR(50),
    escalation_level    INT NOT NULL DEFAULT 0,
    escalation_started_at DATETIME,
    escalation_next_check_at DATETIME,
    escalation_last_notified_at DATETIME,
    escalation_last_status VARCHAR(50),
    auto_settle_eligible TINYINT(1) NOT NULL DEFAULT 0,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    closed_at           DATETIME,
    FOREIGN KEY (policy_id)           REFERENCES policies(id),
    FOREIGN KEY (claimant_id)         REFERENCES users(id),
    FOREIGN KEY (assigned_adjuster)   REFERENCES users(id),
    FOREIGN KEY (assigned_siu)        REFERENCES users(id),
    INDEX idx_claim_number (claim_number),
    INDEX idx_status (status),
    INDEX idx_claimant (claimant_id)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 4b: email_configs  (SMTP + escalation maintenance)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_configs (
    id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    config_name            VARCHAR(100) NOT NULL UNIQUE,
    smtp_host              VARCHAR(255) NOT NULL,
    smtp_port              INT NOT NULL DEFAULT 587,
    smtp_user              VARCHAR(255) NOT NULL,
    smtp_password          VARCHAR(255) NOT NULL,
    smtp_from              VARCHAR(255) NOT NULL,
    smtp_use_tls           TINYINT(1) NOT NULL DEFAULT 1,
    maintenance_minutes    INT NOT NULL DEFAULT 1,
    check_interval_seconds  INT NOT NULL DEFAULT 15,
    is_active              TINYINT(1) NOT NULL DEFAULT 1,
    created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email_config_name (config_name)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 4c: email_logs  (SMTP delivery + escalation audit)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_logs (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    claim_id            INT UNSIGNED NOT NULL,
    claim_number        VARCHAR(50) NOT NULL,
    email_config_id     INT UNSIGNED,
    event_type          VARCHAR(50) NOT NULL DEFAULT 'escalation_notice',
    source_status       VARCHAR(50) NOT NULL,
    source_role         VARCHAR(50),
    recipient_user_id   INT UNSIGNED,
    recipient_name      VARCHAR(150),
    recipient_role      VARCHAR(50),
    recipient_email     VARCHAR(255) NOT NULL,
    escalation_level    INT NOT NULL DEFAULT 0,
    next_persona_role   VARCHAR(50),
    subject             VARCHAR(255) NOT NULL,
    body                LONGTEXT NOT NULL,
    smtp_host           VARCHAR(255),
    smtp_port           INT,
    smtp_user           VARCHAR(255),
    smtp_from           VARCHAR(255),
    smtp_use_tls        TINYINT(1) DEFAULT 1,
    status              ENUM('queued','sent','failed','skipped') NOT NULL DEFAULT 'queued',
    error_message       TEXT,
    action_deadline_at  DATETIME,
    sent_at             DATETIME,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_email_log_claim_level_event (claim_id, escalation_level, event_type),
    FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (email_config_id) REFERENCES email_configs(id) ON DELETE SET NULL,
    INDEX idx_email_claim (claim_id),
    INDEX idx_email_status (status),
    INDEX idx_email_recipient (recipient_user_id)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 4: fnol_submissions  (A2 – FNOL Intake Agent)
-- ============================================================
CREATE TABLE IF NOT EXISTS fnol_submissions (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    claim_id            INT UNSIGNED NOT NULL,
    raw_input_type      ENUM('form','email','voice','image','pdf') NOT NULL DEFAULT 'form',
    raw_input_path      VARCHAR(500),          -- S3/file path for uploaded docs
    extracted_entities  JSON,                  -- NER output: {location, date, parties, etc.}
    ocr_text            LONGTEXT,
    voice_transcript    TEXT,
    intake_status       ENUM('pending','processed','failed') NOT NULL DEFAULT 'pending',
    processing_notes    TEXT,
    processed_at        DATETIME,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
    INDEX idx_claim (claim_id)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 5: coverage_verifications  (A3 – Coverage Verification Agent)
-- ============================================================
CREATE TABLE IF NOT EXISTS coverage_verifications (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    claim_id                INT UNSIGNED NOT NULL UNIQUE,
    policy_in_force         TINYINT(1),
    coverage_applicable     TINYINT(1),
    coverage_limit_applied  DECIMAL(15,2),
    deductible_applied      DECIMAL(15,2),
    exclusion_triggered     TINYINT(1) DEFAULT 0,
    exclusion_details       TEXT,
    edge_case_flagged       TINYINT(1) DEFAULT 0,
    edge_case_notes         TEXT,
    verification_status     ENUM('verified','failed','edge_case','pending') NOT NULL DEFAULT 'pending',
    agent_reasoning         TEXT,
    verified_at             DATETIME,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 6: damage_assessments  (A4 – Damage Assessment Agent)
-- ============================================================
CREATE TABLE IF NOT EXISTS damage_assessments (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    claim_id            INT UNSIGNED NOT NULL,
    assessment_type     ENUM('image_cv','document','manual') NOT NULL DEFAULT 'image_cv',
    severity            ENUM('minor','moderate','severe','total_loss') NOT NULL DEFAULT 'minor',
    estimated_cost      DECIMAL(15,2),
    cost_breakdown      JSON,              -- {parts: X, labor: Y, misc: Z}
    image_paths         JSON,              -- list of uploaded image URLs
    cv_model_output     JSON,              -- raw CV model response
    rag_context_used    TEXT,              -- repair cost KB chunks used
    assessment_status   ENUM('pending','completed','needs_review') NOT NULL DEFAULT 'pending',
    agent_reasoning     TEXT,
    assessed_at         DATETIME,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
    INDEX idx_claim (claim_id)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 7: fraud_risk_scores  (A5 – Fraud & Risk Scoring Agent)
-- ============================================================
CREATE TABLE IF NOT EXISTS fraud_risk_scores (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    claim_id            INT UNSIGNED NOT NULL UNIQUE,
    fraud_score         DECIMAL(5,4) NOT NULL DEFAULT 0.0000,  -- 0.0 to 1.0
    risk_level          ENUM('low','medium','high','critical') NOT NULL DEFAULT 'low',
    red_flags           JSON,              -- list of triggered rule names
    siu_watchlist_hit   TINYINT(1) NOT NULL DEFAULT 0,
    graph_anomaly       TINYINT(1) NOT NULL DEFAULT 0,
    model_version       VARCHAR(50),
    siu_referred        TINYINT(1) NOT NULL DEFAULT 0,
    siu_referred_at     DATETIME,
    agent_reasoning     TEXT,
    scored_at           DATETIME,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 8: settlements  (A6 – Settlement Agent)
-- ============================================================
CREATE TABLE IF NOT EXISTS settlements (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    claim_id            INT UNSIGNED NOT NULL UNIQUE,
    gross_amount        DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    deductible_deducted DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    net_payout          DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    payment_method      ENUM('bank_transfer','cheque','digital_wallet') NOT NULL DEFAULT 'bank_transfer',
    payment_reference   VARCHAR(100),
    payment_status      ENUM('pending','initiated','processing','completed','failed') NOT NULL DEFAULT 'pending',
    settlement_letter   VARCHAR(500),      -- path to generated PDF
    approved_by         INT UNSIGNED,      -- NULL = auto; set = adjuster who approved
    settled_at          DATETIME,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (claim_id)    REFERENCES claims(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id),
    INDEX idx_payment_status (payment_status)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 9: adjuster_handoffs  (A7 – Adjuster Handoff Agent)
-- ============================================================
CREATE TABLE IF NOT EXISTS adjuster_handoffs (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    claim_id            INT UNSIGNED NOT NULL,
    adjuster_id         INT UNSIGNED NOT NULL,
    handoff_reason      ENUM('complex','fraud_suspected','high_value','edge_case','manual_request') NOT NULL,
    reasoning_trace     LONGTEXT,          -- full agent reasoning/chain-of-thought
    documents_package   JSON,              -- list of attached doc paths
    priority            ENUM('normal','urgent','critical') NOT NULL DEFAULT 'normal',
    adjuster_status     ENUM('pending','in_review','approved','rejected','returned') NOT NULL DEFAULT 'pending',
    adjuster_notes      TEXT,
    adjuster_decision   ENUM('approve_settlement','reject_claim','refer_siu','request_more_info'),
    decided_at          DATETIME,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (claim_id)    REFERENCES claims(id) ON DELETE CASCADE,
    FOREIGN KEY (adjuster_id) REFERENCES users(id),
    INDEX idx_adjuster (adjuster_id),
    INDEX idx_claim (claim_id)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 10: siu_investigations  (SIU Investigator persona)
-- ============================================================
CREATE TABLE IF NOT EXISTS siu_investigations (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    claim_id            INT UNSIGNED NOT NULL,
    investigator_id     INT UNSIGNED NOT NULL,
    investigation_type  ENUM('fraud','identity','staged_accident','exaggerated','other') NOT NULL DEFAULT 'fraud',
    evidence_collected  JSON,
    findings            LONGTEXT,
    recommendation      ENUM('proceed_settlement','reject_claim','refer_prosecution','close_unfounded') ,
    status              ENUM('open','in_progress','closed') NOT NULL DEFAULT 'open',
    opened_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at           DATETIME,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (claim_id)        REFERENCES claims(id) ON DELETE CASCADE,
    FOREIGN KEY (investigator_id) REFERENCES users(id),
    INDEX idx_claim (claim_id)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 11: chat_sessions  (A8 – Claimant Chatbot Agent)
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    claim_id            INT UNSIGNED,
    user_id             INT UNSIGNED NOT NULL,
    session_token       VARCHAR(100) NOT NULL UNIQUE,
    channel             ENUM('web','mobile','whatsapp','email') NOT NULL DEFAULT 'web',
    status              ENUM('active','closed') NOT NULL DEFAULT 'active',
    started_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at            DATETIME,
    FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chat_messages (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id          INT UNSIGNED NOT NULL,
    sender              ENUM('user','agent') NOT NULL,
    message             TEXT NOT NULL,
    intent_detected     VARCHAR(100),
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    INDEX idx_session (session_id)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 12: agent_workflow_runs  (A1 Orchestrator — state tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_workflow_runs (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    claim_id            INT UNSIGNED NOT NULL,
    agent_name          VARCHAR(50) NOT NULL,   -- A1..A8
    agent_step          VARCHAR(100),
    status              ENUM('queued','running','success','failed','skipped') NOT NULL DEFAULT 'queued',
    input_payload       JSON,
    output_payload      JSON,
    error_message       TEXT,
    token_usage         INT UNSIGNED,
    latency_ms          INT UNSIGNED,
    started_at          DATETIME,
    completed_at        DATETIME,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
    INDEX idx_claim (claim_id),
    INDEX idx_agent (agent_name),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 13: audit_logs  (immutable audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_type          VARCHAR(100) NOT NULL,
    actor_id            INT UNSIGNED,           -- user or NULL for agent
    actor_type          ENUM('user','agent','system') NOT NULL DEFAULT 'user',
    claim_id            INT UNSIGNED,
    resource_type       VARCHAR(50),
    resource_id         INT UNSIGNED,
    old_value           JSON,
    new_value           JSON,
    ip_address          VARCHAR(45),
    user_agent          VARCHAR(500),
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_event (event_type),
    INDEX idx_claim (claim_id),
    INDEX idx_actor (actor_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 14: kpi_snapshots  (Supervisor dashboard metrics)
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_snapshots (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    snapshot_date           DATE NOT NULL,
    total_claims            INT UNSIGNED NOT NULL DEFAULT 0,
    auto_settled            INT UNSIGNED NOT NULL DEFAULT 0,
    escalated_adjuster      INT UNSIGNED NOT NULL DEFAULT 0,
    escalated_siu           INT UNSIGNED NOT NULL DEFAULT 0,
    rejected                INT UNSIGNED NOT NULL DEFAULT 0,
    stp_rate                DECIMAL(5,4),       -- straight-through processing rate
    avg_tat_minutes         DECIMAL(10,2),      -- avg turnaround time
    avg_fraud_score         DECIMAL(5,4),
    csat_score              DECIMAL(3,2),
    tool_call_success_rate  DECIMAL(5,4),
    p95_latency_ms          INT UNSIGNED,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_date (snapshot_date)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 15: system_health  (IT/Ops monitoring)
-- ============================================================
CREATE TABLE IF NOT EXISTS system_health (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    service_name        VARCHAR(100) NOT NULL,
    status              ENUM('healthy','degraded','down') NOT NULL DEFAULT 'healthy',
    response_time_ms    INT UNSIGNED,
    error_rate          DECIMAL(5,4),
    cpu_usage           DECIMAL(5,2),
    memory_usage        DECIMAL(5,2),
    checked_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_service (service_name),
    INDEX idx_checked (checked_at)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 16: notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id             INT UNSIGNED NOT NULL,
    claim_id            INT UNSIGNED,
    type                ENUM('email','sms','push','in_app') NOT NULL DEFAULT 'in_app',
    title               VARCHAR(255) NOT NULL,
    message             TEXT NOT NULL,
    is_read             TINYINT(1) NOT NULL DEFAULT 0,
    sent_at             DATETIME,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE SET NULL,
    INDEX idx_user (user_id),
    INDEX idx_is_read (is_read)
) ENGINE=InnoDB;
