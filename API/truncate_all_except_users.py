"""
truncate_all_except_users.py
────────────────────────────
Truncates ALL tables EXCEPT `users`.
Run once to reset the DB before loading fresh demo data.

Usage:
    python truncate_all_except_users.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database.connection import engine
from sqlalchemy import text

# Order matters — child tables first to avoid FK constraint errors
TABLES_TO_CLEAR = [
    "notifications",
    "audit_logs",
    "pipeline_traces",
    "fraud_risk_scores",
    "damage_assessments",
    "settlements",
    "fnol_submissions",
    "claims",
    "policies",
    "kpi_snapshots",
    "system_health",
    "knowledge_documents",
]

with engine.connect() as conn:
    conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
    print("FK checks disabled.\n")

    for table in TABLES_TO_CLEAR:
        try:
            conn.execute(text(f"TRUNCATE TABLE `{table}`"))
            print(f"  ✅ TRUNCATED  {table}")
        except Exception as e:
            print(f"  ⚠  SKIPPED    {table}  →  {e}")

    conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
    conn.commit()
    print("\nFK checks re-enabled. All done.")
    print("\n✔ users table was NOT touched — all logins still work.")
