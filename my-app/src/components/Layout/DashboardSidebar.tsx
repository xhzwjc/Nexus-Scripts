import React from 'react';
import {
    Bot,
    BriefcaseBusiness,
    CheckCircle,
    ChevronLeft,
    ChevronRight,
    CircleHelp,
    LogOut,
    ScanLine,
    ScrollText,
    Server,
    Shield,
    Sparkles,
    Users,
    Wrench,
} from 'lucide-react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { User, ViewType } from '@/lib/types';

interface SidebarProps {
    currentView: string;
    setCurrentView: (view: ViewType) => void;
    setSelectedSystem: (sys: string) => void;
    setScriptQuery: (q: string) => void;
    setShowLogoutConfirm: (show: boolean) => void;
    currentUser: User | null;
}

export const DashboardSidebar: React.FC<SidebarProps> = ({
    currentView,
    setCurrentView,
    setSelectedSystem,
    setScriptQuery,
    setShowLogoutConfirm,
    currentUser,
}) => {
    const { t } = useI18n();
    const [collapsed, setCollapsed] = React.useState(false);

    const navItemClass = (active: boolean, disabled = false) =>
        cn(
            'sidebar-nav-item',
            active ? 'active' : '',
            disabled ? 'disabled' : '',
            collapsed ? 'justify-center px-0 gap-0' : '',
        );

    const renderNavItem = ({
        active,
        label,
        title,
        icon,
        onClick,
        disabled = false,
    }: {
        active: boolean;
        label: string;
        title?: string;
        icon: React.ReactNode;
        onClick?: () => void;
        disabled?: boolean;
    }) => (
        <div
            className={navItemClass(active, disabled)}
            onClick={disabled ? undefined : onClick}
            title={title || label}
        >
            {icon}
            {!collapsed ? <span>{label}</span> : null}
        </div>
    );

    return (
        <div className={cn('relative h-screen shrink-0 transition-[width] duration-300', collapsed ? 'w-[76px]' : 'w-[260px]')}>
            <aside
                className={cn(
                    'dashboard-sidebar h-screen flex flex-col overflow-hidden border-r border-[var(--sidebar-border)] bg-[var(--glass-bg)] py-6 shadow-sm',
                    collapsed ? 'px-3' : 'px-4',
                    collapsed && 'collapsed',
                )}
            >
                <div className={cn('mb-6 flex shrink-0 items-center', collapsed ? 'justify-center px-0' : 'gap-2.5 px-3')}>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 text-sm font-bold text-white shadow-lg">
                        S
                    </div>
                    {!collapsed ? (
                        <span className="text-[15px] font-semibold text-[var(--text-primary)]">
                            ScriptHub <span className="font-normal text-[var(--text-secondary)]">Dashboard</span>
                        </span>
                    ) : null}
                </div>

                <div className="flex min-h-0 flex-1 flex-col">
                    <ScrollArea className={cn('min-h-0 flex-1', collapsed ? 'pr-0' : 'pr-1')}>
                        <div className="space-y-6 pb-4">
                            <div>
                                {!collapsed ? (
                                    <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                                        {t.nav.workspace}
                                    </p>
                                ) : null}
                                <nav className="space-y-1">
                                    {renderNavItem({
                                        active: currentView === 'home',
                                        label: t.nav.home,
                                        icon: (
                                            <div className={`flex h-5 w-5 items-center justify-center ${currentView === 'home' ? 'text-teal-600' : 'text-current'}`}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                                                </svg>
                                            </div>
                                        ),
                                        onClick: () => setCurrentView('home'),
                                    })}
                                    {renderNavItem({
                                        active: currentView === 'system',
                                        label: t.nav.cmTools,
                                        icon: <Wrench className="h-[18px] w-[18px]" />,
                                        onClick: () => {
                                            setSelectedSystem('chunmiao');
                                            setScriptQuery('');
                                            setCurrentView('system');
                                        },
                                    })}
                                    {currentUser?.permissions['ocr-tool']
                                        ? renderNavItem({
                                            active: currentView === 'ocr-tool',
                                            label: t.nav.ocrTool,
                                            icon: <ScanLine className="h-[18px] w-[18px]" />,
                                            onClick: () => setCurrentView('ocr-tool'),
                                        })
                                        : null}
                                    {currentUser?.permissions['server-monitoring']
                                        ? renderNavItem({
                                            active: currentView === 'ops-center',
                                            label: t.nav.opsCenter,
                                            icon: <Server className="h-[18px] w-[18px]" />,
                                            onClick: () => setCurrentView('ops-center'),
                                        })
                                        : null}
                                    {currentUser?.permissions['team-resources']
                                        ? renderNavItem({
                                            active: currentView === 'team-resources',
                                            label: t.nav.teamResources,
                                            icon: <Users className="h-[18px] w-[18px]" />,
                                            onClick: () => setCurrentView('team-resources'),
                                        })
                                        : null}
                                    {currentUser?.permissions['ai-resources']
                                        ? renderNavItem({
                                            active: currentView === 'ai-resources',
                                            label: t.nav.aiResources,
                                            icon: <Sparkles className="h-[18px] w-[18px]" />,
                                            onClick: () => setCurrentView('ai-resources'),
                                        })
                                        : null}
                                    {currentUser?.permissions['agent-chat']
                                        ? renderNavItem({
                                            active: currentView === 'agent-chat',
                                            label: t.agentChat.navLabel,
                                            icon: <Bot className="h-[18px] w-[18px]" />,
                                            onClick: () => setCurrentView('agent-chat'),
                                        })
                                        : null}
                                    {currentUser?.permissions['ai-recruitment']
                                        ? renderNavItem({
                                            active: currentView === 'ai-recruitment',
                                            label: 'AI 招聘',
                                            icon: <BriefcaseBusiness className="h-[18px] w-[18px]" />,
                                            onClick: () => setCurrentView('ai-recruitment'),
                                        })
                                        : null}
                                    {currentUser?.permissions['rbac-manage']
                                        ? renderNavItem({
                                            active: currentView === 'access-control',
                                            label: t.nav.accessControl,
                                            icon: <Shield className="h-[18px] w-[18px]" />,
                                            onClick: () => setCurrentView('access-control'),
                                        })
                                        : null}
                                </nav>
                            </div>

                            <div className="space-y-3">
                                {!collapsed ? (
                                    <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                                        {t.nav.support}
                                    </p>
                                ) : null}
                                <nav className="space-y-1">
                                    {renderNavItem({
                                        active: currentView === 'help',
                                        label: t.nav.helpCenter,
                                        icon: <CircleHelp className="h-[18px] w-[18px]" />,
                                        onClick: () => setCurrentView('help'),
                                    })}
                                    {renderNavItem({
                                        active: false,
                                        label: t.nav.systemLogs,
                                        icon: <ScrollText className="h-[18px] w-[18px]" />,
                                        disabled: true,
                                    })}
                                </nav>
                            </div>

                            <div className="space-y-3">
                                {!collapsed ? (
                                    <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                                        {t.nav.account}
                                    </p>
                                ) : null}
                                <nav className="space-y-1">
                                    {renderNavItem({
                                        active: false,
                                        label: t.nav.logout,
                                        icon: <LogOut className="h-[18px] w-[18px]" />,
                                        onClick: () => setShowLogoutConfirm(true),
                                    })}
                                </nav>
                            </div>
                        </div>
                    </ScrollArea>

                    <Separator className="my-4 shrink-0 bg-[var(--border-subtle)]" />

                    <div className={cn('shrink-0 rounded-2xl border border-[var(--border-subtle)] bg-[var(--glass-bg-solid)] shadow-sm', collapsed ? 'px-2 py-3' : 'px-4 py-4')}>
                        <div className={cn('flex items-center gap-3', collapsed ? 'justify-center' : 'justify-between')}>
                            <div className="flex items-center gap-3">
                                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-teal-500" />
                                {!collapsed ? (
                                    <div>
                                        <p className="text-[13px] font-medium text-[var(--text-primary)]">{t.nav.systemRunning}</p>
                                        <p className="text-[12px] text-[var(--text-secondary)]">ScriptHub v2.0-stable</p>
                                    </div>
                                ) : null}
                            </div>
                            {!collapsed ? <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)]" /> : null}
                        </div>
                        {!collapsed ? (
                            <div className="mt-4 grid gap-2 text-[12px] text-[var(--text-secondary)]">
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                    <span>{t.nav.allNodesOnline}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Server className="h-4 w-4 text-[var(--text-tertiary)]" />
                                    <span>{t.nav.serviceNormal}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-3 flex justify-center">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            <button
                type="button"
                onClick={() => setCollapsed((current) => !current)}
                className="absolute right-0 top-1/2 z-30 h-10 w-5 -translate-y-1/2 translate-x-1/2 rounded-full border border-[var(--sidebar-border)] bg-[var(--glass-bg-solid)] text-[var(--text-secondary)] shadow-sm backdrop-blur-xl transition-colors hover:bg-[var(--sidebar-accent)]"
                title={collapsed ? '展开系统菜单' : '收起系统菜单'}
            >
                {collapsed ? <ChevronRight className="mx-auto h-3.5 w-3.5" /> : <ChevronLeft className="mx-auto h-3.5 w-3.5" />}
            </button>
        </div>
    );
};
