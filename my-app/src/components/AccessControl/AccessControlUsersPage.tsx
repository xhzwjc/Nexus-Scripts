'use client';

import { useMemo, useState } from 'react';
import { KeyRound, Loader2, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { authenticatedFetch, clearScriptHubSession, getStoredScriptHubSession, validateStoredScriptHubSession } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type {
    AccessControlUserViewModel,
    AuthorizationBoundary,
    DataScope,
    ScriptHubManagedUser,
    ScriptHubOrganizationDefinition,
    ScriptHubPermissionDefinition,
    ScriptHubRbacOverview,
    ScriptHubRoleDefinition,
} from '@/lib/types';
import { DATA_SCOPE_OPTIONS } from './constants';
import type { DeleteMutationResponse, RotateKeyErrors, UserFormErrors, UserMutationResponse } from './types';
import { UserForm } from './UserForm';
import { UserTable } from './UserTable';
import {
    boundaryToApiPayload,
    buildUserViewModels,
    createEmptyUserForm,
    createOrganizationMap,
    createPermissionMap,
    createRoleMap,
    filterDataScopesByMax,
    filterOrganizationsByActorBoundary,
    filterPermissionsByActorBoundary,
    filterRolesByActorBoundary,
    getDataScopeLabel,
    isUnboundedActor,
    mapDeleteUserError,
    mapRotateKeyError,
    mapUserMutationError,
    mapUserToForm,
    normalizeBoundary,
    normalizeUserForm,
    validateUserForm,
} from './utils';

interface AccessControlUsersPageProps {
    overview: ScriptHubRbacOverview | null;
    loading: boolean;
    error: string | null;
    onReload: () => Promise<void>;
    onGeneratedKey: (payload: { userCode: string; accessKey: string } | null) => void;
}

type ConfigFilter = 'all' | 'enabled' | 'partial' | 'none';
type StatusFilter = 'all' | 'active' | 'inactive';

const EMPTY_ROLES: ScriptHubRoleDefinition[] = [];
const EMPTY_PERMISSIONS: ScriptHubPermissionDefinition[] = [];
const EMPTY_ORGANIZATIONS: ScriptHubOrganizationDefinition[] = [];
const EMPTY_USERS: ScriptHubManagedUser[] = [];

function filterUserViewModels(
    users: AccessControlUserViewModel[],
    filters: {
        query: string;
        dataScope: 'all' | DataScope;
        status: StatusFilter;
        config: ConfigFilter;
        role: string;
    },
) {
    const query = filters.query.trim().toLowerCase();
    return users.filter((user) => {
        const haystack = [
            user.userCode,
            user.displayName,
            user.primaryOrgCode,
            user.primaryOrgName,
            user.dataScope,
            ...user.roleNames,
            ...user.customOrgCodes,
        ].join(' ').toLowerCase();

        return (
            (!query || haystack.includes(query)) &&
            (filters.dataScope === 'all' || user.dataScope === filters.dataScope) &&
            (filters.status === 'all' || (filters.status === 'active' ? user.isActive : !user.isActive)) &&
            (filters.config === 'all' || user.configPermissionState === filters.config) &&
            (!filters.role || user.roleCodes.includes(filters.role))
        );
    });
}

export function AccessControlUsersPage({
    overview,
    loading,
    error,
    onReload,
    onGeneratedKey,
}: AccessControlUsersPageProps) {
    const { t } = useI18n();
    const labels = t.accessControl;
    const [query, setQuery] = useState('');
    const [dataScopeFilter, setDataScopeFilter] = useState<'all' | DataScope>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [configFilter, setConfigFilter] = useState<ConfigFilter>('all');
    const [roleFilter, setRoleFilter] = useState('');
    const [saving, setSaving] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [editUser, setEditUser] = useState<ScriptHubManagedUser | null>(null);
    const [rotateUser, setRotateUser] = useState<ScriptHubManagedUser | null>(null);
    const [deleteUser, setDeleteUser] = useState<ScriptHubManagedUser | null>(null);
    const [form, setForm] = useState(createEmptyUserForm());
    const [showFormErrors, setShowFormErrors] = useState(false);
    const [serverErrors, setServerErrors] = useState<UserFormErrors>({});
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [customRotateKey, setCustomRotateKey] = useState('');
    const [rotateErrors, setRotateErrors] = useState<RotateKeyErrors>({});
    const [rotateDialogError, setRotateDialogError] = useState<string | null>(null);
    const [deleteDialogError, setDeleteDialogError] = useState<string | null>(null);

    const roles = overview?.catalog.roles ?? EMPTY_ROLES;
    const permissions = overview?.catalog.permissions ?? EMPTY_PERMISSIONS;
    const organizations = overview?.catalog.organizations ?? EMPTY_ORGANIZATIONS;
    const users = overview?.users ?? EMPTY_USERS;

    const roleMap = useMemo(() => createRoleMap(roles), [roles]);
    const permissionMap = useMemo(() => createPermissionMap(permissions), [permissions]);
    const organizationMap = useMemo(() => createOrganizationMap(organizations), [organizations]);
    const activeOrganizations = useMemo(() => organizations.filter((organization) => organization.is_active), [organizations]);
    const assignableRoles = useMemo(() => roles.filter((role) => role.is_active), [roles]);
    const userViewModels = useMemo(
        () => buildUserViewModels(users, roleMap, organizationMap),
        [organizationMap, roleMap, users],
    );
    const filteredViewModels = useMemo(
        () => filterUserViewModels(userViewModels, {
            query,
            dataScope: dataScopeFilter,
            status: statusFilter,
            config: configFilter,
            role: roleFilter,
        }),
        [configFilter, dataScopeFilter, query, roleFilter, statusFilter, userViewModels],
    );
    const filteredUsers = useMemo(() => {
        const allowedCodes = new Set(filteredViewModels.map((user) => user.userCode));
        return users.filter((user) => allowedCodes.has(user.user_code));
    }, [filteredViewModels, users]);

    // 当前登录用户是否拥有用户管理权限（rbac-manage 或超管）
    const canManageUsers = useMemo(() => {
        const session = getStoredScriptHubSession();
        const currentUserId = session?.user.id;
        if (!currentUserId || !users.length) return false;
        const currentUser = users.find((u) => u.user_code === currentUserId);
        const hasRbacManage = Boolean(session?.user.permissions?.['rbac-manage']);
        return (currentUser?.is_super_admin ?? false) || hasRbacManage;
    }, [users]);

    const currentUserId = useMemo(() => getStoredScriptHubSession()?.user.id, []);

    // 当前用户的授权边界（用于过滤表单可选项）
    const actorBoundary: AuthorizationBoundary | null = useMemo(() => {
        const session = getStoredScriptHubSession();
        if (isUnboundedActor(session?.user ?? null)) return null;
        const raw = session?.user.authorizationBoundary;
        if (!raw) return null;
        return normalizeBoundary(raw);
    }, []);

    // 根据当前用户边界过滤后的列表
    const boundaryFilteredRoles = useMemo(() => filterRolesByActorBoundary(assignableRoles, actorBoundary), [assignableRoles, actorBoundary]);
    const boundaryFilteredPermissions = useMemo(() => filterPermissionsByActorBoundary(permissions, actorBoundary), [permissions, actorBoundary]);
    const boundaryFilteredOrganizations = useMemo(() => filterOrganizationsByActorBoundary(activeOrganizations, actorBoundary), [activeOrganizations, actorBoundary]);
    const boundaryFilteredDataScopes = useMemo(() => {
        if (!actorBoundary || !actorBoundary.canGrant) return DATA_SCOPE_OPTIONS;
        return filterDataScopesByMax(actorBoundary.maxDataScope);
    }, [actorBoundary]);

    const selectedRolePermissionKeys = useMemo(() => {
        const keys = new Set<string>();
        form.roleCodes.forEach((roleCode) => {
            roleMap.get(roleCode)?.permission_keys.forEach((permissionKey) => keys.add(permissionKey));
        });
        return [...keys].sort();
    }, [form.roleCodes, roleMap]);

    const baselinePermissionKeys = useMemo(() => {
        if (form.isSuperAdmin || form.roleCodes.includes('admin')) {
            return permissions.map((permission) => permission.key);
        }
        return selectedRolePermissionKeys;
    }, [form.isSuperAdmin, form.roleCodes, permissions, selectedRolePermissionKeys]);

    const grantablePermissions = useMemo(() => {
        return boundaryFilteredPermissions.filter((permission) => !baselinePermissionKeys.includes(permission.key));
    }, [baselinePermissionKeys, boundaryFilteredPermissions]);

    const revokablePermissions = useMemo(() => {
        return boundaryFilteredPermissions.filter((permission) => baselinePermissionKeys.includes(permission.key));
    }, [baselinePermissionKeys, boundaryFilteredPermissions]);

    const formErrors = useMemo(() => validateUserForm(form, labels), [form, labels]);
    const mergedErrors = useMemo(() => ({ ...serverErrors, ...formErrors }), [formErrors, serverErrors]);
    const isFormValid = Object.keys(formErrors).length === 0;

    const closeDialogs = () => {
        setCreateOpen(false);
        setEditUser(null);
        setRotateUser(null);
        setDeleteUser(null);
        setForm(createEmptyUserForm());
        setShowFormErrors(false);
        setServerErrors({});
        setDialogError(null);
        setCustomRotateKey('');
        setRotateErrors({});
        setRotateDialogError(null);
        setDeleteDialogError(null);
    };

    const clearFieldError = (field: keyof UserFormErrors) => {
        setServerErrors((current) => {
            if (!current[field]) {
                return current;
            }
            const next = { ...current };
            delete next[field];
            return next;
        });
        setDialogError(null);
    };

    const openCreateDialog = () => {
        setForm(createEmptyUserForm());
        setShowFormErrors(false);
        setServerErrors({});
        setDialogError(null);
        setCreateOpen(true);
    };

    const openEditDialog = (user: ScriptHubManagedUser) => {
        setForm(mapUserToForm(user));
        setShowFormErrors(false);
        setServerErrors({});
        setDialogError(null);
        setEditUser(user);
    };

    const upsertUser = async (mode: 'create' | 'edit') => {
        setShowFormErrors(true);
        setServerErrors({});
        setDialogError(null);
        if (!isFormValid) {
            return;
        }

        const normalized = normalizeUserForm(form);
        setSaving(true);
        try {
            const filteredGrantedPermissions = normalized.grantedPermissions.filter((permissionKey) => !baselinePermissionKeys.includes(permissionKey));
            const filteredRevokedPermissions = normalized.revokedPermissions.filter((permissionKey) => baselinePermissionKeys.includes(permissionKey));
            const url = mode === 'create'
                ? '/api/admin/rbac/users'
                : `/api/admin/rbac/users/${encodeURIComponent(normalized.userCode)}`;
            const response = await authenticatedFetch(url, {
                method: mode === 'create' ? 'POST' : 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_code: normalized.userCode,
                    display_name: normalized.displayName,
                    access_key: mode === 'create' ? normalized.accessKey || undefined : undefined,
                    primary_org_code: normalized.primaryOrgCode,
                    data_scope: normalized.dataScope,
                    custom_org_codes: normalized.customOrgCodes,
                    authorization_boundary: boundaryToApiPayload(normalized.authorizationBoundary),
                    expected_permission_version: mode === 'edit' ? normalized.permissionVersion : undefined,
                    data_scope_downgrade_confirmed: normalized.dataScopeDowngradeConfirmed,
                    team_resources_login_key_enabled: normalized.teamResourcesLoginKeyEnabled,
                    role_codes: normalized.roleCodes,
                    granted_permissions: filteredGrantedPermissions,
                    revoked_permissions: filteredRevokedPermissions,
                    is_active: normalized.isActive,
                    is_super_admin: normalized.isSuperAdmin,
                    notes: normalized.notes || undefined,
                }),
            });
            const payload = await response.json().catch(() => ({ error: labels.saveFailed })) as UserMutationResponse;
            if (!response.ok || payload.error) {
                throw new Error(payload.error || labels.saveFailed);
            }

            onGeneratedKey(payload.generated_access_key
                ? { userCode: payload.user.user_code, accessKey: payload.generated_access_key }
                : null);
            toast.success(mode === 'create' ? labels.userCreated : labels.userUpdated);
            const isCurrentUser = getStoredScriptHubSession()?.user.id === payload.user.user_code;
            closeDialogs();
            if (isCurrentUser) {
                await validateStoredScriptHubSession();
                window.location.reload();
                return;
            }
            await onReload();
        } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : labels.saveFailed;
            const mapped = mapUserMutationError(message, labels);
            if ('field' in mapped) {
                setServerErrors((current) => ({ ...current, [mapped.field]: mapped.message }));
            } else {
                setDialogError(mapped.message);
            }
        } finally {
            setSaving(false);
        }
    };

    const handleRotateKey = async () => {
        if (!rotateUser) {
            return;
        }

        setRotateErrors({});
        setRotateDialogError(null);
        setSaving(true);
        try {
            const response = await authenticatedFetch(`/api/admin/rbac/users/${encodeURIComponent(rotateUser.user_code)}/rotate-key`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    access_key: customRotateKey || undefined,
                }),
            });
            const payload = await response.json().catch(() => ({ error: labels.saveFailed })) as UserMutationResponse;
            if (!response.ok || payload.error || !payload.generated_access_key) {
                throw new Error(payload.error || labels.saveFailed);
            }

            onGeneratedKey({ userCode: payload.user.user_code, accessKey: payload.generated_access_key });
            toast.success(labels.keyRotated);
            closeDialogs();
            await onReload();
        } catch (rotateError) {
            const message = rotateError instanceof Error ? rotateError.message : labels.saveFailed;
            const mapped = mapRotateKeyError(message, labels);
            if ('field' in mapped) {
                setRotateErrors({ [mapped.field]: mapped.message });
            } else {
                setRotateDialogError(mapped.message);
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteUser = async () => {
        if (!deleteUser) {
            return;
        }

        setDeleteDialogError(null);
        setSaving(true);
        try {
            const response = await authenticatedFetch(`/api/admin/rbac/users/${encodeURIComponent(deleteUser.user_code)}`, {
                method: 'DELETE',
            });
            const payload = await response.json().catch(() => ({ error: labels.deleteFailed })) as DeleteMutationResponse;
            if (!response.ok || payload.error) {
                throw new Error(payload.error || labels.deleteFailed);
            }

            const currentUserCode = getStoredScriptHubSession()?.user.id;
            const deletedSelf = currentUserCode === deleteUser.user_code;

            toast.success(labels.userDeleted);
            closeDialogs();

            if (deletedSelf) {
                clearScriptHubSession();
                window.location.reload();
                return;
            }

            await onReload();
        } catch (deleteError) {
            const message = deleteError instanceof Error ? deleteError.message : labels.deleteFailed;
            setDeleteDialogError(mapDeleteUserError(message, labels));
        } finally {
            setSaving(false);
        }
    };

    return (
        <section aria-labelledby="access-control-users-title" className="space-y-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
                    <h1 id="access-control-users-title" className="text-[18px] font-semibold leading-7 text-[#0E1114] dark:text-white">{labels.usersTitle}</h1>
                    <p className="text-[12px] leading-5 text-[#B0B2B8] dark:text-slate-400">{labels.usersDesc}</p>
                </div>
                <Button className="h-9 shrink-0 rounded-[6px] bg-[#1E3BFA] px-4 text-[13px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={openCreateDialog}>
                    <Plus className="h-3.5 w-3.5" />
                    {labels.addUser}
                </Button>
            </div>

            <div className="overflow-hidden rounded-[8px] border border-[#EBEEF5] bg-white shadow-none dark:border-slate-800 dark:bg-slate-950">
                <div className="border-b border-[#F2F3F5] bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_160px_175px_145px_180px_auto]">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#B0B2B8]" />
                            <Input
                                className="h-9 rounded-[4px] border-[#E6E7EB] bg-white pl-9 text-[12px] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-950"
                                placeholder={labels.searchPlaceholder}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                            />
                        </div>
                        <Select value={roleFilter || 'all'} onValueChange={(value) => setRoleFilter(value === 'all' ? '' : value)}>
                            <SelectTrigger className="h-9 w-full rounded-[4px] border-[#E6E7EB] bg-white text-[12px] shadow-none focus:ring-0 dark:border-slate-700 dark:bg-slate-950">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{labels.filterAllRoles}</SelectItem>
                                {assignableRoles.map((role) => (
                                    <SelectItem key={role.code} value={role.code}>{role.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={dataScopeFilter} onValueChange={(value) => setDataScopeFilter(value as 'all' | DataScope)}>
                            <SelectTrigger className="h-9 w-full rounded-[4px] border-[#E6E7EB] bg-white text-[12px] shadow-none focus:ring-0 dark:border-slate-700 dark:bg-slate-950">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{labels.filterAllDataScopes}</SelectItem>
                                {DATA_SCOPE_OPTIONS.map((scope) => (
                                    <SelectItem key={scope} value={scope}>{getDataScopeLabel(scope, labels)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                            <SelectTrigger className="h-9 w-full rounded-[4px] border-[#E6E7EB] bg-white text-[12px] shadow-none focus:ring-0 dark:border-slate-700 dark:bg-slate-950">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{labels.filterAllStatuses}</SelectItem>
                                <SelectItem value="active">{labels.active}</SelectItem>
                                <SelectItem value="inactive">{labels.inactive}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={configFilter} onValueChange={(value) => setConfigFilter(value as ConfigFilter)}>
                            <SelectTrigger className="h-9 w-full rounded-[4px] border-[#E6E7EB] bg-white text-[12px] shadow-none focus:ring-0 dark:border-slate-700 dark:bg-slate-950">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{labels.filterAllConfigPermissions}</SelectItem>
                                <SelectItem value="enabled">{labels.configPermissionEnabled}</SelectItem>
                                <SelectItem value="partial">{labels.configPermissionPartial}</SelectItem>
                                <SelectItem value="none">{labels.configPermissionNone}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline" className="h-9 rounded-[4px] border-[#E6E7EB] bg-white px-3 text-[12px] font-normal text-[#5E5F66] shadow-none hover:border-[#1E3BFA] hover:bg-white hover:text-[#0F23D9] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300" onClick={() => {
                            setQuery('');
                            setRoleFilter('');
                            setDataScopeFilter('all');
                            setStatusFilter('all');
                            setConfigFilter('all');
                        }}>
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            {labels.resetFilters}
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex min-h-[360px] items-center justify-center text-[12px] text-[#86888F]">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t.common.loading}
                    </div>
                ) : error ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 px-6 text-center">
                        <p className="max-w-md text-[12px] leading-5 text-[#F53F3F]">{error}</p>
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-3 text-[12px] font-normal text-[#0F23D9] shadow-none" onClick={() => void onReload()}>{labels.refresh}</Button>
                    </div>
                ) : filteredViewModels.length === 0 ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 px-6 text-center text-[12px] text-[#86888F]">
                        <p>{labels.noUsers}</p>
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#1E3BFA] bg-white px-3 text-[12px] font-normal text-[#0F23D9] shadow-none" onClick={openCreateDialog}>
                            <Plus className="h-3.5 w-3.5" />
                            {labels.addUser}
                        </Button>
                    </div>
                ) : (
                    <UserTable
                        users={filteredUsers}
                        viewModels={filteredViewModels}
                        permissionMap={permissionMap}
                        labels={labels}
                        canManageUsers={canManageUsers}
                        currentUserId={currentUserId}
                        onEdit={openEditDialog}
                        onRotateKey={(user) => {
                            setRotateDialogError(null);
                            setRotateErrors({});
                            setCustomRotateKey('');
                            setRotateUser(user);
                        }}
                        onDelete={(user) => {
                            setDeleteDialogError(null);
                            setDeleteUser(user);
                        }}
                    />
                )}
            </div>

            <UserForm
                open={createOpen || !!editUser}
                mode={createOpen ? 'create' : 'edit'}
                form={form}
                labels={labels}
                organizations={boundaryFilteredOrganizations}
                assignableRoles={boundaryFilteredRoles}
                permissions={permissions}
                permissionMap={permissionMap}
                selectedRolePermissionKeys={selectedRolePermissionKeys}
                grantablePermissions={grantablePermissions}
                revokablePermissions={revokablePermissions}
                dataScopeOptions={boundaryFilteredDataScopes}
                actorBoundary={actorBoundary}
                showErrors={showFormErrors}
                errors={mergedErrors}
                dialogError={dialogError}
                saving={saving}
                onChange={setForm}
                onFieldChange={clearFieldError}
                onCancel={closeDialogs}
                onSubmit={() => void upsertUser(createOpen ? 'create' : 'edit')}
            />

            <Dialog open={!!deleteUser} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
                <DialogContent className="gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[440px] dark:bg-slate-950">
                    <DialogHeader className="gap-1 border-b border-[#F2F3F5] px-5 pb-4 pr-12 pt-5 text-left dark:border-slate-800">
                        <DialogTitle className="text-[16px] leading-6 text-[#0E1114] dark:text-white">{labels.deleteUserTitle}</DialogTitle>
                        <DialogDescription className="text-[12px] leading-5 text-[#86888F]">{labels.deleteConfirmDescription}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 px-5 py-4">
                        {deleteDialogError && (
                            <div className="rounded-[6px] border border-[rgba(245,63,63,0.24)] bg-[rgba(245,63,63,0.06)] px-3 py-2 text-[12px] leading-5 text-[#F53F3F]">
                                {deleteDialogError}
                            </div>
                        )}
                        {deleteUser && (
                            <div className="flex items-center gap-3 rounded-[6px] bg-[#F7F8FA] p-3 dark:bg-slate-900/60">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-[rgba(245,63,63,0.08)] text-[#F53F3F]">
                                    <Trash2 className="h-4 w-4" />
                                </span>
                                <div className="min-w-0">
                                    <p className="truncate text-[13px] font-medium text-[#0E1114] dark:text-slate-100">{deleteUser.display_name}</p>
                                    <p className="mt-0.5 truncate font-mono text-[11px] text-[#86888F]">{deleteUser.user_code}</p>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="border-t border-[#F2F3F5] bg-[#FAFAFB] px-5 py-4 dark:border-slate-800 dark:bg-slate-900/40">
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-4 text-[12px] font-normal text-[#33353D] shadow-none" onClick={closeDialogs} disabled={saving}>
                            {t.common.cancel}
                        </Button>
                        <Button variant="destructive" className="h-8 rounded-[6px] bg-[#F53F3F] px-4 text-[12px] font-normal text-white shadow-none hover:bg-[#D9363E]" onClick={() => void handleDeleteUser()} disabled={saving}>
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {labels.deleteConfirmAction}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!rotateUser} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
                <DialogContent className="gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[520px] dark:bg-slate-950">
                    <DialogHeader className="gap-1 border-b border-[#F2F3F5] px-5 pb-4 pr-12 pt-5 text-left dark:border-slate-800">
                        <DialogTitle className="text-[16px] leading-6 text-[#0E1114] dark:text-white">{labels.rotateKeyTitle}</DialogTitle>
                        <DialogDescription className="text-[12px] leading-5 text-[#86888F]">
                            {rotateUser ? `${rotateUser.display_name} (${rotateUser.user_code})` : labels.rotateKeyTitle}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 px-5 py-4">
                        {rotateDialogError && (
                            <div className="rounded-[6px] border border-[rgba(245,63,63,0.24)] bg-[rgba(245,63,63,0.06)] px-3 py-2 text-[12px] leading-5 text-[#F53F3F]">
                                {rotateDialogError}
                            </div>
                        )}
                        <div className="flex items-start gap-3 rounded-[6px] bg-[#F7F8FA] p-3 dark:bg-slate-900/60">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-[rgba(30,59,250,0.08)] text-[#0F23D9]">
                                <KeyRound className="h-4 w-4" />
                            </span>
                            <p className="text-[11px] leading-5 text-[#5E5F66] dark:text-slate-400">{labels.generatedKeyHint}</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="rotate-key" className="text-[12px] font-normal text-[#33353D] dark:text-slate-300">{labels.customKey}</Label>
                            <Input
                                id="rotate-key"
                                className="h-9 rounded-[4px] border-[#E6E7EB] text-[12px] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-0 dark:border-slate-700"
                                value={customRotateKey}
                                onChange={(event) => {
                                    setRotateErrors({});
                                    setRotateDialogError(null);
                                    setCustomRotateKey(event.target.value);
                                }}
                                placeholder={labels.accessKeyHint}
                                disabled={saving}
                            />
                            {rotateErrors.accessKey && (
                                <p className="text-[11px] text-[#F53F3F]">{rotateErrors.accessKey}</p>
                            )}
                        </div>
                    </div>
                    <DialogFooter className="border-t border-[#F2F3F5] bg-[#FAFAFB] px-5 py-4 dark:border-slate-800 dark:bg-slate-900/40">
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-4 text-[12px] font-normal text-[#33353D] shadow-none" onClick={closeDialogs} disabled={saving}>
                            {t.common.cancel}
                        </Button>
                        <Button className="h-8 rounded-[6px] bg-[#1E3BFA] px-4 text-[12px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={() => void handleRotateKey()} disabled={saving}>
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {labels.rotateUserKey}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}
