'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DatabaseZap, Loader2, RefreshCw, Search } from 'lucide-react';
import { authenticatedFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/lib/toast';
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
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ResourceDomain, ResourceKind, ResourceListItem, SharePolicy } from '@/lib/types';
import { RESOURCE_DOMAINS, SHARE_POLICY_OPTIONS } from './constants';
import { formatDateTime, getResourceDomainLabel, getResourceScopeLevelLabel, getResourceStatusLabel, getSharePolicyLabel } from './utils';

interface RecruitmentListResponse<T> {
    success?: boolean;
    data?: T;
    error?: string;
    detail?: string;
}

interface GovernedRecruitmentResource {
    id?: number | string;
    skill_code?: string;
    config_key?: string;
    name?: string;
    model_name?: string;
    provider?: string;
    task_type?: string;
    from_email?: string;
    email?: string;
    org_code?: string;
    scope_level?: string | null;
    share_policy?: SharePolicy;
    allow_sub_org_use?: boolean;
    allow_copy?: boolean;
    is_enabled?: boolean;
    is_active?: boolean;
    updated_at?: string | null;
    description?: string | null;
    notes?: string | null;
}

interface ResourceGovernanceFormState {
    scopeLevel: string;
    sharePolicy: SharePolicy;
    allowSubOrgUse: boolean;
    allowCopy: boolean;
    isEnabled: boolean;
}

const RESOURCE_SCOPE_LEVEL_OPTIONS = ['ORG', 'ORG_AND_CHILDREN', 'GROUP'];

function filterResources(
    items: ResourceListItem[],
    domain: ResourceDomain,
    query: string,
    sharePolicy: 'all' | SharePolicy,
) {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => (
        item.domain === domain &&
        (!normalizedQuery || [item.name, item.ownerOrgCode, item.description || ''].join(' ').toLowerCase().includes(normalizedQuery)) &&
        (sharePolicy === 'all' || item.sharePolicy === sharePolicy)
    ));
}

function normalizeSharePolicy(value: unknown): SharePolicy {
    const candidate = String(value || '').toUpperCase();
    return SHARE_POLICY_OPTIONS.includes(candidate as SharePolicy) ? candidate as SharePolicy : 'PRIVATE';
}

function createGovernanceFormState(item: ResourceListItem | null): ResourceGovernanceFormState {
    return {
        scopeLevel: item?.scopeLevel || 'ORG',
        sharePolicy: item?.sharePolicy || 'PRIVATE',
        allowSubOrgUse: Boolean(item?.allowSubOrgUse),
        allowCopy: Boolean(item?.allowCopy),
        isEnabled: item?.status !== 'inactive' && item?.status !== 'disabled',
    };
}

function canCopyResource(item: ResourceListItem | null) {
    return Boolean(
        item?.resourceKind &&
        item.rawId !== undefined &&
        item.rawId !== null &&
        item.sharePolicy === 'SHARED_COPYABLE' &&
        item.allowCopy,
    );
}

async function loadRecruitmentList<T>(path: string): Promise<T[]> {
    const response = await authenticatedFetch(`/api/recruitment/${path}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({})) as RecruitmentListResponse<T[]>;
    if (!response.ok || payload.error || payload.success === false) {
        throw new Error(payload.error || payload.detail || `Failed to load ${path}`);
    }
    return Array.isArray(payload.data) ? payload.data : [];
}

function mapSkillResource(item: GovernedRecruitmentResource): ResourceListItem {
    return {
        id: `skill-${item.id || item.skill_code || item.name}`,
        rawId: item.id,
        resourceKind: 'skill',
        domain: 'skill',
        name: item.name || item.skill_code || '-',
        ownerOrgCode: item.org_code || 'group',
        scopeLevel: item.scope_level || 'ORG',
        sharePolicy: normalizeSharePolicy(item.share_policy),
        status: item.is_enabled === false ? 'inactive' : 'active',
        allowSubOrgUse: Boolean(item.allow_sub_org_use),
        allowCopy: Boolean(item.allow_copy),
        updatedAt: item.updated_at,
        description: item.description,
    };
}

function mapModelResource(item: GovernedRecruitmentResource): ResourceListItem {
    return {
        id: `model-${item.id || item.config_key || item.model_name}`,
        rawId: item.id,
        resourceKind: 'model',
        domain: 'model',
        name: item.config_key || item.model_name || item.task_type || '-',
        ownerOrgCode: item.org_code || 'group',
        scopeLevel: item.scope_level || 'ORG',
        sharePolicy: normalizeSharePolicy(item.share_policy),
        status: item.is_active === false ? 'inactive' : 'active',
        allowSubOrgUse: Boolean(item.allow_sub_org_use),
        allowCopy: Boolean(item.allow_copy),
        updatedAt: item.updated_at,
        description: [item.provider, item.model_name, item.task_type].filter(Boolean).join(' / '),
    };
}

function mapMailResource(kind: 'sender' | 'recipient', item: GovernedRecruitmentResource): ResourceListItem {
    const fallbackName = kind === 'sender' ? item.from_email : item.email;
    return {
        id: `mail-${kind}-${item.id || fallbackName || item.name}`,
        rawId: item.id,
        resourceKind: `mail-${kind}` as ResourceKind,
        domain: 'mail',
        name: item.name || fallbackName || '-',
        ownerOrgCode: item.org_code || 'group',
        scopeLevel: item.scope_level || 'ORG',
        sharePolicy: normalizeSharePolicy(item.share_policy),
        status: item.is_enabled === false ? 'inactive' : 'active',
        allowSubOrgUse: Boolean(item.allow_sub_org_use),
        allowCopy: Boolean(item.allow_copy),
        updatedAt: item.updated_at,
        description: kind === 'sender' ? item.from_email : (item.notes || item.email),
    };
}

export function AccessControlResourcesPage() {
    const { t } = useI18n();
    const labels = t.accessControl;
    const [domain, setDomain] = useState<ResourceDomain>('mail');
    const [query, setQuery] = useState('');
    const [sharePolicy, setSharePolicy] = useState<'all' | SharePolicy>('all');
    const [selectedItem, setSelectedItem] = useState<ResourceListItem | null>(null);
    const [resources, setResources] = useState<ResourceListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [governanceDialogOpen, setGovernanceDialogOpen] = useState(false);
    const [governanceForm, setGovernanceForm] = useState<ResourceGovernanceFormState>(() => createGovernanceFormState(null));
    const [governanceSaving, setGovernanceSaving] = useState(false);
    const [copyDialogOpen, setCopyDialogOpen] = useState(false);
    const [copyItem, setCopyItem] = useState<ResourceListItem | null>(null);
    const [copyTargetOrgCode, setCopyTargetOrgCode] = useState('');
    const [copySaving, setCopySaving] = useState(false);

    const loadResources = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const [skillsResult, modelsResult, sendersResult, recipientsResult] = await Promise.allSettled([
                loadRecruitmentList<GovernedRecruitmentResource>('skills'),
                loadRecruitmentList<GovernedRecruitmentResource>('llm-configs'),
                loadRecruitmentList<GovernedRecruitmentResource>('mail-senders'),
                loadRecruitmentList<GovernedRecruitmentResource>('mail-recipients'),
            ]);
            const nextResources: ResourceListItem[] = [];

            if (skillsResult.status === 'fulfilled') {
                nextResources.push(...skillsResult.value.map(mapSkillResource));
            }
            if (modelsResult.status === 'fulfilled') {
                nextResources.push(...modelsResult.value.map(mapModelResource));
            }
            if (sendersResult.status === 'fulfilled') {
                nextResources.push(...sendersResult.value.map((item) => mapMailResource('sender', item)));
            }
            if (recipientsResult.status === 'fulfilled') {
                nextResources.push(...recipientsResult.value.map((item) => mapMailResource('recipient', item)));
            }

            const rejected = [skillsResult, modelsResult, sendersResult, recipientsResult].find((item) => item.status === 'rejected');
            setResources(nextResources);
            setLoadError(rejected ? labels.resourcePartialLoadFailed : null);
        } catch (error) {
            setResources([]);
            setLoadError(error instanceof Error ? error.message : labels.loadFailed);
        } finally {
            setLoading(false);
        }
    }, [labels.loadFailed, labels.resourcePartialLoadFailed]);

    useEffect(() => {
        void loadResources();
    }, [loadResources]);

    useEffect(() => {
        setGovernanceForm(createGovernanceFormState(selectedItem));
    }, [selectedItem]);

    const filteredResources = useMemo(
        () => filterResources(resources, domain, query, sharePolicy),
        [domain, query, resources, sharePolicy],
    );

    const openGovernanceDialog = (item: ResourceListItem) => {
        setSelectedItem(item);
        setGovernanceForm(createGovernanceFormState(item));
        setGovernanceDialogOpen(true);
    };

    const openCopyDialog = (item: ResourceListItem) => {
        setSelectedItem(item);
        setCopyItem(item);
        setCopyTargetOrgCode('');
        setCopyDialogOpen(true);
    };

    const handleSaveGovernance = async () => {
        if (!selectedItem?.resourceKind || selectedItem.rawId === undefined || selectedItem.rawId === null) {
            toast.error(labels.resourceGovernanceUpdateFailed);
            return;
        }

        setGovernanceSaving(true);
        try {
            const response = await authenticatedFetch(`/api/recruitment/resource-governance/${selectedItem.resourceKind}/${selectedItem.rawId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scope_level: governanceForm.scopeLevel,
                    share_policy: governanceForm.sharePolicy,
                    allow_sub_org_use: governanceForm.allowSubOrgUse,
                    allow_copy: governanceForm.allowCopy,
                    is_enabled: governanceForm.isEnabled,
                }),
            });
            const payload = await response.json().catch(() => ({})) as RecruitmentListResponse<unknown>;
            if (!response.ok || payload.success === false || payload.error) {
                throw new Error(payload.error || payload.detail || labels.resourceGovernanceUpdateFailed);
            }

            toast.success(labels.resourceGovernanceUpdated);
            setSelectedItem((current) => current ? {
                ...current,
                scopeLevel: governanceForm.scopeLevel,
                sharePolicy: governanceForm.sharePolicy,
                allowSubOrgUse: governanceForm.allowSubOrgUse,
                allowCopy: governanceForm.allowCopy,
                status: governanceForm.isEnabled ? 'active' : 'inactive',
            } : current);
            setGovernanceDialogOpen(false);
            void loadResources();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : labels.resourceGovernanceUpdateFailed);
        } finally {
            setGovernanceSaving(false);
        }
    };

    const handleCopyResource = async () => {
        if (!canCopyResource(copyItem) || !copyItem?.resourceKind || copyItem.rawId === undefined || copyItem.rawId === null) {
            toast.error(labels.resourceCopyUnavailable);
            return;
        }

        setCopySaving(true);
        try {
            const targetOrgCode = copyTargetOrgCode.trim();
            const response = await authenticatedFetch(`/api/recruitment/resource-governance/${copyItem.resourceKind}/${copyItem.rawId}/copy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_org_code: targetOrgCode || undefined,
                }),
            });
            const payload = await response.json().catch(() => ({})) as RecruitmentListResponse<unknown>;
            if (!response.ok || payload.success === false || payload.error) {
                throw new Error(payload.error || payload.detail || labels.copyResourceFailed);
            }

            toast.success(labels.copyResourceSuccess);
            setCopyDialogOpen(false);
            setCopyItem(null);
            setCopyTargetOrgCode('');
            void loadResources();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : labels.copyResourceFailed);
        } finally {
            setCopySaving(false);
        }
    };

    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="rounded-lg border bg-card">
                <div className="border-b px-5 py-4">
                    <div>
                        <h2 className="text-lg font-semibold">{labels.resourcesPageTitle}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{labels.resourcesPageDesc}</p>
                    </div>
                    <Button variant="outline" className="mt-3 lg:mt-0" onClick={() => void loadResources()} disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {labels.refresh}
                    </Button>
                </div>
                <div className="border-b px-5 py-3">
                    <Tabs value={domain} onValueChange={(value) => {
                        setDomain(value as ResourceDomain);
                        setSelectedItem(null);
                    }}>
                        <TabsList className="w-full justify-start bg-muted/60">
                            {RESOURCE_DOMAINS.map((item) => (
                                <TabsTrigger key={item} value={item}>
                                    {getResourceDomainLabel(item, labels)}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
                <div className="border-b bg-muted/20 px-5 py-4">
                    <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_220px_auto]">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                className="pl-9"
                                placeholder={labels.resourcesSearchPlaceholder}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                            />
                        </div>
                        <Select value={sharePolicy} onValueChange={(value) => setSharePolicy(value as 'all' | SharePolicy)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{labels.filterAllSharePolicies}</SelectItem>
                                {SHARE_POLICY_OPTIONS.map((policy) => (
                                    <SelectItem key={policy} value={policy}>
                                        {getSharePolicyLabel(policy, labels)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={() => {
                            setQuery('');
                            setSharePolicy('all');
                        }}>
                            {labels.resetFilters}
                        </Button>
                    </div>
                </div>

                <div className="p-5">
                    {loadError && (
                        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                            {loadError}
                        </div>
                    )}
                    {loading ? (
                        <div className="flex min-h-[360px] items-center justify-center text-muted-foreground">
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            {t.common.loading}
                        </div>
                    ) : filteredResources.length === 0 ? (
                        <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
                            <div className="rounded-full bg-muted p-3">
                                <DatabaseZap className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="font-medium">{labels.resourcesEmptyTitle}</p>
                                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                                    {labels.resourcesEmptyDesc}
                                </p>
                            </div>
                            <Badge variant="outline">
                                {getResourceDomainLabel(domain, labels)}
                            </Badge>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead>{labels.resourceName}</TableHead>
                                        <TableHead>{labels.organization}</TableHead>
                                        <TableHead>{labels.sharePolicy}</TableHead>
                                        <TableHead>{labels.status}</TableHead>
                                        <TableHead>{labels.updatedAt}</TableHead>
                                        <TableHead className="text-right">{labels.actions}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredResources.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">{item.name}</TableCell>
                                            <TableCell className="font-mono text-xs">{item.ownerOrgCode}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{getSharePolicyLabel(item.sharePolicy, labels)}</Badge>
                                            </TableCell>
                                            <TableCell>{getResourceStatusLabel(item.status, labels)}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {formatDateTime(item.updatedAt) || '-'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => setSelectedItem(item)}>
                                                        {labels.viewDetails}
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => openCopyDialog(item)}
                                                        disabled={!canCopyResource(item)}
                                                        title={canCopyResource(item) ? labels.copyResource : labels.resourceCopyUnavailable}
                                                    >
                                                        {labels.copyResource}
                                                    </Button>
                                                    <Button variant="default" size="sm" onClick={() => openGovernanceDialog(item)} disabled={!item.resourceKind || item.rawId === undefined}>
                                                        {labels.editResourceGovernance}
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
            </div>

            <aside className="rounded-lg border bg-card">
                <div className="border-b px-5 py-4">
                    <h3 className="font-semibold">{labels.resourceDetailTitle}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{labels.resourceDetailDesc}</p>
                </div>
                <ScrollArea className="h-[520px]">
                    <div className="space-y-4 p-5">
                        {selectedItem ? (
                            <>
                                <div>
                                    <p className="text-xs text-muted-foreground">{labels.resourceName}</p>
                                    <p className="mt-1 font-medium">{selectedItem.name}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">{labels.resourceDomain}</p>
                                    <p className="mt-1">{getResourceDomainLabel(selectedItem.domain, labels)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">{labels.organization}</p>
                                    <p className="mt-1 font-mono text-sm">{selectedItem.ownerOrgCode}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">{labels.resourceScopeLevel}</p>
                                    <p className="mt-1 text-sm">{getResourceScopeLevelLabel(selectedItem.scopeLevel, labels)}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{labels.resourceScopeHelp}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">{labels.sharePolicy}</p>
                                    <Badge className="mt-1" variant="outline">{getSharePolicyLabel(selectedItem.sharePolicy, labels)}</Badge>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">{labels.status}</p>
                                    <p className="mt-1">{getResourceStatusLabel(selectedItem.status, labels)}</p>
                                </div>
                                <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-muted-foreground">{labels.allowSubOrgUse}</span>
                                        <Badge variant={selectedItem.allowSubOrgUse ? 'default' : 'outline'}>{selectedItem.allowSubOrgUse ? labels.active : labels.inactive}</Badge>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-muted-foreground">{labels.allowCopy}</span>
                                        <Badge variant={selectedItem.allowCopy ? 'default' : 'outline'}>{selectedItem.allowCopy ? labels.active : labels.inactive}</Badge>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">{labels.resourceDescription}</p>
                                    <p className="mt-1 text-sm text-muted-foreground">{selectedItem.description || '-'}</p>
                                </div>
                                <div className="grid gap-2">
                                    <Button
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => openCopyDialog(selectedItem)}
                                        disabled={!canCopyResource(selectedItem)}
                                        title={canCopyResource(selectedItem) ? labels.copyResource : labels.resourceCopyUnavailable}
                                    >
                                        {labels.copyResource}
                                    </Button>
                                    {!canCopyResource(selectedItem) && (
                                        <p className="text-xs text-muted-foreground">{labels.resourceCopyRequirement}</p>
                                    )}
                                    <Button className="w-full" onClick={() => openGovernanceDialog(selectedItem)} disabled={!selectedItem.resourceKind || selectedItem.rawId === undefined}>
                                        {labels.editResourceGovernance}
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                                <DatabaseZap className="h-8 w-8" />
                                <p>{labels.resourceDetailEmpty}</p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </aside>

            <Dialog open={governanceDialogOpen} onOpenChange={setGovernanceDialogOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{labels.editResourceGovernance}</DialogTitle>
                        <DialogDescription>
                            {selectedItem ? `${selectedItem.name} · ${getResourceDomainLabel(selectedItem.domain, labels)}` : labels.resourceDetailDesc}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <p className="text-sm font-medium">{labels.resourceScopeLevel}</p>
                            <Select
                                value={governanceForm.scopeLevel}
                                onValueChange={(value) => setGovernanceForm((current) => ({ ...current, scopeLevel: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {RESOURCE_SCOPE_LEVEL_OPTIONS.map((value) => (
                                        <SelectItem key={value} value={value}>
                                            {getResourceScopeLevelLabel(value, labels)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">{labels.resourceScopeHelp}</p>
                        </div>

                        <div className="grid gap-2">
                            <p className="text-sm font-medium">{labels.sharePolicy}</p>
                            <Select
                                value={governanceForm.sharePolicy}
                                onValueChange={(value) => setGovernanceForm((current) => ({ ...current, sharePolicy: value as SharePolicy }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SHARE_POLICY_OPTIONS.map((policy) => (
                                        <SelectItem key={policy} value={policy}>
                                            {getSharePolicyLabel(policy, labels)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-3 rounded-md border bg-muted/20 p-4">
                            <label className="flex items-center gap-3 text-sm">
                                <Checkbox
                                    checked={governanceForm.allowSubOrgUse}
                                    onCheckedChange={(checked) => setGovernanceForm((current) => ({ ...current, allowSubOrgUse: checked === true }))}
                                />
                                {labels.allowSubOrgUse}
                            </label>
                            <label className="flex items-center gap-3 text-sm">
                                <Checkbox
                                    checked={governanceForm.allowCopy}
                                    onCheckedChange={(checked) => setGovernanceForm((current) => ({ ...current, allowCopy: checked === true }))}
                                />
                                {labels.allowCopy}
                            </label>
                            <label className="flex items-center gap-3 text-sm">
                                <Checkbox
                                    checked={governanceForm.isEnabled}
                                    onCheckedChange={(checked) => setGovernanceForm((current) => ({ ...current, isEnabled: checked === true }))}
                                />
                                {labels.resourceEnabled}
                            </label>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setGovernanceDialogOpen(false)} disabled={governanceSaving}>
                            {labels.cancelLabel}
                        </Button>
                        <Button onClick={() => void handleSaveGovernance()} disabled={governanceSaving || !selectedItem?.resourceKind || selectedItem.rawId === undefined}>
                            {governanceSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {labels.saveResourceGovernance}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={copyDialogOpen} onOpenChange={(open) => {
                setCopyDialogOpen(open);
                if (!open) {
                    setCopyItem(null);
                    setCopyTargetOrgCode('');
                }
            }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{labels.copyResourceTitle}</DialogTitle>
                        <DialogDescription>
                            {copyItem ? `${copyItem.name} · ${getResourceDomainLabel(copyItem.domain, labels)}` : labels.copyResourceDesc}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4">
                        <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                            {labels.copyResourceDesc}
                        </div>
                        <div className="grid gap-2">
                            <p className="text-sm font-medium">{labels.targetOrganizationCode}</p>
                            <Input
                                value={copyTargetOrgCode}
                                onChange={(event) => setCopyTargetOrgCode(event.target.value)}
                                placeholder={labels.targetOrganizationCodePlaceholder}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCopyDialogOpen(false)} disabled={copySaving}>
                            {labels.cancelLabel}
                        </Button>
                        <Button onClick={() => void handleCopyResource()} disabled={copySaving || !canCopyResource(copyItem)}>
                            {copySaving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {labels.copyResourceSubmit}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
