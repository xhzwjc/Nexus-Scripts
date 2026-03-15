from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from .database import Base


class ScriptHubPermission(Base):
    __tablename__ = "script_hub_permissions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    permission_key = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    category = Column(String(50), nullable=False)
    description = Column(Text)
    sort_order = Column(Integer, default=99)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ScriptHubRole(Base):
    __tablename__ = "script_hub_roles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    role_code = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    sort_order = Column(Integer, default=99)
    is_system = Column(Boolean, default=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ScriptHubRolePermission(Base):
    __tablename__ = "script_hub_role_permissions"
    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_script_hub_role_permission"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    role_id = Column(Integer, ForeignKey("script_hub_roles.id"), nullable=False, index=True)
    permission_id = Column(Integer, ForeignKey("script_hub_permissions.id"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())


class ScriptHubUser(Base):
    __tablename__ = "script_hub_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_code = Column(String(100), unique=True, index=True, nullable=False)
    display_name = Column(String(100), nullable=False)
    access_key_lookup_hash = Column(String(64), unique=True, index=True, nullable=False)
    access_key_salt = Column(String(64), nullable=False)
    access_key_hash = Column(String(128), nullable=False)
    team_resources_access_enabled = Column(Boolean, default=True, nullable=False)
    is_super_admin = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime)
    notes = Column(Text)
    last_login_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ScriptHubUserRole(Base):
    __tablename__ = "script_hub_user_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "role_id", name="uq_script_hub_user_role"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("script_hub_users.id"), nullable=False, index=True)
    role_id = Column(Integer, ForeignKey("script_hub_roles.id"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())


class ScriptHubUserPermission(Base):
    __tablename__ = "script_hub_user_permissions"
    __table_args__ = (
        UniqueConstraint("user_id", "permission_id", name="uq_script_hub_user_permission"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("script_hub_users.id"), nullable=False, index=True)
    permission_id = Column(Integer, ForeignKey("script_hub_permissions.id"), nullable=False, index=True)
    is_granted = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ScriptHubAuditLog(Base):
    __tablename__ = "script_hub_audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    actor_user_code = Column(String(100), index=True)
    actor_display_name = Column(String(100))
    action = Column(String(100), nullable=False, index=True)
    target_type = Column(String(50), nullable=False, index=True)
    target_code = Column(String(100), nullable=False, index=True)
    result = Column(String(20), nullable=False, default="success")
    ip_address = Column(String(64))
    user_agent = Column(String(512))
    details = Column(Text)
    created_at = Column(DateTime, server_default=func.now(), index=True)
