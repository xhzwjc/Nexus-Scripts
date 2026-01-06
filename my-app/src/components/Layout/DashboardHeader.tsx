import React from 'react';
import { Search, CircleHelp, Lock, Settings, Cloud } from 'lucide-react';

interface HeaderProps {
    homeSearchQuery: string;
    setHomeSearchQuery: (q: string) => void;
    showSearchResults: boolean;
    setShowSearchResults: (show: boolean) => void;
    searchResults: any[];
    setCurrentView: (view: any) => void;
    setSelectedSystem: (sys: string) => void;
    setScriptQuery: (q: string) => void;
    handleLock: () => void;
    currentUser: any;
}

export const DashboardHeader: React.FC<HeaderProps> = ({
    homeSearchQuery,
    setHomeSearchQuery,
    showSearchResults,
    setShowSearchResults,
    searchResults,
    setCurrentView,
    setSelectedSystem,
    setScriptQuery,
    handleLock,
    currentUser
}) => {
    return (
        <header className="h-16 px-8 flex items-center justify-between border-b border-slate-200/50 bg-white/40 backdrop-blur-sm sticky top-0 z-30 shrink-0">
            {/* Search Bar */}
            <div className="search-bar flex-1 max-w-md relative">
                <Search className="w-[18px] h-[18px] text-slate-400" />
                <input
                    type="text"
                    placeholder="搜索系统模块..."
                    value={homeSearchQuery}
                    onChange={(e) => {
                        setHomeSearchQuery(e.target.value);
                        setShowSearchResults(e.target.value.trim().length > 0);
                    }}
                    onFocus={() => homeSearchQuery.trim() && setShowSearchResults(true)}
                    onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                />
                {/* 搜索结果下拉 */}
                {showSearchResults && searchResults.length > 0 && (
                    <div className="search-dropdown">
                        {searchResults.map((result) => (
                            <div
                                key={result.id}
                                className="search-result-item"
                                onClick={() => {
                                    if (result.type === 'cm') {
                                        setSelectedSystem('chunmiao');
                                        setScriptQuery('');
                                        setCurrentView('system');
                                    }
                                    setHomeSearchQuery('');
                                    setShowSearchResults(false);
                                }}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${result.type === 'cm' ? 'bg-teal-50 text-teal-600' : 'bg-slate-100 text-slate-500'}`}>
                                    {result.type === 'cm' ? <Settings className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-700">{result.name}</p>
                                    <p className="text-xs text-slate-500">{result.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {showSearchResults && searchResults.length === 0 && homeSearchQuery.trim() && (
                    <div className="search-dropdown p-4 text-center text-sm text-slate-500">
                        未找到匹配的系统模块
                    </div>
                )}
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-4">
                <button
                    className="p-2 text-slate-500 hover:text-slate-700 transition-colors"
                    onClick={() => setCurrentView('help')}
                    title="帮助中心"
                >
                    <CircleHelp className="w-5 h-5" />
                </button>
                <button
                    className="p-2 text-slate-500 hover:text-slate-700 transition-colors"
                    onClick={handleLock}
                    title="锁定屏幕"
                >
                    <Lock className="w-5 h-5" />
                </button>

                <div className="h-8 w-px bg-slate-200"></div>

                <div className="user-profile">
                    <div className="text-right">
                        <p className="text-xs text-slate-400 leading-none">DELL LAWYER</p>
                        <p className="text-sm font-medium text-slate-700">{currentUser?.name} <span className="text-teal-600 text-xs ml-1">在线</span></p>
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
