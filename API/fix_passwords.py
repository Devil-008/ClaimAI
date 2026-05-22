"""
Fix: re-hash all user passwords properly.
Run from API/ directory with venv active:
    python fix_passwords.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bcrypt
from urllib.parse import quote_plus
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

PLAIN_PASSWORD = "password123"

def main():
    # 1. Generate a fresh bcrypt hash (no shell escaping involved)
    hashed = bcrypt.hashpw(PLAIN_PASSWORD.encode(), bcrypt.gensalt()).decode()
    print(f"Generated hash: {hashed}")

    # 2. Verify it works before writing to DB
    ok = bcrypt.checkpw(PLAIN_PASSWORD.encode(), hashed.encode())
    print(f"Self-verify: {'✅ PASS' if ok else '❌ FAIL'}")
    if not ok:
        print("ERROR: hash generation failed — aborting")
        sys.exit(1)

    # 3. Connect & update ALL users
    _pw = quote_plus(settings.DB_PASSWORD)
    url = (
        f"mysql+pymysql://{settings.DB_USER}:{_pw}"
        f"@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"
    )
    engine = create_engine(url)
    db = sessionmaker(bind=engine)()

    # Check what's currently stored (first user)
    row = db.execute(text("SELECT email, LEFT(password_hash,10) AS hash_prefix FROM users LIMIT 1")).fetchone()
    print(f"\nCurrent hash prefix for '{row.email}': {row.hash_prefix}...")

    result = db.execute(text("UPDATE users SET password_hash = :h"), {"h": hashed})
    db.commit()
    db.close()
    print(f"\n✅ Updated {result.rowcount} users. All passwords set to: {PLAIN_PASSWORD}")

if __name__ == "__main__":
    main()
