from __future__ import annotations

import threading
import time

from app.database.connection import SessionLocal
from app.services.email_escalation_service import (
    get_or_create_email_config,
    process_escalation_timeouts,
)

_monitor_started = False
_monitor_lock = threading.Lock()


def _run_monitor_loop() -> None:
    while True:
        session = SessionLocal()
        try:
            process_escalation_timeouts(session)
            config = get_or_create_email_config(session)
            sleep_for = max(int(config.check_interval_seconds or 15), 5)
        except Exception:
            session.rollback()
            sleep_for = 15
        finally:
            session.close()
        time.sleep(sleep_for)


def start_escalation_monitor() -> None:
    global _monitor_started
    with _monitor_lock:
        if _monitor_started:
            return
        thread = threading.Thread(
            target=_run_monitor_loop, daemon=True, name="escalation-monitor"
        )
        thread.start()
        _monitor_started = True
