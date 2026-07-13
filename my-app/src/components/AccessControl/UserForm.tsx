'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, Loader2 } from 'lucide-react';
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
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    initialDataScope?: DataScope | null;
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

const DATA_SCOPE_RANK: Record<DataScope, number> = {
    ALL: 4,
    ORG_AND_CHILDREN: 3,
    ORG_ONLY: 2,
    CUSTOM_ORGS: 2,
    SELF: 0,
};

function AccountStatusRow({
    checked,
    title,
    description,
    disabled,
    onCheckedChange,
}: {
    checked: boolean;
    title: string;
    description: string;
    disabled: boolean;
    onCheckedChange: (checked: boolean) => void;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            className="flex w-full items-center justify-between gap-5 rounded-[8px] border border-[#EBEEF5] px-4 py-3.5 text-left transition-colors hover:border-[rgba(30,59,250,0.28)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800"
            onClick={() => onCheckedChange(!checked)}
            disabled={disabled}
        >
            <span className="min-w-0">
                <span className="block text-[13px] font-medium text-[#0E1114] dark:text-slate-100">{title}</span>
                <span className="mt-0.5 block text-[11px] leading-5 text-[#B0B2B8]">{description}</span>
            </span>
            <span className={cn(
                'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                checked ? 'bg-[#1E3BFA]' : 'bg-[#D6D8DD] dark:bg-slate-700',
            )}>
                <span className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(14,17,20,0.2)] transition-transform',
                    checked ? 'translate-x-[18px]' : 'translate-x-0.5',
                )} />
            </span>
        </button>
    );
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
    initialDataScope,
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
    const [accessKeyMode, setAccessKeyMode] = useState<'auto' | 'custom'>('auto');
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
            setAccessKeyMode(form.accessKey ? 'custom' : 'auto');
        }
    }, [form.accessKey, mode, open]);

    const tabErrors = useMemo(() => {
        const tabMap: Record<string, string[]> = { basic: [], permissions: [], scope: [], boundary: [], account: [] };
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
            const firstErrorTab = (['basic', 'scope', 'permissions', 'boundary', 'account'] as const).find((t) => tabErrors[t].length > 0);
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

    const selectedRoleNames = useMemo(() => (
        form.roleCodes.map((roleCode) => assignableRoles.find((role) => role.code === roleCode)?.name || roleCode)
    ), [assignableRoles, form.roleCodes]);

    const isScopeDowngrade = mode === 'edit'
        && !!initialDataScope
        && DATA_SCOPE_RANK[form.dataScope] < DATA_SCOPE_RANK[initialDataScope];

    const sectionItems = [
        {
            value: 'basic',
            label: labels.userFormBasicInfo,
            summary: [form.displayName, form.userCode].filter(Boolean).join(' · ') || labels.userFormBasicInfoDesc,
        },
        {
            value: 'scope',
            label: labels.userFormOrganizationAndDataScope,
            summary: `${selectedPrimaryOrganization?.name || form.primaryOrgCode || labels.organization} · ${getDataScopeLabel(form.dataScope, labels)}`,
        },
        {
            value: 'permissions',
            label: labels.userFormRolesAndPermissions,
            summary: selectedRoleNames.join('、') || labels.userFormConfigPermissionDesc,
        },
        {
            value: 'boundary',
            label: labels.authorizationBoundary,
            summary: form.authorizationBoundary.canGrant ? labels.canGrant : labels.cannotGrant,
        },
        {
            value: 'account',
            label: labels.userFormAccountStatus,
            summary: `${form.isActive ? labels.active : labels.inactive}${form.isSuperAdmin ? ` · ${labels.superAdmin}` : ''}`,
        },
    ];

    const formTitle = mode === 'create'
        ? labels.createTitle
        : `${labels.editTitle}${form.displayName ? ` · ${form.displayName}` : ''}`;

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
            <DialogContent className="flex h-[min(780px,86vh)] w-[calc(100vw-32px)] max-w-[1000px] flex-col gap-0 overflow-hidden rounded-[10px] border-0 bg-white p-0 shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[1000px] dark:bg-slate-950" onOpenAutoFocus={handleOpenAutoFocus}>
                <DialogHeader className="shrink-0 gap-1 border-b border-[#F2F3F5] px-6 pb-4 pr-14 pt-5 text-left dark:border-slate-800">
                    <DialogTitle className="text-[16px] leading-6 text-[#0E1114] dark:text-white">{formTitle}</DialogTitle>
                    <DialogDescription className="text-[12px] leading-5 text-[#86888F]">{labels.userFormDescription}</DialogDescription>
                </DialogHeader>

                {dialogError && (
                    <div className="mx-6 mt-4 rounded-[6px] border border-[rgba(245,63,63,0.24)] bg-[rgba(245,63,63,0.06)] px-3 py-2 text-[12px] leading-5 text-[#F53F3F]">
                        {dialogError}
                    </div>
                )}

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-row gap-0 overflow-hidden [&_[data-slot=checkbox][data-state=checked]]:border-[#1E3BFA] [&_[data-slot=checkbox][data-state=checked]]:bg-[#1E3BFA] [&_[data-slot=input]]:h-[34px] [&_[data-slot=input]]:rounded-[6px] [&_[data-slot=input]]:border-[#E6E7EB] [&_[data-slot=input]]:text-[12px] [&_[data-slot=input]]:shadow-none [&_[data-slot=input]]:focus-visible:border-[#1E3BFA] [&_[data-slot=input]]:focus-visible:ring-0 [&_[data-slot=label]]:text-[12px] [&_[data-slot=label]]:font-normal [&_[data-slot=select-trigger]]:h-[34px] [&_[data-slot=select-trigger]]:rounded-[6px] [&_[data-slot=select-trigger]]:border-[#E6E7EB] [&_[data-slot=select-trigger]]:text-[12px] [&_[data-slot=select-trigger]]:shadow-none [&_[data-slot=select-trigger]]:focus:ring-0">
                    <TabsList aria-label={labels.userFormDescription} className="h-auto w-[248px] shrink-0 flex-col items-stretch justify-start gap-1 overflow-y-auto rounded-none border-r border-[#F2F3F5] bg-[#FCFCFD] p-3 dark:border-slate-800 dark:bg-slate-900/40">
                        {sectionItems.map((section, index) => (
                            <TabsTrigger
                                key={section.value}
                                value={section.value}
                                className="group h-auto w-full flex-none justify-start gap-3 whitespace-normal rounded-[8px] border-0 px-3 py-2.5 text-left shadow-none data-[state=active]:bg-[rgba(30,59,250,0.06)] data-[state=active]:shadow-none dark:data-[state=active]:bg-blue-950/30"
                            >
                                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#EBEEF5] text-[11px] font-semibold text-[#86888F] group-data-[state=active]:bg-[#1E3BFA] group-data-[state=active]:text-white dark:bg-slate-800">
                                    {index + 1}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-medium leading-5 text-[#33353D] group-data-[state=active]:text-[#1E3BFA] dark:text-slate-200">
                                        {section.label}
                                    </span>
                                    <span className="block truncate text-[11px] font-normal leading-4 text-[#B0B2B8]">
                                        {section.summary}
                                    </span>
                                </span>
                                {showErrors && tabErrors[section.value]?.length > 0 && (
                                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgba(245,63,63,0.1)] px-1 text-[9px] text-[#F53F3F]">
                                        {tabErrors[section.value].length}
                                    </span>
                                )}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <div className="min-w-0 flex-1 overflow-y-auto bg-white dark:bg-slate-950">

                    {/* ─── Tab 1: 基本信息 ─── */}
                    <TabsContent value="basic" className="m-0 px-7 py-6">
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-[14px] font-semibold leading-5 text-[#0E1114] dark:text-white">{labels.userFormBasicInfo}</h3>
                                <p className="mt-0.5 text-[12px] leading-5 text-[#B0B2B8]">{labels.userFormBasicInfoDesc}</p>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="rbac-user-code"><span className="text-[#F53F3F]">*</span> {labels.userCode}</Label>
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
                                    <Label htmlFor="rbac-display-name"><span className="text-[#F53F3F]">*</span> {labels.displayName}</Label>
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
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                className={cn('h-8 rounded-[4px] border text-[12px] transition-colors', accessKeyMode === 'auto' ? 'border-[#1E3BFA] text-[#0F23D9]' : 'border-[#E6E7EB] text-[#33353D] hover:border-[#1E3BFA]')}
                                                onClick={() => {
                                                    setAccessKeyMode('auto');
                                                    onFieldChange('accessKey');
                                                    onChange({ ...form, accessKey: '' });
                                                }}
                                                disabled={saving}
                                            >
                                                {labels.autoGenerate}
                                            </button>
                                            <button
                                                type="button"
                                                className={cn('h-8 rounded-[4px] border text-[12px] transition-colors', accessKeyMode === 'custom' ? 'border-[#1E3BFA] text-[#0F23D9]' : 'border-[#E6E7EB] text-[#33353D] hover:border-[#1E3BFA]')}
                                                onClick={() => setAccessKeyMode('custom')}
                                                disabled={saving}
                                            >
                                                {labels.customKey}
                                            </button>
                                        </div>
                                        {accessKeyMode === 'custom' && (
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
                                        )}
                                        {errors.accessKey && (
                                            <p className="text-[11px] text-[#F53F3F]">{errors.accessKey}</p>
                                        )}
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <Label htmlFor="rbac-notes">{labels.notes}</Label>
                                    <Input
                                        id="rbac-notes"
                                        value={form.notes}
                                        onChange={(event) => onChange({ ...form, notes: event.target.value })}
                                        disabled={saving}
                                    />
                                </div>
                            </div>

                        </div>
                    </TabsContent>

                    {/* ─── Tab 2: 角色与权限 ─── */}
                    <TabsContent value="permissions" className="m-0 px-7 py-6">
                        <div className="space-y-5">
                            <div>
                                <h3 className="text-[14px] font-semibold leading-5 text-[#0E1114] dark:text-white">{labels.userFormRolesAndPermissions}</h3>
                                <p className="mt-0.5 text-[12px] leading-5 text-[#B0B2B8]">{labels.userFormConfigPermissionDesc}</p>
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
                                <div className="flex flex-wrap gap-2">
                                    {assignableRoles.map((role) => {
                                        const checked = form.roleCodes.includes(role.code);
                                        return (
                                            <label
                                                key={role.code}
                                                className={cn(
                                                    "group inline-flex min-h-[32px] cursor-pointer items-center gap-2 rounded-[6px] border px-3 py-1.5 text-[12px] transition-colors",
                                                    checked
                                                        ? "border-[#1E3BFA] bg-[rgba(30,59,250,0.05)] text-[#1E3BFA] dark:border-blue-700 dark:bg-blue-950/20"
                                                        : "border-[#E6E7EB] bg-white text-[#5E5F66] hover:border-[rgba(30,59,250,0.45)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                                )}
                                                title={role.description}
                                            >
                                                <Checkbox
                                                    className="h-3.5 w-3.5 rounded-[3px]"
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
                                                <span>{role.name}</span>
                                                <span className="text-[10px] text-[#B0B2B8]">{role.permission_keys.length}</span>
                                                {!role.is_system && (
                                                    <Badge variant="outline" className="h-[18px] rounded-[4px] border-transparent bg-[rgba(46,156,255,0.1)] px-1.5 text-[9px] font-normal text-[#2E9CFF] shadow-none">{labels.customRole}</Badge>
                                                )}
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

                            <label className={cn(
                                "flex cursor-pointer items-start gap-3 rounded-[8px] border px-4 py-3 transition-colors",
                                form.teamResourcesLoginKeyEnabled
                                    ? "border-[rgba(30,59,250,0.24)] bg-[rgba(30,59,250,0.04)] dark:border-blue-900/70 dark:bg-blue-950/20"
                                    : "border-[#EBEEF5] bg-white dark:border-slate-800 dark:bg-slate-950",
                            )}>
                                <Checkbox
                                    id="rbac-team-resource-key"
                                    checked={form.teamResourcesLoginKeyEnabled}
                                    onCheckedChange={(checked) => onChange({
                                        ...form,
                                        teamResourcesLoginKeyEnabled: checked === true,
                                    })}
                                    disabled={saving}
                                />
                                <span>
                                    <span className="block text-[12px] font-medium text-[#33353D] dark:text-slate-100">{labels.teamResourcesLoginKey}</span>
                                    <span className="mt-0.5 block text-[11px] leading-5 text-[#86888F]">{labels.teamResourcesLoginKeyHelp}</span>
                                </span>
                            </label>
                        </div>
                    </TabsContent>

                    {/* ─── Tab 3: 数据范围 ─── */}
                    <TabsContent value="scope" className="m-0 px-7 py-6">
                        <div className="space-y-5">
                            <div>
                                <h3 className="text-[14px] font-semibold leading-5 text-[#0E1114] dark:text-white">{labels.userFormOrganizationAndDataScope}</h3>
                                <p className="mt-0.5 text-[12px] leading-5 text-[#B0B2B8]">{labels.userFormOrganizationAndDataScopeDesc}</p>
                            </div>
                            <div className="max-w-[440px] space-y-2">
                                <Label><span className="text-[#F53F3F]">*</span> {labels.userFormOrganization}</Label>
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
                                <Label>{labels.dataScope}</Label>
                                <div className="flex flex-wrap gap-2">
                                    {dataScopeOptions.map((scope) => {
                                        const selected = form.dataScope === scope;
                                        return (
                                            <button
                                                key={scope}
                                                type="button"
                                                className={cn(
                                                    'h-8 rounded-full border px-3.5 text-[12px] transition-colors',
                                                    selected
                                                        ? 'border-[#1E3BFA] bg-[rgba(30,59,250,0.05)] text-[#1E3BFA]'
                                                        : 'border-[#E6E7EB] bg-white text-[#33353D] hover:border-[rgba(30,59,250,0.45)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300',
                                                )}
                                                onClick={() => onChange({
                                                    ...form,
                                                    dataScope: scope,
                                                    dataScopeDowngradeConfirmed: false,
                                                })}
                                                disabled={saving}
                                            >
                                                {getDataScopeLabel(scope, labels)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {form.dataScope === 'CUSTOM_ORGS' && (
                                <div className="space-y-2 rounded-[8px] bg-[#F7F8FA] p-3.5 dark:bg-slate-900/35">
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
                                        <div className="space-y-1 p-3 pr-4">
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
                            )}

                        </div>
                    </TabsContent>

                    {/* ─── Tab 4: 授权边界 ─── */}
                    <TabsContent value="boundary" className="m-0 px-7 py-6">
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-[14px] font-semibold leading-5 text-[#0E1114] dark:text-white">{labels.authorizationBoundary}</h3>
                                <p className="mt-0.5 text-[12px] leading-5 text-[#B0B2B8]">{labels.authorizationBoundaryHelp}</p>
                            </div>
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

                    {/* ─── Tab 5: 账号状态 ─── */}
                    <TabsContent value="account" className="m-0 px-7 py-6">
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-[14px] font-semibold leading-5 text-[#0E1114] dark:text-white">{labels.userFormAccountStatus}</h3>
                                <p className="mt-0.5 text-[12px] leading-5 text-[#B0B2B8]">{labels.userFormStatusNotesDesc}</p>
                            </div>
                            <div className="space-y-3.5">
                                <AccountStatusRow
                                    checked={form.isActive}
                                    title={labels.accountActiveTitle}
                                    description={labels.accountActiveDesc}
                                    disabled={saving}
                                    onCheckedChange={(isActive) => onChange({ ...form, isActive })}
                                />
                                <AccountStatusRow
                                    checked={form.isSuperAdmin}
                                    title={labels.accountSuperAdminTitle}
                                    description={labels.accountSuperAdminDesc}
                                    disabled={saving}
                                    onCheckedChange={(isSuperAdmin) => onChange({ ...form, isSuperAdmin })}
                                />
                            </div>
                        </div>
                    </TabsContent>
                    </div>
                </Tabs>

                <DialogFooter className="min-h-16 shrink-0 items-center gap-2 border-t border-[#F2F3F5] bg-white px-6 py-4 sm:gap-2 dark:border-slate-800 dark:bg-slate-950">
                    {isScopeDowngrade && (
                        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#8A5A00] dark:text-amber-200">
                            <Checkbox
                                checked={form.dataScopeDowngradeConfirmed}
                                onCheckedChange={(checked) => onChange({ ...form, dataScopeDowngradeConfirmed: checked === true })}
                                disabled={saving}
                            />
                            <span>{labels.scopeDowngradeConfirm}</span>
                        </label>
                    )}
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
