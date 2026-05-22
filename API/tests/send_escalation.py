from app.database.connection import get_db
from app.models.models import Claim
from app.services.email_escalation_service import notify_claim_escalation


def main():
    db = next(get_db())
    try:
        claim = db.query(Claim).filter(Claim.claim_number == "CLM-2026-6638").first()
        if not claim:
            print("Claim CLM-2026-6638 not found")
            return
        print("Found claim:", claim.claim_number, claim.status)
        log = notify_claim_escalation(db, claim, event_type="manual_test_escalation")
        if log:
            print(
                "EmailLog:",
                getattr(log, "id", None),
                getattr(log, "status", None),
                getattr(log, "error_message", None),
            )
        else:
            print("notify_claim_escalation returned None")
    finally:
        try:
            db.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
