'use client';

import { useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';
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
import { DATA_SCOPE_OPTIONS } from './constants';
import { buildOrganizationTreeRows, createOrganizationMap, OrganizationTreeText } from './organizationTree';
import type { AccessControlLabels } from './utils';
import { categoryLabel, getDataScopeLabel, groupPermissionsByCategory, toggleItem } from './utils';

interface AuthorizationBoundaryFormProps {
    value: AuthorizationBoundary;
    organizations: ScriptHubOrganizationDefinition[];
    roles: ScriptHubRoleDefinition[];
    permissions: ScriptHubPermissionDefinition[];
    labels: AccessControlLabels;
    disabled?: boolean;
    onChange: (value: AuthorizationBoundary) => void;
}

export function AuthorizationBoundaryForm({
    value,
    organizations,
    roles,
    permissions,
    labels,
    disabled,
    onChange,
}: AuthorizationBoundaryFormProps) {
    const permissionGroups = groupPermissionsByCategory(permissions);
    const organizationRows = useMemo(() => buildOrganizationTreeRows(organizations), [organizations]);
    const organizationMap = useMemo(() => createOrganizationMap(organizations), [organizations]);

    return (
        <div className="rounded-lg border bg-background">
            <div className="border-b p-4">
                <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 text-teal-600" />
                    <div>
                        <h4 className="font-medium">{labels.authorizationBoundary}</h4>
                        <p className="text-sm text-muted-foreground">{labels.authorizationBoundaryHelp}</p>
                    </div>
                </div>
            </div>
            <div className="grid gap-4 p-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                <div className="space-y-4">
                    <label className="flex items-start gap-3 rounded-md border p-3">
                        <Checkbox
                            checked={value.canGrant}
                            onCheckedChange={(checked) => onChange({ ...value, canGrant: checked === true })}
                            disabled={disabled}
                        />
                        <div>
                            <p className="text-sm font-medium">{labels.canGrant}</p>
                            <p className="text-xs text-muted-foreground">{labels.canGrantHelp}</p>
                        </div>
                    </label>
                    <div className="space-y-2">
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
                                {DATA_SCOPE_OPTIONS.map((scope) => (
                                    <SelectItem key={scope} value={scope}>
                                        {getDataScopeLabel(scope, labels)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-md border">
                        <div className="border-b p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium">{labels.manageableOrganizations}</p>
                                <Badge variant="outline">{value.manageableOrgCodes.length}</Badge>
                            </div>
                        </div>
                        <ScrollArea className="h-64 p-3">
                            <div className="space-y-3 pr-3">
                                {organizationRows.map((row) => (
                                    <label key={row.organization.org_code} className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50">
                                        <Checkbox
                                            checked={value.manageableOrgCodes.includes(row.organization.org_code)}
                                            onCheckedChange={(checked) => onChange({
                                                ...value,
                                                manageableOrgCodes: toggleItem(value.manageableOrgCodes, row.organization.org_code, checked === true),
                                            })}
                                            disabled={disabled || !value.canGrant}
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

                    <div className="rounded-md border">
                        <div className="border-b p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium">{labels.assignableRoles}</p>
                                <Badge variant="outline">{value.assignableRoleCodes.length}</Badge>
                            </div>
                        </div>
                        <ScrollArea className="h-64 p-3">
                            <div className="space-y-3 pr-3">
                                {roles.map((role) => (
                                    <label key={role.code} className="flex items-start gap-3">
                                        <Checkbox
                                            checked={value.assignableRoleCodes.includes(role.code)}
                                            onCheckedChange={(checked) => onChange({
                                                ...value,
                                                assignableRoleCodes: toggleItem(value.assignableRoleCodes, role.code, checked === true),
                                            })}
                                            disabled={disabled || !value.canGrant}
                                        />
                                        <span className="text-sm">
                                            {role.name}
                                            <span className="ml-1 font-mono text-xs text-muted-foreground">{role.code}</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>

                    <div className="rounded-md border">
                        <div className="border-b p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium">{labels.assignablePermissions}</p>
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
                                        {categoryPermissions.map((permission) => (
                                            <label key={permission.key} className="flex items-start gap-3">
                                                <Checkbox
                                                    checked={value.assignablePermissionKeys.includes(permission.key)}
                                                    onCheckedChange={(checked) => onChange({
                                                        ...value,
                                                        assignablePermissionKeys: toggleItem(value.assignablePermissionKeys, permission.key, checked === true),
                                                    })}
                                                    disabled={disabled || !value.canGrant}
                                                />
                                                <span className="text-sm">{permission.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </div>
        </div>
    );
}
