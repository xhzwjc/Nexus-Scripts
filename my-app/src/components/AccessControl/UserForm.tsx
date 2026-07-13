'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
    AuthorizationBoundary,
    DataScope,
    ScriptHubOrganizationDefinition,
    ScriptHubPermissionDefinition,
    ScriptHubRoleDefinition,
} from '@/lib/types';
import { CompactBadgeList } from './AccessControlBadges';
import { AuthorizationBoundaryForm } from './AuthorizationBoundaryForm';
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
    dataScopeOptions: DataScope[];
    actorBoundary: AuthorizationBoundary | null;
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
    dataScopeOptions,
    actorBoundary,
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

    useEffect(() => {
        if (open) {
            setActiveTab('basic');
            setExpandedPermCategories(new Set());
        }
    }, [mode, open]);

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
            <DialogContent className="flex max-h-[calc(100vh-32px)] flex-col gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[1120px] dark:bg-slate-950" onOpenAutoFocus={handleOpenAutoFocus}>
                <DialogHeader className="shrink-0 gap-1 border-b border-[#F2F3F5] px-6 pb-4 pr-14 pt-5 text-left dark:border-slate-800">
                    <DialogTitle className="text-[16px] leading-6 text-[#0E1114] dark:text-white">{mode === 'create' ? labels.createTitle : labels.editTitle}</DialogTitle>
                    <DialogDescription className="text-[12px] leading-5 text-[#86888F]">{labels.userFormDescription}</DialogDescription>
                </DialogHeader>

                {dialogError && (
                    <div className="mx-6 mt-4 rounded-[6px] border border-[rgba(245,63,63,0.24)] bg-[rgba(245,63,63,0.06)] px-3 py-2 text-[12px] leading-5 text-[#F53F3F]">
                        {dialogError}
                    </div>
                )}

                <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-0 flex-1 gap-0 [&_[data-slot=checkbox][data-state=checked]]:border-[#1E3BFA] [&_[data-slot=checkbox][data-state=checked]]:bg-[#1E3BFA] [&_[data-slot=input]]:h-9 [&_[data-slot=input]]:rounded-[4px] [&_[data-slot=input]]:border-[#E6E7EB] [&_[data-slot=input]]:text-[12px] [&_[data-slot=input]]:shadow-none [&_[data-slot=input]]:focus-visible:border-[#1E3BFA] [&_[data-slot=input]]:focus-visible:ring-0 [&_[data-slot=label]]:text-[12px] [&_[data-slot=label]]:font-normal [&_[data-slot=select-trigger]]:h-9 [&_[data-slot=select-trigger]]:rounded-[4px] [&_[data-slot=select-trigger]]:border-[#E6E7EB] [&_[data-slot=select-trigger]]:text-[12px] [&_[data-slot=select-trigger]]:shadow-none [&_[data-slot=select-trigger]]:focus:ring-0 [&_[data-slot=textarea]]:rounded-[4px] [&_[data-slot=textarea]]:border-[#E6E7EB] [&_[data-slot=textarea]]:text-[12px] [&_[data-slot=textarea]]:shadow-none [&_[data-slot=textarea]]:focus-visible:border-[#1E3BFA] [&_[data-slot=textarea]]:focus-visible:ring-0">
                    <TabsList className="mx-6 mt-4 h-9 w-fit max-w-[calc(100%-3rem)] shrink-0 justify-start overflow-x-auto rounded-[6px] bg-[#F7F8FA] p-0.5 dark:bg-slate-900">
                        <TabsTrigger value="basic" className="relative h-8 flex-none rounded-[5px] border-0 px-4 text-[12px] font-normal text-[#5E5F66] shadow-none data-[state=active]:bg-white data-[state=active]:font-medium data-[state=active]:text-[#0F23D9] data-[state=active]:shadow-[0_1px_4px_rgba(14,17,20,0.08)] dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-blue-300">
                            <UserRound className="h-3.5 w-3.5" />
                            {labels.userFormBasicInfo}
                            {showErrors && tabErrors.basic.length > 0 && (
                                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                                    {tabErrors.basic.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="permissions" className="relative h-8 flex-none rounded-[5px] border-0 px-4 text-[12px] font-normal text-[#5E5F66] shadow-none data-[state=active]:bg-white data-[state=active]:font-medium data-[state=active]:text-[#0F23D9] data-[state=active]:shadow-[0_1px_4px_rgba(14,17,20,0.08)] dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-blue-300">
                            <KeyRound className="h-3.5 w-3.5" />
                            {labels.userFormConfigPermission}
                            {showErrors && tabErrors.permissions.length > 0 && (
                                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                                    {tabErrors.permissions.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="scope" className="h-8 flex-none rounded-[5px] border-0 px-4 text-[12px] font-normal text-[#5E5F66] shadow-none data-[state=active]:bg-white data-[state=active]:font-medium data-[state=active]:text-[#0F23D9] data-[state=active]:shadow-[0_1px_4px_rgba(14,17,20,0.08)] dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-blue-300">
                            <Layers3 className="h-3.5 w-3.5" />
                            {labels.userFormDataScope}
                        </TabsTrigger>
                        <TabsTrigger value="boundary" className="h-8 flex-none rounded-[5px] border-0 px-4 text-[12px] font-normal text-[#5E5F66] shadow-none data-[state=active]:bg-white data-[state=active]:font-medium data-[state=active]:text-[#0F23D9] data-[state=active]:shadow-[0_1px_4px_rgba(14,17,20,0.08)] dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-blue-300">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {labels.authorizationBoundary}
                        </TabsTrigger>
                    </TabsList>

                    {/* ─── Tab 1: 基本信息 ─── */}
                    <TabsContent value="basic" className="mt-0 min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-4">
                        <div className="space-y-5">
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
                                        <p className="text-[11px] text-[#F53F3F]">{errors.userCode}</p>
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
                                        <p className="text-[11px] text-[#F53F3F]">{errors.displayName}</p>
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
                                            <p className="text-[11px] text-[#F53F3F]">{errors.accessKey}</p>
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
                                    "flex items-center gap-3 rounded-[6px] border p-3 transition-colors",
                                    form.isActive
                                        ? "border-[rgba(12,201,145,0.28)] bg-[rgba(12,201,145,0.06)] dark:border-teal-900/70 dark:bg-teal-950/25"
                                        : "border-[#E6E7EB] bg-white dark:border-slate-800 dark:bg-slate-950",
                                )}>
                                    <Checkbox
                                        checked={form.isActive}
                                        onCheckedChange={(checked) => onChange({ ...form, isActive: checked === true })}
                                        disabled={saving}
                                    />
                                    <div>
                                        <span className="text-[12px] font-medium">{labels.active}</span>
                                        <span className="ml-2 text-[11px] text-[#86888F]">{form.isActive ? labels.active : labels.inactive}</span>
                                    </div>
                                </label>
                                <label className={cn(
                                    "flex items-center gap-3 rounded-[6px] border p-3 transition-colors",
                                    form.isSuperAdmin
                                        ? "border-[rgba(255,171,36,0.32)] bg-[rgba(255,171,36,0.08)] dark:border-amber-900/70 dark:bg-amber-950/25"
                                        : "border-[#E6E7EB] bg-white dark:border-slate-800 dark:bg-slate-950",
                                )}>
                                    <Checkbox
                                        checked={form.isSuperAdmin}
                                        onCheckedChange={(checked) => onChange({ ...form, isSuperAdmin: checked === true })}
                                        disabled={saving}
                                    />
                                    <div>
                                        <span className="text-[12px] font-medium">{labels.superAdmin}</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </TabsContent>

                    {/* ─── Tab 2: 角色与权限 ─── */}
                    <TabsContent value="permissions" className="mt-0 min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-4">
                        <div className="space-y-5">
                            {/* Team Resource Key */}
                            <div
                                className={cn(
                                    "rounded-[6px] border p-3 transition-colors",
                                    form.teamResourcesLoginKeyEnabled
                                        ? "border-[rgba(30,59,250,0.24)] bg-[rgba(30,59,250,0.04)] dark:border-blue-900/70 dark:bg-blue-950/20"
                                        : "border-[#E6E7EB] bg-[#F7F8FA] dark:border-slate-800 dark:bg-slate-900/35",
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
                                        <p className="mt-1 text-[11px] leading-5 text-[#86888F]">{labels.teamResourcesLoginKeyHelp}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Roles */}
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <h4 className="text-[13px] font-semibold text-[#0E1114] dark:text-slate-100">{labels.roles}</h4>
                                        <p className="text-[11px] text-[#86888F]">{labels.rolePermissions}</p>
                                    </div>
                                    <Badge variant="outline" className="h-[20px] rounded-[4px] border-[#E6E7EB] bg-white px-1.5 text-[10px] font-normal text-[#86888F] shadow-none">{form.roleCodes.length}</Badge>
                                </div>
                                {showErrors && errors.roleCodes && (
                                    <p className="text-[11px] text-[#F53F3F]">{errors.roleCodes}</p>
                                )}
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {assignableRoles.map((role) => {
                                        const checked = form.roleCodes.includes(role.code);
                                        return (
                                            <label
                                                key={role.code}
                                                className={cn(
                                                    "group flex cursor-pointer items-start gap-3 rounded-[6px] border p-3 transition-colors",
                                                    checked
                                                        ? "border-[#1E3BFA] bg-[rgba(30,59,250,0.03)] dark:border-blue-700 dark:bg-blue-950/20"
                                                        : "border-[#E6E7EB] bg-white hover:border-[rgba(30,59,250,0.45)] hover:bg-[#F8F8F9] dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 dark:hover:bg-slate-900/45",
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
                                                        <Badge variant="outline" className="h-[20px] rounded-[4px] border-[#E6E7EB] px-1.5 text-[10px] font-normal text-[#86888F] shadow-none">{role.permission_keys.length}</Badge>
                                                        {!role.is_system && (
                                                            <Badge variant="outline" className="h-[20px] rounded-[4px] border-transparent bg-[rgba(46,156,255,0.1)] px-1.5 text-[10px] font-normal text-[#2E9CFF] shadow-none">{labels.customRole}</Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] leading-5 text-[#86888F]">{role.description}</p>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Role Permissions Preview */}
                            <div className="rounded-[6px] border border-[#EBEEF5] bg-[#F7F8FA] p-3 dark:border-slate-800 dark:bg-slate-900/35">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <h4 className="text-[13px] font-semibold text-[#0E1114] dark:text-slate-100">{labels.rolePermissions}</h4>
                                    <Badge variant="outline" className="h-[20px] rounded-[4px] border-[#E6E7EB] bg-white px-1.5 text-[10px] font-normal text-[#86888F] shadow-none">{selectedRolePermissionKeys.length}</Badge>
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
                                    <h4 className="text-[13px] font-semibold text-[#0E1114] dark:text-slate-100">{labels.effectivePermissions}</h4>
                                    <div className="flex items-center gap-2 text-[11px]">
                                        <span className="inline-flex items-center gap-1 text-[#0A9C71]">
                                            <span className="inline-block h-2 w-2 rounded-full bg-[#0CC991]" />
                                            {labels.grantedPermissions} {form.grantedPermissions.length}
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-[#F53F3F]">
                                            <span className="inline-block h-2 w-2 rounded-full bg-[#F53F3F]" />
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
                                                <div key={category} className="rounded-[6px] border border-[#EBEEF5] bg-white dark:border-slate-800 dark:bg-slate-950">
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[#F8F8F9] dark:hover:bg-slate-900"
                                                        onClick={() => togglePermCategoryExpand(category)}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-[#86888F] transition-transform duration-200", !isExpanded && "-rotate-90")} />
                                                            <span className="text-[12px] font-medium">{categoryLabel(category, labels)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {hasOverrides && (
                                                                <span className="flex items-center gap-1.5 text-[10px]">
                                                                    {counts.granted > 0 && (
                                                                        <span className="inline-flex items-center gap-0.5 rounded-[4px] bg-[rgba(12,201,145,0.1)] px-1.5 py-0.5 font-medium text-[#0A9C71]">
                                                                            +{counts.granted}
                                                                        </span>
                                                                    )}
                                                                    {counts.revoked > 0 && (
                                                                        <span className="inline-flex items-center gap-0.5 rounded-[4px] bg-[rgba(245,63,63,0.08)] px-1.5 py-0.5 font-medium text-[#F53F3F]">
                                                                            -{counts.revoked}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            )}
                                                            <Badge variant="outline" className="h-[20px] rounded-[4px] border-[#E6E7EB] bg-white px-1.5 text-[10px] font-normal text-[#86888F] shadow-none">{counts.total}</Badge>
                                                        </div>
                                                    </button>
                                                    {isExpanded && (
                                                        <div className="border-t px-3 py-2">
                                                            {grantedPerms.length > 0 && (
                                                                <div className="mb-2">
                                                                    <p className="mb-1.5 text-[11px] font-medium text-[#0A9C71]">{labels.grantedPermissions}</p>
                                                                    <div className="space-y-1.5">
                                                                        {grantedPerms.map((permission) => {
                                                                            const checked = form.grantedPermissions.includes(permission.key);
                                                                            return (
                                                                                <label
                                                                                    key={permission.key}
                                                                                    className={cn(
                                                                                        "flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-2 transition-colors",
                                                                                        checked
                                                                                            ? "border-[rgba(12,201,145,0.32)] bg-[rgba(12,201,145,0.06)] dark:border-emerald-800 dark:bg-emerald-950/25"
                                                                                            : "border-transparent hover:border-[rgba(12,201,145,0.22)] hover:bg-[rgba(12,201,145,0.03)] dark:hover:border-emerald-900/50",
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
                                                                                        <span className="block text-[12px] font-medium text-[#0E1114] dark:text-slate-100">{permission.name}</span>
                                                                                        <span className="block text-[11px] leading-5 text-[#86888F]">{permission.description}</span>
                                                                                    </div>
                                                                                </label>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {revokedPerms.length > 0 && (
                                                                <div>
                                                                    <p className="mb-1.5 text-[11px] font-medium text-[#F53F3F]">{labels.revokedPermissions}</p>
                                                                    <div className="space-y-1.5">
                                                                        {revokedPerms.map((permission) => {
                                                                            const checked = form.revokedPermissions.includes(permission.key);
                                                                            return (
                                                                                <label
                                                                                    key={permission.key}
                                                                                    className={cn(
                                                                                        "flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-2 transition-colors",
                                                                                        checked
                                                                                            ? "border-[rgba(245,63,63,0.28)] bg-[rgba(245,63,63,0.05)] dark:border-rose-800 dark:bg-rose-950/25"
                                                                                            : "border-transparent hover:border-[rgba(245,63,63,0.2)] hover:bg-[rgba(245,63,63,0.03)] dark:hover:border-rose-900/50",
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
                                                                                        <span className="block text-[12px] font-medium text-[#0E1114] dark:text-slate-100">{permission.name}</span>
                                                                                        <span className="block text-[11px] leading-5 text-[#86888F]">{permission.description}</span>
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
                    <TabsContent value="scope" className="mt-0 min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-4">
                        <div className="space-y-5">
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
                                            {dataScopeOptions.map((scope) => (
                                                <SelectItem key={scope} value={scope}>
                                                    {getDataScopeLabel(scope, labels)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <label className="flex items-start gap-3 rounded-[6px] border border-[rgba(255,171,36,0.32)] bg-[rgba(255,171,36,0.08)] p-3 text-[#5E5F66] dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                                    <Checkbox
                                        checked={form.dataScopeDowngradeConfirmed}
                                        onCheckedChange={(checked) => onChange({ ...form, dataScopeDowngradeConfirmed: checked === true })}
                                        disabled={saving}
                                    />
                                    <div className="space-y-1">
                                        <p className="text-[12px] font-medium text-[#D48806]">{labels.scopeDowngradeConfirm}</p>
                                        <p className="text-[11px] leading-5 text-[#86888F] dark:text-amber-200">{labels.scopeDowngradeConfirmDesc}</p>
                                    </div>
                                </label>
                            </div>
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <Label>{labels.customOrgs}</Label>
                                        <p className="mt-1 text-[11px] leading-5 text-[#86888F]">{labels.customOrgsHelp}</p>
                                    </div>
                                    <div className="max-w-full sm:max-w-[50%]">
                                        <CompactBadgeList items={selectedCustomOrganizations} max={3} emptyLabel={labels.emptySelection} />
                                    </div>
                                </div>
                                <ScrollArea className="h-48 rounded-[6px] border border-[#E6E7EB] bg-white dark:border-slate-800 dark:bg-slate-950">
                                    <div className="space-y-2 p-3 pr-4">
                                        {organizationRows.map((row) => (
                                            <label
                                                key={row.organization.org_code}
                                                className="flex cursor-pointer items-start gap-3 rounded-[4px] px-2 py-2 text-[12px] transition-colors hover:bg-[#F8F8F9] dark:hover:bg-slate-900"
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
                    <TabsContent value="boundary" className="mt-0 min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-4">
                        <div>
                            <AuthorizationBoundaryForm
                                value={form.authorizationBoundary}
                                organizations={organizations}
                                roles={assignableRoles}
                                permissions={permissions}
                                dataScopeOptions={dataScopeOptions}
                                actorBoundary={actorBoundary}
                                labels={labels}
                                disabled={saving}
                                onChange={(authorizationBoundary) => onChange({ ...form, authorizationBoundary })}
                            />
                        </div>
                    </TabsContent>
                </Tabs>

                <DialogFooter className="shrink-0 items-center gap-2 border-t border-[#F2F3F5] bg-[#FAFAFB] px-6 py-4 sm:gap-2 dark:border-slate-800 dark:bg-slate-900/40">
                    {showErrors && totalErrorCount > 0 && (
                        <div className="flex items-center gap-1.5 text-[12px] text-[#F53F3F]">
                            <AlertCircle className="h-4 w-4" />
                            <span>{totalErrorCount === 1 ? labels.formHasError : labels.formHasErrors.replace('{count}', String(totalErrorCount))}</span>
                        </div>
                    )}
                    <div className="flex-1" />
                    <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-4 text-[12px] font-normal text-[#33353D] shadow-none" onClick={onCancel} disabled={saving}>
                        {labels.cancelLabel}
                    </Button>
                    <Button className="h-8 rounded-[6px] bg-[#1E3BFA] px-4 text-[12px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={handleSubmit} disabled={saving}>
                        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {mode === 'create' ? labels.createUser : labels.saveChanges}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
