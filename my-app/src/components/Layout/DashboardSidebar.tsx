import React from 'react';
import {
    Bot,
    BriefcaseBusiness,
    ChevronDown,
    CircleHelp,
    FolderKanban,
    History,
    LogOut,
    PanelLeft,
    ScanLine,
    ScrollText,
    Server,
    Shield,
    Sparkles,
    Users,
    Wrench,
} from 'lucide-react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import {
    navigateToRecruitmentPage,
    recruitmentNavBus,
    resolveRecruitmentPageDetail,
} from '@/lib/recruitmentNavBus';
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

const SIDEBAR_PINNED_STORAGE_KEY = 'scripts.dashboard.sidebarPinned';
const SIDEBAR_COMPACT_WIDTH = 72;
const SIDEBAR_EXPANDED_WIDTH = 210;

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
    const [sidebarPinned, setSidebarPinned] = React.useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return window.localStorage.getItem(SIDEBAR_PINNED_STORAGE_KEY) === 'true';
    });
    const [hoverExpanded, setHoverExpanded] = React.useState(false);
    const [aiRecruitmentExpanded, setAiRecruitmentExpanded] = React.useState(false);
    const [activeRecruitmentPage, setActiveRecruitmentPage] = React.useState<string | null>(null);
    const userLandingPage = currentUser?.landingPage || 'home';
    const homeNavView: ViewType = userLandingPage === 'welcome' ? 'welcome' : 'home';
    const homeNavLabel = userLandingPage === 'welcome'
        ? (language === 'en-US' ? 'Welcome' : '欢迎')
        : t.nav.home;
    const sidebarExpanded = sidebarPinned || hoverExpanded;
    const collapsed = !sidebarExpanded;
    const sidebarShellWidth = sidebarPinned ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COMPACT_WIDTH;
    const sidebarPanelWidth = sidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COMPACT_WIDTH;
    const sidebarPreviewExpanded = !sidebarPinned && hoverExpanded;
    const pinButtonLabel = sidebarPinned ? '取消固定导航' : '固定导航';

    // AI 招聘模块权限
    const canAccessRecruitment = Boolean(currentUser?.permissions?.['ai-recruitment']);
    const canManagePosition = Boolean(currentUser?.permissions?.['recruitment-position-manage']);
    const canManageCandidate = Boolean(currentUser?.permissions?.['recruitment-candidate-manage']);
    const canViewLog = Boolean(currentUser?.permissions?.['recruitment-log-view']);
    const inRecruitmentView = currentView === 'ai-recruitment';

    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(SIDEBAR_PINNED_STORAGE_KEY, sidebarPinned ? 'true' : 'false');
    }, [sidebarPinned]);

    // 监听来自 RecruitmentAutomationContainer 的页面切换事件
    React.useEffect(() => {
        const handler = (e: Event) => {
            setActiveRecruitmentPage(resolveRecruitmentPageDetail((e as CustomEvent).detail));
        };
        recruitmentNavBus.addEventListener('navigate', handler);
        recruitmentNavBus.addEventListener('page-sync', handler);
        return () => {
            recruitmentNavBus.removeEventListener('navigate', handler);
            recruitmentNavBus.removeEventListener('page-sync', handler);
        };
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
        ...(canManageCandidate ? [{ key: 'talent-pool', label: t.nav.aiRecruitmentTalentPool, icon: <Users className="h-4 w-4" /> }] : []),
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

    const toggleSidebarPinned = () => {
        setSidebarPinned((current) => {
            const next = !current;
            if (next) {
                setHoverExpanded(false);
            }
            return next;
        });
    };

    return (
        <div
            className="dashboard-sidebar-shell relative h-screen shrink-0"
            style={{ width: sidebarShellWidth }}
            onMouseEnter={() => {
                if (!sidebarPinned) setHoverExpanded(true);
            }}
            onMouseLeave={() => {
                if (!sidebarPinned) setHoverExpanded(false);
            }}
        >
            <aside
                className={cn(
                    'dashboard-sidebar absolute left-0 top-0 z-30 h-screen flex flex-col overflow-hidden border-r border-[var(--sidebar-border)] py-6 shadow-sm',
                    collapsed ? 'px-3' : 'px-4',
                    collapsed && 'collapsed',
                    sidebarPreviewExpanded && 'preview-expanded',
                )}
                style={{ width: sidebarPanelWidth }}
            >
                <div className={cn('mb-6 flex shrink-0 items-center', collapsed ? 'justify-center px-0' : 'gap-2.5 px-3')}>
                    <img src="/logo.png" alt="Logo" className="h-10 w-auto object-contain" />
                </div>

                <div className="flex min-h-0 flex-1 flex-col">
                    <ScrollArea className={cn('min-h-0 flex-1', collapsed ? 'pr-0' : 'pr-1')}>
                        <div className="space-y-6 pb-4">
                            <div>
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
                                        <div className="space-y-1">
                                            <div
                                                className={navItemClass(inRecruitmentView || Boolean(activeRecruitmentPage) || aiRecruitmentExpanded)}
                                                onClick={() => {
                                                    if (collapsed) {
                                                        setHoverExpanded(true);
                                                        return;
                                                    }
                                                    setAiRecruitmentExpanded((expanded) => !expanded);
                                                }}
                                                title={t.nav.aiRecruitment}
                                            >
                                                <BriefcaseBusiness className="h-[18px] w-[18px]" />
                                                {!collapsed ? <span>{t.nav.aiRecruitment}</span> : null}
                                                {!collapsed ? <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', aiRecruitmentExpanded && 'rotate-180')} /> : null}
                                            </div>
                                            {!collapsed && aiRecruitmentExpanded && (
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

                    <div className={cn('mt-3 flex shrink-0', collapsed ? 'justify-end pb-6 pr-1' : 'justify-end pb-2')}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    onClick={toggleSidebarPinned}
                                    className={cn(
                                        'dashboard-sidebar-pin-button inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50',
                                        sidebarPinned
                                            ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200'
                                            : 'border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--sidebar-border)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--text-primary)]',
                                    )}
                                    aria-label={pinButtonLabel}
                                >
                                    <PanelLeft className="h-4 w-4" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent
                                side={collapsed ? 'right' : 'top'}
                                sideOffset={8}
                                className="rounded-md border border-slate-200 bg-slate-950 px-2.5 py-1.5 text-xs text-white shadow-lg dark:border-slate-700"
                            >
                                {pinButtonLabel}
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </div>
            </aside>
        </div>
    );
};
