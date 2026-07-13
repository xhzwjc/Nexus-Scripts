'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type {
    AuthorizationBoundary,
    DataScope,
    ScriptHubOrganizationDefinition,
    ScriptHubPermissionDefinition,
    ScriptHubRoleDefinition,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { buildOrganizationTreeRows, orgTypeLabel } from './organizationTree';
import type { AccessControlLabels } from './utils';
import {
    categoryLabel,
    filterOrganizationsByActorBoundary,
    filterPermissionsByActorBoundary,
    filterRolesByActorBoundary,
    getDataScopeLabel,
    groupPermissionsByCategory,
    toggleItem,
} from './utils';

interface AuthorizationBoundaryFormProps {
    value: AuthorizationBoundary;
    organizations: ScriptHubOrganizationDefinition[];
    roles: ScriptHubRoleDefinition[];
    permissions: ScriptHubPermissionDefinition[];
    dataScopeOptions: DataScope[];
    actorBoundary: AuthorizationBoundary | null;
    labels: AccessControlLabels;
    disabled?: boolean;
    onChange: (value: AuthorizationBoundary) => void;
}

const ORG_TYPE_STYLES: Record<string, { dot: string; badge: string }> = {
    group: { dot: 'bg-[#1E3BFA]', badge: 'bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]' },
    sub_group: { dot: 'bg-[#6E56CF]', badge: 'bg-[rgba(110,86,207,0.08)] text-[#6E56CF]' },
    company: { dot: 'bg-[#0CC991]', badge: 'bg-[rgba(12,201,145,0.08)] text-[#0A9C71]' },
    department: { dot: 'bg-[#2E9CFF]', badge: 'bg-[rgba(46,156,255,0.08)] text-[#2E83D0]' },
};

export function AuthorizationBoundaryForm({
    value,
    organizations,
    roles,
    permissions,
    dataScopeOptions,
    actorBoundary,
    labels,
    disabled,
    onChange,
}: AuthorizationBoundaryFormProps) {
    const [permissionEditorOpen, setPermissionEditorOpen] = useState(false);
    const actorFilteredOrganizations = useMemo(() => filterOrganizationsByActorBoundary(organizations, actorBoundary), [organizations, actorBoundary]);
    const actorFilteredRoles = useMemo(() => filterRolesByActorBoundary(roles, actorBoundary), [roles, actorBoundary]);
    const actorFilteredPermissions = useMemo(() => filterPermissionsByActorBoundary(permissions, actorBoundary), [permissions, actorBoundary]);
    const permissionGroups = useMemo(() => groupPermissionsByCategory(actorFilteredPermissions), [actorFilteredPermissions]);
    const organizationRows = useMemo(() => buildOrganizationTreeRows(actorFilteredOrganizations), [actorFilteredOrganizations]);
    const selectedPermissionSummaries = useMemo(() => Object.entries(permissionGroups)
        .map(([category, categoryPermissions]) => ({
            category,
            count: categoryPermissions.filter((permission) => value.assignablePermissionKeys.includes(permission.key)).length,
        }))
        .filter((item) => item.count > 0), [permissionGroups, value.assignablePermissionKeys]);

    useEffect(() => {
        if (!value.canGrant) setPermissionEditorOpen(false);
    }, [value.canGrant]);

    const toggleCanGrant = () => {
        onChange({ ...value, canGrant: !value.canGrant });
    };

    const updateCategory = (categoryPermissions: ScriptHubPermissionDefinition[], selected: boolean) => {
        const categoryKeys = categoryPermissions.map((permission) => permission.key);
        onChange({
            ...value,
            assignablePermissionKeys: selected
                ? [...new Set([...value.assignablePermissionKeys, ...categoryKeys])]
                : value.assignablePermissionKeys.filter((permissionKey) => !categoryKeys.includes(permissionKey)),
        });
    };

    const boundaryIsUnrestricted = value.manageableOrgCodes.length === 0
        && value.assignableRoleCodes.length === 0
        && value.assignablePermissionKeys.length === 0;

    return (
        <div className="bg-white dark:bg-slate-950">
            <button
                type="button"
                role="switch"
                aria-checked={value.canGrant}
                className="flex w-full items-center justify-between gap-5 rounded-[8px] border border-[#EBEEF5] px-4 py-3.5 text-left transition-colors hover:border-[rgba(30,59,250,0.28)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800"
                onClick={toggleCanGrant}
                disabled={disabled}
            >
                <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-[#0E1114] dark:text-slate-100">{labels.canGrant}</span>
                    <span className="mt-0.5 block text-[11px] leading-5 text-[#B0B2B8]">{labels.canGrantHelp}</span>
                </span>
                <span className={cn(
                    'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                    value.canGrant ? 'bg-[#1E3BFA]' : 'bg-[#D6D8DD] dark:bg-slate-700',
                )}>
                    <span className={cn(
                        'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(14,17,20,0.2)] transition-transform',
                        value.canGrant ? 'translate-x-[18px]' : 'translate-x-0.5',
                    )} />
                </span>
            </button>

            {value.canGrant && (
                <div className="mt-4 overflow-hidden rounded-[8px] border border-[#EBEEF5] bg-white dark:border-slate-800 dark:bg-slate-950">
                    <section className="flex items-center justify-between gap-5 px-[18px] py-4">
                        <div className="min-w-0">
                            <h4 className="text-[13px] font-medium text-[#0E1114] dark:text-slate-100">{labels.maxGrantableDataScope}</h4>
                            <p className="mt-0.5 text-[11px] leading-5 text-[#B0B2B8]">{labels.maxGrantableDataScopeHelp}</p>
                        </div>
                        <Select
                            value={value.maxDataScope}
                            onValueChange={(next) => onChange({ ...value, maxDataScope: next as DataScope })}
                            disabled={disabled}
                        >
                            <SelectTrigger className="w-[220px] shrink-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {dataScopeOptions.map((scope) => (
                                    <SelectItem key={scope} value={scope}>
                                        {getDataScopeLabel(scope, labels)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </section>

                    {boundaryIsUnrestricted && (
                        <div className="flex items-start gap-2 border-t border-[#F2F3F5] bg-[rgba(255,171,36,0.07)] px-[18px] py-2.5 text-[#8A5A00] dark:border-slate-800 dark:bg-amber-950/20 dark:text-amber-100">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#D48806]" />
                            <p className="text-[11px] leading-5">{labels.boundaryEmptyWarning}</p>
                        </div>
                    )}

                    <section className="border-t border-[#F2F3F5] px-[18px] py-4 dark:border-slate-800">
                        <div className="flex items-baseline justify-between gap-3">
                            <div>
                                <h4 className="text-[13px] font-medium text-[#0E1114] dark:text-slate-100">{labels.manageableOrganizations}</h4>
                                <p className="mt-0.5 text-[11px] leading-5 text-[#B0B2B8]">{labels.manageableOrganizationsHelp}</p>
                            </div>
                            <span className="shrink-0 text-[11px] text-[#86888F]">
                                {value.manageableOrgCodes.length > 0
                                    ? `${labels.selectedLabel} ${value.manageableOrgCodes.length} ${labels.organizationCountUnit}`
                                    : labels.boundaryNoOrgLimit}
                            </span>
                        </div>
                        <div className="mt-2.5 overflow-hidden rounded-[8px] border border-[#EBEEF5] dark:border-slate-800">
                            {organizationRows.length === 0 ? (
                                <div className="flex h-20 items-center justify-center text-[12px] text-[#B0B2B8]">{labels.noOrganizations}</div>
                            ) : organizationRows.map((row, index) => {
                                const checked = value.manageableOrgCodes.includes(row.organization.org_code);
                                const typeStyle = ORG_TYPE_STYLES[row.organization.org_type] || ORG_TYPE_STYLES.department;
                                return (
                                    <label
                                        key={row.organization.org_code}
                                        className={cn(
                                            'flex h-10 cursor-pointer items-center gap-2.5 px-3 transition-colors hover:bg-[#F8F8F9] dark:hover:bg-slate-900/60',
                                            index < organizationRows.length - 1 && 'border-b border-[#F2F3F5] dark:border-slate-800',
                                        )}
                                    >
                                        <Checkbox
                                            className="h-[15px] w-[15px] rounded-[3px]"
                                            checked={checked}
                                            onCheckedChange={(next) => onChange({
                                                ...value,
                                                manageableOrgCodes: toggleItem(value.manageableOrgCodes, row.organization.org_code, next === true),
                                            })}
                                            disabled={disabled}
                                        />
                                        <span className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${row.level * 20}px` }}>
                                            <span className={cn('h-[7px] w-[7px] shrink-0 rounded-[2px]', typeStyle.dot)} />
                                            <span className="truncate text-[12px] text-[#0E1114] dark:text-slate-100">{row.organization.name}</span>
                                            <Badge variant="outline" className={cn('h-[18px] shrink-0 rounded-[4px] border-0 px-1.5 text-[10px] font-normal shadow-none', typeStyle.badge)}>
                                                {orgTypeLabel(row.organization.org_type, labels)}
                                            </Badge>
                                            <span className="truncate font-mono text-[11px] text-[#B0B2B8]">{row.organization.org_code}</span>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </section>

                    <section className="border-t border-[#F2F3F5] px-[18px] py-4 dark:border-slate-800">
                        <div className="flex items-baseline justify-between gap-3">
                            <div>
                                <h4 className="text-[13px] font-medium text-[#0E1114] dark:text-slate-100">{labels.assignableRoles}</h4>
                                <p className="mt-0.5 text-[11px] leading-5 text-[#B0B2B8]">{labels.assignableRolesHelp}</p>
                            </div>
                            <span className="shrink-0 text-[11px] text-[#86888F]">
                                {value.assignableRoleCodes.length > 0
                                    ? `${labels.selectedLabel} ${value.assignableRoleCodes.length} ${labels.roleCountUnit}`
                                    : labels.boundaryNoRoleLimit}
                            </span>
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                            {actorFilteredRoles.length === 0 ? (
                                <span className="text-[12px] text-[#B0B2B8]">{labels.noRoles}</span>
                            ) : actorFilteredRoles.map((role) => {
                                const checked = value.assignableRoleCodes.includes(role.code);
                                return (
                                    <label
                                        key={role.code}
                                        title={`${role.name} · ${role.code}`}
                                        className={cn(
                                            'flex h-[30px] cursor-pointer items-center gap-2 rounded-[6px] border px-3 text-[12px] transition-colors',
                                            checked
                                                ? 'border-[#1E3BFA] bg-[rgba(30,59,250,0.05)] text-[#1E3BFA]'
                                                : 'border-[#E6E7EB] bg-white text-[#86888F] hover:border-[rgba(30,59,250,0.32)] dark:border-slate-800 dark:bg-slate-950',
                                        )}
                                    >
                                        <Checkbox
                                            className="h-3.5 w-3.5 rounded-[3px]"
                                            checked={checked}
                                            onCheckedChange={(next) => onChange({
                                                ...value,
                                                assignableRoleCodes: toggleItem(value.assignableRoleCodes, role.code, next === true),
                                            })}
                                            disabled={disabled}
                                        />
                                        <span>{role.name}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </section>

                    <section className="border-t border-[#F2F3F5] px-[18px] py-4 dark:border-slate-800">
                        <div>
                            <h4 className="text-[13px] font-medium text-[#0E1114] dark:text-slate-100">{labels.assignablePermissions}</h4>
                            <p className="mt-0.5 text-[11px] leading-5 text-[#B0B2B8]">{labels.assignablePermissionsHelp}</p>
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                            {selectedPermissionSummaries.length === 0 && (
                                <span className="flex h-[30px] items-center rounded-[6px] border border-[#EBEEF5] bg-[#F8F8F9] px-3 text-[11px] text-[#86888F] dark:border-slate-800 dark:bg-slate-900/40">
                                    {labels.boundaryNoPermissionLimit}
                                </span>
                            )}
                            {selectedPermissionSummaries.map((summary) => (
                                <span key={summary.category} className="flex h-[30px] items-center gap-2 rounded-[6px] border border-[#EBEEF5] bg-[#F8F8F9] px-3 dark:border-slate-800 dark:bg-slate-900/40">
                                    <span className="text-[12px] text-[#33353D] dark:text-slate-200">{categoryLabel(summary.category, labels)}</span>
                                    <span className="text-[11px] tabular-nums text-[#86888F]">{summary.count} {labels.permissionCountUnit}</span>
                                </span>
                            ))}
                            <button
                                type="button"
                                className="flex h-[30px] items-center gap-1.5 rounded-[6px] border border-dashed border-[#D6D8DD] px-3 text-[12px] text-[#1E3BFA] transition-colors hover:border-[#1E3BFA] hover:bg-[rgba(30,59,250,0.03)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700"
                                onClick={() => setPermissionEditorOpen((open) => !open)}
                                disabled={disabled}
                                aria-expanded={permissionEditorOpen}
                            >
                                {permissionEditorOpen ? <ChevronDown className="h-3.5 w-3.5 rotate-180" /> : <Plus className="h-3.5 w-3.5" />}
                                {permissionEditorOpen ? labels.collapsePermissionRange : labels.addPermissionRange}
                            </button>
                        </div>

                        {permissionEditorOpen && (
                            <div className="mt-3 overflow-hidden rounded-[8px] border border-[#EBEEF5] bg-[#FAFAFB] dark:border-slate-800 dark:bg-slate-900/30">
                                <div className="flex items-center justify-between gap-3 border-b border-[#F2F3F5] px-3.5 py-2.5 dark:border-slate-800">
                                    <span className="text-[11px] leading-5 text-[#86888F]">{labels.permissionRangeEditorHelp}</span>
                                    <span className="shrink-0 text-[11px] text-[#86888F]">{labels.selectedLabel} {value.assignablePermissionKeys.length} {labels.permissionCountUnit}</span>
                                </div>
                                <ScrollArea className="max-h-[360px]">
                                    <div className="space-y-4 p-3.5 pr-4">
                                        {Object.entries(permissionGroups).map(([category, categoryPermissions]) => {
                                            const selectedCount = categoryPermissions.filter((permission) => value.assignablePermissionKeys.includes(permission.key)).length;
                                            const allSelected = selectedCount === categoryPermissions.length && categoryPermissions.length > 0;
                                            return (
                                                <div key={category} className="space-y-2">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[11px] font-medium text-[#33353D] dark:text-slate-200">{categoryLabel(category, labels)}</span>
                                                            <span className="text-[10px] text-[#B0B2B8]">{selectedCount}/{categoryPermissions.length}</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="text-[11px] text-[#0F23D9] hover:text-[#1E3BFA]"
                                                            onClick={() => updateCategory(categoryPermissions, !allSelected)}
                                                            disabled={disabled}
                                                        >
                                                            {allSelected ? labels.deselectAll : labels.selectAll}
                                                        </button>
                                                    </div>
                                                    <div className="grid gap-2 md:grid-cols-2">
                                                        {categoryPermissions.map((permission) => {
                                                            const checked = value.assignablePermissionKeys.includes(permission.key);
                                                            return (
                                                                <label
                                                                    key={permission.key}
                                                                    className={cn(
                                                                        'flex cursor-pointer items-start gap-2.5 rounded-[6px] border bg-white px-3 py-2 transition-colors dark:bg-slate-950',
                                                                        checked ? 'border-[#1E3BFA]' : 'border-[#EBEEF5] hover:border-[rgba(30,59,250,0.32)] dark:border-slate-800',
                                                                    )}
                                                                >
                                                                    <Checkbox
                                                                        className="mt-0.5 h-[15px] w-[15px] rounded-[3px]"
                                                                        checked={checked}
                                                                        onCheckedChange={(next) => onChange({
                                                                            ...value,
                                                                            assignablePermissionKeys: toggleItem(value.assignablePermissionKeys, permission.key, next === true),
                                                                        })}
                                                                        disabled={disabled}
                                                                    />
                                                                    <span className="min-w-0">
                                                                        <span className="block text-[12px] text-[#0E1114] dark:text-slate-100">{permission.name}</span>
                                                                        <span className="mt-0.5 block text-[10px] leading-4 text-[#B0B2B8]">{permission.description}</span>
                                                                    </span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}
