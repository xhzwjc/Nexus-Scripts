import React, {useState, useEffect, useMemo, useCallback, useRef} from 'react';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from './components/ui/card';
import {Button} from './components/ui/button';
import {Badge} from './components/ui/badge';
import {Input} from './components/ui/input';
import {Toaster, toast} from 'sonner';
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
    ShieldCheck
} from 'lucide-react';
import SettlementScript from './components/SettlementScript';
import CommissionScript from './components/CommissionScript';
import BalanceScript from './components/BalanceScript';
import TaskAutomationScript from './components/TaskAutomationScript';
import SmsManagementScript from "./components/BatchSmsScript";
import TaxReportReportManagement from "./components/TaxReportManagement";
import './App.css';
import TaxCalculationScript from "@/components/TaxCalculatorScript";
import PaymentStatsScript from '@/components/PaymentStatsScript';
import OCRScript from "@/components/OCRScript";
import DeliveryScript from "@/components/DeliveryScript";

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
                icon: <Settings className="w-5 h-5"/>,
                status: 'stable' as const
            },
            {
                id: 'commission',
                name: '渠道佣金计算与验证',
                description: '计算渠道佣金并进行数据校验',
                icon: <Calculator className="w-5 h-5"/>,
                status: 'stable' as const
            },
            {
                id: 'balance',
                name: '企业账户余额核对',
                description: '核对企业账户余额的准确性',
                icon: <Database className="w-5 h-5"/>,
                status: 'active' as const
            },
            {
                id: 'task-automation',
                name: '任务自动化管理工具',
                description: '批量执行用户任务流程操作',
                icon: <Users className="w-5 h-5"/>,
                status: 'beta' as const
            },
            {
                id: 'sms_operations_center',
                name: '短信运营中心',
                description: '模板管理与批量发送、补发综合工具',
                icon: <Send className="w-5 h-5"/>,
                status: 'beta' as const
            },
            {
                id: 'tax-reporting',
                name: '税务报表生成',
                description: '按企业和月份生成完税数据报表并导出',
                icon: <FileText className="w-5 h-5"/>,
                status: 'beta' as const
            },
            {
                id: 'tax-calculation',
                name: '税额计算工具',
                description: '计算个人所得税明细，支持模拟数据与跨年计算',
                icon: <Percent className="w-5 h-5"/>,
                status: 'stable' as const
            },
            {
                id: 'payment-stats',
                name: '结算与开票统计',
                description: '统计已开票/未开票金额及平台总结算',
                icon: <BarChart3 className="w-5 h-5"/>,
                status: 'beta' as const
            },
            {
                id: 'delivery-tool',
                name: '交付物提交工具',
                description: '协助运营人员为指定用户快速提交任务交付物',
                icon: <FileText className="w-5 h-5"/>,
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

const StatWidget: React.FC<StatWidgetProps> = ({title, value, icon: Icon, trend, bgColor, iconColor}) => (
    <div
        className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm border border-slate-200/50 dark:border-slate-800 rounded-xl p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-all group">
        <div className={`p-3 rounded-lg ${bgColor} group-hover:scale-105 transition-transform duration-300`}>
            <Icon className={`w-6 h-6 ${iconColor}`}/>
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

const DashboardHeader: React.FC<DashboardHeaderProps> = ({user, onLogout}) => {
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
                    <Power className="w-5 h-5"/>
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
            <div className="absolute inset-0 bg-black/50" onClick={onCancel}/>
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
const StatusChip: React.FC<React.PropsWithChildren<{ className?: string }>> = ({children, className}) => (
    <div
        className={`h-9 px-3 inline-flex items-center gap-2 rounded-md border bg-white/40 backdrop-blur shadow-sm text-sm leading-none ${className || ''}`}>
        {children}
    </div>
);

const StatusGroup: React.FC<React.PropsWithChildren> = ({children}) => (
    <div className="flex items-center justify-end flex-wrap gap-2">
        {children}
    </div>
);

/* ============== 悬停效果组件 ============== */
const HoverFloatCard: React.FC<React.PropsWithChildren<{ className?: string }>> = ({children, className}) => {
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
                className="pointer-events-none absolute -bottom-2 left-1/2 h-6 w-3/4 -translate-x-1/2 rounded-[50%] bg-sky-900/10 blur-md opacity-0 group-hover:opacity-100 transition duration-300"/>
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
const TimeChip: React.FC<{ name?: string; now: Date }> = ({name, now}) => {
    const dtf = useMemo(() => new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        weekday: 'short', month: '2-digit', day: '2-digit', hour12: false
    }), []);

    const parts = useMemo(() => {
        const p = dtf.formatToParts(now);
        const get = (type: string) => p.find(x => x.type === type)?.value || '';
        const hour = parseInt(get('hour') || '0', 10);
        return {hour, minute: get('minute'), second: get('second'), weekday: get('weekday')};
    }, [dtf, now]);

    const greeting = parts.hour < 6 ? '自律' : parts.hour < 12 ? '早安' : parts.hour < 14 ? '午安' : parts.hour < 18 ? '下午好' : '晚上好';

    return (
        <StatusChip>
            <Clock className="w-4 h-4 text-primary"/>
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
}> = ({state, refreshing, label = '北京', onRefresh}) => {
    const weatherIcon = (code?: string) => {
        if (!code) return <Cloud className="w-4 h-4"/>;
        const iconMap: Record<string, React.ReactNode> = {
            "100": <Sun className="w-4 h-4"/>,          // 晴
            "101": <Cloud className="w-4 h-4"/>,         // 多云
            "102": <Cloud className="w-4 h-4"/>,         // 少云
            "103": <Cloud className="w-4 h-4"/>,         // 晴间多云
            "104": <Cloud className="w-4 h-4"/>,         // 阴
            "300": <CloudRain className="w-4 h-4"/>,     // 阵雨
            "301": <CloudRain className="w-4 h-4"/>,     // 强阵雨
            "302": <CloudLightning className="w-4 h-4"/>, // 雷阵雨
            "303": <CloudLightning className="w-4 h-4"/>, // 强雷阵雨
            "304": <CloudRain className="w-4 h-4"/>,     // 冰雹
            "305": <CloudRain className="w-4 h-4"/>,     // 小雨
            "306": <CloudRain className="w-4 h-4"/>,     // 中雨
            "307": <CloudRain className="w-4 h-4"/>,     // 大雨
            "308": <CloudRain className="w-4 h-4"/>,     // 极端降雨
            "309": <CloudRain className="w-4 h-4"/>,     // 毛毛雨
            "310": <CloudRain className="w-4 h-4"/>,     // 暴雨
            "311": <CloudRain className="w-4 h-4"/>,     // 大暴雨
            "312": <CloudRain className="w-4 h-4"/>,     // 特大暴雨
            "313": <CloudRain className="w-4 h-4"/>,     // 冻雨
            "400": <CloudSnow className="w-4 h-4"/>,     // 小雪
            "401": <CloudSnow className="w-4 h-4"/>,     // 中雪
            "402": <CloudSnow className="w-4 h-4"/>,     // 大雪
            "403": <CloudSnow className="w-4 h-4"/>,     // 暴雪
            "404": <CloudRain className="w-4 h-4"/>,     // 雨夹雪
            "405": <CloudRain className="w-4 h-4"/>,     // 雨雪天气
            "406": <CloudSnow className="w-4 h-4"/>,     // 阵雨夹雪
            "407": <CloudSnow className="w-4 h-4"/>,     // 阵雪
            "500": <CloudFog className="w-4 h-4"/>,      // 薄雾
            "501": <CloudFog className="w-4 h-4"/>,      // 雾
            "502": <CloudFog className="w-4 h-4"/>,      // 霾
            "503": <CloudFog className="w-4 h-4"/>,      // 扬沙
            "504": <CloudFog className="w-4 h-4"/>,      // 浮尘
            "507": <CloudFog className="w-4 h-4"/>,      // 沙尘暴
            "508": <CloudFog className="w-4 h-4"/>,      // 强沙尘暴
            "900": <Sun className="w-4 h-4"/>,           // 热
            "901": <Thermometer className="w-4 h-4"/>,   // 冷
            "999": <Cloud className="w-4 h-4"/>          // 未知
        };
        return iconMap[code] || <Cloud className="w-4 h-4"/>;
    };

    return (
        <StatusChip>
            <MapPin className="w-4 h-4 text-primary"/>
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
                        <Wind className="inline w-3 h-3 mr-1"/>
                        {state.data.wind} km/h
                    </span>
                    <span className="text-muted-foreground hidden lg:inline">
                        <Droplets className="inline w-3 h-3 mx-1"/>
                        {state.data.humidity}%
                    </span>
                    {refreshing &&
                        <Loader2 className="w-3 h-3 ml-1 animate-spin text-muted-foreground" aria-label="刷新中"/>}
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
            <TimeChip name={user?.name} now={now}/>
            <StatusChip>
                <UserIcon className="w-4 h-4 text-primary"/>
                <span className="whitespace-nowrap">{user.name} ({user.role})</span>
            </StatusChip>
            <Button variant="ghost" className="h-9 px-3" onClick={onLogoutClick}>退出</Button>
        </StatusGroup>
    </div>
);

/* ============== 主应用 ============== */
export default function App() {
    const [currentView, setCurrentView] = useState<'home' | 'system' | 'script' | 'ocr-tool'>('home');
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
    const [weather, setWeather] = useState<WeatherState>({loading: true});
    const [weatherRefreshing, setWeatherRefreshing] = useState(false);

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const refreshWeather = useCallback(async (options?: { background?: boolean }) => {
        const background = !!options?.background;
        const apiKey = process.env.NEXT_PUBLIC_HEWEATHER_API_KEY;
        const apiHost = process.env.NEXT_PUBLIC_HEWEATHER_HOST;
        if (!apiKey || !apiHost) {
            setWeather(prev => ({...prev, loading: false, error: 'config'}));
            return;
        }
        if (!background) setWeatherRefreshing(true);
        try {
            const res = await fetch(`https://${apiHost}/v7/weather/now?location=101010100&lang=zh`, {headers: {"X-QW-Api-Key": apiKey}});
            const data = await res.json();
            if (data.code !== "200") throw new Error(data.code);
            const parsed = {
                temp: parseInt(data.now.temp),
                desc: data.now.text,
                wind: parseFloat(data.now.windSpeed),
                humidity: parseInt(data.now.humidity),
                code: data.now.icon
            };
            setWeather({loading: false, data: parsed});
            localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ts: Date.now(), data: parsed}));
        } catch {
            setWeather(prev => prev.data ? {...prev, loading: false, error: 'err'} : {
                loading: false,
                error: 'err',
                data: {temp: 25, desc: "晴", wind: 10, humidity: 50, code: "100"}
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
                    setWeather({loading: false, data: c.data});
                    hasCached = true;
                }
            } catch {
            }
        }
        refreshWeather({background: hasCached});
        const i = setInterval(() => refreshWeather({background: true}), WEATHER_TTL);
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
            k, {...s, scripts: s.scripts.filter(sc => user.permissions[sc.id])}
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
        if (currentView === 'ocr-tool') return <OCRScript onBack={() => setCurrentView('home')}/>;
        switch (selectedScript) {
            case 'settlement':
                return <SettlementScript onBack={() => setCurrentView('system')}/>;
            case 'commission':
                return <CommissionScript onBack={() => setCurrentView('system')}/>;
            case 'balance':
                return <BalanceScript onBack={() => setCurrentView('system')}/>;
            case 'task-automation':
                return <TaskAutomationScript onBack={() => setCurrentView('system')}/>;
            case 'sms_operations_center':
                return <SmsManagementScript onBack={() => setCurrentView('system')}/>;
            case 'tax-reporting':
                return <TaxReportReportManagement onBack={() => setCurrentView('system')}/>;
            case 'tax-calculation':
                return <TaxCalculationScript onBack={() => setCurrentView('system')}/>;
            case 'payment-stats':
                return <PaymentStatsScript onBack={() => setCurrentView('system')}/>;
            case 'delivery-tool':
                return <DeliveryScript onBack={() => setCurrentView('system')}/>;
            default:
                return null;
        }
    };

    if (isLoading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2
        className="w-10 h-10 text-primary animate-spin"/></div>;

    if (!currentUser) {
        return (
            <div className="min-h-screen colorful-background flex items-center justify-center p-6">
                <Toaster richColors position="top-center"/>
                <Card className="w-full max-w-md animate-fadeIn shadow-xl border-0 bg-white/90 backdrop-blur">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl flex items-center justify-center gap-2"><Lock
                            className="w-5 h-5"/> 访问授权</CardTitle>
                        <CardDescription>请输入您的访问密钥以使用系统</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {errorMessage &&
                            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-md"><AlertCircle
                                className="w-4 h-4"/><span>{errorMessage}</span></div>}
                        <Input type="password" placeholder="输入访问密钥" value={userKey}
                               onChange={e => setUserKey(e.target.value)}
                               onKeyDown={e => e.key === 'Enter' && !isVerifying && validateKey()}
                               disabled={isVerifying}/>
                        <Button className="w-full" onClick={validateKey} disabled={isVerifying}>{isVerifying ?
                            <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : '验证并进入系统'}</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (currentView === 'script' || currentView === 'ocr-tool') return renderScript();

    // -----------------------------------------------------------
    // 首页 (背景修复 + 透明 Header)
    // -----------------------------------------------------------
    if (currentView === 'home') {
        return (
            <div className="min-h-screen colorful-background flex flex-col relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none">
                    <div
                        className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px]"/>
                    <div
                        className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-400/10 blur-[100px]"/>
                </div>

                <Toaster richColors position="top-center"/>

                {/* 顶部导航 */}
                <DashboardHeader user={currentUser} onLogout={() => setShowLogoutConfirm(true)}/>

                {/* 核心内容区 - 垂直居中 */}
                <main className="flex-1 flex flex-col justify-center py-20 px-6 z-10">
                    <div className="max-w-6xl mx-auto w-full space-y-8">

                        {/* 1. 欢迎语与态势感知区域 */}
                        <div className="space-y-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
                                        工作台概览
                                    </h1>
                                    <p className="text-muted-foreground mt-2 text-lg">
                                        下午好，{currentUser?.name}。所有系统节点运行正常。
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <TimeChip now={now}/>
                                    <WeatherChip state={weather} refreshing={weatherRefreshing}
                                                 onRefresh={() => refreshWeather({background: false})}/>
                                </div>
                            </div>

                            {/* 数据仪表盘 */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <StatWidget
                                    title="Total Scripts Available"
                                    value={totalScripts}
                                    icon={Database}
                                    bgColor="bg-blue-50 dark:bg-blue-900/20"
                                    iconColor="text-blue-600 dark:text-blue-400"
                                    trend="Ready"
                                />
                                <StatWidget
                                    title="System Health"
                                    value="100%"
                                    icon={ShieldCheck}
                                    bgColor="bg-emerald-50 dark:bg-emerald-900/20"
                                    iconColor="text-emerald-600 dark:text-emerald-400"
                                    trend="Stable"
                                />
                                <StatWidget
                                    title="Total Tasks Executed"
                                    value="♾️"
                                    icon={Server}
                                    bgColor="bg-violet-50 dark:bg-violet-900/20"
                                    iconColor="text-violet-600 dark:text-violet-400"
                                    trend="+12% 本周"
                                />
                            </div>
                        </div>

                        {/* 2. 系统卡片入口 (视觉重心) */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-auto md:h-[320px]">

                            {/* 左侧：CM 主系统 */}
                            <div className="md:col-span-7 h-full">
                                <HoverFloatCard className="h-full">
                                    <Card
                                        className="h-full cursor-pointer border-0 shadow-lg bg-white/50 backdrop-blur-sm relative overflow-hidden group"
                                        onClick={() => {
                                            setSelectedSystem('chunmiao');
                                            setCurrentView('system');
                                        }}
                                    >
                                        <div
                                            className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                            <Zap className="w-32 h-32"/>
                                        </div>

                                        <CardHeader className="relative z-10">
                                            <div className="flex justify-between items-start">
                                                <div className="p-3 bg-blue-100 rounded-xl w-fit">
                                                    <Settings className="w-8 h-8 text-blue-600"/>
                                                </div>
                                                <Badge
                                                    className="bg-green-500/10 text-green-700 hover:bg-green-500/20 border-0 px-3 py-1">
                                                    <span className="relative flex h-2 w-2 mr-2">
                                                        <span
                                                            className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                        <span
                                                            className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                                    </span>
                                                    运行中
                                                </Badge>
                                            </div>
                                            <CardTitle className="text-2xl mt-4">CM 核心业务系统</CardTitle>
                                            <CardDescription className="text-base line-clamp-2">
                                                包含结算、佣金验证、自动化任务调度等 {systems['chunmiao'].scripts.length} 个核心脚本。
                                            </CardDescription>
                                        </CardHeader>

                                        <CardContent className="relative z-10 mt-auto pt-8">
                                            <div className="space-y-4">
                                                <div className="flex flex-wrap gap-2">
                                                    {systems['chunmiao'].scripts.slice(0, 4).map(s => (
                                                        <span key={s.id}
                                                              className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">
                                                            {s.name}
                                                        </span>
                                                    ))}
                                                    <span
                                                        className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-400">...</span>
                                                </div>
                                                <Button
                                                    className="w-full shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] transition-all duration-300"
                                                    size="lg"
                                                    onClick={() => {
                                                        setSelectedSystem('chunmiao');
                                                        setCurrentView('system');
                                                    }}
                                                >
                                                    进入工作台 <ArrowLeft className="w-4 h-4 ml-2 rotate-180"/>
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </HoverFloatCard>
                            </div>

                            {/* 右侧：HS 系统 */}
                            <div className="md:col-span-5 h-full">
                                <HoverFloatCard className="h-full">
                                    <Card
                                        className="h-full border-dashed border-2 bg-white/30 backdrop-blur-sm flex flex-col justify-between relative overflow-hidden">
                                        <div className="absolute inset-0 opacity-[0.03]"
                                             style={{
                                                 backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
                                                 backgroundSize: '20px 20px'
                                             }}>
                                        </div>

                                        <CardHeader>
                                            <div className="flex justify-between items-start">
                                                <div
                                                    className="p-3 bg-slate-100 rounded-xl w-fit grayscale opacity-70">
                                                    <Cloud className="w-8 h-8 text-slate-600"/>
                                                </div>
                                                <Badge variant="outline" className="text-slate-500 border-slate-300">
                                                    <Clock className="w-3 h-3 mr-1"/> 规划中
                                                </Badge>
                                            </div>
                                            <CardTitle className="text-xl mt-4 text-slate-600">HS 辅助系统</CardTitle>
                                            <CardDescription>
                                                新一代数据看板与辅助工具集，当前处于架构设计阶段。
                                            </CardDescription>
                                        </CardHeader>

                                        <CardContent
                                            className="flex-1 flex flex-col items-center justify-center text-center pb-8 opacity-60">
                                            <div
                                                className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                                                <Lock className="w-8 h-8 text-slate-400"/>
                                            </div>
                                            <p className="text-sm font-medium text-slate-500">即将上线</p>
                                        </CardContent>
                                    </Card>
                                </HoverFloatCard>
                            </div>
                        </div>

                        {/* 3. 底部快捷工具栏 */}
                        <div
                            className="flex items-center justify-between pt-8 border-t border-slate-200/60 dark:border-slate-800">
                            <div className="flex gap-4">
                                <Button variant="ghost" size="sm" onClick={() => setCurrentView('ocr-tool')}
                                        className="text-muted-foreground hover:text-primary">
                                    <FileText className="w-4 h-4 mr-2"/>
                                    OCR 识别工具
                                </Button>
                                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
                                    <AlertCircle className="w-4 h-4 mr-2"/>
                                    系统日志（联系管理员）
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">
                                ScriptHub v2.4.0-stable
                            </p>
                        </div>

                    </div>
                </main>

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
            </div>
        );
    }

    // -----------------------------------------------------------
    // 二级页面 (System List)
    // -----------------------------------------------------------
    if (currentView === 'system') {
        const hasFewScripts = filteredScripts.length > 0 && filteredScripts.length <= 2;

        return (
            <div className="min-h-screen colorful-background p-6">
                <Toaster richColors position="top-center"/>
                <div className="max-w-7xl mx-auto">
                    <StatusToolbar
                        leftSlot={(
                            <Button
                                variant="ghost"
                                onClick={() => setCurrentView('home')}
                                className="h-9 hover:bg-white/50"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2"/>
                                返回首页
                            </Button>
                        )}
                        user={currentUser}
                        now={now}
                        weather={weather}
                        weatherRefreshing={weatherRefreshing}
                        onRefreshWeather={() => refreshWeather({background: false})}
                        onLogoutClick={() => setShowLogoutConfirm(true)}
                    />

                    <div className="mb-8 animate-fadeIn">
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-2xl font-bold">{system?.name}</h1>
                            <Badge variant="outline" className="bg-white/50">
                                {filteredScripts.length} / {scripts.length} 个脚本
                            </Badge>
                        </div>
                        <p className="text-muted-foreground">{system?.description}</p>
                    </div>

                    <div
                        className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between animate-fadeIn"
                        style={{animationDelay: '0.1s'}}>
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
                        animate-fadeIn
                        ${hasFewScripts
                        ? 'flex flex-col items-center justify-center min-h-[300px]'
                        : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                    }
                    `} style={{animationDelay: '0.2s'}}>
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
                                        <Play className="w-4 h-4 mr-2"/>
                                        启动脚本
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
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
            </div>
        );
    }

    return null;
}