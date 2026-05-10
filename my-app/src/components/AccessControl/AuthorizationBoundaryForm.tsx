'use client';

import { useMemo } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
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
        <div className="rounded-2xl border border-slate-200/80 bg-white/72 shadow-[0_1px_8px_rgba(15,23,42,0.04)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/55">
            <div className="border-b border-slate-200/80 p-4 dark:border-slate-800">
                <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50 text-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:text-teal-300">
                        <ShieldCheck className="h-4 w-4" />
                    </span>
                    <div>
                        <h4 className="text-sm font-semibold text-slate-950 dark:text-slate-100">{labels.authorizationBoundary}</h4>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.authorizationBoundaryHelp}</p>
                    </div>
                </div>
            </div>
            <div className="grid gap-4 p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <label
                        className={cn(
                            "flex items-start gap-3 rounded-2xl border p-3 transition-colors",
                            value.canGrant
                                ? "border-teal-200 bg-teal-50/80 dark:border-teal-900/70 dark:bg-teal-950/25"
                                : "border-slate-200/80 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/35",
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
                            <p className="text-sm font-medium text-slate-950 dark:text-slate-100">{labels.canGrant}</p>
                            <p className="text-xs text-muted-foreground">{labels.canGrantHelp}</p>
                        </div>
                    </label>
                    <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/35">
                        <Label>{labels.maxGrantableDataScope}</Label>
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
                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p className="text-xs leading-5">{labels.boundaryEmptyWarning}</p>
                    </div>
                )}

                <div className="grid items-start gap-4 xl:grid-cols-[minmax(420px,1.35fr)_minmax(0,0.95fr)]">
                    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/55 dark:border-slate-800 dark:bg-slate-900/30">
                        <div className="border-b border-slate-200/80 p-3 dark:border-slate-800">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-slate-950 dark:text-slate-100">{labels.manageableOrganizations}</p>
                                <Badge variant="outline">{value.manageableOrgCodes.length}</Badge>
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
                                                "flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50",
                                                checked && "bg-muted/50",
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
                        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/55 dark:border-slate-800 dark:bg-slate-900/30">
                            <div className="border-b border-slate-200/80 p-3 dark:border-slate-800">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-slate-950 dark:text-slate-100">{labels.assignableRoles}</p>
                                    <Badge variant="outline">{value.assignableRoleCodes.length}</Badge>
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
                                                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                                                    checked
                                                        ? "border-teal-200 bg-white/85 dark:border-teal-900/70 dark:bg-teal-950/25"
                                                        : "border-transparent bg-white/45 hover:border-slate-200 hover:bg-white/75 dark:bg-slate-950/20 dark:hover:border-slate-700 dark:hover:bg-slate-900/50",
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
                                                <span className="text-sm text-slate-950 dark:text-slate-100">
                                                    {role.name}
                                                    <span className="ml-1 font-mono text-xs text-muted-foreground">{role.code}</span>
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </ScrollArea>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/55 dark:border-slate-800 dark:bg-slate-900/30">
                            <div className="border-b border-slate-200/80 p-3 dark:border-slate-800">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-slate-950 dark:text-slate-100">{labels.assignablePermissions}</p>
                                    <Badge variant="outline">{value.assignablePermissionKeys.length}</Badge>
                                </div>
                            </div>
                            <ScrollArea className="h-64 p-3">
                                <div className="space-y-4 pr-3">
                                    {Object.entries(permissionGroups).map(([category, categoryPermissions]) => (
                                        <div key={category} className="space-y-2">
                                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                                {categoryLabel(category, labels)}
                                            </p>
                                            {categoryPermissions.map((permission) => {
                                                const checked = value.assignablePermissionKeys.includes(permission.key);
                                                return (
                                                    <label
                                                        key={permission.key}
                                                        className={cn(
                                                            "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                                                            checked
                                                                ? "border-teal-200 bg-white/85 dark:border-teal-900/70 dark:bg-teal-950/25"
                                                                : "border-transparent bg-white/45 hover:border-slate-200 hover:bg-white/75 dark:bg-slate-950/20 dark:hover:border-slate-700 dark:hover:bg-slate-900/50",
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
                                                        <span className="text-sm text-slate-950 dark:text-slate-100">{permission.name}</span>
                                                        <span className="block text-xs text-muted-foreground">{permission.description}</span>
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
