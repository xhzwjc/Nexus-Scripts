import React from 'react';
import { Search, CircleHelp, Lock, Settings, Cloud, Terminal, Play, Sparkles, Users, FileText } from 'lucide-react';
import { TimeChip } from '../ui/TimeChip';
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

    return (
        <header className="h-16 px-8 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--glass-bg)] backdrop-blur-sm sticky top-0 z-30 shrink-0">
            {/* Search Bar */}
            <div className="search-bar flex-1 max-w-xs relative">
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
                            // 导航处理逻辑
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
                                    // 直接进入对应脚本
                                    setSelectedScript(result.id);
                                    setCurrentView('script');
                                } else if (result.type === 'tool') {
                                    // 工具入口
                                    const toolViewMap: Record<string, ViewType> = {
                                        ocr: 'ocr-tool',
                                        devtools: 'dev-tools',
                                        teamResources: 'team-resources',
                                        aiResources: 'ai-resources',
                                        help: 'help',
                                    };
                                    const view = toolViewMap[result.id];
                                    if (view) setCurrentView(view);
                                }
                                setHomeSearchQuery('');
                                setShowSearchResults(false);
                            };

                            // 图标和样式
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

            {/* Right Actions */}
            <div className="flex items-center gap-2">
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

                <div className="h-6 w-px bg-[var(--border-strong)] mx-1"></div>

                {/* Add ThemeSwitcher here */}
                <ThemeSwitcher />

                <div className="h-6 w-px bg-[var(--border-strong)] mx-1"></div>

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

                <div className="h-8 w-px bg-[var(--border-strong)]"></div>

                <div className="user-profile shrink-0 min-w-fit flex items-center gap-3">
                    <div className="text-right">
                        <p className="text-xs text-[var(--text-tertiary)] leading-none">{t.header.organization}</p>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{currentUser?.name} <span className="text-[var(--status-success)] text-xs ml-1">{t.header.online}</span></p>
                    </div>
                    <div className="user-avatar">
                        {currentUser?.name?.charAt(0) || 'U'}
                        <span className="online-dot"></span>
                    </div>
                </div>
            </div>
        </header>
    );
};
