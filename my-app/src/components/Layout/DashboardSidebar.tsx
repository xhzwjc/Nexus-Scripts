import React from 'react';
import { Wrench, ScanLine, CircleHelp, ScrollText, LogOut, ChevronRight, Server, CheckCircle, Users, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { ViewType, User } from '@/lib/types';

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
    currentUser
}) => {
    const { t } = useI18n();

    return (
        <aside className="dashboard-sidebar w-[260px] h-screen flex flex-col py-6 px-4 z-40 bg-[var(--glass-bg)] backdrop-blur-xl border-r border-[var(--sidebar-border)] shadow-sm shrink-0">
            {/* Logo */}
            <div className="flex items-center gap-2.5 px-3 mb-8">
                <div className="w-10 h-10 flex items-center justify-center overflow-hidden">
                    <img src="/logo.svg" alt="Logo" className="w-full h-full object-contain" />
                </div>
                <span className="font-semibold text-[var(--text-primary)] text-[15px]">
                    ScriptHub <span className="font-normal text-[var(--text-secondary)]">Dashboard</span>
                </span>
            </div>

            {/* MAIN 导航区 - 工作区域 */}
            <div className="mb-6">
                <p className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider px-3 mb-3">{t.nav.workspace}</p>
                <nav className="space-y-1">
                    <div
                        className={`sidebar-nav-item ${currentView === 'home' ? 'active' : ''}`}
                        onClick={() => setCurrentView('home')}
                    >
                        <div className={`w-5 h-5 flex items-center justify-center ${currentView === 'home' ? 'text-teal-600' : 'text-current'}`}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>
                        </div>
                        <span>{t.nav.home}</span>
                    </div>
                    <div
                        className={`sidebar-nav-item ${currentView === 'system' ? 'active' : ''}`}
                        onClick={() => { setSelectedSystem('chunmiao'); setScriptQuery(''); setCurrentView('system'); }}
                    >
                        <Wrench className="w-[18px] h-[18px]" />
                        <span>{t.nav.cmTools}</span>
                    </div>
                    <div
                        className={`sidebar-nav-item ${currentView === 'ocr-tool' ? 'active' : ''}`}
                        onClick={() => setCurrentView('ocr-tool')}
                    >
                        <ScanLine className="w-[18px] h-[18px]" />
                        <span>{t.nav.ocrTool}</span>
                    </div>
                    {/* Operations Center (Restricted) */}
                    {currentUser?.permissions['server-monitoring'] && (
                        <div
                            className={`sidebar-nav-item ${currentView === 'ops-center' ? 'active' : ''}`}
                            onClick={() => setCurrentView('ops-center')}
                        >
                            <Server className="w-[18px] h-[18px]" />
                            <span>{t.nav.opsCenter}</span>
                        </div>
                    )}
                    <div
                        className={`sidebar-nav-item ${currentView === 'team-resources' ? 'active' : ''}`}
                        onClick={() => setCurrentView('team-resources')}
                    >
                        <Users className="w-[18px] h-[18px]" />
                        <span>{t.nav.teamResources}</span>
                    </div>
                    <div
                        className={`sidebar-nav-item ${currentView === 'ai-resources' ? 'active' : ''}`}
                        onClick={() => setCurrentView('ai-resources')}
                    >
                        <Sparkles className="w-[18px] h-[18px]" />
                        <span>{t.nav.aiResources}</span>
                    </div>
                </nav>
            </div>

            {/* 系统支持 */}
            <div className="mb-6">
                <p className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider px-3 mb-3">{t.nav.support}</p>
                <nav className="space-y-1">
                    <div
                        className={`sidebar-nav-item ${currentView === 'help' ? 'active' : ''}`}
                        onClick={() => setCurrentView('help')}
                    >
                        <CircleHelp className="w-[18px] h-[18px]" />
                        <span>{t.nav.helpCenter}</span>
                    </div>
                    <div className="sidebar-nav-item disabled" title={t.nav.systemLogs}>
                        <ScrollText className="w-[18px] h-[18px]" />
                        <span>{t.nav.systemLogs}</span>
                    </div>
                </nav>
            </div>

            {/* 账号管理 */}
            <div className="mb-6">
                <p className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider px-3 mb-3">{t.nav.account}</p>
                <nav className="space-y-1">
                    <div className="sidebar-nav-item" onClick={() => setShowLogoutConfirm(true)}>
                        <LogOut className="w-[18px] h-[18px]" />
                        <span>{t.nav.logout}</span>
                    </div>
                </nav>
            </div>

            {/* 运行状态 */}
            <div className="mb-6">
                <div className="sidebar-nav-item justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></div>
                        <span className="text-[13px]">{t.nav.systemRunning}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />
                </div>
                <div className="pl-8 mt-2">
                    <div className="flex items-center gap-2 py-2 text-[13px] text-[var(--text-secondary)]">
                        <Server className="w-4 h-4 text-[var(--text-tertiary)]" />
                        <span>ScriptHub v2.0-stable</span>
                    </div>
                </div>
            </div>

            {/* 底部状态 */}
            <div className="mt-auto">
                <div className="sidebar-nav-item justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="text-[13px]">{t.nav.serviceNormal}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />
                </div>
                <div className="pl-8 mt-2">
                    <div className="flex items-center gap-2 py-2 text-[13px] text-[var(--text-secondary)]">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span>{t.nav.allNodesOnline}</span>
                    </div>
                </div>
            </div>
        </aside>
    );
};
