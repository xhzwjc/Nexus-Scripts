'use client';

import { useMemo, useState } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
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
    onChange,
    onFieldChange,
    onCancel,
    onSubmit,
}: RoleFormProps) {
    const permissionGroups = groupPermissionsByCategory(permissions);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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
            <DialogContent className="sm:max-w-5xl">
                <DialogHeader>
                    <DialogTitle>{mode === 'create' ? labels.createRole : labels.editRole}</DialogTitle>
                    <DialogDescription>{labels.roleFormDescription}</DialogDescription>
                </DialogHeader>

                <div className="max-h-[70vh] overflow-y-auto pr-2">
                    <div className="space-y-6 pb-1">
                        {dialogError && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {dialogError}
                            </div>
                        )}

                        <section className="rounded-lg border bg-muted/10 p-4">
                            <div className="mb-4">
                                <h3 className="text-sm font-semibold">{labels.roleFormBasicInfo}</h3>
                                <p className="text-xs text-muted-foreground">{labels.roleFormBoundaryHint}</p>
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
                                        disabled={mode === 'edit' || saving}
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
                                        disabled={saving}
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
                                    disabled={saving}
                                />
                            </div>

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>{labels.landingPageLabel}</Label>
                                    <Select
                                        value={form.landingPage}
                                        onValueChange={(value) => onChange({ ...form, landingPage: value as 'home' | 'welcome' })}
                                        disabled={saving}
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
                                                disabled={saving}
                                            />
                                            <span className="text-sm font-medium">
                                                {form.isActive ? labels.active : labels.disableRole}
                                            </span>
                                        </label>
                                    )}
                                </div>
                            )}
                        </section>

                        <section className="rounded-lg border bg-muted/10 p-4">
                            <div className="mb-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-semibold">{labels.permissionsTitle}</h3>
                                        <p className="text-xs text-muted-foreground">{labels.rolePermissionOnlyHint}</p>
                                    </div>
                                    <Badge variant="outline">{form.permissionKeys.length}</Badge>
                                </div>
                                {showErrors && errors.permissionKeys && (
                                    <p className="mt-2 text-xs text-destructive">{errors.permissionKeys}</p>
                                )}
                            </div>

                            <ScrollArea className="h-[420px] pr-3">
                                <div className="space-y-2">
                                    {Object.entries(permissionGroups).map(([category, categoryPermissions]) => {
                                        const isExpanded = expandedCategories.has(category);
                                        const selectedCount = categorySelectedCounts[category] ?? 0;
                                        return (
                                            <div key={category} className="rounded-lg border bg-background">
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/30"
                                                    onClick={() => toggleCategoryExpand(category)}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", !isExpanded && "-rotate-90")} />
                                                        <span className="text-sm font-medium">{categoryLabel(category, labels)}</span>
                                                    </div>
                                                    <Badge variant={selectedCount > 0 ? "default" : "outline"} className="text-xs">
                                                        {selectedCount}/{categoryPermissions.length}
                                                    </Badge>
                                                </button>
                                                {isExpanded && (
                                                    <div className="border-t px-4 py-3">
                                                        <div className="mb-3 flex items-center justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                                onClick={() => toggleCategory(categoryPermissions, true)}
                                                                disabled={saving}
                                                            >
                                                                {labels.selectAll}
                                                            </button>
                                                            <span className="text-xs text-muted-foreground/40">|</span>
                                                            <button
                                                                type="button"
                                                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                                onClick={() => toggleCategory(categoryPermissions, false)}
                                                                disabled={saving}
                                                            >
                                                                {labels.deselectAll}
                                                            </button>
                                                        </div>
                                                        <div className="grid gap-3 md:grid-cols-2">
                                                            {categoryPermissions.map((permission) => (
                                                                <label key={permission.key} className="flex items-start gap-3">
                                                                    <Checkbox
                                                                        checked={form.permissionKeys.includes(permission.key)}
                                                                        onCheckedChange={(checked) => {
                                                                            onFieldChange('permissionKeys');
                                                                            onChange({
                                                                                ...form,
                                                                                permissionKeys: toggleItem(form.permissionKeys, permission.key, checked === true),
                                                                            });
                                                                        }}
                                                                        disabled={saving}
                                                                    />
                                                                    <span>
                                                                        <span className="block text-sm font-medium">{permission.name}</span>
                                                                        <span className="block text-xs text-muted-foreground">{permission.description}</span>
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
                            </ScrollArea>
                        </section>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onCancel} disabled={saving}>
                        {labels.cancelLabel}
                    </Button>
                    <Button onClick={onSubmit} disabled={saving || !!role?.is_system}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {mode === 'create' ? labels.createRole : labels.saveChanges}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
