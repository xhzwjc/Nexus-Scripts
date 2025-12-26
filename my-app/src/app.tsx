import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence, Transition } from 'framer-motion';
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
    Search
} from 'lucide-react';
import SettlementScript from './components/SettlementScript';
import CommissionScript from './components/CommissionScript';
import BalanceScript from './components/BalanceScript';
import TaskAutomationScript from './components/TaskAutomationScript';
import SmsManagementScript from "./components/BatchSmsScript";
import TaxReportReportManagement from "./components/TaxReportManagement";
import './App.css';
import './App.css';
import TaxCalculationScript from "@/components/TaxCalculatorScript";
import PaymentStatsScript from '@/components/PaymentStatsScript';
import OCRScript from "@/components/OCRScript";
import DeliveryScript from "@/components/DeliveryScript";

// iOS 26 Animation Config
const springConfig: Transition = { type: "spring", stiffness: 300, damping: 30 };
const fadeInVariants = {
    initial: { opacity: 0, scale: 0.95, filter: "blur(10px)" },
    animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
    exit: { opacity: 0, scale: 0.95, filter: "blur(10px)" }
};

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

/* ============== 轻量通用确认弹窗（无需额外依赖） ============== */
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

/* ============== 统一高度的状态 Chip 组件 ============== */
const StatusChip: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className }) => (
    <div
        className={`h-9 px-3 inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/40 dark:bg-white/10 backdrop-blur-md shadow-sm text-sm font-bold leading-none text-slate-700 dark:text-slate-200 ${className || ''}`}>
        {children}
    </div>
);

const StatusGroup: React.FC<React.PropsWithChildren> = ({ children }) => (
    <div className="flex items-center justify-end flex-wrap gap-2">
        {children}
    </div>
);

/* ============== 首页卡片悬停“水气球”效果 ============== */
const HoverFloatCard: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className }) => {
    const ref = useRef<HTMLDivElement>(null);

    const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const rx = ((y / rect.height) - 0.5) * 10;   // Increased tilt
        const ry = ((x / rect.width) - 0.5) * -10;   // Increased tilt
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
            {/* 阴影/下坠感 */}
            <div
                className="pointer-events-none absolute -bottom-2 left-1/2 h-6 w-3/4 -translate-x-1/2 rounded-[50%] bg-sky-900/10 blur-md opacity-0 group-hover:opacity-100 transition duration-300" />

            {/* 3D 浮起主体 */}
            <div
                className="
          relative rounded-xl
          transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)]
          [transform-style:preserve-3d]
          [transform:rotateX(var(--rx,0))_rotateY(var(--ry,0))]
          group-hover:-translate-y-2 group-hover:scale-[1.02]
          group-hover:shadow-[0_25px_50px_rgba(0,0,0,0.15)]
          bg-white/60 dark:bg-black/20 backdrop-blur-3xl
          border border-white/40 dark:border-white/10
        "
            >
                {children}
            </div>

            {/* 跟随鼠标的“水光”高光 */}
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


/* ============== 时间（北京时间）Chip（从父组件接收 now，避免重复定时器） ============== */
const TimeChip: React.FC<{ name?: string; now: Date }> = ({ name, now }) => {
    const dtf = useMemo(() => new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
        month: '2-digit',
        day: '2-digit',
        hour12: false
    }), []);

    const parts = useMemo(() => {
        const p = dtf.formatToParts(now);
        const get = (type: string) => p.find(x => x.type === type)?.value || '';
        const hour = parseInt(get('hour') || '0', 10);
        const minute = get('minute');
        const second = get('second');
        const weekday = get('weekday'); // “周一”
        const month = get('month');
        const day = get('day');
        return { hour, minute, second, weekday, month, day };
    }, [dtf, now]);

    const greeting =
        parts.hour < 6 ? '自律' :
            parts.hour < 12 ? '早安' :
                parts.hour < 14 ? '午安' :
                    parts.hour < 18 ? '下午好' : '晚上好';

    return (
        <StatusChip>
            <Clock className="w-4 h-4 text-primary" />
            <span className="whitespace-nowrap tabular-nums font-mono">
                {parts.hour.toString().padStart(2, '0')}:{parts.minute}:{parts.second}
            </span>
            <span className="text-muted-foreground hidden sm:inline">{parts.weekday}</span>
            <span className="text-muted-foreground hidden md:inline">{parts.month}-{parts.day}</span>
            <span className="text-muted-foreground hidden lg:inline">| {greeting}{name ? `, ${name}` : ''}</span>
        </StatusChip>
    );
};

/* ============== 天气（北京）Chip（父组件提供数据与刷新，支持缓存与静默刷新） ============== */
type WeatherData = {
    temp: number;
    desc: string;
    wind: number;
    humidity: number;
    code: string;
};
type WeatherState = {
    loading: boolean;
    error?: string;
    data?: WeatherData;
};

const WEATHER_CACHE_KEY = 'heweather_bj_cache';
const WEATHER_TTL = 10 * 60 * 1000; // 10分钟

const WeatherChip: React.FC<{
    state: WeatherState;
    refreshing: boolean;
    label?: string;
    onRefresh?: () => void;
}> = ({ state, refreshing, label = '北京', onRefresh }) => {
    // 根据天气代码返回对应图标组件
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
            <WeatherChip
                state={weather}
                refreshing={weatherRefreshing}
                label="北京"
                onRefresh={onRefreshWeather}
            />
            <StatusChip>
                <UserIcon className="w-4 h-4 text-primary" />
                <span className="whitespace-nowrap">{user.name} ({user.role})</span>
            </StatusChip>
            <Button variant="ghost" className="h-9 px-4 rounded-xl hover:bg-white/40 font-bold text-slate-600 hover:text-red-500 transition-colors" onClick={onLogoutClick}>
                退出
            </Button>
        </StatusGroup>
    </div>
);

/* ============== 主应用 ============== */
export default function App() {
    // 路由状态
    const [currentView, setCurrentView] = useState<'home' | 'system' | 'script' | 'ocr-tool'>('home');
    const [selectedSystem, setSelectedSystem] = useState<string>('');
    const [selectedScript, setSelectedScript] = useState<string>('');

    // 用户状态
    const [userKey, setUserKey] = useState('');
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [systems, setSystems] = useState(allScripts);
    const [isLoading, setIsLoading] = useState(true);
    const [isVerifying, setIsVerifying] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [scriptQuery, setScriptQuery] = useState('');

    // 全局时间（避免子页切换导致 TimeChip 重置）
    const [now, setNow] = useState<Date>(new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // 天气全局状态（避免子页切换导致 WeatherChip 重置）
    const [weather, setWeather] = useState<WeatherState>(() => {
        try {
            const raw = localStorage.getItem(WEATHER_CACHE_KEY);
            if (raw) {
                const cached = JSON.parse(raw) as { ts: number; data: WeatherData };
                const fresh = Date.now() - cached.ts < WEATHER_TTL;
                if (fresh && cached.data) {
                    return { loading: false, data: cached.data };
                }
            }
        } catch { /* ignore */
        }
        return { loading: true };
    });
    const [weatherRefreshing, setWeatherRefreshing] = useState(false);

    const refreshWeather = useCallback(async (options?: { background?: boolean }) => {
        const background = !!options?.background;
        const apiKey = process.env.NEXT_PUBLIC_HEWEATHER_API_KEY;
        const apiHost = process.env.NEXT_PUBLIC_HEWEATHER_HOST;

        if (!apiKey || !apiHost) {
            // API 配置缺失：保留已显示的数据，仅标记错误
            setWeather(prev => ({ ...prev, loading: false, error: 'api_config_missing' }));
            return;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        if (!background) setWeatherRefreshing(true);

        try {
            const url = `https://${apiHost}/v7/weather/now?location=101010100&lang=zh`;
            const response = await fetch(url, {
                headers: {
                    "X-QW-Api-Key": apiKey,
                    "Accept-Encoding": "gzip"
                },
                signal: controller.signal
            });

            if (!response.ok) {
                let message = `HTTP ${response.status}`;
                try {
                    const errorData = await response.json();
                    if (errorData?.message) message = errorData.message;
                } catch { /* ignore */
                }
                throw new Error(message);
            }

            const data = await response.json();
            if (data.code !== "200") throw new Error(data.code);

            const parsed: WeatherData = {
                temp: parseInt(data.now.temp),
                desc: data.now.text,
                wind: parseFloat(data.now.windSpeed),
                humidity: parseInt(data.now.humidity),
                code: data.now.icon
            };

            setWeather({ loading: false, data: parsed });
            try {
                localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: parsed }));
            } catch { /* ignore quota */
            }
        } catch {
            // 如果已有数据，保持原样，只标记错误；如果没有，就降级
            setWeather(prev => {
                if (prev.data) return { ...prev, loading: false, error: 'api_error' };
                return {
                    loading: false,
                    error: 'api_error',
                    data: { temp: 25, desc: "晴", wind: 10, humidity: 50, code: "100" }
                };
            });
        } finally {
            clearTimeout(timeout);
            if (!background) setWeatherRefreshing(false);
        }
    }, []);

    // 初次挂载：使用缓存立即渲染 + 静默刷新；并开启轮询
    useEffect(() => {
        const hasCached = !!weather.data;
        refreshWeather({ background: hasCached });

        const interval = setInterval(() => refreshWeather({ background: true }), WEATHER_TTL);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 初始化时检查本地存储的认证信息
    useEffect(() => {
        const timer = setTimeout(() => {
            const savedAuth = localStorage.getItem('scriptHubAuth');
            if (savedAuth) {
                try {
                    const authData: AuthData = JSON.parse(savedAuth);
                    const nowTs = Date.now();

                    if (nowTs <= authData.expiresAt) {
                        const user = keyUserMap[authData.key];
                        if (user) {
                            setCurrentUser(user);
                            filterScriptsByPermission(user);
                            setIsLoading(false);
                            return;
                        }
                    }
                } catch {
                    // ignore
                }
            }
            localStorage.removeItem('scriptHubAuth');
            setIsLoading(false);
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    // 验证密钥并保存认证信息 - 添加500ms延迟
    const validateKey = () => {
        setErrorMessage('');
        if (!userKey.trim()) {
            toast.error("请输入访问密钥");
            return;
        }

        setIsVerifying(true);

        setTimeout(() => {
            const user = keyUserMap[userKey.trim()];
            if (user) {
                const authData: AuthData = {
                    key: userKey.trim(),
                    user,
                    expiresAt: getEndOfDayTimestamp()
                };

                localStorage.setItem('scriptHubAuth', JSON.stringify(authData));
                setCurrentUser(user);
                filterScriptsByPermission(user);
                toast.success("验证成功，欢迎使用");
            } else {
                toast.error("无效的访问密钥，请重新输入");
            }

            setIsVerifying(false);
        }, 500);
    };

    // 根据权限过滤脚本
    const filterScriptsByPermission = (user: User) => {
        const filteredSystems = Object.fromEntries(
            Object.entries(allScripts).map(([systemKey, system]) => {
                const filteredScripts = system.scripts.filter(script =>
                    user.permissions[script.id]
                );
                return [systemKey, { ...system, scripts: filteredScripts }];
            })
        ) as typeof allScripts;

        setSystems(filteredSystems);
    };

    // 退出登录
    const logout = () => {
        setCurrentUser(null);
        setUserKey('');
        setSelectedSystem('');
        setSelectedScript('');
        setCurrentView('home');
        setSystems(allScripts);
        localStorage.removeItem('scriptHubAuth');
    };

    useEffect(() => {
        setScriptQuery('');
    }, [currentView, selectedSystem]);

    const totalScripts = useMemo(() => (
        Object.values(systems).reduce((total, system) => total + system.scripts.length, 0)
    ), [systems]);

    const system = systems[selectedSystem as keyof typeof systems];
    const scripts = system?.scripts ?? [];
    const trimmedQuery = scriptQuery.trim().toLowerCase();
    const filteredScripts = useMemo(() => {
        if (!system) return [] as typeof scripts;
        if (!trimmedQuery) return system.scripts;
        return system.scripts.filter((script) => (
            `${script.name} ${script.description}`.toLowerCase().includes(trimmedQuery)
        ));
    }, [system, trimmedQuery]);
    const hasFewScripts = filteredScripts.length > 0 && filteredScripts.length <= 2;
    const noResults = !filteredScripts.length && Boolean(trimmedQuery);

    const renderScript = () => {
        if (currentView === 'ocr-tool') {
            return <OCRScript onBack={() => setCurrentView('home')} />;
        }
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

    const getStatusColor = (status: string) => {
        const map: Record<string, string> = {
            active: 'bg-green-100 text-green-800',
            beta: 'bg-yellow-100 text-yellow-800',
            stable: 'bg-blue-100 text-blue-800'
        };
        return map[status] ?? 'bg-gray-100 text-gray-800';
    };

    if (isLoading) {
        return (
            <div className="min-h-screen colorful-background flex items-center justify-center p-6">
                <Toaster richColors position="top-center" />
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    <h2 className="text-lg font-medium">正在验证身份...</h2>
                    <p className="text-muted-foreground">请稍候</p>
                </div>
            </div>
        );
    }

    // 未登录状态 - 显示密钥输入界面
    if (!currentUser) {
        return (
            <div className="min-h-screen relative overflow-x-hidden flex items-center justify-center p-6 bg-[#F2F2F7] dark:bg-black font-sans selection:bg-blue-100">
                {/* Aurora Background */}
                <div className="fixed inset-0 pointer-events-none">
                    <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-blue-500/20 blur-[120px] rounded-full mix-blend-multiply dark:mix-blend-normal animate-pulse" style={{ animationDuration: '8s' }} />
                    <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-500/20 blur-[120px] rounded-full mix-blend-multiply dark:mix-blend-normal animate-pulse" style={{ animationDuration: '10s' }} />
                </div>

                <Toaster richColors position="top-center" />

                <motion.div
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    variants={fadeInVariants}
                    transition={springConfig}
                    className="w-full max-w-md relative z-10"
                >
                    <Card className="border-white/20 bg-white/60 dark:bg-black/40 backdrop-blur-3xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] rounded-[32px]">
                        <CardHeader className="space-y-4 pb-2 text-center">
                            <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                                <Lock className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                                    访问授权
                                </CardTitle>
                                <CardDescription className="text-base font-medium">
                                    请输入密钥以解锁 ScriptHub
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            {errorMessage && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 text-red-600 rounded-2xl text-sm font-bold"
                                >
                                    <AlertCircle className="w-4 h-4" />
                                    <span>{errorMessage}</span>
                                </motion.div>
                            )}
                            <div className="space-y-4">
                                <Input
                                    type="password"
                                    placeholder="输入访问密钥"
                                    value={userKey}
                                    onChange={(e) => setUserKey(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !isVerifying) {
                                            validateKey();
                                        }
                                    }}
                                    autoFocus
                                    disabled={isVerifying}
                                    className="h-14 px-6 rounded-2xl bg-white/50 border-white/40 focus:bg-white/80 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 text-lg transition-all text-center tracking-widest"
                                />
                                <motion.div whileTap={{ scale: 0.96 }}>
                                    <Button
                                        className="w-full h-14 rounded-2xl text-lg font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xl hover:shadow-2xl transition-all"
                                        onClick={validateKey}
                                        disabled={isVerifying}
                                    >
                                        {isVerifying ? (
                                            <>
                                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                                验证中...
                                            </>
                                        ) : (
                                            '立即进入'
                                        )}
                                    </Button>
                                </motion.div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        );
    }

    if (currentView === 'script' || currentView === 'ocr-tool') {
        // 子页保持沉浸，但天气/时间状态仍保存在 App（返回后不闪）
        return renderScript();
    }

    if (currentView === 'system') {

        return (
            <div className="min-h-screen relative overflow-x-hidden bg-[#F2F2F7] dark:bg-black font-sans selection:bg-blue-100 p-4 md:p-6">
                {/* Aurora Background */}
                <div className="fixed inset-0 pointer-events-none">
                    <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-blue-500/20 blur-[120px] rounded-full mix-blend-multiply dark:mix-blend-normal animate-pulse" style={{ animationDuration: '8s' }} />
                    <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-500/20 blur-[120px] rounded-full mix-blend-multiply dark:mix-blend-normal animate-pulse" style={{ animationDuration: '10s' }} />
                </div>

                <Toaster richColors position="top-center" />
                <div className="max-w-7xl mx-auto relative z-10">
                    <StatusToolbar
                        leftSlot={(
                            <Button
                                variant="ghost"
                                onClick={() => setCurrentView('home')}
                                className="h-10 px-4 rounded-xl hover:bg-white/40 font-bold text-slate-600 dark:text-slate-300 transition-all"
                            >
                                <ArrowLeft className="w-5 h-5 mr-2" />
                                返回首页
                            </Button>
                        )}
                        user={currentUser}
                        now={now}
                        weather={weather}
                        weatherRefreshing={weatherRefreshing}
                        onRefreshWeather={() => refreshWeather({ background: false })}
                        onLogoutClick={() => setShowLogoutConfirm(true)}
                    />

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={springConfig}
                        className="mb-8"
                    >
                        <div className="flex items-center gap-4 mb-3">
                            <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">{system?.name}</h1>
                            <Badge variant="outline" className="h-7 px-3 bg-white/50 backdrop-blur-md border-blue-500/20 text-blue-700 font-bold">
                                {filteredScripts.length} / {scripts.length} 个脚本
                            </Badge>
                        </div>
                        <p className="text-lg text-slate-500 dark:text-slate-400 font-medium max-w-2xl">{system?.description}</p>
                    </motion.div>

                    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white/30 dark:bg-white/5 backdrop-blur-xl p-2 rounded-2xl border border-white/40 shadow-sm">
                        <div className="pl-4">
                            <p className="text-sm font-bold text-slate-500">
                                {scripts.length > 0 ? '快速检索工具库' : '暂无可用工具'}
                            </p>
                        </div>
                        {scripts.length > 0 && (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    value={scriptQuery}
                                    onChange={(event) => setScriptQuery(event.target.value)}
                                    placeholder="搜索脚本名称..."
                                    className="w-full md:w-[320px] h-10 pl-9 bg-white/60 border-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 text-sm font-medium rounded-xl transition-all"
                                />
                            </div>
                        )}
                    </div>

                    <div className={`
            ${hasFewScripts
                            ? 'flex flex-col items-center justify-center min-h-[300px]'
                            : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                        }
          `}>
                        <AnimatePresence mode="popLayout">
                            {filteredScripts.map((script, idx) => (
                                <motion.div
                                    key={script.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ ...springConfig, delay: idx * 0.05 }}
                                    className={hasFewScripts ? 'w-full max-w-md mb-6' : ''}
                                >
                                    <Card
                                        className="
                                        group border-0 bg-white/60 dark:bg-white/10 backdrop-blur-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] 
                                        hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-500
                                        rounded-[28px] overflow-hidden
                                    "
                                    >
                                        <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg transform rotate-[-45deg] group-hover:rotate-0 transition-transform duration-500">
                                                <ArrowLeft className="w-4 h-4 rotate-180" />
                                            </div>
                                        </div>

                                        <CardHeader className="pb-2">
                                            <div className="flex items-start gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-inner">
                                                    {script.icon}
                                                </div>
                                                <div>
                                                    <CardTitle className="text-xl font-bold tracking-tight text-slate-800 dark:text-white group-hover:text-blue-600 transition-colors">
                                                        {script.name}
                                                    </CardTitle>
                                                    <Badge className={`mt-2 ${getStatusColor(script.status)} border-0 font-bold px-2 py-0.5 text-[10px] uppercase tracking-wider`}>
                                                        {script.status}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <CardDescription className="mb-6 text-sm leading-relaxed font-medium text-slate-500">
                                                {script.description}
                                            </CardDescription>
                                            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                                <Button
                                                    className="w-full h-12 rounded-xl text-base font-bold !bg-gradient-to-r !from-[#0f172a] !to-[#334155] hover:!from-blue-600 hover:!to-blue-500 !text-white !shadow-lg hover:!shadow-blue-500/30 transition-all duration-300 !border-0"
                                                    onClick={() => {
                                                        setSelectedScript(script.id);
                                                        setCurrentView('script');
                                                    }}
                                                >
                                                    <Play className="w-4 h-4 mr-2 fill-current" />
                                                    启动脚本
                                                </Button>
                                            </motion.div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {noResults && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full py-12 text-center">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-slate-100 mb-4">
                                    <Search className="w-8 h-8 text-slate-300" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-700">未找到相关脚本</h3>
                                <p className="text-slate-500">尝试更换搜索关键字</p>
                            </motion.div>
                        )}
                        {!filteredScripts.length && !noResults && (
                            <Card className="col-span-full bg-transparent border-dashed border-2 border-slate-300 shadow-none">
                                <CardHeader className="text-center py-12">
                                    <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                                        <Lock className="w-8 h-8" />
                                    </div>
                                    <CardTitle className="text-xl text-slate-500">暂无访问权限</CardTitle>
                                    <CardDescription>
                                        请联系管理员为您开通该系统的脚本权限。
                                    </CardDescription>
                                </CardHeader>
                            </Card>
                        )}
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

    // 首页
    return (
        <div className="min-h-screen relative overflow-x-hidden bg-[#F2F2F7] dark:bg-black font-sans selection:bg-blue-100 p-4 md:p-6">
            {/* Aurora Background */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-blue-500/20 blur-[120px] rounded-full mix-blend-multiply dark:mix-blend-normal animate-pulse" style={{ animationDuration: '8s' }} />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-500/20 blur-[120px] rounded-full mix-blend-multiply dark:mix-blend-normal animate-pulse" style={{ animationDuration: '10s' }} />
            </div>

            <Toaster richColors position="top-center" />
            <Toaster richColors position="top-center" />
            <div className="max-w-7xl mx-auto relative z-10 w-full flex flex-col min-h-screen">
                <div className="w-full py-6">
                    <StatusToolbar
                        user={currentUser}
                        now={now}
                        weather={weather}
                        weatherRefreshing={weatherRefreshing}
                        onRefreshWeather={() => refreshWeather({ background: false })}
                        onLogoutClick={() => setShowLogoutConfirm(true)}
                    />
                </div>

                {/* 
                    [自定义位置微调]
                    调整 pt-20 (顶部距离) 即可控制整体内容的上下位置。
                    想要更靠上：改小数值 (如 pt-10)
                    想要更靠下：改大数值 (如 pt-32)
                */}
                <div className="flex-1 flex flex-col justify-start pt-4 pb-8 md:pb-20 origin-top scale-[0.85] md:scale-100 lg:scale-100 xl:scale-100">

                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={springConfig}
                        className="text-center mb-8 md:mb-12 lg:mb-16 mt-4 md:mt-0"
                    >
                        <h1 className="text-3xl md:text-5xl lg:text-7xl font-black mb-4 md:mb-6 tracking-tight text-[#0f172a] dark:text-white drop-shadow-sm leading-tight">
                            ScriptHub
                            <span className="text-blue-600 block text-lg md:text-xl lg:text-3xl mt-2 md:mt-4 font-bold tracking-normal opacity-90">自动化脚本调度中心</span>
                        </h1>
                        <p className="text-xl text-[#64748b] font-medium max-w-2xl mx-auto leading-relaxed">
                            企业级任务编排与执行引擎，提供从数据结算到报表生成的全流程自动化解决方案。
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-4 md:px-0">
                        {Object.entries(systems).map(([key, system], idx) => (
                            <motion.div
                                key={key}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ ...springConfig, delay: idx * 0.1 }}
                            >
                                <HoverFloatCard>
                                    <Card
                                        className="
                                    cursor-pointer transition-all rounded-[32px] border-0 bg-transparent
                                    min-h-[320px] flex flex-col justify-between pt-8 pb-6 px-2
                                    "
                                    >
                                        <CardHeader className="px-6">
                                            <div className="flex items-center justify-between mb-4">
                                                <CardTitle className="text-3xl font-black text-[#0f172a] dark:text-white">{system.name}</CardTitle>
                                                <Badge variant="outline" className="text-sm px-3 py-1 font-bold border-blue-500/30 text-blue-600 bg-blue-500/5">
                                                    {system.scripts.length} 个脚本
                                                </Badge>
                                            </div>
                                            <CardDescription className="text-base font-medium text-[#64748b] leading-relaxed">
                                                {system.description}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="px-6">
                                            <div className="space-y-6">
                                                {system.scripts.length > 0 ? (
                                                    <>
                                                        <div className="flex flex-wrap gap-2">
                                                            {system.scripts.slice(0, 3).map((script) => (
                                                                <Badge key={script.id} variant="secondary" className="px-3 py-1.5 text-xs font-bold bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
                                                                    {script.name}
                                                                </Badge>
                                                            ))}
                                                            {system.scripts.length > 3 && (
                                                                <Badge variant="secondary" className="px-3 py-1.5 text-xs font-bold bg-slate-100 text-slate-400">
                                                                    +{system.scripts.length - 3} 更多
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="mt-auto">
                                                            <Button
                                                                className="w-full h-14 rounded-2xl text-lg font-bold !bg-gradient-to-r !from-[#0f172a] !to-[#334155] hover:!from-blue-600 hover:!to-blue-500 !text-white !shadow-xl hover:!shadow-blue-500/30 transition-all duration-300 group !border-0"
                                                                onClick={() => {
                                                                    setSelectedSystem(key);
                                                                    setCurrentView('system');
                                                                }}
                                                            >
                                                                进入系统
                                                                <ArrowLeft className="w-5 h-5 ml-2 rotate-180 group-hover:translate-x-1 transition-transform" />
                                                            </Button>
                                                        </motion.div>
                                                    </>
                                                ) : (
                                                    <div className="text-center py-8 text-slate-400">
                                                        <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                                        <p className="font-bold text-sm">功能开发中</p>
                                                    </div>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </HoverFloatCard>
                            </motion.div>
                        ))}
                    </div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="mt-12 text-center"
                    >
                        <button
                            onClick={() => setCurrentView('ocr-tool')}
                            className="text-sm font-bold text-slate-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2 mx-auto py-2 px-4 rounded-xl hover:bg-blue-50/50"
                        >
                            <UserIcon className="w-4 h-4" />
                            个人效率工具
                        </button>

                        <div className="mt-8">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/40 border border-white/50 backdrop-blur-md text-xs font-mono text-slate-400 shadow-sm">
                                <CheckCircle className="w-3 h-3 text-emerald-500" />
                                <span>System Operational · {totalScripts} Scripts Available</span>
                            </div>
                        </div>
                    </motion.div>
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
