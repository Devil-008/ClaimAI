"""
Run this ONCE after running 01_schema.sql and 02_seed_data.sql in MySQL Workbench.
It re-hashes the placeholder passwords in the seed data with real bcrypt hashes.

Usage (from API/ directory):
    python agent/seed_passwords.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.connection import SessionLocal
from app.models.models import User
from app.core.security import hash_password

DEMO_PASSWORD = "password123"

def seed():
    db = SessionLocal()
    try:
        users = db.query(User).all()
        if not users:
            print("No users found. Run 02_seed_data.sql first.")
            return
        for u in users:
            u.password_hash = hash_password(DEMO_PASSWORD)
            print(f"  ✓ Hashed password for {u.email} ({u.role})")
        db.commit()
        print(f"\nDone. All {len(users)} users now have password: {DEMO_PASSWORD}")
    finally:
        db.close()

if __name__ == "__main__":
    seed()
