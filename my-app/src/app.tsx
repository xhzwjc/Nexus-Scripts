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
    User as UserIcon
} from 'lucide-react';
import SettlementScript from './components/SettlementScript';
import CommissionScript from './components/CommissionScript';
import BalanceScript from './components/BalanceScript';
import TaskAutomationScript from './components/TaskAutomationScript';
import SmsManagementScript from "./components/BatchSmsScript";
import TaxReportReportManagement from "./components/TaxReportManagement";
import './App.css';
import TaxCalculationScript from "@/components/TaxCalculatorScript";

// 角色类型与权限映射
type Role = 'admin' | 'operator' | 'custom' | 'QA';

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
            'tax-calculation': true
        },
        name: '系统管理员'
    },
    // 运营人员密钥 - 仅税务报表权限
    'pE7#tV4^Rk!2zF1&B@8cU5*mO~yW6%LxJ3dQ0nHa': {
        role: 'operator',
        permissions: {
            'tax-reporting': true
        },
        name: '运营人员'
    },
    // 自定义角色
    '1': {
        role: 'QA',
        permissions: {
            'settlement': true,
            'commission': true,
            'balance': true,
            'task-automation': true,
            'sms_operations_center': true,
            'tax-reporting': true,
            'tax-calculation': true
        },
        name: 'JC'
    }
};

interface Script {
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
    status: 'active' | 'beta' | 'stable';
}

const allScripts = {
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

/* ============== 统一高度的状态 Chip 组件 ============== */
const StatusChip: React.FC<React.PropsWithChildren<{ className?: string }>> = ({children, className}) => (
    <div
        className={`h-9 px-3 inline-flex items-center gap-2 rounded-md border bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/40 shadow-sm text-sm leading-none ${className || ''}`}>
        {children}
    </div>
);

const StatusGroup: React.FC<React.PropsWithChildren> = ({children}) => (
    <div className="flex items-center justify-end flex-wrap gap-2">
        {children}
    </div>
);

/* ============== 首页卡片悬停“水气球”效果 ============== */
const HoverFloatCard: React.FC<React.PropsWithChildren<{ className?: string }>> = ({children, className}) => {
    const ref = useRef<HTMLDivElement>(null);

    const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const rx = ((y / rect.height) - 0.5) * 6;   // 上下轻微倾斜
        const ry = ((x / rect.width) - 0.5) * -6;   // 左右轻微倾斜
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
                className="pointer-events-none absolute -bottom-2 left-1/2 h-6 w-3/4 -translate-x-1/2 rounded-[50%] bg-sky-900/10 blur-md opacity-0 group-hover:opacity-100 transition duration-300"/>

            {/* 3D 浮起主体 */}
            <div
                className="
          relative rounded-xl
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
const TimeChip: React.FC<{ name?: string; now: Date }> = ({name, now}) => {
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
        return {hour, minute, second, weekday, month, day};
    }, [dtf, now]);

    const greeting =
        parts.hour < 6 ? '自律' :
            parts.hour < 12 ? '早安' :
                parts.hour < 14 ? '午安' :
                    parts.hour < 18 ? '下午好' : '晚上好';

    return (
        <StatusChip>
            <Clock className="w-4 h-4 text-primary"/>
            <span className="whitespace-nowrap tabular-nums font-mono">
        {parts.hour.toString().padStart(2, '0')}:{parts.minute}:{parts.second}
      </span>
            <span className="text-muted-foreground hidden sm:inline">{parts.weekday}</span>
            <span className="text-muted-foreground hidden md:inline">{parts.month}-{parts.day}</span>
            <span className="text-muted-foreground hidden lg:inline">| {greeting}{name ? `, ${name}` : ''}</span>
        </StatusChip>
    );
};

const getWeatherClass = (code: string | undefined): string => {
    if (!code) return '';
    if (/^1\d{2}$/.test(code)) return 'weather-clear';     // 晴/多云类
    if (/^3\d{2}$/.test(code) || /^4\d{2}$/.test(code)) return 'weather-rain';  // 雨
    if (/^400|401|402|403|407/.test(code)) return 'weather-snow';  // 雪
    if (/^302|303/.test(code)) return 'weather-thunder';   // 雷
    if (/^5\d{2}$/.test(code)) return 'weather-fog';       // 雾霾类
    return 'weather-default';
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
}> = ({state, refreshing, label = '北京', onRefresh}) => {
    // 根据天气代码返回对应图标组件
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

/* ============== 主应用 ============== */
export default function App() {
    // 路由状态
    const [currentView, setCurrentView] = useState<'home' | 'system' | 'script'>('home');
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
                    return {loading: false, data: cached.data};
                }
            }
        } catch { /* ignore */
        }
        return {loading: true};
    });
    const [weatherRefreshing, setWeatherRefreshing] = useState(false);

    const refreshWeather = useCallback(async (options?: { background?: boolean }) => {
        const background = !!options?.background;
        const apiKey = process.env.NEXT_PUBLIC_HEWEATHER_API_KEY;
        const apiHost = process.env.NEXT_PUBLIC_HEWEATHER_HOST;

        if (!apiKey || !apiHost) {
            // API 配置缺失：保留已显示的数据，仅标记错误
            setWeather(prev => ({...prev, loading: false, error: 'api_config_missing'}));
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

            setWeather({loading: false, data: parsed});
            try {
                localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ts: Date.now(), data: parsed}));
            } catch { /* ignore quota */
            }
        } catch (error) {
            // 如果已有数据，保持原样，只标记错误；如果没有，就降级
            setWeather(prev => {
                if (prev.data) return {...prev, loading: false, error: 'api_error'};
                return {
                    loading: false,
                    error: 'api_error',
                    data: {temp: 25, desc: "晴", wind: 10, humidity: 50, code: "100"}
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
        refreshWeather({background: hasCached});

        const interval = setInterval(() => refreshWeather({background: true}), WEATHER_TTL);
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
                return [systemKey, {...system, scripts: filteredScripts}];
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

    const renderScript = () => {
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
                <Toaster richColors position="top-center"/>
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 text-primary animate-spin"/>
                    <h2 className="text-lg font-medium">正在验证身份...</h2>
                    <p className="text-muted-foreground">请稍候</p>
                </div>
            </div>
        );
    }

    // 未登录状态 - 显示密钥输入界面
    if (!currentUser) {
        return (
            <div className="min-h-screen colorful-background flex items-center justify-center p-6">
                <Toaster richColors position="top-center"/>
                <Card className="w-full max-w-md animate-fadeIn">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-2xl flex items-center justify-center gap-2">
                            <Lock className="w-5 h-5"/>
                            访问授权
                        </CardTitle>
                        <CardDescription className="text-center">
                            请输入您的访问密钥以使用系统
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {errorMessage && (
                            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-md">
                                <AlertCircle className="w-4 h-4"/>
                                <span>{errorMessage}</span>
                            </div>
                        )}
                        <div className="space-y-2">
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
                                className="pr-10"
                            />
                        </div>
                        <Button
                            className="w-full"
                            onClick={validateKey}
                            disabled={isVerifying}
                        >
                            {isVerifying ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin"/>
                                    验证中...
                                </>
                            ) : (
                                '验证并进入系统'
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (currentView === 'script') {
        // 子页保持沉浸，但天气/时间状态仍保存在 App（返回后不闪）
        return renderScript();
    }

    if (currentView === 'system') {
        const system = systems[selectedSystem as keyof typeof systems];
        const {scripts} = system || {scripts: []};
        const hasFewScripts = scripts.length > 0 && scripts.length <= 2;

        return (
            <div className="min-h-screen colorful-background p-6">
                <Toaster richColors position="top-center"/>
                <div className="max-w-7xl mx-auto">
                    {/* 顶部工具栏：左返回；右状态条（统一高度） */}
                    <div className="flex items-center justify-between mb-6 gap-4">
                        <Button
                            variant="ghost"
                            onClick={() => setCurrentView('home')}
                            className="h-9"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2"/>
                            返回首页
                        </Button>

                        <StatusGroup>
                            <TimeChip name={currentUser?.name} now={now}/>
                            <WeatherChip
                                state={weather}
                                refreshing={weatherRefreshing}
                                label="北京"
                                onRefresh={() => refreshWeather({background: false})}
                            />
                            <StatusChip>
                                <UserIcon className="w-4 h-4 text-primary"/>
                                <span className="whitespace-nowrap">{currentUser.name} ({currentUser.role})</span>
                            </StatusChip>
                            <Button variant="ghost" className="h-9 px-3" onClick={() => setShowLogoutConfirm(true)}>
                                退出
                            </Button>
                        </StatusGroup>
                    </div>

                    <div className="mb-8">
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-2xl">{system?.name}</h1>
                            <Badge variant="outline">{system?.scripts.length} 个脚本</Badge>
                        </div>
                        <p className="text-muted-foreground">{system?.description}</p>
                    </div>

                    <div className={`
            ${hasFewScripts
                        ? 'flex flex-col items-center justify-center min-h-[300px]'
                        : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                    }
          `}>
                        {scripts.map((script) => (
                            <Card
                                key={script.id}
                                className={`
                  cursor-pointer hover:shadow-md transition-shadow 
                  ${hasFewScripts ? 'w-full max-w-md mb-6' : ''}
                `}
                            >
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-primary/10 rounded-lg">
                                                {script.icon}
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg">{script.name}</CardTitle>
                                                <Badge className={`mt-2 ${getStatusColor(script.status)}`}>
                                                    {script.status}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <CardDescription className="mb-4">
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

    // 首页
    return (
        <div className="min-h-screen colorful-background p-6">
            <Toaster richColors position="top-center"/>
            <div className="max-w-7xl mx-auto">
                {/* 顶部状态条：右对齐，统一高度 */}
                <div className="flex items-center justify-between mb-6 gap-4">
                    <div/>
                    <StatusGroup>
                        <TimeChip name={currentUser?.name} now={now}/>
                        <WeatherChip
                            state={weather}
                            refreshing={weatherRefreshing}
                            label="北京"
                            onRefresh={() => refreshWeather({background: false})}
                        />
                        <StatusChip>
                            <UserIcon className="w-4 h-4 text-primary"/>
                            <span className="whitespace-nowrap">{currentUser.name} ({currentUser.role})</span>
                        </StatusChip>
                        <Button variant="ghost" className="h-9 px-3" onClick={() => setShowLogoutConfirm(true)}>
                            退出
                        </Button>
                    </StatusGroup>
                </div>

                <div className="text-center mb-12">
                    <h1 className="text-3xl mb-4">ScriptHub 脚本管理平台</h1>
                    <p className="text-lg text-muted-foreground">
                        企业级自动化脚本调度与执行中心
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {Object.entries(systems).map(([key, system]) => (
                        <HoverFloatCard key={key}>
                            <Card
                                className="
                                cursor-pointer transition-shadow rounded-xl border-white/40 bg-transparent
                                min-h-[280px] flex flex-col justify-between pt-6
                              ">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-xl">{system.name}</CardTitle>
                                        <Badge variant="outline">
                                            {system.scripts.length} 个脚本
                                        </Badge>
                                    </div>
                                    <CardDescription>{system.description}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {system.scripts.length > 0 ? (
                                            <>
                                                <div className="flex flex-wrap gap-2">
                                                    {system.scripts.slice(0, 3).map((script) => (
                                                        <Badge key={script.id} variant="secondary" className="text-xs">
                                                            {script.name}
                                                        </Badge>
                                                    ))}
                                                    {system.scripts.length > 3 && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            +{system.scripts.length - 3} 更多
                                                        </Badge>
                                                    )}
                                                </div>
                                                <Button
                                                    className="w-full mt-4"
                                                    onClick={() => {
                                                        setSelectedSystem(key);
                                                        setCurrentView('system');
                                                    }}
                                                >
                                                    进入系统
                                                </Button>
                                            </>
                                        ) : (
                                            <div className="text-center py-8 text-muted-foreground">
                                                <Database className="w-12 h-12 mx-auto mb-3 opacity-50"/>
                                                <p>烹饪中！</p>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </HoverFloatCard>
                    ))}

                </div>

                <div className="mt-16 text-center">
                    <Card className="inline-block p-6">
                        <div className="flex items-center gap-3 text-muted-foreground">
                            <CheckCircle className="w-5 h-5"/>
                            <span>系统运行正常，目前共有 {
                                Object.values(systems).reduce((total, system) => total + system.scripts.length, 0)
                            } 个可用的自动化脚本</span>
                        </div>
                    </Card>
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
