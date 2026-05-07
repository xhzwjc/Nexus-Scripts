'use client';

import { Activity, DatabaseZap, ShieldAlert, ShieldCheck, UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DataScope, ScriptHubRbacOverview } from '@/lib/types';
import { CONFIG_PERMISSION_KEYS, DATA_SCOPE_OPTIONS, RESOURCE_DOMAINS } from './constants';
import { CompactBadgeList } from './AccessControlBadges';
import type { AccessControlLabels } from './utils';
import {
    countBy,
    createPermissionMap,
    formatAuditAction,
    formatDateTime,
    getDataScopeLabel,
    getResourceDomainLabel,
    normalizeDataScope,
} from './utils';

interface AccessControlOverviewPageProps {
    overview: ScriptHubRbacOverview | null;
    labels: AccessControlLabels;
}

export function AccessControlOverviewPage({ overview, labels }: AccessControlOverviewPageProps) {
    const users = overview?.users || [];
    const roles = overview?.catalog.roles || [];
    const permissions = overview?.catalog.permissions || [];
    const auditLogs = overview?.audit_logs || [];
    const permissionMap = createPermissionMap(permissions);
    const activeUsers = users.filter((user) => user.is_active).length;
    const systemRoles = roles.filter((role) => role.is_system).length;
    const scopeCounts = countBy(users.map((user) => normalizeDataScope(user.data_scope)));
    const highRiskUsers = users.filter((user) => (
        user.is_super_admin ||
        user.effective_permission_keys.some((permissionKey) => CONFIG_PERMISSION_KEYS.includes(permissionKey))
    ));

    const statCards = [
        { label: labels.totalUsers, value: users.length, icon: UsersRound },
        { label: labels.totalRoles, value: roles.length, icon: ShieldCheck },
        { label: labels.activeUsers, value: activeUsers, icon: Activity },
        { label: labels.systemRoles, value: systemRoles, icon: ShieldAlert },
    ];

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {statCards.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Card key={item.label}>
                            <CardContent className="flex items-center justify-between p-5">
                                <div>
                                    <p className="text-sm text-muted-foreground">{item.label}</p>
                                    <p className="mt-2 text-2xl font-semibold">{item.value}</p>
                                </div>
                                <div className="rounded-lg bg-teal-50 p-3 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300">
                                    <Icon className="h-5 w-5" />
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
                <Card>
                    <CardHeader>
                        <CardTitle>{labels.dataScopeDistribution}</CardTitle>
                        <CardDescription>{labels.dataScopeDistributionDesc}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {DATA_SCOPE_OPTIONS.map((scope) => (
                            <div key={scope} className="flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2">
                                <span className="text-sm">{getDataScopeLabel(scope as DataScope, labels)}</span>
                                <Badge variant="outline">{scopeCounts[scope as DataScope] || 0}</Badge>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{labels.highRiskConfigSummary}</CardTitle>
                        <CardDescription>{labels.highRiskConfigSummaryDesc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {highRiskUsers.length === 0 ? (
                            <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
                                {labels.noHighRiskUsers}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {highRiskUsers.slice(0, 6).map((user) => {
                                    const riskyPermissions = user.effective_permission_keys
                                        .filter((permissionKey) => CONFIG_PERMISSION_KEYS.includes(permissionKey))
                                        .map((permissionKey) => permissionMap.get(permissionKey)?.name || permissionKey);
                                    return (
                                        <div key={user.user_code} className="rounded-md border p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-medium">{user.display_name}</p>
                                                    <p className="font-mono text-xs text-muted-foreground">{user.user_code}</p>
                                                </div>
                                                {user.is_super_admin && <Badge variant="outline">{labels.superAdmin}</Badge>}
                                            </div>
                                            <div className="mt-3">
                                                <CompactBadgeList items={riskyPermissions} max={3} emptyLabel={labels.configPermissionNone} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle>{labels.recentActivityTitle}</CardTitle>
                        <CardDescription>{labels.recentActivityDesc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-72 pr-3">
                            <div className="space-y-3">
                                {auditLogs.length === 0 ? (
                                    <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
                                        {labels.noAuditLogs}
                                    </div>
                                ) : auditLogs.slice(0, 8).map((log) => (
                                    <div key={log.id} className="rounded-md border p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-medium">{formatAuditAction(log.action, labels)}</p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {log.actor_display_name || log.actor_user_code || labels.auditUnknownActor}
                                                </p>
                                            </div>
                                            <Badge variant={log.result === 'success' ? 'default' : 'destructive'}>
                                                {log.result === 'success' ? labels.auditResultSuccess : labels.auditResultFailed}
                                            </Badge>
                                        </div>
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            {formatDateTime(log.created_at) || '-'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{labels.roleDirectorySummary}</CardTitle>
                        <CardDescription>{labels.roleDirectorySummaryDesc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-72 pr-3">
                            <div className="space-y-3">
                                {roles.map((role) => (
                                    <div key={role.code} className="rounded-md border p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-medium">{role.name}</p>
                                                <p className="font-mono text-xs text-muted-foreground">{role.code}</p>
                                            </div>
                                            <Badge variant={role.is_system ? 'secondary' : 'outline'}>
                                                {role.is_system ? labels.systemRole : labels.customRole}
                                            </Badge>
                                        </div>
                                        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                                            <span>{labels.permissionsTitle}: {role.permission_keys.length}</span>
                                            <span>{labels.assignedUsers}: {role.assigned_user_count}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{labels.resourceDomainSummary}</CardTitle>
                        <CardDescription>{labels.resourceDomainSummaryDesc}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {RESOURCE_DOMAINS.map((domain) => (
                            <div key={domain} className="flex items-center justify-between rounded-md border p-3">
                                <div className="flex items-center gap-3">
                                    <div className="rounded-md bg-muted p-2">
                                        <DatabaseZap className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">{getResourceDomainLabel(domain, labels)}</p>
                                        <p className="text-xs text-muted-foreground">{labels.resourceDomainReadyHint}</p>
                                    </div>
                                </div>
                                <Badge variant="outline">{labels.resourceDomainPending}</Badge>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
