'use client';

import React, { useMemo, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import dynamic from 'next/dynamic';

// Loading 组件 - 使用静态文本避免在 I18nProvider 外调用 hook
const LoadingComponent = () => (
    <div className="flex h-full items-center justify-center text-muted-foreground p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading...</span>
    </div>
);

// 动态导入脚本组件 (Code Splitting)
const SettlementScript = dynamic(() => import('./components/SettlementScript'), { loading: () => <LoadingComponent />, ssr: false });
const CommissionScript = dynamic(() => import('./components/CommissionScript'), { loading: () => <LoadingComponent />, ssr: false });
const BalanceScript = dynamic(() => import('./components/BalanceScript'), { loading: () => <LoadingComponent />, ssr: false });
const TaskAutomationScript = dynamic(() => import('./components/TaskAutomationScript'), { loading: () => <LoadingComponent />, ssr: false });
const SmsManagementScript = dynamic(() => import("./components/BatchSmsScript"), { loading: () => <LoadingComponent />, ssr: false });
const TaxReportReportManagement = dynamic(() => import("./components/TaxReportManagement"), { loading: () => <LoadingComponent />, ssr: false });
const TaxCalculationScript = dynamic(() => import("./components/TaxCalculatorScript"), { loading: () => <LoadingComponent />, ssr: false });
const PaymentStatsScript = dynamic(() => import('./components/PaymentStatsScript'), { loading: () => <LoadingComponent />, ssr: false });
const OCRScript = dynamic(() => import("@/components/OCRScript"), { loading: () => <LoadingComponent />, ssr: false });
const DeliveryScript = dynamic(() => import("./components/DeliveryScript"), { loading: () => <LoadingComponent />, ssr: false });
const DevTools = dynamic(() => import("./components/DevTools"), { loading: () => <LoadingComponent />, ssr: false });
const TeamResourcesContainer = dynamic(() => import("./components/TeamResources/TeamResourcesContainer").then(mod => ({ default: mod.TeamResourcesContainer })), { loading: () => <LoadingComponent />, ssr: false });
const ServerMonitoringScript = dynamic(() => import("./pages/ops/ServerMonitoring"), { loading: () => <LoadingComponent />, ssr: false });
const AgentChat = dynamic(() => import("./components/AgentChat/AgentChat"), { loading: () => <LoadingComponent />, ssr: false });
const AccessControlCenter = dynamic(() => import("./components/AccessControl/AccessControlCenter").then(mod => ({ default: mod.AccessControlCenter })), { loading: () => <LoadingComponent />, ssr: false });

// Layout 组件导入
import { HelpPage } from './components/Layout/HelpPage';
// ... (start of file remains same until imports)

// ...

import { DashboardSidebar } from './components/Layout/DashboardSidebar';
import { DashboardHeader as DashHeader } from './components/Layout/DashboardHeader';
import { AIResourcesContainer } from './components/AIResources';
import { saveRecentScript } from './components/Layout/QuickActions';
import { DashboardLoadingScreen } from './components/Layout/DashboardLoadingScreen';
import { getScriptDesc, getScriptName, getSystemDesc, getSystemName } from './components/AppShell/dashboardLabels';
import { HomeDashboard } from './components/AppShell/HomeDashboard';
import { LoginScreen } from './components/AppShell/LoginScreen';
import { LockScreenOverlay } from './components/AppShell/LockScreenOverlay';
import { useDashboardSearch } from './components/AppShell/hooks/useDashboardSearch';
import { SystemScriptsView } from './components/AppShell/SystemScriptsView';
import { useDashboardSession } from './components/AppShell/hooks/useDashboardSession';
import { useDashboardWeather } from './components/AppShell/hooks/useDashboardWeather';

// UI 组件导入
import { ConfirmDialog } from './components/ui/ConfirmDialog';

// i18n
import { I18nProvider, useI18n } from './lib/i18n';

// 类型和配置导入
import type { ViewType } from './lib/types';

import { ThemeProvider } from '@/lib/theme';

/* ============== 主应用 ============== */
export default function App() {
    return (
        <ThemeProvider>
            <I18nProvider>
                <AppContent />
            </I18nProvider>
        </ThemeProvider>
    );
}

/* ============== 应用内容 ============== */
function AppContent() {
    const { t, language } = useI18n();
    const [currentView, setCurrentView] = useState<ViewType>('home');
    const [selectedSystem, setSelectedSystem] = useState<string>('');
    const [selectedScript, setSelectedScript] = useState<string>('');
    const [isKeyInputFocused, setIsKeyInputFocused] = useState(false);
    const [isLoginKeyVisible, setIsLoginKeyVisible] = useState(false);
    // 从 sessionStorage 初始化（刷新后保持，关闭标签页后重置）
    const [isDashboardReady, setIsDashboardReady] = useState(() => {
        if (typeof window !== 'undefined') {
            return sessionStorage.getItem('dashboard_ready') === 'true';
        }
        return false;
    });
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [scriptQuery, setScriptQuery] = useState('');
    const HEALTH_CHECK_CACHE_KEY = 'health_check_result_v2';

    // 证书健康检测状态 — 同步从 sessionStorage 恢复缓存，避免刷新时闪烁
    const [healthCheckState, setHealthCheckState] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; healthPercent: number; issues: unknown[]; totalEnvs: number; checkedEnvs: number } | undefined>(() => {
        try {
            const data = sessionStorage.getItem(HEALTH_CHECK_CACHE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                const status = parsed?.result?.status;
                if (parsed.result && status !== 'idle' && status !== 'loading') {
                    return parsed.result;
                }
            }
        } catch { /* ignore */ }
        return undefined;
    });

    const {
        currentUser,
        userKey,
        systems,
        isLoading,
        isVerifying,
        isLocked,
        lockKey,
        isFreshLogin,
        loginKeyInputRef,
        lockKeyInputRef,
        setUserKey,
        setLockKey,
        setIsLocked,
        validateKey,
        handleUnlock,
        handleLock,
        logout,
    } = useDashboardSession({
        healthCheckCacheKey: HEALTH_CHECK_CACHE_KEY,
        onLogoutReset: () => {
            setSelectedSystem('');
            setSelectedScript('');
            setCurrentView('home');
            setScriptQuery('');
            setHomeSearchQuery('');
            setShowSearchResults(false);
            setHealthCheckState(undefined);
        },
    });

    const {
        now,
        weather,
        weatherRefreshing,
        refreshWeather,
    } = useDashboardWeather(language);

    const {
        homeSearchQuery,
        setHomeSearchQuery,
        showSearchResults,
        setShowSearchResults,
        searchResults,
    } = useDashboardSearch({
        currentUser,
        language,
        t,
    });

    // 快捷导航到脚本
    const navigateToScript = (systemId: string, scriptId: string) => {
        setSelectedSystem(systemId);
        setSelectedScript(scriptId);
        saveRecentScript(userKey, systemId, scriptId);
        setCurrentView('script');
    };

    const system = systems[selectedSystem as keyof typeof systems];
    const scripts = useMemo(() => system?.scripts ?? [], [system]);

    const filteredScripts = useMemo(() => {
        if (!system || !scriptQuery.trim()) return scripts;
        return scripts.filter(s => {
            const name = getScriptName(t, s.id);
            const desc = getScriptDesc(t, s.id);
            return `${name} ${desc}`.toLowerCase().includes(scriptQuery.trim().toLowerCase());
        });
    }, [system, scripts, scriptQuery, t]);

    const totalScripts = useMemo(() => (
        Object.values(systems).reduce((total, sys) => total + sys.scripts.length, 0)
    ), [systems]);

    const getStatusColor = (status: string) => {
        const map: Record<string, string> = {
            active: 'bg-green-100 text-green-800 border-green-200',
            beta: 'bg-yellow-100 text-yellow-800 border-yellow-200',
            stable: 'bg-blue-100 text-blue-800 border-blue-200'
        };
        return map[status] ?? 'bg-gray-100 text-gray-800 border-gray-200';
    };

    const renderScript = () => {
        if (currentView === 'ocr-tool') return <OCRScript onBack={() => setCurrentView('home')} />;
        switch (selectedScript) {
            case 'settlement':
                return <SettlementScript onBack={() => setCurrentView('system')} />;
            case 'commission':
                return <CommissionScript onBack={() => setCurrentView('system')} />;
            case 'balance':
                return <BalanceScript onBack={() => setCurrentView('system')} />;
            case 'task-automation':
                return <TaskAutomationScript onBack={() => setCurrentView('system')} />;
            case 'sms_operations_center':
                return <SmsManagementScript onBack={() => setCurrentView('system')} />;
            case 'tax-reporting':
                return <TaxReportReportManagement onBack={() => setCurrentView('system')} />;
            case 'tax-calculation':
                return <TaxCalculationScript onBack={() => setCurrentView('system')} />;
            case 'payment-stats':
                return <PaymentStatsScript onBack={() => setCurrentView('system')} />;
            case 'delivery-tool':
                return <DeliveryScript onBack={() => setCurrentView('system')} />;
            case 'server-monitoring':
                return <ServerMonitoringScript onBack={() => setCurrentView('system')} />;
            default:
                return null;
        }
    };

    // ============== 加载状态 ==============
    if (isLoading) return (
        <div className="min-h-screen bg-muted/30 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
    );

    // ============== 登录页面 ==============
    if (!currentUser) {
        return (
            <LoginScreen
                userKey={userKey}
                isKeyInputFocused={isKeyInputFocused}
                isLoginKeyVisible={isLoginKeyVisible}
                isVerifying={isVerifying}
                loginKeyInputRef={loginKeyInputRef}
                setUserKey={setUserKey}
                setIsKeyInputFocused={setIsKeyInputFocused}
                setIsLoginKeyVisible={setIsLoginKeyVisible}
                onSubmit={validateKey}
            />
        );
    }
    // ============== 登录后加载动画 ==============
    if (!isDashboardReady) {
        return (
            <DashboardLoadingScreen
                minDisplayTime={800}
                onComplete={() => {
                    sessionStorage.setItem('dashboard_ready', 'true');
                    setIsDashboardReady(true);
                }}
            />
        );
    }

    // ============== 首页内容 ==============
    const renderHomeContent = () => (
        <HomeDashboard
            currentUser={currentUser}
            now={now}
            systems={systems}
            totalScripts={totalScripts}
            userKey={userKey}
            healthCheckState={healthCheckState}
            onNavigateToScript={navigateToScript}
            onOpenSystem={(systemId) => {
                setSelectedSystem(systemId);
                setScriptQuery('');
                setCurrentView('system');
            }}
            onSetCurrentView={setCurrentView}
        />
    );

    // ============== 系统工具页面 ==============
    const renderSystemContent = () => (
        <SystemScriptsView
            selectedSystem={selectedSystem}
            system={system}
            scripts={scripts}
            filteredScripts={filteredScripts}
            scriptQuery={scriptQuery}
            onScriptQueryChange={setScriptQuery}
            onBack={() => setCurrentView('home')}
            onLaunchScript={(scriptId) => {
                setSelectedScript(scriptId);
                saveRecentScript(userKey, selectedSystem, scriptId);
                setCurrentView('script');
            }}
            getSystemName={(systemId) => getSystemName(t, systemId)}
            getSystemDesc={(systemId) => getSystemDesc(t, systemId)}
            getScriptName={(scriptId) => getScriptName(t, scriptId)}
            getScriptDesc={(scriptId) => getScriptDesc(t, scriptId)}
            getStatusColor={getStatusColor}
        />
    );

    // ============== 主布局 ==============
    return (
        <div className="colorful-background flex h-screen overflow-hidden text-slate-600 font-sans relative">
            {/* <ClothBackground /> */}
            <Toaster richColors position="top-right" />

            {/* 锁屏遮罩 */}
            {isLocked && (
                <LockScreenOverlay
                    currentUserName={currentUser?.name}
                    lockKey={lockKey}
                    lockKeyInputRef={lockKeyInputRef}
                    setLockKey={setLockKey}
                    onUnlock={handleUnlock}
                    onSwitchAccount={() => {
                        setIsLocked(false);
                        logout();
                    }}
                />
            )}


            <DashboardSidebar
                currentView={currentView}
                setCurrentView={setCurrentView}
                setSelectedSystem={setSelectedSystem}
                setScriptQuery={setScriptQuery}
                setShowLogoutConfirm={setShowLogoutConfirm}
                currentUser={currentUser}
            />

            <div className="flex-1 flex flex-col min-w-0 h-full relative z-0">
                <DashHeader
                    homeSearchQuery={homeSearchQuery}
                    setHomeSearchQuery={setHomeSearchQuery}
                    showSearchResults={showSearchResults}
                    setShowSearchResults={setShowSearchResults}
                    searchResults={searchResults}
                    setCurrentView={setCurrentView}
                    handleLock={handleLock}
                    currentUser={currentUser}
                    setSelectedSystem={setSelectedSystem}
                    setSelectedScript={setSelectedScript}
                    setScriptQuery={setScriptQuery}
                    now={now}
                    weather={weather}
                    weatherRefreshing={weatherRefreshing}
                    onRefreshWeather={() => refreshWeather()}
                    hasHealthPermission={!!currentUser?.permissions['cert-health']}
                    userKey={userKey}
                    isFreshLogin={isFreshLogin}
                    onHealthChange={setHealthCheckState}
                />

                <main className={`flex-1 overflow-y-auto overflow-x-hidden relative scrollbar-hide ${currentView === 'help' ? 'p-0' : 'p-6'}`}>
                        {currentView === 'home' && renderHomeContent()}
                        {currentView === 'system' && renderSystemContent()}
                        {currentView === 'dev-tools' && (
                            <div className="h-full">
                                <DevTools onBack={() => setCurrentView('home')} />
                            </div>
                        )}
                        {currentView === 'help' && (
                            <div className="h-full rounded-none overflow-hidden border-0">
                                <HelpPage onBack={() => setCurrentView('home')} />
                            </div>
                        )}
                        {(currentView === 'script' || currentView === 'ocr-tool') && (
                            <div className="min-h-full">
                                {renderScript()}
                            </div>
                        )}
                        {currentView === 'team-resources' && (
                            <div className="h-full p-0">
                                <TeamResourcesContainer onBack={() => setCurrentView('home')} />
                            </div>
                        )}
                        {currentView === 'ai-resources' && (
                            <div className="h-full p-0">
                                <AIResourcesContainer onBack={() => setCurrentView('home')} isAdmin={true} />
                            </div>
                        )}
                        {currentView === 'ops-center' && (
                            <div className="h-full p-0">
                                <ServerMonitoringScript onBack={() => setCurrentView('home')} />
                            </div>
                        )}
                        {currentView === 'agent-chat' && (
                            <div className="h-full p-0">
                                <AgentChat onBack={() => setCurrentView('home')} />
                            </div>
                        )}
                        {currentView === 'access-control' && (
                            <div className="h-full p-0">
                                <AccessControlCenter onBack={() => setCurrentView('home')} />
                            </div>
                        )}
                    </main>
            </div>

            <ConfirmDialog
                open={showLogoutConfirm}
                title={t.dialog.logoutTitle}
                description={t.auth.description}
                confirmText={t.common.confirm}
                cancelText={t.common.cancel}
                onCancel={() => setShowLogoutConfirm(false)}
                onConfirm={() => {
                    setShowLogoutConfirm(false);
                    logout();
                    toast.success(t.nav.logout);
                }}
            />
            {/* <BubuMascot /> */}
        </div>
    );
}
