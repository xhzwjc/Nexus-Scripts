'use client';

import { CheckCircle, ChevronRight, Cloud, Server, Settings, Terminal } from 'lucide-react';

import { QuickActions } from '@/components/Layout/QuickActions';
import { Badge } from '@/components/ui/badge';
import type { SystemConfig, User, ViewType } from '@/lib/types';
import { useI18n } from '@/lib/i18n';

type HealthCheckState = {
    status: 'idle' | 'loading' | 'success' | 'error';
    healthPercent: number;
    issues: unknown[];
    totalEnvs: number;
    checkedEnvs: number;
};

interface HomeDashboardProps {
    currentUser: User | null;
    now: Date;
    systems: Record<string, SystemConfig>;
    totalScripts: number;
    userKey: string;
    healthCheckState?: HealthCheckState;
    onNavigateToScript: (systemId: string, scriptId: string) => void;
    onOpenSystem: (systemId: string) => void;
    onSetCurrentView: (view: ViewType) => void;
}

export function HomeDashboard({
    currentUser,
    now,
    systems,
    totalScripts,
    userKey,
    healthCheckState,
    onNavigateToScript,
    onOpenSystem,
    onSetCurrentView,
}: HomeDashboardProps) {
    const { t } = useI18n();

    const hour = now.getHours();
    let timeGreeting = t.home.greetingEvening;
    if (hour < 6) timeGreeting = t.home.greetingNight;
    else if (hour < 12) timeGreeting = t.home.greetingMorning;
    else if (hour < 14) timeGreeting = t.home.greetingNoon;
    else if (hour < 18) timeGreeting = t.home.greetingAfternoon;

    return (
        <div className="max-w-7xl">
            <div className="mb-10">
                <h1 className="text-3xl font-bold text-foreground tracking-tight mb-2">
                    {timeGreeting}, {currentUser?.name}.
                </h1>
                <p className="text-muted-foreground text-base">
                    {t.home.systemNormal}
                </p>
            </div>

            <div className="flex items-center gap-4 mb-10">
                <div className="status-badge">
                    <div className="icon bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                        <CheckCircle className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-foreground">{totalScripts}</span>
                    <span className="text-muted-foreground">{t.home.availableResources}</span>
                    <span className="text-primary text-xs ml-1">{t.home.ready}</span>
                </div>

                {(() => {
                    const hasPermission = !!currentUser?.permissions['cert-health'];
                    const isLoading = healthCheckState?.status === 'loading';
                    const isIdle = !healthCheckState || healthCheckState.status === 'idle';
                    const isError = healthCheckState?.status === 'error';
                    const isSuccess = healthCheckState?.status === 'success';
                    const hasIssues = isSuccess && healthCheckState.issues.length > 0;
                    const percent = healthCheckState?.healthPercent ?? 100;

                    if (!hasPermission) {
                        return (
                            <div className="status-badge">
                                <div className="icon bg-green-500/10 text-green-600 dark:text-green-400">
                                    <Server className="w-4 h-4" />
                                </div>
                                <span className="text-muted-foreground">{t.home.systemHealth}</span>
                                <span className="font-semibold text-foreground">100%</span>
                                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-[10px] px-1.5 py-0">{t.home.stable}</Badge>
                            </div>
                        );
                    }

                    if (isLoading || isIdle) {
                        return (
                            <div className="status-badge">
                                <div className="icon bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                    <Server className="w-4 h-4 animate-spin" />
                                </div>
                                <span className="text-muted-foreground">{t.home.systemHealth}</span>
                                <div className="w-8 h-4 bg-muted rounded animate-pulse" />
                                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-[10px] px-1.5 py-0">
                                    {isLoading ? `${healthCheckState.checkedEnvs}/${healthCheckState.totalEnvs}` : t.home.detecting}
                                </Badge>
                            </div>
                        );
                    }

                    if (isError) {
                        return (
                            <div className="status-badge">
                                <div className="icon bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                                    <Server className="w-4 h-4" />
                                </div>
                                <span className="text-muted-foreground">{t.home.systemHealth}</span>
                                <span className="font-semibold text-foreground">--</span>
                                <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-0 text-[10px] px-1.5 py-0">{t.home.detectFailed}</Badge>
                            </div>
                        );
                    }

                    if (hasIssues) {
                        return (
                            <div className="status-badge">
                                <div className={`icon ${percent < 90 ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'}`}>
                                    <Server className="w-4 h-4" />
                                </div>
                                <span className="text-muted-foreground">{t.home.systemHealth}</span>
                                <span className={`font-semibold ${percent < 90 ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                                    {percent}%
                                </span>
                                <Badge className={`border-0 text-[10px] px-1.5 py-0 ${percent < 90 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                                    {healthCheckState.issues.length}{t.home.issues}
                                </Badge>
                            </div>
                        );
                    }

                    return (
                        <div className="status-badge">
                            <div className="icon bg-green-500/10 text-green-600 dark:text-green-400">
                                <Server className="w-4 h-4" />
                            </div>
                            <span className="text-muted-foreground">{t.home.systemHealth}</span>
                            <span className="font-semibold text-foreground">100%</span>
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-[10px] px-1.5 py-0">{t.home.stable}</Badge>
                        </div>
                    );
                })()}

                <div className="status-badge">
                    <div className="icon bg-violet-500/10 text-violet-600 dark:text-violet-400">
                        <Server className="w-4 h-4" />
                    </div>
                    <span className="text-muted-foreground">{t.home.totalExecuted}</span>
                    <span className="font-semibold text-foreground">1.2k</span>
                    <a href="#" className="text-primary text-xs hover:underline">{t.home.completed}</a>
                </div>
            </div>

            <div className="flex gap-6 items-start">
                <div className="flex-[3] grid grid-cols-2 gap-6">
                    <div className="system-card p-6 cursor-pointer flex flex-col h-[280px]" onClick={() => onOpenSystem('chunmiao')}>
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 bg-background border border-[var(--border-subtle)] shadow-sm rounded-xl flex items-center justify-center group-hover:border-primary/50 transition-colors">
                                <Settings className="w-6 h-6 text-primary" />
                            </div>
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800 text-[11px] px-2">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 inline-block"></span>
                                {t.home.cmSystem.running}
                            </Badge>
                        </div>
                        <h3 className="text-xl font-bold text-foreground mb-2">{t.home.cmSystem.title}</h3>
                        <p className="text-muted-foreground text-sm mb-4 leading-relaxed flex-1 overflow-hidden line-clamp-3">
                            {t.home.cmSystem.description.replace('{count}', String(systems.chunmiao.scripts.length))}
                        </p>
                        <button className="btn-teal-gradient w-full mt-auto">
                            {t.home.cmSystem.enterButton}
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {currentUser?.permissions['dev-tools'] && (
                        <div className="system-card p-6 cursor-pointer flex flex-col h-[280px]" onClick={() => onSetCurrentView('dev-tools')}>
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center">
                                    <Terminal className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                                </div>
                                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800 text-[11px] px-2">
                                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-1.5 inline-block"></span>
                                    {t.home.devTools.toolset}
                                </Badge>
                            </div>
                            <h3 className="text-xl font-bold text-foreground mb-2">{t.home.devTools.title}</h3>
                            <p className="text-muted-foreground text-sm mb-4 leading-relaxed flex-1 overflow-hidden">
                                {t.home.devTools.description}
                            </p>
                            <button className="w-full mt-auto flex items-center text-primary hover:text-primary/80 font-medium text-sm transition-colors">
                                {t.home.devTools.enterButton}
                                <ChevronRight className="w-4 h-4 ml-1" />
                            </button>
                        </div>
                    )}

                    <div className="system-card p-6 flex flex-col h-[280px]">
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center">
                                <Cloud className="w-6 h-6 text-muted-foreground" />
                            </div>
                            <Badge variant="outline" className="text-muted-foreground border-border text-[11px] px-2">
                                {t.home.hsSystem.planning}
                            </Badge>
                        </div>
                        <h3 className="text-xl font-bold text-foreground mb-2">{t.home.hsSystem.title}</h3>
                        <p className="text-muted-foreground text-sm mb-4 leading-relaxed flex-1">
                            {t.home.hsSystem.description}
                        </p>
                        <button className="btn-outline-gray w-full mt-auto" disabled>
                            {t.home.hsSystem.enterButton}
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="flex-shrink-0" style={{ width: '280px', minWidth: 0 }}>
                    <QuickActions
                        onNavigateToScript={onNavigateToScript}
                        onNavigateToSystem={() => onOpenSystem('chunmiao')}
                        setCurrentView={onSetCurrentView}
                        userKey={userKey}
                    />
                </div>
            </div>

            <footer className="mt-12 text-center md:text-left">
                <span className="version-badge">ScriptHub v 2.0-stable</span>
            </footer>
        </div>
    );
}
