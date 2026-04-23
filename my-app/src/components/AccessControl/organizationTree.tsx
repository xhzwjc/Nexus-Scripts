'use client';

import { Badge } from '@/components/ui/badge';
import type { Translations } from '@/lib/i18n/types';
import type { ScriptHubOrganizationDefinition } from '@/lib/types';

export type AccessControlLabels = Translations['accessControl'];

export interface OrganizationTreeRow {
    organization: ScriptHubOrganizationDefinition;
    level: number;
    childCount: number;
}

export function orgTypeLabel(value: string, labels: AccessControlLabels) {
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

export function sortOrganizations(organizations: ScriptHubOrganizationDefinition[]) {
    return [...organizations].sort((a, b) => (
        (a.sort_order ?? 99) - (b.sort_order ?? 99) ||
        a.name.localeCompare(b.name) ||
        a.org_code.localeCompare(b.org_code)
    ));
}

export function createOrganizationMap(organizations: ScriptHubOrganizationDefinition[]) {
    return new Map(organizations.map((organization) => [organization.org_code, organization]));
}

export function getOrganizationDisplayPath(
    organization: ScriptHubOrganizationDefinition,
    organizationMap: Map<string, ScriptHubOrganizationDefinition>,
) {
    const segments: string[] = [];
    const visited = new Set<string>();
    let current: ScriptHubOrganizationDefinition | undefined = organization;

    while (current && !visited.has(current.org_code)) {
        segments.unshift(current.name || current.org_code);
        visited.add(current.org_code);
        current = current.parent_org_code ? organizationMap.get(current.parent_org_code) : undefined;
    }

    return segments.join(' / ') || organization.path || organization.org_code;
}

export function buildOrganizationTreeRows(
    organizations: ScriptHubOrganizationDefinition[],
    query = '',
    collapsedOrgCodes: Set<string> = new Set(),
): OrganizationTreeRow[] {
    const byCode = createOrganizationMap(organizations);
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
                getOrganizationDisplayPath(organization, byCode),
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

interface OrganizationTreeTextProps {
    row: OrganizationTreeRow;
    labels: AccessControlLabels;
    organizationMap: Map<string, ScriptHubOrganizationDefinition>;
    showCode?: boolean;
    showPath?: boolean;
}

export function OrganizationTreeText({
    row,
    labels,
    organizationMap,
    showCode = true,
    showPath = true,
}: OrganizationTreeTextProps) {
    const { organization, level } = row;
    const displayPath = getOrganizationDisplayPath(organization, organizationMap);

    return (
        <span className="flex min-w-0 items-start gap-2" style={{ paddingLeft: `${level * 18}px` }}>
            <span className="mt-2 h-px w-3 shrink-0 bg-border" />
            <span className="min-w-0">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{organization.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                        {orgTypeLabel(organization.org_type, labels)}
                    </Badge>
                    {showCode && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                            {organization.org_code}
                        </span>
                    )}
                </span>
                {showPath && (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {displayPath}
                    </span>
                )}
            </span>
        </span>
    );
}
