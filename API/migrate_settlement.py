"""
Run this once to add payment timeline columns to settlements table.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database.connection import engine
from sqlalchemy import text

with engine.connect() as conn:
    for col, ddl in [
        ("payment_initiated_at", "DATETIME NULL"),
        ("payment_expected_by",  "DATETIME NULL"),
    ]:
        try:
            conn.execute(text(f"ALTER TABLE settlements ADD COLUMN {col} {ddl}"))
            print(f"✅ Added column: {col}")
        except Exception as e:
            print(f"⚠  {col}: {e}")
    conn.commit()

print("Migration complete.")
