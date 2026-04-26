from typing import Any, Dict, Optional

from fastapi import Request
from sqlalchemy.orm import Session

from .services.script_hub_audit_service import sanitize_audit_payload, write_audit_log


def audit_details(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return sanitize_audit_payload(payload or {})


def write_failed_audit_log(
    *,
    db: Session,
    actor: Optional[Dict[str, Any]],
    request: Optional[Request],
    action: str,
    target_type: str,
    target_code: str,
    details: Optional[Dict[str, Any]] = None,
    error: str,
) -> None:
    payload = audit_details(details)
    payload["error"] = error
    write_audit_log(
        db,
        actor=actor,
        request=request,
        action=action,
        target_type=target_type,
        target_code=target_code,
        result="failed",
        details=payload,
    )
