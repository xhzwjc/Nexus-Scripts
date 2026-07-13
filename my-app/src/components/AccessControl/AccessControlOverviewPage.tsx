'use client';

import type { DataScope, ScriptHubRbacOverview } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CONFIG_PERMISSION_KEYS, DATA_SCOPE_OPTIONS } from './constants';
import { CompactBadgeList } from './AccessControlBadges';
import type { AccessControlLabels } from './utils';
import {
    countBy,
    createPermissionMap,
    getDataScopeLabel,
    normalizeDataScope,
} from './utils';

interface AccessControlOverviewPageProps {
    overview: ScriptHubRbacOverview | null;
    labels: AccessControlLabels;
}

const SCOPE_COLORS: Record<DataScope, string> = {
    ALL: '#1E3BFA',
    ORG_AND_CHILDREN: '#2E9CFF',
    ORG_ONLY: '#0CC991',
    CUSTOM_ORGS: '#FFAB24',
    SELF: '#86888F',
};

export function AccessControlOverviewPage({ overview, labels }: AccessControlOverviewPageProps) {
    const users = overview?.users || [];
    const roles = overview?.catalog.roles || [];
    const permissions = overview?.catalog.permissions || [];
    const organizations = overview?.catalog.organizations || [];
    const permissionMap = createPermissionMap(permissions);
    const activeUsers = users.filter((user) => user.is_active).length;
    const systemRoles = roles.filter((role) => role.is_system).length;
    const scopeCounts = countBy(users.map((user) => normalizeDataScope(user.data_scope)));
    const highRiskUsers = users.filter((user) => (
        user.is_super_admin ||
        user.effective_permission_keys.some((permissionKey) => CONFIG_PERMISSION_KEYS.includes(permissionKey))
    ));
    const maxScopeCount = Math.max(1, ...DATA_SCOPE_OPTIONS.map((scope) => scopeCounts[scope] || 0));

    const statCards = [
        {
            label: labels.totalUsers,
            value: users.length,
            sub: `${organizations.length} ${labels.organizationsPageTitle}`,
            color: '#1E3BFA',
        },
        {
            label: labels.activeUsers,
            value: activeUsers,
            sub: `${users.length - activeUsers} ${labels.inactive}`,
            color: '#0CC991',
        },
        {
            label: labels.totalRoles,
            value: roles.length,
            sub: `${systemRoles} ${labels.systemRole}`,
            color: '#2E9CFF',
        },
        {
            label: labels.highRiskConfigSummary,
            value: highRiskUsers.length,
            sub: labels.highRiskConfigSummaryDesc,
            color: '#FFAB24',
        },
    ];

    const governanceLayers = [
        { number: '1', title: labels.rolePermissions, description: labels.rolePermissionOnlyHint, color: '#1E3BFA', background: 'rgba(30,59,250,0.08)' },
        { number: '2', title: labels.organization, description: labels.organizationsPageDesc, color: '#0A9C71', background: 'rgba(12,201,145,0.1)' },
        { number: '3', title: labels.dataScope, description: labels.dataScopeDistributionDesc, color: '#2E9CFF', background: 'rgba(46,156,255,0.1)' },
        { number: '4', title: labels.authorizationBoundary, description: labels.authorizationBoundaryHelp, color: '#D48806', background: 'rgba(255,171,36,0.14)' },
    ];

    return (
        <section aria-labelledby="access-control-overview-title" className="space-y-5">
            <h2 id="access-control-overview-title" className="sr-only">{labels.navOverview}</h2>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {statCards.map((item) => (
                    <div key={item.label} className="min-w-0 rounded-[8px] border border-[#EBEEF5] bg-white px-5 py-4 shadow-none dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex items-center gap-2 text-[12px] text-[#5E5F66] dark:text-slate-400">
                            <span className="h-4 w-[3px] rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="truncate">{item.label}</span>
                        </div>
                        <p className="mt-2 text-[28px] font-semibold leading-8 tabular-nums text-[#0E1114] dark:text-white">{item.value}</p>
                        <p className="mt-2 truncate text-[11px] text-[#B0B2B8]" title={item.sub}>{item.sub}</p>
                    </div>
                ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,1fr)]">
                <div className="rounded-[8px] border border-[#EBEEF5] bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-4 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h3 className="text-[16px] font-semibold text-[#0E1114] dark:text-white">{labels.fourLayerModel}</h3>
                        <p className="text-[12px] leading-5 text-[#B0B2B8]">{labels.usersGovernanceHint}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                        {governanceLayers.map((layer) => (
                            <div key={layer.number} className="min-h-[130px] rounded-[6px] bg-[#F8F8F9] p-4 dark:bg-slate-900/70">
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[14px] font-semibold" style={{ color: layer.color, backgroundColor: layer.background }}>
                                    {layer.number}
                                </span>
                                <h4 className="mt-3 text-[14px] font-semibold text-[#0E1114] dark:text-white">{layer.title}</h4>
                                <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-[#86888F]">{layer.description}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-[8px] border border-[#EBEEF5] bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
                    <h3 className="text-[16px] font-semibold text-[#0E1114] dark:text-white">{labels.dataScopeDistribution}</h3>
                    <div className="mt-4 space-y-4">
                        {DATA_SCOPE_OPTIONS.map((scope) => {
                            const count = scopeCounts[scope] || 0;
                            return (
                                <div key={scope}>
                                    <div className="mb-1.5 flex items-center justify-between gap-3 text-[12px]">
                                        <span className="text-[#33353D] dark:text-slate-300">{getDataScopeLabel(scope, labels)}</span>
                                        <span className="shrink-0 tabular-nums text-[#86888F]">{count}</span>
                                    </div>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-[#F2F3F5] dark:bg-slate-800">
                                        <div
                                            className="h-full rounded-full transition-[width]"
                                            style={{ width: `${Math.max(count ? 8 : 0, (count / maxScopeCount) * 100)}%`, backgroundColor: SCOPE_COLORS[scope] }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="rounded-[8px] border border-[#EBEEF5] bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-[16px] font-semibold text-[#0E1114] dark:text-white">{labels.highRiskConfigSummary}</h3>
                    <p className="text-[12px] leading-5 text-[#B0B2B8]">{labels.highRiskConfigSummaryDesc}</p>
                </div>
                {highRiskUsers.length === 0 ? (
                    <div className="flex min-h-24 items-center justify-center text-[12px] text-[#86888F]">{labels.noHighRiskUsers}</div>
                ) : (
                    <div className="mt-4 flex flex-wrap gap-3">
                        {highRiskUsers.slice(0, 8).map((user, index) => {
                            const riskyPermissions = user.effective_permission_keys
                                .filter((permissionKey) => CONFIG_PERMISSION_KEYS.includes(permissionKey))
                                .map((permissionKey) => permissionMap.get(permissionKey)?.name || permissionKey);
                            return (
                                <div key={user.user_code} className="flex min-w-[230px] max-w-[340px] items-center gap-3 rounded-[6px] border border-[#EBEEF5] px-3 py-2.5 dark:border-slate-800">
                                    <span className={cn(
                                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-medium text-white',
                                        index % 3 === 0 ? 'bg-[#7B61FF]' : index % 3 === 1 ? 'bg-[#0CC991]' : 'bg-[#1E3BFA]',
                                    )}>
                                        {(user.display_name || user.user_code).slice(0, 1)}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate text-[12px] font-medium text-[#0E1114] dark:text-white">{user.display_name}</p>
                                        <div className="mt-1">
                                            <CompactBadgeList
                                                items={user.is_super_admin ? [labels.superAdmin] : riskyPermissions}
                                                max={2}
                                                emptyLabel={labels.configPermissionNone}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}
