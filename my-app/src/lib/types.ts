import React from 'react';

// ============== 认证类型 ==============
export type Role = string;

export interface Permission {
    [scriptId: string]: boolean;
}

export interface User {
    id?: string;
    role: Role;
    roles?: string[];
    permissions: Permission;
    name?: string;
    isSuperAdmin?: boolean;
    primaryOrgCode?: string;
    dataScope?: string;
    customOrgCodes?: string[];
    authorizationBoundary?: Record<string, unknown>;
    permissionVersion?: number;
    accessKeyVersion?: number;
    teamResourcesLoginKeyEnabled?: boolean;
    landingPage?: '' | 'home' | 'welcome';
    recruitmentMenuGrouped?: boolean;
}

export type AccessControlView = 'overview' | 'organizations' | 'users' | 'roles' | 'resources' | 'audit';

export type DataScope = 'ALL' | 'ORG_AND_CHILDREN' | 'ORG_ONLY' | 'CUSTOM_ORGS' | 'SELF';

export interface AuthorizationBoundary {
    canGrant: boolean;
    manageableOrgCodes: string[];
    assignableRoleCodes: string[];
    assignablePermissionKeys: string[];
    maxDataScope: DataScope;
}

export type ResourceDomain = 'mail' | 'skill' | 'model';

export type ResourceKind = 'skill' | 'model' | 'mail-sender' | 'mail-recipient';

export type SharePolicy = 'PRIVATE' | 'SHARED_READONLY' | 'SHARED_COPYABLE' | 'PUBLIC_IN_GROUP';

export type ResourceStatus = 'active' | 'inactive' | 'draft' | 'disabled';

export interface ResourceListItem {
    id: string;
    rawId?: number | string;
    resourceKind?: ResourceKind;
    domain: ResourceDomain;
    name: string;
    ownerOrgCode: string;
    scopeLevel?: string | null;
    sharePolicy: SharePolicy;
    status: ResourceStatus;
    allowSubOrgUse?: boolean;
    allowCopy?: boolean;
    updatedAt?: string | null;
    description?: string | null;
}

export interface AccessControlUserViewModel {
    userCode: string;
    displayName: string;
    primaryOrgCode: string;
    primaryOrgName: string;
    roleCodes: string[];
    roleNames: string[];
    dataScope: DataScope;
    customOrgCodes: string[];
    configPermissionState: 'enabled' | 'partial' | 'none';
    isActive: boolean;
    isSuperAdmin: boolean;
    effectivePermissionCount: number;
    effectivePermissionKeys: string[];
    lastLoginAt?: string | null;
}

export interface ScriptHubPermissionDefinition {
    key: string;
    name: string;
    category: string;
    description: string;
    sort_order: number;
}

export interface ScriptHubRoleDefinition {
    code: string;
    name: string;
    description: string;
    sort_order: number;
    permission_keys: string[];
    is_system: boolean;
    is_active: boolean;
    assigned_user_count: number;
    landing_page: '' | 'home' | 'welcome';
    recruitment_menu_grouped: boolean;
}

export interface ScriptHubOrganizationDefinition {
    org_code: string;
    name: string;
    org_type: string;
    parent_org_code?: string | null;
    path: string;
    sort_order: number;
    is_active: boolean;
    is_deleted?: boolean;
}

export interface ScriptHubManagedUser {
    user_code: string;
    display_name: string;
    primary_org_code: string;
    data_scope: string;
    custom_org_codes: string[];
    authorization_boundary: Record<string, unknown>;
    permission_version: number;
    primary_role: string;
    role_codes: string[];
    role_permission_keys: string[];
    granted_overrides: string[];
    revoked_overrides: string[];
    effective_permission_keys: string[];
    team_resources_login_key_enabled: boolean;
    is_active: boolean;
    is_super_admin: boolean;
    notes?: string | null;
    last_login_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface ScriptHubAuditLogEntry {
    id: number;
    actor_user_code?: string | null;
    actor_display_name?: string | null;
    action: string;
    target_type: string;
    target_code: string;
    target_org_code?: string | null;
    sensitivity?: string | null;
    result: string;
    ip_address?: string | null;
    user_agent?: string | null;
    details: Record<string, unknown>;
    created_at?: string | null;
}

export interface ScriptHubRbacOverview {
    catalog: {
        permissions: ScriptHubPermissionDefinition[];
        roles: ScriptHubRoleDefinition[];
        organizations: ScriptHubOrganizationDefinition[];
    };
    users: ScriptHubManagedUser[];
    audit_logs: ScriptHubAuditLogEntry[];
}

// ============== 视图类型 ==============
export type ViewType = 'home' | 'welcome' | 'system' | 'script' | 'ocr-tool' | 'help' | 'dev-tools' | 'team-resources' | 'ai-resources' | 'ops-center' | 'agent-chat' | 'access-control' | 'ai-recruitment';

// ============== 脚本类型 ==============
export interface Script {
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
    status: 'active' | 'beta' | 'stable';
}

export interface SystemConfig {
    name: string;
    description: string;
    scripts: Script[];
}

// ============== 天气类型 ==============
export interface WeatherData {
    temp: number;
    desc: string;
    wind: number;
    humidity: number;
    code: string;
}

export interface WeatherState {
    loading: boolean;
    error?: string;
    data?: WeatherData;
}
