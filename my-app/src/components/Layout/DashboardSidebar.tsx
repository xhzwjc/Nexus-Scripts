import React from 'react';
import {
    Bot,
    BriefcaseBusiness,
    CalendarCheck,
    ChevronDown,
    CircleHelp,
    ClipboardCheck,
    FolderKanban,
    History,
    Home,
    PanelLeft,
    ScanLine,
    ScrollText,
    Server,
    Settings2,
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
    selectedSystem: string;
    setCurrentView: (view: ViewType) => void;
    setSelectedSystem: (sys: string) => void;
    setScriptQuery: (q: string) => void;
    setRecruitmentInitialPage?: (page: string) => void;
    currentUser: User | null;
}

type RecruitmentSidebarItem = {
    key: string;
    page: string;
    label: string;
    icon: React.ReactNode;
    activePages?: string[];
};

const SIDEBAR_PINNED_STORAGE_KEY = 'scripts.dashboard.sidebarPinned';
const SIDEBAR_COMPACT_WIDTH = 72;
const SIDEBAR_EXPANDED_WIDTH = 200;
const CM_PERMISSION_KEYS = [
    'settlement',
    'commission',
    'balance',
    'task-automation',
    'sms_operations_center',
    'tax-reporting',
    'tax-calculation',
    'settlement-sim',
    'payment-stats',
    'delivery-tool',
    'biz-scene',
    'biz-task',
];

export const DashboardSidebar: React.FC<SidebarProps> = ({
    currentView,
    selectedSystem,
    setCurrentView,
    setSelectedSystem,
    setScriptQuery,
    setRecruitmentInitialPage,
    currentUser,
}) => {
    const { t, language } = useI18n();
    const [sidebarPinned, setSidebarPinned] = React.useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        const stored = window.localStorage.getItem(SIDEBAR_PINNED_STORAGE_KEY);
        return stored === null ? true : stored === 'true';
    });
    const [hoverExpanded, setHoverExpanded] = React.useState(false);
    const [aiRecruitmentExpanded, setAiRecruitmentExpanded] = React.useState(false);
    const [activeRecruitmentPage, setActiveRecruitmentPage] = React.useState<string | null>(null);
    const userLandingPage = currentUser?.landingPage || 'home';
    const showLandingNavigation = currentUser?.landingPage !== '';
    const homeNavView: ViewType = userLandingPage === 'welcome' ? 'welcome' : 'home';
    const homeNavLabel = userLandingPage === 'welcome'
        ? (language === 'en-US' ? 'Welcome' : '欢迎')
        : t.nav.home;
    const sidebarExpanded = sidebarPinned || hoverExpanded;
    const collapsed = !sidebarExpanded;
    const sidebarShellWidth = sidebarPinned ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COMPACT_WIDTH;
    const sidebarPanelWidth = sidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COMPACT_WIDTH;
    const sidebarPreviewExpanded = !sidebarPinned && hoverExpanded;
    const pinButtonLabel = sidebarPinned
        ? (language === 'zh-CN' ? '收起导航' : 'Collapse navigation')
        : (language === 'zh-CN' ? '固定展开导航' : 'Pin expanded navigation');
    const permissions = currentUser?.permissions || {};

    const canAccessRecruitment = Boolean(permissions['ai-recruitment']);
    const useGroupedRecruitmentMenu = currentUser?.recruitmentMenuGrouped !== false;
    const canManagePosition = Boolean(permissions['recruitment-position-manage']);
    const canManageCandidate = Boolean(permissions['recruitment-candidate-manage']);
    const canViewTalentPool = Boolean(permissions['recruitment-talent-pool-view']);
    const canViewRecruitmentAssistant = Boolean(permissions['recruitment-assistant-view']);
    const canManageReview = Boolean(permissions['recruitment-review-manage']);
    const canManageInterview = Boolean(permissions['recruitment-interview-manage']);
    const canUseRecruitmentWorkspace = Boolean(
        permissions['recruitment-dashboard-view']
        || permissions['recruitment-process-execute']
        || canManagePosition
        || canManageCandidate
        || permissions['recruitment-log-view']
    );
    const canUseReviewWorkbench = Boolean(permissions['recruitment-review-view'] || permissions['recruitment-review-act']);
    const canUseInterviewWorkbench = Boolean(
        permissions['recruitment-interview-view']
        || permissions['recruitment-interview-act']
        || canManageInterview
    );
    const canViewLog = Boolean(permissions['recruitment-log-view']);
    const canUseSkillSettings = Boolean(permissions['recruitment-skill-view'] || permissions['recruitment-skill-manage']);
    const canUseModelSettings = Boolean(permissions['recruitment-llm-config-view'] || permissions['recruitment-llm-config-manage']);
    const canUseMailSettings = Boolean(
        permissions['recruitment-mail-view']
        || permissions['recruitment-mail-config-manage']
        || permissions['recruitment-mail-sender-manage']
    );
    const canUseRecruitmentSettings = canUseSkillSettings || canUseModelSettings || canUseMailSettings;
    const recruitmentSettingsTarget = canUseMailSettings
        ? 'settings-mail'
        : (canUseModelSettings ? 'settings-models' : 'settings-skills');
    const inRecruitmentView = currentView === 'ai-recruitment';
    const reviewWorkbenchLabel = canManageReview
        ? t.nav.aiRecruitmentReviewWorkbench
        : (language === 'en-US' ? 'Resume Review' : '筛选简历');
    const interviewWorkbenchLabel = canManageInterview
        ? (language === 'en-US' ? 'Interview Scheduling' : '面试安排')
        : (language === 'en-US' ? 'My Interviews' : '我的面试');

    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(SIDEBAR_PINNED_STORAGE_KEY, sidebarPinned ? 'true' : 'false');
    }, [sidebarPinned]);

    React.useEffect(() => {
        const handler = (event: Event) => {
            setActiveRecruitmentPage(resolveRecruitmentPageDetail((event as CustomEvent).detail));
        };
        recruitmentNavBus.addEventListener('navigate', handler);
        recruitmentNavBus.addEventListener('page-sync', handler);
        return () => {
            recruitmentNavBus.removeEventListener('navigate', handler);
            recruitmentNavBus.removeEventListener('page-sync', handler);
        };
    }, []);

    React.useEffect(() => {
        if (currentView === 'ai-recruitment') {
            if (useGroupedRecruitmentMenu) setAiRecruitmentExpanded(true);
            return;
        }
        setAiRecruitmentExpanded(false);
        setActiveRecruitmentPage(null);
    }, [currentView, useGroupedRecruitmentMenu]);

    const recruitmentSubItems: RecruitmentSidebarItem[] = [
        ...(canUseRecruitmentWorkspace ? [{ key: 'workspace', page: 'workspace', label: t.nav.aiRecruitmentWorkspace, icon: <FolderKanban className="h-[18px] w-[18px]"/> }] : []),
        ...(canManagePosition ? [{ key: 'positions', page: 'positions', label: t.nav.aiRecruitmentPositions, icon: <BriefcaseBusiness className="h-[18px] w-[18px]"/> }] : []),
        ...(canManageCandidate ? [{ key: 'candidates', page: 'candidates', label: t.nav.aiRecruitmentCandidates, icon: <Users className="h-[18px] w-[18px]"/> }] : []),
        ...(canViewTalentPool ? [{ key: 'talent-pool', page: 'talent-pool', label: t.nav.aiRecruitmentTalentPool, icon: <Users className="h-[18px] w-[18px]"/> }] : []),
        ...(canUseInterviewWorkbench ? [{ key: 'interviews', page: 'interviews', label: interviewWorkbenchLabel, icon: <CalendarCheck className="h-[18px] w-[18px]"/> }] : []),
        ...(canUseReviewWorkbench ? [{ key: 'review-workbench', page: 'review-workbench', label: reviewWorkbenchLabel, icon: <ClipboardCheck className="h-[18px] w-[18px]"/> }] : []),
        ...(canViewLog ? [{ key: 'audit', page: 'audit', label: t.nav.aiRecruitmentAudit, icon: <History className="h-[18px] w-[18px]"/> }] : []),
        ...(canViewRecruitmentAssistant ? [{ key: 'assistant', page: 'assistant', label: t.nav.aiRecruitmentAssistant, icon: <Bot className="h-[18px] w-[18px]"/> }] : []),
        ...(canUseRecruitmentSettings ? [{
            key: 'settings',
            page: recruitmentSettingsTarget,
            activePages: ['settings-skills', 'settings-models', 'settings-mail'],
            label: language === 'zh-CN' ? '设置' : 'Settings',
            icon: <Settings2 className="h-[18px] w-[18px]"/>,
        }] : []),
    ];

    const isRecruitmentItemActive = (item: RecruitmentSidebarItem) => (
        inRecruitmentView
        && (item.activePages || [item.page]).includes(String(activeRecruitmentPage || ''))
    );

    const openRecruitmentPage = (page: string) => {
        setRecruitmentInitialPage?.(page);
        setCurrentView('ai-recruitment');
        setActiveRecruitmentPage(page);
        navigateToRecruitmentPage(page);
    };

    const navItemClass = (active: boolean, disabled = false, expanded = false) => cn(
        'sidebar-nav-item',
        active && 'active',
        disabled && 'disabled',
        expanded && 'expanded',
        collapsed && 'justify-center gap-0 px-0',
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
        <button
            type="button"
            className={navItemClass(active, disabled)}
            onClick={disabled ? undefined : onClick}
            title={title || label}
            disabled={disabled}
            aria-current={active ? 'page' : undefined}
        >
            {icon}
            {!collapsed ? <span className="truncate">{label}</span> : null}
        </button>
    );

    const toggleSidebarPinned = () => {
        setSidebarPinned((current) => {
            const next = !current;
            if (next) setHoverExpanded(false);
            return next;
        });
    };

    return (
        <div
            className="dashboard-sidebar-shell relative h-full shrink-0"
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
                    'dashboard-sidebar absolute left-0 top-0 z-30 flex h-full flex-col overflow-hidden border-r border-[#F7F8FA] py-[16px]',
                    collapsed ? 'px-[12px]' : 'px-[16px]',
                    collapsed && 'collapsed',
                    sidebarPreviewExpanded && 'preview-expanded',
                )}
                style={{ width: sidebarPanelWidth }}
            >
                <ScrollArea className="min-h-0 flex-1">
                    <nav className="space-y-1 pb-4" aria-label={language === 'zh-CN' ? '主导航' : 'Primary navigation'}>
                        {showLandingNavigation ? renderNavItem({
                            active: currentView === 'home' || currentView === 'welcome',
                            label: homeNavLabel,
                            icon: <Home className="h-[18px] w-[18px]" strokeWidth={1.8}/>,
                            onClick: () => setCurrentView(homeNavView),
                        }) : null}

                        {CM_PERMISSION_KEYS.some((permission) => permissions[permission]) ? renderNavItem({
                            active: (currentView === 'system' || currentView === 'script') && selectedSystem !== 'haoshi',
                            label: t.nav.cmTools,
                            icon: <Wrench className="h-[18px] w-[18px]"/>,
                            onClick: () => {
                                setSelectedSystem('chunmiao');
                                setScriptQuery('');
                                setCurrentView('system');
                            },
                        }) : null}

                        {permissions['ocr-tool'] ? renderNavItem({
                            active: currentView === 'ocr-tool',
                            label: t.nav.ocrTool,
                            icon: <ScanLine className="h-[18px] w-[18px]"/>,
                            onClick: () => setCurrentView('ocr-tool'),
                        }) : null}

                        {permissions['server-monitoring'] ? renderNavItem({
                            active: currentView === 'ops-center',
                            label: t.nav.opsCenter,
                            icon: <Server className="h-[18px] w-[18px]"/>,
                            onClick: () => setCurrentView('ops-center'),
                        }) : null}

                        {permissions['team-resources'] ? renderNavItem({
                            active: currentView === 'team-resources',
                            label: t.nav.teamResources,
                            icon: <Users className="h-[18px] w-[18px]"/>,
                            onClick: () => setCurrentView('team-resources'),
                        }) : null}

                        {permissions['ai-resources'] ? renderNavItem({
                            active: currentView === 'ai-resources',
                            label: t.nav.aiResources,
                            icon: <Sparkles className="h-[18px] w-[18px]"/>,
                            onClick: () => setCurrentView('ai-resources'),
                        }) : null}

                        {permissions['agent-chat'] ? renderNavItem({
                            active: currentView === 'agent-chat',
                            label: t.agentChat.navLabel,
                            icon: <Bot className="h-[18px] w-[18px]"/>,
                            onClick: () => setCurrentView('agent-chat'),
                        }) : null}

                        {canAccessRecruitment && useGroupedRecruitmentMenu ? (
                            <div className="space-y-1">
                                <button
                                    type="button"
                                    className={navItemClass((collapsed || !aiRecruitmentExpanded) && inRecruitmentView, false, aiRecruitmentExpanded && !collapsed)}
                                    onClick={() => {
                                        if (collapsed) {
                                            setHoverExpanded(true);
                                            setAiRecruitmentExpanded(true);
                                            return;
                                        }
                                        setAiRecruitmentExpanded((expanded) => !expanded);
                                    }}
                                    title={t.nav.aiRecruitment}
                                    aria-expanded={aiRecruitmentExpanded}
                                >
                                    <BriefcaseBusiness className="h-[18px] w-[18px]"/>
                                    {!collapsed ? <span className="truncate">{t.nav.aiRecruitment}</span> : null}
                                    {!collapsed ? <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', aiRecruitmentExpanded && 'rotate-180')}/> : null}
                                </button>

                                {!collapsed && aiRecruitmentExpanded ? (
                                    <div className="sidebar-recruitment-subnav space-y-1 pl-3">
                                        {recruitmentSubItems.map((item) => (
                                            <button
                                                key={item.key}
                                                type="button"
                                                className={cn('sidebar-nav-item sidebar-nav-subitem', isRecruitmentItemActive(item) && 'active')}
                                                onClick={() => openRecruitmentPage(item.page)}
                                                aria-current={isRecruitmentItemActive(item) ? 'page' : undefined}
                                            >
                                                {item.icon}
                                                <span className="truncate">{item.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {canAccessRecruitment && !useGroupedRecruitmentMenu ? recruitmentSubItems.map((item) => (
                            <React.Fragment key={item.key}>
                                {renderNavItem({
                                    active: isRecruitmentItemActive(item),
                                    label: item.label,
                                    icon: item.icon,
                                    onClick: () => openRecruitmentPage(item.page),
                                })}
                            </React.Fragment>
                        )) : null}

                        {permissions['rbac-manage'] ? renderNavItem({
                            active: currentView === 'access-control',
                            label: t.nav.accessControl,
                            icon: <Shield className="h-[18px] w-[18px]"/>,
                            onClick: () => setCurrentView('access-control'),
                        }) : null}
                    </nav>
                </ScrollArea>

                <div className="shrink-0 space-y-1 border-t border-[#F2F3F5] pt-3 dark:border-slate-800">
                    {renderNavItem({
                        active: currentView === 'help',
                        label: t.nav.helpCenter,
                        icon: <CircleHelp className="h-[18px] w-[18px]"/>,
                        onClick: () => setCurrentView('help'),
                    })}
                    {renderNavItem({
                        active: false,
                        label: t.nav.systemLogs,
                        icon: <ScrollText className="h-[18px] w-[18px]"/>,
                        disabled: true,
                    })}

                    <div className={cn('flex pt-2', collapsed ? 'justify-center' : 'justify-end px-2')}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    onClick={toggleSidebarPinned}
                                    className="dashboard-sidebar-pin-button inline-flex h-8 w-8 items-center justify-center rounded-md text-[#86888F] transition hover:bg-[rgba(176,178,184,0.1)] hover:text-[#1E3BFA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3BFA]/25"
                                    aria-label={pinButtonLabel}
                                >
                                    <PanelLeft className={cn('h-[18px] w-[18px] transition-transform', !sidebarPinned && 'rotate-180')} strokeWidth={1.8}/>
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
