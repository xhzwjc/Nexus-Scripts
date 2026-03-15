import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


USER_CODE_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,99}$")
ROLE_CODE_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,99}$")


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


class ScriptHubAdminUserSchema(BaseModel):
    user_code: str
    display_name: str
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


class ScriptHubAuditLogSchema(BaseModel):
    id: int
    actor_user_code: Optional[str] = None
    actor_display_name: Optional[str] = None
    action: str
    target_type: str
    target_code: str
    result: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None


class ScriptHubRbacOverviewResponse(BaseModel):
    catalog: ScriptHubRbacCatalogSchema
    users: List[ScriptHubAdminUserSchema]
    audit_logs: List[ScriptHubAuditLogSchema]


class ScriptHubUserCreateRequest(BaseModel):
    user_code: str = Field(min_length=2, max_length=100)
    display_name: str = Field(min_length=1, max_length=100)
    access_key: Optional[str] = Field(default=None, max_length=255)
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

    @field_validator("role_codes", "granted_permissions", "revoked_permissions", mode="before")
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

    @field_validator("role_codes", "granted_permissions", "revoked_permissions", mode="before")
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
