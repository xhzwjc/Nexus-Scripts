'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Input } from './components/ui/input';
import { Toaster, toast } from 'sonner';
import {
    Settings,
    Play,
    Lock,
    Loader2,
    Cloud,
    Server,
    ChevronRight,
    CheckCircle,
    ArrowLeft,
    Terminal
} from 'lucide-react';
import './App.css';

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


// Layout 组件导入
import { HelpPage } from './components/Layout/HelpPage';
import { DashboardSidebar } from './components/Layout/DashboardSidebar';
import { DashboardHeader as DashHeader } from './components/Layout/DashboardHeader';
import { AIResourcesContainer } from './components/AIResources';
import { ClothBackground } from './components/Layout/ClothBackground';
import { BubuMascot } from './components/Layout/BubuMascot';
import { QuickActions, saveRecentScript } from './components/Layout/QuickActions';

// UI 组件导入
import { ConfirmDialog } from './components/ui/ConfirmDialog';

// i18n
import { I18nProvider, useI18n } from './lib/i18n';

// 类型和配置导入
import type { User, ViewType, WeatherState, SystemConfig } from './lib/types';
import {
    keyUserMap,
    allScripts,
    WEATHER_CACHE_KEY,
    WEATHER_TTL,
    getEndOfDayTimestamp
} from './lib/config';

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
    const [userKey, setUserKey] = useState('');
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    const [systems, setSystems] = useState<Record<string, SystemConfig>>(allScripts);
    const [isLoading, setIsLoading] = useState(true);
    const [isVerifying, setIsVerifying] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [scriptQuery, setScriptQuery] = useState('');
    const [now, setNow] = useState<Date>(new Date());
    const [weather, setWeather] = useState<WeatherState>({ loading: true });
    const [weatherRefreshing, setWeatherRefreshing] = useState(false);

    // 锁屏相关状态
    const [isLocked, setIsLocked] = useState(false);
    const [lockKey, setLockKey] = useState('');
    const [lockError, setLockError] = useState('');
    const lastActivityRef = useRef<number>(Date.now());

    // 搜索相关状态
    const [homeSearchQuery, setHomeSearchQuery] = useState('');
    const [showSearchResults, setShowSearchResults] = useState(false);

    // 证书健康检测状态
    const [healthCheckState, setHealthCheckState] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; healthPercent: number; issues: unknown[]; totalEnvs: number; checkedEnvs: number } | undefined>(undefined);
    // 标记是否是新登录（而不是从 localStorage 恢复的会话）
    const [isFreshLogin, setIsFreshLogin] = useState(false);

    // 5小时自动锁屏
    const AUTO_LOCK_MS = 5 * 60 * 60 * 1000;

    // 初始化持久化状态
    useEffect(() => {
        const savedLocked = localStorage.getItem('app_is_locked') === 'true';
        if (savedLocked) setIsLocked(true);

        const savedLastActivity = localStorage.getItem('app_last_activity');
        if (savedLastActivity) {
            const t = parseInt(savedLastActivity);
            if (!isNaN(t)) {
                lastActivityRef.current = t;
                if (Date.now() - t > AUTO_LOCK_MS) setIsLocked(true);
            }
        }
    }, [AUTO_LOCK_MS]);

    // 监听锁屏状态变化并持久化
    useEffect(() => {
        if (isLocked) {
            localStorage.setItem('app_is_locked', 'true');
        } else {
            localStorage.removeItem('app_is_locked');
        }
    }, [isLocked]);

    // 搜索结果计算
    const searchResults = useMemo(() => {
        if (!homeSearchQuery.trim()) return [];
        const query = homeSearchQuery.toLowerCase();
        const results: { id: string; name: string; desc: string; type: 'cm' | 'hs' }[] = [];

        if ('cm核心业务系统'.includes(query) || 'cm'.includes(query) || '核心'.includes(query) || '业务'.includes(query)) {
            results.push({ id: 'chunmiao', name: t.home.search.cm.name, desc: t.home.search.cm.desc, type: 'cm' });
        }
        if ('hs辅助系统'.includes(query) || 'hs'.includes(query) || '辅助'.includes(query)) {
            results.push({ id: 'haoshi', name: t.home.search.hs.name, desc: t.home.search.hs.desc, type: 'hs' });
        }
        return results;
    }, [homeSearchQuery, t]);

    // 时钟
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // 自动锁屏检测
    useEffect(() => {
        if (!currentUser) return;

        const updateActivity = () => {
            lastActivityRef.current = Date.now();
        };

        window.addEventListener('mousemove', updateActivity);
        window.addEventListener('keydown', updateActivity);
        window.addEventListener('click', updateActivity);

        const checkLock = setInterval(() => {
            localStorage.setItem('app_last_activity', lastActivityRef.current.toString());
            if (Date.now() - lastActivityRef.current > AUTO_LOCK_MS && !isLocked) {
                setIsLocked(true);
                toast.info(t.lock.autoLockMessage);
            }
        }, 60000);

        return () => {
            window.removeEventListener('mousemove', updateActivity);
            window.removeEventListener('keydown', updateActivity);
            window.removeEventListener('click', updateActivity);
            clearInterval(checkLock);
        };
    }, [currentUser, isLocked, AUTO_LOCK_MS, t.lock.autoLockMessage]);

    // 手动锁屏
    const handleLock = () => {
        setIsLocked(true);
        setLockKey('');
        setLockError('');
    };

    // 解锁
    const handleUnlock = () => {
        const input = lockKey.trim();
        if (!input) {
            setLockError(t.lock.emptyKey);
            return;
        }

        if (input !== userKey.trim()) {
            if (keyUserMap[input]) {
                setLockError(t.lock.wrongAccount);
            } else {
                setLockError(t.lock.wrongKey);
            }
            return;
        }

        setIsLocked(false);
        setLockKey('');
        setLockError('');
        lastActivityRef.current = Date.now();
        toast.success(t.lock.unlockSuccess);
    };

    // 天气刷新
    const refreshWeather = useCallback(async (options?: { background?: boolean }) => {
        const background = !!options?.background;
        const apiKey = process.env.NEXT_PUBLIC_HEWEATHER_API_KEY;
        const apiHost = process.env.NEXT_PUBLIC_HEWEATHER_HOST;
        if (!apiKey || !apiHost) {
            setWeather(prev => ({ ...prev, loading: false, error: 'config' }));
            return;
        }
        if (!background) setWeatherRefreshing(true);
        try {
            // 根据当前语言设置API语言参数
            const apiLang = language === 'en-US' ? 'en' : 'zh';
            const res = await fetch(`https://${apiHost}/v7/weather/now?location=101010100&lang=${apiLang}`, { headers: { "X-QW-Api-Key": apiKey } });
            const data = await res.json();
            if (data.code !== "200") throw new Error(data.code);
            const parsed = {
                temp: parseInt(data.now.temp),
                desc: data.now.text,
                wind: parseFloat(data.now.windSpeed),
                humidity: parseInt(data.now.humidity),
                code: data.now.icon
            };
            setWeather({ loading: false, data: parsed });
            localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: parsed }));
        } catch {
            setWeather(prev => prev.data ? { ...prev, loading: false, error: 'err' } : {
                loading: false,
                error: 'err',
                data: { temp: 25, desc: language === 'en-US' ? "Sunny" : "晴", wind: 10, humidity: 50, code: "100" }
            });
        } finally {
            if (!background) setWeatherRefreshing(false);
        }
    }, [language]);

    // 天气初始化
    useEffect(() => {
        const raw = localStorage.getItem(WEATHER_CACHE_KEY);
        let hasCached = false;
        if (raw) {
            try {
                const c = JSON.parse(raw);
                if (Date.now() - c.ts < WEATHER_TTL) {
                    setWeather({ loading: false, data: c.data });
                    hasCached = true;
                }
            } catch { /* ignore */ }
        }
        refreshWeather({ background: hasCached });
        const i = setInterval(() => refreshWeather({ background: true }), WEATHER_TTL);
        return () => clearInterval(i);
    }, [refreshWeather]);

    // 语言切换时刷新天气（以获取对应语言的天气描述）
    const prevLanguageRef = useRef(language);
    useEffect(() => {
        if (prevLanguageRef.current !== language) {
            prevLanguageRef.current = language;
            refreshWeather({ background: true });
        }
    }, [language, refreshWeather]);

    // 认证初始化
    useEffect(() => {
        setTimeout(() => {
            const saved = localStorage.getItem('scriptHubAuth');
            if (saved) {
                try {
                    const a = JSON.parse(saved);
                    if (Date.now() <= a.expiresAt && keyUserMap[a.key]) {
                        setCurrentUser(keyUserMap[a.key]);
                        setUserKey(a.key);
                        filterScripts(keyUserMap[a.key]);
                        setIsLoading(false);
                        return;
                    }
                } catch { /* ignore */ }
            }
            setIsLoading(false);
        }, 100);
    }, []);

    const validateKey = () => {
        if (!userKey.trim()) return toast.error(t.auth.enterKey);
        setIsVerifying(true);
        setTimeout(() => {
            const u = keyUserMap[userKey.trim()];
            if (u) {
                localStorage.setItem('scriptHubAuth', JSON.stringify({
                    key: userKey.trim(),
                    user: u,
                    expiresAt: getEndOfDayTimestamp()
                }));
                setCurrentUser(u);
                filterScripts(u);
                setIsLocked(false);
                setIsFreshLogin(true); // 标记为新登录，触发健康检测
                lastActivityRef.current = Date.now();
                localStorage.setItem('app_last_activity', lastActivityRef.current.toString());
                toast.success(t.auth.verifySuccess);
            } else toast.error(t.auth.invalidKey);
            setIsVerifying(false);
        }, 500);
    };

    const filterScripts = (user: User) => {
        const filtered = Object.fromEntries(Object.entries(allScripts).map(([k, s]) => [
            k, { ...s, scripts: s.scripts.filter(sc => user.permissions[sc.id]) }
        ])) as typeof allScripts;
        setSystems(filtered);
    };



    const logout = () => {
        setCurrentUser(null);
        setUserKey('');
        setSelectedSystem('');
        setSelectedScript('');
        setCurrentView('home');
        setSystems(allScripts);
        localStorage.removeItem('scriptHubAuth');
    };

    // 快捷导航到脚本
    const navigateToScript = (systemId: string, scriptId: string) => {
        setSelectedSystem(systemId);
        setSelectedScript(scriptId);
        saveRecentScript(userKey, systemId, scriptId);
        setCurrentView('script');
    };

    const system = systems[selectedSystem as keyof typeof systems];
    const scripts = useMemo(() => system?.scripts ?? [], [system]);

    // Helper functions for translated system/script names
    const scriptIdToKey: Record<string, keyof typeof t.scriptConfig.items> = {
        'settlement': 'settlement',
        'commission': 'commission',
        'balance': 'balance',
        'task-automation': 'taskAutomation',
        'sms_operations_center': 'smsOperationsCenter',
        'tax-reporting': 'taxReporting',
        'tax-calculation': 'taxCalculation',
        'payment-stats': 'paymentStats',
        'delivery-tool': 'deliveryTool',
    };

    const getSystemName = (systemId: string): string => {
        if (systemId === 'chunmiao') return t.scriptConfig.systems.chunmiao.name;
        if (systemId === 'haoshi') return t.scriptConfig.systems.haoshi.name;
        return systemId;
    };

    const getSystemDesc = (systemId: string): string => {
        if (systemId === 'chunmiao') return t.scriptConfig.systems.chunmiao.description;
        if (systemId === 'haoshi') return t.scriptConfig.systems.haoshi.description;
        return '';
    };

    const getScriptName = (scriptId: string): string => {
        const key = scriptIdToKey[scriptId];
        if (key && t.scriptConfig.items[key]) {
            return t.scriptConfig.items[key].name;
        }
        return scriptId;
    };

    const getScriptDesc = (scriptId: string): string => {
        const key = scriptIdToKey[scriptId];
        if (key && t.scriptConfig.items[key]) {
            return t.scriptConfig.items[key].description;
        }
        return '';
    };

    const filteredScripts = useMemo(() => {
        if (!system || !scriptQuery.trim()) return scripts;
        return scripts.filter(s => {
            const name = getScriptName(s.id);
            const desc = getScriptDesc(s.id);
            return `${name} ${desc}`.toLowerCase().includes(scriptQuery.trim().toLowerCase());
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [system, scripts, scriptQuery, t.scriptConfig]);

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
            <div className="min-h-screen colorful-background flex items-center justify-center p-6">
                <Toaster richColors position="top-center" />
                <Card className="w-full max-w-md animate-fadeIn shadow-xl border-0 bg-card/90 backdrop-blur">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl flex items-center justify-center gap-2">
                            <Lock className="w-5 h-5" /> {t.auth.title}
                        </CardTitle>
                        <CardDescription>{t.auth.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">

                        <Input
                            type="password"
                            placeholder={t.auth.keyPlaceholder}
                            value={userKey}
                            onChange={e => setUserKey(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !isVerifying && validateKey()}
                            disabled={isVerifying}
                        />
                        <Button className="w-full" onClick={validateKey} disabled={isVerifying}>
                            {isVerifying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : t.auth.loginButton}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ============== 首页内容 ==============
    const renderHomeContent = () => {
        const hour = now.getHours();
        let timeGreeting = t.home.greetingEvening;
        if (hour < 6) timeGreeting = t.home.greetingNight;
        else if (hour < 12) timeGreeting = t.home.greetingMorning;
        else if (hour < 14) timeGreeting = t.home.greetingNoon;
        else if (hour < 18) timeGreeting = t.home.greetingAfternoon;

        return (
            <div className="max-w-7xl">
                {/* 问候语 */}
                <div className="mb-10">
                    <h1 className="text-3xl font-bold text-foreground tracking-tight mb-2">
                        {timeGreeting}, {currentUser?.name}.
                    </h1>
                    <p className="text-muted-foreground text-base">
                        {t.home.systemNormal}
                    </p>
                </div>

                {/* 状态徽章行 */}
                <div className="flex items-center gap-4 mb-10">
                    <div className="status-badge">
                        <div className="icon bg-primary/10 text-primary">
                            <CheckCircle className="w-4 h-4" />
                        </div>
                        <span className="font-semibold text-foreground">{totalScripts}</span>
                        <span className="text-muted-foreground">{t.home.availableResources}</span>
                        <span className="text-primary text-xs ml-1">{t.home.ready}</span>
                    </div>
                    {/* 系统健康徽章 */}
                    {(() => {
                        const hasPermission = !!currentUser?.permissions['cert-health'];
                        const isLoading = healthCheckState?.status === 'loading';
                        const isIdle = !healthCheckState || healthCheckState.status === 'idle';
                        const isError = healthCheckState?.status === 'error';
                        const isSuccess = healthCheckState?.status === 'success';
                        const hasIssues = isSuccess && healthCheckState.issues.length > 0;
                        const percent = healthCheckState?.healthPercent ?? 100;

                        // 无权限用户：显示100%
                        if (!hasPermission) {
                            return (
                                <div className="status-badge">
                                    <div className="icon bg-green-500/10 text-green-600 dark:text-green-400">
                                        <Server className="w-4 h-4" />
                                    </div>
                                    <span className="text-muted-foreground">{t.home.systemHealth}</span>
                                    <span className="font-semibold text-foreground">100%</span>
                                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-[10px] px-1.5 py-0">{t.home.stable}</Badge>
                                </div>
                            );
                        }

                        // 正在加载或未开始检测：显示骨架屏
                        if (isLoading || isIdle) {
                            return (
                                <div className="status-badge">
                                    <div className="icon bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                        <Server className="w-4 h-4 animate-spin" />
                                    </div>
                                    <span className="text-muted-foreground">{t.home.systemHealth}</span>
                                    <div className="w-8 h-4 bg-muted rounded animate-pulse" />
                                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-[10px] px-1.5 py-0">
                                        {isLoading ? `${healthCheckState.checkedEnvs}/${healthCheckState.totalEnvs}` : t.home.detecting}
                                    </Badge>
                                </div>
                            );
                        }

                        // 检测错误：显示100%（可点击重试）
                        if (isError) {
                            return (
                                <div className="status-badge">
                                    <div className="icon bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                                        <Server className="w-4 h-4" />
                                    </div>
                                    <span className="text-muted-foreground">{t.home.systemHealth}</span>
                                    <span className="font-semibold text-foreground">100%</span>
                                    <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-0 text-[10px] px-1.5 py-0">{t.home.detectFailed}</Badge>
                                </div>
                            );
                        }

                        // 检测成功 - 有问题：显示实际百分比
                        if (hasIssues) {
                            return (
                                <div className="status-badge">
                                    <div className={`icon ${percent < 90 ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'}`}>
                                        <Server className="w-4 h-4" />
                                    </div>
                                    <span className="text-muted-foreground">{t.home.systemHealth}</span>
                                    <span className={`font-semibold ${percent < 90 ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                                        {percent}%
                                    </span>
                                    <Badge className={`border-0 text-[10px] px-1.5 py-0 ${percent < 90 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                                        {healthCheckState.issues.length}{t.home.issues}
                                    </Badge>
                                </div>
                            );
                        }

                        // 检测成功 - 全部正常：显示100%
                        return (
                            <div className="status-badge">
                                <div className="icon bg-green-500/10 text-green-600 dark:text-green-400">
                                    <Server className="w-4 h-4" />
                                </div>
                                <span className="text-muted-foreground">{t.home.systemHealth}</span>
                                <span className="font-semibold text-foreground">100%</span>
                                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-[10px] px-1.5 py-0">{t.home.stable}</Badge>
                            </div>
                        );
                    })()}
                    <div className="status-badge">
                        <div className="icon bg-violet-500/10 text-violet-600 dark:text-violet-400">
                            <Server className="w-4 h-4" />
                        </div>
                        <span className="text-muted-foreground">{t.home.totalExecuted}</span>
                        <span className="font-semibold text-foreground">1.2k</span>
                        <a href="#" className="text-primary text-xs hover:underline">{t.home.completed}</a>
                    </div>
                </div>

                {/* 系统卡片和快捷操作 */}
                <div className="flex gap-6 items-stretch">
                    {/* 左侧：系统卡片 */}
                    <div className="flex-[3] grid grid-cols-2 gap-6">
                        {/* CM 核心业务系统 */}
                        <div className="system-card p-6 cursor-pointer flex flex-col h-[280px]" onClick={() => { setSelectedSystem('chunmiao'); setScriptQuery(''); setCurrentView('system'); }}>
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-12 h-12 bg-background border border-[var(--border-subtle)] shadow-sm rounded-xl flex items-center justify-center group-hover:border-primary/50 transition-colors">
                                    <Settings className="w-6 h-6 text-primary" />
                                </div>
                                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800 text-[11px] px-2">
                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 inline-block"></span>
                                    {t.home.cmSystem.running}
                                </Badge>
                            </div>
                            <h3 className="text-xl font-bold text-foreground mb-2">{t.home.cmSystem.title}</h3>
                            <p className="text-muted-foreground text-sm mb-4 leading-relaxed flex-1 overflow-hidden line-clamp-3">
                                {t.home.cmSystem.description.replace('{count}', String(systems['chunmiao'].scripts.length))}
                            </p>
                            <button className="btn-teal-gradient w-full mt-auto">
                                {t.home.cmSystem.enterButton}
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>

                        {/* 开发者工具箱 (权限控制) */}
                        {currentUser?.permissions['dev-tools'] && (
                            <div className="system-card p-6 cursor-pointer flex flex-col h-[280px]" onClick={() => setCurrentView('dev-tools')}>
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center">
                                        <Terminal className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800 text-[11px] px-2">
                                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-1.5 inline-block"></span>
                                        {t.home.devTools.toolset}
                                    </Badge>
                                </div>
                                <h3 className="text-xl font-bold text-foreground mb-2">{t.home.devTools.title}</h3>
                                <p className="text-muted-foreground text-sm mb-4 leading-relaxed flex-1 overflow-hidden">
                                    {t.home.devTools.description}
                                </p>
                                <button className="w-full mt-auto flex items-center text-primary hover:text-primary/80 font-medium text-sm transition-colors">
                                    {t.home.devTools.enterButton}
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                </button>
                            </div>
                        )}

                        {/* HS 辅助系统 */}
                        <div className="system-card p-6 flex flex-col h-[280px]">
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center">
                                    <Cloud className="w-6 h-6 text-muted-foreground" />
                                </div>
                                <Badge variant="outline" className="text-muted-foreground border-border text-[11px] px-2">
                                    {t.home.hsSystem.planning}
                                </Badge>
                            </div>
                            <h3 className="text-xl font-bold text-foreground mb-2">{t.home.hsSystem.title}</h3>
                            <p className="text-muted-foreground text-sm mb-4 leading-relaxed flex-1">
                                {t.home.hsSystem.description}
                            </p>
                            <button className="btn-outline-gray w-full mt-auto" disabled>
                                {t.home.hsSystem.enterButton}
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* 右侧：快捷操作面板 */}
                    <QuickActions
                        onNavigateToScript={navigateToScript}
                        onNavigateToSystem={() => {
                            setSelectedSystem('chunmiao');
                            setScriptQuery('');
                            setCurrentView('system');
                        }}
                        setCurrentView={setCurrentView}
                        userKey={userKey}
                    />
                </div>

                {/* 底部版本号 */}
                <footer className="mt-12 text-center md:text-left">
                    <span className="version-badge">ScriptHub v 2.0-stable</span>
                </footer>
            </div >
        );
    };

    // ============== 系统工具页面 ==============
    const renderSystemContent = () => {
        const hasFewScripts = filteredScripts.length > 0 && filteredScripts.length <= 2;
        return (
            <div className="p-8 max-w-7xl mx-auto w-full">
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="mr-2 h-8 w-8"
                            onClick={() => setCurrentView('home')}
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <h1 className="text-2xl font-bold">{getSystemName(selectedSystem)}</h1>
                        <Badge variant="outline" className="bg-background/50">
                            {filteredScripts.length} / {scripts.length}{t.system.scriptsCount}
                        </Badge>
                    </div>
                    <p className="text-muted-foreground">{getSystemDesc(selectedSystem)}</p>
                </div>

                <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm text-muted-foreground">
                        {scripts.length > 0 ? t.system.searchHint : t.system.noScripts}
                    </p>
                    {scripts.length > 0 && (
                        <Input
                            value={scriptQuery}
                            onChange={(event) => setScriptQuery(event.target.value)}
                            placeholder={t.system.searchPlaceholder}
                            className="md:max-w-sm bg-background/80"
                        />
                    )}
                </div>

                <div className={`
                    ${hasFewScripts
                        ? 'flex flex-col items-center justify-center min-h-[300px]'
                        : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                    }
                `}>
                    {filteredScripts.map((script) => (
                        <Card
                            key={script.id}
                            className={`
                                cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1 bg-card/80 backdrop-blur-sm
                                ${hasFewScripts ? 'w-full max-w-md mb-6' : ''}
                            `}
                        >
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                            {script.icon}
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg">{getScriptName(script.id)}</CardTitle>
                                            <Badge className={`mt-2 border ${getStatusColor(script.status)}`}>
                                                {script.status}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <CardDescription className="mb-4 min-h-[40px]">
                                    {getScriptDesc(script.id)}
                                </CardDescription>
                                <button
                                    className="btn-outline-gray w-full group"
                                    onClick={() => {
                                        setSelectedScript(script.id);
                                        saveRecentScript(userKey, selectedSystem, script.id);
                                        setCurrentView('script');
                                    }}
                                >
                                    <Play className="w-4 h-4 mr-2 text-teal-500 group-hover:text-teal-400 transition-colors" />
                                    {t.system.launchScript}
                                </button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        );
    };

    // ============== 主布局 ==============
    return (
        <div className="colorful-background flex h-screen overflow-hidden text-slate-600 font-sans relative">
            {/* <ClothBackground /> */}
            <Toaster richColors position="top-right" />

            {/* 锁屏遮罩 */}
            {isLocked && (
                <div className="lock-screen z-50">
                    <div className="lock-avatar">
                        {currentUser?.name?.charAt(0) || 'U'}
                    </div>
                    <p className="text-lg font-medium text-slate-700">{currentUser?.name}</p>
                    <p className="text-sm text-slate-500 -mt-2">{t.lock.description}</p>
                    <div className="lock-input-wrapper">
                        <input
                            type="password"
                            placeholder={t.lock.unlockPlaceholder}
                            value={lockKey}
                            onChange={(e) => setLockKey(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                        />
                        <button onClick={handleUnlock}>{t.lock.unlockButton}</button>
                    </div>
                    {lockError && <p className="text-sm text-red-500">{lockError}</p>}
                    <button
                        className="mt-4 text-xs text-slate-400 hover:text-slate-600 transition-colors active:scale-95 transform"
                        onClick={() => {
                            setIsLocked(false);
                            logout();
                        }}
                    >
                        {t.lock.switchAccount}
                    </button>
                </div>
            )}

            <DashboardSidebar
                currentView={currentView}
                setCurrentView={setCurrentView}
                setSelectedSystem={setSelectedSystem}
                setScriptQuery={setScriptQuery}
                setShowLogoutConfirm={setShowLogoutConfirm}
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