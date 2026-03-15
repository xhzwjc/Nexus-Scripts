import React, { useState, useRef, useEffect } from 'react';
import { Search, CircleHelp, Lock, Settings, Cloud, Terminal, Play, Sparkles, Users, FileText, Server, Calendar } from 'lucide-react';
import { TimeChip } from '../ui/TimeChip';
import HomeCalendar from '../HomeCalendar';
import { WeatherChip } from '../ui/WeatherChip';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { HeaderHealthIndicator } from '../TeamResources/HeaderHealthIndicator';
import { useI18n } from '@/lib/i18n';
import type { WeatherState, ViewType, User } from '@/lib/types';
import type { HealthCheckState } from '../TeamResources/HeaderHealthIndicator';
import { ThemeSwitcher } from '../ui/ThemeSwitcher';

interface SearchResult {
    id: string;
    name: string;
    desc: string;
    type: 'cm' | 'hs' | 'script' | 'tool';
}

interface HeaderProps {
    homeSearchQuery: string;
    setHomeSearchQuery: (q: string) => void;
    showSearchResults: boolean;
    setShowSearchResults: (show: boolean) => void;
    searchResults: SearchResult[];
    setCurrentView: (view: ViewType) => void;
    setSelectedSystem: (sys: string) => void;
    setSelectedScript: (script: string) => void;
    setScriptQuery: (q: string) => void;
    handleLock: () => void;
    currentUser: User | null;
    // 时间和天气
    now: Date;
    weather: WeatherState;
    weatherRefreshing: boolean;
    onRefreshWeather: () => void;
    // 健康检测
    hasHealthPermission?: boolean;
    userKey?: string;
    isFreshLogin?: boolean;
    onHealthChange?: (state: HealthCheckState) => void;
}

export const DashboardHeader: React.FC<HeaderProps> = ({
    homeSearchQuery,
    setHomeSearchQuery,
    showSearchResults,
    setShowSearchResults,
    searchResults,
    setCurrentView,
    setSelectedSystem,
    setSelectedScript,
    setScriptQuery,
    handleLock,
    currentUser,
    now,
    weather,
    weatherRefreshing,
    onRefreshWeather,
    hasHealthPermission = false,
    userKey,
    isFreshLogin = false,
    onHealthChange
}) => {
    const { t } = useI18n();
    const [showCalendar, setShowCalendar] = useState(false);
    const calendarRef = useRef<HTMLDivElement>(null);

    // Click outside handler
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
                setShowCalendar(false);
            }
        }
        if (showCalendar) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showCalendar]);

    return (
        <header className="sticky top-0 z-30 shrink-0 border-b border-[var(--border-subtle)] bg-[var(--glass-bg)] px-4 py-3 backdrop-blur-sm md:px-6 xl:px-8">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <div className="search-bar relative w-full min-w-0 xl:max-w-[min(38rem,42vw)] xl:flex-1">
                    <Search className="w-[18px] h-[18px] text-[var(--text-tertiary)]" />
                    <input
                        type="text"
                        placeholder={t.header.searchPlaceholder}
                        value={homeSearchQuery}
                        onChange={(e) => {
                            setHomeSearchQuery(e.target.value);
                            setShowSearchResults(e.target.value.trim().length > 0);
                        }}
                        onFocus={() => homeSearchQuery.trim() && setShowSearchResults(true)}
                        onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                    />

                    {showSearchResults && searchResults.length > 0 && (
                        <div className="search-dropdown">
                            {searchResults.map((result) => {
                                const handleClick = () => {
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

                                const getIconAndStyle = () => {
                                    switch (result.type) {
                                        case 'cm':
                                            return { icon: <Settings className="w-4 h-4" />, bg: 'bg-teal-50 text-teal-600' };
                                        case 'hs':
                                            return { icon: <Cloud className="w-4 h-4" />, bg: 'bg-slate-100 text-slate-500' };
                                        case 'script':
                                            return { icon: <Play className="w-4 h-4" />, bg: 'bg-blue-50 text-blue-600' };
                                        case 'tool':
                                            if (result.id === 'aiResources') return { icon: <Sparkles className="w-4 h-4" />, bg: 'bg-purple-50 text-purple-600' };
                                            if (result.id === 'teamResources') return { icon: <Users className="w-4 h-4" />, bg: 'bg-orange-50 text-orange-600' };
                                            if (result.id === 'help') return { icon: <FileText className="w-4 h-4" />, bg: 'bg-green-50 text-green-600' };
                                            if (result.id === 'ops-center') return { icon: <Server className="w-4 h-4" />, bg: 'bg-teal-50 text-teal-600' };
                                            return { icon: <Terminal className="w-4 h-4" />, bg: 'bg-gray-100 text-gray-600' };
                                        default:
                                            return { icon: <Settings className="w-4 h-4" />, bg: 'bg-gray-100 text-gray-500' };
                                    }
                                };

                                const { icon, bg } = getIconAndStyle();

                                return (
                                    <div
                                        key={result.id}
                                        className="search-result-item"
                                        onClick={handleClick}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg}`}>
                                            {icon}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-[var(--text-primary)]">{result.name}</p>
                                            <p className="text-xs text-[var(--text-secondary)]">{result.desc}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {showSearchResults && searchResults.length === 0 && homeSearchQuery.trim() && (
                        <div className="search-dropdown p-4 text-center text-sm text-[var(--text-secondary)]">
                            {t.header.noResults}
                        </div>
                    )}
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2 xl:ml-auto">
                    {/* 证书健康指示器（权限控制） */}
                    <HeaderHealthIndicator
                        hasPermission={hasHealthPermission}
                        userKey={userKey}
                        isFreshLogin={isFreshLogin}
                        onHealthChange={onHealthChange}
                    />

                {/* 时间和天气 */}
                    <TimeChip now={now} />
                    <WeatherChip
                        state={weather}
                        refreshing={weatherRefreshing}
                        onRefresh={onRefreshWeather}
                    />

                    <div className="mx-1 hidden h-6 w-px bg-[var(--border-strong)] lg:block"></div>

                {/* Add ThemeSwitcher here */}
                    <ThemeSwitcher />

                    <div className="mx-1 hidden h-6 w-px bg-[var(--border-strong)] xl:block"></div>

                {/* Calendar Popover */}
                    <div className="relative" ref={calendarRef}>
                        <button
                            className={`flex items-center justify-center rounded-lg p-2 transition-colors ${showCalendar ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                            onClick={() => setShowCalendar(!showCalendar)}
                            title="日程日历"
                        >
                            <Calendar className="w-5 h-5" />
                        </button>
                        {showCalendar && (
                            <div className="absolute right-0 top-[calc(100%+12px)] z-50 animate-in fade-in slide-in-from-top-2 duration-200" style={{ width: '320px' }}>
                                <HomeCalendar />
                            </div>
                        )}
                    </div>

                    <button
                        className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                        onClick={() => setCurrentView('help')}
                        title={t.header.helpTitle}
                    >
                        <CircleHelp className="w-5 h-5" />
                    </button>
                    <button
                        className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                        onClick={handleLock}
                        title={t.header.lockTitle}
                    >
                        <Lock className="w-5 h-5" />
                    </button>

                {/* Language Switcher */}
                    <LanguageSwitcher variant="compact" />

                    <div className="hidden h-8 w-px bg-[var(--border-strong)] xl:block"></div>

                    <div className="user-profile shrink-0 min-w-0 flex items-center gap-2 sm:gap-3">
                        <div className="hidden text-right xl:block">
                            <p className="text-xs text-[var(--text-tertiary)] leading-none">{t.header.organization}</p>
                            <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                                {currentUser?.name} <span className="ml-1 text-xs text-[var(--status-success)]">{t.header.online}</span>
                            </p>
                        </div>
                        <div className="user-avatar">
                            {currentUser?.name?.charAt(0) || 'U'}
                            <span className="online-dot"></span>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};
