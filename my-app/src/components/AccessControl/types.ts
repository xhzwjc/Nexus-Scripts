import type {
    AuthorizationBoundary,
    DataScope,
    ScriptHubManagedUser,
    ScriptHubRoleDefinition,
} from '@/lib/types';

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
