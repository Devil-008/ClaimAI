from __future__ import annotations

import smtplib
import ssl
from datetime import datetime, timedelta
from email.message import EmailMessage
from typing import Optional, Tuple

import logging
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import Claim, EmailConfig, EmailLog, Notification, User

ESCALATION_ROLE_CHAIN = {
    # Adjuster timeout escalates to SIU first, then supervisor, then IT/Ops.
    "escalated_adjuster": ["adjuster", "siu_investigator", "supervisor", "it_ops"],
    "escalated_siu": ["siu_investigator", "supervisor", "it_ops"],
}


def _default_from_value() -> tuple[str, str]:
    raw_value = settings.SMTP_FROM.strip()
    if "<" in raw_value and raw_value.endswith(">"):
        name, email = raw_value.split("<", 1)
        return name.strip().strip('"'), email[:-1].strip()
    return raw_value, settings.SMTP_USER


def get_or_create_email_config(db: Session) -> EmailConfig:
    config = (
        db.query(EmailConfig)
        .filter(EmailConfig.config_name == "default", EmailConfig.is_active == True)
        .first()
    )
    if config:
        return config

    from_name, from_email = _default_from_value()
    config = EmailConfig(
        config_name="default",
        smtp_host=settings.SMTP_HOST,
        smtp_port=settings.SMTP_PORT,
        smtp_user=settings.SMTP_USER,
        smtp_password=settings.SMTP_PASSWORD,
        smtp_from=settings.SMTP_FROM or f"{from_name} <{from_email}>",
        smtp_use_tls=settings.SMTP_USE_TLS,
        maintenance_minutes=settings.ESCALATION_MAINTENANCE_MINUTES,
        check_interval_seconds=settings.ESCALATION_CHECK_INTERVAL_SECONDS,
        is_active=True,
    )
    db.add(config)
    db.flush()
    return config


def _first_active_user_by_role(db: Session, role: str) -> Optional[User]:
    return (
        db.query(User)
        .filter(User.role == role, User.is_active == True)
        .order_by(User.id.asc())
        .first()
    )


def _resolve_recipient(
    db: Session, claim: Claim
) -> Tuple[Optional[User], str, Optional[str]]:
    roles = ESCALATION_ROLE_CHAIN.get(claim.status, ["supervisor", "it_ops"])
    level = max(int(claim.escalation_level or 0), 0)
    if level >= len(roles):
        level = len(roles) - 1
    target_role = roles[level]

    if target_role == "adjuster" and claim.assigned_adjuster:
        recipient = db.query(User).filter(User.id == claim.assigned_adjuster).first()
    elif target_role == "siu_investigator" and claim.assigned_siu:
        recipient = db.query(User).filter(User.id == claim.assigned_siu).first()
    else:
        recipient = _first_active_user_by_role(db, target_role)

    if recipient:
        return recipient, target_role, recipient.email
    return None, target_role, None


def _claimant_recipient(db: Session, claim: Claim) -> Optional[User]:
    return (
        db.query(User)
        .filter(User.id == claim.claimant_id, User.is_active == True)
        .first()
    )


def _email_subject(claim: Claim, recipient_role: str, escalation_level: int) -> str:
    if escalation_level == 0:
        return f"Claim {claim.claim_number} needs action from {recipient_role.replace('_', ' ').title()}"
    return f"Escalated claim {claim.claim_number} requires higher-persona review"


def _email_body(
    claim: Claim,
    recipient: Optional[User],
    recipient_role: str,
    escalation_level: int,
    deadline_at: datetime,
) -> str:
    assignee_name = (
        recipient.full_name if recipient else recipient_role.replace("_", " ").title()
    )
    return (
        f"Hello {assignee_name},\n\n"
        f"Claim {claim.claim_number} has been escalated with status '{claim.status}'.\n"
        f"Claim Type: {claim.claim_type.replace('_', ' ').title()}\n"
        f"Current Escalation Level: {escalation_level}\n"
        f"Action required by: {deadline_at.strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"
        f"Reason: {claim.incident_description or 'No reason supplied'}\n\n"
        f"Please review and take action. If no action is taken before the maintenance window expires, the claim will be escalated to the next persona.\n"
    )


def _email_html_body(
    claim: Claim,
    recipient: Optional[User],
    recipient_role: str,
    escalation_level: int,
    deadline_at: datetime,
) -> str:
    assignee_name = (
        recipient.full_name if recipient else recipient_role.replace("_", " ").title()
    )
    claim_type = claim.claim_type.replace("_", " ").title()
    reason = claim.incident_description or "No reason supplied"

    return f"""<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{claim.claim_number} escalation notice</title>
    </head>
    <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <div style="max-width:720px;margin:0 auto;padding:32px 16px;">
            <div style="background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#fff;border-radius:18px 18px 0 0;padding:28px 32px;">
                <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">Claim escalation notice</div>
                <h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;">{claim.claim_number} needs your review</h1>
                <p style="margin:10px 0 0;font-size:15px;line-height:1.6;opacity:.95;">A claim in your queue requires action before the maintenance window expires.</p>
            </div>

            <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 18px 18px;padding:32px;box-shadow:0 12px 40px rgba(15,23,42,.08);">
                <p style="margin:0 0 20px;font-size:16px;line-height:1.7;">Hello <strong>{assignee_name}</strong>,</p>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 24px;">
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px;">
                        <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">Claim number</div>
                        <div style="font-size:18px;font-weight:700;margin-top:6px;">{claim.claim_number}</div>
                    </div>
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px;">
                        <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">Current status</div>
                        <div style="font-size:18px;font-weight:700;margin-top:6px;">{claim.status.replace("_", " ").title()}</div>
                    </div>
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px;">
                        <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">Claim type</div>
                        <div style="font-size:18px;font-weight:700;margin-top:6px;">{claim_type}</div>
                    </div>
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px;">
                        <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">Escalation level</div>
                        <div style="font-size:18px;font-weight:700;margin-top:6px;">{escalation_level}</div>
                    </div>
                </div>

                <div style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:14px;padding:18px 20px;margin:0 0 24px;">
                    <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#1d4ed8;font-weight:700;">Action deadline</div>
                    <div style="font-size:18px;font-weight:700;margin-top:6px;color:#0f172a;">{deadline_at.strftime('%Y-%m-%d %H:%M:%S UTC')}</div>
                </div>

                <div style="margin:0 0 24px;">
                    <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700;margin-bottom:8px;">Reason</div>
                    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:18px;line-height:1.7;color:#9a3412;">{reason}</div>
                </div>

                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:18px;line-height:1.7;color:#334155;">
                    Please review and take action. If no action is taken before the maintenance window expires, the claim will be escalated to the next persona.
                </div>

                <p style="margin:24px 0 0;font-size:13px;color:#64748b;line-height:1.6;">
                    This is an automated message from ClaimAI.
                </p>
            </div>
        </div>
    </body>
</html>"""


def _send_smtp_email(
    config: EmailConfig,
    recipient_email: str,
    subject: str,
    body: str,
    html_body: Optional[str] = None,
) -> None:
    message = EmailMessage()
    message["From"] = config.smtp_from
    message["To"] = recipient_email
    message["Subject"] = subject
    message.set_content(body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    if config.smtp_use_tls:
        context = ssl.create_default_context()
        with smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=30) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            if config.smtp_user and config.smtp_password:
                server.login(config.smtp_user, config.smtp_password)
            server.send_message(message)
    else:
        with smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=30) as server:
            if config.smtp_user and config.smtp_password:
                server.login(config.smtp_user, config.smtp_password)
            server.send_message(message)


def notify_claim_escalation(
    db: Session, claim: Claim, event_type: str = "escalation_notice"
) -> Optional[EmailLog]:
    if claim.status not in ESCALATION_ROLE_CHAIN:
        return None

    config = get_or_create_email_config(db)
    recipient, recipient_role, recipient_email = _resolve_recipient(db, claim)
    escalation_level = int(claim.escalation_level or 0)
    deadline_at = datetime.utcnow() + timedelta(
        minutes=int(config.maintenance_minutes or 1)
    )
    role_chain = ESCALATION_ROLE_CHAIN[claim.status]
    source_role = role_chain[0]
    next_persona_role = role_chain[min(escalation_level + 1, len(role_chain) - 1)]

    if not recipient_email:
        log = EmailLog(
            claim_id=claim.id,
            claim_number=claim.claim_number,
            email_config_id=config.id,
            event_type=event_type,
            source_status=claim.status,
            source_role=source_role,
            recipient_user_id=recipient.id if recipient else None,
            recipient_name=recipient.full_name if recipient else None,
            recipient_role=recipient_role,
            recipient_email="",
            escalation_level=escalation_level,
            next_persona_role=next_persona_role,
            subject=_email_subject(claim, recipient_role, escalation_level),
            body="No active recipient available for escalation email.",
            smtp_host=config.smtp_host,
            smtp_port=config.smtp_port,
            smtp_user=config.smtp_user,
            smtp_from=config.smtp_from,
            smtp_use_tls=config.smtp_use_tls,
            status="failed",
            error_message=f"No active {recipient_role} user found",
            action_deadline_at=deadline_at,
            sent_at=datetime.utcnow(),
        )
        db.add(log)
        db.flush()
        return log

    subject = _email_subject(claim, recipient_role, escalation_level)
    body = _email_body(claim, recipient, recipient_role, escalation_level, deadline_at)
    html_body = _email_html_body(
        claim, recipient, recipient_role, escalation_level, deadline_at
    )

    existing = (
        db.query(EmailLog)
        .filter(
            EmailLog.claim_id == claim.id,
            EmailLog.escalation_level == escalation_level,
            EmailLog.event_type == event_type,
        )
        .first()
    )
    if existing and existing.status == "sent":
        return existing

    log = existing or EmailLog(
        claim_id=claim.id,
        claim_number=claim.claim_number,
        email_config_id=config.id,
        event_type=event_type,
        source_status=claim.status,
        source_role=recipient_role,
        recipient_user_id=recipient.id,
        recipient_name=recipient.full_name,
        recipient_role=recipient_role,
        recipient_email=recipient.email,
        escalation_level=escalation_level,
        next_persona_role=next_persona_role,
        subject=subject,
        body=body,
        smtp_host=config.smtp_host,
        smtp_port=config.smtp_port,
        smtp_user=config.smtp_user,
        smtp_from=config.smtp_from,
        smtp_use_tls=config.smtp_use_tls,
        status="queued",
        action_deadline_at=deadline_at,
    )
    db.add(log)
    db.flush()

    try:
        _send_smtp_email(config, recipient.email, subject, body, html_body)
        log.status = "sent"
        log.sent_at = datetime.utcnow()
        log.error_message = None
        claim.escalation_assignee_id = recipient.id
        claim.escalation_assignee_role = recipient.role
        claim.escalation_level = escalation_level
        claim.escalation_last_status = claim.status
        claim.escalation_last_notified_at = log.sent_at
        claim.escalation_next_check_at = deadline_at
        claim.escalation_started_at = claim.escalation_started_at or datetime.utcnow()
        db.add(
            Notification(
                user_id=recipient.id,
                title=f"Claim {claim.claim_number} escalation notice",
                message=subject,
                claim_id=claim.id,
                is_read=False,
            )
        )
    except Exception as exc:
        log.status = "failed"
        log.error_message = str(exc)
        log.sent_at = datetime.utcnow()
        logging.exception(
            "Failed to send escalation email for claim %s to %s",
            claim.claim_number,
            recipient.email,
        )

    db.flush()
    db.commit()
    return log


def notify_claimant_update(
    db: Session,
    claim: Claim,
    subject: str,
    body: str,
    event_type: str,
    source_status: Optional[str] = None,
    trigger_reason: Optional[str] = None,
) -> Optional[EmailLog]:
    config = get_or_create_email_config(db)
    recipient = _claimant_recipient(db, claim)
    now = datetime.utcnow()
    log_body = body if not trigger_reason else f"{body}\n\nReason: {trigger_reason}"

    if not recipient or not recipient.email:
        log = EmailLog(
            claim_id=claim.id,
            claim_number=claim.claim_number,
            email_config_id=config.id,
            event_type=event_type,
            source_status=source_status or claim.status,
            source_role="system",
            recipient_user_id=recipient.id if recipient else None,
            recipient_name=recipient.full_name if recipient else None,
            recipient_role="policyholder",
            recipient_email="",
            escalation_level=int(claim.escalation_level or 0),
            next_persona_role=None,
            subject=subject,
            body=log_body,
            smtp_host=config.smtp_host,
            smtp_port=config.smtp_port,
            smtp_user=config.smtp_user,
            smtp_from=config.smtp_from,
            smtp_use_tls=config.smtp_use_tls,
            status="failed",
            error_message="No active claimant found",
            action_deadline_at=None,
            sent_at=now,
        )
        db.add(log)
        db.commit()
        return log

    existing = (
        db.query(EmailLog)
        .filter(
            EmailLog.claim_id == claim.id,
            EmailLog.event_type == event_type,
        )
        .first()
    )
    if existing and existing.status == "sent":
        return existing

    log = existing or EmailLog(
        claim_id=claim.id,
        claim_number=claim.claim_number,
        email_config_id=config.id,
        event_type=event_type,
        source_status=source_status or claim.status,
        source_role="system",
        recipient_user_id=recipient.id,
        recipient_name=recipient.full_name,
        recipient_role="policyholder",
        recipient_email=recipient.email,
        escalation_level=int(claim.escalation_level or 0),
        next_persona_role=None,
        subject=subject,
        body=log_body,
        smtp_host=config.smtp_host,
        smtp_port=config.smtp_port,
        smtp_user=config.smtp_user,
        smtp_from=config.smtp_from,
        smtp_use_tls=config.smtp_use_tls,
        status="queued",
    )
    db.add(log)
    db.flush()

    try:
        _send_smtp_email(
            config, recipient.email, subject, log_body, log_body.replace("\n", "<br/>")
        )
        log.status = "sent"
        log.sent_at = now
        log.error_message = None
    except Exception as exc:
        log.status = "failed"
        log.error_message = str(exc)
        log.sent_at = now

    db.add(
        Notification(
            user_id=recipient.id,
            title=subject,
            message=body,
            claim_id=claim.id,
            is_read=False,
        )
    )
    

    db.commit()
    return log


def process_escalation_timeouts(db: Session) -> int:
    now = datetime.utcnow()
    processed = 0
    config = get_or_create_email_config(db)

    # Find claims that are in an escalatable status and are due for their next check
    claims = (
        db.query(Claim)
        .filter(
            Claim.status.in_(tuple(ESCALATION_ROLE_CHAIN.keys())),
            Claim.escalation_next_check_at != None,
            Claim.escalation_next_check_at <= now,
        )
        .all()
    )

    for claim in claims:
        try:
            current_level = int(claim.escalation_level or 0)
            next_level = current_level + 1

            # advance escalation level
            claim.escalation_level = next_level
            claim.escalation_last_notified_at = now
            claim.escalation_next_check_at = now + timedelta(
                minutes=int(config.maintenance_minutes or 1)
            )
            db.flush()

            # Trigger escalation notification to the next persona
            notify_claim_escalation(db, claim, event_type="timeout_escalation")

            # Also notify the claimant that their claim moved to the next review tier.
            notify_claimant_update(
                db,
                claim,
                subject=f"Claim {claim.claim_number} has been escalated",
                body=(
                    f"Hello,\n\n"
                    f"Your claim {claim.claim_number} has been escalated for further review.\n"
                    f"Current status: {claim.status.replace('_', ' ').title()}\n"
                    f"Escalation level: {next_level}\n"
                    f"We will update you once the next reviewer takes action.\n"
                ),
                event_type=f"timeout_claimant_notice_level_{next_level}",
                source_status=claim.status,
                trigger_reason="No action taken within the maintenance window",
            )
            processed += 1
        except Exception:
            logging.exception(
                "Error processing escalation timeout for claim %s", claim.claim_number
            )
            # continue with next claim
            continue

    db.commit()
    return processed
