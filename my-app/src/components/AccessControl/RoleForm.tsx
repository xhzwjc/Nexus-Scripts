'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ScriptHubPermissionDefinition, ScriptHubRoleDefinition } from '@/lib/types';
import type { RoleFormErrors, RoleFormState } from './types';
import type { AccessControlLabels } from './utils';
import { categoryLabel, groupPermissionsByCategory, toggleItem } from './utils';

export type RoleEditorMode = 'create' | 'edit' | 'clone';

interface RoleFormProps {
    mode: RoleEditorMode;
    role?: ScriptHubRoleDefinition | null;
    form: RoleFormState;
    permissions: ScriptHubPermissionDefinition[];
    labels: AccessControlLabels;
    showErrors: boolean;
    errors: RoleFormErrors;
    dialogError?: string | null;
    saving: boolean;
    onChange: (form: RoleFormState) => void;
    onFieldChange: (field: keyof RoleFormErrors) => void;
    onCancel: () => void;
    onSubmit: () => void;
}

const CATEGORY_ACCENTS: Record<string, string> = {
    business: '#1E3BFA',
    finance: '#0CC991',
    tax: '#FFAB24',
    ops: '#2E9CFF',
    sms: '#6E56CF',
    biz: '#E5484D',
    resources: '#0CC991',
    platform: '#1E3BFA',
    collaboration: '#2E9CFF',
    recruitment: '#FFAB24',
    'recruitment-config': '#E5484D',
};

const FIRST_MENU_LANDING_VALUE = '__first_menu__';

export function RoleForm({
    mode,
    role,
    form,
    permissions,
    labels,
    showErrors,
    errors,
    dialogError,
    saving,
    onChange,
    onFieldChange,
    onCancel,
    onSubmit,
}: RoleFormProps) {
    const [activeCategory, setActiveCategory] = useState('all');
    const permissionGroups = useMemo(() => groupPermissionsByCategory(permissions), [permissions]);
    const permissionGroupEntries = useMemo(() => Object.entries(permissionGroups), [permissionGroups]);
    const selectedPermissionCount = useMemo(
        () => permissions.filter((permission) => form.permissionKeys.includes(permission.key)).length,
        [form.permissionKeys, permissions],
    );
    const visiblePermissionGroups = activeCategory === 'all'
        ? permissionGroupEntries
        : permissionGroupEntries.filter(([category]) => category === activeCategory);
    const isEdit = mode === 'edit';
    const title = mode === 'create'
        ? labels.createRole
        : mode === 'clone'
            ? labels.cloneSystemRole
            : labels.editRole;
    const submitLabel = mode === 'clone' ? labels.saveAsCustomRole : mode === 'create' ? labels.createRole : labels.saveChanges;

    useEffect(() => {
        setActiveCategory('all');
    }, [mode, role?.code]);

    useEffect(() => {
        if (activeCategory !== 'all' && !permissionGroups[activeCategory]) {
            setActiveCategory('all');
        }
    }, [activeCategory, permissionGroups]);

    const toggleCategory = (categoryPermissions: ScriptHubPermissionDefinition[], selectAll: boolean) => {
        const categoryKeys = categoryPermissions.map((permission) => permission.key);
        onFieldChange('permissionKeys');
        onChange({
            ...form,
            permissionKeys: selectAll
                ? [...new Set([...form.permissionKeys, ...categoryKeys])]
                : form.permissionKeys.filter((permissionKey) => !categoryKeys.includes(permissionKey)),
        });
    };
    const permissionRailItems = [
        {
            key: 'all',
            label: labels.roleFilterAll,
            accent: 'transparent',
            permissions,
        },
        ...permissionGroupEntries.map(([category, categoryPermissions]) => ({
            key: category,
            label: categoryLabel(category, labels),
            accent: CATEGORY_ACCENTS[category] || '#1E3BFA',
            permissions: categoryPermissions,
        })),
    ];

    return (
        <div className="flex h-full min-h-0 flex-col bg-white dark:bg-slate-950 [&_[data-slot=checkbox][data-state=checked]]:border-[#1E3BFA] [&_[data-slot=checkbox][data-state=checked]]:bg-[#1E3BFA] [&_[data-slot=input]]:h-8 [&_[data-slot=input]]:rounded-[6px] [&_[data-slot=input]]:border-[#E6E7EB] [&_[data-slot=input]]:text-[12px] [&_[data-slot=input]]:shadow-none [&_[data-slot=input]]:focus-visible:border-[#1E3BFA] [&_[data-slot=input]]:focus-visible:ring-0 [&_[data-slot=label]]:text-[11px] [&_[data-slot=label]]:font-normal [&_[data-slot=label]]:text-[#86888F] [&_[data-slot=select-trigger]]:h-8 [&_[data-slot=select-trigger]]:rounded-[6px] [&_[data-slot=select-trigger]]:border-[#E6E7EB] [&_[data-slot=select-trigger]]:text-[12px] [&_[data-slot=select-trigger]]:shadow-none [&_[data-slot=select-trigger]]:focus:ring-0">
            <div className="shrink-0 border-b border-[#F2F3F5] px-6 py-3.5 dark:border-slate-800">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h2 className="text-[15px] font-semibold text-[#0E1114] dark:text-white">{title}</h2>
                        <p className="mt-0.5 truncate text-[11px] leading-5 text-[#86888F]">
                            {mode === 'clone' ? labels.systemRoleCloneHint : labels.roleFormBoundaryHint}
                        </p>
                    </div>
                    {role && (
                        <div className="flex shrink-0 items-center gap-2 text-[11px] text-[#B0B2B8]">
                            <span>{role.is_system ? labels.systemRole : labels.customRole}</span>
                            <span>·</span>
                            <span>{labels.assignedUsers} {role.assigned_user_count}</span>
                        </div>
                    )}
                </div>

                {dialogError && (
                    <div role="alert" className="mt-3 rounded-[6px] border border-[rgba(245,63,63,0.24)] bg-[rgba(245,63,63,0.06)] px-3 py-2 text-[12px] leading-5 text-[#F53F3F]">
                        {dialogError}
                    </div>
                )}

                <div className="mt-3 grid grid-cols-[minmax(140px,0.9fr)_minmax(150px,0.9fr)_minmax(260px,1.5fr)] gap-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="rbac-role-name"><span className="text-[#F53F3F]">*</span> {labels.roleName}</Label>
                        <Input
                            id="rbac-role-name"
                            value={form.name}
                            onChange={(event) => {
                                onFieldChange('name');
                                onChange({ ...form, name: event.target.value });
                            }}
                            disabled={saving}
                        />
                        {showErrors && errors.name && <p className="text-[11px] text-[#F53F3F]">{errors.name}</p>}
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="rbac-role-code"><span className="text-[#F53F3F]">*</span> {labels.roleCode}</Label>
                        <Input
                            id="rbac-role-code"
                            value={form.code}
                            onChange={(event) => {
                                onFieldChange('code');
                                onChange({ ...form, code: event.target.value });
                            }}
                            disabled={isEdit || saving}
                            placeholder="nexus.custom.role"
                        />
                        {showErrors && errors.code && <p className="text-[11px] text-[#F53F3F]">{errors.code}</p>}
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="rbac-role-description">{labels.roleDescription}</Label>
                        <Input
                            id="rbac-role-description"
                            value={form.description}
                            onChange={(event) => onChange({ ...form, description: event.target.value })}
                            disabled={saving}
                            placeholder={labels.roleDescriptionPlaceholder}
                        />
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-[minmax(150px,0.7fr)_minmax(260px,1.3fr)_minmax(150px,0.7fr)] gap-3">
                    <div className="space-y-1.5">
                        <Label>{labels.landingPageLabel}</Label>
                        <Select
                            value={form.landingPage || FIRST_MENU_LANDING_VALUE}
                            onValueChange={(value) => onChange({
                                ...form,
                                landingPage: value === FIRST_MENU_LANDING_VALUE
                                    ? ''
                                    : value as 'home' | 'welcome',
                            })}
                            disabled={saving}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value={FIRST_MENU_LANDING_VALUE}>{labels.landingPageFirstMenu}</SelectItem>
                                <SelectItem value="home">{labels.landingPageHome}</SelectItem>
                                <SelectItem value="welcome">{labels.landingPageWelcome}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label title={labels.recruitmentMenuGroupedHint}>{labels.recruitmentMenuGroupedLabel}</Label>
                        <label className={cn(
                            'flex h-8 cursor-pointer items-center gap-2.5 rounded-[6px] border px-3 transition-colors',
                            form.recruitmentMenuGrouped
                                ? 'border-[rgba(30,59,250,0.24)] bg-[rgba(30,59,250,0.04)]'
                                : 'border-[#EBEEF5] bg-white dark:border-slate-800 dark:bg-slate-950',
                        )} title={labels.recruitmentMenuGroupedHint}>
                            <Checkbox
                                className="h-[15px] w-[15px] rounded-[3px]"
                                checked={form.recruitmentMenuGrouped}
                                onCheckedChange={(checked) => onChange({ ...form, recruitmentMenuGrouped: checked === true })}
                                disabled={saving}
                            />
                            <span className="truncate text-[12px] text-[#33353D] dark:text-slate-100">
                                {form.recruitmentMenuGrouped ? labels.recruitmentMenuGroupedShort : labels.recruitmentMenuFlatShort}
                            </span>
                        </label>
                    </div>
                    {isEdit ? (
                        <div className="space-y-1.5">
                            <Label>{labels.status}</Label>
                            <label className={cn(
                                'flex h-8 cursor-pointer items-center gap-2.5 rounded-[6px] border px-3 transition-colors',
                                form.isActive
                                    ? 'border-[rgba(12,201,145,0.24)] bg-[rgba(12,201,145,0.04)]'
                                    : 'border-[rgba(245,63,63,0.2)] bg-[rgba(245,63,63,0.03)]',
                            )}>
                                <Checkbox
                                    className="h-[15px] w-[15px] rounded-[3px]"
                                    checked={form.isActive}
                                    onCheckedChange={(checked) => onChange({ ...form, isActive: checked === true })}
                                    disabled={saving}
                                />
                                <span className="text-[12px] text-[#33353D] dark:text-slate-100">
                                    {form.isActive ? labels.active : labels.inactive}
                                </span>
                            </label>
                        </div>
                    ) : <div />}
                </div>
            </div>

            <div className="flex shrink-0 items-start justify-between gap-4 px-6 pb-2.5 pt-3.5">
                <div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-[13px] font-semibold text-[#0E1114] dark:text-white">{labels.permissionsTitle}</h3>
                        <span className="text-[12px] text-[#86888F]">{labels.selectedLabel} {selectedPermissionCount} / {permissions.length} {labels.permissionCountUnit}</span>
                    </div>
                    {showErrors && errors.permissionKeys && (
                        <p className="mt-1 text-[11px] text-[#F53F3F]">{errors.permissionKeys}</p>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                    <button
                        type="button"
                        className="text-[12px] text-[#0F23D9] transition-colors hover:text-[#1E3BFA]"
                        onClick={() => {
                            onFieldChange('permissionKeys');
                            onChange({ ...form, permissionKeys: permissions.map((permission) => permission.key) });
                        }}
                        disabled={saving}
                    >
                        {labels.selectAll}
                    </button>
                    <button
                        type="button"
                        className="text-[12px] text-[#86888F] transition-colors hover:text-[#33353D]"
                        onClick={() => {
                            onFieldChange('permissionKeys');
                            onChange({ ...form, permissionKeys: [] });
                        }}
                        disabled={saving}
                    >
                        {labels.deselectAll}
                    </button>
                </div>
            </div>

            <div className="flex min-h-0 flex-1 overflow-hidden">
                <nav aria-label={labels.permissionGroupNavigation} className="w-[190px] shrink-0 overflow-y-auto border-r border-[#F2F3F5] px-2.5 pb-5 pt-0.5 dark:border-slate-800">
                    <p className="px-2 pb-1.5 pt-0.5 text-[11px] text-[#B0B2B8]">{labels.permissionGroupNavigation}</p>
                    <div className="space-y-0.5">
                        {permissionRailItems.map((item) => {
                            const active = activeCategory === item.key;
                            const selectedCount = item.permissions.filter((permission) => form.permissionKeys.includes(permission.key)).length;
                            return (
                                <button
                                    key={item.key}
                                    type="button"
                                    className={cn(
                                        'flex h-[34px] w-full items-center gap-2 rounded-[6px] px-2.5 text-left transition-colors hover:bg-[#F6F7F9] dark:hover:bg-slate-900',
                                        active && 'bg-[rgba(30,59,250,0.06)] hover:bg-[rgba(30,59,250,0.06)] dark:bg-blue-950/20 dark:hover:bg-blue-950/20',
                                    )}
                                    onClick={() => setActiveCategory(item.key)}
                                    aria-pressed={active}
                                >
                                    <span
                                        className="h-[13px] w-[3px] shrink-0 rounded-[2px]"
                                        style={{ backgroundColor: item.accent, opacity: item.key === 'all' ? 0 : 1 }}
                                    />
                                    <span className={cn(
                                        'min-w-0 flex-1 truncate text-[12px]',
                                        active
                                            ? 'font-semibold text-[#1E3BFA]'
                                            : selectedCount > 0
                                                ? 'font-medium text-[#0E1114] dark:text-slate-100'
                                                : 'font-normal text-[#5E5F66]',
                                    )}>
                                        {item.label}
                                    </span>
                                    <span className={cn(
                                        'shrink-0 text-[11px] tabular-nums',
                                        active || selectedCount > 0 ? 'text-[#1E3BFA]' : 'text-[#B0B2B8]',
                                    )}>
                                        {selectedCount}/{item.permissions.length}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </nav>

                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 pb-5 pt-1">
                    <div className="space-y-4">
                        {visiblePermissionGroups.map(([category, categoryPermissions]) => {
                            const selectedCount = categoryPermissions.filter((permission) => form.permissionKeys.includes(permission.key)).length;
                            const allSelected = categoryPermissions.length > 0 && selectedCount === categoryPermissions.length;
                            return (
                                <section key={category} className="space-y-2.5">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <span className="h-3 w-[3px] rounded-[2px]" style={{ backgroundColor: CATEGORY_ACCENTS[category] || '#1E3BFA' }} />
                                            <h4 className="text-[12px] font-semibold text-[#0E1114] dark:text-slate-100">{categoryLabel(category, labels)}</h4>
                                            <span className={cn('text-[11px]', selectedCount > 0 ? 'text-[#1E3BFA]' : 'text-[#B0B2B8]')}>{selectedCount}/{categoryPermissions.length}</span>
                                        </div>
                                        <button
                                            type="button"
                                            className={cn(
                                                'text-[11px] transition-colors',
                                                allSelected ? 'text-[#86888F] hover:text-[#33353D]' : 'text-[#0F23D9] hover:text-[#1E3BFA]',
                                            )}
                                            onClick={() => toggleCategory(categoryPermissions, !allSelected)}
                                            disabled={saving}
                                        >
                                            {allSelected ? labels.deselectPermissionGroup : labels.selectPermissionGroup}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                        {categoryPermissions.map((permission) => {
                                            const checked = form.permissionKeys.includes(permission.key);
                                            return (
                                                <label
                                                    key={permission.key}
                                                    className={cn(
                                                        'flex cursor-pointer items-start gap-2.5 rounded-[6px] border px-3 py-2 transition-colors',
                                                        checked
                                                            ? 'border-[#1E3BFA] bg-[rgba(30,59,250,0.03)]'
                                                            : 'border-[#EBEEF5] bg-white hover:border-[rgba(30,59,250,0.32)] dark:border-slate-800 dark:bg-slate-950',
                                                    )}
                                                >
                                                    <Checkbox
                                                        className="mt-0.5 h-[15px] w-[15px] rounded-[3px]"
                                                        checked={checked}
                                                        onCheckedChange={(next) => {
                                                            onFieldChange('permissionKeys');
                                                            onChange({
                                                                ...form,
                                                                permissionKeys: toggleItem(form.permissionKeys, permission.key, next === true),
                                                            });
                                                        }}
                                                        disabled={saving}
                                                    />
                                                    <span className="min-w-0">
                                                        <span className="block text-[12px] text-[#0E1114] dark:text-slate-100">{permission.name}</span>
                                                        <span className="mt-0.5 block text-[11px] leading-[1.5] text-[#B0B2B8]">{permission.description}</span>
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="flex h-[60px] shrink-0 items-center gap-3 border-t border-[#F2F3F5] px-6 dark:border-slate-800">
                <span className="text-[12px] text-[#86888F]">{labels.selectedLabel} {selectedPermissionCount} {labels.permissionCountUnit}</span>
                <div className="flex-1" />
                <Button variant="outline" className="h-[34px] rounded-[6px] border-[#E6E7EB] bg-white px-[18px] text-[13px] font-normal text-[#33353D] shadow-none" onClick={onCancel} disabled={saving}>
                    {labels.cancelLabel}
                </Button>
                <Button className="h-[34px] rounded-[6px] bg-[#1E3BFA] px-[18px] text-[13px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={onSubmit} disabled={saving}>
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {submitLabel}
                </Button>
            </div>
        </div>
    );
}
