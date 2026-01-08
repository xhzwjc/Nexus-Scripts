import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Input } from './components/ui/input';
import { Toaster, toast } from 'sonner';
import {
    ArrowLeft,
    Settings,
    Play,
    Database,
    Calculator,
    Users,
    CheckCircle,
    Send,
    FileText,
    Percent,
    Lock,
    AlertCircle,
    Loader2,
    Clock,
    MapPin,
    Thermometer,
    Cloud,
    Wind,
    Droplets,
    Sun,
    CloudRain,
    CloudSnow,
    CloudFog,
    CloudLightning,
    BarChart3,
    User as UserIcon,
    Power,
    Server,
    Zap,
    ShieldCheck,
    ChevronRight,
    LogOut,
    Search,
    ScanLine,
    Wrench,
    ScrollText,
    CircleHelp
} from 'lucide-react';
import SettlementScript from './components/SettlementScript';
import CommissionScript from './components/CommissionScript';
import BalanceScript from './components/BalanceScript';
import TaskAutomationScript from './components/TaskAutomationScript';
import SmsManagementScript from "./components/BatchSmsScript";
import TaxReportReportManagement from "./components/TaxReportManagement";
import './App.css';
import TaxCalculationScript from "./components/TaxCalculatorScript";
import PaymentStatsScript from './components/PaymentStatsScript';
import OCRScript from "@/components/OCRScript";
import DeliveryScript from "./components/DeliveryScript";
import { HelpPage } from './components/Layout/HelpPage';
import { DashboardSidebar } from './components/Layout/DashboardSidebar';
import { DashboardHeader as DashHeader } from './components/Layout/DashboardHeader';
import { ClothBackground } from './components/Layout/ClothBackground';
import { BubuMascot } from './components/Layout/BubuMascot';

// 角色类型与权限映射
type Role = 'admin' | 'operator' | 'custom' | 'QA' | 'PM';

interface Permission {
    [scriptId: string]: boolean;
}

interface User {
    role: Role;
    permissions: Permission;
    name?: string;
}

// 存储在localStorage中的认证信息类型
interface AuthData {
    key: string;
    user: User;
    expiresAt: number; // 时间戳，当天23:59:59
}

// 密钥与用户映射表 (实际应用中应存储在后端)
const keyUserMap: Record<string, User> = {
    // 超管密钥 - 拥有所有权限
    'K3^%w4qPz@!5RZ#hT7*eF1nD8~L0bV&cXoM9uA2j': {
        role: 'admin',
        permissions: {
            'settlement': true,
            'commission': true,
            'balance': true,
            'task-automation': true,
            'sms_operations_center': true,
            'tax-reporting': true,
            'tax-calculation': true,
            'payment-stats': true,
            'delivery-tool': true
        },
        name: '系统管理员'
    },
    // 运营人员密钥 - 仅税务报表权限
    'pE7#tV4^Rk!2zF1&B@8cU5*mO~yW6%LxJ3dQ0nHa': {
        role: 'operator',
        permissions: {
            'tax-reporting': true,
            'tax-calculation': true,
            'payment-stats': true,
            'delivery-tool': true
        },
        name: '运营人员'
    },
    // 自定义角色
    'wjc': {
        role: 'QA',
        permissions: {
            'settlement': true,
            'commission': true,
            'balance': true,
            'task-automation': true,
            'sms_operations_center': true,
            'tax-reporting': true,
            'tax-calculation': true,
            'payment-stats': true,
            'delivery-tool': true
        },
        name: 'JC'
    },
    // 经理
    'U5*mO~yW6%LxJ3dQ0nHaD8~L0bV&cXoM9uA2j': {
        role: 'PM',
        permissions: {
            'settlement': true,
            'commission': true,
            'balance': true,
            'task-automation': true,
            'sms_operations_center': true,
            'tax-reporting': true,
            'tax-calculation': true,
            'payment-stats': true,
            'delivery-tool': true
        },
        name: '**'
    },
};

interface Script {
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
    status: 'active' | 'beta' | 'stable';
}

const allScripts: Record<string, { name: string; description: string; scripts: Script[] }> = {
    chunmiao: {
        name: 'CM系统',
        description: '一个用于管理企业和渠道业务流程的综合系统',
        scripts: [
            {
                id: 'settlement',
                name: '结算处理脚本',
                description: '批量处理企业结算任务，支持并发执行',
                icon: <Settings className="w-5 h-5" />,
                status: 'stable' as const
            },
            {
                id: 'commission',
                name: '渠道佣金计算与验证',
                description: '计算渠道佣金并进行数据校验',
                icon: <Calculator className="w-5 h-5" />,
                status: 'stable' as const
            },
            {
                id: 'balance',
                name: '企业账户余额核对',
                description: '核对企业账户余额的准确性',
                icon: <Database className="w-5 h-5" />,
                status: 'active' as const
            },
            {
                id: 'task-automation',
                name: '任务自动化管理工具',
                description: '批量执行用户任务流程操作',
                icon: <Users className="w-5 h-5" />,
                status: 'beta' as const
            },
            {
                id: 'sms_operations_center',
                name: '短信运营中心',
                description: '模板管理与批量发送、补发综合工具',
                icon: <Send className="w-5 h-5" />,
                status: 'beta' as const
            },
            {
                id: 'tax-reporting',
                name: '税务报表生成',
                description: '按企业和月份生成完税数据报表并导出',
                icon: <FileText className="w-5 h-5" />,
                status: 'beta' as const
            },
            {
                id: 'tax-calculation',
                name: '税额计算工具',
                description: '计算个人所得税明细，支持模拟数据与跨年计算',
                icon: <Percent className="w-5 h-5" />,
                status: 'stable' as const
            },
            {
                id: 'payment-stats',
                name: '结算与开票统计',
                description: '统计已开票/未开票金额及平台总结算',
                icon: <BarChart3 className="w-5 h-5" />,
                status: 'beta' as const
            },
            {
                id: 'delivery-tool',
                name: '交付物提交工具',
                description: '协助运营人员为指定用户快速提交任务交付物',
                icon: <FileText className="w-5 h-5" />,
                status: 'beta' as const
            }
        ]
    },
    haoshi: {
        name: 'HS系统',
        description: '即将上线更多脚本功能',
        scripts: []
    }
};

// 计算当天结束时间戳（23:59:59）
const getEndOfDayTimestamp = () => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    return now.getTime();
};

/* ============== 仪表盘统计小组件 (已修复定义) ============== */
interface StatWidgetProps {
    title: string;
    value: string | number;
    icon: React.ElementType;
    trend?: string;
    bgColor: string;   // 新增属性
    iconColor: string; // 新增属性
}

const StatWidget: React.FC<StatWidgetProps> = ({ title, value, icon: Icon, trend, bgColor, iconColor }) => (
    <div
        className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm border border-slate-200/50 dark:border-slate-800 rounded-xl p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-all group">
        <div className={`p-3 rounded-lg ${bgColor} group-hover:scale-105 transition-transform duration-300`}>
            <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
        <div>
            <p className="text-sm text-slate-500 font-medium">{title}</p>
            <div className="flex items-end gap-2">
                <h4 className="text-2xl font-bold leading-none text-slate-800 dark:text-slate-100">{value}</h4>
                {trend && <span
                    className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full mb-0.5">{trend}</span>}
            </div>
        </div>
    </div>
);

/* ============== 顶部导航栏 (透明化) ============== */
interface DashboardHeaderProps {
    user: User | null;
    onLogout: () => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ user, onLogout }) => {
    if (!user) return null;

    return (
        <header
            className="fixed top-0 left-0 right-0 h-16 px-6 bg-white/10 backdrop-blur-md border-b border-white/10 z-50 flex items-center justify-between transition-all">
            <div className="flex items-center gap-2">
                <div
                    className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-primary/30">
                    S
                </div>
                <span className="font-bold text-lg tracking-tight text-slate-800">
                    ScriptHub <span className="text-primary font-normal opacity-80">Dashboard</span>
                </span>
            </div>
            <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                    <p className="text-sm font-medium leading-none text-slate-700">{user.name}</p>
                    <p className="text-xs text-muted-foreground">
                        {user.role === 'admin' ? '系统管理员' : user.role}
                    </p>
                </div>
                <div className="h-8 w-[1px] bg-slate-400/30 mx-1"></div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onLogout}
                    className="text-muted-foreground hover:text-red-500 hover:bg-red-50/50"
                >
                    <Power className="w-5 h-5" />
                </Button>
            </div>
        </header>
    );
};

/* ============== 确认弹窗 ============== */
interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    open,
    title,
    description,
    confirmText = '确认',
    cancelText = '取消',
    onConfirm,
    onCancel
}) => {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
            <div className="relative w-full max-w-sm p-4">
                <Card className="animate-fadeIn">
                    <CardHeader>
                        <CardTitle className="text-lg">{title}</CardTitle>
                        {description && <CardDescription>{description}</CardDescription>}
                    </CardHeader>
                    <CardContent>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={onCancel}>{cancelText}</Button>
                            <Button onClick={onConfirm}>{confirmText}</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

/* ============== 状态 Chip 组件 ============== */
const StatusChip: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className }) => (
    <div
        className={`h-9 px-3 inline-flex items-center gap-2 rounded-md border bg-white/40 backdrop-blur shadow-sm text-sm leading-none ${className || ''}`}>
        {children}
    </div>
);

const StatusGroup: React.FC<React.PropsWithChildren> = ({ children }) => (
    <div className="flex items-center justify-end flex-wrap gap-2">
        {children}
    </div>
);

/* ============== 悬停效果组件 ============== */
const HoverFloatCard: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className }) => {
    const ref = useRef<HTMLDivElement>(null);

    const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const rx = ((y / rect.height) - 0.5) * 6;
        const ry = ((x / rect.width) - 0.5) * -6;
        el.style.setProperty('--rx', `${rx}deg`);
        el.style.setProperty('--ry', `${ry}deg`);
        el.style.setProperty('--mx', `${x}px`);
        el.style.setProperty('--my', `${y}px`);
    };

    const onLeave = () => {
        const el = ref.current;
        if (!el) return;
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
    };

    return (
        <div
            ref={ref}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
            className={`group relative [perspective:1000px] ${className || ''}`}
        >
            <div
                className="pointer-events-none absolute -bottom-2 left-1/2 h-6 w-3/4 -translate-x-1/2 rounded-[50%] bg-sky-900/10 blur-md opacity-0 group-hover:opacity-100 transition duration-300" />
            <div
                className="
          relative rounded-xl h-full
          transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)]
          [transform-style:preserve-3d]
          [transform:rotateX(var(--rx,0))_rotateY(var(--ry,0))]
          group-hover:-translate-y-2 group-hover:scale-[1.01]
          group-hover:shadow-[0_20px_40px_rgba(56,189,248,0.18)]
          bg-white/40 dark:bg-white/[0.06] backdrop-blur-md
          ring-1 ring-white/40
        "
            >
                {children}
            </div>
            <div
                className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                    background:
                        'radial-gradient(240px 140px at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.35), rgba(255,255,255,0.12) 35%, transparent 60%)'
                }}
            />
        </div>
    );
};


/* ============== 时间 Chip ============== */
const TimeChip: React.FC<{ name?: string; now: Date }> = ({ name, now }) => {
    const dtf = useMemo(() => new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        weekday: 'short', month: '2-digit', day: '2-digit', hour12: false
    }), []);

    const parts = useMemo(() => {
        const p = dtf.formatToParts(now);
        const get = (type: string) => p.find(x => x.type === type)?.value || '';
        const hour = parseInt(get('hour') || '0', 10);
        return { hour, minute: get('minute'), second: get('second'), weekday: get('weekday') };
    }, [dtf, now]);

    const greeting = parts.hour < 6 ? '自律' : parts.hour < 12 ? '早安' : parts.hour < 14 ? '午安' : parts.hour < 18 ? '下午好' : '晚上好';

    return (
        <StatusChip>
            <Clock className="w-4 h-4 text-primary" />
            <span className="whitespace-nowrap tabular-nums font-mono">
                {parts.hour.toString().padStart(2, '0')}:{parts.minute}:{parts.second}
            </span>
            <span className="text-muted-foreground hidden sm:inline">{parts.weekday}</span>
            <span className="text-muted-foreground hidden lg:inline">| {greeting}{name ? `, ${name}` : ''}</span>
        </StatusChip>
    );
};

/* ============== 天气 Chip ============== */
type WeatherData = { temp: number; desc: string; wind: number; humidity: number; code: string; };
type WeatherState = { loading: boolean; error?: string; data?: WeatherData; };
const WEATHER_CACHE_KEY = 'heweather_bj_cache';
const WEATHER_TTL = 10 * 60 * 1000;

const WeatherChip: React.FC<{
    state: WeatherState;
    refreshing: boolean;
    label?: string;
    onRefresh?: () => void;
}> = ({ state, refreshing, label = '北京', onRefresh }) => {
    const weatherIcon = (code?: string) => {
        if (!code) return <Cloud className="w-4 h-4" />;
        const iconMap: Record<string, React.ReactNode> = {
            "100": <Sun className="w-4 h-4" />,          // 晴
            "101": <Cloud className="w-4 h-4" />,         // 多云
            "102": <Cloud className="w-4 h-4" />,         // 少云
            "103": <Cloud className="w-4 h-4" />,         // 晴间多云
            "104": <Cloud className="w-4 h-4" />,         // 阴
            "300": <CloudRain className="w-4 h-4" />,     // 阵雨
            "301": <CloudRain className="w-4 h-4" />,     // 强阵雨
            "302": <CloudLightning className="w-4 h-4" />, // 雷阵雨
            "303": <CloudLightning className="w-4 h-4" />, // 强雷阵雨
            "304": <CloudRain className="w-4 h-4" />,     // 冰雹
            "305": <CloudRain className="w-4 h-4" />,     // 小雨
            "306": <CloudRain className="w-4 h-4" />,     // 中雨
            "307": <CloudRain className="w-4 h-4" />,     // 大雨
            "308": <CloudRain className="w-4 h-4" />,     // 极端降雨
            "309": <CloudRain className="w-4 h-4" />,     // 毛毛雨
            "310": <CloudRain className="w-4 h-4" />,     // 暴雨
            "311": <CloudRain className="w-4 h-4" />,     // 大暴雨
            "312": <CloudRain className="w-4 h-4" />,     // 特大暴雨
            "313": <CloudRain className="w-4 h-4" />,     // 冻雨
            "400": <CloudSnow className="w-4 h-4" />,     // 小雪
            "401": <CloudSnow className="w-4 h-4" />,     // 中雪
            "402": <CloudSnow className="w-4 h-4" />,     // 大雪
            "403": <CloudSnow className="w-4 h-4" />,     // 暴雪
            "404": <CloudRain className="w-4 h-4" />,     // 雨夹雪
            "405": <CloudRain className="w-4 h-4" />,     // 雨雪天气
            "406": <CloudSnow className="w-4 h-4" />,     // 阵雨夹雪
            "407": <CloudSnow className="w-4 h-4" />,     // 阵雪
            "500": <CloudFog className="w-4 h-4" />,      // 薄雾
            "501": <CloudFog className="w-4 h-4" />,      // 雾
            "502": <CloudFog className="w-4 h-4" />,      // 霾
            "503": <CloudFog className="w-4 h-4" />,      // 扬沙
            "504": <CloudFog className="w-4 h-4" />,      // 浮尘
            "507": <CloudFog className="w-4 h-4" />,      // 沙尘暴
            "508": <CloudFog className="w-4 h-4" />,      // 强沙尘暴
            "900": <Sun className="w-4 h-4" />,           // 热
            "901": <Thermometer className="w-4 h-4" />,   // 冷
            "999": <Cloud className="w-4 h-4" />          // 未知
        };
        return iconMap[code] || <Cloud className="w-4 h-4" />;
    };

    return (
        <StatusChip>
            <MapPin className="w-4 h-4 text-primary" />
            <span className="whitespace-nowrap">{label}</span>
            <span className="text-muted-foreground">·</span>
            {state.loading && !state.data ? (
                <span className="text-muted-foreground">加载中...</span>
            ) : state.error && !state.data ? (
                <span className="text-muted-foreground">天气不可用</span>
            ) : state.data ? (
                <>
                    {weatherIcon(state.data.code)}
                    <span className="whitespace-nowrap tabular-nums font-mono">{state.data.temp}°C</span>
                    <span className="hidden sm:inline">{state.data.desc}</span>
                    <span className="text-muted-foreground hidden md:inline">·</span>
                    <span className="text-muted-foreground hidden md:inline">
                        <Wind className="inline w-3 h-3 mr-1" />
                        {state.data.wind} km/h
                    </span>
                    <span className="text-muted-foreground hidden lg:inline">
                        <Droplets className="inline w-3 h-3 mx-1" />
                        {state.data.humidity}%
                    </span>
                    {refreshing &&
                        <Loader2 className="w-3 h-3 ml-1 animate-spin text-muted-foreground" aria-label="刷新中" />}
                </>
            ) : null}

            {onRefresh && (
                <button
                    type="button"
                    onClick={onRefresh}
                    className="ml-1 text-xs text-primary hover:underline hidden md:inline"
                    aria-label="刷新天气">
                    刷新
                </button>
            )}
        </StatusChip>
    );
};

/* ============== 工具栏 ============== */
interface StatusToolbarProps {
    leftSlot?: React.ReactNode;
    user: User;
    now: Date;
    weather: WeatherState;
    weatherRefreshing: boolean;
    onRefreshWeather: () => void;
    onLogoutClick: () => void;
}

const StatusToolbar: React.FC<StatusToolbarProps> = ({
    leftSlot,
    user,
    now,
    weather,
    weatherRefreshing,
    onRefreshWeather,
    onLogoutClick
}) => (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex-1 min-w-[160px] flex items-center justify-start">
            {leftSlot ?? <span className="text-sm text-transparent">占位</span>}
        </div>
        <StatusGroup>
            <TimeChip name={user?.name} now={now} />
            <StatusChip>
                <UserIcon className="w-4 h-4 text-primary" />
                <span className="whitespace-nowrap">{user.name} ({user.role})</span>
            </StatusChip>
            <Button variant="ghost" className="h-9 px-3" onClick={onLogoutClick}>退出</Button>
        </StatusGroup>
    </div>
);

/* ============== 主应用 ============== */
export default function App() {
    const [currentView, setCurrentView] = useState<'home' | 'system' | 'script' | 'ocr-tool' | 'help'>('home');
    const [selectedSystem, setSelectedSystem] = useState<string>('');
    const [selectedScript, setSelectedScript] = useState<string>('');
    const [userKey, setUserKey] = useState('');
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [systems, setSystems] = useState(allScripts);
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

    // 初始化持久化状态
    useEffect(() => {
        const savedLocked = localStorage.getItem('app_is_locked') === 'true';
        if (savedLocked) setIsLocked(true);

        const savedLastActivity = localStorage.getItem('app_last_activity');
        if (savedLastActivity) {
            const t = parseInt(savedLastActivity);
            if (!isNaN(t)) {
                lastActivityRef.current = t;
                // Use literal since constant is defined later
                if (Date.now() - t > 5 * 60 * 60 * 1000) setIsLocked(true);
            }
        }
    }, []);

    // 监听锁屏状态变化并持久化
    useEffect(() => {
        if (isLocked) {
            localStorage.setItem('app_is_locked', 'true');
        } else {
            localStorage.removeItem('app_is_locked');
        }
    }, [isLocked]);

    // 搜索相关状态
    const [homeSearchQuery, setHomeSearchQuery] = useState('');
    const [showSearchResults, setShowSearchResults] = useState(false);

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

    // 5小时自动锁屏检测
    const AUTO_LOCK_MS = 5 * 60 * 60 * 1000; // 5小时

    useEffect(() => {
        if (!currentUser) return;

        const updateActivity = () => {
            lastActivityRef.current = Date.now();
        };

        // 监听用户活动
        window.addEventListener('mousemove', updateActivity);
        window.addEventListener('keydown', updateActivity);
        window.addEventListener('click', updateActivity);

        // 定时检查是否需要锁屏
        const checkLock = setInterval(() => {
            // 每次检查时更新持久化的活跃时间
            localStorage.setItem('app_last_activity', lastActivityRef.current.toString());

            if (Date.now() - lastActivityRef.current > AUTO_LOCK_MS && !isLocked) {
                setIsLocked(true);
                toast.info('由于长时间未操作，系统已自动锁定');
            }
        }, 60000); // 每分钟检查一次

        return () => {
            window.removeEventListener('mousemove', updateActivity);
            window.removeEventListener('keydown', updateActivity);
            window.removeEventListener('click', updateActivity);
            clearInterval(checkLock);
        };
    }, [currentUser, isLocked]);

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

        // 安全检查：必须使用当前登录用户的密钥解锁
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
            } catch {
            }
        }
        refreshWeather({ background: hasCached });
        const i = setInterval(() => refreshWeather({ background: true }), WEATHER_TTL);
        return () => clearInterval(i);
    }, [refreshWeather]);

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
                } catch {
                }
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

    const system = systems[selectedSystem as keyof typeof systems];
    const scripts = system?.scripts ?? [];
    const filteredScripts = useMemo(() => {
        if (!system || !scriptQuery.trim()) return scripts;
        return scripts.filter(s => `${s.name} ${s.description}`.toLowerCase().includes(scriptQuery.trim().toLowerCase()));
    }, [system, scripts, scriptQuery]);

    // 定义总数变量
    const totalScripts = useMemo(() => (
        Object.values(systems).reduce((total, system) => total + system.scripts.length, 0)
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

    if (isLoading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2
        className="w-10 h-10 text-primary animate-spin" /></div>;

    if (!currentUser) {
        return (
            <div className="min-h-screen colorful-background flex items-center justify-center p-6">
                <Toaster richColors position="top-center" />
                <Card className="w-full max-w-md animate-fadeIn shadow-xl border-0 bg-white/90 backdrop-blur">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl flex items-center justify-center gap-2"><Lock
                            className="w-5 h-5" /> 访问授权</CardTitle>
                        <CardDescription>请输入您的访问密钥以使用系统</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {errorMessage &&
                            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-md"><AlertCircle
                                className="w-4 h-4" /><span>{errorMessage}</span></div>}
                        <Input type="password" placeholder="输入访问密钥" value={userKey}
                            onChange={e => setUserKey(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !isVerifying && validateKey()}
                            disabled={isVerifying} />
                        <Button className="w-full" onClick={validateKey} disabled={isVerifying}>{isVerifying ?
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : '验证并进入系统'}</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // -----------------------------------------------------------
    // 视图渲染组件
    // -----------------------------------------------------------
    const renderHomeContent = () => {
        const hour = now.getHours();
        let timeGreeting = '晚上好';
        if (hour < 6) timeGreeting = '凌晨好';
        else if (hour < 12) timeGreeting = '早安';
        else if (hour < 14) timeGreeting = '午安';
        else if (hour < 18) timeGreeting = '下午好';

        return (
            <div className="max-w-5xl">
                {/* 问候语 */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-slate-800 tracking-tight mb-2">
                        {timeGreeting}, {currentUser?.name}。
                    </h1>
                    <p className="text-slate-500 text-base">
                        {timeGreeting}, {currentUser?.name}。所有系统节点运行正常的系统。
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

                {/* 系统卡片 */}
                <div className="grid grid-cols-2 gap-6">
                    {/* CM 核心业务系统 */}
                    <div className="system-card p-6 cursor-pointer" onClick={() => { setSelectedSystem('chunmiao'); setScriptQuery(''); setCurrentView('system'); }}>
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
                        <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                            包含结算脚本、佣金计算、自动化任务调度等 {systems['chunmiao'].scripts.length} 个核心脚本。
                        </p>
                        <button className="btn-teal-gradient w-full">
                            进入 CM 系统
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {/* HS 辅助系统 */}
                    <div className="system-card p-6">
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                                <Cloud className="w-6 h-6 text-slate-500" />
                            </div>
                            <Badge variant="outline" className="text-slate-500 border-slate-200 text-[11px] px-2">
                                规划中
                            </Badge>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">HS 辅助系统</h3>
                        <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                            新一代数据看板与辅助工具集，当前处于架构设计阶段。
                        </p>
                        <button className="btn-outline-gray w-full">
                            功能开发中
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* 底部版本号 */}
                <footer className="mt-12 text-center md:text-left">
                    <span className="version-badge">ScriptHub v 2.0-stable</span>
                </footer>
            </div>
        );
    };

    const renderSystemContent = () => {
        const hasFewScripts = filteredScripts.length > 0 && filteredScripts.length <= 2;
        return (
            <div className="p-8 max-w-7xl mx-auto w-full">
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
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
    // -----------------------------------------------------------
    // 统一布局渲染
    // -----------------------------------------------------------
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
            <Toaster richColors position="top-right" />
        </div>
    );

}