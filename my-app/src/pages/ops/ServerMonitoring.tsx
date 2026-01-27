import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Activity,
    Cpu,
    HardDrive,
    Network,
    Pause,
    Play,
    RefreshCw,
    Server,
    AlertTriangle,
    Clock,
    Zap,
    MoreVertical,
    ChevronLeft,
    Moon,
    Sun,
    ChevronDown
} from 'lucide-react';
import {
    LineChart,
    Line,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { getApiBaseUrl } from '@/lib/api';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useI18n } from '@/lib/i18n';
import { Translations } from '@/lib/i18n/types';

// --- Types & Interfaces ---

interface DiskInfo {
    mount: string;
    label: string;
    usedGb: number;
    totalGb: number;
    usagePercent: number;
}

interface CpuCore {
    id: number;
    usage: number; // 0-100
}

interface SystemMetrics {
    id: string;      // Added for selection
    name: string;    // Added for selection
    timestamp: number;
    cpu: {
        total: number;
        cores: CpuCore[];
    };
    memory: {
        usedGb: number;
        totalGb: number;
        percent: number;
    };
    network: {
        upKbps: number;
        downKbps: number;
    };
    load: {
        one: number;
        five: number;
        fifteen: number;
    };
    disk: DiskInfo[];
    uptime: number;
}

// API Response Definitions
interface ApiDiskData {
    mount: string;
    device: string;
    used_gb: number;
    total_gb: number;
    percent: number;
}

interface ApiServerData {
    server_id: string;
    server_name: string;
    timestamp: string; // ISO string
    cpu_percent: number;
    cpu_per_core: number[];
    memory_used_gb: number;
    memory_total_gb: number;
    memory_percent: number;
    net_sent_mbps: number;
    net_recv_mbps: number;
    load_1min: number;
    load_5min: number;
    load_15min: number;
    disks: ApiDiskData[];
    boot_time: string; // ISO string
}

// Helper to format large numbers
const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const formatTime = (ms: number) => {
    const date = new Date(ms);
    return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

// --- Mock Generator ---
const generateMockMetrics = (prev?: SystemMetrics, serverIndex = 0): SystemMetrics => {
    const now = Date.now();
    const coreCount = 8;
    // Simulate CPU fluctuation
    const newCores = Array.from({ length: coreCount }).map((_, i) => ({
        id: i,
        usage: Math.max(0, Math.min(100, (prev?.cpu.cores[i].usage || Math.random() * 30) + (Math.random() * 20 - 10)))
    }));
    const totalCpu = newCores.reduce((acc, c) => acc + c.usage, 0) / coreCount;
    // Simulate Memory
    const totalMem = 16;
    const usedMem = Math.max(4, Math.min(totalMem, (prev?.memory.usedGb || 8) + (Math.random() - 0.5)));
    // Simulate Network
    const up = Math.max(0, (prev?.network.upKbps || 100) + (Math.random() * 50 - 25));
    const down = Math.max(0, (prev?.network.downKbps || 500) + (Math.random() * 200 - 100));

    return {
        id: prev?.id || `mock-server-${serverIndex}`,
        name: prev?.name || `Mock Server ${serverIndex + 1}`,
        timestamp: now,
        cpu: { total: totalCpu, cores: newCores },
        memory: { usedGb: usedMem, totalGb: totalMem, percent: (usedMem / totalMem) * 100 },
        network: { upKbps: up, downKbps: down },
        load: { one: 1.2, five: 0.9, fifteen: 0.8 },
        disk: [
            { mount: 'C:', label: 'System', usedGb: 120, totalGb: 500, usagePercent: 24 },
            { mount: 'D:', label: 'Data', usedGb: 800, totalGb: 1000, usagePercent: 80 },
        ],
        uptime: (prev?.uptime || 100000) + 2,
    };
};

// --- Components ---

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm transition-colors duration-300 ${className}`}>
        {children}
    </div>
);

// Fix: typed Icon prop
const MetricValue = ({ label, value, subtext, icon: Icon, color = "text-blue-500" }: {
    label: string,
    value: React.ReactNode,
    subtext?: string,
    icon: React.ElementType,
    color?: string
}) => (
    <Card className="p-5 flex items-start justify-between relative overflow-hidden group">
        <div className="z-10 relative">
            <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">{label}</p>
            <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
            </div>
            {subtext && <p className="text-slate-500 dark:text-slate-500 text-xs mt-1">{subtext}</p>}
        </div>
        <div className={`p-3 rounded-lg bg-slate-100 dark:bg-slate-800/50 ${color} group-hover:bg-slate-200 dark:group-hover:bg-slate-800 transition-colors`}>
            <Icon size={24} />
        </div>
    </Card>
);

const CpuGrid = ({ cores, t, className = "" }: { cores: CpuCore[], t: Translations['serverMonitoring'], className?: string }) => {
    return (
        <Card className={`p-6 ${className}`}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-800 dark:text-slate-200 font-medium flex items-center gap-2">
                    <Cpu size={18} className="text-slate-400" />
                    {t.coreMap}
                </h3>
                <div className="flex gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-slate-200 dark:bg-slate-800"></div> {t.idle}</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-blue-600"></div> {t.active}</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-amber-500"></div> {t.heavy}</span>
                </div>
            </div>
            <div className="grid grid-cols-10 gap-1.5">
                {cores.map((core) => {
                    let bgClass = 'bg-slate-200 dark:bg-slate-800';
                    if (core.usage > 80) bgClass = 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]';
                    else if (core.usage > 40) bgClass = 'bg-blue-600';
                    else if (core.usage > 10) bgClass = 'bg-blue-400 dark:bg-blue-900/60';

                    return (
                        <div
                            key={core.id}
                            className={`aspect-square rounded-sm transition-all duration-300 relative group ${bgClass}`}
                            title={`Core ${core.id}: ${core.usage.toFixed(0)}%`}
                        >
                        </div>
                    );
                })}
            </div>
        </Card>
    );
};

const DiskUsage = ({ disks, t }: { disks: DiskInfo[], t: Translations['serverMonitoring'] }) => {
    return (
        <div className="flex flex-col gap-4">
            {disks.map((disk) => {
                const isHigh = disk.usagePercent > 80;
                return (
                    <Card key={disk.mount} className={`p-4 relative overflow-hidden ${isHigh ? 'border-amber-500/30' : ''}`}>
                        {isHigh && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-4 min-w-[200px]">
                                <div className={`p-2 rounded bg-slate-100 dark:bg-slate-800 ${isHigh ? 'text-amber-500' : 'text-slate-400'}`}>
                                    <HardDrive size={24} />
                                </div>
                                <div>
                                    <h4 className="text-slate-800 dark:text-slate-200 font-medium text-lg">{disk.label} ({disk.mount})</h4>
                                    <p className="text-xs text-slate-500">{disk.usedGb.toFixed(2)} GB used</p>
                                </div>
                                {isHigh && (
                                    <div className="flex items-center gap-1 text-amber-500 text-xs font-bold px-2 py-1 bg-amber-100 dark:bg-amber-500/10 rounded">
                                        <AlertTriangle size={12} />
                                        {t.lowSpace}
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 flex flex-col justify-center gap-2 max-w-2xl">
                                <div className="flex justify-end text-sm font-bold text-slate-700 dark:text-slate-200">
                                    {disk.usagePercent.toFixed(1)}%
                                </div>
                                <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${isHigh ? 'bg-amber-500' : 'bg-blue-500'}`}
                                        style={{ width: `${disk.usagePercent}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-slate-500">
                                    <span>0 GB</span>
                                    <span>{disk.totalGb} GB Total</span>
                                </div>
                            </div>

                            <div className="hidden sm:block">
                                <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-xs text-slate-300">
                                    <RefreshCw size={14} />
                                    Clean Up
                                </button>
                            </div>
                        </div>
                    </Card>
                );
            })}
        </div>
    );
};

// --- Main Dashboard Component ---

interface ServerMonitorProps {
    onBack?: () => void;
}

const ServerMonitor: React.FC<ServerMonitorProps> = ({ onBack }) => {


    // UI State
    const { t: globalT } = useI18n();
    const { theme, setTheme } = useTheme();

    // Flatten t to match component expectations
    const t = useMemo(() => ({
        ...globalT.serverMonitoring,
        // Override or fallback for specific keys if needed, but we added them all
    }), [globalT.serverMonitoring]);

    const isDarkMode = theme === 'dark';
    const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

    // Data State
    const [serverList, setServerList] = useState<SystemMetrics[]>([]);
    const [selectedServerId, setSelectedServerId] = useState<string>('');
    const [historyMap, setHistoryMap] = useState<Record<string, SystemMetrics[]>>({});

    // Polling State
    const [isPolling, setIsPolling] = useState(true);
    const [pollInterval, setPollInterval] = useState(3000); // User requested 3s default
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const API_BASE = getApiBaseUrl();

    // Fetch Function
    const fetchMetrics = useCallback(async () => {
        try {
            const resp = await fetch(`${API_BASE}/api/monitoring/metrics`).catch(() => null);
            let newMetrics: SystemMetrics[] = [];

            if (resp && resp.ok) {
                const json = await resp.json();
                if (json.success && Array.isArray(json.data)) {
                    // Map API data to SystemMetrics
                    newMetrics = json.data.map((serverData: ApiServerData) => ({
                        id: serverData.server_id,
                        name: serverData.server_name,
                        timestamp: serverData.timestamp ? new Date(serverData.timestamp).getTime() : Date.now(),
                        cpu: {
                            total: serverData.cpu_percent || 0,
                            cores: (serverData.cpu_per_core || []).map((usage: number, i: number) => ({
                                id: i,
                                usage: usage
                            }))
                        },
                        memory: {
                            usedGb: serverData.memory_used_gb || 0,
                            totalGb: serverData.memory_total_gb || 0,
                            percent: serverData.memory_percent || 0
                        },
                        network: {
                            upKbps: (serverData.net_sent_mbps || 0) * 1024,
                            downKbps: (serverData.net_recv_mbps || 0) * 1024
                        },
                        load: {
                            one: serverData.load_1min || 0,
                            five: serverData.load_5min || 0,
                            fifteen: serverData.load_15min || 0
                        },
                        disk: (serverData.disks || []).map((d: ApiDiskData) => ({
                            mount: d.mount,
                            label: d.device || 'Disk',
                            usedGb: d.used_gb,
                            totalGb: d.total_gb,
                            usagePercent: d.percent
                        })),
                        uptime: serverData.boot_time
                            ? (Date.now() - new Date(serverData.boot_time).getTime()) / 1000
                            : 0
                    }));
                }
            }

            // Deduplicate metrics by ID
            const uniqueMetricsMap = new Map();
            newMetrics.forEach(m => uniqueMetricsMap.set(m.id, m));
            newMetrics = Array.from(uniqueMetricsMap.values());

            // Fallback Mock Logic
            if (newMetrics.length === 0) {
                // If we have history, use last point to generate next mock
                // Mocking 2 servers
                const mockIds = ['local-1', 'local-2'];
                newMetrics = mockIds.map((mid, idx) => {
                    const prev = historyMap[mid]?.[historyMap[mid].length - 1];
                    return generateMockMetrics(prev, idx);
                });
            }

            // Update State
            setServerList(newMetrics);

            // Auto-select first if none selected
            if (!selectedServerId && newMetrics.length > 0) {
                setSelectedServerId(newMetrics[0].id);
            } else if (selectedServerId && !newMetrics.find(m => m.id === selectedServerId)) {
                // IF selected server disappeared, fallback to first
                if (newMetrics.length > 0) setSelectedServerId(newMetrics[0].id);
            }

            // Update History for ALL servers
            setHistoryMap(prev => {
                const next = { ...prev };
                newMetrics.forEach(m => {
                    const serverHist = next[m.id] || [];
                    const newHist = [...serverHist, m];
                    // Keep last 30 points
                    if (newHist.length > 30) next[m.id] = newHist.slice(newHist.length - 30);
                    else next[m.id] = newHist;
                });
                return next;
            });

        } catch (e) {
            console.error("Fetch failed", e);
        }
    }, [API_BASE]); // Removed 'historyMap' and 'selectedServerId' dependencies to prevent recreation

    // Polling Effect
    useEffect(() => {
        if (!isPolling) {
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }

        // Immediate fetch
        fetchMetrics();

        // precise interval
        timerRef.current = setInterval(fetchMetrics, pollInterval);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isPolling, pollInterval, fetchMetrics]);


    // Derived data for current view
    const currentMetrics = useMemo(() => {
        return serverList.find(s => s.id === selectedServerId) || serverList[0] || null;
    }, [serverList, selectedServerId]);

    const currentHistory = useMemo(() => {
        if (!currentMetrics) return [];
        return historyMap[currentMetrics.id] || [];
    }, [historyMap, currentMetrics]);

    const topCores = useMemo(() => {
        if (!currentMetrics) return [];
        return [...currentMetrics.cpu.cores]
            .sort((a, b) => b.usage - a.usage)
            .slice(0, 3)
            .map(c => c.id);
    }, [currentMetrics]);

    const cpuChartData = useMemo(() => {
        const MIN_POINTS = 20;
        const data = currentHistory.map(h => {
            const coreData: Record<string, number> = {};
            h.cpu.cores.forEach(c => {
                coreData[`core_${c.id}`] = c.usage;
            });
            return {
                time: formatTime(h.timestamp),
                timestamp: h.timestamp, // Keep raw for calculation if needed, though simpler to just use index
                ...coreData
            };
        });

        // Cold Start Padding
        if (data.length < MIN_POINTS && data.length > 0) {
            const lastTime = currentHistory[0].timestamp; // Base off the first actual point
            const missing = MIN_POINTS - data.length;
            const padding = Array.from({ length: missing }).map((_, i) => ({
                time: formatTime(lastTime - (missing - i) * pollInterval),
                // No data keys implies "empty" on the chart
            }));
            return [...padding, ...data];
        }
        return data;
    }, [currentHistory, pollInterval]);

    const memoryChartData = useMemo(() => {
        const MIN_POINTS = 20;
        const data = currentHistory.map(h => ({
            time: formatTime(h.timestamp),
            used: h.memory.usedGb,
            total: h.memory.totalGb
        }));

        if (data.length < MIN_POINTS && data.length > 0) {
            const lastTime = currentHistory[0].timestamp;
            const missing = MIN_POINTS - data.length;
            const padding = Array.from({ length: missing }).map((_, i) => ({
                time: formatTime(lastTime - (missing - i) * pollInterval),
                // No 'used' or 'total' keys
            }));
            return [...padding, ...data];
        }
        return data;
    }, [currentHistory, pollInterval]);

    const networkChartData = useMemo(() => {
        const MIN_POINTS = 20;
        const data = currentHistory.map(h => ({
            time: formatTime(h.timestamp),
            up: h.network.upKbps,
            down: h.network.downKbps
        }));

        if (data.length < MIN_POINTS && data.length > 0) {
            const lastTime = currentHistory[0].timestamp;
            const missing = MIN_POINTS - data.length;
            const padding = Array.from({ length: missing }).map((_, i) => ({
                time: formatTime(lastTime - (missing - i) * pollInterval),
                // No 'up' or 'down' keys
            }));
            return [...padding, ...data];
        }
        return data;
    }, [currentHistory, pollInterval]);

    // Skeleton Loading Component
    if (!currentMetrics) return (
        <div className={`min-h-screen font-sans p-4 md:p-8 transition-colors duration-300 ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
            <div className="max-w-[1920px] mx-auto animate-pulse space-y-8">
                {/* Header Skeleton */}
                <div className="flex justify-between items-center">
                    <div className="h-8 w-64 bg-slate-200 dark:bg-slate-800 rounded"></div>
                    <div className="h-10 w-48 bg-slate-200 dark:bg-slate-800 rounded"></div>
                </div>

                {/* KPI Grid Skeleton */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
                    ))}
                </div>

                {/* Main Content Skeleton */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 auto-rows-fr">
                    {/* Left Column Skeleton */}
                    <div className="xl:col-span-2 flex flex-col gap-6">
                        <div className="h-[480px] bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
                        <div className="flex-1 bg-slate-200 dark:bg-slate-800 rounded-lg min-h-[200px]"></div>
                    </div>

                    {/* Right Column Skeleton */}
                    <div className="flex flex-col gap-6">
                        <div className="h-[480px] bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
                        <div className="flex-1 bg-slate-200 dark:bg-slate-800 rounded-lg min-h-[200px]"></div>
                    </div>
                </div>

                {/* Disk Usage Skeleton */}
                <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
            </div>
        </div>
    );

    return (
        <div className={`min-h-screen font-sans transition-colors duration-300 ${isDarkMode ? 'dark bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-800'}`}>
            <div className="p-4 md:p-8 max-w-[1920px] mx-auto">
                {/* Top Bar */}
                <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-8">
                    <div className='flex items-center gap-4'>
                        {/* Back Button */}
                        <button
                            onClick={() => onBack?.() || window.history.back()}
                            className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            <ChevronLeft size={20} />
                        </button>

                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-3">
                                <Server className="text-blue-500" />
                                {t.title}
                            </h1>
                            <p className="text-slate-500 text-sm mt-1 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                {t.live} • {formatTime(currentMetrics.timestamp)}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Server Selector */}
                        <div className="relative">
                            <select
                                value={selectedServerId}
                                onChange={(e) => setSelectedServerId(e.target.value)}
                                className="appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm rounded-lg px-4 py-2 pr-8 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {serverList.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                            <button
                                onClick={() => setIsPolling(!isPolling)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${isPolling
                                    ? 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400'
                                    : 'bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400'
                                    }`}
                            >
                                {isPolling ? <Pause size={14} /> : <Play size={14} />}
                                <span className="hidden sm:inline">{isPolling ? t.pause : t.resume}</span>
                            </button>

                            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

                            <div className="flex items-center gap-2 px-2">
                                <Clock size={14} className="text-slate-400" />
                                <span className="text-xs text-slate-500 hidden sm:inline">{t.interval}:</span>
                                <select
                                    value={pollInterval}
                                    onChange={(e) => setPollInterval(Number(e.target.value))}
                                    className="bg-transparent text-sm font-medium focus:outline-none border-none cursor-pointer"
                                >
                                    <option value={1000}>1s</option>
                                    <option value={2000}>2s</option>
                                    <option value={3000}>3s</option>
                                    <option value={5000}>5s</option>
                                    <option value={10000}>10s</option>
                                </select>
                            </div>

                            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

                            <button
                                onClick={() => fetchMetrics()}
                                className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                                title={t.refresh}
                            >
                                <RefreshCw size={16} />
                            </button>
                        </div>

                        {/* Theme & Lang */}
                        {/* Replaced local lang toggle with global no-op or just visually showing current lang (or removed since it's global now) */}
                        {/* User wanted to adapt, so typically we remove local controls if global exists. But header might feel empty. */}
                        {/* However, the instruction was to "adapt". I will keep the Theme toggle but hook it to global. */}
                        {/* I will remove the Language toggle as it is usually global in the header. If user wants it here, I would toggle i18n.language. */}

                        <button
                            onClick={toggleTheme}
                            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors"
                        >
                            {isDarkMode ? <Sun size={20} className="text-amber-400" /> : <Moon size={20} className="text-slate-600" />}
                        </button>
                    </div>
                </header>

                {/* Main Grid: Row 1 - Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                    <MetricValue
                        label={t.cpuLoad}
                        value={`${currentMetrics.cpu.total.toFixed(1)}%`}
                        subtext={`${currentMetrics.cpu.cores.length} ${t.coresActive}`}
                        icon={Cpu}
                        color="text-blue-500"
                    />
                    <MetricValue
                        label={t.memory}
                        value={`${currentMetrics.memory.percent.toFixed(1)}%`}
                        subtext={`${currentMetrics.memory.usedGb.toFixed(1)} / ${currentMetrics.memory.totalGb.toFixed(1)} GB`}
                        icon={Zap}
                        color="text-purple-500"
                    />
                    <MetricValue
                        label={t.netInOut}
                        value={
                            <div className="flex flex-col text-lg">
                                <span className="text-emerald-500 dark:text-emerald-400">↓ {formatBytes(currentMetrics.network.downKbps)}/s</span>
                                <span className="text-blue-500 dark:text-blue-400 text-sm">↑ {formatBytes(currentMetrics.network.upKbps)}/s</span>
                            </div>
                        }
                        icon={Network}
                        color="text-emerald-500"
                    />
                    <MetricValue
                        label={t.sysLoad}
                        value={currentMetrics.load.one.toFixed(2)}
                        subtext={`Avg: ${currentMetrics.load.five.toFixed(2)} / ${currentMetrics.load.fifteen.toFixed(2)}`}
                        icon={Activity}
                        color="text-amber-500"
                    />
                </div>

                {/* Grid 2: Charts and Info */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6 auto-rows-fr">
                    {/* Left Column: CPU History and Core Map */}
                    <div className="xl:col-span-2 flex flex-col gap-6">
                        {/* CPU History Chart */}
                        <Card className="p-6 relative z-20 xl:h-[480px] flex flex-col">
                            <div className="flex justify-between items-center mb-6 flex-shrink-0">
                                <h3 className="text-slate-800 dark:text-slate-200 font-medium">{t.cpuHistory}</h3>
                                <div className="flex gap-4 text-xs text-slate-500">
                                    <span className="flex items-center gap-1">
                                        <span className="w-3 h-1 bg-amber-500 rounded-full"></span> Top 1
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <span className="w-3 h-1 bg-emerald-500 rounded-full"></span> Top 2
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <span className="w-3 h-1 bg-blue-500 rounded-full"></span> Top 3
                                    </span>
                                </div>
                            </div>
                            <div className="flex-1 w-full min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={cpuChartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#1e293b" : "#e2e8f0"} vertical={false} />
                                        <XAxis
                                            dataKey="time"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 10 }} // reduced font size
                                            dy={10}
                                            minTickGap={30} // Prevent overcrowding
                                        />
                                        <YAxis
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 10 }}
                                            domain={[0, 100]}
                                            ticks={[0, 25, 50, 75, 100]}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
                                                borderColor: isDarkMode ? '#1e293b' : '#e2e8f0',
                                                color: isDarkMode ? '#f1f5f9' : '#0f172a'
                                            }}
                                            itemStyle={{ fontSize: '12px' }}
                                            labelStyle={{ fontSize: '12px', marginBottom: '4px', color: isDarkMode ? '#94a3b8' : '#64748b' }}
                                        />
                                        {/* Background Lines (Gray) */}
                                        {currentMetrics?.cpu.cores.map((core) => {
                                            if (topCores.includes(core.id)) return null;
                                            return (
                                                <Line
                                                    key={core.id}
                                                    type="monotone"
                                                    dataKey={`core_${core.id}`}
                                                    stroke={isDarkMode ? "#334155" : "#e2e8f0"}
                                                    strokeWidth={1}
                                                    dot={false}
                                                    isAnimationActive={true}
                                                    animationDuration={1500}
                                                    animationEasing="ease-in-out"
                                                />
                                            );
                                        })}
                                        {/* Top Cores (Colored) */}
                                        {topCores.map((id, index) => {
                                            const colors = ['#f59e0b', '#10b981', '#3b82f6'];
                                            return (
                                                <Line
                                                    key={`top_${id}`}
                                                    type="monotone"
                                                    dataKey={`core_${id}`}
                                                    stroke={colors[index]}
                                                    strokeWidth={2}
                                                    dot={false}
                                                    activeDot={{ r: 4, strokeWidth: 0 }}
                                                    isAnimationActive={true}
                                                    animationDuration={1500}
                                                    animationEasing="ease-in-out"
                                                />
                                            );
                                        })}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>

                        {/* Core Activity Map (Bottom Left) */}
                        <CpuGrid cores={currentMetrics.cpu.cores} t={t} className="flex-1" />
                    </div>

                    {/* Right Column: Memory, Network, System Info */}
                    <div className="flex flex-col gap-6">

                        {/* Wrapper for Memory & Network to match CPU Height */}
                        <div className="flex flex-col gap-6 xl:h-[480px]">
                            {/* Memory Trend */}
                            <Card className="p-6 flex-1 flex flex-col relative">
                                <div className="flex justify-between items-start mb-2 flex-shrink-0">
                                    <h3 className="text-slate-800 dark:text-slate-200 font-medium">{t.memTrend}</h3>
                                    <div className="text-right">
                                        <div className="text-emerald-500 text-sm font-medium mb-1">Stable</div>
                                        <div className="text-2xl text-slate-700 dark:text-slate-200 font-mono">
                                            {currentMetrics.memory.usedGb.toFixed(1)} <span className="text-sm text-slate-500">GB</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 w-full min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={memoryChartData}>
                                            <defs>
                                                <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#1e293b" : "#e2e8f0"} vertical={false} />
                                            <XAxis dataKey="time" hide />
                                            <YAxis hide domain={[0, currentMetrics.memory.totalGb]} />
                                            <Tooltip
                                                content={({ active, payload }) => {
                                                    if (active && payload && payload.length) {
                                                        const used = payload[0].value as number;
                                                        const total = currentMetrics.memory.totalGb;
                                                        const percentage = ((used / total) * 100).toFixed(1);
                                                        return (
                                                            <div className={`${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} border p-2 rounded shadow-lg`}>
                                                                <p className="text-xs text-slate-500 mb-1">{payload[0].payload.time}</p>
                                                                <p className="text-sm font-medium text-purple-500">
                                                                    Used: {used.toFixed(1)} GB ({percentage}%)
                                                                </p>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                }}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="used"
                                                stroke="#8b5cf6"
                                                fillOpacity={1}
                                                fill="url(#colorMem)"
                                                animationDuration={1500}
                                                animationEasing="ease-in-out"
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </Card>

                            {/* Network Traffic Chart */}
                            <Card className="p-6 flex-1 flex flex-col">
                                <div className="flex justify-between items-center mb-2 flex-shrink-0">
                                    <h3 className="text-slate-800 dark:text-slate-200 font-medium">{t.netInOut || "Network Traffic"}</h3>
                                    <div className="flex gap-4 text-xs text-slate-500">
                                        <span className="flex items-center gap-1">
                                            <div className="w-2 h-2 rounded-sm bg-blue-500"></div> Up
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <div className="w-2 h-2 rounded-sm bg-emerald-500"></div> Down
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1 w-full min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={networkChartData}>
                                            <defs>
                                                <linearGradient id="colorNetUp" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="colorNetDown" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#1e293b" : "#e2e8f0"} vertical={false} />
                                            <XAxis
                                                dataKey="time"
                                                hide
                                            />
                                            <YAxis
                                                hide
                                                domain={[0, 'auto']}
                                            />
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
                                                    borderColor: isDarkMode ? '#1e293b' : '#e2e8f0',
                                                    color: isDarkMode ? '#f1f5f9' : '#0f172a'
                                                }}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="up"
                                                stroke="#3b82f6"
                                                fillOpacity={1}
                                                fill="url(#colorNetUp)"
                                                animationDuration={1500}
                                                animationEasing="ease-in-out"
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="down"
                                                stroke="#10b981"
                                                fillOpacity={1}
                                                fill="url(#colorNetDown)"
                                                animationDuration={1500}
                                                animationEasing="ease-in-out"
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </Card>
                        </div>

                        {/* System Info (Bottom Right) - Aligns with Core Map */}
                        <Card className="p-0 overflow-hidden flex-1 flex flex-col">
                            <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center flex-shrink-0">
                                <h3 className="text-slate-800 dark:text-slate-200 font-medium">{t.sysInfo}</h3>
                                <MoreVertical size={16} className="text-slate-500 cursor-pointer" />
                            </div>
                            <div className="p-4 space-y-4 flex-1 overflow-auto">
                                <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/50">
                                    <span className="text-slate-500 text-sm">{t.hostname}</span>
                                    <span className="text-slate-700 dark:text-slate-200 font-mono text-sm">prod-worker-01</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/50">
                                    <span className="text-slate-500 text-sm">{t.os}</span>
                                    <span className="text-slate-700 dark:text-slate-200 font-mono text-sm">Ubuntu 22.04 LTS</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/50">
                                    <span className="text-slate-500 text-sm">{t.kernel}</span>
                                    <span className="text-slate-700 dark:text-slate-200 font-mono text-sm">5.15.0-78-generic</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/50">
                                    <span className="text-slate-500 text-sm">{t.uptime}</span>
                                    <span className="text-slate-700 dark:text-slate-200 font-mono text-sm">
                                        {(currentMetrics.uptime / 3600).toFixed(1)}h
                                    </span>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>

                {/* Row 3: Disk Usage (Full Width) */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-4">
                        <HardDrive className="text-slate-400" size={20} />
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">{t.diskUsage}</h3>
                    </div>
                    <DiskUsage disks={currentMetrics.disk} t={t} />
                </div>
            </div>
        </div>
    );
};

export default ServerMonitor;