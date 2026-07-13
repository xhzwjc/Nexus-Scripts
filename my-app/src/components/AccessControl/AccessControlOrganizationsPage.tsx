'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Loader2, Plus, Search } from 'lucide-react';
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
import type { ScriptHubOrganizationDefinition } from '@/lib/types';
import { StatusBadge } from './AccessControlBadges';
import { invalidateRbacCache, useRbacQuery } from './accessControlQuery';
import { createOrganizationMap, OrganizationTreeText } from './organizationTree';
import type { RbacOrganizationsResponse, RbacOrganizationUsersResponse } from './types';
import { mapAccessControlApiError, type AccessControlLabels } from './utils';

interface AccessControlOrganizationsPageProps {
    refreshToken: number;
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
const ORG_USERS_PAGE_SIZE = 50;

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
    refreshToken,
}: AccessControlOrganizationsPageProps) {
    const { t } = useI18n();
    const labels = t.accessControl;
    const [query, setQuery] = useState('');
    const [saving, setSaving] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [editOrganization, setEditOrganization] = useState<ScriptHubOrganizationDefinition | null>(null);
    const [deleteOrganization, setDeleteOrganization] = useState<ScriptHubOrganizationDefinition | null>(null);
    const [softDeleteOrganization, setSoftDeleteOrganization] = useState<ScriptHubOrganizationDefinition | null>(null);
    const [form, setForm] = useState(createEmptyOrganizationForm());
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [deleteDialogError, setDeleteDialogError] = useState<string | null>(null);
    const [softDeleteDialogError, setSoftDeleteDialogError] = useState<string | null>(null);
    const [viewOrgUsers, setViewOrgUsers] = useState<ScriptHubOrganizationDefinition | null>(null);
    const [orgUsersData, setOrgUsersData] = useState<RbacOrganizationUsersResponse | null>(null);
    const [orgUsersLoading, setOrgUsersLoading] = useState(false);
    const [orgUsersError, setOrgUsersError] = useState<string | null>(null);
    const [orgUsersPage, setOrgUsersPage] = useState(1);
    const [orgUsersReloadToken, setOrgUsersReloadToken] = useState(0);
    const [collapsedOrgCodes, setCollapsedOrgCodes] = useState<Set<string>>(() => new Set());
    const [actionOrgUsers, setActionOrgUsers] = useState<RbacOrganizationUsersResponse | null>(null);
    const [actionOrgUsersLoading, setActionOrgUsersLoading] = useState(false);
    const [actionOrgUsersError, setActionOrgUsersError] = useState(false);

    const actionOrg = deleteOrganization || softDeleteOrganization;
    useEffect(() => {
        if (!actionOrg) {
            setActionOrgUsers(null);
            setActionOrgUsersLoading(false);
            setActionOrgUsersError(false);
            return;
        }
        const controller = new AbortController();
        setActionOrgUsersLoading(true);
        setActionOrgUsersError(false);
        void authenticatedFetch(`/api/admin/rbac/organizations/${encodeURIComponent(actionOrg.org_code)}/users?page=1&page_size=1`, {
            signal: controller.signal,
        })
            .then((res) => res.ok ? res.json() : null)
            .then((data) => { if (!controller.signal.aborted) setActionOrgUsers(data as RbacOrganizationUsersResponse | null); })
            .catch(() => {
                if (!controller.signal.aborted) {
                    setActionOrgUsers(null);
                    setActionOrgUsersError(true);
                }
            })
            .finally(() => { if (!controller.signal.aborted) setActionOrgUsersLoading(false); });
        return () => controller.abort();
    }, [actionOrg]);

    const hasActionOrgUsers = (actionOrgUsers?.total_count ?? 0) > 0;
    const actionPrimaryUserCount = actionOrgUsers?.primary_total_count ?? actionOrgUsers?.primary_users.length ?? 0;
    const actionDataScopeUserCount = actionOrgUsers?.data_scope_total_count ?? actionOrgUsers?.data_scope_users.length ?? 0;

    const organizationsQuery = useRbacQuery<RbacOrganizationsResponse>('/api/admin/rbac/organizations', labels.loadFailed, refreshToken);
    const organizations = organizationsQuery.data?.items ?? EMPTY_ORGANIZATIONS;
    const loading = organizationsQuery.loading;
    const error = organizationsQuery.error;
    const userCountByOrg = useMemo(() => new Map(
        organizations.map((organization) => [organization.org_code, organization.primary_user_count || 0]),
    ), [organizations]);
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

    const reloadOrganizationSlice = () => {
        invalidateRbacCache('/api/admin/rbac/organizations');
        invalidateRbacCache('/api/admin/rbac/catalog');
        invalidateRbacCache('/api/admin/rbac/summary');
        invalidateRbacCache('/api/admin/rbac/audit-logs');
        organizationsQuery.reload();
    };

    useEffect(() => {
        if (!viewOrgUsers) {
            setOrgUsersData(null);
            setOrgUsersLoading(false);
            setOrgUsersError(null);
            return;
        }

        const controller = new AbortController();
        const params = new URLSearchParams({
            page: String(orgUsersPage),
            page_size: String(ORG_USERS_PAGE_SIZE),
        });
        setOrgUsersLoading(true);
        setOrgUsersError(null);
        void authenticatedFetch(`/api/admin/rbac/organizations/${encodeURIComponent(viewOrgUsers.org_code)}/users?${params.toString()}`, {
            signal: controller.signal,
        }).then(async (response) => {
            if (!response.ok) {
                throw new Error('Failed to fetch users');
            }
            const payload = await response.json() as RbacOrganizationUsersResponse;
            if (!controller.signal.aborted) {
                setOrgUsersData(payload);
            }
        }).catch(() => {
            if (!controller.signal.aborted) {
                setOrgUsersData(null);
                setOrgUsersError(labels.loadFailed);
            }
        }).finally(() => {
            if (!controller.signal.aborted) {
                setOrgUsersLoading(false);
            }
        });

        return () => controller.abort();
    }, [labels.loadFailed, orgUsersPage, orgUsersReloadToken, viewOrgUsers]);

    useEffect(() => {
        if (!orgUsersData) {
            return;
        }
        const totalPages = Math.max(1, Math.ceil(orgUsersData.total_count / ORG_USERS_PAGE_SIZE));
        if (orgUsersPage > totalPages) {
            setOrgUsersPage(totalPages);
        }
    }, [orgUsersData, orgUsersPage]);

    const closeDialogs = () => {
        setCreateOpen(false);
        setEditOrganization(null);
        setDeleteOrganization(null);
        setSoftDeleteOrganization(null);
        setViewOrgUsers(null);
        setOrgUsersData(null);
        setOrgUsersError(null);
        setOrgUsersPage(1);
        setForm(createEmptyOrganizationForm());
        setDialogError(null);
        setDeleteDialogError(null);
        setSoftDeleteDialogError(null);
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

    const openViewOrgUsers = (organization: ScriptHubOrganizationDefinition) => {
        setViewOrgUsers(organization);
        setOrgUsersData(null);
        setOrgUsersError(null);
        setOrgUsersPage(1);
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
            reloadOrganizationSlice();
        } catch (saveError) {
            setDialogError(mapAccessControlApiError(saveError instanceof Error ? saveError.message : labels.organizationSaveFailed, labels));
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
            reloadOrganizationSlice();
        } catch (deleteError) {
            setDeleteDialogError(mapAccessControlApiError(deleteError instanceof Error ? deleteError.message : labels.organizationDeleteFailed, labels));
        } finally {
            setSaving(false);
        }
    };

    const handleSoftDeleteOrganization = async () => {
        if (!softDeleteOrganization) {
            return;
        }

        setSaving(true);
        setSoftDeleteDialogError(null);
        try {
            const response = await authenticatedFetch(`/api/admin/rbac/organizations/${encodeURIComponent(softDeleteOrganization.org_code)}?soft=true`, {
                method: 'DELETE',
            });
            const payload = await response.json().catch(() => ({ error: labels.organizationSoftDeleteFailed })) as DeleteMutationResponse;
            if (!response.ok || payload.error) {
                throw new Error(payload.error || labels.organizationSoftDeleteFailed);
            }

            toast.success(labels.organizationSoftDeleted);
            closeDialogs();
            reloadOrganizationSlice();
        } catch (deleteError) {
            setSoftDeleteDialogError(mapAccessControlApiError(deleteError instanceof Error ? deleteError.message : labels.organizationSoftDeleteFailed, labels));
        } finally {
            setSaving(false);
        }
    };

    return (
        <section aria-labelledby="access-control-organizations-title" className="space-y-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
                        <h2 id="access-control-organizations-title" className="text-[18px] font-semibold leading-7 text-[#0E1114] dark:text-white">{labels.organizationsPageTitle}</h2>
                        <p className="text-[12px] leading-5 text-[#B0B2B8]">{labels.organizationsPageDesc}</p>
                    </div>
                    <Button className="h-9 shrink-0 rounded-[6px] bg-[#1E3BFA] px-4 text-[13px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={openCreateDialog}>
                        <Plus className="h-3.5 w-3.5" />
                        {labels.createOrganization}
                    </Button>
            </div>

            <div>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="relative max-w-[380px] flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#B0B2B8]" />
                        <Input
                            className="h-9 rounded-[4px] border-[#E6E7EB] bg-white pl-9 text-[12px] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-950"
                            placeholder={labels.organizationsSearchPlaceholder}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <p className="text-[11px] text-[#B0B2B8]">{labels.organizationHierarchyHint}</p>
                        <div className="flex gap-2">
                            <Button variant="outline" className="h-8 rounded-[4px] border-[#E6E7EB] bg-white px-3 text-[11px] font-normal text-[#5E5F66] shadow-none" onClick={expandAll} disabled={parentOrgCodes.length === 0}>
                                {labels.expandAll}
                            </Button>
                            <Button variant="outline" className="h-8 rounded-[4px] border-[#E6E7EB] bg-white px-3 text-[11px] font-normal text-[#5E5F66] shadow-none" onClick={collapseAll} disabled={parentOrgCodes.length === 0}>
                                {labels.collapseAll}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <div>
                {loading ? (
                    <div className="flex min-h-[360px] items-center justify-center rounded-[8px] border border-[#EBEEF5] text-[12px] text-[#86888F]">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t.common.loading}
                    </div>
                ) : error ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-[8px] border border-[#EBEEF5] text-center">
                        <p className="max-w-md text-[12px] text-[#F53F3F]">{error}</p>
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-3 text-[12px] font-normal text-[#0F23D9] shadow-none" onClick={reloadOrganizationSlice}>{labels.refresh}</Button>
                    </div>
                ) : treeRows.length === 0 ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-[8px] border border-[#EBEEF5] text-center text-[12px] text-[#86888F]">
                        <Building2 className="h-7 w-7" />
                        <p>{labels.noOrganizations}</p>
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#1E3BFA] bg-white px-3 text-[12px] font-normal text-[#0F23D9] shadow-none" onClick={openCreateDialog}>
                            <Plus className="h-3.5 w-3.5" />
                            {labels.createOrganization}
                        </Button>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-[8px] border border-[#EBEEF5] bg-white dark:border-slate-800 dark:bg-slate-950">
                        <Table className="w-full min-w-[1100px] table-fixed text-[12px]">
                            <colgroup>
                                <col style={{ width: '30%' }} />
                                <col style={{ width: '9%' }} />
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '7%' }} />
                                <col style={{ width: '8%' }} />
                                <col style={{ width: '7%' }} />
                                <col style={{ width: '27%' }} />
                            </colgroup>
                            <TableHeader>
                                <TableRow className="h-10 border-b border-[#F2F3F5] bg-[#FAFAFB] hover:bg-[#FAFAFB] dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-900/40">
                                    <TableHead className="px-4 text-[11px] font-normal text-[#86888F]">{labels.organizationName}</TableHead>
                                    <TableHead className="px-4 text-[11px] font-normal text-[#86888F]">{labels.organizationType}</TableHead>
                                    <TableHead className="px-4 text-[11px] font-normal text-[#86888F]">{labels.parentOrganization}</TableHead>
                                    <TableHead className="px-4 text-[11px] font-normal text-[#86888F]">{labels.organizationChildren}</TableHead>
                                    <TableHead className="px-4 text-[11px] font-normal text-[#86888F]">{labels.viewOrgUsersTitle}</TableHead>
                                    <TableHead className="px-4 text-[11px] font-normal text-[#86888F]">{labels.status}</TableHead>
                                    <TableHead className="px-4 text-right text-[11px] font-normal text-[#86888F]">{labels.actions}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {treeRows.map(({ organization, level, childCount }) => (
                                    <TableRow key={organization.org_code} className="h-[56px] border-b border-[#F2F3F5] text-[#0F1014] hover:bg-[#F8F8F9] dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900/60">
                                        <TableCell className="px-4 py-1">
                                            <div className="flex items-center gap-2" style={{ paddingLeft: `${level * 24}px` }}>
                                                {childCount > 0 ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 shrink-0 rounded-[4px] text-[#86888F] hover:bg-[#F2F3F5]"
                                                        onClick={() => toggleCollapsed(organization.org_code)}
                                                        aria-label={collapsedOrgCodes.has(organization.org_code) ? labels.expandAll : labels.collapseAll}
                                                    >
                                                        {collapsedOrgCodes.has(organization.org_code) ? (
                                                            <ChevronRight className="h-3.5 w-3.5" />
                                                        ) : (
                                                            <ChevronDown className="h-3.5 w-3.5" />
                                                        )}
                                                    </Button>
                                                ) : (
                                                    <span className="h-6 w-6 shrink-0" />
                                                )}
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="truncate text-[12px] font-medium">{organization.name}</span>
                                                    </div>
                                                    <p className="mt-0.5 truncate font-mono text-[10px] text-[#B0B2B8]" title={`${organization.org_code} · ${organization.path}`}>{organization.org_code} · {organization.path}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-1">
                                            <Badge variant="outline" className="h-[20px] rounded-[4px] border-transparent bg-[rgba(46,156,255,0.1)] px-1.5 text-[10px] font-normal text-[#2E9CFF] shadow-none">{orgTypeLabel(organization.org_type, labels)}</Badge>
                                        </TableCell>
                                        <TableCell className="px-4 py-1">
                                            <p className="truncate font-mono text-[10px] text-[#86888F]" title={organization.parent_org_code || '-'}>{organization.parent_org_code || '-'}</p>
                                            <p className="mt-0.5 text-[10px] text-[#B0B2B8]">{labels.sortOrder} {organization.sort_order}</p>
                                        </TableCell>
                                        <TableCell className="px-4 py-1 tabular-nums text-[#86888F]">{childCount}</TableCell>
                                        <TableCell className="px-4 py-1 tabular-nums text-[#86888F]">{userCountByOrg.get(organization.org_code) || 0}</TableCell>
                                        <TableCell className="px-4 py-1">
                                            <StatusBadge active={organization.is_active} labels={labels} />
                                        </TableCell>
                                        <TableCell className="px-4 py-1 text-right">
                                            <div className="flex justify-end gap-3 whitespace-nowrap text-[11px]">
                                                <button type="button" className="text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => openViewOrgUsers(organization)}>
                                                    {labels.viewOrgUsers}
                                                </button>
                                                <button type="button" className="text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => openEditDialog(organization)}>
                                                    {labels.editOrganization}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-[#D48806] hover:text-[#B76E00] disabled:cursor-not-allowed disabled:text-[#B0B2B8]"
                                                    disabled={organization.org_code === 'group' || !organization.is_active}
                                                    onClick={() => {
                                                        setDeleteDialogError(null);
                                                        setDeleteOrganization(organization);
                                                    }}
                                                >
                                                    {labels.disableOrganization}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-[#F53F3F] hover:text-[#D9363E] disabled:cursor-not-allowed disabled:text-[#B0B2B8]"
                                                    disabled={organization.org_code === 'group' || childCount > 0}
                                                    onClick={() => {
                                                        setSoftDeleteDialogError(null);
                                                        setSoftDeleteOrganization(organization);
                                                    }}
                                                >
                                                    {labels.softDeleteOrganization}
                                                </button>
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
                <DialogContent className="gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[560px] dark:bg-slate-950 [&_[data-slot=checkbox][data-state=checked]]:border-[#1E3BFA] [&_[data-slot=checkbox][data-state=checked]]:bg-[#1E3BFA] [&_[data-slot=input]]:h-9 [&_[data-slot=input]]:rounded-[4px] [&_[data-slot=input]]:border-[#E6E7EB] [&_[data-slot=input]]:text-[12px] [&_[data-slot=input]]:shadow-none [&_[data-slot=input]]:focus-visible:border-[#1E3BFA] [&_[data-slot=input]]:focus-visible:ring-0 [&_[data-slot=label]]:text-[12px] [&_[data-slot=label]]:font-normal [&_[data-slot=select-trigger]]:h-9 [&_[data-slot=select-trigger]]:rounded-[4px] [&_[data-slot=select-trigger]]:border-[#E6E7EB] [&_[data-slot=select-trigger]]:text-[12px] [&_[data-slot=select-trigger]]:shadow-none [&_[data-slot=select-trigger]]:focus:ring-0">
                    <DialogHeader className="gap-1 border-b border-[#F2F3F5] px-5 pb-4 pr-12 pt-5 text-left dark:border-slate-800">
                        <DialogTitle className="text-[16px] leading-6 text-[#0E1114] dark:text-white">{createOpen ? labels.createOrganization : labels.editOrganization}</DialogTitle>
                        <DialogDescription className="text-[12px] leading-5 text-[#86888F]">{labels.organizationFormDesc}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 px-5 py-4">
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
                            <label className="flex h-9 items-center gap-3 rounded-[4px] border border-[#E6E7EB] bg-white px-3 dark:border-slate-800 dark:bg-slate-950">
                                <Checkbox
                                    checked={form.isActive}
                                    onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked === true }))}
                                    disabled={saving || editOrganization?.org_code === 'group'}
                                />
                                <span className="text-[12px] font-medium">{labels.active}</span>
                            </label>
                        </div>
                    </div>
                    <DialogFooter className="border-t border-[#F2F3F5] bg-[#FAFAFB] px-5 py-4 dark:border-slate-800 dark:bg-slate-900/40">
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-4 text-[12px] font-normal text-[#33353D] shadow-none" onClick={closeDialogs} disabled={saving}>
                            {t.common.cancel}
                        </Button>
                        <Button className="h-8 rounded-[6px] bg-[#1E3BFA] px-4 text-[12px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={() => void upsertOrganization(createOpen ? 'create' : 'edit')} disabled={saving}>
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {createOpen ? labels.createOrganization : labels.saveChanges}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!deleteOrganization} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
                <DialogContent className="gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[460px] dark:bg-slate-950">
                    <DialogHeader className="gap-1 border-b border-[#F2F3F5] px-5 pb-4 pr-12 pt-5 text-left dark:border-slate-800">
                        <DialogTitle className="text-[16px] leading-6 text-[#0E1114] dark:text-white">{labels.disableOrganizationTitle}</DialogTitle>
                        <DialogDescription className="text-[12px] leading-5 text-[#86888F]">{labels.disableOrganizationDesc}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 px-5 py-4">
                        {deleteDialogError && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {deleteDialogError}
                            </div>
                        )}
                        {deleteOrganization && (
                            <div className="rounded-[6px] border border-[#EBEEF5] bg-[#FAFAFB] p-3 dark:border-slate-800 dark:bg-slate-900/40">
                                <p className="text-[13px] font-medium text-[#0E1114] dark:text-white">{deleteOrganization.name}</p>
                                <p className="mt-0.5 font-mono text-[11px] text-[#86888F]">{deleteOrganization.org_code}</p>
                            </div>
                        )}
                        {actionOrgUsersLoading && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {t.common.loading}
                            </div>
                        )}
                        {actionOrgUsersError && !actionOrgUsersLoading && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{labels.loadFailed}</div>
                        )}
                        {hasActionOrgUsers && actionOrgUsers && !actionOrgUsersLoading && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {labels.orgUserSummary
                                    .replace('{primary}', String(actionPrimaryUserCount))
                                    .replace('{dataScope}', String(actionDataScopeUserCount))}
                            </div>
                        )}
                    </div>
                    <DialogFooter className="border-t border-[#F2F3F5] bg-[#FAFAFB] px-5 py-4 dark:border-slate-800 dark:bg-slate-900/40">
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-4 text-[12px] font-normal text-[#33353D] shadow-none" onClick={closeDialogs} disabled={saving}>
                            {t.common.cancel}
                        </Button>
                        <Button variant="destructive" className="h-8 rounded-[6px] bg-[#D48806] px-4 text-[12px] font-normal text-white shadow-none hover:bg-[#B76E00]" onClick={() => void handleDeleteOrganization()} disabled={saving || actionOrgUsersLoading || actionOrgUsers === null || hasActionOrgUsers}>
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {labels.disableOrganization}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!softDeleteOrganization} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
                <DialogContent className="gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[460px] dark:bg-slate-950">
                    <DialogHeader className="gap-1 border-b border-[#F2F3F5] px-5 pb-4 pr-12 pt-5 text-left dark:border-slate-800">
                        <DialogTitle className="text-[16px] leading-6 text-[#0E1114] dark:text-white">{labels.softDeleteOrganizationTitle}</DialogTitle>
                        <DialogDescription className="text-[12px] leading-5 text-[#86888F]">{labels.softDeleteOrganizationDesc}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 px-5 py-4">
                        {softDeleteDialogError && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {softDeleteDialogError}
                            </div>
                        )}
                        {softDeleteOrganization && (
                            <div className="rounded-[6px] border border-[#EBEEF5] bg-[#FAFAFB] p-3 dark:border-slate-800 dark:bg-slate-900/40">
                                <p className="text-[13px] font-medium text-[#0E1114] dark:text-white">{softDeleteOrganization.name}</p>
                                <p className="mt-0.5 font-mono text-[11px] text-[#86888F]">{softDeleteOrganization.org_code}</p>
                            </div>
                        )}
                        {actionOrgUsersLoading && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {t.common.loading}
                            </div>
                        )}
                        {actionOrgUsersError && !actionOrgUsersLoading && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{labels.loadFailed}</div>
                        )}
                        {hasActionOrgUsers && actionOrgUsers && !actionOrgUsersLoading && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {labels.orgUserSummary
                                    .replace('{primary}', String(actionPrimaryUserCount))
                                    .replace('{dataScope}', String(actionDataScopeUserCount))}
                            </div>
                        )}
                    </div>
                    <DialogFooter className="border-t border-[#F2F3F5] bg-[#FAFAFB] px-5 py-4 dark:border-slate-800 dark:bg-slate-900/40">
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-4 text-[12px] font-normal text-[#33353D] shadow-none" onClick={closeDialogs} disabled={saving}>
                            {t.common.cancel}
                        </Button>
                        <Button variant="destructive" className="h-8 rounded-[6px] bg-[#F53F3F] px-4 text-[12px] font-normal text-white shadow-none hover:bg-[#D9363E]" onClick={() => void handleSoftDeleteOrganization()} disabled={saving || actionOrgUsersLoading || actionOrgUsers === null || hasActionOrgUsers}>
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {labels.softDeleteOrganization}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!viewOrgUsers} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
                <DialogContent className="gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[680px] dark:bg-slate-950">
                    <DialogHeader className="gap-1 border-b border-[#F2F3F5] px-5 pb-4 pr-12 pt-5 text-left dark:border-slate-800">
                        <DialogTitle className="text-[16px] leading-6 text-[#0E1114] dark:text-white">{viewOrgUsers?.name} — {labels.viewOrgUsersTitle}</DialogTitle>
                    </DialogHeader>
                    <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
                        {orgUsersLoading ? (
                            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {t.common.loading}
                            </div>
                        ) : orgUsersError ? (
                            <div className="flex flex-col items-center justify-center gap-3 py-8 text-sm text-[#F53F3F]">
                                <span>{orgUsersError}</span>
                                <Button variant="outline" className="h-8 rounded-[6px] px-3 text-[12px] text-[#0F23D9]" onClick={() => setOrgUsersReloadToken((current) => current + 1)}>{labels.refresh}</Button>
                            </div>
                        ) : orgUsersData && orgUsersData.total_count === 0 ? (
                            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                                {labels.orgNoUsers}
                            </div>
                        ) : orgUsersData ? (
                            <div className="space-y-4">
                                {orgUsersData.primary_users.length > 0 && (
                                    <div>
                                        <h4 className="mb-2 text-sm font-semibold">{labels.orgPrimaryUsers} ({orgUsersData.primary_total_count ?? orgUsersData.primary_users.length})</h4>
                                        <div className="rounded-md border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-muted/50">
                                                        <TableHead>{labels.orgUserCode}</TableHead>
                                                        <TableHead>{labels.orgUserDisplayName}</TableHead>
                                                        <TableHead>{labels.orgUserStatus}</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {orgUsersData.primary_users.map((user) => (
                                                        <TableRow key={user.user_code}>
                                                            <TableCell className="font-mono text-xs">{user.user_code}</TableCell>
                                                            <TableCell>{user.display_name}</TableCell>
                                                            <TableCell>
                                                                <StatusBadge active={user.is_active} labels={labels} />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                )}
                                {orgUsersData.data_scope_users.length > 0 && (
                                    <div>
                                        <h4 className="mb-2 text-sm font-semibold">{labels.orgDataScopeUsers} ({orgUsersData.data_scope_total_count ?? orgUsersData.data_scope_users.length})</h4>
                                        <div className="rounded-md border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-muted/50">
                                                        <TableHead>{labels.orgUserCode}</TableHead>
                                                        <TableHead>{labels.orgUserDisplayName}</TableHead>
                                                        <TableHead>{labels.orgUserStatus}</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {orgUsersData.data_scope_users.map((user) => (
                                                        <TableRow key={user.user_code}>
                                                            <TableCell className="font-mono text-xs">{user.user_code}</TableCell>
                                                            <TableCell>{user.display_name}</TableCell>
                                                            <TableCell>
                                                                <StatusBadge active={user.is_active} labels={labels} />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                    <DialogFooter className="border-t border-[#F2F3F5] bg-[#FAFAFB] px-5 py-4 dark:border-slate-800 dark:bg-slate-900/40">
                        {orgUsersData && orgUsersData.total_count > 0 && (
                            <div className="mr-auto flex items-center gap-2 text-[12px] text-[#86888F]">
                                <span>{orgUsersPage} / {Math.max(1, Math.ceil(orgUsersData.total_count / ORG_USERS_PAGE_SIZE))} · {orgUsersData.total_count}</span>
                                <Button variant="outline" className="h-8 rounded-[6px] px-3 text-[12px]" disabled={orgUsersPage <= 1 || orgUsersLoading} onClick={() => setOrgUsersPage((current) => Math.max(1, current - 1))}>{t.common.prev}</Button>
                                <Button variant="outline" className="h-8 rounded-[6px] px-3 text-[12px]" disabled={orgUsersPage >= Math.ceil(orgUsersData.total_count / ORG_USERS_PAGE_SIZE) || orgUsersLoading} onClick={() => setOrgUsersPage((current) => current + 1)}>{t.common.next}</Button>
                            </div>
                        )}
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-4 text-[12px] font-normal text-[#33353D] shadow-none" onClick={closeDialogs}>
                            {t.common.close}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}
