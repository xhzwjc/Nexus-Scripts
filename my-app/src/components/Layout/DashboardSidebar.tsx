import React from 'react';
import { Wrench, ScanLine, CircleHelp, ScrollText, LogOut, ChevronRight, Server, CheckCircle } from 'lucide-react';

interface SidebarProps {
    currentView: string;
    setCurrentView: (view: any) => void;
    setSelectedSystem: (sys: string) => void;
    setScriptQuery: (q: string) => void;
    setShowLogoutConfirm: (show: boolean) => void;
}

export const DashboardSidebar: React.FC<SidebarProps> = ({
    currentView,
    setCurrentView,
    setSelectedSystem,
    setScriptQuery,
    setShowLogoutConfirm
}) => {
    return (
        <aside className="dashboard-sidebar w-[260px] h-screen flex flex-col py-6 px-4 z-40 bg-white/75 backdrop-blur-xl border-r border-white/50 shadow-sm shrink-0">
            {/* Logo */}
            <div className="flex items-center gap-2.5 px-3 mb-8">
                <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-lg">
                    S
                </div>
                <span className="font-semibold text-slate-800 text-[15px]">
                    ScriptHub <span className="font-normal text-slate-500">Dashboard</span>
                </span>
            </div>

            {/* MAIN 导航区 - 工作区域 */}
            <div className="mb-6">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-3">工作区域 (Workspace)</p>
                <nav className="space-y-1">
                    <div
                        className={`sidebar-nav-item ${currentView === 'home' ? 'active' : ''}`}
                        onClick={() => setCurrentView('home')}
                    >
                        <div className={`w-5 h-5 flex items-center justify-center ${currentView === 'home' ? 'text-teal-600' : 'text-current'}`}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>
                        </div>
                        <span>首页</span>
                    </div>
                    <div
                        className={`sidebar-nav-item ${currentView === 'system' ? 'active' : ''}`}
                        onClick={() => { setSelectedSystem('chunmiao'); setScriptQuery(''); setCurrentView('system'); }}
                    >
                        <Wrench className="w-[18px] h-[18px]" />
                        <span>CM系统工具</span>
                    </div>
                    <div
                        className={`sidebar-nav-item ${currentView === 'ocr-tool' ? 'active' : ''}`}
                        onClick={() => setCurrentView('ocr-tool')}
                    >
                        <ScanLine className="w-[18px] h-[18px]" />
                        <span>OCR 工具</span>
                    </div>
                </nav>
            </div>

            {/* 系统支持 */}
            <div className="mb-6">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-3">系统支持 (Support)</p>
                <nav className="space-y-1">
                    <div
                        className={`sidebar-nav-item ${currentView === 'help' ? 'active' : ''}`}
                        onClick={() => setCurrentView('help')}
                    >
                        <CircleHelp className="w-[18px] h-[18px]" />
                        <span>帮助中心</span>
                    </div>
                    <div className="sidebar-nav-item disabled" title="联系管理员获取日志">
                        <ScrollText className="w-[18px] h-[18px]" />
                        <span>系统日志 (联系管理员)</span>
                    </div>
                </nav>
            </div>

            {/* 账号管理 */}
            <div className="mb-6">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-3">账号管理 (Account)</p>
                <nav className="space-y-1">
                    <div className="sidebar-nav-item" onClick={() => setShowLogoutConfirm(true)}>
                        <LogOut className="w-[18px] h-[18px]" />
                        <span>退出登录</span>
                    </div>
                </nav>
            </div>

            {/* 运行状态 */}
            <div className="mb-6">
                <div className="sidebar-nav-item justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></div>
                        <span className="text-[13px]">系统运行中</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
                <div className="pl-8 mt-2">
                    <div className="flex items-center gap-2 py-2 text-[13px] text-slate-500">
                        <Server className="w-4 h-4 text-slate-400" />
                        <span>ScriptHub v2.0-stable</span>
                    </div>
                </div>
            </div>

            {/* 底部状态 */}
            <div className="mt-auto">
                <div className="sidebar-nav-item justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="text-[13px]">服务正常</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
                <div className="pl-8 mt-2">
                    <div className="flex items-center gap-2 py-2 text-[13px] text-slate-500">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span>所有节点在线</span>
                    </div>
                </div>
            </div>
        </aside>
    );
};
