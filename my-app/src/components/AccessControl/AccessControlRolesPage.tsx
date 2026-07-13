'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CopyPlus, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { authenticatedFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { ScriptHubPermissionDefinition, ScriptHubRbacOverview, ScriptHubRoleDefinition } from '@/lib/types';
import { RoleForm, type RoleEditorMode } from './RoleForm';
import { RoleTable, type RoleDirectoryFilter } from './RoleTable';
import type { DeleteMutationResponse, RoleFormErrors, RoleFormState, RoleMutationResponse } from './types';
import {
    categoryLabel,
    createEmptyRoleForm,
    groupPermissionsByCategory,
    mapRoleMutationError,
    mapRoleToForm,
    normalizeRoleForm,
    validateRoleForm,
} from './utils';
import type { AccessControlLabels } from './utils';

interface AccessControlRolesPageProps {
    overview: ScriptHubRbacOverview | null;
    loading: boolean;
    error: string | null;
    onReload: () => Promise<void>;
}

interface PendingNavigation {
    type: 'create' | 'select';
    role?: ScriptHubRoleDefinition;
}

const EMPTY_ROLES: ScriptHubRoleDefinition[] = [];
const EMPTY_PERMISSIONS: ScriptHubPermissionDefinition[] = [];
const CATEGORY_ACCENTS: Record<string, string> = {
    business: '#1E3BFA',
    finance: '#0CC991',
    tax: '#FFAB24',
    ops: '#2E9CFF',
    sms: '#6E56CF',
    biz: '#E5484D',
    resources: '#0CC991',
    platform: '#1E3BFA',
    collaboration: '#2E9CFF',
    recruitment: '#FFAB24',
    'recruitment-config': '#E5484D',
};

function RoleDetailPanel({
    role,
    permissions,
    labels,
    onEdit,
    onClone,
    onDelete,
}: {
    role: ScriptHubRoleDefinition;
    permissions: ScriptHubPermissionDefinition[];
    labels: AccessControlLabels;
    onEdit: () => void;
    onClone: () => void;
    onDelete: () => void;
}) {
    const permissionKeys = useMemo(() => new Set(role.permission_keys), [role.permission_keys]);
    const permissionGroups = useMemo(() => {
        const grouped = groupPermissionsByCategory(permissions);
        return Object.entries(grouped)
            .map(([category, items]) => [category, items.filter((permission) => permissionKeys.has(permission.key))] as const)
            .filter(([, items]) => items.length > 0);
    }, [permissionKeys, permissions]);
    const matchedPermissionCount = permissionGroups.reduce((total, [, items]) => total + items.length, 0);
    const legacyPermissionCount = Math.max(0, role.permission_keys.length - matchedPermissionCount);
    const canDelete = !role.is_system && role.assigned_user_count === 0;

    return (
        <div className="flex h-full min-h-0 flex-col bg-white dark:bg-slate-950">
            <div className="shrink-0 border-b border-[#F2F3F5] px-6 py-5 dark:border-slate-800">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h2 className="text-[17px] font-semibold text-[#0E1114] dark:text-white">{role.name}</h2>
                            <Badge variant="outline" className={`h-5 rounded-[4px] border-transparent px-2 text-[11px] font-normal shadow-none ${role.is_system ? 'bg-[rgba(176,178,184,0.14)] text-[#86888F]' : 'bg-[rgba(46,156,255,0.1)] text-[#2E9CFF]'}`}>
                                {role.is_system ? labels.systemRole : labels.customRole}
                            </Badge>
                            <span className={`inline-flex items-center gap-1.5 text-[11px] ${role.is_active ? 'text-[#0A9C71]' : 'text-[#F53F3F]'}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${role.is_active ? 'bg-[#0CC991]' : 'bg-[#F53F3F]'}`} />
                                {role.is_active ? labels.active : labels.inactive}
                            </span>
                            <span className="font-mono text-[11px] text-[#B0B2B8]">{role.code}</span>
                        </div>
                        <p className="mt-2 max-w-4xl text-[12px] leading-5 text-[#5E5F66] dark:text-slate-300">{role.description || '-'}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#B0B2B8]">
                            <span>{labels.assignedUsers} {role.assigned_user_count}</span>
                            <span>·</span>
                            <span>
                                {labels.landingPageLabel}{' '}
                                {role.landing_page === 'welcome'
                                    ? labels.landingPageWelcome
                                    : role.landing_page === 'home'
                                        ? labels.landingPageHome
                                        : labels.landingPageFirstMenu}
                            </span>
                            <span>·</span>
                            <span>{role.recruitment_menu_grouped ? labels.recruitmentMenuGroupedShort : labels.recruitmentMenuFlatShort}</span>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                        {role.is_system ? (
                            <Button className="h-8 rounded-[6px] bg-[#1E3BFA] px-3.5 text-[12px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={onClone}>
                                <CopyPlus className="h-3.5 w-3.5" />
                                {labels.cloneSystemRole}
                            </Button>
                        ) : (
                            <Button className="h-8 rounded-[6px] bg-[#1E3BFA] px-3.5 text-[12px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={onEdit}>
                                <Pencil className="h-3.5 w-3.5" />
                                {labels.editRole}
                            </Button>
                        )}
                        {!role.is_system && (
                            <Button
                                variant="outline"
                                className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-3 text-[12px] font-normal text-[#F53F3F] shadow-none hover:border-[rgba(245,63,63,0.4)] hover:bg-white hover:text-[#D9363E] disabled:text-[#B0B2B8]"
                                onClick={onDelete}
                                disabled={!canDelete}
                                title={!canDelete ? labels.validationRoleAssignedUsers : undefined}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                {labels.deleteRole}
                            </Button>
                        )}
                    </div>
                </div>

                {role.is_system && (
                    <div className="mt-3 flex items-center gap-2 rounded-[6px] bg-[rgba(255,171,36,0.08)] px-3 py-2 text-[11px] text-[#8A5A00] dark:text-amber-200">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#D48806]" />
                        <span>{labels.systemRoleReadonlyHint}</span>
                    </div>
                )}
            </div>

            <div className="flex shrink-0 items-center justify-between px-6 pb-2.5 pt-3.5">
                <div className="flex items-baseline gap-2.5">
                    <h3 className="text-[13px] font-semibold text-[#0E1114] dark:text-white">{labels.permissionsTitle}</h3>
                    <span className="text-[12px] text-[#86888F]">
                        {labels.selectedLabel} {matchedPermissionCount} / {permissions.length}
                        {legacyPermissionCount > 0 ? ` · ${legacyPermissionCount} ${labels.legacyPermissionCount}` : ''}
                    </span>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-1">
                {permissionGroups.length === 0 ? (
                    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-[12px] text-[#B0B2B8]">
                        <span>{labels.roleNoPermissions}</span>
                        <button type="button" className="text-[#0F23D9]" onClick={role.is_system ? onClone : onEdit}>{labels.assignPermissions}</button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {permissionGroups.map(([category, categoryPermissions]) => (
                            <section key={category} className="space-y-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="h-3 w-[3px] rounded-[2px]" style={{ backgroundColor: CATEGORY_ACCENTS[category] || '#1E3BFA' }} />
                                    <h4 className="text-[12px] font-semibold text-[#0E1114] dark:text-slate-100">{categoryLabel(category, labels)}</h4>
                                    <span className="text-[11px] text-[#B0B2B8]">{categoryPermissions.length}/{categoryPermissions.length}</span>
                                </div>
                                <div className="grid gap-x-4 gap-y-2 2xl:grid-cols-2">
                                    {categoryPermissions.map((permission) => (
                                        <div key={permission.key} className="flex items-start gap-2.5 rounded-[6px] border border-[#1E3BFA] bg-[rgba(30,59,250,0.03)] px-3 py-2">
                                            <Checkbox checked disabled className="mt-0.5 h-[15px] w-[15px] rounded-[3px] border-[#1E3BFA] bg-[#1E3BFA] opacity-100 disabled:cursor-default disabled:opacity-100" />
                                            <span className="min-w-0">
                                                <span className="block text-[12px] text-[#0E1114] dark:text-slate-100">{permission.name}</span>
                                                <span className="mt-0.5 block text-[11px] leading-[1.5] text-[#B0B2B8]">{permission.description}</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export function AccessControlRolesPage({
    overview,
    loading,
    error,
    onReload,
}: AccessControlRolesPageProps) {
    const { t } = useI18n();
    const labels = t.accessControl;
    const [query, setQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<RoleDirectoryFilter>('all');
    const [selectedRoleCode, setSelectedRoleCode] = useState<string | null>(null);
    const [editorMode, setEditorMode] = useState<RoleEditorMode | null>(null);
    const [editorRole, setEditorRole] = useState<ScriptHubRoleDefinition | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleteRole, setDeleteRole] = useState<ScriptHubRoleDefinition | null>(null);
    const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
    const [form, setForm] = useState<RoleFormState>(createEmptyRoleForm());
    const [initialForm, setInitialForm] = useState<RoleFormState>(createEmptyRoleForm());
    const [showErrors, setShowErrors] = useState(false);
    const [serverErrors, setServerErrors] = useState<RoleFormErrors>({});
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [deleteDialogError, setDeleteDialogError] = useState<string | null>(null);

    const roles = overview?.catalog.roles ?? EMPTY_ROLES;
    const permissions = overview?.catalog.permissions ?? EMPTY_PERMISSIONS;
    const visibleRoles = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return roles.filter((role) => {
            const matchesType = roleFilter === 'all' || (roleFilter === 'system' ? role.is_system : !role.is_system);
            const matchesQuery = !normalizedQuery
                || role.code.toLowerCase().includes(normalizedQuery)
                || role.name.toLowerCase().includes(normalizedQuery)
                || (role.description || '').toLowerCase().includes(normalizedQuery);
            return matchesType && matchesQuery;
        });
    }, [query, roleFilter, roles]);
    const selectedRole = useMemo(() => roles.find((role) => role.code === selectedRoleCode) || null, [roles, selectedRoleCode]);
    const formErrors = useMemo(() => validateRoleForm(form, labels), [form, labels]);
    const mergedErrors = useMemo(() => ({ ...serverErrors, ...formErrors }), [formErrors, serverErrors]);
    const isFormValid = Object.keys(formErrors).length === 0;
    const formDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);

    useEffect(() => {
        if (editorMode) return;
        if (!visibleRoles.some((role) => role.code === selectedRoleCode)) {
            setSelectedRoleCode(visibleRoles[0]?.code || null);
        }
    }, [editorMode, selectedRoleCode, visibleRoles]);

    const resetEditorState = () => {
        setEditorMode(null);
        setEditorRole(null);
        setForm(createEmptyRoleForm());
        setInitialForm(createEmptyRoleForm());
        setShowErrors(false);
        setServerErrors({});
        setDialogError(null);
    };

    const clearFieldError = (field: keyof RoleFormErrors) => {
        setServerErrors((current) => {
            if (!current[field]) return current;
            const next = { ...current };
            delete next[field];
            return next;
        });
        setDialogError(null);
    };

    const beginCreate = () => {
        const nextForm = createEmptyRoleForm();
        setForm(nextForm);
        setInitialForm(nextForm);
        setEditorRole(null);
        setEditorMode('create');
        setShowErrors(false);
        setServerErrors({});
        setDialogError(null);
    };

    const beginEdit = (role: ScriptHubRoleDefinition) => {
        const assignablePermissionKeys = new Set(permissions.map((permission) => permission.key));
        const mappedForm = mapRoleToForm(role);
        const nextForm = {
            ...mappedForm,
            permissionKeys: mappedForm.permissionKeys.filter((permissionKey) => assignablePermissionKeys.has(permissionKey)),
        };
        setSelectedRoleCode(role.code);
        setForm(nextForm);
        setInitialForm(nextForm);
        setEditorRole(role);
        setEditorMode('edit');
        setShowErrors(false);
        setServerErrors({});
        setDialogError(null);
    };

    const beginClone = (role: ScriptHubRoleDefinition) => {
        const assignablePermissionKeys = new Set(permissions.map((permission) => permission.key));
        const mappedForm = mapRoleToForm(role);
        const nextForm = {
            ...mappedForm,
            code: '',
            name: `${role.name}${labels.copySuffix}`,
            permissionKeys: mappedForm.permissionKeys.filter((permissionKey) => assignablePermissionKeys.has(permissionKey)),
            isActive: true,
        };
        setSelectedRoleCode(role.code);
        setForm(nextForm);
        setInitialForm(nextForm);
        setEditorRole(role);
        setEditorMode('clone');
        setShowErrors(false);
        setServerErrors({});
        setDialogError(null);
    };

    const requestNavigation = (navigation: PendingNavigation) => {
        if (editorMode && formDirty) {
            setPendingNavigation(navigation);
            return;
        }
        resetEditorState();
        if (navigation.type === 'create') beginCreate();
        if (navigation.type === 'select' && navigation.role) setSelectedRoleCode(navigation.role.code);
    };

    const confirmNavigation = () => {
        const navigation = pendingNavigation;
        setPendingNavigation(null);
        resetEditorState();
        if (!navigation) return;
        if (navigation.type === 'create') beginCreate();
        if (navigation.type === 'select' && navigation.role) setSelectedRoleCode(navigation.role.code);
    };

    const upsertRole = async () => {
        if (!editorMode) return;
        setShowErrors(true);
        setServerErrors({});
        setDialogError(null);
        if (!isFormValid) return;

        const mutationMode = editorMode === 'edit' ? 'edit' : 'create';
        const normalized = normalizeRoleForm(form);
        setSaving(true);
        try {
            const url = mutationMode === 'create'
                ? '/api/admin/rbac/roles'
                : `/api/admin/rbac/roles/${encodeURIComponent(normalized.code)}`;
            const response = await authenticatedFetch(url, {
                method: mutationMode === 'create' ? 'POST' : 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: normalized.code,
                    name: normalized.name,
                    description: normalized.description || undefined,
                    permission_keys: normalized.permissionKeys,
                    is_active: mutationMode === 'edit' ? normalized.isActive : undefined,
                    landing_page: normalized.landingPage,
                    recruitment_menu_grouped: normalized.recruitmentMenuGrouped,
                }),
            });
            const payload = await response.json().catch(() => ({ error: labels.roleSaveFailed })) as RoleMutationResponse;
            if (!response.ok || payload.error) throw new Error(payload.error || labels.roleSaveFailed);

            toast.success(mutationMode === 'create' ? labels.roleCreated : labels.roleUpdated);
            resetEditorState();
            await onReload();
            setSelectedRoleCode(payload.role.code);
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
        if (!deleteRole) return;
        setDeleteDialogError(null);
        setSaving(true);
        try {
            const response = await authenticatedFetch(`/api/admin/rbac/roles/${encodeURIComponent(deleteRole.code)}`, { method: 'DELETE' });
            const payload = await response.json().catch(() => ({ error: labels.deleteFailed })) as DeleteMutationResponse;
            if (!response.ok || payload.error) throw new Error(payload.error || labels.deleteFailed);
            toast.success(labels.roleDeleted);
            setSelectedRoleCode(null);
            setDeleteRole(null);
            await onReload();
        } catch (deleteError) {
            const message = deleteError instanceof Error ? deleteError.message : labels.deleteFailed;
            const mapped = mapRoleMutationError(message, labels);
            setDeleteDialogError(mapped.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[560px] items-center justify-center rounded-[10px] border border-[#EBEEF5] text-[12px] text-[#86888F]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t.common.loading}
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[560px] flex-col items-center justify-center gap-3 rounded-[10px] border border-[#EBEEF5] px-6 text-center">
                <p className="max-w-md text-[12px] leading-5 text-[#F53F3F]">{error}</p>
                <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-3 text-[12px] font-normal text-[#0F23D9] shadow-none" onClick={() => void onReload()}>{labels.refresh}</Button>
            </div>
        );
    }

    return (
        <section
            aria-label={labels.rolesTitle}
            className={cn(
                'flex min-h-[520px] gap-4',
                editorMode
                    ? 'h-[744px] max-h-[calc(100vh-150px)]'
                    : 'h-[620px] max-h-[calc(100vh-210px)]',
            )}
        >
            <RoleTable
                roles={roles}
                visibleRoles={visibleRoles}
                selectedRoleCode={editorMode === 'create' ? null : selectedRoleCode}
                query={query}
                filter={roleFilter}
                labels={labels}
                onQueryChange={setQuery}
                onFilterChange={setRoleFilter}
                onSelect={(role) => requestNavigation({ type: 'select', role })}
                onCreate={() => requestNavigation({ type: 'create' })}
            />

            <div className="min-w-0 flex-1 overflow-hidden rounded-[10px] border border-[#EBEEF5] bg-white dark:border-slate-800 dark:bg-slate-950">
                {editorMode ? (
                    <RoleForm
                        mode={editorMode}
                        role={editorRole}
                        form={form}
                        permissions={permissions}
                        labels={labels}
                        showErrors={showErrors}
                        errors={mergedErrors}
                        dialogError={dialogError}
                        saving={saving}
                        onChange={setForm}
                        onFieldChange={clearFieldError}
                        onCancel={resetEditorState}
                        onSubmit={() => void upsertRole()}
                    />
                ) : selectedRole ? (
                    <RoleDetailPanel
                        role={selectedRole}
                        permissions={permissions}
                        labels={labels}
                        onEdit={() => beginEdit(selectedRole)}
                        onClone={() => beginClone(selectedRole)}
                        onDelete={() => {
                            setDeleteDialogError(null);
                            setDeleteRole(selectedRole);
                        }}
                    />
                ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-[12px] text-[#86888F]">
                        <p>{labels.noRoles}</p>
                        <Button className="h-8 rounded-[6px] bg-[#1E3BFA] px-3 text-[12px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={beginCreate}>
                            <Plus className="h-3.5 w-3.5" />
                            {labels.createRole}
                        </Button>
                    </div>
                )}
            </div>

            <Dialog open={!!pendingNavigation} onOpenChange={(open) => { if (!open) setPendingNavigation(null); }}>
                <DialogContent className="gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[420px] dark:bg-slate-950">
                    <DialogHeader className="gap-1 border-b border-[#F2F3F5] px-5 pb-4 pr-12 pt-5 text-left dark:border-slate-800">
                        <DialogTitle className="text-[16px] leading-6 text-[#0E1114] dark:text-white">{labels.unsavedRoleTitle}</DialogTitle>
                        <DialogDescription className="text-[12px] leading-5 text-[#86888F]">{labels.unsavedRoleDescription}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="border-t border-[#F2F3F5] bg-[#FAFAFB] px-5 py-4 dark:border-slate-800 dark:bg-slate-900/40">
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-4 text-[12px] font-normal text-[#33353D] shadow-none" onClick={() => setPendingNavigation(null)}>{labels.continueEditing}</Button>
                        <Button className="h-8 rounded-[6px] bg-[#1E3BFA] px-4 text-[12px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={confirmNavigation}>{labels.discardChanges}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!deleteRole} onOpenChange={(open) => { if (!open) setDeleteRole(null); }}>
                <DialogContent className="gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[440px] dark:bg-slate-950">
                    <DialogHeader className="gap-1 border-b border-[#F2F3F5] px-5 pb-4 pr-12 pt-5 text-left dark:border-slate-800">
                        <DialogTitle className="text-[16px] leading-6 text-[#0E1114] dark:text-white">{labels.deleteRoleTitle}</DialogTitle>
                        <DialogDescription className="text-[12px] leading-5 text-[#86888F]">{labels.deleteConfirmRoleDescription}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 px-5 py-4">
                        {deleteDialogError && (
                            <div role="alert" className="rounded-[6px] border border-[rgba(245,63,63,0.24)] bg-[rgba(245,63,63,0.06)] px-3 py-2 text-[12px] leading-5 text-[#F53F3F]">{deleteDialogError}</div>
                        )}
                        {deleteRole && (
                            <div className="rounded-[6px] border border-[#EBEEF5] bg-[#FAFAFB] p-3 dark:border-slate-800 dark:bg-slate-900/40">
                                <p className="text-[13px] font-medium text-[#0E1114] dark:text-white">{deleteRole.name}</p>
                                <p className="mt-0.5 font-mono text-[11px] text-[#86888F]">{deleteRole.code}</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="border-t border-[#F2F3F5] bg-[#FAFAFB] px-5 py-4 dark:border-slate-800 dark:bg-slate-900/40">
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-4 text-[12px] font-normal text-[#33353D] shadow-none" onClick={() => setDeleteRole(null)} disabled={saving}>{t.common.cancel}</Button>
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
