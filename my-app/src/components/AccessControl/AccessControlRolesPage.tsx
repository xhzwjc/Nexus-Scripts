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
    const [viewRole, setViewRole] = useState<ScriptHubRoleDefinition | null>(null);
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
        setViewRole(null);
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

    const openViewRoleDialog = (role: ScriptHubRoleDefinition) => {
        setForm(mapRoleToForm(role));
        setShowErrors(false);
        setServerErrors({});
        setDialogError(null);
        setViewRole(role);
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
        <section aria-labelledby="access-control-roles-title" className="space-y-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
                        <h2 id="access-control-roles-title" className="text-[18px] font-semibold leading-7 text-[#0E1114] dark:text-white">{labels.rolesTitle}</h2>
                        <p className="text-[12px] leading-5 text-[#B0B2B8]">{labels.rolesPageDesc}</p>
                    </div>
                    <Button className="h-9 shrink-0 rounded-[6px] bg-[#1E3BFA] px-4 text-[13px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={openCreateRoleDialog}>
                        <Plus className="h-3.5 w-3.5" />
                        {labels.createRole}
                    </Button>
            </div>

            <div className="relative max-w-[360px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#B0B2B8]" />
                    <Input
                        className="h-9 rounded-[4px] border-[#E6E7EB] bg-white pl-9 text-[12px] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-950"
                        placeholder={labels.rolesSearchPlaceholder}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
            </div>

            <div>
                {loading ? (
                    <div className="flex min-h-[360px] items-center justify-center rounded-[8px] border border-[#EBEEF5] text-[12px] text-[#86888F]">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t.common.loading}
                    </div>
                ) : error ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-[8px] border border-[#EBEEF5] text-center">
                        <p className="max-w-md text-[12px] text-[#F53F3F]">{error}</p>
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-3 text-[12px] font-normal text-[#0F23D9] shadow-none" onClick={() => void onReload()}>{labels.refresh}</Button>
                    </div>
                ) : filteredRoles.length === 0 ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-[8px] border border-[#EBEEF5] text-center text-[12px] text-[#86888F]">
                        <p>{labels.noRoles}</p>
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#1E3BFA] bg-white px-3 text-[12px] font-normal text-[#0F23D9] shadow-none" onClick={openCreateRoleDialog}>
                            <Plus className="h-3.5 w-3.5" />
                            {labels.createRole}
                        </Button>
                    </div>
                ) : (
                    <RoleTable
                        roles={filteredRoles}
                        permissionMap={permissionMap}
                        labels={labels}
                        onView={openViewRoleDialog}
                        onEdit={openEditRoleDialog}
                        onDelete={(role) => {
                            setDeleteDialogError(null);
                            setDeleteRole(role);
                        }}
                    />
                )}
            </div>

            <RoleForm
                open={createOpen || !!editRole || !!viewRole}
                mode={createOpen ? 'create' : 'edit'}
                role={editRole || viewRole}
                form={form}
                permissions={permissions}
                labels={labels}
                showErrors={showErrors}
                errors={mergedErrors}
                dialogError={dialogError}
                saving={saving}
                readOnly={!!viewRole}
                onChange={setForm}
                onFieldChange={clearFieldError}
                onCancel={closeDialogs}
                onSubmit={() => void upsertRole(createOpen ? 'create' : 'edit')}
            />

            <Dialog open={!!deleteRole} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
                <DialogContent className="gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[440px] dark:bg-slate-950">
                    <DialogHeader className="gap-1 border-b border-[#F2F3F5] px-5 pb-4 pr-12 pt-5 text-left dark:border-slate-800">
                        <DialogTitle className="text-[16px] leading-6 text-[#0E1114] dark:text-white">{labels.deleteRoleTitle}</DialogTitle>
                        <DialogDescription className="text-[12px] leading-5 text-[#86888F]">{labels.deleteConfirmRoleDescription}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 px-5 py-4">
                        {deleteDialogError && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {deleteDialogError}
                            </div>
                        )}
                        {deleteRole && (
                            <div className="rounded-[6px] border border-[#EBEEF5] bg-[#FAFAFB] p-3 dark:border-slate-800 dark:bg-slate-900/40">
                                <p className="text-[13px] font-medium text-[#0E1114] dark:text-white">{deleteRole.name}</p>
                                <p className="mt-0.5 font-mono text-[11px] text-[#86888F]">{deleteRole.code}</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="border-t border-[#F2F3F5] bg-[#FAFAFB] px-5 py-4 dark:border-slate-800 dark:bg-slate-900/40">
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-4 text-[12px] font-normal text-[#33353D] shadow-none" onClick={closeDialogs} disabled={saving}>
                            {t.common.cancel}
                        </Button>
                        <Button variant="destructive" className="h-8 rounded-[6px] bg-[#F53F3F] px-4 text-[12px] font-normal text-white shadow-none hover:bg-[#D9363E]" onClick={() => void handleDeleteRole()} disabled={saving}>
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {labels.deleteConfirmAction}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}
