'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { toast } from '@/lib/toast';
import { authenticatedFetch } from '@/lib/auth';
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
import type { ScriptHubPermissionDefinition, ScriptHubRbacOverview, ScriptHubRoleDefinition } from '@/lib/types';
import { RoleForm } from './RoleForm';
import { RoleTable } from './RoleTable';
import type { DeleteMutationResponse, RoleFormErrors, RoleMutationResponse } from './types';
import {
    createEmptyRoleForm,
    createPermissionMap,
    mapRoleMutationError,
    mapRoleToForm,
    normalizeRoleForm,
    validateRoleForm,
} from './utils';

interface AccessControlRolesPageProps {
    overview: ScriptHubRbacOverview | null;
    loading: boolean;
    error: string | null;
    onReload: () => Promise<void>;
}

const EMPTY_ROLES: ScriptHubRoleDefinition[] = [];
const EMPTY_PERMISSIONS: ScriptHubPermissionDefinition[] = [];

export function AccessControlRolesPage({
    overview,
    loading,
    error,
    onReload,
}: AccessControlRolesPageProps) {
    const { t } = useI18n();
    const labels = t.accessControl;
    const [query, setQuery] = useState('');
    const [saving, setSaving] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [editRole, setEditRole] = useState<ScriptHubRoleDefinition | null>(null);
    const [deleteRole, setDeleteRole] = useState<ScriptHubRoleDefinition | null>(null);
    const [form, setForm] = useState(createEmptyRoleForm());
    const [showErrors, setShowErrors] = useState(false);
    const [serverErrors, setServerErrors] = useState<RoleFormErrors>({});
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [deleteDialogError, setDeleteDialogError] = useState<string | null>(null);

    const roles = overview?.catalog.roles ?? EMPTY_ROLES;
    const permissions = overview?.catalog.permissions ?? EMPTY_PERMISSIONS;
    const permissionMap = useMemo(() => createPermissionMap(permissions), [permissions]);
    const filteredRoles = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
            return roles;
        }
        return roles.filter((role) => (
            role.code.toLowerCase().includes(normalizedQuery) ||
            role.name.toLowerCase().includes(normalizedQuery) ||
            (role.description || '').toLowerCase().includes(normalizedQuery)
        ));
    }, [query, roles]);

    const formErrors = useMemo(() => validateRoleForm(form, labels), [form, labels]);
    const mergedErrors = useMemo(() => ({ ...serverErrors, ...formErrors }), [formErrors, serverErrors]);
    const isFormValid = Object.keys(formErrors).length === 0;

    const closeDialogs = () => {
        setCreateOpen(false);
        setEditRole(null);
        setDeleteRole(null);
        setForm(createEmptyRoleForm());
        setShowErrors(false);
        setServerErrors({});
        setDialogError(null);
        setDeleteDialogError(null);
    };

    const clearFieldError = (field: keyof RoleFormErrors) => {
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

    const openCreateRoleDialog = () => {
        setForm(createEmptyRoleForm());
        setShowErrors(false);
        setServerErrors({});
        setDialogError(null);
        setCreateOpen(true);
    };

    const openEditRoleDialog = (role: ScriptHubRoleDefinition) => {
        setForm(mapRoleToForm(role));
        setShowErrors(false);
        setServerErrors({});
        setDialogError(null);
        setEditRole(role);
    };

    const upsertRole = async (mode: 'create' | 'edit') => {
        setShowErrors(true);
        setServerErrors({});
        setDialogError(null);
        if (!isFormValid) {
            return;
        }

        const normalized = normalizeRoleForm(form);
        setSaving(true);
        try {
            const url = mode === 'create'
                ? '/api/admin/rbac/roles'
                : `/api/admin/rbac/roles/${encodeURIComponent(normalized.code)}`;
            const response = await authenticatedFetch(url, {
                method: mode === 'create' ? 'POST' : 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    code: normalized.code,
                    name: normalized.name,
                    description: normalized.description || undefined,
                    permission_keys: normalized.permissionKeys,
                    is_active: mode === 'edit' ? normalized.isActive : undefined,
                    landing_page: normalized.landingPage,
                    recruitment_menu_grouped: normalized.recruitmentMenuGrouped,
                }),
            });
            const payload = await response.json().catch(() => ({ error: labels.roleSaveFailed })) as RoleMutationResponse;
            if (!response.ok || payload.error) {
                throw new Error(payload.error || labels.roleSaveFailed);
            }

            toast.success(mode === 'create' ? labels.roleCreated : labels.roleUpdated);
            closeDialogs();
            await onReload();
        } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : labels.roleSaveFailed;
            const mapped = mapRoleMutationError(message, labels);
            if ('field' in mapped) {
                setServerErrors((current) => ({ ...current, [mapped.field]: mapped.message }));
            } else {
                setDialogError(mapped.message);
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteRole = async () => {
        if (!deleteRole) {
            return;
        }

        setDeleteDialogError(null);
        setSaving(true);
        try {
            const response = await authenticatedFetch(`/api/admin/rbac/roles/${encodeURIComponent(deleteRole.code)}`, {
                method: 'DELETE',
            });
            const payload = await response.json().catch(() => ({ error: labels.deleteFailed })) as DeleteMutationResponse;
            if (!response.ok || payload.error) {
                throw new Error(payload.error || labels.deleteFailed);
            }

            toast.success(labels.roleDeleted);
            closeDialogs();
            await onReload();
        } catch (deleteError) {
            const message = deleteError instanceof Error ? deleteError.message : labels.deleteFailed;
            const mapped = mapRoleMutationError(message, labels);
            setDeleteDialogError('field' in mapped ? mapped.message : mapped.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rounded-lg border bg-card">
            <div className="border-b px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">{labels.rolesTitle}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{labels.rolesPageDesc}</p>
                    </div>
                    <Button onClick={openCreateRoleDialog}>
                        <Plus className="h-4 w-4" />
                        {labels.createRole}
                    </Button>
                </div>
            </div>
            <div className="border-b bg-muted/20 px-5 py-4">
                <div className="relative max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        placeholder={labels.rolesSearchPlaceholder}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
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
                ) : filteredRoles.length === 0 ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                        <p>{labels.noRoles}</p>
                        <Button variant="outline" onClick={openCreateRoleDialog}>
                            <Plus className="h-4 w-4" />
                            {labels.createRole}
                        </Button>
                    </div>
                ) : (
                    <RoleTable
                        roles={filteredRoles}
                        permissionMap={permissionMap}
                        labels={labels}
                        onEdit={openEditRoleDialog}
                        onDelete={(role) => {
                            setDeleteDialogError(null);
                            setDeleteRole(role);
                        }}
                    />
                )}
            </div>

            <RoleForm
                open={createOpen || !!editRole}
                mode={createOpen ? 'create' : 'edit'}
                role={editRole}
                form={form}
                permissions={permissions}
                labels={labels}
                showErrors={showErrors}
                errors={mergedErrors}
                dialogError={dialogError}
                saving={saving}
                onChange={setForm}
                onFieldChange={clearFieldError}
                onCancel={closeDialogs}
                onSubmit={() => void upsertRole(createOpen ? 'create' : 'edit')}
            />

            <Dialog open={!!deleteRole} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{labels.deleteRoleTitle}</DialogTitle>
                        <DialogDescription>{labels.deleteConfirmRoleDescription}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {deleteDialogError && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {deleteDialogError}
                            </div>
                        )}
                        {deleteRole && (
                            <div className="rounded-md border bg-muted/20 p-4">
                                <p className="text-sm font-medium">{deleteRole.name}</p>
                                <p className="font-mono text-xs text-muted-foreground">{deleteRole.code}</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeDialogs} disabled={saving}>
                            {t.common.cancel}
                        </Button>
                        <Button variant="destructive" onClick={() => void handleDeleteRole()} disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {labels.deleteConfirmAction}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
