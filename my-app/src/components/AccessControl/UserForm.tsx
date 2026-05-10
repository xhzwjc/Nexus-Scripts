'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, KeyRound, Layers3, Loader2, ShieldCheck, UserRound } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
    DataScope,
    ScriptHubOrganizationDefinition,
    ScriptHubPermissionDefinition,
    ScriptHubRoleDefinition,
} from '@/lib/types';
import { CompactBadgeList } from './AccessControlBadges';
import { AuthorizationBoundaryForm } from './AuthorizationBoundaryForm';
import { DATA_SCOPE_OPTIONS } from './constants';
import {
    buildOrganizationTreeRows,
    createOrganizationMap,
    getOrganizationDisplayPath,
    OrganizationTreeText,
} from './organizationTree';
import type { UserFormErrors, UserFormState } from './types';
import type { AccessControlLabels } from './utils';
import { categoryLabel, getDataScopeLabel, groupPermissionsByCategory, toggleItem } from './utils';

interface UserFormProps {
    open: boolean;
    mode: 'create' | 'edit';
    form: UserFormState;
    labels: AccessControlLabels;
    organizations: ScriptHubOrganizationDefinition[];
    assignableRoles: ScriptHubRoleDefinition[];
    permissions: ScriptHubPermissionDefinition[];
    permissionMap: Map<string, ScriptHubPermissionDefinition>;
    selectedRolePermissionKeys: string[];
    grantablePermissions: ScriptHubPermissionDefinition[];
    revokablePermissions: ScriptHubPermissionDefinition[];
    showErrors: boolean;
    errors: UserFormErrors;
    dialogError?: string | null;
    saving: boolean;
    onChange: (form: UserFormState) => void;
    onFieldChange: (field: keyof UserFormErrors) => void;
    onCancel: () => void;
    onSubmit: () => void;
}


export function UserForm({
    open,
    mode,
    form,
    labels,
    organizations,
    assignableRoles,
    permissions,
    permissionMap,
    selectedRolePermissionKeys,
    grantablePermissions,
    revokablePermissions,
    showErrors,
    errors,
    dialogError,
    saving,
    onChange,
    onFieldChange,
    onCancel,
    onSubmit,
}: UserFormProps) {
    const userCodeInputRef = useRef<HTMLInputElement | null>(null);
    const organizationRows = useMemo(() => buildOrganizationTreeRows(organizations), [organizations]);
    const organizationMap = useMemo(() => createOrganizationMap(organizations), [organizations]);
    const selectedPrimaryOrganization = organizationMap.get(form.primaryOrgCode);
    const selectedCustomOrganizations = useMemo(() => (
        form.customOrgCodes.map((orgCode) => {
            const organization = organizationMap.get(orgCode);
            return organization ? getOrganizationDisplayPath(organization, organizationMap) : orgCode;
        })
    ), [form.customOrgCodes, organizationMap]);

    const [activeTab, setActiveTab] = useState('basic');
    const [expandedPermCategories, setExpandedPermCategories] = useState<Set<string>>(new Set());
    const togglePermCategoryExpand = (category: string) => {
        setExpandedPermCategories((prev) => {
            const next = new Set(prev);
            if (next.has(category)) { next.delete(category); } else { next.add(category); }
            return next;
        });
    };

    const tabErrors = useMemo(() => {
        const tabMap: Record<string, string[]> = { basic: [], permissions: [], scope: [], boundary: [] };
        if (errors.userCode) tabMap.basic.push(errors.userCode);
        if (errors.displayName) tabMap.basic.push(errors.displayName);
        if (errors.accessKey) tabMap.basic.push(errors.accessKey);
        if (errors.roleCodes) tabMap.permissions.push(errors.roleCodes);
        return tabMap;
    }, [errors]);

    const totalErrorCount = useMemo(() =>
        Object.values(tabErrors).reduce((sum, errs) => sum + errs.length, 0),
    [tabErrors]);

    const handleSubmit = () => {
        if (showErrors && totalErrorCount > 0) {
            const firstErrorTab = (['basic', 'permissions', 'scope', 'boundary'] as const).find((t) => tabErrors[t].length > 0);
            if (firstErrorTab) setActiveTab(firstErrorTab);
        }
        onSubmit();
    };

    const handleOpenAutoFocus = (event: Event) => {
        event.preventDefault();
        requestAnimationFrame(() => {
            userCodeInputRef.current?.focus();
        });
    };

    const grantedPermissionGroups = useMemo(() => groupPermissionsByCategory(grantablePermissions), [grantablePermissions]);
    const revokedPermissionGroups = useMemo(() => groupPermissionsByCategory(revokablePermissions), [revokablePermissions]);

    const allPermCategories = useMemo(() => {
        const keys = new Set([...Object.keys(grantedPermissionGroups), ...Object.keys(revokedPermissionGroups)]);
        return [...keys];
    }, [grantedPermissionGroups, revokedPermissionGroups]);

    const permCategoryCounts = useMemo(() => {
        const counts: Record<string, { granted: number; revoked: number; total: number }> = {};
        for (const cat of allPermCategories) {
            const granted = grantedPermissionGroups[cat]?.filter((p) => form.grantedPermissions.includes(p.key)).length ?? 0;
            const revoked = revokedPermissionGroups[cat]?.filter((p) => form.revokedPermissions.includes(p.key)).length ?? 0;
            const total = (grantedPermissionGroups[cat]?.length ?? 0) + (revokedPermissionGroups[cat]?.length ?? 0);
            counts[cat] = { granted, revoked, total };
        }
        return counts;
    }, [allPermCategories, grantedPermissionGroups, revokedPermissionGroups, form.grantedPermissions, form.revokedPermissions]);

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
            <DialogContent className="sm:max-w-6xl" onOpenAutoFocus={handleOpenAutoFocus}>
                <DialogHeader>
                    <DialogTitle>{mode === 'create' ? labels.createTitle : labels.editTitle}</DialogTitle>
                    <DialogDescription>{labels.userFormDescription}</DialogDescription>
                </DialogHeader>

                {dialogError && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {dialogError}
                    </div>
                )}

                <Tabs value={activeTab} onValueChange={setActiveTab} className="max-h-[72vh]">
                    <TabsList className="w-full justify-start">
                        <TabsTrigger value="basic" className="relative">
                            <UserRound className="h-3.5 w-3.5" />
                            {labels.userFormBasicInfo}
                            {showErrors && tabErrors.basic.length > 0 && (
                                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                                    {tabErrors.basic.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="permissions" className="relative">
                            <KeyRound className="h-3.5 w-3.5" />
                            {labels.userFormConfigPermission}
                            {showErrors && tabErrors.permissions.length > 0 && (
                                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                                    {tabErrors.permissions.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="scope">
                            <Layers3 className="h-3.5 w-3.5" />
                            {labels.userFormDataScope}
                        </TabsTrigger>
                        <TabsTrigger value="boundary">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {labels.authorizationBoundary}
                        </TabsTrigger>
                    </TabsList>

                    {/* ─── Tab 1: 基本信息 ─── */}
                    <TabsContent value="basic" className="overflow-y-auto pr-1">
                        <div className="space-y-5 pb-2 pt-2">
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                <div className="space-y-2">
                                    <Label htmlFor="rbac-user-code">{labels.userCode}</Label>
                                    <Input
                                        id="rbac-user-code"
                                        ref={userCodeInputRef}
                                        value={form.userCode}
                                        onChange={(event) => {
                                            onFieldChange('userCode');
                                            onChange({ ...form, userCode: event.target.value });
                                        }}
                                        disabled={mode === 'edit' || saving}
                                    />
                                    {showErrors && errors.userCode && (
                                        <p className="text-xs text-destructive">{errors.userCode}</p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="rbac-display-name">{labels.displayName}</Label>
                                    <Input
                                        id="rbac-display-name"
                                        value={form.displayName}
                                        onChange={(event) => {
                                            onFieldChange('displayName');
                                            onChange({ ...form, displayName: event.target.value });
                                        }}
                                        disabled={saving}
                                    />
                                    {showErrors && errors.displayName && (
                                        <p className="text-xs text-destructive">{errors.displayName}</p>
                                    )}
                                </div>
                                {mode === 'create' && (
                                    <div className="space-y-2">
                                        <Label htmlFor="rbac-access-key">{labels.accessKey}</Label>
                                        <Input
                                            id="rbac-access-key"
                                            value={form.accessKey}
                                            onChange={(event) => {
                                                onFieldChange('accessKey');
                                                onChange({ ...form, accessKey: event.target.value });
                                            }}
                                            placeholder={labels.accessKeyHint}
                                            disabled={saving}
                                        />
                                        {errors.accessKey && (
                                            <p className="text-xs text-destructive">{errors.accessKey}</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>{labels.organization}</Label>
                                    <Select
                                        value={form.primaryOrgCode}
                                        onValueChange={(value) => onChange({ ...form, primaryOrgCode: value })}
                                        disabled={saving}
                                    >
                                        <SelectTrigger className="w-full">
                                            <span className="truncate">
                                                {selectedPrimaryOrganization?.name || labels.organization}
                                            </span>
                                        </SelectTrigger>
                                        <SelectContent className="max-h-80 min-w-[420px]">
                                            {organizationRows.map((row) => (
                                                <SelectItem
                                                    key={row.organization.org_code}
                                                    value={row.organization.org_code}
                                                    textValue={row.organization.name}
                                                    className="py-2"
                                                >
                                                    <OrganizationTreeText
                                                        row={row}
                                                        labels={labels}
                                                        organizationMap={organizationMap}
                                                    />
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="rbac-notes">{labels.notes}</Label>
                                    <Textarea
                                        id="rbac-notes"
                                        value={form.notes}
                                        onChange={(event) => onChange({ ...form, notes: event.target.value })}
                                        rows={2}
                                        disabled={saving}
                                    />
                                </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <label className={cn(
                                    "flex items-center gap-3 rounded-xl border p-3 transition-colors",
                                    form.isActive
                                        ? "border-teal-200 bg-teal-50/80 dark:border-teal-900/70 dark:bg-teal-950/25"
                                        : "border-slate-200/80 bg-white/70 dark:border-slate-800 dark:bg-slate-950/35",
                                )}>
                                    <Checkbox
                                        checked={form.isActive}
                                        onCheckedChange={(checked) => onChange({ ...form, isActive: checked === true })}
                                        disabled={saving}
                                    />
                                    <div>
                                        <span className="text-sm font-medium">{labels.active}</span>
                                        <span className="ml-2 text-xs text-muted-foreground">{form.isActive ? labels.active : labels.inactive}</span>
                                    </div>
                                </label>
                                <label className={cn(
                                    "flex items-center gap-3 rounded-xl border p-3 transition-colors",
                                    form.isSuperAdmin
                                        ? "border-amber-200 bg-amber-50/80 dark:border-amber-900/70 dark:bg-amber-950/25"
                                        : "border-slate-200/80 bg-white/70 dark:border-slate-800 dark:bg-slate-950/35",
                                )}>
                                    <Checkbox
                                        checked={form.isSuperAdmin}
                                        onCheckedChange={(checked) => onChange({ ...form, isSuperAdmin: checked === true })}
                                        disabled={saving}
                                    />
                                    <div>
                                        <span className="text-sm font-medium">{labels.superAdmin}</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </TabsContent>

                    {/* ─── Tab 2: 角色与权限 ─── */}
                    <TabsContent value="permissions" className="overflow-y-auto pr-1">
                        <div className="space-y-5 pb-2 pt-2">
                            {/* Team Resource Key */}
                            <div
                                className={cn(
                                    "rounded-xl border p-3 transition-colors",
                                    form.teamResourcesLoginKeyEnabled
                                        ? "border-teal-200 bg-teal-50/80 dark:border-teal-900/70 dark:bg-teal-950/25"
                                        : "border-slate-200/80 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/35",
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <Checkbox
                                        id="rbac-team-resource-key"
                                        checked={form.teamResourcesLoginKeyEnabled}
                                        onCheckedChange={(checked) => onChange({
                                            ...form,
                                            teamResourcesLoginKeyEnabled: checked === true,
                                        })}
                                        disabled={saving}
                                    />
                                    <div>
                                        <Label htmlFor="rbac-team-resource-key" className="cursor-pointer font-medium text-slate-950 dark:text-slate-100">
                                            {labels.teamResourcesLoginKey}
                                        </Label>
                                        <p className="mt-1 text-xs text-muted-foreground">{labels.teamResourcesLoginKeyHelp}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Roles */}
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <h4 className="text-sm font-semibold text-slate-950 dark:text-slate-100">{labels.roles}</h4>
                                        <p className="text-xs text-muted-foreground">{labels.rolePermissions}</p>
                                    </div>
                                    <Badge variant="outline">{form.roleCodes.length}</Badge>
                                </div>
                                {showErrors && errors.roleCodes && (
                                    <p className="text-xs text-destructive">{errors.roleCodes}</p>
                                )}
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {assignableRoles.map((role) => {
                                        const checked = form.roleCodes.includes(role.code);
                                        return (
                                            <label
                                                key={role.code}
                                                className={cn(
                                                    "group flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                                                    checked
                                                        ? "border-teal-200 bg-teal-50/80 dark:border-teal-900/70 dark:bg-teal-950/25"
                                                        : "border-slate-200/80 bg-white/70 hover:border-slate-300 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/35 dark:hover:border-slate-700 dark:hover:bg-slate-900/45",
                                                )}
                                            >
                                                <Checkbox
                                                    checked={checked}
                                                    onCheckedChange={(next) => {
                                                        onFieldChange('roleCodes');
                                                        onChange({
                                                            ...form,
                                                            roleCodes: toggleItem(form.roleCodes, role.code, next === true),
                                                        });
                                                    }}
                                                    disabled={saving}
                                                />
                                                <div className="space-y-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-medium text-slate-950 dark:text-slate-100">{role.name}</span>
                                                        <Badge variant="outline" className="text-[10px]">{role.permission_keys.length}</Badge>
                                                        {!role.is_system && (
                                                            <Badge variant="outline" className="text-[10px]">{labels.customRole}</Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">{role.description}</p>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Role Permissions Preview */}
                            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/35">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <h4 className="text-sm font-semibold text-slate-950 dark:text-slate-100">{labels.rolePermissions}</h4>
                                    <Badge variant="outline">{selectedRolePermissionKeys.length}</Badge>
                                </div>
                                <CompactBadgeList
                                    items={selectedRolePermissionKeys.map((permissionKey) => permissionMap.get(permissionKey)?.name || permissionKey)}
                                    max={8}
                                    emptyLabel={labels.emptySelection}
                                />
                            </div>

                            {/* Permission Overrides - Unified Accordion */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-slate-950 dark:text-slate-100">{labels.effectivePermissions}</h4>
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                                            {labels.grantedPermissions} {form.grantedPermissions.length}
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                                            <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
                                            {labels.revokedPermissions} {form.revokedPermissions.length}
                                        </span>
                                    </div>
                                </div>
                                <ScrollArea className="h-[340px]">
                                    <div className="space-y-1 pr-2">
                                        {allPermCategories.map((category) => {
                                            const isExpanded = expandedPermCategories.has(category);
                                            const counts = permCategoryCounts[category] ?? { granted: 0, revoked: 0, total: 0 };
                                            const grantedPerms = grantedPermissionGroups[category] ?? [];
                                            const revokedPerms = revokedPermissionGroups[category] ?? [];
                                            const hasOverrides = counts.granted > 0 || counts.revoked > 0;
                                            return (
                                                <div key={category} className="rounded-lg border bg-background">
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
                                                        onClick={() => togglePermCategoryExpand(category)}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200", !isExpanded && "-rotate-90")} />
                                                            <span className="text-sm font-medium">{categoryLabel(category, labels)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {hasOverrides && (
                                                                <span className="flex items-center gap-1.5 text-[10px]">
                                                                    {counts.granted > 0 && (
                                                                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                                                            +{counts.granted}
                                                                        </span>
                                                                    )}
                                                                    {counts.revoked > 0 && (
                                                                        <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                                                                            -{counts.revoked}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            )}
                                                            <Badge variant="outline" className="text-[10px]">{counts.total}</Badge>
                                                        </div>
                                                    </button>
                                                    {isExpanded && (
                                                        <div className="border-t px-3 py-2">
                                                            {grantedPerms.length > 0 && (
                                                                <div className="mb-2">
                                                                    <p className="mb-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">{labels.grantedPermissions}</p>
                                                                    <div className="space-y-1.5">
                                                                        {grantedPerms.map((permission) => {
                                                                            const checked = form.grantedPermissions.includes(permission.key);
                                                                            return (
                                                                                <label
                                                                                    key={permission.key}
                                                                                    className={cn(
                                                                                        "flex cursor-pointer items-start gap-2.5 rounded-lg border p-2 transition-colors",
                                                                                        checked
                                                                                            ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/25"
                                                                                            : "border-transparent hover:border-emerald-200 hover:bg-emerald-50/30 dark:hover:border-emerald-900/50",
                                                                                    )}
                                                                                >
                                                                                    <Checkbox
                                                                                        checked={checked}
                                                                                        onCheckedChange={(next) => onChange({
                                                                                            ...form,
                                                                                            grantedPermissions: toggleItem(form.grantedPermissions, permission.key, next === true),
                                                                                        })}
                                                                                        disabled={saving}
                                                                                    />
                                                                                    <div>
                                                                                        <span className="block text-sm font-medium text-slate-950 dark:text-slate-100">{permission.name}</span>
                                                                                        <span className="block text-xs text-muted-foreground">{permission.description}</span>
                                                                                    </div>
                                                                                </label>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {revokedPerms.length > 0 && (
                                                                <div>
                                                                    <p className="mb-1.5 text-xs font-medium text-rose-700 dark:text-rose-400">{labels.revokedPermissions}</p>
                                                                    <div className="space-y-1.5">
                                                                        {revokedPerms.map((permission) => {
                                                                            const checked = form.revokedPermissions.includes(permission.key);
                                                                            return (
                                                                                <label
                                                                                    key={permission.key}
                                                                                    className={cn(
                                                                                        "flex cursor-pointer items-start gap-2.5 rounded-lg border p-2 transition-colors",
                                                                                        checked
                                                                                            ? "border-rose-300 bg-rose-50/60 dark:border-rose-800 dark:bg-rose-950/25"
                                                                                            : "border-transparent hover:border-rose-200 hover:bg-rose-50/30 dark:hover:border-rose-900/50",
                                                                                    )}
                                                                                >
                                                                                    <Checkbox
                                                                                        checked={checked}
                                                                                        onCheckedChange={(next) => onChange({
                                                                                            ...form,
                                                                                            revokedPermissions: toggleItem(form.revokedPermissions, permission.key, next === true),
                                                                                        })}
                                                                                        disabled={saving}
                                                                                    />
                                                                                    <div>
                                                                                        <span className="block text-sm font-medium text-slate-950 dark:text-slate-100">{permission.name}</span>
                                                                                        <span className="block text-xs text-muted-foreground">{permission.description}</span>
                                                                                    </div>
                                                                                </label>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>
                    </TabsContent>

                    {/* ─── Tab 3: 数据范围 ─── */}
                    <TabsContent value="scope" className="overflow-y-auto pr-1">
                        <div className="space-y-5 pb-2 pt-2">
                            <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
                                <div className="space-y-2">
                                    <Label>{labels.dataScope}</Label>
                                    <Select
                                        value={form.dataScope}
                                        onValueChange={(value) => onChange({ ...form, dataScope: value as DataScope })}
                                        disabled={saving}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder={labels.dataScope} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {DATA_SCOPE_OPTIONS.map((scope) => (
                                                <SelectItem key={scope} value={scope}>
                                                    {getDataScopeLabel(scope, labels)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                                    <Checkbox
                                        checked={form.dataScopeDowngradeConfirmed}
                                        onCheckedChange={(checked) => onChange({ ...form, dataScopeDowngradeConfirmed: checked === true })}
                                        disabled={saving}
                                    />
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium">{labels.scopeDowngradeConfirm}</p>
                                        <p className="text-xs leading-5 text-amber-800 dark:text-amber-200">{labels.scopeDowngradeConfirmDesc}</p>
                                    </div>
                                </label>
                            </div>
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <Label>{labels.customOrgs}</Label>
                                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.customOrgsHelp}</p>
                                    </div>
                                    <div className="max-w-full sm:max-w-[50%]">
                                        <CompactBadgeList items={selectedCustomOrganizations} max={3} emptyLabel={labels.emptySelection} />
                                    </div>
                                </div>
                                <ScrollArea className="h-48 rounded-md border bg-background">
                                    <div className="space-y-2 p-3 pr-4">
                                        {organizationRows.map((row) => (
                                            <label
                                                key={row.organization.org_code}
                                                className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
                                            >
                                                <Checkbox
                                                    checked={form.customOrgCodes.includes(row.organization.org_code)}
                                                    onCheckedChange={(checked) => onChange({
                                                        ...form,
                                                        customOrgCodes: toggleItem(form.customOrgCodes, row.organization.org_code, checked === true),
                                                    })}
                                                    disabled={saving}
                                                />
                                                <OrganizationTreeText
                                                    row={row}
                                                    labels={labels}
                                                    organizationMap={organizationMap}
                                                />
                                            </label>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>
                    </TabsContent>

                    {/* ─── Tab 4: 授权边界 ─── */}
                    <TabsContent value="boundary" className="overflow-y-auto pr-1">
                        <div className="pb-2 pt-2">
                            <AuthorizationBoundaryForm
                                value={form.authorizationBoundary}
                                organizations={organizations}
                                roles={assignableRoles}
                                permissions={permissions}
                                labels={labels}
                                disabled={saving}
                                onChange={(authorizationBoundary) => onChange({ ...form, authorizationBoundary })}
                            />
                        </div>
                    </TabsContent>
                </Tabs>

                <DialogFooter className="flex items-center gap-2 sm:gap-2">
                    {showErrors && totalErrorCount > 0 && (
                        <div className="flex items-center gap-1.5 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            <span>{totalErrorCount === 1 ? labels.formHasError : labels.formHasErrors.replace('{count}', String(totalErrorCount))}</span>
                        </div>
                    )}
                    <div className="flex-1" />
                    <Button variant="outline" onClick={onCancel} disabled={saving}>
                        {labels.cancelLabel}
                    </Button>
                    <Button onClick={handleSubmit} disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {mode === 'create' ? labels.createUser : labels.saveChanges}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
