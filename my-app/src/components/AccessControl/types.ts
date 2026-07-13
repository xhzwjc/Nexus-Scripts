import type {
    AuthorizationBoundary,
    DataScope,
    ScriptHubAuditLogEntry,
    ScriptHubManagedUser,
    ScriptHubOrganizationDefinition,
    ScriptHubPermissionDefinition,
    ScriptHubRoleDefinition,
} from '@/lib/types';

export interface RbacCatalogResponse {
    permissions: ScriptHubPermissionDefinition[];
    roles: ScriptHubRoleDefinition[];
    organizations: ScriptHubOrganizationDefinition[];
}

export interface RbacSummaryHighRiskUser {
    user_code: string;
    display_name: string;
    is_super_admin: boolean;
    effective_permission_keys: string[];
}

export interface RbacSummaryResponse {
    user_count: number;
    active_user_count: number;
    role_count: number;
    active_role_count: number;
    system_role_count: number;
    organization_count: number;
    active_organization_count: number;
    audit_log_count: number;
    data_scope_counts: Partial<Record<DataScope, number>>;
    high_risk_user_count: number;
    high_risk_users: RbacSummaryHighRiskUser[];
}

export interface RbacUsersResponse {
    items: ScriptHubManagedUser[];
    total: number;
    page: number;
    page_size: number;
}

export interface RbacRolesResponse {
    items: ScriptHubRoleDefinition[];
    total: number;
}

export interface RbacOrganizationsResponse {
    items: ScriptHubOrganizationDefinition[];
    total: number;
}

export interface RbacAuditLogsResponse {
    items: ScriptHubAuditLogEntry[];
    total: number;
    page: number;
    page_size: number;
    target_types?: string[];
}

export interface RbacOrganizationUserItem {
    user_code: string;
    display_name: string;
    is_active: boolean;
}

export interface RbacOrganizationUsersResponse {
    org_code: string;
    org_name: string;
    primary_users: RbacOrganizationUserItem[];
    data_scope_users: RbacOrganizationUserItem[];
    total_count: number;
    primary_total_count?: number;
    data_scope_total_count?: number;
    page?: number;
    page_size?: number;
}

export interface UserFormState {
    userCode: string;
    displayName: string;
    accessKey: string;
    primaryOrgCode: string;
    dataScope: DataScope;
    customOrgCodes: string[];
    authorizationBoundary: AuthorizationBoundary;
    dataScopeDowngradeConfirmed: boolean;
    permissionVersion?: number;
    teamResourcesLoginKeyEnabled: boolean;
    roleCodes: string[];
    grantedPermissions: string[];
    revokedPermissions: string[];
    isActive: boolean;
    isSuperAdmin: boolean;
    notes: string;
}

export interface UserFormErrors {
    userCode?: string;
    displayName?: string;
    roleCodes?: string;
    accessKey?: string;
}

export interface RoleFormState {
    code: string;
    name: string;
    description: string;
    permissionKeys: string[];
    isActive: boolean;
    landingPage: '' | 'home' | 'welcome';
    recruitmentMenuGrouped: boolean;
}

export interface RoleFormErrors {
    code?: string;
    name?: string;
    permissionKeys?: string;
}

export interface RotateKeyErrors {
    accessKey?: string;
}

export type UserMutationErrorResult =
    | { field: keyof UserFormErrors; message: string }
    | { message: string };

export type RoleMutationErrorResult =
    | { field: keyof RoleFormErrors; message: string }
    | { message: string };

export type RotateKeyErrorResult =
    | { field: keyof RotateKeyErrors; message: string }
    | { message: string };

export interface UserMutationResponse {
    user: ScriptHubManagedUser;
    generated_access_key?: string | null;
    error?: string;
}

export interface RoleMutationResponse {
    role: ScriptHubRoleDefinition;
    error?: string;
}

export interface DeleteMutationResponse {
    message?: string;
    target_code?: string;
    error?: string;
}
