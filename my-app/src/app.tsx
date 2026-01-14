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
    AlertCircle,
    Loader2,
    Cloud,
    BarChart3,
    Server,
    ShieldCheck,
    ChevronRight,
    CheckCircle,
    ArrowLeft
} from 'lucide-react';
import './App.css';

// 脚本组件导入
import SettlementScript from './components/SettlementScript';
import CommissionScript from './components/CommissionScript';
import BalanceScript from './components/BalanceScript';
import TaskAutomationScript from './components/TaskAutomationScript';
import SmsManagementScript from "./components/BatchSmsScript";
import TaxReportReportManagement from "./components/TaxReportManagement";
import TaxCalculationScript from "./components/TaxCalculatorScript";
import PaymentStatsScript from './components/PaymentStatsScript';
import OCRScript from "@/components/OCRScript";
import DeliveryScript from "./components/DeliveryScript";

// Layout 组件导入
import { HelpPage } from './components/Layout/HelpPage';
import { DashboardSidebar } from './components/Layout/DashboardSidebar';
import { DashboardHeader as DashHeader } from './components/Layout/DashboardHeader';
import { ClothBackground } from './components/Layout/ClothBackground';
import { BubuMascot } from './components/Layout/BubuMascot';
import { QuickActions, saveRecentScript } from './components/Layout/QuickActions';

// UI 组件导入
import { ConfirmDialog } from './components/ui/ConfirmDialog';

// 类型和配置导入
import type { User, ViewType, WeatherState, SystemConfig } from './lib/types';
import {
    keyUserMap,
    allScripts,
    WEATHER_CACHE_KEY,
    WEATHER_TTL,
    getEndOfDayTimestamp
} from './lib/config';

/* ============== 主应用 ============== */
export default function App() {
    const [currentView, setCurrentView] = useState<ViewType>('home');
    const [selectedSystem, setSelectedSystem] = useState<string>('');
    const [selectedScript, setSelectedScript] = useState<string>('');
    const [userKey, setUserKey] = useState('');
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
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
            results.push({ id: 'chunmiao', name: 'CM 核心业务系统', desc: '包含结算、佣金验证、自动化任务调度等核心脚本', type: 'cm' });
        }
        if ('hs辅助系统'.includes(query) || 'hs'.includes(query) || '辅助'.includes(query)) {
            results.push({ id: 'haoshi', name: 'HS 辅助系统', desc: '新一代数据看板与辅助工具集', type: 'hs' });
        }
        return results;
    }, [homeSearchQuery]);

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
                toast.info('由于长时间未操作，系统已自动锁定');
            }
        }, 60000);

        return () => {
            window.removeEventListener('mousemove', updateActivity);
            window.removeEventListener('keydown', updateActivity);
            window.removeEventListener('click', updateActivity);
            clearInterval(checkLock);
        };
    }, [currentUser, isLocked, AUTO_LOCK_MS]);

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
            setLockError('请输入访问密钥');
            return;
        }

        if (input !== userKey.trim()) {
            if (keyUserMap[input]) {
                setLockError('无法解锁：请使用当前登录账号的密钥');
            } else {
                setLockError('密钥无效');
            }
            return;
        }

        setIsLocked(false);
        setLockKey('');
        setLockError('');
        lastActivityRef.current = Date.now();
        toast.success('解锁成功');
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
            const res = await fetch(`https://${apiHost}/v7/weather/now?location=101010100&lang=zh`, { headers: { "X-QW-Api-Key": apiKey } });
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
                data: { temp: 25, desc: "晴", wind: 10, humidity: 50, code: "100" }
            });
        } finally {
            if (!background) setWeatherRefreshing(false);
        }
    }, []);

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
        if (!userKey.trim()) return toast.error("请输入访问密钥");
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
                lastActivityRef.current = Date.now();
                localStorage.setItem('app_last_activity', lastActivityRef.current.toString());
                toast.success("验证成功");
            } else toast.error("无效的访问密钥");
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
    const scripts = system?.scripts ?? [];
    const filteredScripts = useMemo(() => {
        if (!system || !scriptQuery.trim()) return scripts;
        return scripts.filter(s => `${s.name} ${s.description}`.toLowerCase().includes(scriptQuery.trim().toLowerCase()));
    }, [system, scripts, scriptQuery]);

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
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
    );

    // ============== 登录页面 ==============
    if (!currentUser) {
        return (
            <div className="min-h-screen colorful-background flex items-center justify-center p-6">
                <Toaster richColors position="top-center" />
                <Card className="w-full max-w-md animate-fadeIn shadow-xl border-0 bg-white/90 backdrop-blur">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl flex items-center justify-center gap-2">
                            <Lock className="w-5 h-5" /> 访问授权
                        </CardTitle>
                        <CardDescription>请输入您的访问密钥以使用系统</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {errorMessage &&
                            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-md">
                                <AlertCircle className="w-4 h-4" /><span>{errorMessage}</span>
                            </div>
                        }
                        <Input
                            type="password"
                            placeholder="输入访问密钥"
                            value={userKey}
                            onChange={e => setUserKey(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !isVerifying && validateKey()}
                            disabled={isVerifying}
                        />
                        <Button className="w-full" onClick={validateKey} disabled={isVerifying}>
                            {isVerifying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : '验证并进入系统'}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ============== 首页内容 ==============
    const renderHomeContent = () => {
        const hour = now.getHours();
        let timeGreeting = '晚上好';
        if (hour < 6) timeGreeting = '凌晨好';
        else if (hour < 12) timeGreeting = '早安';
        else if (hour < 14) timeGreeting = '午安';
        else if (hour < 18) timeGreeting = '下午好';

        return (
            <div className="max-w-7xl">
                {/* 问候语 */}
                <div className="mb-10">
                    <h1 className="text-3xl font-bold text-slate-800 tracking-tight mb-2">
                        {timeGreeting}, {currentUser?.name}。
                    </h1>
                    <p className="text-slate-500 text-base">
                        所有系统节点运行正常。
                    </p>
                </div>

                {/* 状态徽章行 */}
                <div className="flex items-center gap-4 mb-10">
                    <div className="status-badge">
                        <div className="icon bg-teal-50 text-teal-600">
                            <CheckCircle className="w-4 h-4" />
                        </div>
                        <span className="font-semibold text-slate-700">{totalScripts}</span>
                        <span className="text-slate-500">可运用资</span>
                        <span className="text-teal-600 text-xs ml-1">Ready</span>
                    </div>
                    <div className="status-badge">
                        <div className="icon bg-green-50 text-green-600">
                            <ShieldCheck className="w-4 h-4" />
                        </div>
                        <span className="text-slate-500">系统健康</span>
                        <span className="font-semibold text-slate-700">100%</span>
                        <Badge className="bg-green-100 text-green-700 border-0 text-[10px] px-1.5 py-0">Stable</Badge>
                    </div>
                    <div className="status-badge">
                        <div className="icon bg-violet-50 text-violet-600">
                            <Server className="w-4 h-4" />
                        </div>
                        <span className="text-slate-500">累计执行</span>
                        <span className="font-semibold text-slate-700">1.2k</span>
                        <a href="#" className="text-teal-600 text-xs hover:underline">已完成</a>
                    </div>
                </div>

                {/* 系统卡片和快捷操作 */}
                <div className="flex gap-6 items-stretch">
                    {/* 左侧：系统卡片 */}
                    <div className="flex-[3] grid grid-cols-2 gap-6">
                        {/* CM 核心业务系统 */}
                        <div className="system-card p-6 cursor-pointer flex flex-col h-[250px]" onClick={() => { setSelectedSystem('chunmiao'); setScriptQuery(''); setCurrentView('system'); }}>
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center">
                                    <Settings className="w-6 h-6 text-teal-600" />
                                </div>
                                <Badge className="bg-green-50 text-green-700 border border-green-200 text-[11px] px-2">
                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 inline-block"></span>
                                    运行中
                                </Badge>
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mb-2">CM 核心业务系统</h3>
                            <p className="text-slate-500 text-sm mb-4 leading-relaxed flex-1 overflow-hidden">
                                包含结算脚本、佣金计算、自动化任务调度等 {systems['chunmiao'].scripts.length} 个核心脚本。
                            </p>
                            <button className="btn-teal-gradient w-full mt-auto">
                                进入 CM 系统
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>

                        {/* HS 辅助系统 */}
                        <div className="system-card p-6 flex flex-col h-[250px]">
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                                    <Cloud className="w-6 h-6 text-slate-500" />
                                </div>
                                <Badge variant="outline" className="text-slate-500 border-slate-200 text-[11px] px-2">
                                    规划中
                                </Badge>
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mb-2">HS 辅助系统</h3>
                            <p className="text-slate-500 text-sm mb-4 leading-relaxed flex-1">
                                新一代数据看板与辅助工具集，当前处于架构设计阶段。
                            </p>
                            <button className="btn-outline-gray w-full mt-auto" disabled>
                                功能开发中
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
                        <h1 className="text-2xl font-bold">{system?.name}</h1>
                        <Badge variant="outline" className="bg-white/50">
                            {filteredScripts.length} / {scripts.length} 个脚本
                        </Badge>
                    </div>
                    <p className="text-muted-foreground">{system?.description}</p>
                </div>

                <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm text-muted-foreground">
                        {scripts.length > 0 ? '通过关键字快速查找需要运行的脚本。' : '当前系统暂未开放脚本。'}
                    </p>
                    {scripts.length > 0 && (
                        <Input
                            value={scriptQuery}
                            onChange={(event) => setScriptQuery(event.target.value)}
                            placeholder="搜索脚本名称或描述"
                            className="md:max-w-sm bg-white/80"
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
                                cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1 bg-white/80 backdrop-blur-sm
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
                                            <CardTitle className="text-lg">{script.name}</CardTitle>
                                            <Badge className={`mt-2 border ${getStatusColor(script.status)}`}>
                                                {script.status}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <CardDescription className="mb-4 min-h-[40px]">
                                    {script.description}
                                </CardDescription>
                                <Button
                                    className="w-full"
                                    onClick={() => {
                                        setSelectedScript(script.id);
                                        saveRecentScript(userKey, selectedSystem, script.id);
                                        setCurrentView('script');
                                    }}
                                >
                                    <Play className="w-4 h-4 mr-2" />
                                    启动脚本
                                </Button>
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
            <ClothBackground />
            <Toaster richColors position="top-right" />

            {/* 锁屏遮罩 */}
            {isLocked && (
                <div className="lock-screen z-50">
                    <div className="lock-avatar">
                        {currentUser?.name?.charAt(0) || 'U'}
                    </div>
                    <p className="text-lg font-medium text-slate-700">{currentUser?.name}</p>
                    <p className="text-sm text-slate-500 -mt-2">系统已锁定，请输入密钥解锁</p>
                    <div className="lock-input-wrapper">
                        <input
                            type="password"
                            placeholder="输入访问密钥"
                            value={lockKey}
                            onChange={(e) => setLockKey(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                        />
                        <button onClick={handleUnlock}>解锁</button>
                    </div>
                    {lockError && <p className="text-sm text-red-500">{lockError}</p>}
                    <button
                        className="mt-4 text-xs text-slate-400 hover:text-slate-600 transition-colors active:scale-95 transform"
                        onClick={() => {
                            setIsLocked(false);
                            logout();
                        }}
                    >
                        切换账号 / 重新登录
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
                />

                <main className={`flex-1 overflow-y-auto overflow-x-hidden relative scrollbar-hide ${currentView === 'help' ? 'p-0' : 'p-6'}`}>
                    {currentView === 'home' && renderHomeContent()}
                    {currentView === 'system' && renderSystemContent()}
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
                </main>
            </div>

            <ConfirmDialog
                open={showLogoutConfirm}
                title="确认退出登录？"
                description="退出后需要重新输入访问密钥才可继续使用。"
                confirmText="确认退出"
                cancelText="取消"
                onCancel={() => setShowLogoutConfirm(false)}
                onConfirm={() => {
                    setShowLogoutConfirm(false);
                    logout();
                    toast.success('已退出登录');
                }}
            />
            <BubuMascot />
        </div>
    );
}