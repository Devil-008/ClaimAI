"""
migrate_doc_rejection.py
Adds document rejection workflow tables/columns to the ClaimAI database.

Run once:
    python migrate_doc_rejection.py
"""
import sys
from sqlalchemy import text
from app.database.connection import engine

MIGRATIONS = [
    # 1. Add documents_rejected status to claims.status ENUM
    """
    ALTER TABLE claims
    MODIFY COLUMN status ENUM(
        'fnol_received',
        'coverage_verification',
        'damage_assessment',
        'fraud_scoring',
        'settlement_pending',
        'settled',
        'escalated_adjuster',
        'escalated_siu',
        'rejected',
        'closed',
        'documents_required',
        'documents_rejected'
    ) NOT NULL DEFAULT 'fnol_received'
    """,

    # 2. Add rejection tracking columns to claims
    """
    ALTER TABLE claims
    ADD COLUMN IF NOT EXISTS document_rejection_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS document_rejection_message TEXT,
    ADD COLUMN IF NOT EXISTS status_before_doc_rejection VARCHAR(50)
    """,

    # 3. Add rejection tracking columns to claim_documents
    """
    ALTER TABLE claim_documents
    ADD COLUMN IF NOT EXISTS is_rejected TINYINT(1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS rejected_at DATETIME
    """,

    # 4. Create system_config table
    """
    CREATE TABLE IF NOT EXISTS system_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_key VARCHAR(100) NOT NULL UNIQUE,
        config_value VARCHAR(500) NOT NULL,
        value_type ENUM('int', 'float', 'str', 'bool') DEFAULT 'str',
        description VARCHAR(500),
        updated_by INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_config_key (config_key)
    )
    """,

    # 5. Seed default config values
    """
    INSERT IGNORE INTO system_config (config_key, config_value, value_type, description)
    VALUES
        ('max_document_requests',   '3', 'int', 'Max times adjuster can request more documents before SIU escalation'),
        ('max_document_rejections', '3', 'int', 'Max times adjuster can reject submitted documents before SIU escalation'),
        ('escalation_target_role',  'siu_investigator', 'str', 'Role to escalate to when limits are exceeded'),
        ('auto_reject_after_days',  '30', 'int', 'Days of claimant inaction before auto-rejection (0 = disabled)')
    """,
]


def run():
    print("🚀 Running ClaimAI doc-rejection migration...")
    with engine.connect() as conn:
        for i, sql in enumerate(MIGRATIONS, 1):
            try:
                conn.execute(text(sql.strip()))
                conn.commit()
                print(f"  ✅ Step {i} done")
            except Exception as e:
                print(f"  ⚠️  Step {i} warning (may already exist): {e}")
    print("✅ Migration complete.")


if __name__ == "__main__":
    run()
