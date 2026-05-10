'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { toast } from '@/lib/toast';
import { authenticatedFetch, clearScriptHubSession, getStoredScriptHubSession, validateStoredScriptHubSession } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
    getDataScopeLabel,
    mapDeleteUserError,
    mapRotateKeyError,
    mapUserMutationError,
    mapUserToForm,
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
            (filters.config === 'all' || user.configPermissionState === filters.config)
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
        }),
        [configFilter, dataScopeFilter, query, statusFilter, userViewModels],
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
        return permissions.filter((permission) => !baselinePermissionKeys.includes(permission.key));
    }, [baselinePermissionKeys, permissions]);

    const revokablePermissions = useMemo(() => {
        return permissions.filter((permission) => baselinePermissionKeys.includes(permission.key));
    }, [baselinePermissionKeys, permissions]);

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
        <div className="space-y-4">
            <div className="rounded-lg border bg-card">
                <div className="border-b px-5 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">{labels.usersTitle}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">{labels.usersDesc}</p>
                        </div>
                        <Button onClick={openCreateDialog}>
                            <Plus className="h-4 w-4" />
                            {labels.addUser}
                        </Button>
                    </div>
                </div>

                <div className="border-b bg-muted/20 px-5 py-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_180px_160px_180px_auto]">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                className="pl-9"
                                placeholder={labels.searchPlaceholder}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                            />
                        </div>
                        <Select value={dataScopeFilter} onValueChange={(value) => setDataScopeFilter(value as 'all' | DataScope)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{labels.filterAllDataScopes}</SelectItem>
                                {DATA_SCOPE_OPTIONS.map((scope) => (
                                    <SelectItem key={scope} value={scope}>
                                        {getDataScopeLabel(scope, labels)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{labels.filterAllStatuses}</SelectItem>
                                <SelectItem value="active">{labels.active}</SelectItem>
                                <SelectItem value="inactive">{labels.inactive}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={configFilter} onValueChange={(value) => setConfigFilter(value as ConfigFilter)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{labels.filterAllConfigPermissions}</SelectItem>
                                <SelectItem value="enabled">{labels.configPermissionEnabled}</SelectItem>
                                <SelectItem value="partial">{labels.configPermissionPartial}</SelectItem>
                                <SelectItem value="none">{labels.configPermissionNone}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={() => {
                            setQuery('');
                            setDataScopeFilter('all');
                            setStatusFilter('all');
                            setConfigFilter('all');
                        }}>
                            <SlidersHorizontal className="h-4 w-4" />
                            {labels.resetFilters}
                        </Button>
                    </div>
                </div>

                <div className="p-5">
                    {loading ? (
                        <div className="flex min-h-[360px] items-center justify-center text-muted-foreground">
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            {t.common.loading}
                        </div>
                    ) : error ? (
                        <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
                            <p className="max-w-md text-sm text-destructive">{error}</p>
                            <Button variant="outline" onClick={() => void onReload()}>{labels.refresh}</Button>
                        </div>
                    ) : filteredViewModels.length === 0 ? (
                        <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                            <p>{labels.noUsers}</p>
                            <Button variant="outline" onClick={openCreateDialog}>
                                <Plus className="h-4 w-4" />
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
            </div>

            <Card className="border-dashed">
                <CardContent className="flex flex-col gap-2 p-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                    <span>{labels.usersGovernanceHint}</span>
                    <Badge variant="outline">{labels.fourLayerModel}</Badge>
                </CardContent>
            </Card>

            <UserForm
                open={createOpen || !!editUser}
                mode={createOpen ? 'create' : 'edit'}
                form={form}
                labels={labels}
                organizations={activeOrganizations}
                assignableRoles={assignableRoles}
                permissions={permissions}
                permissionMap={permissionMap}
                selectedRolePermissionKeys={selectedRolePermissionKeys}
                grantablePermissions={grantablePermissions}
                revokablePermissions={revokablePermissions}
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
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{labels.deleteUserTitle}</DialogTitle>
                        <DialogDescription>{labels.deleteConfirmDescription}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {deleteDialogError && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {deleteDialogError}
                            </div>
                        )}
                        {deleteUser && (
                            <div className="rounded-md border bg-muted/20 p-4">
                                <p className="text-sm font-medium">{deleteUser.display_name}</p>
                                <p className="font-mono text-xs text-muted-foreground">{deleteUser.user_code}</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeDialogs} disabled={saving}>
                            {t.common.cancel}
                        </Button>
                        <Button variant="destructive" onClick={() => void handleDeleteUser()} disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {labels.deleteConfirmAction}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!rotateUser} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{labels.rotateKeyTitle}</DialogTitle>
                        <DialogDescription>
                            {rotateUser ? `${rotateUser.display_name} (${rotateUser.user_code})` : labels.rotateKeyTitle}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {rotateDialogError && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {rotateDialogError}
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="rotate-key">{labels.customKey}</Label>
                            <Input
                                id="rotate-key"
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
                                <p className="text-xs text-destructive">{rotateErrors.accessKey}</p>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">{labels.generatedKeyHint}</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeDialogs} disabled={saving}>
                            {t.common.cancel}
                        </Button>
                        <Button onClick={() => void handleRotateKey()} disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {labels.rotateUserKey}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
