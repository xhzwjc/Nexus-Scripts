import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


USER_CODE_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,99}$")
ROLE_CODE_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,99}$")
ORG_CODE_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,99}$")


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_string_list(values: Optional[List[str]]) -> Optional[List[str]]:
    if values is None:
        return None

    normalized: List[str] = []
    seen = set()
    for value in values:
        item = str(value or "").strip()
        if not item or item in seen:
            continue
        normalized.append(item)
        seen.add(item)
    return normalized


class ScriptHubAdminPermissionSchema(BaseModel):
    key: str
    name: str
    category: str
    description: str
    sort_order: int


class ScriptHubAdminRoleSchema(BaseModel):
    code: str
    name: str
    description: str
    sort_order: int
    permission_keys: List[str]
    is_system: bool
    is_active: bool
    assigned_user_count: int
    landing_page: str
    recruitment_menu_grouped: bool


class ScriptHubOrganizationSchema(BaseModel):
    org_code: str
    name: str
    org_type: str
    parent_org_code: Optional[str] = None
    path: str
    sort_order: int
    is_active: bool


class ScriptHubOrganizationCreateRequest(BaseModel):
    org_code: str = Field(min_length=2, max_length=100)
    name: str = Field(min_length=1, max_length=120)
    org_type: str = Field(default="company", max_length=50)
    parent_org_code: Optional[str] = Field(default="group", max_length=100)
    sort_order: int = Field(default=99, ge=0, le=9999)
    is_active: bool = True

    @field_validator("org_code")
    @classmethod
    def validate_org_code(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not ORG_CODE_RE.match(normalized):
            raise ValueError("Organization code must use lowercase letters, numbers, dots, underscores, or hyphens")
        return normalized

    @field_validator("name")
    @classmethod
    def validate_org_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Organization name is required")
        return normalized

    @field_validator("org_type")
    @classmethod
    def normalize_org_type(cls, value: str) -> str:
        normalized = str(value or "").strip().lower() or "company"
        allowed = {"group", "sub_group", "company", "department"}
        if normalized not in allowed:
            raise ValueError("Invalid organization type")
        return normalized

    @field_validator("parent_org_code", mode="before")
    @classmethod
    def normalize_parent_org_code(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_optional_text(value)


class ScriptHubOrganizationUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    org_type: Optional[str] = Field(default=None, max_length=50)
    parent_org_code: Optional[str] = Field(default=None, max_length=100)
    sort_order: Optional[int] = Field(default=None, ge=0, le=9999)
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def validate_updated_org_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("Organization name is required")
        return normalized

    @field_validator("org_type")
    @classmethod
    def normalize_updated_org_type(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value or "").strip().lower() or "company"
        allowed = {"group", "sub_group", "company", "department"}
        if normalized not in allowed:
            raise ValueError("Invalid organization type")
        return normalized

    @field_validator("parent_org_code", mode="before")
    @classmethod
    def normalize_updated_parent_org_code(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_optional_text(value)


class ScriptHubOrganizationMutationResponse(BaseModel):
    organization: ScriptHubOrganizationSchema


class ScriptHubAdminUserSchema(BaseModel):
    user_code: str
    display_name: str
    primary_org_code: str
    data_scope: str
    custom_org_codes: List[str]
    authorization_boundary: Dict[str, Any]
    permission_version: int
    primary_role: str
    role_codes: List[str]
    role_permission_keys: List[str]
    granted_overrides: List[str]
    revoked_overrides: List[str]
    effective_permission_keys: List[str]
    team_resources_login_key_enabled: bool
    is_active: bool
    is_super_admin: bool
    notes: Optional[str] = None
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ScriptHubRbacCatalogSchema(BaseModel):
    permissions: List[ScriptHubAdminPermissionSchema]
    roles: List[ScriptHubAdminRoleSchema]
    organizations: List[ScriptHubOrganizationSchema]


class ScriptHubAuditLogSchema(BaseModel):
    id: int
    actor_user_code: Optional[str] = None
    actor_display_name: Optional[str] = None
    action: str
    target_type: str
    target_code: str
    target_org_code: Optional[str] = None
    sensitivity: str = "normal"
    result: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None


class ScriptHubRbacOverviewResponse(BaseModel):
    catalog: ScriptHubRbacCatalogSchema
    users: List[ScriptHubAdminUserSchema]
    audit_logs: List[ScriptHubAuditLogSchema]


class ScriptHubRbacUsersResponse(BaseModel):
    items: List[ScriptHubAdminUserSchema]
    total: int
    page: int
    page_size: int


class ScriptHubRbacRolesResponse(BaseModel):
    items: List[ScriptHubAdminRoleSchema]
    total: int


class ScriptHubOrganizationDirectorySchema(ScriptHubOrganizationSchema):
    primary_user_count: int = 0


class ScriptHubRbacOrganizationsResponse(BaseModel):
    items: List[ScriptHubOrganizationDirectorySchema]
    total: int


class ScriptHubOrganizationUserItemSchema(BaseModel):
    user_code: str
    display_name: str
    is_active: bool


class ScriptHubOrganizationUsersResponse(BaseModel):
    org_code: str
    org_name: str
    primary_users: List[ScriptHubOrganizationUserItemSchema]
    data_scope_users: List[ScriptHubOrganizationUserItemSchema]
    primary_total_count: int
    data_scope_total_count: int
    total_count: int
    page: Optional[int] = None
    page_size: Optional[int] = None


class ScriptHubRbacAuditLogsResponse(BaseModel):
    items: List[ScriptHubAuditLogSchema]
    total: int
    page: int
    page_size: int
    target_types: List[str] = Field(default_factory=list)


class ScriptHubRbacHighRiskUserSchema(BaseModel):
    user_code: str
    display_name: str
    is_super_admin: bool
    effective_permission_keys: List[str]


class ScriptHubRbacSummaryResponse(BaseModel):
    user_count: int
    active_user_count: int
    role_count: int
    active_role_count: int
    system_role_count: int
    organization_count: int
    active_organization_count: int
    audit_log_count: int
    data_scope_counts: Dict[str, int]
    high_risk_user_count: int
    high_risk_users: List[ScriptHubRbacHighRiskUserSchema]


class ScriptHubUserCreateRequest(BaseModel):
    user_code: str = Field(min_length=2, max_length=100)
    display_name: str = Field(min_length=1, max_length=100)
    access_key: Optional[str] = Field(default=None, max_length=255)
    primary_org_code: str = Field(default="group", max_length=100)
    data_scope: str = Field(default="ORG_ONLY", max_length=40)
    custom_org_codes: List[str] = Field(default_factory=list)
    authorization_boundary: Dict[str, Any] = Field(default_factory=dict)
    role_codes: List[str] = Field(default_factory=list, min_length=1)
    granted_permissions: List[str] = Field(default_factory=list)
    revoked_permissions: List[str] = Field(default_factory=list)
    team_resources_login_key_enabled: bool = False
    is_active: bool = True
    is_super_admin: bool = False
    notes: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("user_code")
    @classmethod
    def validate_user_code(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not USER_CODE_RE.match(normalized):
            raise ValueError("User code must use lowercase letters, numbers, dots, underscores, or hyphens")
        return normalized

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Display name is required")
        return normalized

    @field_validator("access_key", "notes", mode="before")
    @classmethod
    def normalize_optional_fields(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_optional_text(value)

    @field_validator("primary_org_code")
    @classmethod
    def normalize_primary_org_code(cls, value: str) -> str:
        normalized = str(value or "").strip()
        return normalized or "group"

    @field_validator("data_scope")
    @classmethod
    def normalize_data_scope(cls, value: str) -> str:
        normalized = str(value or "").strip().upper() or "ORG_ONLY"
        allowed = {"ALL", "ORG_AND_CHILDREN", "ORG_ONLY", "CUSTOM_ORGS", "SELF"}
        if normalized not in allowed:
            raise ValueError("Invalid data scope")
        return normalized

    @field_validator("role_codes", "granted_permissions", "revoked_permissions", "custom_org_codes", mode="before")
    @classmethod
    def normalize_list_fields(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        return _normalize_string_list(value)

    @model_validator(mode="after")
    def validate_permission_overrides(self):
        overlap = sorted(set(self.granted_permissions) & set(self.revoked_permissions))
        if overlap:
            raise ValueError(f"Permissions cannot be both granted and revoked: {', '.join(overlap)}")
        return self


class ScriptHubUserUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    primary_org_code: Optional[str] = Field(default=None, max_length=100)
    data_scope: Optional[str] = Field(default=None, max_length=40)
    custom_org_codes: Optional[List[str]] = None
    authorization_boundary: Optional[Dict[str, Any]] = None
    expected_permission_version: Optional[int] = Field(default=None, ge=1)
    data_scope_downgrade_confirmed: bool = False
    role_codes: Optional[List[str]] = None
    granted_permissions: Optional[List[str]] = None
    revoked_permissions: Optional[List[str]] = None
    team_resources_login_key_enabled: Optional[bool] = None
    is_active: Optional[bool] = None
    is_super_admin: Optional[bool] = None
    notes: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("Display name is required")
        return normalized

    @field_validator("notes", mode="before")
    @classmethod
    def normalize_update_optional_fields(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_optional_text(value)

    @field_validator("primary_org_code")
    @classmethod
    def normalize_updated_primary_org_code(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value or "").strip()
        return normalized or "group"

    @field_validator("data_scope")
    @classmethod
    def normalize_updated_data_scope(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value or "").strip().upper() or "ORG_ONLY"
        allowed = {"ALL", "ORG_AND_CHILDREN", "ORG_ONLY", "CUSTOM_ORGS", "SELF"}
        if normalized not in allowed:
            raise ValueError("Invalid data scope")
        return normalized

    @field_validator("role_codes", "granted_permissions", "revoked_permissions", "custom_org_codes", mode="before")
    @classmethod
    def normalize_update_list_fields(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        return _normalize_string_list(value)

    @model_validator(mode="after")
    def validate_update_permission_overrides(self):
        if self.granted_permissions is None or self.revoked_permissions is None:
            return self
        overlap = sorted(set(self.granted_permissions) & set(self.revoked_permissions))
        if overlap:
            raise ValueError(f"Permissions cannot be both granted and revoked: {', '.join(overlap)}")
        return self


class ScriptHubRotateAccessKeyRequest(BaseModel):
    access_key: Optional[str] = Field(default=None, max_length=255)

    @field_validator("access_key", mode="before")
    @classmethod
    def normalize_rotate_access_key(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_optional_text(value)


class ScriptHubUserMutationResponse(BaseModel):
    user: ScriptHubAdminUserSchema
    generated_access_key: Optional[str] = None


class ScriptHubRoleCreateRequest(BaseModel):
    code: str = Field(min_length=2, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    permission_keys: List[str] = Field(default_factory=list, min_length=1)
    landing_page: str = Field(default="home", max_length=20)
    recruitment_menu_grouped: bool = True

    @field_validator("code")
    @classmethod
    def validate_role_code(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not ROLE_CODE_RE.match(normalized):
            raise ValueError("Role code must use lowercase letters, numbers, dots, underscores, or hyphens")
        return normalized

    @field_validator("name")
    @classmethod
    def validate_role_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Role name is required")
        return normalized

    @field_validator("description", mode="before")
    @classmethod
    def normalize_role_description(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_optional_text(value)

    @field_validator("permission_keys", mode="before")
    @classmethod
    def normalize_role_permissions(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        return _normalize_string_list(value)


class ScriptHubRoleUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    permission_keys: Optional[List[str]] = None
    is_active: Optional[bool] = None
    landing_page: Optional[str] = Field(default=None, max_length=20)
    recruitment_menu_grouped: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def validate_updated_role_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("Role name is required")
        return normalized

    @field_validator("description", mode="before")
    @classmethod
    def normalize_updated_role_description(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_optional_text(value)

    @field_validator("permission_keys", mode="before")
    @classmethod
    def normalize_updated_role_permissions(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        return _normalize_string_list(value)


class ScriptHubRoleMutationResponse(BaseModel):
    role: ScriptHubAdminRoleSchema


class ScriptHubDeleteResponse(BaseModel):
    message: str
    target_code: str
