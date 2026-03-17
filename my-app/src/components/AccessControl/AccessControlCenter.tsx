'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft,
    Copy,
    History,
    KeyRound,
    Loader2,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    Shield,
    Trash2,
    UserCog,
} from 'lucide-react';
import { toast } from 'sonner';

import { authenticatedFetch, clearScriptHubSession, getStoredScriptHubSession } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type {
    ScriptHubAuditLogEntry,
    ScriptHubManagedUser,
    ScriptHubPermissionDefinition,
    ScriptHubRbacOverview,
    ScriptHubRoleDefinition,
} from '@/lib/types';
import type { Translations } from '@/lib/i18n/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

interface AccessControlCenterProps {
    onBack: () => void;
}

interface UserFormState {
    userCode: string;
    displayName: string;
    accessKey: string;
    teamResourcesLoginKeyEnabled: boolean;
    roleCodes: string[];
    grantedPermissions: string[];
    revokedPermissions: string[];
    isActive: boolean;
    isSuperAdmin: boolean;
    notes: string;
}

interface UserFormErrors {
    userCode?: string;
    displayName?: string;
    roleCodes?: string;
    accessKey?: string;
}

interface RoleFormState {
    code: string;
    name: string;
    description: string;
    permissionKeys: string[];
    isActive: boolean;
}

interface RoleFormErrors {
    code?: string;
    name?: string;
    permissionKeys?: string;
}

interface RotateKeyErrors {
    accessKey?: string;
}

type UserMutationErrorResult =
    | { field: keyof UserFormErrors; message: string }
    | { message: string };

type RoleMutationErrorResult =
    | { field: keyof RoleFormErrors; message: string }
    | { message: string };

type RotateKeyErrorResult =
    | { field: keyof RotateKeyErrors; message: string }
    | { message: string };

interface MutationResponse {
    user: ScriptHubManagedUser;
    generated_access_key?: string | null;
    error?: string;
}

interface RoleMutationResponse {
    role: ScriptHubRoleDefinition;
    error?: string;
}

interface DeleteMutationResponse {
    message?: string;
    target_code?: string;
    error?: string;
}

function createEmptyForm(): UserFormState {
    return {
        userCode: '',
        displayName: '',
        accessKey: '',
        teamResourcesLoginKeyEnabled: false,
        roleCodes: [],
        grantedPermissions: [],
        revokedPermissions: [],
        isActive: true,
        isSuperAdmin: false,
        notes: '',
    };
}

function createEmptyRoleForm(): RoleFormState {
    return {
        code: '',
        name: '',
        description: '',
        permissionKeys: [],
        isActive: true,
    };
}

function mapUserToForm(user: ScriptHubManagedUser): UserFormState {
    return {
        userCode: user.user_code,
        displayName: user.display_name,
        accessKey: '',
        teamResourcesLoginKeyEnabled: user.team_resources_login_key_enabled,
        roleCodes: [...user.role_codes],
        grantedPermissions: [...user.granted_overrides],
        revokedPermissions: [...user.revoked_overrides],
        isActive: user.is_active,
        isSuperAdmin: user.is_super_admin,
        notes: user.notes || '',
    };
}

function mapRoleToForm(role: ScriptHubRoleDefinition): RoleFormState {
    return {
        code: role.code,
        name: role.name,
        description: role.description || '',
        permissionKeys: [...role.permission_keys],
        isActive: role.is_active,
    };
}

function toggleItem(list: string[], item: string, checked: boolean) {
    if (checked) {
        return list.includes(item) ? list : [...list, item];
    }
    return list.filter((value) => value !== item);
}

function normalizeUserForm(form: UserFormState): UserFormState {
    return {
        ...form,
        userCode: form.userCode.trim().toLowerCase(),
        displayName: form.displayName.trim(),
        accessKey: form.accessKey.trim(),
        notes: form.notes.trim(),
    };
}

function normalizeRoleForm(form: RoleFormState): RoleFormState {
    return {
        ...form,
        code: form.code.trim().toLowerCase(),
        name: form.name.trim(),
        description: form.description.trim(),
    };
}

function formatDateTime(value?: string | null) {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

function groupPermissionsByCategory(permissions: ScriptHubPermissionDefinition[]) {
    return permissions.reduce<Record<string, ScriptHubPermissionDefinition[]>>((acc, permission) => {
        acc[permission.category] = acc[permission.category] || [];
        acc[permission.category].push(permission);
        return acc;
    }, {});
}

function categoryLabel(category: string) {
    switch (category) {
        case 'business':
            return 'Business';
        case 'resources':
            return 'Resources';
        case 'platform':
            return 'Platform';
        case 'collaboration':
            return 'Collaboration';
        default:
            return category;
    }
}

function formatAuditAction(action: string, labels: AccessControlLabels) {
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
        default:
            return action;
    }
}

function formatAuditValue(value: unknown): string {
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

function summarizeAuditDetails(details: Record<string, unknown>) {
    return Object.entries(details)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}: ${formatAuditValue(value)}`)
        .join(' | ');
}

type AccessControlLabels = Translations['accessControl'];

function mapUserMutationError(message: string, labels: AccessControlLabels): UserMutationErrorResult {
    if (message.includes('User code already exists')) {
        return { field: 'userCode' as const, message: labels.validationUserCodeDuplicate };
    }
    if (message.includes('Access key already exists')) {
        return { field: 'accessKey' as const, message: labels.validationAccessKeyDuplicate };
    }
    if (message.includes('At least one role is required')) {
        return { field: 'roleCodes' as const, message: labels.validationRoleRequired };
    }
    return { message: message || labels.validationFormSubmitFailed };
}

function mapRoleMutationError(message: string, labels: AccessControlLabels): RoleMutationErrorResult {
    if (message.includes('Role code already exists')) {
        return { field: 'code' as const, message: labels.validationRoleCodeDuplicate };
    }
    if (message.includes('At least one permission is required')) {
        return { field: 'permissionKeys' as const, message: labels.validationRolePermissionRequired };
    }
    if (message.includes('System roles are read-only')) {
        return { message: labels.validationRoleReadOnly };
    }
    if (message.includes('still assigned to users')) {
        return { message: labels.validationRoleAssignedUsers };
    }
    return { message: message || labels.validationFormSubmitFailed };
}

function mapRotateKeyError(message: string, labels: AccessControlLabels): RotateKeyErrorResult {
    if (message.includes('Access key already exists')) {
        return { field: 'accessKey' as const, message: labels.validationAccessKeyDuplicate };
    }
    return { message: message || labels.validationFormSubmitFailed };
}

function mapDeleteUserError(message: string, labels: AccessControlLabels): string {
    if (message.includes('At least one active administrator must remain')) {
        return labels.validationLastAdminRequired;
    }
    return message || labels.deleteFailed;
}

export function AccessControlCenter({ onBack }: AccessControlCenterProps) {
    const { t } = useI18n();
    const userDialogFocusRef = useRef<HTMLDivElement | null>(null);
    const userCodeInputRef = useRef<HTMLInputElement | null>(null);
    const [overview, setOverview] = useState<ScriptHubRbacOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [editUser, setEditUser] = useState<ScriptHubManagedUser | null>(null);
    const [createRoleOpen, setCreateRoleOpen] = useState(false);
    const [editRole, setEditRole] = useState<ScriptHubRoleDefinition | null>(null);
    const [rotateUser, setRotateUser] = useState<ScriptHubManagedUser | null>(null);
    const [deleteUser, setDeleteUser] = useState<ScriptHubManagedUser | null>(null);
    const [deleteRole, setDeleteRole] = useState<ScriptHubRoleDefinition | null>(null);
    const [lastGeneratedKey, setLastGeneratedKey] = useState<{ userCode: string; accessKey: string } | null>(null);
    const [form, setForm] = useState<UserFormState>(createEmptyForm());
    const [roleForm, setRoleForm] = useState<RoleFormState>(createEmptyRoleForm());
    const [customRotateKey, setCustomRotateKey] = useState('');
    const [showFormErrors, setShowFormErrors] = useState(false);
    const [showRoleFormErrors, setShowRoleFormErrors] = useState(false);
    const [serverUserErrors, setServerUserErrors] = useState<UserFormErrors>({});
    const [serverRoleErrors, setServerRoleErrors] = useState<RoleFormErrors>({});
    const [rotateKeyErrors, setRotateKeyErrors] = useState<RotateKeyErrors>({});
    const [userDialogError, setUserDialogError] = useState<string | null>(null);
    const [roleDialogError, setRoleDialogError] = useState<string | null>(null);
    const [rotateDialogError, setRotateDialogError] = useState<string | null>(null);
    const [deleteDialogError, setDeleteDialogError] = useState<string | null>(null);

    const roleMap = useMemo(() => {
        return new Map((overview?.catalog.roles || []).map((role) => [role.code, role]));
    }, [overview]);

    const assignableRoles = useMemo(() => {
        return (overview?.catalog.roles || []).filter((role) => role.is_active);
    }, [overview]);

    const permissionMap = useMemo(() => {
        return new Map((overview?.catalog.permissions || []).map((permission) => [permission.key, permission]));
    }, [overview]);

    const filteredUsers = useMemo(() => {
        const users = overview?.users || [];
        const query = searchQuery.trim().toLowerCase();
        if (!query) {
            return users;
        }

        return users.filter((user) => {
            const roleText = user.role_codes
                .map((roleCode) => roleMap.get(roleCode)?.name || roleCode)
                .join(' ')
                .toLowerCase();
            return (
                user.user_code.toLowerCase().includes(query) ||
                user.display_name.toLowerCase().includes(query) ||
                roleText.includes(query)
            );
        });
    }, [overview, roleMap, searchQuery]);

    const handleUserDialogOpenAutoFocus = useCallback((event: Event) => {
        event.preventDefault();

        requestAnimationFrame(() => {
            if (createOpen) {
                userCodeInputRef.current?.focus();
                return;
            }
            userDialogFocusRef.current?.focus();
        });
    }, [createOpen]);

    const selectedRolePermissionKeys = useMemo(() => {
        const keys = new Set<string>();
        form.roleCodes.forEach((roleCode) => {
            roleMap.get(roleCode)?.permission_keys.forEach((permissionKey) => keys.add(permissionKey));
        });
        return [...keys].sort();
    }, [form.roleCodes, roleMap]);

    const grantablePermissions = useMemo(() => {
        return (overview?.catalog.permissions || []).filter((permission) => !selectedRolePermissionKeys.includes(permission.key));
    }, [overview, selectedRolePermissionKeys]);

    const revokablePermissions = useMemo(() => {
        return (overview?.catalog.permissions || []).filter((permission) => selectedRolePermissionKeys.includes(permission.key));
    }, [overview, selectedRolePermissionKeys]);

    const permissionGroups = useMemo(() => {
        return groupPermissionsByCategory(overview?.catalog.permissions || []);
    }, [overview]);

    const normalizedForm = useMemo(() => normalizeUserForm(form), [form]);
    const normalizedRoleForm = useMemo(() => normalizeRoleForm(roleForm), [roleForm]);

    const formErrors = useMemo<UserFormErrors>(() => {
        const errors: UserFormErrors = {};

        if (!normalizedForm.userCode) {
            errors.userCode = t.accessControl.validationUserCodeRequired;
        } else if (!/^[a-z0-9][a-z0-9._-]{1,99}$/.test(normalizedForm.userCode)) {
            errors.userCode = t.accessControl.validationUserCodePattern;
        }

        if (!normalizedForm.displayName) {
            errors.displayName = t.accessControl.validationDisplayNameRequired;
        }

        if (normalizedForm.roleCodes.length === 0) {
            errors.roleCodes = t.accessControl.validationRoleRequired;
        }

        return errors;
    }, [
        normalizedForm.displayName,
        normalizedForm.roleCodes,
        normalizedForm.userCode,
        t.accessControl.validationDisplayNameRequired,
        t.accessControl.validationRoleRequired,
        t.accessControl.validationUserCodePattern,
        t.accessControl.validationUserCodeRequired,
    ]);

    const mergedUserErrors = useMemo<UserFormErrors>(() => ({
        ...serverUserErrors,
        ...formErrors,
    }), [formErrors, serverUserErrors]);

    const isFormValid = Object.keys(formErrors).length === 0;

    const roleFormErrors = useMemo<RoleFormErrors>(() => {
        const errors: RoleFormErrors = {};

        if (!normalizedRoleForm.code) {
            errors.code = t.accessControl.validationRoleCodeRequired;
        } else if (!/^[a-z0-9][a-z0-9._-]{1,99}$/.test(normalizedRoleForm.code)) {
            errors.code = t.accessControl.validationRoleCodePattern;
        }

        if (!normalizedRoleForm.name) {
            errors.name = t.accessControl.validationRoleNameRequired;
        }

        if (normalizedRoleForm.permissionKeys.length === 0) {
            errors.permissionKeys = t.accessControl.validationRolePermissionRequired;
        }

        return errors;
    }, [
        normalizedRoleForm.code,
        normalizedRoleForm.name,
        normalizedRoleForm.permissionKeys.length,
        t.accessControl.validationRoleCodePattern,
        t.accessControl.validationRoleCodeRequired,
        t.accessControl.validationRoleNameRequired,
        t.accessControl.validationRolePermissionRequired,
    ]);

    const mergedRoleErrors = useMemo<RoleFormErrors>(() => ({
        ...serverRoleErrors,
        ...roleFormErrors,
    }), [roleFormErrors, serverRoleErrors]);

    const isRoleFormValid = Object.keys(roleFormErrors).length === 0;

    const loadOverview = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await authenticatedFetch('/api/admin/rbac/overview', {
                cache: 'no-store',
            });
            const payload = await response.json().catch(() => ({ error: t.accessControl.loadFailed })) as ScriptHubRbacOverview & { error?: string };
            if (!response.ok || payload.error) {
                throw new Error(payload.error || t.accessControl.loadFailed);
            }
            setOverview(payload);
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : t.accessControl.loadFailed;
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [t.accessControl.loadFailed]);

    useEffect(() => {
        void loadOverview();
    }, [loadOverview]);

    const openCreateDialog = () => {
        setForm(createEmptyForm());
        setShowFormErrors(false);
        setServerUserErrors({});
        setUserDialogError(null);
        setCreateOpen(true);
    };

    const openCreateRoleDialog = () => {
        setRoleForm(createEmptyRoleForm());
        setShowRoleFormErrors(false);
        setServerRoleErrors({});
        setRoleDialogError(null);
        setCreateRoleOpen(true);
    };

    const openEditDialog = (user: ScriptHubManagedUser) => {
        setForm(mapUserToForm(user));
        setShowFormErrors(false);
        setServerUserErrors({});
        setUserDialogError(null);
        setEditUser(user);
    };

    const openEditRoleDialog = (role: ScriptHubRoleDefinition) => {
        setRoleForm(mapRoleToForm(role));
        setShowRoleFormErrors(false);
        setServerRoleErrors({});
        setRoleDialogError(null);
        setEditRole(role);
    };

    const closeDialogs = () => {
        setCreateOpen(false);
        setEditUser(null);
        setCreateRoleOpen(false);
        setEditRole(null);
        setRotateUser(null);
        setDeleteUser(null);
        setDeleteRole(null);
        setCustomRotateKey('');
        setForm(createEmptyForm());
        setRoleForm(createEmptyRoleForm());
        setShowFormErrors(false);
        setShowRoleFormErrors(false);
        setServerUserErrors({});
        setServerRoleErrors({});
        setRotateKeyErrors({});
        setUserDialogError(null);
        setRoleDialogError(null);
        setRotateDialogError(null);
        setDeleteDialogError(null);
    };

    const clearUserFieldError = (field: keyof UserFormErrors) => {
        setServerUserErrors((current) => {
            if (!current[field]) {
                return current;
            }
            const next = { ...current };
            delete next[field];
            return next;
        });
        setUserDialogError(null);
    };

    const clearRoleFieldError = (field: keyof RoleFormErrors) => {
        setServerRoleErrors((current) => {
            if (!current[field]) {
                return current;
            }
            const next = { ...current };
            delete next[field];
            return next;
        });
        setRoleDialogError(null);
    };

    const clearRotateFieldError = (field: keyof RotateKeyErrors) => {
        setRotateKeyErrors((current) => {
            if (!current[field]) {
                return current;
            }
            const next = { ...current };
            delete next[field];
            return next;
        });
        setRotateDialogError(null);
    };

    const handleCopyKey = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(t.common.copied);
        } catch {
            toast.error(t.common.failed);
        }
    };

    const upsertUser = async (mode: 'create' | 'edit') => {
        setShowFormErrors(true);
        setServerUserErrors({});
        setUserDialogError(null);
        if (!isFormValid) {
            return;
        }

        setSaving(true);
        try {
            const filteredGrantedPermissions = normalizedForm.grantedPermissions.filter((permissionKey) => !selectedRolePermissionKeys.includes(permissionKey));
            const filteredRevokedPermissions = normalizedForm.revokedPermissions.filter((permissionKey) => selectedRolePermissionKeys.includes(permissionKey));
            const url = mode === 'create'
                ? '/api/admin/rbac/users'
                : `/api/admin/rbac/users/${encodeURIComponent(normalizedForm.userCode)}`;
            const response = await authenticatedFetch(url, {
                method: mode === 'create' ? 'POST' : 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_code: normalizedForm.userCode,
                    display_name: normalizedForm.displayName,
                    access_key: mode === 'create' ? normalizedForm.accessKey || undefined : undefined,
                    team_resources_login_key_enabled: normalizedForm.teamResourcesLoginKeyEnabled,
                    role_codes: normalizedForm.roleCodes,
                    granted_permissions: filteredGrantedPermissions,
                    revoked_permissions: filteredRevokedPermissions,
                    is_active: normalizedForm.isActive,
                    is_super_admin: normalizedForm.isSuperAdmin,
                    notes: normalizedForm.notes || undefined,
                }),
            });
            const payload = await response.json().catch(() => ({ error: t.accessControl.saveFailed })) as MutationResponse;
            if (!response.ok || payload.error) {
                throw new Error(payload.error || t.accessControl.saveFailed);
            }

            setLastGeneratedKey(payload.generated_access_key
                ? { userCode: payload.user.user_code, accessKey: payload.generated_access_key }
                : null);
            toast.success(mode === 'create' ? t.accessControl.userCreated : t.accessControl.userUpdated);
            closeDialogs();
            await loadOverview();
        } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : t.accessControl.saveFailed;
            const mapped = mapUserMutationError(message, t.accessControl);
            if ('field' in mapped) {
                setServerUserErrors((current) => ({ ...current, [mapped.field]: mapped.message }));
            } else {
                setUserDialogError(mapped.message);
            }
        } finally {
            setSaving(false);
        }
    };

    const handleRotateKey = async () => {
        if (!rotateUser) {
            return;
        }

        setRotateKeyErrors({});
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
            const payload = await response.json().catch(() => ({ error: t.accessControl.saveFailed })) as MutationResponse;
            if (!response.ok || payload.error || !payload.generated_access_key) {
                throw new Error(payload.error || t.accessControl.saveFailed);
            }

            setLastGeneratedKey({ userCode: payload.user.user_code, accessKey: payload.generated_access_key });
            toast.success(t.accessControl.keyRotated);
            closeDialogs();
            await loadOverview();
        } catch (rotateError) {
            const message = rotateError instanceof Error ? rotateError.message : t.accessControl.saveFailed;
            const mapped = mapRotateKeyError(message, t.accessControl);
            if ('field' in mapped) {
                setRotateKeyErrors({ [mapped.field]: mapped.message });
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
            const payload = await response.json().catch(() => ({ error: t.accessControl.deleteFailed })) as DeleteMutationResponse;
            if (!response.ok || payload.error) {
                throw new Error(payload.error || t.accessControl.deleteFailed);
            }

            const currentUserCode = getStoredScriptHubSession()?.user.id;
            const deletedSelf = currentUserCode === deleteUser.user_code;

            toast.success(t.accessControl.userDeleted);
            closeDialogs();

            if (deletedSelf) {
                clearScriptHubSession();
                window.location.reload();
                return;
            }

            await loadOverview();
        } catch (deleteError) {
            const message = deleteError instanceof Error ? deleteError.message : t.accessControl.deleteFailed;
            setDeleteDialogError(mapDeleteUserError(message, t.accessControl));
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
            const payload = await response.json().catch(() => ({ error: t.accessControl.deleteFailed })) as DeleteMutationResponse;
            if (!response.ok || payload.error) {
                throw new Error(payload.error || t.accessControl.deleteFailed);
            }

            toast.success(t.accessControl.roleDeleted);
            closeDialogs();
            await loadOverview();
        } catch (deleteError) {
            const message = deleteError instanceof Error ? deleteError.message : t.accessControl.deleteFailed;
            const mapped = mapRoleMutationError(message, t.accessControl);
            setDeleteDialogError('field' in mapped ? mapped.message : mapped.message);
        } finally {
            setSaving(false);
        }
    };

    const upsertRole = async (mode: 'create' | 'edit') => {
        setShowRoleFormErrors(true);
        setServerRoleErrors({});
        setRoleDialogError(null);
        if (!isRoleFormValid) {
            return;
        }

        setSaving(true);
        try {
            const url = mode === 'create'
                ? '/api/admin/rbac/roles'
                : `/api/admin/rbac/roles/${encodeURIComponent(normalizedRoleForm.code)}`;
            const response = await authenticatedFetch(url, {
                method: mode === 'create' ? 'POST' : 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    code: normalizedRoleForm.code,
                    name: normalizedRoleForm.name,
                    description: normalizedRoleForm.description || undefined,
                    permission_keys: normalizedRoleForm.permissionKeys,
                    is_active: mode === 'edit' ? normalizedRoleForm.isActive : undefined,
                }),
            });
            const payload = await response.json().catch(() => ({ error: t.accessControl.roleSaveFailed })) as RoleMutationResponse;
            if (!response.ok || payload.error) {
                throw new Error(payload.error || t.accessControl.roleSaveFailed);
            }

            toast.success(mode === 'create' ? t.accessControl.roleCreated : t.accessControl.roleUpdated);
            closeDialogs();
            await loadOverview();
        } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : t.accessControl.roleSaveFailed;
            const mapped = mapRoleMutationError(message, t.accessControl);
            if ('field' in mapped) {
                setServerRoleErrors((current) => ({ ...current, [mapped.field]: mapped.message }));
            } else {
                setRoleDialogError(mapped.message);
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-teal-600" />
                            <h1 className="text-2xl font-semibold">{t.accessControl.title}</h1>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{t.accessControl.subtitle}</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void loadOverview()} disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {t.accessControl.refresh}
                    </Button>
                    <Button variant="outline" onClick={openCreateRoleDialog}>
                        <Plus className="h-4 w-4" />
                        {t.accessControl.createRole}
                    </Button>
                    <Button onClick={openCreateDialog}>
                        <Plus className="h-4 w-4" />
                        {t.accessControl.addUser}
                    </Button>
                </div>
            </div>

            {lastGeneratedKey && (
                <Card className="border-teal-200 bg-teal-50/70 dark:border-teal-900 dark:bg-teal-950/20">
                    <CardContent className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-sm font-medium text-teal-800 dark:text-teal-200">
                                {t.accessControl.generatedKey}: <span className="font-mono">{lastGeneratedKey.userCode}</span>
                            </p>
                            <p className="mt-1 font-mono text-sm text-teal-900 dark:text-teal-100">{lastGeneratedKey.accessKey}</p>
                            <p className="mt-2 text-xs text-teal-700 dark:text-teal-300">{t.accessControl.generatedKeyHint}</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => void handleCopyKey(lastGeneratedKey.accessKey)}>
                                <Copy className="h-4 w-4" />
                                {t.accessControl.copyKey}
                            </Button>
                            <Button variant="ghost" onClick={() => setLastGeneratedKey(null)}>
                                {t.accessControl.close}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
                <Card>
                    <CardHeader className="gap-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <CardTitle>{t.accessControl.usersTitle}</CardTitle>
                                <CardDescription>{t.accessControl.usersDesc}</CardDescription>
                            </div>
                            <div className="relative w-full lg:w-80">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    className="pl-9"
                                    placeholder={t.accessControl.searchPlaceholder}
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex min-h-[360px] items-center justify-center text-muted-foreground">
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                {t.common.loading}
                            </div>
                        ) : error ? (
                            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
                                <p className="max-w-md text-sm text-destructive">{error}</p>
                                <Button variant="outline" onClick={() => void loadOverview()}>{t.accessControl.refresh}</Button>
                            </div>
                        ) : filteredUsers.length === 0 ? (
                            <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">
                                {t.accessControl.noUsers}
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t.accessControl.userCode}</TableHead>
                                        <TableHead>{t.accessControl.roles}</TableHead>
                                        <TableHead>{t.accessControl.teamResourcesLoginKey}</TableHead>
                                        <TableHead>{t.accessControl.status}</TableHead>
                                        <TableHead>{t.accessControl.effectivePermissions}</TableHead>
                                        <TableHead>{t.accessControl.lastLogin}</TableHead>
                                        <TableHead className="text-right">{t.accessControl.actions}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredUsers.map((user) => (
                                        <TableRow key={user.user_code}>
                                            <TableCell className="align-top">
                                                <div className="space-y-1">
                                                    <p className="font-medium">{user.display_name}</p>
                                                    <p className="font-mono text-xs text-muted-foreground">{user.user_code}</p>
                                                </div>
                                            </TableCell>
                                            <TableCell className="align-top">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {user.role_codes.map((roleCode) => (
                                                        <Badge key={roleCode} variant="secondary">
                                                            {roleMap.get(roleCode)?.name || roleCode}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell className="align-top">
                                                {user.effective_permission_keys.includes('team-resources') ? (
                                                    <Badge variant={user.team_resources_login_key_enabled ? 'default' : 'outline'}>
                                                        {user.team_resources_login_key_enabled
                                                            ? t.accessControl.teamResourcesLoginKeyEnabled
                                                            : t.accessControl.teamResourcesLoginKeyDisabled}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary">
                                                        {t.accessControl.teamResourcesLoginKeyUnavailable}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="align-top">
                                                <div className="flex flex-wrap gap-2">
                                                    <Badge variant={user.is_active ? 'default' : 'outline'}>
                                                        {user.is_active ? t.accessControl.active : t.accessControl.inactive}
                                                    </Badge>
                                                    {user.is_super_admin && (
                                                        <Badge variant="outline">{t.accessControl.superAdmin}</Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="align-top">
                                                <div className="space-y-2">
                                                    <p className="text-sm font-medium">{user.effective_permission_keys.length}</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {user.effective_permission_keys.slice(0, 4).map((permissionKey) => (
                                                            <Badge key={permissionKey} variant="outline">
                                                                {permissionMap.get(permissionKey)?.name || permissionKey}
                                                            </Badge>
                                                        ))}
                                                        {user.effective_permission_keys.length > 4 && (
                                                            <Badge variant="outline">+{user.effective_permission_keys.length - 4}</Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="align-top text-sm text-muted-foreground">
                                                {formatDateTime(user.last_login_at) || t.accessControl.neverLoggedIn}
                                            </TableCell>
                                            <TableCell className="align-top text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => openEditDialog(user)}>
                                                        <UserCog className="h-4 w-4" />
                                                        {t.accessControl.editUser}
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => setRotateUser(user)}>
                                                        <KeyRound className="h-4 w-4" />
                                                        {t.accessControl.rotateUserKey}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={() => {
                                                            setDeleteDialogError(null);
                                                            setDeleteUser(user);
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                        {t.accessControl.deleteUser}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card>
                        <CardHeader className="gap-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <CardTitle>{t.accessControl.rolesTitle}</CardTitle>
                                    <CardDescription>{t.accessControl.catalogTitle}</CardDescription>
                                </div>
                                <Button variant="outline" size="sm" onClick={openCreateRoleDialog}>
                                    <Plus className="h-4 w-4" />
                                    {t.accessControl.createRole}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[260px] pr-4">
                                <div className="space-y-4">
                                    {(overview?.catalog.roles || []).map((role) => (
                                        <div key={role.code} className="rounded-xl border border-border/70 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="font-medium">{role.name}</p>
                                                        <Badge variant={role.is_system ? 'secondary' : 'outline'}>
                                                            {role.is_system ? t.accessControl.systemRole : t.accessControl.customRole}
                                                        </Badge>
                                                        {!role.is_active && (
                                                            <Badge variant="outline">{t.accessControl.inactive}</Badge>
                                                        )}
                                                    </div>
                                                    <p className="mt-1 font-mono text-xs text-muted-foreground">{role.code}</p>
                                                    <p className="mt-1 text-xs text-muted-foreground">{role.description}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline">{role.permission_keys.length}</Badge>
                                                    {!role.is_system && (
                                                        <>
                                                            <Button variant="ghost" size="sm" onClick={() => openEditRoleDialog(role)}>
                                                                <Pencil className="h-4 w-4" />
                                                                {t.accessControl.editRole}
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-destructive hover:text-destructive"
                                                                onClick={() => {
                                                                    setDeleteDialogError(null);
                                                                    setDeleteRole(role);
                                                                }}
                                                                disabled={role.assigned_user_count > 0}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                                {t.accessControl.deleteRole}
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                                                <span>{t.accessControl.assignedUsers}: {role.assigned_user_count}</span>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-1.5">
                                                {role.permission_keys.slice(0, 6).map((permissionKey) => (
                                                    <Badge key={permissionKey} variant="secondary">
                                                        {permissionMap.get(permissionKey)?.name || permissionKey}
                                                    </Badge>
                                                ))}
                                                {role.permission_keys.length > 6 && (
                                                    <Badge variant="outline">+{role.permission_keys.length - 6}</Badge>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex items-start gap-3">
                                <History className="mt-0.5 h-5 w-5 text-teal-600" />
                                <div>
                                    <CardTitle>{t.accessControl.recentActivityTitle}</CardTitle>
                                    <CardDescription>{t.accessControl.recentActivityDesc}</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[320px] pr-4">
                                <div className="space-y-3">
                                    {(overview?.audit_logs || []).length === 0 ? (
                                        <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
                                            {t.accessControl.noAuditLogs}
                                        </div>
                                    ) : (
                                        (overview?.audit_logs || []).map((log: ScriptHubAuditLogEntry) => (
                                            <div key={log.id} className="rounded-xl border border-border/70 p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="font-medium">
                                                            {formatAuditAction(log.action, t.accessControl)}
                                                        </p>
                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                            {t.accessControl.auditActor}: {log.actor_display_name || log.actor_user_code || t.accessControl.auditUnknownActor}
                                                        </p>
                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                            {t.accessControl.auditTarget}: {log.target_type} / {log.target_code}
                                                        </p>
                                                    </div>
                                                    <Badge variant={log.result === 'success' ? 'default' : 'destructive'}>
                                                        {log.result === 'success'
                                                            ? t.accessControl.auditResultSuccess
                                                            : t.accessControl.auditResultFailed}
                                                    </Badge>
                                                </div>
                                                <p className="mt-3 text-xs text-muted-foreground">
                                                    {t.accessControl.auditTime}: {formatDateTime(log.created_at) || '-'}
                                                </p>
                                                {Object.keys(log.details || {}).length > 0 && (
                                                    <p className="mt-2 text-xs text-muted-foreground">
                                                        {t.accessControl.auditDetails}: {summarizeAuditDetails(log.details)}
                                                    </p>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{t.accessControl.permissionsTitle}</CardTitle>
                            <CardDescription>{t.accessControl.catalogTitle}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[320px] pr-4">
                                <div className="space-y-4">
                                    {Object.entries(permissionGroups).map(([category, permissions]) => (
                                        <div key={category}>
                                            <div className="mb-2 flex items-center justify-between">
                                                <p className="text-sm font-medium">{categoryLabel(category)}</p>
                                                <Badge variant="outline">{permissions.length}</Badge>
                                            </div>
                                            <div className="space-y-2">
                                                {permissions.map((permission) => (
                                                    <div key={permission.key} className="rounded-lg border border-border/70 px-3 py-2">
                                                        <p className="text-sm font-medium">{permission.name}</p>
                                                        <p className="mt-1 text-xs text-muted-foreground">{permission.description}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Dialog open={createOpen || !!editUser} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
                <DialogContent className="sm:max-w-5xl" onOpenAutoFocus={handleUserDialogOpenAutoFocus}>
                    <div ref={userDialogFocusRef} tabIndex={-1} className="sr-only" aria-hidden="true" />
                    <DialogHeader>
                        <DialogTitle>{createOpen ? t.accessControl.createTitle : t.accessControl.editTitle}</DialogTitle>
                        <DialogDescription>{t.accessControl.subtitle}</DialogDescription>
                    </DialogHeader>

                    <div className="max-h-[70vh] overflow-y-auto pr-2 pt-1">
                        <div className="space-y-6 pb-1">
                            {userDialogError && (
                                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                    {userDialogError}
                                </div>
                            )}
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                <div className="space-y-2">
                                    <Label htmlFor="rbac-user-code">{t.accessControl.userCode}</Label>
                                    <Input
                                        id="rbac-user-code"
                                        ref={userCodeInputRef}
                                        value={form.userCode}
                                        onChange={(event) => {
                                            clearUserFieldError('userCode');
                                            setForm((current) => ({ ...current, userCode: event.target.value }));
                                        }}
                                        disabled={!!editUser || saving}
                                    />
                                    {showFormErrors && mergedUserErrors.userCode && (
                                        <p className="text-xs text-destructive">{mergedUserErrors.userCode}</p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="rbac-display-name">{t.accessControl.displayName}</Label>
                                    <Input
                                        id="rbac-display-name"
                                        value={form.displayName}
                                        onChange={(event) => {
                                            clearUserFieldError('displayName');
                                            setForm((current) => ({ ...current, displayName: event.target.value }));
                                        }}
                                        disabled={saving}
                                    />
                                    {showFormErrors && mergedUserErrors.displayName && (
                                        <p className="text-xs text-destructive">{mergedUserErrors.displayName}</p>
                                    )}
                                </div>
                                {createOpen && (
                                    <div className="space-y-2">
                                        <Label htmlFor="rbac-access-key">{t.accessControl.accessKey}</Label>
                                        <Input
                                            id="rbac-access-key"
                                            value={form.accessKey}
                                            onChange={(event) => {
                                                clearUserFieldError('accessKey');
                                                setForm((current) => ({ ...current, accessKey: event.target.value }));
                                            }}
                                            placeholder={t.accessControl.accessKeyHint}
                                            disabled={saving}
                                        />
                                        {mergedUserErrors.accessKey && (
                                            <p className="text-xs text-destructive">{mergedUserErrors.accessKey}</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="flex items-center gap-3 rounded-xl border border-border/70 p-4">
                                    <Checkbox
                                        id="rbac-active"
                                        checked={form.isActive}
                                        onCheckedChange={(checked) => {
                                            setUserDialogError(null);
                                            setForm((current) => ({ ...current, isActive: checked === true }));
                                        }}
                                        disabled={saving}
                                    />
                                    <Label htmlFor="rbac-active" className="cursor-pointer">
                                        {t.accessControl.active}
                                    </Label>
                                </div>
                                <div className="flex items-center gap-3 rounded-xl border border-border/70 p-4">
                                    <Checkbox
                                        id="rbac-super-admin"
                                        checked={form.isSuperAdmin}
                                        onCheckedChange={(checked) => {
                                            setUserDialogError(null);
                                            setForm((current) => ({ ...current, isSuperAdmin: checked === true }));
                                        }}
                                        disabled={saving}
                                    />
                                    <Label htmlFor="rbac-super-admin" className="cursor-pointer">
                                        {t.accessControl.superAdmin}
                                    </Label>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                                <div className="flex items-start gap-3">
                                    <Checkbox
                                        id="rbac-team-resource-key"
                                        checked={form.teamResourcesLoginKeyEnabled}
                                        onCheckedChange={(checked) => {
                                            setUserDialogError(null);
                                            setForm((current) => ({
                                                ...current,
                                                teamResourcesLoginKeyEnabled: checked === true,
                                            }));
                                        }}
                                        disabled={saving}
                                    />
                                    <div className="space-y-1.5">
                                        <Label htmlFor="rbac-team-resource-key" className="cursor-pointer font-medium">
                                            {t.accessControl.teamResourcesLoginKey}
                                        </Label>
                                        <p className="text-sm text-muted-foreground">
                                            {t.accessControl.teamResourcesLoginKeyHelp}
                                        </p>
                                        <Badge variant={form.teamResourcesLoginKeyEnabled ? 'default' : 'outline'}>
                                            {form.teamResourcesLoginKeyEnabled
                                                ? t.accessControl.teamResourcesLoginKeyEnabled
                                                : t.accessControl.teamResourcesLoginKeyDisabled}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <h3 className="text-sm font-semibold">{t.accessControl.roles}</h3>
                                    <p className="text-xs text-muted-foreground">{t.accessControl.rolePermissions}</p>
                                </div>
                                {showFormErrors && mergedUserErrors.roleCodes && (
                                    <p className="text-xs text-destructive">{mergedUserErrors.roleCodes}</p>
                                )}
                                <div className="grid gap-3 md:grid-cols-2">
                                    {assignableRoles.map((role) => {
                                        const checked = form.roleCodes.includes(role.code);
                                        return (
                                            <label
                                                key={role.code}
                                                className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-4 transition-colors hover:bg-muted/40"
                                            >
                                                <Checkbox
                                                    checked={checked}
                                                    onCheckedChange={(next) => {
                                                        clearUserFieldError('roleCodes');
                                                        setForm((current) => ({
                                                            ...current,
                                                            roleCodes: toggleItem(current.roleCodes, role.code, next === true),
                                                        }));
                                                    }}
                                                    disabled={saving}
                                                />
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium">{role.name}</span>
                                                        <Badge variant="outline">{role.permission_keys.length}</Badge>
                                                        {!role.is_system && (
                                                            <Badge variant="outline">{t.accessControl.customRole}</Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">{role.description}</p>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <Separator />

                            <div className="grid gap-6 xl:grid-cols-3">
                                <div className="space-y-3 xl:col-span-1">
                                    <h3 className="text-sm font-semibold">{t.accessControl.rolePermissions}</h3>
                                    <div className="rounded-xl border border-border/70 p-4">
                                        <div className="flex flex-wrap gap-1.5">
                                            {selectedRolePermissionKeys.length > 0 ? selectedRolePermissionKeys.map((permissionKey) => (
                                                <Badge key={permissionKey} variant="secondary">
                                                    {permissionMap.get(permissionKey)?.name || permissionKey}
                                                </Badge>
                                            )) : (
                                                <p className="text-sm text-muted-foreground">{t.common.notSelected}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold">{t.accessControl.grantedPermissions}</h3>
                                    <div className="rounded-xl border border-border/70 p-4">
                                        <ScrollArea className="h-[260px] pr-3">
                                            <div className="space-y-3">
                                                {grantablePermissions.map((permission) => (
                                                    <label key={permission.key} className="flex items-start gap-3">
                                                        <Checkbox
                                                            checked={form.grantedPermissions.includes(permission.key)}
                                                            onCheckedChange={(checked) => {
                                                                setUserDialogError(null);
                                                                setForm((current) => ({
                                                                    ...current,
                                                                    grantedPermissions: toggleItem(current.grantedPermissions, permission.key, checked === true),
                                                                }));
                                                            }}
                                                            disabled={saving}
                                                        />
                                                        <div>
                                                            <p className="text-sm font-medium">{permission.name}</p>
                                                            <p className="text-xs text-muted-foreground">{permission.description}</p>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold">{t.accessControl.revokedPermissions}</h3>
                                    <div className="rounded-xl border border-border/70 p-4">
                                        <ScrollArea className="h-[260px] pr-3">
                                            <div className="space-y-3">
                                                {revokablePermissions.map((permission) => (
                                                    <label key={permission.key} className="flex items-start gap-3">
                                                        <Checkbox
                                                            checked={form.revokedPermissions.includes(permission.key)}
                                                            onCheckedChange={(checked) => {
                                                                setUserDialogError(null);
                                                                setForm((current) => ({
                                                                    ...current,
                                                                    revokedPermissions: toggleItem(current.revokedPermissions, permission.key, checked === true),
                                                                }));
                                                            }}
                                                            disabled={saving}
                                                        />
                                                        <div>
                                                            <p className="text-sm font-medium">{permission.name}</p>
                                                            <p className="text-xs text-muted-foreground">{permission.description}</p>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="rbac-notes">{t.accessControl.notes}</Label>
                                <Textarea
                                    id="rbac-notes"
                                    value={form.notes}
                                    onChange={(event) => {
                                        setUserDialogError(null);
                                        setForm((current) => ({ ...current, notes: event.target.value }));
                                    }}
                                    rows={4}
                                    disabled={saving}
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={closeDialogs} disabled={saving}>
                            {t.common.cancel}
                        </Button>
                        <Button onClick={() => void upsertUser(createOpen ? 'create' : 'edit')} disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {createOpen ? t.accessControl.createUser : t.accessControl.saveChanges}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={createRoleOpen || !!editRole} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
                <DialogContent className="sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{createRoleOpen ? t.accessControl.createRole : t.accessControl.editRole}</DialogTitle>
                        <DialogDescription>{t.accessControl.catalogTitle}</DialogDescription>
                    </DialogHeader>

                    <div className="max-h-[70vh] overflow-y-auto pr-2 pt-1">
                        <div className="space-y-6 pb-1">
                            {roleDialogError && (
                                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                    {roleDialogError}
                                </div>
                            )}
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="rbac-role-code">{t.accessControl.roleCode}</Label>
                                    <Input
                                        id="rbac-role-code"
                                        value={roleForm.code}
                                        onChange={(event) => {
                                            clearRoleFieldError('code');
                                            setRoleForm((current) => ({ ...current, code: event.target.value }));
                                        }}
                                        disabled={!!editRole || saving}
                                    />
                                    {showRoleFormErrors && mergedRoleErrors.code && (
                                        <p className="text-xs text-destructive">{mergedRoleErrors.code}</p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="rbac-role-name">{t.accessControl.roleName}</Label>
                                    <Input
                                        id="rbac-role-name"
                                        value={roleForm.name}
                                        onChange={(event) => {
                                            clearRoleFieldError('name');
                                            setRoleForm((current) => ({ ...current, name: event.target.value }));
                                        }}
                                        disabled={saving}
                                    />
                                    {showRoleFormErrors && mergedRoleErrors.name && (
                                        <p className="text-xs text-destructive">{mergedRoleErrors.name}</p>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="rbac-role-description">{t.accessControl.roleDescription}</Label>
                                <Textarea
                                    id="rbac-role-description"
                                    value={roleForm.description}
                                    onChange={(event) => {
                                        setRoleDialogError(null);
                                        setRoleForm((current) => ({ ...current, description: event.target.value }));
                                    }}
                                    rows={3}
                                    disabled={saving}
                                />
                            </div>

                            {editRole && (
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="rounded-xl border border-border/70 p-4">
                                        <p className="text-sm font-medium">{t.accessControl.roleType}</p>
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            {editRole.is_system ? t.accessControl.systemRole : t.accessControl.customRole}
                                        </p>
                                    </div>
                                    {!editRole.is_system && (
                                        <div className="flex items-center gap-3 rounded-xl border border-border/70 p-4">
                                            <Checkbox
                                                id="rbac-role-active"
                                                checked={roleForm.isActive}
                                                onCheckedChange={(checked) => {
                                                    setRoleDialogError(null);
                                                    setRoleForm((current) => ({ ...current, isActive: checked === true }));
                                                }}
                                                disabled={saving}
                                            />
                                            <Label htmlFor="rbac-role-active" className="cursor-pointer">
                                                {roleForm.isActive ? t.accessControl.active : t.accessControl.disableRole}
                                            </Label>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="space-y-3">
                                <div>
                                    <h3 className="text-sm font-semibold">{t.accessControl.permissionsTitle}</h3>
                                    <p className="text-xs text-muted-foreground">{t.accessControl.catalogTitle}</p>
                                </div>
                                {showRoleFormErrors && mergedRoleErrors.permissionKeys && (
                                    <p className="text-xs text-destructive">{mergedRoleErrors.permissionKeys}</p>
                                )}
                                <div className="grid gap-6 md:grid-cols-2">
                                    {Object.entries(permissionGroups).map(([category, permissions]) => (
                                        <div key={category} className="rounded-xl border border-border/70 p-4">
                                            <div className="mb-3 flex items-center justify-between">
                                                <p className="text-sm font-medium">{categoryLabel(category)}</p>
                                                <Badge variant="outline">{permissions.length}</Badge>
                                            </div>
                                            <div className="space-y-3">
                                                {permissions.map((permission) => (
                                                    <label key={permission.key} className="flex items-start gap-3">
                                                        <Checkbox
                                                            checked={roleForm.permissionKeys.includes(permission.key)}
                                                            onCheckedChange={(checked) => {
                                                                clearRoleFieldError('permissionKeys');
                                                                setRoleForm((current) => ({
                                                                    ...current,
                                                                    permissionKeys: toggleItem(current.permissionKeys, permission.key, checked === true),
                                                                }));
                                                            }}
                                                            disabled={saving}
                                                        />
                                                        <div>
                                                            <p className="text-sm font-medium">{permission.name}</p>
                                                            <p className="text-xs text-muted-foreground">{permission.description}</p>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={closeDialogs} disabled={saving}>
                            {t.common.cancel}
                        </Button>
                        <Button onClick={() => void upsertRole(createRoleOpen ? 'create' : 'edit')} disabled={saving || !!editRole?.is_system}>
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {createRoleOpen ? t.accessControl.createRole : t.accessControl.saveChanges}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!deleteUser || !!deleteRole} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{deleteUser ? t.accessControl.deleteUserTitle : t.accessControl.deleteRoleTitle}</DialogTitle>
                        <DialogDescription>
                            {deleteUser ? t.accessControl.deleteConfirmDescription : t.accessControl.deleteConfirmRoleDescription}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {deleteDialogError && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {deleteDialogError}
                            </div>
                        )}
                        <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                            {deleteUser ? (
                                <div className="space-y-1">
                                    <p className="text-sm font-medium">{deleteUser.display_name}</p>
                                    <p className="font-mono text-xs text-muted-foreground">{deleteUser.user_code}</p>
                                </div>
                            ) : deleteRole ? (
                                <div className="space-y-1">
                                    <p className="text-sm font-medium">{deleteRole.name}</p>
                                    <p className="font-mono text-xs text-muted-foreground">{deleteRole.code}</p>
                                </div>
                            ) : null}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeDialogs} disabled={saving}>
                            {t.common.cancel}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => void (deleteUser ? handleDeleteUser() : handleDeleteRole())}
                            disabled={saving}
                        >
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {t.accessControl.deleteConfirmAction}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!rotateUser} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t.accessControl.rotateKeyTitle}</DialogTitle>
                        <DialogDescription>
                            {rotateUser ? `${rotateUser.display_name} (${rotateUser.user_code})` : t.accessControl.rotateKeyTitle}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {rotateDialogError && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {rotateDialogError}
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="rotate-key">{t.accessControl.customKey}</Label>
                            <Input
                                id="rotate-key"
                                value={customRotateKey}
                                onChange={(event) => {
                                    clearRotateFieldError('accessKey');
                                    setCustomRotateKey(event.target.value);
                                }}
                                placeholder={t.accessControl.accessKeyHint}
                                disabled={saving}
                            />
                            {rotateKeyErrors.accessKey && (
                                <p className="text-xs text-destructive">{rotateKeyErrors.accessKey}</p>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">{t.accessControl.generatedKeyHint}</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeDialogs} disabled={saving}>
                            {t.common.cancel}
                        </Button>
                        <Button onClick={() => void handleRotateKey()} disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {t.accessControl.rotateUserKey}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
