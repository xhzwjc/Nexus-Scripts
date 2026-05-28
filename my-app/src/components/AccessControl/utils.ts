import type { Translations } from '@/lib/i18n/types';
import type {
    AccessControlUserViewModel,
    AuthorizationBoundary,
    DataScope,
    ResourceDomain,
    ResourceStatus,
    ScriptHubAuditLogEntry,
    ScriptHubManagedUser,
    ScriptHubOrganizationDefinition,
    ScriptHubPermissionDefinition,
    ScriptHubRoleDefinition,
    SharePolicy,
} from '@/lib/types';
import { CONFIG_PERMISSION_KEYS, DATA_SCOPE_OPTIONS } from './constants';
import type {
    RoleFormErrors,
    RoleFormState,
    RoleMutationErrorResult,
    RotateKeyErrorResult,
    UserFormErrors,
    UserFormState,
    UserMutationErrorResult,
} from './types';

export type AccessControlLabels = Translations['accessControl'];

export function toggleItem(list: string[], item: string, checked: boolean) {
    if (checked) {
        return list.includes(item) ? list : [...list, item];
    }
    return list.filter((value) => value !== item);
}

export function normalizeDataScope(value: unknown): DataScope {
    const candidate = String(value || '').trim().toUpperCase();
    return DATA_SCOPE_OPTIONS.includes(candidate as DataScope) ? candidate as DataScope : 'ORG_ONLY';
}

export function createEmptyBoundary(): AuthorizationBoundary {
    return {
        canGrant: false,
        manageableOrgCodes: [],
        assignableRoleCodes: [],
        assignablePermissionKeys: [],
        maxDataScope: 'SELF',
    };
}

function readArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return [];
}

export function normalizeBoundary(value: unknown): AuthorizationBoundary {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return createEmptyBoundary();
    }

    const source = value as Record<string, unknown>;
    return {
        canGrant: Boolean(source.canGrant ?? source.can_grant),
        manageableOrgCodes: readArray(source.manageableOrgCodes ?? source.manageable_org_codes),
        assignableRoleCodes: readArray(source.assignableRoleCodes ?? source.assignable_role_codes),
        assignablePermissionKeys: readArray(source.assignablePermissionKeys ?? source.assignable_permission_keys),
        maxDataScope: normalizeDataScope(source.maxDataScope ?? source.max_data_scope ?? 'SELF'),
    };
}

export function boundaryToApiPayload(boundary: AuthorizationBoundary) {
    return {
        can_grant: boundary.canGrant,
        manageable_org_codes: boundary.manageableOrgCodes,
        assignable_role_codes: boundary.assignableRoleCodes,
        assignable_permission_keys: boundary.assignablePermissionKeys,
        max_data_scope: boundary.maxDataScope,
    };
}

export function createEmptyUserForm(): UserFormState {
    return {
        userCode: '',
        displayName: '',
        accessKey: '',
        primaryOrgCode: 'group',
        dataScope: 'ORG_ONLY',
        customOrgCodes: [],
        authorizationBoundary: createEmptyBoundary(),
        dataScopeDowngradeConfirmed: false,
        permissionVersion: undefined,
        teamResourcesLoginKeyEnabled: false,
        roleCodes: [],
        grantedPermissions: [],
        revokedPermissions: [],
        isActive: true,
        isSuperAdmin: false,
        notes: '',
    };
}

export function mapUserToForm(user: ScriptHubManagedUser): UserFormState {
    return {
        userCode: user.user_code,
        displayName: user.display_name,
        accessKey: '',
        primaryOrgCode: user.primary_org_code || 'group',
        dataScope: normalizeDataScope(user.data_scope),
        customOrgCodes: [...(user.custom_org_codes || [])],
        authorizationBoundary: normalizeBoundary(user.authorization_boundary),
        dataScopeDowngradeConfirmed: false,
        permissionVersion: user.permission_version,
        teamResourcesLoginKeyEnabled: user.team_resources_login_key_enabled,
        roleCodes: [...user.role_codes],
        grantedPermissions: [...user.granted_overrides],
        revokedPermissions: [...user.revoked_overrides],
        isActive: user.is_active,
        isSuperAdmin: user.is_super_admin,
        notes: user.notes || '',
    };
}

export function normalizeUserForm(form: UserFormState): UserFormState {
    return {
        ...form,
        userCode: form.userCode.trim().toLowerCase(),
        displayName: form.displayName.trim(),
        accessKey: form.accessKey.trim(),
        primaryOrgCode: form.primaryOrgCode.trim() || 'group',
        customOrgCodes: form.customOrgCodes.map((item) => item.trim()).filter(Boolean),
        notes: form.notes.trim(),
    };
}

export function createEmptyRoleForm(): RoleFormState {
    return {
        code: '',
        name: '',
        description: '',
        permissionKeys: [],
        isActive: true,
        landingPage: 'welcome',
        recruitmentMenuGrouped: true,
    };
}

export function mapRoleToForm(role: ScriptHubRoleDefinition): RoleFormState {
    return {
        code: role.code,
        name: role.name,
        description: role.description || '',
        permissionKeys: [...role.permission_keys],
        isActive: role.is_active,
        landingPage: role.landing_page || 'home',
        recruitmentMenuGrouped: role.recruitment_menu_grouped !== false,
    };
}

export function normalizeRoleForm(form: RoleFormState): RoleFormState {
    return {
        ...form,
        code: form.code.trim().toLowerCase(),
        name: form.name.trim(),
        description: form.description.trim(),
    };
}

export function validateUserForm(form: UserFormState, labels: AccessControlLabels): UserFormErrors {
    const errors: UserFormErrors = {};
    const normalized = normalizeUserForm(form);

    if (!normalized.userCode) {
        errors.userCode = labels.validationUserCodeRequired;
    } else if (!/^[a-z0-9][a-z0-9._-]{1,99}$/.test(normalized.userCode)) {
        errors.userCode = labels.validationUserCodePattern;
    }

    if (!normalized.displayName) {
        errors.displayName = labels.validationDisplayNameRequired;
    }

    if (normalized.roleCodes.length === 0) {
        errors.roleCodes = labels.validationRoleRequired;
    }

    return errors;
}

export function validateRoleForm(form: RoleFormState, labels: AccessControlLabels): RoleFormErrors {
    const errors: RoleFormErrors = {};
    const normalized = normalizeRoleForm(form);

    if (!normalized.code) {
        errors.code = labels.validationRoleCodeRequired;
    } else if (!/^[a-z0-9][a-z0-9._-]{1,99}$/.test(normalized.code)) {
        errors.code = labels.validationRoleCodePattern;
    }

    if (!normalized.name) {
        errors.name = labels.validationRoleNameRequired;
    }

    if (normalized.permissionKeys.length === 0) {
        errors.permissionKeys = labels.validationRolePermissionRequired;
    }

    return errors;
}

export function formatDateTime(value?: string | null) {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

export function groupPermissionsByCategory(permissions: ScriptHubPermissionDefinition[]) {
    return permissions.reduce<Record<string, ScriptHubPermissionDefinition[]>>((acc, permission) => {
        acc[permission.category] = acc[permission.category] || [];
        acc[permission.category].push(permission);
        return acc;
    }, {});
}

export function categoryLabel(category: string, labels: AccessControlLabels) {
    switch (category) {
        case 'business':
            return labels.categoryBusiness;
        case 'finance':
            return labels.categoryFinance;
        case 'tax':
            return labels.categoryTax;
        case 'ops':
            return labels.categoryOps;
        case 'sms':
            return labels.categorySms;
        case 'biz':
            return labels.categoryBiz;
        case 'resources':
            return labels.categoryResources;
        case 'platform':
            return labels.categoryPlatform;
        case 'collaboration':
            return labels.categoryCollaboration;
        case 'recruitment':
            return labels.categoryRecruitment;
        case 'recruitment-config':
            return labels.categoryRecruitmentConfig;
        default:
            return category;
    }
}

export function formatAuditAction(action: string, labels: AccessControlLabels) {
    switch (action) {
        case 'user.create':
            return labels.auditActionUserCreate;
        case 'user.update':
            return labels.auditActionUserUpdate;
        case 'user.delete':
            return labels.auditActionUserDelete;
        case 'user.rotate_key':
            return labels.auditActionUserRotateKey;
        case 'role.create':
            return labels.auditActionRoleCreate;
        case 'role.update':
            return labels.auditActionRoleUpdate;
        case 'role.delete':
            return labels.auditActionRoleDelete;
        case 'organization.create':
            return labels.auditActionOrganizationCreate;
        case 'organization.update':
            return labels.auditActionOrganizationUpdate;
        case 'organization.delete':
            return labels.auditActionOrganizationDelete;
        case 'recruitment.resource-governance.update':
            return labels.auditActionResourceGovernanceUpdate;
        default:
            return action;
    }
}

export function formatAuditValue(value: unknown): string {
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (typeof value === 'string' || typeof value === 'number') {
        return String(value);
    }
    if (Array.isArray(value)) {
        return value.map((item) => formatAuditValue(item)).join(', ');
    }
    if (value && typeof value === 'object') {
        return JSON.stringify(value);
    }
    return '-';
}

export function summarizeAuditDetails(details: Record<string, unknown>) {
    return Object.entries(details || {})
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}: ${formatAuditValue(value)}`)
        .join(' | ');
}

export function mapUserMutationError(message: string, labels: AccessControlLabels): UserMutationErrorResult {
    if (message.includes('User code already exists')) {
        return { field: 'userCode', message: labels.validationUserCodeDuplicate };
    }
    if (message.includes('Access key already exists')) {
        return { field: 'accessKey', message: labels.validationAccessKeyDuplicate };
    }
    if (message.includes('At least one role is required')) {
        return { field: 'roleCodes', message: labels.validationRoleRequired };
    }
    if (message.includes('Data scope downgrade requires explicit confirmation')) {
        return { message: `${labels.scopeDowngradeConfirm}：${labels.scopeDowngradeConfirmDesc}` };
    }
    return { message: mapAccessControlApiError(message, labels) };
}

export function mapRoleMutationError(message: string, labels: AccessControlLabels): RoleMutationErrorResult {
    if (message.includes('Role code already exists')) {
        return { field: 'code', message: labels.validationRoleCodeDuplicate };
    }
    if (message.includes('At least one permission is required')) {
        return { field: 'permissionKeys', message: labels.validationRolePermissionRequired };
    }
    if (message.includes('System roles are read-only')) {
        return { message: labels.validationRoleReadOnly };
    }
    if (message.includes('still assigned to users')) {
        return { message: labels.validationRoleAssignedUsers };
    }
    return { message: mapAccessControlApiError(message, labels) };
}

export function mapRotateKeyError(message: string, labels: AccessControlLabels): RotateKeyErrorResult {
    if (message.includes('Access key already exists')) {
        return { field: 'accessKey', message: labels.validationAccessKeyDuplicate };
    }
    return { message: mapAccessControlApiError(message, labels) };
}

export function mapDeleteUserError(message: string, labels: AccessControlLabels): string {
    if (message.includes('At least one active administrator must remain')) {
        return labels.validationLastAdminRequired;
    }
    return mapAccessControlApiError(message, labels);
}

export function mapAccessControlApiError(message: string | null | undefined, labels: AccessControlLabels): string {
    const text = String(message || '').trim();
    if (!text) {
        return labels.validationFormSubmitFailed;
    }

    if (text.includes('Actor is not allowed to manage organizations')) return labels.errorManageOrganizationsDenied;
    if (text.includes('Actor is not allowed to grant permissions')) return labels.errorGrantPermissionsDenied;
    if (text.includes('Organization is outside the actor authorization boundary')) return labels.errorOrganizationOutsideBoundary;
    if (text.includes('Organization is outside the actor data scope')) return labels.errorOrganizationOutsideScope;
    if (text.includes('Target organization is outside the actor authorization boundary')) return labels.errorTargetOrganizationOutsideBoundary;
    if (text.includes('Target organization is outside the actor data scope')) return labels.errorTargetOrganizationOutsideScope;
    if (text.includes('Role assignment exceeds actor authorization boundary')) return labels.errorRoleAssignmentBoundary;
    if (text.includes('Permission grant exceeds actor authorization boundary')) return labels.errorPermissionGrantBoundary;
    if (text.includes('Data scope exceeds actor authorization boundary')) return labels.errorDataScopeBoundary;
    if (text.includes('Unknown organization')) return labels.errorUnknownOrganization;
    if (text.includes('Unknown roles')) return labels.errorUnknownRoles;
    if (text.includes('Unknown permissions')) return labels.errorUnknownPermissions;
    if (text.includes('Permissions cannot be both granted and revoked')) return labels.errorPermissionsOverlap;
    if (text.includes('User permissions changed')) return labels.errorUserPermissionsChanged;
    if (text.includes('Organization code already exists')) return labels.errorOrganizationCodeDuplicate;
    if (text.includes('Parent organization not found')) return labels.errorParentOrganizationNotFound;
    if (text.includes('Root organization cannot have a parent')) return labels.errorRootOrganizationParent;
    if (text.includes('Non-root organization must have a parent')) return labels.errorOrganizationParentRequired;
    if (text.includes('Organization cannot be its own parent')) return labels.errorOrganizationSelfParent;
    if (text.includes('Organization cannot be moved under its descendant')) return labels.errorOrganizationDescendantParent;
    if (text.includes('Root organization cannot be disabled')) return labels.errorRootOrganizationDisable;
    if (text.includes('Organization has active children')) return labels.errorOrganizationActiveChildren;
    if (text.includes('Organization is still assigned to users')) return labels.errorOrganizationAssignedUsers;
    if (text.includes('Organization has children')) return labels.errorOrganizationHasChildren;
    if (text.includes('Organization code must use')) return labels.validationOrgCodePattern;
    if (text.includes('Invalid organization type')) return labels.validationOrgTypeInvalid;
    if (text.includes('Organization name is required')) return labels.validationOrgNameRequired;
    if (text.includes('User code must use')) return labels.validationUserCodePattern;
    if (text.includes('Display name is required') || text.includes('Display name cannot be empty')) return labels.validationDisplayNameRequired;
    if (text.includes('Role code must use')) return labels.validationRoleCodePattern;
    if (text.includes('Role name is required')) return labels.validationRoleNameRequired;
    if (text.includes('At least one role is required')) return labels.validationRoleRequired;
    if (text.includes('At least one permission is required')) return labels.validationRolePermissionRequired;
    if (text.includes('System roles are read-only')) return labels.validationRoleReadOnly;
    if (text.includes('still assigned to users')) return labels.validationRoleAssignedUsers;
    if (text.includes('Access key already exists')) return labels.validationAccessKeyDuplicate;
    if (text.includes('User code already exists')) return labels.validationUserCodeDuplicate;
    if (text.includes('Role code already exists')) return labels.validationRoleCodeDuplicate;
    if (text.includes('At least one active administrator must remain')) return labels.validationLastAdminRequired;
    if (text.includes('Data scope downgrade requires explicit confirmation')) {
        return `${labels.scopeDowngradeConfirm}：${labels.scopeDowngradeConfirmDesc}`;
    }

    return text;
}

export function createRoleMap(roles: ScriptHubRoleDefinition[]) {
    return new Map(roles.map((role) => [role.code, role]));
}

export function createPermissionMap(permissions: ScriptHubPermissionDefinition[]) {
    return new Map(permissions.map((permission) => [permission.key, permission]));
}

export function createOrganizationMap(organizations: ScriptHubOrganizationDefinition[]) {
    return new Map(organizations.map((organization) => [organization.org_code, organization]));
}

export function buildUserViewModels(
    users: ScriptHubManagedUser[],
    roleMap: Map<string, ScriptHubRoleDefinition>,
    organizationMap: Map<string, ScriptHubOrganizationDefinition>,
): AccessControlUserViewModel[] {
    return users.map((user) => {
        const configPermissionCount = user.effective_permission_keys.filter((permissionKey) => CONFIG_PERMISSION_KEYS.includes(permissionKey)).length;
        const organization = organizationMap.get(user.primary_org_code);

        return {
            userCode: user.user_code,
            displayName: user.display_name,
            primaryOrgCode: user.primary_org_code,
            primaryOrgName: organization?.name || user.primary_org_code,
            roleCodes: user.role_codes,
            roleNames: user.role_codes.map((roleCode) => roleMap.get(roleCode)?.name || roleCode),
            dataScope: normalizeDataScope(user.data_scope),
            customOrgCodes: user.custom_org_codes || [],
            configPermissionState: configPermissionCount === 0
                ? 'none'
                : configPermissionCount >= CONFIG_PERMISSION_KEYS.length
                    ? 'enabled'
                    : 'partial',
            isActive: user.is_active,
            isSuperAdmin: user.is_super_admin,
            effectivePermissionCount: user.effective_permission_keys.length,
            effectivePermissionKeys: user.effective_permission_keys,
            lastLoginAt: user.last_login_at,
        };
    });
}

export function getDataScopeLabel(scope: DataScope, labels: AccessControlLabels) {
    switch (scope) {
        case 'ALL':
            return labels.dataScopeAll;
        case 'ORG_AND_CHILDREN':
            return labels.dataScopeOrgAndChildren;
        case 'ORG_ONLY':
            return labels.dataScopeOrgOnly;
        case 'CUSTOM_ORGS':
            return labels.dataScopeCustomOrgs;
        case 'SELF':
            return labels.dataScopeSelf;
        default:
            return scope;
    }
}

export function getSharePolicyLabel(policy: SharePolicy, labels: AccessControlLabels) {
    switch (policy) {
        case 'PRIVATE':
            return labels.sharePolicyPrivate;
        case 'SHARED_READONLY':
            return labels.sharePolicySharedReadonly;
        case 'SHARED_COPYABLE':
            return labels.sharePolicySharedCopyable;
        case 'PUBLIC_IN_GROUP':
            return labels.sharePolicyPublicInGroup;
        default:
            return policy;
    }
}

export function getResourceDomainLabel(domain: ResourceDomain, labels: AccessControlLabels) {
    switch (domain) {
        case 'mail':
            return labels.resourceDomainMail;
        case 'skill':
            return labels.resourceDomainSkill;
        case 'model':
            return labels.resourceDomainModel;
        default:
            return domain;
    }
}

export function getResourceStatusLabel(status: ResourceStatus, labels: AccessControlLabels) {
    switch (status) {
        case 'active':
            return labels.active;
        case 'inactive':
        case 'disabled':
            return labels.inactive;
        case 'draft':
            return labels.resourceStatusDraft;
        default:
            return status;
    }
}

export function getResourceScopeLevelLabel(scopeLevel: string | null | undefined, labels: AccessControlLabels) {
    switch (String(scopeLevel || '').toUpperCase()) {
        case 'ORG':
            return labels.resourceScopeOrg;
        case 'ORG_AND_CHILDREN':
            return labels.resourceScopeOrgAndChildren;
        case 'GROUP':
            return labels.resourceScopeGroup;
        default:
            return scopeLevel || '-';
    }
}

export function countBy<T extends string>(items: T[]) {
    return items.reduce<Record<T, number>>((acc, item) => {
        acc[item] = (acc[item] || 0) + 1;
        return acc;
    }, {} as Record<T, number>);
}

export function filterAuditLogs(
    logs: ScriptHubAuditLogEntry[],
    filters: {
        query: string;
        actor: string;
        targetType: string;
        result: string;
        sensitivity: string;
    },
) {
    const query = filters.query.trim().toLowerCase();
    return logs.filter((log) => {
        const actorText = `${log.actor_user_code || ''} ${log.actor_display_name || ''}`.toLowerCase();
        const haystack = [
            log.action,
            log.target_type,
            log.target_code,
            log.target_org_code || '',
            summarizeAuditDetails(log.details || {}),
        ].join(' ').toLowerCase();

        return (
            (!query || haystack.includes(query) || actorText.includes(query)) &&
            (!filters.actor || actorText.includes(filters.actor.trim().toLowerCase())) &&
            (!filters.targetType || log.target_type === filters.targetType) &&
            (!filters.result || log.result === filters.result) &&
            (!filters.sensitivity || (log.sensitivity || 'normal') === filters.sensitivity)
        );
    });
}

const DATA_SCOPE_RANK: Record<DataScope, number> = {
    ALL: 50,
    ORG_AND_CHILDREN: 40,
    ORG_ONLY: 30,
    CUSTOM_ORGS: 20,
    SELF: 10,
};

export function filterDataScopesByMax(maxScope: DataScope): DataScope[] {
    const maxRank = DATA_SCOPE_RANK[maxScope] ?? 0;
    return DATA_SCOPE_OPTIONS.filter((scope) => (DATA_SCOPE_RANK[scope] ?? 0) <= maxRank);
}

export function isUnboundedActor(session: { isSuperAdmin?: boolean; roles?: string[] } | null): boolean {
    if (!session) return true;
    if (session.isSuperAdmin) return true;
    if (session.roles?.includes('admin')) return true;
    return false;
}

export function filterRolesByActorBoundary(
    roles: ScriptHubRoleDefinition[],
    boundary: AuthorizationBoundary | null,
): ScriptHubRoleDefinition[] {
    if (!boundary || !boundary.canGrant) return roles;
    if (boundary.assignableRoleCodes.length === 0) return roles;
    const allowed = new Set(boundary.assignableRoleCodes);
    return roles.filter((role) => allowed.has(role.code));
}

export function filterPermissionsByActorBoundary(
    permissions: ScriptHubPermissionDefinition[],
    boundary: AuthorizationBoundary | null,
): ScriptHubPermissionDefinition[] {
    if (!boundary || !boundary.canGrant) return permissions;
    if (boundary.assignablePermissionKeys.length === 0) return permissions;
    const allowed = new Set(boundary.assignablePermissionKeys);
    return permissions.filter((p) => allowed.has(p.key));
}

export function filterOrganizationsByActorBoundary(
    organizations: ScriptHubOrganizationDefinition[],
    boundary: AuthorizationBoundary | null,
): ScriptHubOrganizationDefinition[] {
    if (!boundary || !boundary.canGrant) return organizations;
    if (boundary.manageableOrgCodes.length === 0) return organizations;
    const allowed = new Set(boundary.manageableOrgCodes);
    return organizations.filter((org) => allowed.has(org.org_code));
}
