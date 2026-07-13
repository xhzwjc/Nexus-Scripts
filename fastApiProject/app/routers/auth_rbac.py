import json
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from .. import database
from ..database import get_db
from ..rbac_schemas import (
    ScriptHubDeleteResponse,
    ScriptHubOrganizationCreateRequest,
    ScriptHubOrganizationUsersResponse,
    ScriptHubOrganizationMutationResponse,
    ScriptHubOrganizationUpdateRequest,
    ScriptHubAdminUserSchema,
    ScriptHubRbacAuditLogsResponse,
    ScriptHubRbacCatalogSchema,
    ScriptHubRbacOrganizationsResponse,
    ScriptHubRbacOverviewResponse,
    ScriptHubRbacRolesResponse,
    ScriptHubRbacSummaryResponse,
    ScriptHubRbacUsersResponse,
    ScriptHubRotateAccessKeyRequest,
    ScriptHubRoleCreateRequest,
    ScriptHubRoleMutationResponse,
    ScriptHubRoleUpdateRequest,
    ScriptHubUserCreateRequest,
    ScriptHubUserMutationResponse,
    ScriptHubUserUpdateRequest,
)
from ..script_hub_session import (
    create_script_hub_session,
    get_script_hub_token_from_request,
    require_script_hub_permission,
    validate_script_hub_session_access_key_version,
    verify_script_hub_session,
)
from ..services.script_hub_admin_service import (
    RbacMutationConflictError,
    create_organization,
    create_rbac_role,
    create_rbac_user,
    delete_organization,
    delete_rbac_role,
    delete_rbac_user,
    get_rbac_summary,
    get_rbac_user,
    get_org_users,
    list_rbac_audit_logs,
    list_rbac_catalog,
    list_rbac_organizations,
    list_rbac_overview,
    list_rbac_roles,
    list_rbac_users,
    soft_delete_organization,
    rotate_user_access_key,
    update_organization,
    update_rbac_role,
    update_rbac_user,
)
from ..services.script_hub_audit_service import sanitize_audit_payload, write_audit_log
from ..services.script_hub_auth_service import authenticate_access_key, get_session_user_by_code

logger = logging.getLogger(__name__)

auth_router = APIRouter(prefix="/auth", tags=["认证"])
rbac_router = APIRouter(prefix="/admin/rbac", tags=["权限管理"])


def _authenticate_access_key_with_owned_session(access_key: str) -> Optional[Dict[str, Any]]:
    db = database.SessionLocal()
    try:
        return authenticate_access_key(db, access_key)
    finally:
        db.close()


def _audit_details_from_payload(payload: Any) -> Dict[str, Any]:
    if payload is None:
        return {}
    if hasattr(payload, "model_dump"):
        return sanitize_audit_payload(payload.model_dump(exclude_none=True))
    if isinstance(payload, dict):
        return sanitize_audit_payload(payload)
    return {}


def _rbac_value_error_status(exc: ValueError) -> int:
    text = str(exc)
    boundary_markers = (
        "authorization boundary",
        "outside the actor data scope",
        "outside the actor authorization boundary",
        "not allowed to grant",
        "not allowed to manage",
        "exceeds actor",
    )
    return 403 if any(marker in text for marker in boundary_markers) else 400


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
async def create_auth_session(request: Request):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request body")

    key = str(body.get("key") or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="Missing access key")

    user = await run_in_threadpool(_authenticate_access_key_with_owned_session, key)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid access key")

    return create_script_hub_session(user)


@auth_router.get("/session")
def verify_auth_session(request: Request, db: Session = Depends(get_db)):
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
    validate_script_hub_session_access_key_version(session, user)

    return create_script_hub_session(user)


@rbac_router.get("/overview", response_model=ScriptHubRbacOverviewResponse)
def get_rbac_overview(
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    return list_rbac_overview(db, actor=session)


@rbac_router.get("/catalog", response_model=ScriptHubRbacCatalogSchema)
def get_rbac_catalog_endpoint(
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    return list_rbac_catalog(db, actor=session)


@rbac_router.get("/summary", response_model=ScriptHubRbacSummaryResponse)
def get_rbac_summary_endpoint(
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    return get_rbac_summary(db, actor=session)


@rbac_router.get("/users", response_model=ScriptHubRbacUsersResponse)
def list_rbac_users_endpoint(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    search: Optional[str] = Query(default=None, max_length=200),
    org_code: Optional[str] = Query(default=None, max_length=100),
    role_code: Optional[str] = Query(default=None, max_length=100),
    data_scope: Optional[str] = Query(default=None, max_length=40),
    is_active: Optional[bool] = Query(default=None),
    config_state: Optional[str] = Query(default=None, max_length=20),
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        return list_rbac_users(
            db,
            actor=session,
            page=page,
            page_size=page_size,
            search=search,
            org_code=org_code,
            role_code=role_code,
            data_scope=data_scope,
            is_active=is_active,
            config_state=config_state,
        )
    except ValueError as exc:
        raise HTTPException(status_code=_rbac_value_error_status(exc), detail=str(exc))


@rbac_router.get("/users/{user_code}", response_model=ScriptHubAdminUserSchema)
def get_rbac_user_endpoint(
    user_code: str,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        return get_rbac_user(db, user_code, actor=session)
    except ValueError as exc:
        status_code = 404 if str(exc) == "User not found" else _rbac_value_error_status(exc)
        raise HTTPException(status_code=status_code, detail=str(exc))


@rbac_router.get("/roles", response_model=ScriptHubRbacRolesResponse)
def list_rbac_roles_endpoint(
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    return list_rbac_roles(db)


@rbac_router.get("/organizations", response_model=ScriptHubRbacOrganizationsResponse)
def list_rbac_organizations_endpoint(
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    return list_rbac_organizations(db, actor=session)


@rbac_router.get("/audit-logs", response_model=ScriptHubRbacAuditLogsResponse)
def list_rbac_audit_logs_endpoint(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    search: Optional[str] = Query(default=None, max_length=200),
    actor: Optional[str] = Query(default=None, max_length=100),
    action: Optional[str] = Query(default=None, max_length=100),
    target_type: Optional[str] = Query(default=None, max_length=50),
    result: Optional[str] = Query(default=None, max_length=20),
    sensitivity: Optional[str] = Query(default=None, max_length=40),
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    return list_rbac_audit_logs(
        db,
        actor=session,
        page=page,
        page_size=page_size,
        search=search,
        actor_search=actor,
        action=action,
        target_type=target_type,
        result=result,
        sensitivity=sensitivity,
    )


@rbac_router.post("/users", response_model=ScriptHubUserMutationResponse)
async def create_rbac_user_endpoint(
    request: Request,
    payload: ScriptHubUserCreateRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        user, generated_access_key = create_rbac_user(
            db,
            actor=session,
            user_code=payload.user_code,
            display_name=payload.display_name,
            access_key=payload.access_key,
            primary_org_code=payload.primary_org_code,
            data_scope=payload.data_scope,
            custom_org_codes=payload.custom_org_codes,
            authorization_boundary=payload.authorization_boundary,
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
            target_org_code=user.get("primary_org_code"),
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
        raise HTTPException(status_code=_rbac_value_error_status(exc), detail=str(exc))


@rbac_router.post("/roles", response_model=ScriptHubRoleMutationResponse)
async def create_rbac_role_endpoint(
    request: Request,
    payload: ScriptHubRoleCreateRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        role = create_rbac_role(
            db,
            actor=session,
            code=payload.code,
            name=payload.name,
            description=payload.description,
            permission_keys=payload.permission_keys,
            landing_page=payload.landing_page,
            recruitment_menu_grouped=payload.recruitment_menu_grouped,
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
        raise HTTPException(status_code=_rbac_value_error_status(exc), detail=str(exc))


@rbac_router.post("/organizations", response_model=ScriptHubOrganizationMutationResponse)
async def create_rbac_organization_endpoint(
    request: Request,
    payload: ScriptHubOrganizationCreateRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        organization = create_organization(
            db,
            actor=session,
            org_code=payload.org_code,
            name=payload.name,
            org_type=payload.org_type,
            parent_org_code=payload.parent_org_code,
            sort_order=payload.sort_order,
            is_active=payload.is_active,
        )
        write_audit_log(
            db,
            actor=session,
            request=request,
            action="organization.create",
            target_type="organization",
            target_code=organization["org_code"],
            target_org_code=organization["org_code"],
            details=_audit_details_from_payload(payload),
        )
        return {"organization": organization}
    except ValueError as exc:
        _write_failed_audit_log(
            db=db,
            actor=session,
            request=request,
            action="organization.create",
            target_type="organization",
            target_code=payload.org_code,
            details=_audit_details_from_payload(payload),
            error=str(exc),
        )
        raise HTTPException(status_code=_rbac_value_error_status(exc), detail=str(exc))


@rbac_router.patch("/users/{user_code}", response_model=ScriptHubUserMutationResponse)
async def update_rbac_user_endpoint(
    request: Request,
    user_code: str,
    payload: ScriptHubUserUpdateRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        user = update_rbac_user(
            db,
            user_code,
            actor=session,
            expected_permission_version=payload.expected_permission_version,
            data_scope_downgrade_confirmed=payload.data_scope_downgrade_confirmed,
            display_name=payload.display_name,
            primary_org_code=payload.primary_org_code,
            data_scope=payload.data_scope,
            custom_org_codes=payload.custom_org_codes,
            authorization_boundary=payload.authorization_boundary,
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
            target_org_code=user.get("primary_org_code"),
            details=_audit_details_from_payload(payload),
        )
        return {
            "user": user,
            "generated_access_key": None,
        }
    except RbacMutationConflictError as exc:
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
        raise HTTPException(status_code=409, detail=str(exc))
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
        raise HTTPException(status_code=_rbac_value_error_status(exc), detail=str(exc))


@rbac_router.patch("/organizations/{org_code}", response_model=ScriptHubOrganizationMutationResponse)
async def update_rbac_organization_endpoint(
    request: Request,
    org_code: str,
    payload: ScriptHubOrganizationUpdateRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        organization = update_organization(
            db,
            org_code,
            actor=session,
            name=payload.name,
            org_type=payload.org_type,
            parent_org_code=payload.parent_org_code,
            sort_order=payload.sort_order,
            is_active=payload.is_active,
        )
        write_audit_log(
            db,
            actor=session,
            request=request,
            action="organization.update",
            target_type="organization",
            target_code=organization["org_code"],
            target_org_code=organization["org_code"],
            details=_audit_details_from_payload(payload),
        )
        return {"organization": organization}
    except ValueError as exc:
        _write_failed_audit_log(
            db=db,
            actor=session,
            request=request,
            action="organization.update",
            target_type="organization",
            target_code=org_code,
            details=_audit_details_from_payload(payload),
            error=str(exc),
        )
        raise HTTPException(status_code=_rbac_value_error_status(exc), detail=str(exc))


@rbac_router.patch("/roles/{role_code}", response_model=ScriptHubRoleMutationResponse)
async def update_rbac_role_endpoint(
    request: Request,
    role_code: str,
    payload: ScriptHubRoleUpdateRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        role = update_rbac_role(
            db,
            role_code,
            actor=session,
            name=payload.name,
            description=payload.description,
            permission_keys=payload.permission_keys,
            is_active=payload.is_active,
            landing_page=payload.landing_page,
            recruitment_menu_grouped=payload.recruitment_menu_grouped,
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
        raise HTTPException(status_code=_rbac_value_error_status(exc), detail=str(exc))


@rbac_router.post("/users/{user_code}/rotate-key", response_model=ScriptHubUserMutationResponse)
async def rotate_rbac_user_key_endpoint(
    request: Request,
    user_code: str,
    payload: ScriptHubRotateAccessKeyRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        user, generated_access_key = rotate_user_access_key(
            db,
            user_code,
            actor=session,
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
        raise HTTPException(status_code=_rbac_value_error_status(exc), detail=str(exc))


@rbac_router.delete("/users/{user_code}", response_model=ScriptHubDeleteResponse)
async def delete_rbac_user_endpoint(
    request: Request,
    user_code: str,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        deleted = delete_rbac_user(db, user_code, actor=session)
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
        raise HTTPException(status_code=_rbac_value_error_status(exc), detail=str(exc))


@rbac_router.delete("/organizations/{org_code}", response_model=ScriptHubDeleteResponse)
async def delete_rbac_organization_endpoint(
    request: Request,
    org_code: str,
    soft: bool = False,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        if soft:
            deleted = soft_delete_organization(db, org_code, actor=session)
            action = "organization.soft_delete"
            message = "Organization deleted"
        else:
            deleted = delete_organization(db, org_code, actor=session)
            action = "organization.delete"
            message = "Organization disabled"
        write_audit_log(
            db,
            actor=session,
            request=request,
            action=action,
            target_type="organization",
            target_code=deleted["org_code"],
            target_org_code=deleted["org_code"],
            details=deleted,
        )
        return {"message": message, "target_code": deleted["org_code"]}
    except ValueError as exc:
        _write_failed_audit_log(
            db=db,
            actor=session,
            request=request,
            action="organization.soft_delete" if soft else "organization.delete",
            target_type="organization",
            target_code=org_code,
            error=str(exc),
        )
        raise HTTPException(status_code=_rbac_value_error_status(exc), detail=str(exc))


@rbac_router.get(
    "/organizations/{org_code}/users",
    response_model=ScriptHubOrganizationUsersResponse,
    response_model_exclude_none=True,
)
def get_rbac_organization_users_endpoint(
    org_code: str,
    page: Optional[int] = Query(default=None, ge=1),
    page_size: Optional[int] = Query(default=None, ge=1, le=100),
    search: Optional[str] = Query(default=None, max_length=200),
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        return get_org_users(
            db,
            org_code,
            actor=session,
            page=page,
            page_size=page_size,
            search=search,
        )
    except ValueError as exc:
        raise HTTPException(status_code=_rbac_value_error_status(exc), detail=str(exc))


@rbac_router.delete("/roles/{role_code}", response_model=ScriptHubDeleteResponse)
async def delete_rbac_role_endpoint(
    request: Request,
    role_code: str,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("rbac-manage")),
):
    try:
        deleted = delete_rbac_role(db, role_code, actor=session)
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
        raise HTTPException(status_code=_rbac_value_error_status(exc), detail=str(exc))
