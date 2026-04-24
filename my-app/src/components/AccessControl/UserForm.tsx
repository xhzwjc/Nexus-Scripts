'use client';

import { type ComponentType, type ReactNode, useMemo, useRef } from 'react';
import { Building2, CheckCircle2, KeyRound, Layers3, Loader2, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react';
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

function FormSection({
    icon: Icon,
    title,
    description,
    children,
    className,
}: {
    icon: ComponentType<{ className?: string }>;
    title: string;
    description?: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={cn("rounded-2xl border border-slate-200/80 bg-white/72 p-4 shadow-[0_1px_8px_rgba(15,23,42,0.04)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/55", className)}>
            <div className="mb-4 flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">{title}</h3>
                    {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
                </div>
            </div>
            {children}
        </section>
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

                        <FormSection
                            icon={UserRound}
                            title={labels.userFormBasicInfo}
                            description={labels.userFormBasicInfoDesc}
                        >
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
                        </FormSection>

                        <FormSection
                            icon={Building2}
                            title={labels.userFormOrganization}
                            description={labels.orgGovernanceDesc}
                        >
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
                        </FormSection>

                        <FormSection
                            icon={Layers3}
                            title={labels.userFormDataScope}
                            description={labels.userFormDataScopeDesc}
                        >
                            <div className="grid gap-4">
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
                        </FormSection>

                        <FormSection
                            icon={KeyRound}
                            title={labels.userFormConfigPermission}
                            description={labels.userFormConfigPermissionDesc}
                        >
                            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                <div className="space-y-4">
                                    <div
                                        className={cn(
                                            "rounded-2xl border p-4 transition-colors",
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
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div>
                                                <h4 className="text-sm font-semibold text-slate-950 dark:text-slate-100">{labels.roles}</h4>
                                                <p className="text-xs text-muted-foreground">{labels.rolePermissions}</p>
                                            </div>
                                            <Badge variant="outline">{form.roleCodes.length}</Badge>
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
                                                        className={cn(
                                                            "group flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors",
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
                                                                <Badge variant="outline">{role.permission_keys.length}</Badge>
                                                                {!role.is_system && (
                                                                    <Badge variant="outline">{labels.customRole}</Badge>
                                                                )}
                                                                {checked && <CheckCircle2 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-300" />}
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
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/35">
                                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                            <h4 className="text-sm font-semibold text-slate-950 dark:text-slate-100">{labels.rolePermissions}</h4>
                                            <Badge variant="outline">{selectedRolePermissionKeys.length}</Badge>
                                        </div>
                                        <CompactBadgeList
                                            items={selectedRolePermissionKeys.map((permissionKey) => permissionMap.get(permissionKey)?.name || permissionKey)}
                                            max={8}
                                            emptyLabel={labels.emptySelection}
                                        />
                                    </div>

                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/55 p-4 dark:border-emerald-900/70 dark:bg-emerald-950/20">
                                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                                <h4 className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">{labels.grantedPermissions}</h4>
                                                <Badge variant="outline">{form.grantedPermissions.length}</Badge>
                                            </div>
                                            <ScrollArea className="h-56 pr-3">
                                                <div className="space-y-3">
                                                    {grantablePermissions.map((permission) => {
                                                        const checked = form.grantedPermissions.includes(permission.key);
                                                        return (
                                                            <label
                                                                key={permission.key}
                                                                className={cn(
                                                                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                                                                    checked
                                                                        ? "border-emerald-300 bg-white/85 dark:border-emerald-800 dark:bg-emerald-950/35"
                                                                        : "border-transparent bg-white/55 hover:border-emerald-200 hover:bg-white/80 dark:bg-slate-950/25 dark:hover:border-emerald-900/60 dark:hover:bg-slate-900/45",
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
                                                                <span>
                                                                    <span className="block text-sm font-medium text-slate-950 dark:text-slate-100">{permission.name}</span>
                                                                    <span className="block text-xs leading-5 text-muted-foreground">{permission.description}</span>
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </ScrollArea>
                                        </div>

                                        <div className="rounded-2xl border border-rose-200/70 bg-rose-50/55 p-4 dark:border-rose-900/70 dark:bg-rose-950/20">
                                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                                <h4 className="text-sm font-semibold text-rose-950 dark:text-rose-100">{labels.revokedPermissions}</h4>
                                                <Badge variant="outline">{form.revokedPermissions.length}</Badge>
                                            </div>
                                            <ScrollArea className="h-56 pr-3">
                                                <div className="space-y-3">
                                                    {revokablePermissions.map((permission) => {
                                                        const checked = form.revokedPermissions.includes(permission.key);
                                                        return (
                                                            <label
                                                                key={permission.key}
                                                                className={cn(
                                                                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                                                                    checked
                                                                        ? "border-rose-300 bg-white/85 dark:border-rose-800 dark:bg-rose-950/35"
                                                                        : "border-transparent bg-white/55 hover:border-rose-200 hover:bg-white/80 dark:bg-slate-950/25 dark:hover:border-rose-900/60 dark:hover:bg-slate-900/45",
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
                                                                <span>
                                                                    <span className="block text-sm font-medium text-slate-950 dark:text-slate-100">{permission.name}</span>
                                                                    <span className="block text-xs leading-5 text-muted-foreground">{permission.description}</span>
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </ScrollArea>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </FormSection>

                        <AuthorizationBoundaryForm
                            value={form.authorizationBoundary}
                            organizations={organizations}
                            roles={assignableRoles}
                            permissions={permissions}
                            labels={labels}
                            disabled={saving}
                            onChange={(authorizationBoundary) => onChange({ ...form, authorizationBoundary })}
                        />

                        <FormSection
                            icon={SlidersHorizontal}
                            title={labels.userFormStatusNotes}
                            description={labels.userFormStatusNotesDesc}
                        >
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className={cn(
                                    "flex items-center gap-3 rounded-xl border p-4 transition-colors",
                                    form.isActive
                                        ? "border-teal-200 bg-teal-50/80 dark:border-teal-900/70 dark:bg-teal-950/25"
                                        : "border-slate-200/80 bg-white/70 dark:border-slate-800 dark:bg-slate-950/35",
                                )}>
                                    <Checkbox
                                        checked={form.isActive}
                                        onCheckedChange={(checked) => onChange({ ...form, isActive: checked === true })}
                                        disabled={saving}
                                    />
                                    <span className="text-sm font-medium">{labels.active}</span>
                                </label>
                                <label className={cn(
                                    "flex items-center gap-3 rounded-xl border p-4 transition-colors",
                                    form.isSuperAdmin
                                        ? "border-amber-200 bg-amber-50/80 dark:border-amber-900/70 dark:bg-amber-950/25"
                                        : "border-slate-200/80 bg-white/70 dark:border-slate-800 dark:bg-slate-950/35",
                                )}>
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
                        </FormSection>
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
