import sys
import os

# Add API to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database.connection import SessionLocal
from app.models.models import Notification, User, Claim

db = SessionLocal()
try:
    print("=== Users ===")
    users = db.query(User).all()
    for u in users:
        print(f"ID: {u.id} | Email: {u.email} | Role: {u.role} | Name: {u.full_name}")

    print("\n=== Claims ===")
    claims = db.query(Claim).all()
    for c in claims:
        print(f"ID: {c.id} | Claim #: {c.claim_number} | Type: {c.claim_type} | Status: {c.status}")

    print("\n=== Notifications ===")
    notifications = db.query(Notification).order_by(Notification.created_at.desc()).all()
    print(f"Total notifications: {len(notifications)}")
    for n in notifications[:10]:
        print(f"ID: {n.id} | User ID: {n.user_id} | Title: {n.title} | Read: {n.is_read} | Claim ID: {n.claim_id}")
finally:
    db.close()
