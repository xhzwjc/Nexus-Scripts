'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ScriptHubPermissionDefinition, ScriptHubRoleDefinition } from '@/lib/types';
import type { RoleFormErrors, RoleFormState } from './types';
import type { AccessControlLabels } from './utils';
import { categoryLabel, groupPermissionsByCategory, toggleItem } from './utils';

interface RoleFormProps {
    open: boolean;
    mode: 'create' | 'edit';
    role?: ScriptHubRoleDefinition | null;
    form: RoleFormState;
    permissions: ScriptHubPermissionDefinition[];
    labels: AccessControlLabels;
    showErrors: boolean;
    errors: RoleFormErrors;
    dialogError?: string | null;
    saving: boolean;
    readOnly?: boolean;
    onChange: (form: RoleFormState) => void;
    onFieldChange: (field: keyof RoleFormErrors) => void;
    onCancel: () => void;
    onSubmit: () => void;
}

export function RoleForm({
    open,
    mode,
    role,
    form,
    permissions,
    labels,
    showErrors,
    errors,
    dialogError,
    saving,
    readOnly = false,
    onChange,
    onFieldChange,
    onCancel,
    onSubmit,
}: RoleFormProps) {
    const permissionGroups = useMemo(() => groupPermissionsByCategory(permissions), [permissions]);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const readOnlyMode = readOnly || !!role?.is_system;

    useEffect(() => {
        if (open) {
            setExpandedCategories(new Set(Object.keys(permissionGroups)));
        }
    }, [open, permissionGroups]);

    const toggleCategoryExpand = (category: string) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(category)) {
                next.delete(category);
            } else {
                next.add(category);
            }
            return next;
        });
    };

    const toggleCategory = (categoryPermissions: ScriptHubPermissionDefinition[], selectAll: boolean) => {
        const categoryKeys = categoryPermissions.map((p) => p.key);
        if (selectAll) {
            const merged = new Set([...form.permissionKeys, ...categoryKeys]);
            onChange({ ...form, permissionKeys: [...merged] });
        } else {
            onChange({ ...form, permissionKeys: form.permissionKeys.filter((k) => !categoryKeys.includes(k)) });
        }
        onFieldChange('permissionKeys');
    };

    const categorySelectedCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const [category, categoryPermissions] of Object.entries(permissionGroups)) {
            counts[category] = categoryPermissions.filter((p) => form.permissionKeys.includes(p.key)).length;
        }
        return counts;
    }, [permissionGroups, form.permissionKeys]);

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
            <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[900px] dark:bg-slate-950 [&_[data-slot=checkbox][data-state=checked]]:border-[#1E3BFA] [&_[data-slot=checkbox][data-state=checked]]:bg-[#1E3BFA] [&_[data-slot=input]]:h-9 [&_[data-slot=input]]:rounded-[4px] [&_[data-slot=input]]:border-[#E6E7EB] [&_[data-slot=input]]:text-[12px] [&_[data-slot=input]]:shadow-none [&_[data-slot=input]]:focus-visible:border-[#1E3BFA] [&_[data-slot=input]]:focus-visible:ring-0 [&_[data-slot=label]]:text-[12px] [&_[data-slot=label]]:font-normal [&_[data-slot=select-trigger]]:h-9 [&_[data-slot=select-trigger]]:rounded-[4px] [&_[data-slot=select-trigger]]:border-[#E6E7EB] [&_[data-slot=select-trigger]]:text-[12px] [&_[data-slot=select-trigger]]:shadow-none [&_[data-slot=select-trigger]]:focus:ring-0 [&_[data-slot=textarea]]:rounded-[4px] [&_[data-slot=textarea]]:border-[#E6E7EB] [&_[data-slot=textarea]]:text-[12px] [&_[data-slot=textarea]]:shadow-none [&_[data-slot=textarea]]:focus-visible:border-[#1E3BFA] [&_[data-slot=textarea]]:focus-visible:ring-0">
                <DialogHeader className="shrink-0 gap-1 border-b border-[#F2F3F5] px-6 pb-4 pr-14 pt-5 text-left dark:border-slate-800">
                    <DialogTitle className="text-[16px] leading-6 text-[#0E1114] dark:text-white">{readOnlyMode ? labels.viewPermissions : mode === 'create' ? labels.createRole : labels.editRole}</DialogTitle>
                    <DialogDescription className="text-[12px] leading-5 text-[#86888F]">{labels.roleFormBoundaryHint}</DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                    <div className="space-y-6 pb-1">
                        {dialogError && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {dialogError}
                            </div>
                        )}

                        <section>
                            <div className="mb-4">
                                <div className="flex items-center gap-2">
                                    <span className="h-3 w-[3px] rounded-full bg-[#1E3BFA]" />
                                    <h3 className="text-[13px] font-semibold text-[#0E1114] dark:text-white">{labels.roleFormBasicInfo}</h3>
                                </div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="rbac-role-code">{labels.roleCode}</Label>
                                    <Input
                                        id="rbac-role-code"
                                        value={form.code}
                                        onChange={(event) => {
                                            onFieldChange('code');
                                            onChange({ ...form, code: event.target.value });
                                        }}
                                        disabled={mode === 'edit' || saving || readOnlyMode}
                                    />
                                    {showErrors && errors.code && (
                                        <p className="text-xs text-destructive">{errors.code}</p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="rbac-role-name">{labels.roleName}</Label>
                                    <Input
                                        id="rbac-role-name"
                                        value={form.name}
                                        onChange={(event) => {
                                            onFieldChange('name');
                                            onChange({ ...form, name: event.target.value });
                                        }}
                                        disabled={saving || readOnlyMode}
                                    />
                                    {showErrors && errors.name && (
                                        <p className="text-xs text-destructive">{errors.name}</p>
                                    )}
                                </div>
                            </div>

                            <div className="mt-4 space-y-2">
                                <Label htmlFor="rbac-role-description">{labels.roleDescription}</Label>
                                <Textarea
                                    id="rbac-role-description"
                                    value={form.description}
                                    onChange={(event) => onChange({ ...form, description: event.target.value })}
                                    rows={3}
                                    disabled={saving || readOnlyMode}
                                />
                            </div>

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>{labels.landingPageLabel}</Label>
                                    <Select
                                        value={form.landingPage}
                                        onValueChange={(value) => onChange({ ...form, landingPage: value as 'home' | 'welcome' })}
                                        disabled={saving || readOnlyMode}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="home">{labels.landingPageHome}</SelectItem>
                                            <SelectItem value="welcome">{labels.landingPageWelcome}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">{labels.landingPageHint}</p>
                                </div>
                                <label className="flex items-start gap-3 rounded-md border bg-background p-3">
                                    <Checkbox
                                        className="mt-0.5"
                                        checked={form.recruitmentMenuGrouped}
                                        onCheckedChange={(checked) => onChange({ ...form, recruitmentMenuGrouped: checked === true })}
                                        disabled={saving || readOnlyMode}
                                    />
                                    <span className="space-y-1">
                                        <span className="block text-sm font-medium">{labels.recruitmentMenuGroupedLabel}</span>
                                        <span className="block text-xs text-muted-foreground">{labels.recruitmentMenuGroupedHint}</span>
                                    </span>
                                </label>
                            </div>

                            {role && (
                                <div className="mt-4 grid gap-4 md:grid-cols-3">
                                    <div className="rounded-md border bg-background p-3">
                                        <p className="text-xs text-muted-foreground">{labels.roleType}</p>
                                        <p className="mt-1 text-sm font-medium">
                                            {role.is_system ? labels.systemRole : labels.customRole}
                                        </p>
                                    </div>
                                    <div className="rounded-md border bg-background p-3">
                                        <p className="text-xs text-muted-foreground">{labels.assignedUsers}</p>
                                        <p className="mt-1 text-sm font-medium">{role.assigned_user_count}</p>
                                    </div>
                                    {!role.is_system && (
                                        <label className="flex items-center gap-3 rounded-md border bg-background p-3">
                                            <Checkbox
                                                checked={form.isActive}
                                                onCheckedChange={(checked) => onChange({ ...form, isActive: checked === true })}
                                                disabled={saving || readOnlyMode}
                                            />
                                            <span className="text-sm font-medium">
                                                {form.isActive ? labels.active : labels.disableRole}
                                            </span>
                                        </label>
                                    )}
                                </div>
                            )}
                        </section>

                        <section className="border-t border-[#F2F3F5] pt-5 dark:border-slate-800">
                            <div className="mb-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="h-3 w-[3px] rounded-full bg-[#0CC991]" />
                                            <h3 className="text-[13px] font-semibold text-[#0E1114] dark:text-white">{labels.permissionsTitle}</h3>
                                        </div>
                                        <p className="mt-1 text-[11px] text-[#86888F]">{labels.rolePermissionOnlyHint}</p>
                                    </div>
                                    <Badge variant="outline">{form.permissionKeys.length}</Badge>
                                </div>
                                {showErrors && errors.permissionKeys && (
                                    <p className="mt-2 text-[11px] text-[#F53F3F]">{errors.permissionKeys}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <div className="space-y-2">
                                    {Object.entries(permissionGroups).map(([category, categoryPermissions]) => {
                                        const isExpanded = expandedCategories.has(category);
                                        const selectedCount = categorySelectedCounts[category] ?? 0;
                                        return (
                                            <div key={category} className="rounded-[6px] border border-[#EBEEF5] bg-white dark:border-slate-800 dark:bg-slate-950">
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[#F8F8F9] dark:hover:bg-slate-900"
                                                    onClick={() => toggleCategoryExpand(category)}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", !isExpanded && "-rotate-90")} />
                                                        <span className="text-[12px] font-medium">{categoryLabel(category, labels)}</span>
                                                    </div>
                                                    <Badge variant="outline" className={`h-[20px] rounded-[4px] border-transparent px-1.5 text-[10px] font-normal shadow-none ${selectedCount > 0 ? 'bg-[rgba(30,59,250,0.08)] text-[#0F23D9]' : 'bg-[#F2F3F5] text-[#86888F]'}`}>
                                                        {selectedCount}/{categoryPermissions.length}
                                                    </Badge>
                                                </button>
                                                {isExpanded && (
                                                    <div className="border-t px-4 py-3">
                                                        <div className="mb-3 flex items-center justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                className="text-[11px] text-[#0F23D9] transition-colors hover:text-[#1E3BFA] disabled:text-[#B0B2B8]"
                                                                onClick={() => toggleCategory(categoryPermissions, true)}
                                                                disabled={saving || readOnlyMode}
                                                            >
                                                                {labels.selectAll}
                                                            </button>
                                                            <span className="text-xs text-muted-foreground/40">|</span>
                                                            <button
                                                                type="button"
                                                                className="text-[11px] text-[#86888F] transition-colors hover:text-[#33353D] disabled:text-[#B0B2B8]"
                                                                onClick={() => toggleCategory(categoryPermissions, false)}
                                                                disabled={saving || readOnlyMode}
                                                            >
                                                                {labels.deselectAll}
                                                            </button>
                                                        </div>
                                                        <div className="grid gap-3 md:grid-cols-2">
                                                            {categoryPermissions.map((permission) => (
                                                                <label key={permission.key} className="flex items-start gap-3 rounded-[6px] border border-[#F2F3F5] px-3 py-2.5 transition-colors hover:bg-[#F8F8F9] dark:border-slate-800 dark:hover:bg-slate-900">
                                                                    <Checkbox
                                                                        checked={form.permissionKeys.includes(permission.key)}
                                                                        onCheckedChange={(checked) => {
                                                                            onFieldChange('permissionKeys');
                                                                            onChange({
                                                                                ...form,
                                                                                permissionKeys: toggleItem(form.permissionKeys, permission.key, checked === true),
                                                                            });
                                                                        }}
                                                                        disabled={saving || readOnlyMode}
                                                                    />
                                                                    <span>
                                                                        <span className="block text-[12px] font-medium text-[#0E1114] dark:text-white">{permission.name}</span>
                                                                        <span className="mt-0.5 block text-[11px] leading-5 text-[#86888F]">{permission.description}</span>
                                                                    </span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

                <DialogFooter className="shrink-0 border-t border-[#F2F3F5] bg-[#FAFAFB] px-6 py-4 dark:border-slate-800 dark:bg-slate-900/40">
                    <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-4 text-[12px] font-normal text-[#33353D] shadow-none" onClick={onCancel} disabled={saving}>
                        {readOnlyMode ? labels.close : labels.cancelLabel}
                    </Button>
                    {!readOnlyMode && (
                        <Button className="h-8 rounded-[6px] bg-[#1E3BFA] px-4 text-[12px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={onSubmit} disabled={saving}>
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {mode === 'create' ? labels.createRole : labels.saveChanges}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
