'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Toaster } from 'sonner';
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
const SettlementSimScript = dynamic(() => import("./components/SettlementSimScript"), { loading: () => <LoadingComponent />, ssr: false });
const PaymentStatsScript = dynamic(() => import('./components/PaymentStatsScript'), { loading: () => <LoadingComponent />, ssr: false });
const OCRScript = dynamic(() => import("@/components/OCRScript"), { loading: () => <LoadingComponent />, ssr: false });
const DeliveryScript = dynamic(() => import("./components/DeliveryScript"), { loading: () => <LoadingComponent />, ssr: false });
const DevTools = dynamic(() => import("./components/DevTools"), { loading: () => <LoadingComponent />, ssr: false });
const TeamResourcesContainer = dynamic(() => import("./components/TeamResources/TeamResourcesContainer").then(mod => ({ default: mod.TeamResourcesContainer })), { loading: () => <LoadingComponent />, ssr: false });
const ServerMonitoringScript = dynamic(() => import("./pages/ops/ServerMonitoring"), { loading: () => <LoadingComponent />, ssr: false });
const AgentChat = dynamic(() => import("./components/AgentChat/AgentChat"), { loading: () => <LoadingComponent />, ssr: false });
const AccessControlCenter = dynamic(() => import("./components/AccessControl/AccessControlCenter").then(mod => ({ default: mod.AccessControlCenter })), { loading: () => <LoadingComponent />, ssr: false });
const RecruitmentAutomationContainer = dynamic(() => import("./components/Recruitment/RecruitmentAutomationContainer"), { loading: () => <LoadingComponent />, ssr: false });
const BizSceneTaskScript = dynamic(() => import("./components/BizSceneTaskScript"), { loading: () => <LoadingComponent />, ssr: false });

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
import { WelcomePage, WelcomePageUnauthorized } from './components/AppShell/WelcomePage';
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
import { toast } from './lib/toast';

// 类型和配置导入
import type { Permission, ViewType } from './lib/types';

import { ThemeProvider } from '@/lib/theme';

type InitialMenuTarget = {
    view: ViewType;
    selectedSystem?: string;
    recruitmentPage?: string;
};

const FIRST_MENU_CM_PERMISSION_KEYS = [
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

function resolveFirstRecruitmentMenu(permissions: Permission) {
    const canManagePosition = Boolean(permissions['recruitment-position-manage']);
    const canManageCandidate = Boolean(permissions['recruitment-candidate-manage']);
    const canUseWorkspace = Boolean(
        permissions['recruitment-dashboard-view']
        || permissions['recruitment-process-execute']
        || canManagePosition
        || canManageCandidate
        || permissions['recruitment-log-view']
    );
    if (canUseWorkspace) return 'workspace';
    if (canManagePosition) return 'positions';
    if (canManageCandidate) return 'candidates';
    if (permissions['recruitment-talent-pool-view']) return 'talent-pool';
    if (permissions['recruitment-interview-view'] || permissions['recruitment-interview-act'] || permissions['recruitment-interview-manage']) return 'interviews';
    if (permissions['recruitment-review-view'] || permissions['recruitment-review-act']) return 'review-workbench';
    if (permissions['recruitment-log-view']) return 'audit';
    if (permissions['recruitment-assistant-view']) return 'assistant';
    if (permissions['recruitment-mail-view'] || permissions['recruitment-mail-config-manage'] || permissions['recruitment-mail-sender-manage']) return 'settings-mail';
    if (permissions['recruitment-llm-config-view'] || permissions['recruitment-llm-config-manage']) return 'settings-models';
    if (permissions['recruitment-skill-view'] || permissions['recruitment-skill-manage']) return 'settings-skills';
    return 'workspace';
}

function resolveFirstBusinessMenu(permissions: Permission): InitialMenuTarget {
    if (FIRST_MENU_CM_PERMISSION_KEYS.some((permission) => permissions[permission])) {
        return { view: 'system', selectedSystem: 'chunmiao' };
    }
    if (permissions['ocr-tool']) return { view: 'ocr-tool' };
    if (permissions['server-monitoring']) return { view: 'ops-center' };
    if (permissions['team-resources']) return { view: 'team-resources' };
    if (permissions['ai-resources']) return { view: 'ai-resources' };
    if (permissions['agent-chat']) return { view: 'agent-chat' };
    if (permissions['ai-recruitment']) {
        return {
            view: 'ai-recruitment',
            recruitmentPage: resolveFirstRecruitmentMenu(permissions),
        };
    }
    if (permissions['rbac-manage']) return { view: 'access-control' };
    return { view: 'home' };
}

function resolveInitialMenuTarget(landingPage: '' | 'home' | 'welcome' | undefined, permissions: Permission): InitialMenuTarget {
    if (landingPage === 'welcome') return { view: 'welcome' };
    if (landingPage === '') return resolveFirstBusinessMenu(permissions);
    return { view: 'home' };
}

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
    const [recruitmentInitialPage, setRecruitmentInitialPage] = useState<string>('workspace');
    const [landingPageApplied, setLandingPageApplied] = useState(false);
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
    const SERVICE_WORKER_CLEANUP_KEY = 'script_hub_sw_cleanup_v1';
    type AppViewSnapshot = {
        view: ViewType;
        selectedSystem: string;
        selectedScript: string;
    };
    const previousViewSnapshotRef = useRef<AppViewSnapshot | null>(null);
    const recruitmentSourceSnapshotRef = useRef<AppViewSnapshot | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
            return;
        }

        if (sessionStorage.getItem(SERVICE_WORKER_CLEANUP_KEY) === 'done') {
            return;
        }

        let cancelled = false;

        const cleanupServiceWorkers = async () => {
            try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                const sameOriginRegistrations = registrations.filter((registration) => {
                    const scriptUrl = registration.active?.scriptURL
                        || registration.waiting?.scriptURL
                        || registration.installing?.scriptURL;

                    if (!scriptUrl) {
                        return false;
                    }

                    try {
                        return new URL(scriptUrl).origin === window.location.origin;
                    } catch {
                        return false;
                    }
                });

                if (sameOriginRegistrations.length === 0) {
                    sessionStorage.setItem(SERVICE_WORKER_CLEANUP_KEY, 'done');
                    return;
                }

                const results = await Promise.allSettled(
                    sameOriginRegistrations.map((registration) => registration.unregister()),
                );

                sessionStorage.setItem(SERVICE_WORKER_CLEANUP_KEY, 'done');

                if (cancelled) {
                    return;
                }

                const removed = results.some(
                    (result) => result.status === 'fulfilled' && result.value,
                );

                if (removed && navigator.serviceWorker.controller) {
                    window.location.reload();
                }
            } catch (error) {
                console.warn('Failed to clean up stale service workers:', error);
                sessionStorage.setItem(SERVICE_WORKER_CLEANUP_KEY, 'done');
            }
        };

        void cleanupServiceWorkers();

        return () => {
            cancelled = true;
        };
    }, []);

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
        isUnlocking,
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
            setLandingPageApplied(false);
            setScriptQuery('');
            setHomeSearchQuery('');
            setShowSearchResults(false);
            setHealthCheckState(undefined);
            previousViewSnapshotRef.current = null;
            recruitmentSourceSnapshotRef.current = null;
        },
    });
    const initialMenuTarget = useMemo(
        () => resolveInitialMenuTarget(currentUser?.landingPage, currentUser?.permissions || {}),
        [currentUser?.landingPage, currentUser?.permissions],
    );
    const landingView = initialMenuTarget.view;

    function restoreAppView(snapshot?: AppViewSnapshot | null) {
        if (!snapshot) {
            setSelectedSystem(initialMenuTarget.selectedSystem || '');
            setSelectedScript('');
            if (initialMenuTarget.recruitmentPage) {
                setRecruitmentInitialPage(initialMenuTarget.recruitmentPage);
            }
            setCurrentView(landingView);
            return;
        }
        setSelectedSystem(snapshot.selectedSystem);
        setSelectedScript(snapshot.selectedScript);
        setCurrentView(snapshot.view);
    }

    // 根据用户角色配置决定初始页面（登录后/刷新后仅执行一次）
    useEffect(() => {
        if (!currentUser || landingPageApplied) return;
        setLandingPageApplied(true);
        setSelectedSystem(initialMenuTarget.selectedSystem || '');
        setSelectedScript('');
        if (initialMenuTarget.recruitmentPage) {
            setRecruitmentInitialPage(initialMenuTarget.recruitmentPage);
        }
        setCurrentView(initialMenuTarget.view);
    }, [currentUser, initialMenuTarget, landingPageApplied]);

    useEffect(() => {
        const currentSnapshot: AppViewSnapshot = {
            view: currentView,
            selectedSystem,
            selectedScript,
        };
        const previousSnapshot = previousViewSnapshotRef.current;
        if (
            currentView === 'ai-recruitment'
            && previousSnapshot
            && previousSnapshot.view !== 'ai-recruitment'
        ) {
            recruitmentSourceSnapshotRef.current = previousSnapshot;
        }
        previousViewSnapshotRef.current = currentSnapshot;
    }, [currentView, selectedScript, selectedSystem]);

    function handleRecruitmentBack() {
        const sourceSnapshot = recruitmentSourceSnapshotRef.current;
        if (sourceSnapshot && sourceSnapshot.view !== 'ai-recruitment') {
            restoreAppView(sourceSnapshot);
            return;
        }
        restoreAppView(null);
    }

    useEffect(() => {
        if (typeof document === 'undefined') {
            return;
        }
        document.body.classList.toggle('app-locked', isLocked);
        return () => {
            document.body.classList.remove('app-locked');
        };
    }, [isLocked]);

    const {
        now,
        weather,
        weatherRefreshing,
        weatherLocationLabel,
        refreshWeather,
    } = useDashboardWeather(language, isLocked);

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

    useEffect(() => {
        if (!currentUser) {
            return;
        }

        const requiredViewPermissions: Partial<Record<ViewType, string>> = {
            'ocr-tool': 'ocr-tool',
            'dev-tools': 'dev-tools',
            'team-resources': 'team-resources',
            'ai-resources': 'ai-resources',
            'ops-center': 'server-monitoring',
            'agent-chat': 'agent-chat',
            'access-control': 'rbac-manage',
            'ai-recruitment': 'ai-recruitment',
            'welcome': undefined,
        };

        const requiredPermission = requiredViewPermissions[currentView];
        if (requiredPermission && !currentUser.permissions[requiredPermission]) {
            setCurrentView('home');
            return;
        }

        if (currentView === 'script' && selectedScript && !currentUser.permissions[selectedScript]) {
            setSelectedScript('');
            setCurrentView('system');
        }
    }, [currentUser, currentView, selectedScript]);

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
            case 'settlement-sim':
                return <SettlementSimScript onBack={() => setCurrentView('system')} />;
            case 'payment-stats':
                return <PaymentStatsScript onBack={() => setCurrentView('system')} />;
            case 'delivery-tool':
                return <DeliveryScript onBack={() => setCurrentView('system')} />;
            case 'server-monitoring':
                return <ServerMonitoringScript onBack={() => setCurrentView('system')} />;
            case 'biz-scene':
                return <BizSceneTaskScript onBack={() => setCurrentView('system')} />;
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

    // ============== 欢迎页面 ==============
    const renderWelcomeContent = () => (
        <WelcomePage
            currentUser={currentUser}
            onNavigate={setCurrentView}
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
        <div className="colorful-background dashboard-shell flex h-screen flex-col overflow-hidden text-slate-600 font-sans relative">
            {/* <ClothBackground /> */}
            {/* 锁屏遮罩 */}
            {isLocked && (
                <LockScreenOverlay
                    currentUserName={currentUser?.name}
                    lockKey={lockKey}
                    lockKeyInputRef={lockKeyInputRef}
                    setLockKey={setLockKey}
                    onUnlock={handleUnlock}
                    isUnlocking={isUnlocking}
                    onSwitchAccount={() => {
                        setIsLocked(false);
                        logout();
                    }}
                />
            )}

            <Toaster richColors position="top-right" visibleToasts={2} />


            <DashHeader
                homeSearchQuery={homeSearchQuery}
                setHomeSearchQuery={setHomeSearchQuery}
                showSearchResults={showSearchResults}
                setShowSearchResults={setShowSearchResults}
                searchResults={searchResults}
                currentView={currentView}
                selectedSystem={selectedSystem}
                setCurrentView={setCurrentView}
                handleLock={handleLock}
                onLogoutRequest={() => setShowLogoutConfirm(true)}
                currentUser={currentUser}
                setSelectedSystem={setSelectedSystem}
                setSelectedScript={setSelectedScript}
                setScriptQuery={setScriptQuery}
                setRecruitmentInitialPage={setRecruitmentInitialPage}
                now={now}
                weather={weather}
                weatherRefreshing={weatherRefreshing}
                weatherLocationLabel={weatherLocationLabel}
                onRefreshWeather={() => refreshWeather()}
                hasHealthPermission={!!currentUser?.permissions['cert-health']}
                userKey={userKey}
                isFreshLogin={isFreshLogin}
                onHealthChange={setHealthCheckState}
            />

            <div className="flex min-h-0 flex-1">
                <DashboardSidebar
                    currentView={currentView}
                    selectedSystem={selectedSystem}
                    setCurrentView={setCurrentView}
                    setSelectedSystem={setSelectedSystem}
                    setScriptQuery={setScriptQuery}
                    setRecruitmentInitialPage={setRecruitmentInitialPage}
                    currentUser={currentUser}
                />

                <div className="relative z-0 flex h-full min-w-0 flex-1 flex-col">
                    <main className={`flex-1 overflow-y-auto overflow-x-hidden relative scrollbar-hide ${currentView === 'help' || currentView === 'ai-recruitment' || currentView === 'access-control' ? 'p-0' : 'px-2 py-6'}`}>
                        {currentView === 'home' && renderHomeContent()}
                        {currentView === 'welcome' && renderWelcomeContent()}
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
                        {currentView === 'ai-recruitment' && (
                            <div className="h-full p-0">
                                <RecruitmentAutomationContainer onBack={handleRecruitmentBack} initialPage={recruitmentInitialPage as any} />
                            </div>
                        )}
                        {currentView === 'access-control' && (
                            <div className="h-full p-0">
                                <AccessControlCenter />
                            </div>
                        )}
                    </main>
                </div>
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
