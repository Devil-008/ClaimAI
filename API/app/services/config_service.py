"""
config_service.py
------------------
Helper to read/write SystemConfig values from the DB.
All values are cached per request (no persistent in-memory cache needed since
the DB is fast for these small lookups).
"""
from typing import Optional
from sqlalchemy.orm import Session
from app.models.models import SystemConfig


# ── Default fallback values (used if DB row is missing) ──────────
_DEFAULTS = {
    "max_document_requests":   3,
    "max_document_rejections": 3,
    "escalation_target_role":  "siu_investigator",
    "auto_reject_after_days":  30,
}


def get_config(db: Session, key: str) -> Optional[str]:
    """Return raw string value for a config key, or None if not found."""
    row = db.query(SystemConfig).filter(SystemConfig.config_key == key).first()
    return row.config_value if row else None


def get_int(db: Session, key: str) -> int:
    val = get_config(db, key)
    if val is not None:
        try:
            return int(val)
        except (ValueError, TypeError):
            pass
    default = _DEFAULTS.get(key, 0)
    return int(default)


def get_str(db: Session, key: str) -> str:
    val = get_config(db, key)
    if val is not None:
        return str(val)
    return str(_DEFAULTS.get(key, ""))


def set_config(db: Session, key: str, value: str, value_type: str = "str",
               description: Optional[str] = None, updated_by: Optional[int] = None) -> SystemConfig:
    """Upsert a config value."""
    row = db.query(SystemConfig).filter(SystemConfig.config_key == key).first()
    if row:
        row.config_value = str(value)
        if value_type:
            row.value_type = value_type
        if description:
            row.description = description
        if updated_by:
            row.updated_by = updated_by
    else:
        row = SystemConfig(
            config_key=key,
            config_value=str(value),
            value_type=value_type,
            description=description,
            updated_by=updated_by,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row
