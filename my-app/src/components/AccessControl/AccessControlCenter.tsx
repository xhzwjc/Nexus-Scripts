'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Copy, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import type { AccessControlView } from '@/lib/types';
import { AccessControlTabs } from './AccessControlTabs';
import { invalidateRbacCache } from './accessControlQuery';

function AccessControlViewLoading() {
    return (
        <div className="flex min-h-[360px] items-center justify-center rounded-[8px] border border-[#EBEEF5] bg-white text-[12px] text-[#86888F] dark:border-slate-800 dark:bg-slate-950">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
const AccessControlAuditPage = dynamic(
    () => import('./AccessControlAuditPage').then((module) => module.AccessControlAuditPage),
    { loading: AccessControlViewLoading },
);

export function AccessControlCenter() {
    const { t } = useI18n();
    const [activeView, setActiveView] = useState<AccessControlView>('users');
    const [refreshToken, setRefreshToken] = useState(0);
    const [lastGeneratedKey, setLastGeneratedKey] = useState<{ userCode: string; accessKey: string } | null>(null);

    const handleCopyKey = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(t.common.copied);
        } catch {
            toast.error(t.common.failed);
        }
    };

    const handleRefresh = () => {
        invalidateRbacCache();
        setRefreshToken((current) => current + 1);
    };

    const renderActiveView = () => {
        switch (activeView) {
            case 'overview':
                return <AccessControlOverviewPage labels={t.accessControl} refreshToken={refreshToken} />;
            case 'users':
                return (
                    <AccessControlUsersPage
                        refreshToken={refreshToken}
                        onGeneratedKey={setLastGeneratedKey}
                    />
                );
            case 'organizations':
                return (
                    <AccessControlOrganizationsPage
                        refreshToken={refreshToken}
                    />
                );
            case 'roles':
                return (
                    <AccessControlRolesPage
                        refreshToken={refreshToken}
                    />
                );
            case 'audit':
                return (
                    <AccessControlAuditPage
                        refreshToken={refreshToken}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="h-full min-h-0 overflow-y-auto bg-white text-[#0E1114] dark:bg-slate-950 dark:text-slate-100">
            <div className="min-h-full px-5 pb-12 pt-4 lg:px-8 2xl:px-10">
                <div className="mx-auto w-full max-w-[1680px]">
                    <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-[#1E3BFA] text-white" aria-hidden="true">
                                <ShieldCheck className="h-4 w-4" />
                            </span>
                            <h1 className="text-[18px] font-semibold leading-7 text-[#0E1114] dark:text-white">{t.accessControl.title}</h1>
                            <span className="inline-flex h-[22px] items-center rounded-[4px] bg-[rgba(30,59,250,0.08)] px-2 text-[11px] text-[#0F23D9]">
                                {t.accessControl.governanceConsole}
                            </span>
                            <p className="min-w-0 text-[12px] leading-5 text-[#B0B2B8] dark:text-slate-400">{t.accessControl.subtitle}</p>
                        </div>
                        <div className="flex shrink-0 items-center">
                            <Button
                                variant="outline"
                                title={t.accessControl.refresh}
                                aria-label={t.accessControl.refresh}
                                className="h-9 rounded-[6px] border-[#E6E7EB] bg-white px-4 text-[12px] font-normal text-[#33353D] shadow-none hover:border-[#1E3BFA] hover:bg-[#F7F8FA] hover:text-[#0F23D9] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                                onClick={handleRefresh}
                            >
                                <RefreshCw className="h-3.5 w-3.5" />
                                {t.accessControl.refresh}
                            </Button>
                        </div>
                    </div>

                    <div className="mb-5 min-w-0 overflow-x-auto border-b border-[#F2F3F5] dark:border-slate-800">
                        <AccessControlTabs value={activeView} labels={t.accessControl} onChange={setActiveView} />
                    </div>

                    <div className="space-y-5">
                        {lastGeneratedKey && (
                            <div className="flex flex-col gap-3 rounded-[8px] border border-[rgba(12,201,145,0.28)] bg-[rgba(12,201,145,0.06)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="min-w-0">
                                    <p className="text-[12px] font-medium text-[#0A9C71]">
                                        {t.accessControl.generatedKey} · <span className="font-mono">{lastGeneratedKey.userCode}</span>
                                    </p>
                                    <p className="mt-1 break-all font-mono text-[13px] text-[#0E1114] dark:text-slate-100">{lastGeneratedKey.accessKey}</p>
                                    <p className="mt-1 text-[11px] text-[#5E5F66] dark:text-slate-400">{t.accessControl.generatedKeyHint}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-3 text-[12px] font-normal text-[#0F23D9] shadow-none hover:border-[#1E3BFA] hover:bg-white" onClick={() => void handleCopyKey(lastGeneratedKey.accessKey)}>
                                        <Copy className="h-3.5 w-3.5" />
                                        {t.accessControl.copyKey}
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-[6px] text-[#86888F] hover:bg-white hover:text-[#33353D]" aria-label={t.accessControl.close} onClick={() => setLastGeneratedKey(null)}>
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {renderActiveView()}
                    </div>
                </div>
            </div>
        </div>
    );
}
