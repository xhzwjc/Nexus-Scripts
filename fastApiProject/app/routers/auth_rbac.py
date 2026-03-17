import json
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..rbac_schemas import (
    ScriptHubDeleteResponse,
    ScriptHubRbacOverviewResponse,
    ScriptHubRotateAccessKeyRequest,
    ScriptHubRoleCreateRequest,
    ScriptHubRoleMutationResponse,
    ScriptHubRoleUpdateRequest,
    ScriptHubUserCreateRequest,
    ScriptHubUserMutationResponse,
    ScriptHubUserUpdateRequest,
)
from ..schema_maintenance import ensure_script_hub_schema
from ..script_hub_session import (
    create_script_hub_session,
    get_script_hub_token_from_request,
    require_script_hub_permission,
    verify_script_hub_session,
)
from ..services.script_hub_admin_service import (
    create_rbac_role,
    create_rbac_user,
    delete_rbac_role,
    delete_rbac_user,
    list_rbac_overview,
    rotate_user_access_key,
    update_rbac_role,
    update_rbac_user,
)
from ..services.script_hub_audit_service import sanitize_audit_payload, write_audit_log
from ..services.script_hub_auth_service import authenticate_access_key, get_session_user_by_code

logger = logging.getLogger(__name__)

auth_router = APIRouter(prefix="/auth", tags=["认证"])
rbac_router = APIRouter(prefix="/admin/rbac", tags=["权限管理"])


def _audit_details_from_payload(payload: Any) -> Dict[str, Any]:
    if payload is None:
        return {}
    if hasattr(payload, "model_dump"):
        return sanitize_audit_payload(payload.model_dump(exclude_none=True))
    if isinstance(payload, dict):
        return sanitize_audit_payload(payload)
    return {}


def _write_failed_audit_log(
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
    payload = sanitize_audit_payload(details or {})
    payload["error"] = error

    try:
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
    except Exception:
        logger.warning(
            "[ScriptHubAudit] %s",
            json.dumps(
                {
                    "actor_user_code": (actor or {}).get("id"),
                    "action": action,
                    "target_type": target_type,
                    "target_code": target_code,
                    "result": "failed",
                    "details": payload,
                },
                ensure_ascii=False,
            ),
            exc_info=True,
        )


@auth_router.post("/session")
async def create_auth_session(request: Request, db: Session = Depends(get_db)):
    ensure_script_hub_schema()
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request body")

    key = str(body.get("key") or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="Missing access key")

    user = authenticate_access_key(db, key)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid access key")

    return create_script_hub_session(user)


@auth_router.get("/session")
async def verify_auth_session(request: Request, db: Session = Depends(get_db)):
    ensure_script_hub_schema()
    token = get_script_hub_token_from_request(request)
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    session = verify_script_hub_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user_code = str(session.get("id") or "").strip()
    if not user_code:
        raise HTTPException(status_code=401, detail="Invalid session payload")

    user = get_session_user_by_code(db, user_code)
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    return create_script_hub_session(user)


@rbac_router.get("/overview", response_model=ScriptHubRbacOverviewResponse)
async def get_rbac_overview(
    db: Session = Depends(get_db),
    _session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    ensure_script_hub_schema()
    return list_rbac_overview(db)


@rbac_router.post("/users", response_model=ScriptHubUserMutationResponse)
async def create_rbac_user_endpoint(
    request: Request,
    payload: ScriptHubUserCreateRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        ensure_script_hub_schema()
        user, generated_access_key = create_rbac_user(
            db,
            user_code=payload.user_code,
            display_name=payload.display_name,
            access_key=payload.access_key,
            role_codes=payload.role_codes,
            granted_permissions=payload.granted_permissions,
            revoked_permissions=payload.revoked_permissions,
            team_resources_login_key_enabled=payload.team_resources_login_key_enabled,
            is_active=payload.is_active,
            is_super_admin=payload.is_super_admin,
            notes=payload.notes,
        )
        write_audit_log(
            db,
            actor=session,
            request=request,
            action="user.create",
            target_type="user",
            target_code=user["user_code"],
            details=_audit_details_from_payload(payload),
        )
        return {
            "user": user,
            "generated_access_key": generated_access_key,
        }
    except ValueError as exc:
        _write_failed_audit_log(
            db=db,
            actor=session,
            request=request,
            action="user.create",
            target_type="user",
            target_code=payload.user_code,
            details=_audit_details_from_payload(payload),
            error=str(exc),
        )
        raise HTTPException(status_code=400, detail=str(exc))


@rbac_router.post("/roles", response_model=ScriptHubRoleMutationResponse)
async def create_rbac_role_endpoint(
    request: Request,
    payload: ScriptHubRoleCreateRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        ensure_script_hub_schema()
        role = create_rbac_role(
            db,
            code=payload.code,
            name=payload.name,
            description=payload.description,
            permission_keys=payload.permission_keys,
        )
        write_audit_log(
            db,
            actor=session,
            request=request,
            action="role.create",
            target_type="role",
            target_code=role["code"],
            details=_audit_details_from_payload(payload),
        )
        return {
            "role": role,
        }
    except ValueError as exc:
        _write_failed_audit_log(
            db=db,
            actor=session,
            request=request,
            action="role.create",
            target_type="role",
            target_code=payload.code,
            details=_audit_details_from_payload(payload),
            error=str(exc),
        )
        raise HTTPException(status_code=400, detail=str(exc))


@rbac_router.patch("/users/{user_code}", response_model=ScriptHubUserMutationResponse)
async def update_rbac_user_endpoint(
    request: Request,
    user_code: str,
    payload: ScriptHubUserUpdateRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        ensure_script_hub_schema()
        user = update_rbac_user(
            db,
            user_code,
            display_name=payload.display_name,
            role_codes=payload.role_codes,
            granted_permissions=payload.granted_permissions,
            revoked_permissions=payload.revoked_permissions,
            team_resources_login_key_enabled=payload.team_resources_login_key_enabled,
            is_active=payload.is_active,
            is_super_admin=payload.is_super_admin,
            notes=payload.notes,
        )
        write_audit_log(
            db,
            actor=session,
            request=request,
            action="user.update",
            target_type="user",
            target_code=user["user_code"],
            details=_audit_details_from_payload(payload),
        )
        return {
            "user": user,
            "generated_access_key": None,
        }
    except ValueError as exc:
        _write_failed_audit_log(
            db=db,
            actor=session,
            request=request,
            action="user.update",
            target_type="user",
            target_code=user_code,
            details=_audit_details_from_payload(payload),
            error=str(exc),
        )
        raise HTTPException(status_code=400, detail=str(exc))


@rbac_router.patch("/roles/{role_code}", response_model=ScriptHubRoleMutationResponse)
async def update_rbac_role_endpoint(
    request: Request,
    role_code: str,
    payload: ScriptHubRoleUpdateRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        ensure_script_hub_schema()
        role = update_rbac_role(
            db,
            role_code,
            name=payload.name,
            description=payload.description,
            permission_keys=payload.permission_keys,
            is_active=payload.is_active,
        )
        write_audit_log(
            db,
            actor=session,
            request=request,
            action="role.update",
            target_type="role",
            target_code=role["code"],
            details=_audit_details_from_payload(payload),
        )
        return {
            "role": role,
        }
    except ValueError as exc:
        _write_failed_audit_log(
            db=db,
            actor=session,
            request=request,
            action="role.update",
            target_type="role",
            target_code=role_code,
            details=_audit_details_from_payload(payload),
            error=str(exc),
        )
        raise HTTPException(status_code=400, detail=str(exc))


@rbac_router.post("/users/{user_code}/rotate-key", response_model=ScriptHubUserMutationResponse)
async def rotate_rbac_user_key_endpoint(
    request: Request,
    user_code: str,
    payload: ScriptHubRotateAccessKeyRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        ensure_script_hub_schema()
        user, generated_access_key = rotate_user_access_key(
            db,
            user_code,
            access_key=payload.access_key,
        )
        write_audit_log(
            db,
            actor=session,
            request=request,
            action="user.rotate_key",
            target_type="user",
            target_code=user["user_code"],
            details={"custom_key_provided": bool(payload.access_key)},
        )
        return {
            "user": user,
            "generated_access_key": generated_access_key,
        }
    except ValueError as exc:
        _write_failed_audit_log(
            db=db,
            actor=session,
            request=request,
            action="user.rotate_key",
            target_type="user",
            target_code=user_code,
            details={"custom_key_provided": bool(payload.access_key)},
            error=str(exc),
        )
        raise HTTPException(status_code=400, detail=str(exc))


@rbac_router.delete("/users/{user_code}", response_model=ScriptHubDeleteResponse)
async def delete_rbac_user_endpoint(
    request: Request,
    user_code: str,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        ensure_script_hub_schema()
        deleted = delete_rbac_user(db, user_code)
        write_audit_log(
            db,
            actor=session,
            request=request,
            action="user.delete",
            target_type="user",
            target_code=deleted["user_code"],
            details=deleted,
        )
        return {"message": "User deleted", "target_code": deleted["user_code"]}
    except ValueError as exc:
        _write_failed_audit_log(
            db=db,
            actor=session,
            request=request,
            action="user.delete",
            target_type="user",
            target_code=user_code,
            error=str(exc),
        )
        raise HTTPException(status_code=400, detail=str(exc))


@rbac_router.delete("/roles/{role_code}", response_model=ScriptHubDeleteResponse)
async def delete_rbac_role_endpoint(
    request: Request,
    role_code: str,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        ensure_script_hub_schema()
        deleted = delete_rbac_role(db, role_code)
        write_audit_log(
            db,
            actor=session,
            request=request,
            action="role.delete",
            target_type="role",
            target_code=deleted["code"],
            details=deleted,
        )
        return {"message": "Role deleted", "target_code": deleted["code"]}
    except ValueError as exc:
        _write_failed_audit_log(
            db=db,
            actor=session,
            request=request,
            action="role.delete",
            target_type="role",
            target_code=role_code,
            error=str(exc),
        )
        raise HTTPException(status_code=400, detail=str(exc))
