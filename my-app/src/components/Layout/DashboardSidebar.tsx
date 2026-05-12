import React from 'react';
import {
    Bot,
    BriefcaseBusiness,
    CheckCircle,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleHelp,
    FolderKanban,
    History,
    LogOut,
    ScanLine,
    ScrollText,
    Server,
    Shield,
    Sparkles,
    Users,
    Wrench,
} from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { recruitmentNavBus, navigateToRecruitmentPage } from '@/lib/recruitmentNavBus';
import type { User, ViewType } from '@/lib/types';

interface SidebarProps {
    currentView: string;
    setCurrentView: (view: ViewType) => void;
    setSelectedSystem: (sys: string) => void;
    setScriptQuery: (q: string) => void;
    setShowLogoutConfirm: (show: boolean) => void;
    setRecruitmentInitialPage?: (page: string) => void;
    currentUser: User | null;
}

export const DashboardSidebar: React.FC<SidebarProps> = ({
    currentView,
    setCurrentView,
    setSelectedSystem,
    setScriptQuery,
    setShowLogoutConfirm,
    setRecruitmentInitialPage,
    currentUser,
}) => {
    const { t, language } = useI18n();
    const [collapsed, setCollapsed] = React.useState(false);
    const [aiRecruitmentExpanded, setAiRecruitmentExpanded] = React.useState(false);
    const [activeRecruitmentPage, setActiveRecruitmentPage] = React.useState<string | null>(null);
    const [recruitmentPopoverOpen, setRecruitmentPopoverOpen] = React.useState(false);
    const userLandingPage = currentUser?.landingPage || 'home';
    const homeNavView: ViewType = userLandingPage === 'welcome' ? 'welcome' : 'home';
    const homeNavLabel = userLandingPage === 'welcome'
        ? (language === 'en-US' ? 'Welcome' : '欢迎')
        : t.nav.home;

    // AI 招聘模块权限
    const canAccessRecruitment = Boolean(currentUser?.permissions?.['ai-recruitment']);
    const canManagePosition = Boolean(currentUser?.permissions?.['recruitment-position-manage']);
    const canManageCandidate = Boolean(currentUser?.permissions?.['recruitment-candidate-manage']);
    const canViewLog = Boolean(currentUser?.permissions?.['recruitment-log-view']);
    const inRecruitmentView = currentView === 'ai-recruitment';

    // 监听来自 RecruitmentAutomationContainer 的页面切换事件
    React.useEffect(() => {
        const handler = (e: Event) => {
            setActiveRecruitmentPage((e as CustomEvent).detail as string);
        };
        recruitmentNavBus.addEventListener('navigate', handler);
        return () => recruitmentNavBus.removeEventListener('navigate', handler);
    }, []);

    // 离开 AI 招聘时重置展开状态和选中子项；挂载时若已在 AI 招聘也重置（热更新后同步）
    React.useEffect(() => {
        const isEntering = currentView === 'ai-recruitment';
        if (!isEntering) {
            setAiRecruitmentExpanded(false);
            setActiveRecruitmentPage(null);
        }
    }, [currentView]);

    const recruitmentSubItems = [
        { key: 'workspace', label: t.nav.aiRecruitmentWorkspace, icon: <FolderKanban className="h-4 w-4" /> },
        ...(canManagePosition ? [{ key: 'positions', label: t.nav.aiRecruitmentPositions, icon: <BriefcaseBusiness className="h-4 w-4" /> }] : []),
        ...(canManageCandidate ? [{ key: 'candidates', label: t.nav.aiRecruitmentCandidates, icon: <Users className="h-4 w-4" /> }] : []),
        ...(canViewLog ? [{ key: 'audit', label: t.nav.aiRecruitmentAudit, icon: <History className="h-4 w-4" /> }] : []),
        { key: 'assistant', label: t.nav.aiRecruitmentAssistant, icon: <Bot className="h-4 w-4" /> },
    ];

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
        <div className={cn('relative h-screen shrink-0', collapsed ? 'w-[76px]' : 'w-[210px]')}>
            <aside
                className={cn(
                    'dashboard-sidebar h-screen flex flex-col overflow-hidden border-r border-[var(--sidebar-border)] bg-[var(--glass-bg)] py-6 shadow-sm',
                    collapsed ? 'px-3' : 'px-4',
                    collapsed && 'collapsed',
                )}
            >
                <div className={cn('mb-6 flex shrink-0 items-center', collapsed ? 'justify-center px-0' : 'gap-2.5 px-3')}>
                    <img src="/logo.png" alt="Logo" className="h-10 w-auto object-contain" />
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
                                        active: currentView === 'home' || currentView === 'welcome',
                                        label: homeNavLabel,
                                        icon: (
                                            <div className={`flex h-5 w-5 items-center justify-center ${currentView === 'home' || currentView === 'welcome' ? 'text-teal-600' : 'text-current'}`}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                                                </svg>
                                            </div>
                                        ),
                                        onClick: () => setCurrentView(homeNavView),
                                    })}
                                    {currentUser?.permissions &&
                                     ['settlement', 'commission', 'balance', 'task-automation',
                                      'sms_operations_center', 'tax-reporting', 'tax-calculation',
                                      'settlement-sim', 'payment-stats', 'delivery-tool', 'biz-scene', 'biz-task'
                                     ].some(p => currentUser.permissions[p])
                                        ? renderNavItem({
                                            active: currentView === 'system',
                                            label: t.nav.cmTools,
                                            icon: <Wrench className="h-[18px] w-[18px]" />,
                                            onClick: () => {
                                                setSelectedSystem('chunmiao');
                                                setScriptQuery('');
                                                setCurrentView('system');
                                            },
                                        })
                                        : null}
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
                                    {canAccessRecruitment ? (
                                        collapsed ? (
                                            <Popover open={recruitmentPopoverOpen} onOpenChange={setRecruitmentPopoverOpen}>
                                                <PopoverTrigger asChild>
                                                    <div
                                                        className={navItemClass(inRecruitmentView)}
                                                    >
                                                        <BriefcaseBusiness className="h-[18px] w-[18px]" />
                                                    </div>
                                                </PopoverTrigger>
                                                <PopoverContent side="right" align="start" sideOffset={8} className="w-40 p-1">
                                                    {recruitmentSubItems.map((item) => (
                                                        <button
                                                            key={item.key}
                                                            type="button"
                                                            onClick={() => {
                                                                setRecruitmentPopoverOpen(false);
                                                                setRecruitmentInitialPage?.(item.key);
                                                                setCurrentView('ai-recruitment');
                                                                setActiveRecruitmentPage(item.key);
                                                                setAiRecruitmentExpanded(true);
                                                            }}
                                                            className={cn(
                                                                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors',
                                                                activeRecruitmentPage === item.key
                                                                    ? 'bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                                                                    : 'hover:bg-accent',
                                                            )}
                                                        >
                                                            {item.icon}
                                                            <span>{item.label}</span>
                                                        </button>
                                                    ))}
                                                </PopoverContent>
                                            </Popover>
                                        ) : (
                                            <div className="space-y-1">
                                                <div
                                                    className={navItemClass(inRecruitmentView || Boolean(activeRecruitmentPage))}
                                                    onClick={() => {
                                                        setRecruitmentInitialPage?.('workspace');
                                                        setCurrentView('ai-recruitment');
                                                        setActiveRecruitmentPage('workspace');
                                                        setAiRecruitmentExpanded(true);
                                                        navigateToRecruitmentPage('workspace');
                                                    }}
                                                >
                                                    <BriefcaseBusiness className="h-[18px] w-[18px]" />
                                                    <span>{t.nav.aiRecruitment}</span>
                                                    <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', aiRecruitmentExpanded && 'rotate-180')} />
                                                </div>
                                                {aiRecruitmentExpanded && (
                                                    <div className="ml-3 space-y-0.5 border-l border-slate-200 pl-3 dark:border-slate-700">
                                                        {recruitmentSubItems.map((item) => (
                                                            <div
                                                                key={item.key}
                                                                className={cn(
                                                                    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                                                                    activeRecruitmentPage === item.key
                                                                        ? 'bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                                                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
                                                                )}
                                                                onClick={() => {
                                                                    setRecruitmentInitialPage?.(item.key);
                                                                    setCurrentView('ai-recruitment');
                                                                    setActiveRecruitmentPage(item.key);
                                                                    navigateToRecruitmentPage(item.key);
                                                                }}
                                                            >
                                                                <span className="h-[18px] w-[18px]">{item.icon}</span>
                                                                <span>{item.label}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    ) : null}
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
