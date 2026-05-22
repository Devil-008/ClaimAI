"""
A8 — Claimant Chatbot / Notification Agent
Sends status updates to the claimant at key pipeline milestones.
In production: SMS / email / push via Twilio, SendGrid, FCM.
"""
from app.models.models import Claim
from datetime import datetime

MESSAGES = {
    "fnol_received":         "✅ Your claim {num} has been received. Our AI is processing it now.",
    "coverage_verification": "🔍 Coverage verification in progress for claim {num}.",
    "damage_assessment":     "📊 Damage assessment is underway for claim {num}.",
    "fraud_scoring":         "🛡 Risk analysis running for claim {num}. Almost there!",
    "settlement_pending":    "💰 Great news! Claim {num} has been approved. Settlement is being processed.",
    "escalated_adjuster":    "👤 Claim {num} has been referred to a human adjuster for review. We'll update you shortly.",
    "escalated_siu":         "🔒 Claim {num} requires additional investigation. Our SIU team will contact you.",
    "rejected":              "❌ Unfortunately, claim {num} could not be approved. Please contact support for details.",
    "settled":               "🎉 Claim {num} has been settled! Your payment is on its way.",
}

def notify(claim: Claim) -> dict:
    """Generate the notification message for the current claim status."""
    msg = MESSAGES.get(claim.status, f"Claim {claim.claim_number} status updated: {claim.status}")
    msg = msg.format(num=claim.claim_number)

    # In production: send via preferred channel
    # For now: return the message for logging / API response
    return {
        "agent":    "A8_Chatbot",
        "status":   "success",
        "channel":  "in_app",  # would be sms/email in prod
        "message":  msg,
        "sent_at":  datetime.utcnow().isoformat(),
    }
