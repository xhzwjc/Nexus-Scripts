'use client';

import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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
import { buildOrganizationTreeRows, createOrganizationMap, OrganizationTreeText } from './organizationTree';
import { cn } from '@/lib/utils';
import type { AccessControlLabels } from './utils';
import { categoryLabel, filterOrganizationsByActorBoundary, filterPermissionsByActorBoundary, filterRolesByActorBoundary, getDataScopeLabel, groupPermissionsByCategory, toggleItem } from './utils';

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
    const actorFilteredOrganizations = useMemo(() => filterOrganizationsByActorBoundary(organizations, actorBoundary), [organizations, actorBoundary]);
    const actorFilteredRoles = useMemo(() => filterRolesByActorBoundary(roles, actorBoundary), [roles, actorBoundary]);
    const actorFilteredPermissions = useMemo(() => filterPermissionsByActorBoundary(permissions, actorBoundary), [permissions, actorBoundary]);
    const permissionGroups = useMemo(() => groupPermissionsByCategory(actorFilteredPermissions), [actorFilteredPermissions]);
    const organizationRows = useMemo(() => buildOrganizationTreeRows(actorFilteredOrganizations), [actorFilteredOrganizations]);
    const organizationMap = useMemo(() => createOrganizationMap(actorFilteredOrganizations), [actorFilteredOrganizations]);

    return (
        <div className="bg-white dark:bg-slate-950">
            <p className="mb-3 text-[11px] leading-5 text-[#86888F]">{labels.authorizationBoundaryHelp}</p>
            <div className="grid gap-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <label
                        className={cn(
                            "flex items-start gap-3 rounded-[6px] border p-3 transition-colors",
                            value.canGrant
                                ? "border-[#1E3BFA] bg-[rgba(30,59,250,0.03)] dark:border-blue-700 dark:bg-blue-950/20"
                                : "border-[#E6E7EB] bg-[#F7F8FA] dark:border-slate-800 dark:bg-slate-900/35",
                        )}
                    >
                        <Checkbox
                            checked={value.canGrant}
                            onCheckedChange={(checked) => {
                                const next = checked === true;
                                if (!next) {
                                    onChange({
                                        ...value,
                                        canGrant: false,
                                        manageableOrgCodes: [],
                                        assignableRoleCodes: [],
                                        assignablePermissionKeys: [],
                                        maxDataScope: 'SELF',
                                    });
                                } else {
                                    onChange({ ...value, canGrant: true });
                                }
                            }}
                            disabled={disabled}
                        />
                        <div>
                            <p className="text-[12px] font-medium text-[#0E1114] dark:text-slate-100">{labels.canGrant}</p>
                            <p className="text-[11px] leading-5 text-[#86888F]">{labels.canGrantHelp}</p>
                        </div>
                    </label>
                    <div className="space-y-2 rounded-[6px] border border-[#E6E7EB] bg-[#F7F8FA] p-3 dark:border-slate-800 dark:bg-slate-900/35">
                        <Label className="text-[12px] font-normal text-[#33353D]">{labels.maxGrantableDataScope}</Label>
                        <Select
                            value={value.maxDataScope}
                            onValueChange={(next) => onChange({ ...value, maxDataScope: next as DataScope })}
                            disabled={disabled || !value.canGrant}
                        >
                            <SelectTrigger>
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
                    </div>
                </div>

                {value.canGrant && value.manageableOrgCodes.length === 0 && value.assignableRoleCodes.length === 0 && value.assignablePermissionKeys.length === 0 && actorBoundary && (
                    <div className="flex items-start gap-2 rounded-[6px] border border-[rgba(255,171,36,0.32)] bg-[rgba(255,171,36,0.08)] p-3 text-[#D48806] dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p className="text-[11px] leading-5">{labels.boundaryEmptyWarning}</p>
                    </div>
                )}

                <div className="grid items-start gap-4 xl:grid-cols-[minmax(420px,1.35fr)_minmax(0,0.95fr)]">
                    <div className="overflow-hidden rounded-[6px] border border-[#EBEEF5] bg-[#F7F8FA] dark:border-slate-800 dark:bg-slate-900/30">
                        <div className="border-b border-[#F2F3F5] p-3 dark:border-slate-800">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[12px] font-medium text-[#0E1114] dark:text-slate-100">{labels.manageableOrganizations}</p>
                                <Badge variant="outline" className="h-[20px] rounded-[4px] border-[#E6E7EB] bg-white px-1.5 text-[10px] font-normal text-[#86888F] shadow-none">{value.manageableOrgCodes.length}</Badge>
                            </div>
                        </div>
                        <ScrollArea className="max-h-48 p-3">
                            <div className="space-y-2 pr-3">
                                {organizationRows.map((row) => {
                                    const checked = value.manageableOrgCodes.includes(row.organization.org_code);
                                    return (
                                        <label
                                            key={row.organization.org_code}
                                            className={cn(
                                                "flex cursor-pointer items-start gap-3 rounded-[4px] px-2 py-2 text-[12px] transition-colors hover:bg-white",
                                                checked && "bg-white",
                                            )}
                                        >
                                            <Checkbox
                                                checked={checked}
                                                onCheckedChange={(next) => onChange({
                                                    ...value,
                                                    manageableOrgCodes: toggleItem(value.manageableOrgCodes, row.organization.org_code, next === true),
                                                })}
                                                disabled={disabled || !value.canGrant}
                                            />
                                            <OrganizationTreeText
                                                row={row}
                                                labels={labels}
                                                organizationMap={organizationMap}
                                            />
                                        </label>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="overflow-hidden rounded-[6px] border border-[#EBEEF5] bg-[#F7F8FA] dark:border-slate-800 dark:bg-slate-900/30">
                            <div className="border-b border-[#F2F3F5] p-3 dark:border-slate-800">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-[12px] font-medium text-[#0E1114] dark:text-slate-100">{labels.assignableRoles}</p>
                                    <Badge variant="outline" className="h-[20px] rounded-[4px] border-[#E6E7EB] bg-white px-1.5 text-[10px] font-normal text-[#86888F] shadow-none">{value.assignableRoleCodes.length}</Badge>
                                </div>
                            </div>
                            <ScrollArea className="h-64 p-3">
                                <div className="space-y-3 pr-3">
                                    {actorFilteredRoles.map((role) => {
                                        const checked = value.assignableRoleCodes.includes(role.code);
                                        return (
                                            <label
                                                key={role.code}
                                                className={cn(
                                                    "flex cursor-pointer items-start gap-3 rounded-[6px] border p-3 transition-colors",
                                                    checked
                                                        ? "border-[#1E3BFA] bg-white dark:border-blue-700 dark:bg-blue-950/20"
                                                        : "border-transparent bg-white/70 hover:border-[#E6E7EB] hover:bg-white dark:bg-slate-950/20 dark:hover:border-slate-700 dark:hover:bg-slate-900/50",
                                                )}
                                            >
                                                <Checkbox
                                                    checked={checked}
                                                    onCheckedChange={(next) => onChange({
                                                        ...value,
                                                        assignableRoleCodes: toggleItem(value.assignableRoleCodes, role.code, next === true),
                                                    })}
                                                    disabled={disabled || !value.canGrant}
                                                />
                                                <span className="text-[12px] text-[#0E1114] dark:text-slate-100">
                                                    {role.name}
                                                    <span className="ml-1 font-mono text-xs text-muted-foreground">{role.code}</span>
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </ScrollArea>
                        </div>

                        <div className="overflow-hidden rounded-[6px] border border-[#EBEEF5] bg-[#F7F8FA] dark:border-slate-800 dark:bg-slate-900/30">
                            <div className="border-b border-[#F2F3F5] p-3 dark:border-slate-800">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-[12px] font-medium text-[#0E1114] dark:text-slate-100">{labels.assignablePermissions}</p>
                                    <Badge variant="outline" className="h-[20px] rounded-[4px] border-[#E6E7EB] bg-white px-1.5 text-[10px] font-normal text-[#86888F] shadow-none">{value.assignablePermissionKeys.length}</Badge>
                                </div>
                            </div>
                            <ScrollArea className="h-64 p-3">
                                <div className="space-y-4 pr-3">
                                    {Object.entries(permissionGroups).map(([category, categoryPermissions]) => (
                                        <div key={category} className="space-y-2">
                                            <p className="text-[10px] font-medium uppercase tracking-wide text-[#86888F]">
                                                {categoryLabel(category, labels)}
                                            </p>
                                            {categoryPermissions.map((permission) => {
                                                const checked = value.assignablePermissionKeys.includes(permission.key);
                                                return (
                                                    <label
                                                        key={permission.key}
                                                        className={cn(
                                                            "flex cursor-pointer items-start gap-3 rounded-[6px] border p-3 transition-colors",
                                                            checked
                                                                ? "border-[#1E3BFA] bg-white dark:border-blue-700 dark:bg-blue-950/20"
                                                                : "border-transparent bg-white/70 hover:border-[#E6E7EB] hover:bg-white dark:bg-slate-950/20 dark:hover:border-slate-700 dark:hover:bg-slate-900/50",
                                                        )}
                                                    >
                                                        <Checkbox
                                                            checked={checked}
                                                            onCheckedChange={(next) => onChange({
                                                                ...value,
                                                                assignablePermissionKeys: toggleItem(value.assignablePermissionKeys, permission.key, next === true),
                                                            })}
                                                            disabled={disabled || !value.canGrant}
                                                        />
                                                        <span className="min-w-0">
                                                            <span className="block text-[12px] text-[#0E1114] dark:text-slate-100">{permission.name}</span>
                                                            <span className="mt-0.5 block text-[11px] leading-5 text-[#86888F]">{permission.description}</span>
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
