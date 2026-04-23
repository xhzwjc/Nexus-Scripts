'use client';

import { useMemo, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { authenticatedFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { ScriptHubOrganizationDefinition, ScriptHubRbacOverview } from '@/lib/types';
import { StatusBadge } from './AccessControlBadges';
import { createOrganizationMap, OrganizationTreeText } from './organizationTree';
import type { AccessControlLabels } from './utils';

interface AccessControlOrganizationsPageProps {
    overview: ScriptHubRbacOverview | null;
    loading: boolean;
    error: string | null;
    onReload: () => Promise<void>;
}

interface OrganizationFormState {
    orgCode: string;
    name: string;
    orgType: string;
    parentOrgCode: string;
    sortOrder: string;
    isActive: boolean;
}

interface OrganizationMutationResponse {
    organization: ScriptHubOrganizationDefinition;
    error?: string;
}

interface DeleteMutationResponse {
    message?: string;
    target_code?: string;
    error?: string;
}

interface OrganizationTreeRow {
    organization: ScriptHubOrganizationDefinition;
    level: number;
    childCount: number;
}

const EMPTY_ORGANIZATIONS: ScriptHubOrganizationDefinition[] = [];
const ORG_TYPES = ['group', 'sub_group', 'company', 'department'];
const ROOT_PARENT_VALUE = '__root__';

function createEmptyOrganizationForm(): OrganizationFormState {
    return {
        orgCode: '',
        name: '',
        orgType: 'company',
        parentOrgCode: 'group',
        sortOrder: '99',
        isActive: true,
    };
}

function mapOrganizationToForm(organization: ScriptHubOrganizationDefinition): OrganizationFormState {
    return {
        orgCode: organization.org_code,
        name: organization.name,
        orgType: organization.org_type || 'company',
        parentOrgCode: organization.parent_org_code || ROOT_PARENT_VALUE,
        sortOrder: String(organization.sort_order ?? 99),
        isActive: organization.is_active,
    };
}

function normalizeForm(form: OrganizationFormState): OrganizationFormState {
    return {
        ...form,
        orgCode: form.orgCode.trim().toLowerCase(),
        name: form.name.trim(),
        orgType: form.orgType.trim() || 'company',
        parentOrgCode: form.parentOrgCode === ROOT_PARENT_VALUE ? '' : form.parentOrgCode.trim(),
        sortOrder: form.sortOrder.trim() || '99',
    };
}

function orgTypeLabel(value: string, labels: AccessControlLabels) {
    switch (value) {
        case 'group':
            return labels.orgTypeGroup;
        case 'sub_group':
            return labels.orgTypeSubGroup;
        case 'company':
            return labels.orgTypeCompany;
        case 'department':
            return labels.orgTypeDepartment;
        default:
            return value;
    }
}

function isDescendant(parentPath: string, childPath: string) {
    return childPath.startsWith(`${parentPath}/`);
}

function sortOrganizations(organizations: ScriptHubOrganizationDefinition[]) {
    return [...organizations].sort((a, b) => (
        (a.sort_order ?? 99) - (b.sort_order ?? 99) ||
        a.name.localeCompare(b.name) ||
        a.org_code.localeCompare(b.org_code)
    ));
}

function buildOrganizationTreeRows(
    organizations: ScriptHubOrganizationDefinition[],
    query: string,
    collapsedOrgCodes: Set<string>,
): OrganizationTreeRow[] {
    const byCode = new Map(organizations.map((organization) => [organization.org_code, organization]));
    const childrenByParent = new Map<string, ScriptHubOrganizationDefinition[]>();
    const roots: ScriptHubOrganizationDefinition[] = [];
    const normalizedQuery = query.trim().toLowerCase();
    const visibleCodes = new Set<string>();

    organizations.forEach((organization) => {
        const parentCode = organization.parent_org_code || '';
        const parentExists = parentCode ? byCode.has(parentCode) : false;
        if (!parentCode || !parentExists) {
            roots.push(organization);
            return;
        }

        const siblings = childrenByParent.get(parentCode) || [];
        siblings.push(organization);
        childrenByParent.set(parentCode, siblings);
    });

    if (normalizedQuery) {
        organizations.forEach((organization) => {
            const searchable = [
                organization.org_code,
                organization.name,
                organization.org_type,
                organization.parent_org_code || '',
                organization.path,
            ].join(' ').toLowerCase();

            if (!searchable.includes(normalizedQuery)) {
                return;
            }

            let current: ScriptHubOrganizationDefinition | undefined = organization;
            while (current) {
                visibleCodes.add(current.org_code);
                current = current.parent_org_code ? byCode.get(current.parent_org_code) : undefined;
            }
        });
    }

    const rows: OrganizationTreeRow[] = [];
    const walk = (organization: ScriptHubOrganizationDefinition, level: number) => {
        if (normalizedQuery && !visibleCodes.has(organization.org_code)) {
            return;
        }

        const children = sortOrganizations(childrenByParent.get(organization.org_code) || []);
        rows.push({
            organization,
            level,
            childCount: children.length,
        });

        if (!normalizedQuery && collapsedOrgCodes.has(organization.org_code)) {
            return;
        }

        children.forEach((child) => walk(child, level + 1));
    };

    sortOrganizations(roots).forEach((root) => walk(root, 0));
    return rows;
}

export function AccessControlOrganizationsPage({
    overview,
    loading,
    error,
    onReload,
}: AccessControlOrganizationsPageProps) {
    const { t } = useI18n();
    const labels = t.accessControl;
    const [query, setQuery] = useState('');
    const [saving, setSaving] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [editOrganization, setEditOrganization] = useState<ScriptHubOrganizationDefinition | null>(null);
    const [deleteOrganization, setDeleteOrganization] = useState<ScriptHubOrganizationDefinition | null>(null);
    const [form, setForm] = useState(createEmptyOrganizationForm());
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [deleteDialogError, setDeleteDialogError] = useState<string | null>(null);
    const [collapsedOrgCodes, setCollapsedOrgCodes] = useState<Set<string>>(() => new Set());

    const organizations = overview?.catalog.organizations ?? EMPTY_ORGANIZATIONS;
    const activeOrganizations = useMemo(() => organizations.filter((organization) => organization.is_active), [organizations]);
    const organizationMap = useMemo(() => createOrganizationMap(organizations), [organizations]);
    const treeRows = useMemo(
        () => buildOrganizationTreeRows(organizations, query, collapsedOrgCodes),
        [collapsedOrgCodes, organizations, query],
    );
    const allTreeRows = useMemo(() => buildOrganizationTreeRows(organizations, '', new Set()), [organizations]);
    const parentOrgCodes = useMemo(() => {
        const codes = new Set<string>();
        organizations.forEach((organization) => {
            if (organization.parent_org_code) {
                codes.add(organization.parent_org_code);
            }
        });
        return [...codes].filter((code) => organizations.some((organization) => organization.org_code === code));
    }, [organizations]);

    const parentOptions = useMemo(() => {
        if (!editOrganization) {
            return activeOrganizations;
        }
        return activeOrganizations.filter((organization) => (
            organization.org_code !== editOrganization.org_code &&
            !isDescendant(editOrganization.path, organization.path)
        ));
    }, [activeOrganizations, editOrganization]);
    const parentOptionRows = useMemo(() => {
        const availableParentCodes = new Set(parentOptions.map((organization) => organization.org_code));
        return allTreeRows.filter((row) => availableParentCodes.has(row.organization.org_code));
    }, [allTreeRows, parentOptions]);
    const selectedParentOrganization = form.parentOrgCode === ROOT_PARENT_VALUE
        ? null
        : organizationMap.get(form.parentOrgCode);

    const closeDialogs = () => {
        setCreateOpen(false);
        setEditOrganization(null);
        setDeleteOrganization(null);
        setForm(createEmptyOrganizationForm());
        setDialogError(null);
        setDeleteDialogError(null);
    };

    const openCreateDialog = () => {
        setForm(createEmptyOrganizationForm());
        setDialogError(null);
        setCreateOpen(true);
    };

    const openEditDialog = (organization: ScriptHubOrganizationDefinition) => {
        setForm(mapOrganizationToForm(organization));
        setDialogError(null);
        setEditOrganization(organization);
    };

    const toggleCollapsed = (orgCode: string) => {
        setCollapsedOrgCodes((current) => {
            const next = new Set(current);
            if (next.has(orgCode)) {
                next.delete(orgCode);
            } else {
                next.add(orgCode);
            }
            return next;
        });
    };

    const expandAll = () => setCollapsedOrgCodes(new Set());

    const collapseAll = () => setCollapsedOrgCodes(new Set(parentOrgCodes));

    const validateForm = (normalized: OrganizationFormState) => {
        if (!normalized.orgCode || !/^[a-z0-9][a-z0-9._-]{1,99}$/.test(normalized.orgCode)) {
            return labels.validationOrgCodePattern;
        }
        if (!normalized.name) {
            return labels.validationOrgNameRequired;
        }
        if (!ORG_TYPES.includes(normalized.orgType)) {
            return labels.validationOrgTypeInvalid;
        }
        return null;
    };

    const upsertOrganization = async (mode: 'create' | 'edit') => {
        const normalized = normalizeForm(form);
        const validationError = validateForm(normalized);
        if (validationError) {
            setDialogError(validationError);
            return;
        }

        setSaving(true);
        setDialogError(null);
        try {
            const url = mode === 'create'
                ? '/api/admin/rbac/organizations'
                : `/api/admin/rbac/organizations/${encodeURIComponent(normalized.orgCode)}`;
            const response = await authenticatedFetch(url, {
                method: mode === 'create' ? 'POST' : 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    org_code: normalized.orgCode,
                    name: normalized.name,
                    org_type: normalized.orgType,
                    parent_org_code: normalized.parentOrgCode || null,
                    sort_order: Number(normalized.sortOrder || 99),
                    is_active: normalized.isActive,
                }),
            });
            const payload = await response.json().catch(() => ({ error: labels.organizationSaveFailed })) as OrganizationMutationResponse;
            if (!response.ok || payload.error) {
                throw new Error(payload.error || labels.organizationSaveFailed);
            }

            toast.success(mode === 'create' ? labels.organizationCreated : labels.organizationUpdated);
            closeDialogs();
            await onReload();
        } catch (saveError) {
            setDialogError(saveError instanceof Error ? saveError.message : labels.organizationSaveFailed);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteOrganization = async () => {
        if (!deleteOrganization) {
            return;
        }

        setSaving(true);
        setDeleteDialogError(null);
        try {
            const response = await authenticatedFetch(`/api/admin/rbac/organizations/${encodeURIComponent(deleteOrganization.org_code)}`, {
                method: 'DELETE',
            });
            const payload = await response.json().catch(() => ({ error: labels.organizationDeleteFailed })) as DeleteMutationResponse;
            if (!response.ok || payload.error) {
                throw new Error(payload.error || labels.organizationDeleteFailed);
            }

            toast.success(labels.organizationDeleted);
            closeDialogs();
            await onReload();
        } catch (deleteError) {
            setDeleteDialogError(deleteError instanceof Error ? deleteError.message : labels.organizationDeleteFailed);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rounded-lg border bg-card">
            <div className="border-b px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">{labels.organizationsPageTitle}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{labels.organizationsPageDesc}</p>
                    </div>
                    <Button onClick={openCreateDialog}>
                        <Plus className="h-4 w-4" />
                        {labels.createOrganization}
                    </Button>
                </div>
            </div>

            <div className="border-b bg-muted/20 px-5 py-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="relative max-w-md flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            className="pl-9"
                            placeholder={labels.organizationsSearchPlaceholder}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <p className="text-xs text-muted-foreground">{labels.organizationHierarchyHint}</p>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={expandAll} disabled={parentOrgCodes.length === 0}>
                                {labels.expandAll}
                            </Button>
                            <Button variant="outline" size="sm" onClick={collapseAll} disabled={parentOrgCodes.length === 0}>
                                {labels.collapseAll}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-5">
                {loading ? (
                    <div className="flex min-h-[360px] items-center justify-center text-muted-foreground">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        {t.common.loading}
                    </div>
                ) : error ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
                        <p className="max-w-md text-sm text-destructive">{error}</p>
                        <Button variant="outline" onClick={() => void onReload()}>{labels.refresh}</Button>
                    </div>
                ) : treeRows.length === 0 ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                        <Building2 className="h-8 w-8" />
                        <p>{labels.noOrganizations}</p>
                        <Button variant="outline" onClick={openCreateDialog}>
                            <Plus className="h-4 w-4" />
                            {labels.createOrganization}
                        </Button>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead>{labels.organizationName}</TableHead>
                                    <TableHead>{labels.organizationCode}</TableHead>
                                    <TableHead>{labels.organizationType}</TableHead>
                                    <TableHead>{labels.parentOrganization}</TableHead>
                                    <TableHead>{labels.organizationPath}</TableHead>
                                    <TableHead>{labels.sortOrder}</TableHead>
                                    <TableHead>{labels.status}</TableHead>
                                    <TableHead className="text-right">{labels.actions}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {treeRows.map(({ organization, level, childCount }) => (
                                    <TableRow key={organization.org_code}>
                                        <TableCell>
                                            <div className="flex items-center gap-2" style={{ paddingLeft: `${level * 24}px` }}>
                                                {childCount > 0 ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 shrink-0"
                                                        onClick={() => toggleCollapsed(organization.org_code)}
                                                        aria-label={collapsedOrgCodes.has(organization.org_code) ? labels.expandAll : labels.collapseAll}
                                                    >
                                                        {collapsedOrgCodes.has(organization.org_code) ? (
                                                            <ChevronRight className="h-4 w-4" />
                                                        ) : (
                                                            <ChevronDown className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                ) : (
                                                    <span className="h-7 w-7 shrink-0" />
                                                )}
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-medium">{organization.name}</span>
                                                        {childCount > 0 && (
                                                            <Badge variant="secondary" className="text-[11px]">
                                                                {labels.organizationChildrenCount.replace('{count}', String(childCount))}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="mt-1 font-mono text-xs text-muted-foreground">{organization.path}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">{organization.org_code}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{orgTypeLabel(organization.org_type, labels)}</Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">{organization.parent_org_code || '-'}</TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">{organization.path}</TableCell>
                                        <TableCell>{organization.sort_order}</TableCell>
                                        <TableCell>
                                            <StatusBadge active={organization.is_active} labels={labels} />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="outline" size="sm" onClick={() => openEditDialog(organization)}>
                                                    <Pencil className="h-4 w-4" />
                                                    {labels.editOrganization}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:text-destructive"
                                                    disabled={organization.org_code === 'group' || !organization.is_active}
                                                    onClick={() => {
                                                        setDeleteDialogError(null);
                                                        setDeleteOrganization(organization);
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                    {labels.disableOrganization}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>

            <Dialog open={createOpen || !!editOrganization} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{createOpen ? labels.createOrganization : labels.editOrganization}</DialogTitle>
                        <DialogDescription>{labels.organizationFormDesc}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5">
                        {dialogError && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {dialogError}
                            </div>
                        )}
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="org-code">{labels.organizationCode}</Label>
                                <Input
                                    id="org-code"
                                    value={form.orgCode}
                                    onChange={(event) => setForm((current) => ({ ...current, orgCode: event.target.value }))}
                                    disabled={!!editOrganization || saving}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="org-name">{labels.organizationName}</Label>
                                <Input
                                    id="org-name"
                                    value={form.name}
                                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                                    disabled={saving}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{labels.organizationType}</Label>
                                <Select
                                    value={form.orgType}
                                    onValueChange={(value) => setForm((current) => ({ ...current, orgType: value }))}
                                    disabled={saving}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ORG_TYPES.map((type) => (
                                            <SelectItem key={type} value={type}>
                                                {orgTypeLabel(type, labels)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>{labels.parentOrganization}</Label>
                                <Select
                                    value={form.parentOrgCode || ROOT_PARENT_VALUE}
                                    onValueChange={(value) => setForm((current) => ({ ...current, parentOrgCode: value }))}
                                    disabled={saving || (editOrganization?.org_code === 'group')}
                                >
                                    <SelectTrigger className="w-full">
                                        <span className="truncate">
                                            {selectedParentOrganization?.name || labels.noParentOrganization}
                                        </span>
                                    </SelectTrigger>
                                    <SelectContent className="max-h-80 min-w-[420px]">
                                        {editOrganization?.org_code === 'group' && (
                                            <SelectItem value={ROOT_PARENT_VALUE}>{labels.noParentOrganization}</SelectItem>
                                        )}
                                        {parentOptionRows.map((row) => (
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
                                <Label htmlFor="org-sort-order">{labels.sortOrder}</Label>
                                <Input
                                    id="org-sort-order"
                                    type="number"
                                    min={0}
                                    max={9999}
                                    value={form.sortOrder}
                                    onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
                                    disabled={saving}
                                />
                            </div>
                            <label className="flex items-center gap-3 rounded-md border bg-background p-4">
                                <Checkbox
                                    checked={form.isActive}
                                    onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked === true }))}
                                    disabled={saving || editOrganization?.org_code === 'group'}
                                />
                                <span className="text-sm font-medium">{labels.active}</span>
                            </label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeDialogs} disabled={saving}>
                            {t.common.cancel}
                        </Button>
                        <Button onClick={() => void upsertOrganization(createOpen ? 'create' : 'edit')} disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {createOpen ? labels.createOrganization : labels.saveChanges}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!deleteOrganization} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{labels.disableOrganizationTitle}</DialogTitle>
                        <DialogDescription>{labels.disableOrganizationDesc}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {deleteDialogError && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {deleteDialogError}
                            </div>
                        )}
                        {deleteOrganization && (
                            <div className="rounded-md border bg-muted/20 p-4">
                                <p className="text-sm font-medium">{deleteOrganization.name}</p>
                                <p className="font-mono text-xs text-muted-foreground">{deleteOrganization.org_code}</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeDialogs} disabled={saving}>
                            {t.common.cancel}
                        </Button>
                        <Button variant="destructive" onClick={() => void handleDeleteOrganization()} disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {labels.disableOrganization}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
