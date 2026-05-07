'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Building2, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ScriptHubOrganizationDefinition } from '@/lib/types';

interface TreeNode {
    orgCode: string;
    name: string;
    orgType: string;
    level: number;
    children: TreeNode[];
    hasChildren: boolean;
}

interface OrgScopeBreadcrumbPickerProps {
    organizationCatalog: ScriptHubOrganizationDefinition[];
    visibleOrgCodes: string[];
    hasAllOrgScope: boolean;
    selectedOrgScope: string;
    selectedDepartmentScope: string;
    onOrgScopeChange: (orgScope: string, departmentScope: string) => void;
    allDepartmentsLabel: string;
    disabled?: boolean;
}

const ALL_DEPARTMENTS_VALUE = '__all_company_departments__';

function normalizeOrgCode(value?: string | null) {
    return String(value || '').trim() || 'group';
}

function isCompanyLike(org?: ScriptHubOrganizationDefinition | null) {
    const type = String(org?.org_type || '').toLowerCase();
    return type === 'company' || type === 'sub_group' || type === 'group';
}

function buildVisibleTree(
    catalog: ScriptHubOrganizationDefinition[],
    visibleCodes: string[],
    hasAll: boolean,
): TreeNode[] {
    const orgMap = new Map<string, ScriptHubOrganizationDefinition>();
    const childrenMap = new Map<string, ScriptHubOrganizationDefinition[]>();

    catalog.forEach((org) => {
        orgMap.set(org.org_code, org);
        const parent = org.parent_org_code || '';
        const siblings = childrenMap.get(parent) || [];
        siblings.push(org);
        childrenMap.set(parent, siblings);
    });

    const sortChildren = (orgs: ScriptHubOrganizationDefinition[]) =>
        [...orgs].sort(
            (a, b) =>
                (a.sort_order ?? 99) - (b.sort_order ?? 99) ||
                a.name.localeCompare(b.name),
        );

    // Compute full set of orgs to show in tree: all visible orgs + all their ancestors
    const visibleOrgSet = new Set<string>();
    if (hasAll) {
        catalog.forEach((org) => {
            if (org.is_active !== false) visibleOrgSet.add(org.org_code);
        });
    } else {
        const addAncestors = (orgCode: string) => {
            visibleOrgSet.add(orgCode);
            const org = orgMap.get(orgCode);
            const parentCode = org?.parent_org_code;
            if (parentCode && !visibleOrgSet.has(parentCode)) {
                addAncestors(parentCode);
            }
        };
        visibleCodes.forEach((code) => addAncestors(code));
    }

    const buildNodes = (
        org: ScriptHubOrganizationDefinition,
        level: number,
    ): TreeNode | null => {
        const children = sortChildren(childrenMap.get(org.org_code) || []);
        const childNodes: TreeNode[] = [];
        children.forEach((child) => {
            const node = buildNodes(child, level + 1);
            if (node) childNodes.push(node);
        });

        if (!visibleOrgSet.has(org.org_code)) return null;

        return {
            orgCode: org.org_code,
            name: org.name || org.org_code,
            orgType: org.org_type || '',
            level,
            children: childNodes,
            hasChildren: childNodes.length > 0,
        };
    };

    const rootCandidates =
        sortChildren(childrenMap.get('') || []) ||
        sortChildren(childrenMap.get('group') || []) ||
        [];
    const result: TreeNode[] = [];
    rootCandidates.forEach((root) => {
        const node = buildNodes(root, 0);
        if (node) result.push(node);
    });

    return result;
}

function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
    if (!query.trim()) return nodes;
    const q = query.toLowerCase();

    const matches = (node: TreeNode): boolean => {
        if (
            node.name.toLowerCase().includes(q) ||
            node.orgCode.toLowerCase().includes(q)
        ) {
            return true;
        }
        return node.children.some(matches);
    };

    const mapMatch = (node: TreeNode): TreeNode | null => {
        if (matches(node)) {
            return {
                ...node,
                children: node.children.map(mapMatch).filter(Boolean) as TreeNode[],
                hasChildren: node.children.length > 0,
            };
        }
        return null;
    };

    return nodes.map(mapMatch).filter(Boolean) as TreeNode[];
}

function getPathToNode(
    nodes: TreeNode[],
    targetCode: string,
    path: TreeNode[] = [],
): TreeNode[] | null {
    for (const node of nodes) {
        if (node.orgCode === targetCode) {
            return [...path, node];
        }
        const found = getPathToNode(
            node.children,
            targetCode,
            [...path, node],
        );
        if (found) return found;
    }
    return null;
}

const ORG_TYPE_LABELS: Record<string, string> = {
    group: '集团',
    sub_group: '子集团',
    company: '公司',
    department: '部门',
};

const ORG_TYPE_COLORS: Record<string, string> = {
    group: 'text-amber-500',
    sub_group: 'text-orange-400',
    company: 'text-blue-500',
    department: 'text-slate-400',
};

export function OrgScopeBreadcrumbPicker({
    organizationCatalog,
    visibleOrgCodes,
    hasAllOrgScope,
    selectedOrgScope,
    selectedDepartmentScope,
    onOrgScopeChange,
    disabled,
}: OrgScopeBreadcrumbPickerProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const orgMap = useMemo(
        () =>
            new Map(
                organizationCatalog.map((o) => [o.org_code, o]),
            ),
        [organizationCatalog],
    );

    const tree = useMemo(
        () =>
            buildVisibleTree(organizationCatalog, visibleOrgCodes, hasAllOrgScope),
        [organizationCatalog, visibleOrgCodes, hasAllOrgScope],
    );

    const filteredTree = useMemo(
        () => filterTree(tree, search),
        [tree, search],
    );

    // When search results change, auto-expand all matched paths so results are visible
    useEffect(() => {
        if (!search.trim()) {
            // Clear search: restore default expansion (first 2 levels = levels 0 and 1)
            const defaultExpanded = new Set<string>();
            const collectDefaults = (nodes: TreeNode[], level: number) => {
                if (level >= 2) return;
                nodes.forEach((node) => {
                    if (node.hasChildren) {
                        defaultExpanded.add(node.orgCode);
                        collectDefaults(node.children, level + 1);
                    }
                });
            };
            collectDefaults(tree, 0);
            setExpanded(defaultExpanded);
            return;
        }
        // Search active: expand all nodes in the filtered tree so results are visible
        const matchedCodes = new Set<string>();
        const collectMatched = (nodes: TreeNode[]) => {
            nodes.forEach((node) => {
                matchedCodes.add(node.orgCode);
                collectMatched(node.children);
            });
        };
        collectMatched(filteredTree);
        setExpanded(matchedCodes);
    }, [filteredTree, search, tree]);

    const effectiveSelectedCode = useMemo(() => {
        const norm = normalizeOrgCode(selectedDepartmentScope);
        if (norm !== ALL_DEPARTMENTS_VALUE) {
            const deptOrg = orgMap.get(norm);
            if (deptOrg) return norm;
        }
        return normalizeOrgCode(selectedOrgScope);
    }, [selectedDepartmentScope, selectedOrgScope, orgMap]);

    const breadcrumbPath = useMemo(() => {
        const norm = normalizeOrgCode(effectiveSelectedCode);
        const path = getPathToNode(tree, norm, []);
        if (path && path.length > 0) {
            return path.map((n) => n.name);
        }
        // Fallback: walk up the org map
        const segments: string[] = [];
        let current: ScriptHubOrganizationDefinition | undefined =
            orgMap.get(norm);
        const visited = new Set<string>();
        while (current && !visited.has(current.org_code)) {
            visited.add(current.org_code);
            segments.unshift(current.name || current.org_code);
            current = current.parent_org_code
                ? orgMap.get(current.parent_org_code)
                : undefined;
        }
        return segments;
    }, [effectiveSelectedCode, tree, orgMap]);

    const toggleExpanded = useCallback((orgCode: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(orgCode)) {
                next.delete(orgCode);
            } else {
                next.add(orgCode);
            }
            return next;
        });
    }, []);

    const handleSelect = useCallback(
        (node: TreeNode) => {
            const code = node.orgCode;
            let companyCode = code;
            let current: ScriptHubOrganizationDefinition | undefined =
                orgMap.get(code);
            const visited = new Set<string>();
            while (current && !visited.has(current.org_code)) {
                visited.add(current.org_code);
                if (isCompanyLike(current)) {
                    companyCode = current.org_code;
                    break;
                }
                current = current.parent_org_code
                    ? orgMap.get(current.parent_org_code)
                    : undefined;
            }
            const deptScope = isCompanyLike(orgMap.get(code))
                ? ALL_DEPARTMENTS_VALUE
                : code;
            onOrgScopeChange(companyCode, deptScope);
            setOpen(false);
            setSearch('');
        },
        [orgMap, onOrgScopeChange],
    );

    const isSelectable = useCallback(
        (node: TreeNode) => {
            if (hasAllOrgScope) return true;
            return visibleOrgCodes.includes(node.orgCode);
        },
        [hasAllOrgScope, visibleOrgCodes],
    );

    const renderTreeNode = (node: TreeNode) => {
        const isExpanded = expanded.has(node.orgCode);
        const isSelected = effectiveSelectedCode === node.orgCode;
        const selectable = isSelectable(node);

        return (
            <div key={node.orgCode}>
                <div
                    className={cn(
                        'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors',
                        isSelected && selectable
                            ? 'bg-primary/10 text-primary font-medium'
                            : selectable
                            ? 'hover:bg-muted/80'
                            : 'opacity-50 cursor-default',
                    )}
                    style={{ paddingLeft: `${node.level * 20 + 8}px` }}
                    onClick={() => {
                        if (isSelectable(node)) {
                            handleSelect(node);
                        }
                    }}
                >
                    {node.hasChildren ? (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(node.orgCode);
                            }}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted"
                        >
                            {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                        </button>
                    ) : (
                        <span className="h-5 w-5 shrink-0" />
                    )}
                    <Building2
                        className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            ORG_TYPE_COLORS[node.orgType] || 'text-slate-400',
                        )}
                    />
                    <span
                        className={cn(
                            'truncate min-w-0',
                            isSelected && selectable && 'text-primary',
                        )}
                    >
                        {node.name}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {ORG_TYPE_LABELS[node.orgType] || node.orgType}
                    </span>
                </div>
                {isExpanded &&
                    node.children.map((child) => renderTreeNode(child))}
            </div>
        );
    };

    const showPicker = hasAllOrgScope || visibleOrgCodes.length > 0;
    if (!showPicker) return null;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                        'h-9 max-w-[320px] justify-start text-left rounded-xl border-slate-200/80 bg-white/90 px-3 dark:border-slate-800 dark:bg-slate-950/80',
                        !breadcrumbPath.length && 'text-muted-foreground',
                    )}
                >
                    <Building2 className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                    <span className="ml-1.5 flex min-w-0 flex-1 items-center overflow-hidden text-sm">
                        {breadcrumbPath.length > 0 ? (
                            <span className="flex min-w-0 items-center gap-0.5 overflow-hidden">
                                {breadcrumbPath.length <= 3 ? (
                                    breadcrumbPath.map((segment, i) => (
                                        <span key={i} className="flex shrink-0 items-center gap-0.5">
                                            {i > 0 && (
                                                <span className="mx-0.5 shrink-0 text-xs text-muted-foreground/40">/</span>
                                            )}
                                            <span
                                                className={cn(
                                                    'max-w-[120px] truncate',
                                                    i === breadcrumbPath.length - 1
                                                        ? 'font-medium text-foreground'
                                                        : 'text-muted-foreground',
                                                )}
                                            >
                                                {segment}
                                            </span>
                                        </span>
                                    ))
                                ) : (
                                    <>
                                        <span className="max-w-[80px] shrink-0 truncate text-muted-foreground">
                                            {breadcrumbPath[0]}
                                        </span>
                                        <span className="mx-0.5 shrink-0 text-xs text-muted-foreground/40">/</span>
                                        <span className="shrink-0 text-muted-foreground">…</span>
                                        <span className="mx-0.5 shrink-0 text-xs text-muted-foreground/40">/</span>
                                        <span className="min-w-0 truncate font-medium text-foreground">
                                            {breadcrumbPath[breadcrumbPath.length - 1]}
                                        </span>
                                    </>
                                )}
                            </span>
                        ) : (
                            <span className="text-xs text-muted-foreground">选择组织范围</span>
                        )}
                    </span>
                    <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-slate-400" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="w-96 rounded-2xl border-slate-200 p-3 dark:border-slate-800"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <div className="relative mb-3">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="搜索组织..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-8 pl-8 pr-8 text-sm rounded-lg"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                <ScrollArea className="max-h-80">
                    <div className="space-y-0.5">
                        {filteredTree.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">
                                无匹配结果
                            </p>
                        ) : (
                            filteredTree.map((node) => renderTreeNode(node))
                        )}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}
