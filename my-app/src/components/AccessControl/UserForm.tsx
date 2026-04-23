'use client';

import { useMemo, useRef } from 'react';
import { Loader2 } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
import { getDataScopeLabel, toggleItem } from './utils';

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

    const handleOpenAutoFocus = (event: Event) => {
        event.preventDefault();
        requestAnimationFrame(() => {
            userCodeInputRef.current?.focus();
        });
    };

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
            <DialogContent className="sm:max-w-6xl" onOpenAutoFocus={handleOpenAutoFocus}>
                <DialogHeader>
                    <DialogTitle>{mode === 'create' ? labels.createTitle : labels.editTitle}</DialogTitle>
                    <DialogDescription>{labels.userFormDescription}</DialogDescription>
                </DialogHeader>

                <div className="max-h-[72vh] overflow-y-auto pr-2">
                    <div className="space-y-6 pb-1">
                        {dialogError && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {dialogError}
                            </div>
                        )}

                        <section className="rounded-lg border bg-muted/10 p-4">
                            <div className="mb-4">
                                <h3 className="text-sm font-semibold">{labels.userFormBasicInfo}</h3>
                                <p className="text-xs text-muted-foreground">{labels.userFormBasicInfoDesc}</p>
                            </div>
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
                        </section>

                        <section className="rounded-lg border bg-muted/10 p-4">
                            <div className="mb-4">
                                <h3 className="text-sm font-semibold">{labels.userFormOrganization}</h3>
                                <p className="text-xs text-muted-foreground">{labels.orgGovernanceDesc}</p>
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
                                    <Label htmlFor="rbac-notes-inline">{labels.notes}</Label>
                                    <Input
                                        id="rbac-notes-inline"
                                        value={form.notes}
                                        onChange={(event) => onChange({ ...form, notes: event.target.value })}
                                        disabled={saving}
                                    />
                                </div>
                            </div>
                        </section>

                        <section className="rounded-lg border bg-muted/10 p-4">
                            <div className="mb-4">
                                <h3 className="text-sm font-semibold">{labels.userFormDataScope}</h3>
                                <p className="text-xs text-muted-foreground">{labels.userFormDataScopeDesc}</p>
                            </div>
                            <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
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
                                <div className="space-y-2">
                                    <Label>{labels.customOrgs}</Label>
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
                                    <CompactBadgeList items={selectedCustomOrganizations} max={3} emptyLabel={labels.emptySelection} />
                                    <p className="text-xs text-muted-foreground">{labels.customOrgsHelp}</p>
                                </div>
                                <label className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                                    <Checkbox
                                        checked={form.dataScopeDowngradeConfirmed}
                                        onCheckedChange={(checked) => onChange({ ...form, dataScopeDowngradeConfirmed: checked === true })}
                                        disabled={saving}
                                    />
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium">{labels.scopeDowngradeConfirm}</p>
                                        <p className="text-xs text-amber-800 dark:text-amber-200">{labels.scopeDowngradeConfirmDesc}</p>
                                    </div>
                                </label>
                            </div>
                        </section>

                        <section className="rounded-lg border bg-muted/10 p-4">
                            <div className="mb-4">
                                <h3 className="text-sm font-semibold">{labels.userFormConfigPermission}</h3>
                                <p className="text-xs text-muted-foreground">{labels.userFormConfigPermissionDesc}</p>
                            </div>
                            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                <div className="space-y-4">
                                    <div className="rounded-md border bg-background p-4">
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
                                                <Label htmlFor="rbac-team-resource-key" className="cursor-pointer font-medium">
                                                    {labels.teamResourcesLoginKey}
                                                </Label>
                                                <p className="mt-1 text-sm text-muted-foreground">{labels.teamResourcesLoginKeyHelp}</p>
                                                <Badge className="mt-2" variant={form.teamResourcesLoginKeyEnabled ? 'default' : 'outline'}>
                                                    {form.teamResourcesLoginKeyEnabled
                                                        ? labels.teamResourcesLoginKeyEnabled
                                                        : labels.teamResourcesLoginKeyDisabled}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div>
                                            <h4 className="text-sm font-semibold">{labels.roles}</h4>
                                            <p className="text-xs text-muted-foreground">{labels.rolePermissions}</p>
                                        </div>
                                        {showErrors && errors.roleCodes && (
                                            <p className="text-xs text-destructive">{errors.roleCodes}</p>
                                        )}
                                        <div className="grid gap-3 md:grid-cols-2">
                                            {assignableRoles.map((role) => {
                                                const checked = form.roleCodes.includes(role.code);
                                                return (
                                                    <label
                                                        key={role.code}
                                                        className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-3 transition-colors hover:bg-muted/40"
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
                                                                <span className="font-medium">{role.name}</span>
                                                                <Badge variant="outline">{role.permission_keys.length}</Badge>
                                                                {!role.is_system && (
                                                                    <Badge variant="outline">{labels.customRole}</Badge>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-muted-foreground">{role.description}</p>
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="rounded-md border bg-background p-4">
                                        <h4 className="mb-3 text-sm font-semibold">{labels.rolePermissions}</h4>
                                        <CompactBadgeList
                                            items={selectedRolePermissionKeys.map((permissionKey) => permissionMap.get(permissionKey)?.name || permissionKey)}
                                            max={8}
                                            emptyLabel={labels.emptySelection}
                                        />
                                    </div>

                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="rounded-md border bg-background p-4">
                                            <h4 className="mb-3 text-sm font-semibold">{labels.grantedPermissions}</h4>
                                            <ScrollArea className="h-56 pr-3">
                                                <div className="space-y-3">
                                                    {grantablePermissions.map((permission) => (
                                                        <label key={permission.key} className="flex items-start gap-3">
                                                            <Checkbox
                                                                checked={form.grantedPermissions.includes(permission.key)}
                                                                onCheckedChange={(checked) => onChange({
                                                                    ...form,
                                                                    grantedPermissions: toggleItem(form.grantedPermissions, permission.key, checked === true),
                                                                })}
                                                                disabled={saving}
                                                            />
                                                            <span>
                                                                <span className="block text-sm font-medium">{permission.name}</span>
                                                                <span className="block text-xs text-muted-foreground">{permission.description}</span>
                                                            </span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                        </div>

                                        <div className="rounded-md border bg-background p-4">
                                            <h4 className="mb-3 text-sm font-semibold">{labels.revokedPermissions}</h4>
                                            <ScrollArea className="h-56 pr-3">
                                                <div className="space-y-3">
                                                    {revokablePermissions.map((permission) => (
                                                        <label key={permission.key} className="flex items-start gap-3">
                                                            <Checkbox
                                                                checked={form.revokedPermissions.includes(permission.key)}
                                                                onCheckedChange={(checked) => onChange({
                                                                    ...form,
                                                                    revokedPermissions: toggleItem(form.revokedPermissions, permission.key, checked === true),
                                                                })}
                                                                disabled={saving}
                                                            />
                                                            <span>
                                                                <span className="block text-sm font-medium">{permission.name}</span>
                                                                <span className="block text-xs text-muted-foreground">{permission.description}</span>
                                                            </span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <AuthorizationBoundaryForm
                            value={form.authorizationBoundary}
                            organizations={organizations}
                            roles={assignableRoles}
                            permissions={permissions}
                            labels={labels}
                            disabled={saving}
                            onChange={(authorizationBoundary) => onChange({ ...form, authorizationBoundary })}
                        />

                        <section className="rounded-lg border bg-muted/10 p-4">
                            <div className="mb-4">
                                <h3 className="text-sm font-semibold">{labels.userFormStatusNotes}</h3>
                                <p className="text-xs text-muted-foreground">{labels.userFormStatusNotesDesc}</p>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="flex items-center gap-3 rounded-md border bg-background p-4">
                                    <Checkbox
                                        checked={form.isActive}
                                        onCheckedChange={(checked) => onChange({ ...form, isActive: checked === true })}
                                        disabled={saving}
                                    />
                                    <span className="text-sm font-medium">{labels.active}</span>
                                </label>
                                <label className="flex items-center gap-3 rounded-md border bg-background p-4">
                                    <Checkbox
                                        checked={form.isSuperAdmin}
                                        onCheckedChange={(checked) => onChange({ ...form, isSuperAdmin: checked === true })}
                                        disabled={saving}
                                    />
                                    <span className="text-sm font-medium">{labels.superAdmin}</span>
                                </label>
                            </div>
                            <Separator className="my-4" />
                            <div className="space-y-2">
                                <Label htmlFor="rbac-notes">{labels.notes}</Label>
                                <Textarea
                                    id="rbac-notes"
                                    value={form.notes}
                                    onChange={(event) => onChange({ ...form, notes: event.target.value })}
                                    rows={4}
                                    disabled={saving}
                                />
                            </div>
                        </section>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onCancel} disabled={saving}>
                        {labels.cancelLabel}
                    </Button>
                    <Button onClick={onSubmit} disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {mode === 'create' ? labels.createUser : labels.saveChanges}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
