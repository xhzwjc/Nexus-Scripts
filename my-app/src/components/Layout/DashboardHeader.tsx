import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
    Bot,
    BriefcaseBusiness,
    Calendar,
    ChevronDown,
    CircleHelp,
    Cloud,
    Home,
    Play,
    ScanLine,
    Server,
    Settings,
    Shield,
    Sparkles,
    Terminal,
    Users,
    Wrench,
    Search,
    FileText,
} from 'lucide-react';

import HomeCalendar from '../HomeCalendar';
import { HeaderHealthIndicator } from '../TeamResources/HeaderHealthIndicator';
import type { HealthCheckState } from '../TeamResources/HeaderHealthIndicator';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import type { DashboardSearchResult } from '../AppShell/hooks/useDashboardSearch';
import { DashboardUserMenu } from './DashboardUserMenu';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { navigateToRecruitmentPage } from '@/lib/recruitmentNavBus';
import type { WeatherState, ViewType, User } from '@/lib/types';

interface HeaderProps {
    homeSearchQuery: string;
    setHomeSearchQuery: (q: string) => void;
    showSearchResults: boolean;
    setShowSearchResults: (show: boolean) => void;
    searchResults: DashboardSearchResult[];
    currentView: ViewType;
    selectedSystem: string;
    setCurrentView: (view: ViewType) => void;
    setSelectedSystem: (sys: string) => void;
    setSelectedScript: (script: string) => void;
    setScriptQuery: (q: string) => void;
    setRecruitmentInitialPage?: (page: string) => void;
    handleLock: () => void;
    onLogoutRequest: () => void;
    currentUser: User | null;
    now: Date;
    weather: WeatherState;
    weatherRefreshing: boolean;
    weatherLocationLabel: string;
    onRefreshWeather: () => void;
    hasHealthPermission?: boolean;
    userKey?: string;
    isFreshLogin?: boolean;
    onHealthChange?: (state: HealthCheckState) => void;
}

type ProductMenuItem = {
    key: string;
    label: string;
    icon: React.ReactNode;
    active: boolean;
    onSelect: () => void;
};

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

type HeaderSearchBoxProps = {
    variant: 'desktop' | 'compact';
    query: string;
    setQuery: (value: string) => void;
    showResults: boolean;
    setShowResults: (show: boolean) => void;
    results: DashboardSearchResult[];
    placeholder: string;
    noResultsLabel: string;
    renderResultIcon: (result: DashboardSearchResult) => React.ReactNode;
    onSelect: (result: DashboardSearchResult) => void;
};

function HeaderSearchBox({
    variant,
    query,
    setQuery,
    showResults,
    setShowResults,
    results,
    placeholder,
    noResultsLabel,
    renderResultIcon,
    onSelect,
}: HeaderSearchBoxProps) {
    const [activeIndex, setActiveIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const suppressNextFocusOpenRef = useRef(false);
    const compact = variant === 'compact';
    const hasQuery = query.trim().length > 0;
    const listboxId = `dashboard-search-${variant}-listbox`;
    const resultsVisible = showResults && hasQuery;

    useEffect(() => {
        setActiveIndex(-1);
    }, [query, results.length]);

    const focusResult = (index: number) => {
        if (!results.length) return;
        const nextIndex = (index + results.length) % results.length;
        setActiveIndex(nextIndex);
        resultRefs.current[nextIndex]?.focus();
    };

    const handleContainerBlur = (event: React.FocusEvent<HTMLDivElement>) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
            setShowResults(false);
        }
    };

    const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            setShowResults(false);
            return;
        }
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && results.length) {
            event.preventDefault();
            setShowResults(true);
            focusResult(event.key === 'ArrowDown' ? 0 : results.length - 1);
        }
    };

    const handleResultKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            focusResult(index + 1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            focusResult(index - 1);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            suppressNextFocusOpenRef.current = true;
            setShowResults(false);
            inputRef.current?.focus();
        }
    };

    return (
        <div
            className={cn('dashboard-search-root relative', compact ? 'w-full' : 'dashboard-shell-search')}
            onBlur={handleContainerBlur}
        >
            <div className="search-bar">
                <Search className="h-3.5 w-3.5 shrink-0 text-[#B0B2B8]" strokeWidth={2}/>
                <input
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-controls={listboxId}
                    aria-expanded={resultsVisible}
                    aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
                    placeholder={placeholder}
                    value={query}
                    autoFocus={compact}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setShowResults(event.target.value.trim().length > 0);
                    }}
                    onFocus={() => {
                        if (suppressNextFocusOpenRef.current) {
                            suppressNextFocusOpenRef.current = false;
                            return;
                        }
                        if (hasQuery) setShowResults(true);
                    }}
                    onKeyDown={handleInputKeyDown}
                />
            </div>

            {resultsVisible && results.length > 0 ? (
                <div
                    id={listboxId}
                    role="listbox"
                    className={cn('search-dropdown', compact && 'dashboard-search-dropdown-compact')}
                >
                    {results.map((result, index) => (
                        <button
                            ref={(element) => { resultRefs.current[index] = element; }}
                            type="button"
                            role="option"
                            id={`${listboxId}-option-${index}`}
                            aria-selected={activeIndex === index}
                            key={result.id}
                            className="search-result-item w-full text-left"
                            onFocus={() => setActiveIndex(index)}
                            onMouseEnter={() => setActiveIndex(index)}
                            onKeyDown={(event) => handleResultKeyDown(event, index)}
                            onClick={() => onSelect(result)}
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]">
                                {renderResultIcon(result)}
                            </span>
                            <span className="min-w-0">
                                <span className="block truncate text-xs font-medium text-[#0E1114] dark:text-slate-100">{result.name}</span>
                                <span className="mt-0.5 block truncate text-[11px] text-[#86888F]">{result.desc}</span>
                            </span>
                        </button>
                    ))}
                </div>
            ) : null}

            {resultsVisible && results.length === 0 ? (
                <div
                    id={listboxId}
                    role="status"
                    className={cn('search-dropdown p-4 text-center text-xs text-[#86888F]', compact && 'dashboard-search-dropdown-compact')}
                >
                    {noResultsLabel}
                </div>
            ) : null}
        </div>
    );
}

export const DashboardHeader: React.FC<HeaderProps> = ({
    homeSearchQuery,
    setHomeSearchQuery,
    showSearchResults,
    setShowSearchResults,
    searchResults,
    currentView,
    selectedSystem,
    setCurrentView,
    setSelectedSystem,
    setSelectedScript,
    setScriptQuery,
    setRecruitmentInitialPage,
    handleLock,
    onLogoutRequest,
    currentUser,
    now,
    weather,
    weatherRefreshing,
    weatherLocationLabel,
    onRefreshWeather,
    hasHealthPermission = false,
    userKey,
    isFreshLogin = false,
    onHealthChange,
}) => {
    const { t, language } = useI18n();
    const [showCalendar, setShowCalendar] = useState(false);
    const [compactSearchOpen, setCompactSearchOpen] = useState(false);
    const [productMenuOpen, setProductMenuOpen] = useState(false);
    const permissions = useMemo(() => currentUser?.permissions || {}, [currentUser?.permissions]);
    const showLandingNavigation = currentUser?.landingPage !== '';
    const homeView: ViewType = currentUser?.landingPage === 'welcome' ? 'welcome' : 'home';
    const canUseRecruitmentWorkspace = Boolean(
        permissions['recruitment-dashboard-view']
        || permissions['recruitment-process-execute']
        || permissions['recruitment-position-manage']
        || permissions['recruitment-candidate-manage']
        || permissions['recruitment-log-view']
    );
    const canUseInterviewWorkbench = Boolean(
        permissions['recruitment-interview-view']
        || permissions['recruitment-interview-act']
        || permissions['recruitment-interview-manage']
    );
    const canUseReviewWorkbench = Boolean(
        permissions['recruitment-review-view']
        || permissions['recruitment-review-act']
    );
    const canUseSkillSettings = Boolean(permissions['recruitment-skill-view'] || permissions['recruitment-skill-manage']);
    const canUseModelSettings = Boolean(permissions['recruitment-llm-config-view'] || permissions['recruitment-llm-config-manage']);
    const canUseMailSettings = Boolean(
        permissions['recruitment-mail-view']
        || permissions['recruitment-mail-config-manage']
        || permissions['recruitment-mail-sender-manage']
    );
    const canUseRecruitmentSettings = canUseSkillSettings || canUseModelSettings || canUseMailSettings;
    const recruitmentSettingsTarget = canUseSkillSettings
        ? 'settings-skills'
        : (canUseModelSettings ? 'settings-models' : 'settings-mail');
    const recruitmentLandingPage = canUseRecruitmentWorkspace
        ? 'workspace'
        : (permissions['recruitment-position-manage']
            ? 'positions'
            : (permissions['recruitment-candidate-manage']
                ? 'candidates'
                : (permissions['recruitment-talent-pool-view']
                    ? 'talent-pool'
                    : (canUseInterviewWorkbench
                        ? 'interviews'
                        : (canUseReviewWorkbench
                            ? 'review-workbench'
                            : (permissions['recruitment-log-view']
                                ? 'audit'
                                : (permissions['recruitment-assistant-view']
                                    ? 'assistant'
                                    : (canUseRecruitmentSettings ? recruitmentSettingsTarget : 'workspace'))))))));

    const selectProduct = (action: () => void) => {
        setProductMenuOpen(false);
        action();
    };

    const productItems = useMemo<ProductMenuItem[]>(() => {
        const items: Array<ProductMenuItem | null> = [
            showLandingNavigation ? {
                key: 'home',
                label: currentUser?.landingPage === 'welcome' ? (language === 'zh-CN' ? '欢迎' : 'Welcome') : t.nav.home,
                icon: <Home className="h-4 w-4"/>,
                active: currentView === 'home' || currentView === 'welcome',
                onSelect: () => setCurrentView(homeView),
            } : null,
            CM_PERMISSION_KEYS.some((permission) => permissions[permission]) ? {
                key: 'system',
                label: t.nav.cmTools,
                icon: <Wrench className="h-4 w-4"/>,
                active: (currentView === 'system' || currentView === 'script') && selectedSystem !== 'haoshi',
                onSelect: () => {
                    setSelectedSystem('chunmiao');
                    setScriptQuery('');
                    setCurrentView('system');
                },
            } : null,
            (currentView === 'system' || currentView === 'script') && selectedSystem === 'haoshi' ? {
                key: 'haoshi',
                label: t.scriptConfig.systems.haoshi.name,
                icon: <Cloud className="h-4 w-4"/>,
                active: true,
                onSelect: () => {
                    setSelectedSystem('haoshi');
                    setScriptQuery('');
                    setCurrentView('system');
                },
            } : null,
            permissions['ocr-tool'] ? {
                key: 'ocr-tool',
                label: t.nav.ocrTool,
                icon: <ScanLine className="h-4 w-4"/>,
                active: currentView === 'ocr-tool',
                onSelect: () => setCurrentView('ocr-tool'),
            } : null,
            permissions['server-monitoring'] ? {
                key: 'ops-center',
                label: t.nav.opsCenter,
                icon: <Server className="h-4 w-4"/>,
                active: currentView === 'ops-center',
                onSelect: () => setCurrentView('ops-center'),
            } : null,
            permissions['team-resources'] ? {
                key: 'team-resources',
                label: t.nav.teamResources,
                icon: <Users className="h-4 w-4"/>,
                active: currentView === 'team-resources',
                onSelect: () => setCurrentView('team-resources'),
            } : null,
            permissions['ai-resources'] ? {
                key: 'ai-resources',
                label: t.nav.aiResources,
                icon: <Sparkles className="h-4 w-4"/>,
                active: currentView === 'ai-resources',
                onSelect: () => setCurrentView('ai-resources'),
            } : null,
            permissions['agent-chat'] ? {
                key: 'agent-chat',
                label: t.agentChat.navLabel,
                icon: <Bot className="h-4 w-4"/>,
                active: currentView === 'agent-chat',
                onSelect: () => setCurrentView('agent-chat'),
            } : null,
            permissions['dev-tools'] ? {
                key: 'dev-tools',
                label: t.devTools?.title || (language === 'zh-CN' ? '开发者工具' : 'Developer Tools'),
                icon: <Terminal className="h-4 w-4"/>,
                active: currentView === 'dev-tools',
                onSelect: () => setCurrentView('dev-tools'),
            } : null,
            permissions['ai-recruitment'] ? {
                key: 'ai-recruitment',
                label: language === 'zh-CN' ? 'AI 招聘系统' : 'AI Recruitment',
                icon: <BriefcaseBusiness className="h-4 w-4"/>,
                active: currentView === 'ai-recruitment',
                onSelect: () => {
                    setRecruitmentInitialPage?.(recruitmentLandingPage);
                    setCurrentView('ai-recruitment');
                    navigateToRecruitmentPage(recruitmentLandingPage);
                },
            } : null,
            permissions['rbac-manage'] ? {
                key: 'access-control',
                label: t.nav.accessControl,
                icon: <Shield className="h-4 w-4"/>,
                active: currentView === 'access-control',
                onSelect: () => setCurrentView('access-control'),
            } : null,
        ];
        return items.filter((item): item is ProductMenuItem => Boolean(item));
    }, [currentUser?.landingPage, currentView, homeView, language, permissions, recruitmentLandingPage, selectedSystem, setCurrentView, setRecruitmentInitialPage, setScriptQuery, setSelectedSystem, showLandingNavigation, t]);

    const currentProductLabel = useMemo(() => {
        const currentItem = productItems.find((item) => item.active);
        if (currentItem) return currentItem.label;
        if (currentView === 'help') return t.nav.helpCenter;
        if (currentView === 'dev-tools') return language === 'zh-CN' ? '开发者工具' : 'Developer Tools';
        return language === 'zh-CN' ? 'Nexus 工作台' : 'Nexus Workspace';
    }, [currentView, language, productItems, t.nav.helpCenter]);

    const handleSearchResultClick = (result: DashboardSearchResult) => {
        if (result.type === 'cm') {
            setSelectedSystem('chunmiao');
            setScriptQuery('');
            setCurrentView('system');
        } else if (result.type === 'hs') {
            setSelectedSystem('haoshi');
            setScriptQuery('');
            setCurrentView('system');
        } else if (result.type === 'script') {
            setSelectedScript(result.id);
            setCurrentView('script');
        } else if (result.type === 'tool') {
            const toolViewMap: Record<string, ViewType> = {
                ocr: 'ocr-tool',
                devtools: 'dev-tools',
                teamResources: 'team-resources',
                aiResources: 'ai-resources',
                'ai-recruitment': 'ai-recruitment',
                'agent-chat': 'agent-chat',
                help: 'help',
                'ops-center': 'ops-center',
                accessControl: 'access-control',
            };
            const view = toolViewMap[result.id];
            if (view) setCurrentView(view);
        }
        setHomeSearchQuery('');
        setShowSearchResults(false);
    };

    const getSearchResultIcon = (result: DashboardSearchResult) => {
        if (result.type === 'cm') return <Settings className="h-4 w-4"/>;
        if (result.type === 'hs') return <Cloud className="h-4 w-4"/>;
        if (result.type === 'script') return <Play className="h-4 w-4"/>;
        if (result.id === 'aiResources') return <Sparkles className="h-4 w-4"/>;
        if (result.id === 'teamResources') return <Users className="h-4 w-4"/>;
        if (result.id === 'help') return <FileText className="h-4 w-4"/>;
        if (result.id === 'ops-center') return <Server className="h-4 w-4"/>;
        return <Terminal className="h-4 w-4"/>;
    };

    return (
        <header className="dashboard-header relative z-40 flex h-[56px] shrink-0 items-center justify-between border-b border-[#F2F3F5] bg-white px-[24px] dark:border-slate-800 dark:bg-slate-950">
            <div className="flex min-w-0 items-center gap-[16px]">
                {showLandingNavigation ? (
                    <button
                        type="button"
                        className="dashboard-header-icon-button dashboard-home-trigger"
                        onClick={() => setCurrentView(homeView)}
                        aria-label={t.nav.home}
                        title={t.nav.home}
                    >
                        <Home className="h-[20px] w-[20px]" strokeWidth={1.8}/>
                    </button>
                ) : null}

                <div className="flex shrink-0 items-center gap-2">
                    <span className="flex h-[24px] w-[24px] items-center justify-center rounded-[6px] bg-[#1E3BFA] text-[12px] font-bold text-white">N</span>
                    <span className="hidden text-[15px] font-semibold text-[#0E1114] dark:text-slate-50 sm:inline">Nexus</span>
                </div>

                <span className="h-4 w-px shrink-0 bg-[#E6E7EB] dark:bg-slate-700"/>

                <Popover open={productMenuOpen} onOpenChange={setProductMenuOpen}>
                    <PopoverTrigger asChild>
                        <button type="button" className="dashboard-product-trigger" aria-expanded={productMenuOpen}>
                            <Image
                                src="/ai-logos/ai-recruitment-product.png"
                                alt=""
                                aria-hidden="true"
                                width={16}
                                height={16}
                                priority
                                className="h-4 w-4 shrink-0"
                            />
                            <span className="max-w-48 truncate">{currentProductLabel}</span>
                            <ChevronDown className={cn('h-3 w-3 text-[#86888F] transition-transform', productMenuOpen && 'rotate-180')}/>
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="start"
                        sideOffset={10}
                        className="w-64 rounded-lg border-[#EBEEF5] bg-white p-2 shadow-[0_8px_24px_rgba(14,17,20,0.12)] dark:border-slate-700 dark:bg-slate-950"
                    >
                        <p className="px-2 pb-2 pt-1 text-[11px] text-[#86888F]">{language === 'zh-CN' ? '切换产品' : 'Switch product'}</p>
                        <div className="space-y-1">
                            {productItems.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    className={cn('dashboard-product-menu-item', item.active && 'active')}
                                    onClick={() => selectProduct(item.onSelect)}
                                >
                                    {item.icon}
                                    <span className="truncate">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            <div className="ml-4 flex min-w-0 items-center gap-[20px]">
                <HeaderSearchBox
                    variant="desktop"
                    query={homeSearchQuery}
                    setQuery={setHomeSearchQuery}
                    showResults={showSearchResults}
                    setShowResults={setShowSearchResults}
                    results={searchResults}
                    placeholder={language === 'zh-CN' ? '搜索菜单/工具' : 'Search menus or tools'}
                    noResultsLabel={t.header.noResults}
                    renderResultIcon={getSearchResultIcon}
                    onSelect={handleSearchResultClick}
                />

                <Popover
                    open={compactSearchOpen}
                    onOpenChange={(open) => {
                        setCompactSearchOpen(open);
                        if (!open) setShowSearchResults(false);
                    }}
                >
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className="dashboard-header-icon-button dashboard-compact-search-trigger"
                            aria-label={language === 'zh-CN' ? '打开全局搜索' : 'Open global search'}
                            title={language === 'zh-CN' ? '全局搜索' : 'Global search'}
                        >
                            <Search className="h-[18px] w-[18px]" strokeWidth={1.8}/>
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="end"
                        sideOffset={10}
                        className="w-[320px] rounded-lg border-[#EBEEF5] bg-white p-3 shadow-[0_8px_24px_rgba(14,17,20,0.12)] dark:border-slate-700 dark:bg-slate-950"
                    >
                        <HeaderSearchBox
                            variant="compact"
                            query={homeSearchQuery}
                            setQuery={setHomeSearchQuery}
                            showResults={showSearchResults}
                            setShowResults={setShowSearchResults}
                            results={searchResults}
                            placeholder={language === 'zh-CN' ? '搜索菜单/工具' : 'Search menus or tools'}
                            noResultsLabel={t.header.noResults}
                            renderResultIcon={getSearchResultIcon}
                            onSelect={(result) => {
                                handleSearchResultClick(result);
                                setCompactSearchOpen(false);
                            }}
                        />
                    </PopoverContent>
                </Popover>

                <div className="dashboard-header-health hidden sm:block">
                    <HeaderHealthIndicator
                        compact
                        hasPermission={hasHealthPermission}
                        userKey={userKey}
                        isFreshLogin={isFreshLogin}
                        onHealthChange={onHealthChange}
                    />
                </div>

                <Popover open={showCalendar} onOpenChange={setShowCalendar}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className={cn('dashboard-header-icon-button', showCalendar && 'active')}
                            title={language === 'zh-CN' ? '日程日历' : 'Calendar'}
                            aria-label={language === 'zh-CN' ? '打开日程日历' : 'Open calendar'}
                            aria-expanded={showCalendar}
                        >
                            <Calendar className="h-[18px] w-[18px]" strokeWidth={1.8}/>
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="end"
                        sideOffset={10}
                        className="w-80 rounded-lg border-[#EBEEF5] bg-white p-0 shadow-[0_8px_24px_rgba(14,17,20,0.12)] dark:border-slate-700 dark:bg-slate-950"
                    >
                            <HomeCalendar/>
                    </PopoverContent>
                </Popover>

                <button
                    type="button"
                    className="dashboard-header-icon-button"
                    onClick={() => setCurrentView('help')}
                    title={t.header.helpTitle}
                    aria-label={t.header.helpTitle}
                >
                    <CircleHelp className="h-[18px] w-[18px]" strokeWidth={1.8}/>
                </button>

                <DashboardUserMenu
                    currentUser={currentUser}
                    now={now}
                    weather={weather}
                    weatherRefreshing={weatherRefreshing}
                    weatherLocationLabel={weatherLocationLabel}
                    onRefreshWeather={onRefreshWeather}
                    setCurrentView={setCurrentView}
                    handleLock={handleLock}
                    onLogoutRequest={onLogoutRequest}
                />
            </div>
        </header>
    );
};
