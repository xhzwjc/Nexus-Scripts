'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Copy, Loader2, RefreshCw, Shield } from 'lucide-react';
import { toast } from '@/lib/toast';
import { authenticatedFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { AccessControlView, ScriptHubRbacOverview } from '@/lib/types';
import { AccessControlTabs } from './AccessControlTabs';

interface AccessControlCenterProps {
    onBack: () => void;
}

function AccessControlViewLoading() {
    return (
        <div className="flex min-h-[360px] items-center justify-center rounded-lg border bg-card text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        </div>
    );
}

const AccessControlOverviewPage = dynamic(
    () => import('./AccessControlOverviewPage').then((module) => module.AccessControlOverviewPage),
    { loading: AccessControlViewLoading },
);
const AccessControlUsersPage = dynamic(
    () => import('./AccessControlUsersPage').then((module) => module.AccessControlUsersPage),
    { loading: AccessControlViewLoading },
);
const AccessControlOrganizationsPage = dynamic(
    () => import('./AccessControlOrganizationsPage').then((module) => module.AccessControlOrganizationsPage),
    { loading: AccessControlViewLoading },
);
const AccessControlRolesPage = dynamic(
    () => import('./AccessControlRolesPage').then((module) => module.AccessControlRolesPage),
    { loading: AccessControlViewLoading },
);
const AccessControlResourcesPage = dynamic(
    () => import('./AccessControlResourcesPage').then((module) => module.AccessControlResourcesPage),
    { loading: AccessControlViewLoading },
);
const AccessControlAuditPage = dynamic(
    () => import('./AccessControlAuditPage').then((module) => module.AccessControlAuditPage),
    { loading: AccessControlViewLoading },
);

export function AccessControlCenter({ onBack }: AccessControlCenterProps) {
    const { t } = useI18n();
    const [activeView, setActiveView] = useState<AccessControlView>('users');
    const [overview, setOverview] = useState<ScriptHubRbacOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastGeneratedKey, setLastGeneratedKey] = useState<{ userCode: string; accessKey: string } | null>(null);

    const loadOverview = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await authenticatedFetch('/api/admin/rbac/overview', {
                cache: 'no-store',
            });
            const payload = await response.json().catch(() => ({ error: t.accessControl.loadFailed })) as ScriptHubRbacOverview & { error?: string };
            if (!response.ok || payload.error) {
                throw new Error(payload.error || t.accessControl.loadFailed);
            }
            setOverview(payload);
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : t.accessControl.loadFailed;
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [t.accessControl.loadFailed]);

    useEffect(() => {
        void loadOverview();
    }, [loadOverview]);

    const handleCopyKey = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(t.common.copied);
        } catch {
            toast.error(t.common.failed);
        }
    };

    const renderActiveView = () => {
        switch (activeView) {
            case 'overview':
                return <AccessControlOverviewPage overview={overview} labels={t.accessControl} />;
            case 'users':
                return (
                    <AccessControlUsersPage
                        overview={overview}
                        loading={loading}
                        error={error}
                        onReload={loadOverview}
                        onGeneratedKey={setLastGeneratedKey}
                    />
                );
            case 'organizations':
                return (
                    <AccessControlOrganizationsPage
                        overview={overview}
                        loading={loading}
                        error={error}
                        onReload={loadOverview}
                    />
                );
            case 'roles':
                return (
                    <AccessControlRolesPage
                        overview={overview}
                        loading={loading}
                        error={error}
                        onReload={loadOverview}
                    />
                );
            case 'resources':
                return <AccessControlResourcesPage />;
            case 'audit':
                return (
                    <AccessControlAuditPage
                        overview={overview}
                        loading={loading}
                        error={error}
                        onReload={loadOverview}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="min-h-full bg-muted/20">
            <div className="border-b bg-background">
                <div className="space-y-4 px-6 py-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-start gap-3">
                            <Button variant="ghost" size="icon" onClick={onBack}>
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Shield className="h-5 w-5 text-teal-600" />
                                    <h1 className="text-2xl font-semibold">{t.accessControl.title}</h1>
                                    <Badge variant="outline">{t.accessControl.governanceConsole}</Badge>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">{t.accessControl.subtitle}</p>
                            </div>
                        </div>
                        <Button variant="outline" onClick={() => void loadOverview()} disabled={loading}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            {t.accessControl.refresh}
                        </Button>
                    </div>
                    <AccessControlTabs value={activeView} labels={t.accessControl} onChange={setActiveView} />
                </div>
            </div>

            <main className="space-y-4 p-6">
                {lastGeneratedKey && (
                    <Card className="border-teal-200 bg-teal-50/70 dark:border-teal-900 dark:bg-teal-950/20">
                        <CardContent className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <p className="text-sm font-medium text-teal-800 dark:text-teal-200">
                                    {t.accessControl.generatedKey}: <span className="font-mono">{lastGeneratedKey.userCode}</span>
                                </p>
                                <p className="mt-1 font-mono text-sm text-teal-900 dark:text-teal-100">{lastGeneratedKey.accessKey}</p>
                                <p className="mt-2 text-xs text-teal-700 dark:text-teal-300">{t.accessControl.generatedKeyHint}</p>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => void handleCopyKey(lastGeneratedKey.accessKey)}>
                                    <Copy className="h-4 w-4" />
                                    {t.accessControl.copyKey}
                                </Button>
                                <Button variant="ghost" onClick={() => setLastGeneratedKey(null)}>
                                    {t.accessControl.close}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {renderActiveView()}
            </main>
        </div>
    );
}
