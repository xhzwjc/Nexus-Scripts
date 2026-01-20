import React, {
    useState,
    useMemo,
    useCallback,
    useEffect,
    useRef,
} from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from './ui/select';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from './ui/dialog';
import {
    ArrowLeft,
    Play,
    Copy,
    AlertCircle,
    ChevronRight,
    ChevronLeft,
    Loader2,
    ArrowUpDown, // 新增：用于可排序表头图标
} from 'lucide-react';
import { Skeleton } from './ui/skeleton';
import { getApiBaseUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';

// ---------- 类型 ----------
interface CommissionDetail {
    id: number;
    tax_id: number;
    tax_name: string;
    actual_amount: number;
    pay_amount: number;
    server_amount: number;
    commission: number;
    raw_commission: string;
    channel_profit: number;
    raw_channel_profit: string;
    batch_no: string;
    balance_no: string;
    rate_config: string;
    rate_detail: string;
    history_amount: number;
    payment_over_time: string;
    enterprise_id: number;
    enterprise_name: string;
    year_month: [number, number];
    month_str: string;
    api_commission: number;
    is_matched: boolean;
    difference: number;
    tolerance: number;
    monthly_accumulation: number;
}

interface SummaryMetrics {
    total_profit: number;
    monthly_profit: number;
    daily_profit: number;
    is_profitable: boolean;
    total_pay_amount: number;
    daily_pay_amount: number;
    total_count: number;
    mismatch_count: number;
    match_rate: number;
}

interface EnterpriseData {
    enterprise_name: string;
    enterprise_id: number;
    total_pay_amount: number;
    total_profit: number;
    total_count: number;
    total_recharge_amount: number;
    month: string;
    month_pay_amount: number;
    month_profit: number;
    month_count: number;
    month_recharge_amount: number;
}

interface ApiResponse {
    success: boolean;
    message: string;
    data: {
        commission_details: CommissionDetail[];
        summary_metrics: SummaryMetrics;
        enterprise_data: EnterpriseData[];
        total_items: number;
        api_verification: boolean;
        summary: {
            total_profit: number;
            total_pay_amount: number;
            transaction_count: number;
            mismatch_count: number;
            match_rate: number;
        };
    };
    request_id: string;
    channel_id: number;
}

// ---------- 骨架 ----------
const SkeletonRow = () => (
    <TableRow>
        {Array.from({ length: 13 }).map((_, i) => (
            <TableCell key={i}>
                <Skeleton className="h-5" />
            </TableCell>
        ))}
    </TableRow>
);

// ---------- 组件 ----------
export default function CommissionScript({ onBack }: { onBack: () => void }) {
    const { t } = useI18n();
    const { commission } = t.scripts;
    const [environment, setEnvironment] = useState('test');
    const [channelId, setChannelId] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const [logs, setLogs] = useState<string[]>([]);
    const logViewportRef = useRef<HTMLDivElement | null>(null);
    const [logAutoFollow, setLogAutoFollow] = useState(true);

    const [allCommissionDetails, setAllCommissionDetails] = useState<CommissionDetail[]>([]);
    const [summaryMetrics, setSummaryMetrics] = useState<SummaryMetrics | null>(null);
    const [enterpriseData, setEnterpriseData] = useState<EnterpriseData[]>([]);
    const [apiVerification, setApiVerification] = useState(true);
    const [selectedDetail, setSelectedDetail] = useState<CommissionDetail | null>(null);


    // 分页 (Deprecated / Unused local pagination logic - removed unused parts)
    // const [pagination, setPagination] = useState({page: 1, pageSize: 10, totalItems: 0});
    // const pageSize = 10;
    // const totalPages = useMemo(
    //     () => Math.max(1, Math.ceil((pagination.totalItems || allCommissionDetails.length) / pagination.pageSize)),
    //     [pagination.totalItems, pagination.pageSize, allCommissionDetails.length]
    // );
    // const paginatedDetails = useMemo(
    //     () => allCommissionDetails.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize),
    //     [allCommissionDetails, pagination.page, pagination.pageSize]
    // );
    // const [pageInput, setPageInput] = useState('1');
    const tableTopRef = useRef<HTMLDivElement | null>(null);

    // 企业切换
    const uniqueEnterprises = useMemo(
        () => Array.from(new Map(enterpriseData.map((item) => [item.enterprise_id, item])).values()),
        [enterpriseData]
    );
    const [currentEnterpriseIndex, setCurrentEnterpriseIndex] = useState(0);
    const currentEnterprise = useMemo(
        () => uniqueEnterprises[currentEnterpriseIndex] || null,
        [uniqueEnterprises, currentEnterpriseIndex]
    );
    const currentEnterpriseMonthlyData = useMemo(
        () =>
            currentEnterprise
                ? enterpriseData
                    .filter((item) => item.enterprise_id === currentEnterprise.enterprise_id)
                    .sort((a, b) => b.month.localeCompare(a.month))
                : [],
        [currentEnterprise, enterpriseData]
    );

    // 货币格式化（更稳健）
    const currency = useMemo(
        () =>
            new Intl.NumberFormat('zh-CN', {
                style: 'currency',
                currency: 'CNY',
                minimumFractionDigits: 2,
            }),
        []
    );
    const formatCurrency = useCallback((amount: number) => currency.format(amount), [currency]);

    // 复制详情
    const handleCopyToClipboard = useCallback((detail: CommissionDetail | null) => {
        if (!detail) return;
        const text = Object.entries(detail)
            .map(([key, value]) => `${key}: ${typeof value === 'number' ? formatCurrency(value as number) : value}`)
            .join('\n');
        navigator.clipboard
            .writeText(text)
            .then(() => toast.success(commission.dialog.copySuccess))
            .catch(() => toast.error(commission.dialog.copyFail));
    }, [formatCurrency, commission.dialog]);

    // 日志：自动跟随到底部（用户上滑则暂停）
    const onLogScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
        setLogAutoFollow(nearBottom);
    };
    useEffect(() => {
        if (logAutoFollow && logViewportRef.current) {
            logViewportRef.current.scrollTo({ top: logViewportRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [logs, logAutoFollow]);

    // 翻页回顶
    const scrollToTableTop = () => {
        tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // Unused handlers
    // const handlePageChange = (newPage: number) => { ... };
    // const handlePageInputSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => { ... };

    const handleEnterpriseChange = (direction: 'next' | 'prev') => {
        if (uniqueEnterprises.length === 0) return;
        setCurrentEnterpriseIndex((prev) =>
            direction === 'next'
                ? Math.min(prev + 1, uniqueEnterprises.length - 1)
                : Math.max(prev - 1, 0)
        );
    };

    // 执行
    const startExecution = async () => {
        if (!environment || !channelId) {
            toast.error(commission.messages.selectEnvAndChannelId);
            return;
        }

        setIsLoading(true);
        setLogs([commission.logs.start]);
        // 清空旧数据
        setAllCommissionDetails([]);
        setSummaryMetrics(null);
        setEnterpriseData([]);
        setApiVerification(true);
        // setPagination({page: 1, pageSize, totalItems: 0});
        // setPageInput('1');
        setCurrentEnterpriseIndex(0);

        // 同步清空（新税地分析用的本地状态）
        setSelectedDetail(null);
        setSearchQuery('');
        setOnlyMismatch(false);
        setSortBy('id');
        setSortDir('asc');
        setAnalysisPagination({ page: 1, pageSize: 10 });
        setAnalysisPageInput('1');

        try {
            const base = getApiBaseUrl();
            if (!base) return;

            const response = await axios.post<ApiResponse>(
                `${base}/commission/calculate`,
                {
                    channel_id: Number(channelId),
                    environment,
                    timeout: 30,
                }
            );

            if (response.data.success) {
                const {
                    commission_details,
                    summary_metrics,
                    enterprise_data,
                    // total_items, // Unused
                    api_verification,
                } = response.data.data;

                setLogs((prev) => [...prev, `${commission.logs.success}${commission.messages.execSuccess}`]);
                toast.success(commission.messages.execSuccess);

                // 排序稳定
                const sorted = [...commission_details].sort((a, b) => a.id - b.id);
                setAllCommissionDetails(sorted);
                setSummaryMetrics(summary_metrics);
                setEnterpriseData(enterprise_data);
                setApiVerification(api_verification);
                // setPagination((prev) => ({
                //     ...prev,
                //     page: 1,
                //     totalItems: total_items || sorted.length,
                // }));
                // setPageInput('1');
                setCurrentEnterpriseIndex(0);
            } else {
                throw new Error(response.data.message || '接口返回失败');
            }
        } catch (error) {
            const errorMsg = axios.isAxiosError(error)
                ? error.response?.data?.detail || error.message
                : error instanceof Error
                    ? error.message
                    : commission.logs.error;
            setLogs((prev) => [...prev, `${commission.logs.error}${errorMsg}`]);
            toast.error(errorMsg);

            // 失败清空
            setAllCommissionDetails([]);
            setSummaryMetrics(null);
            setEnterpriseData([]);
            // setPagination({page: 1, pageSize, totalItems: 0});
            // setPageInput('1');
            setCurrentEnterpriseIndex(0);

            // 同步清空新税地分析状态
            setSelectedDetail(null);
            setSearchQuery('');
            setOnlyMismatch(false);
            setSortBy('id');
            setSortDir('asc');
            setAnalysisPagination({ page: 1, pageSize: 10 });
            setAnalysisPageInput('1');
        } finally {
            setIsLoading(false);
            requestAnimationFrame(scrollToTableTop);
        }
    };

    // KPI 卡片数据（避免动态类名）
    const kpis = [
        { label: commission.kpi.totalProfit, value: summaryMetrics?.total_profit ?? 0, cls: 'bg-blue-50 text-blue-600' },
        { label: commission.kpi.monthCommission, value: summaryMetrics?.monthly_profit ?? 0, cls: 'bg-emerald-50 text-emerald-600' },
        { label: commission.kpi.dailyCommission, value: summaryMetrics?.daily_profit ?? 0, cls: 'bg-purple-50 text-purple-600' },
        {
            label: commission.kpi.profitStatus,
            value: summaryMetrics ? (summaryMetrics.is_profitable ? commission.kpi.profitable : commission.kpi.loss) : '-',
            cls: 'bg-amber-50 text-amber-600'
        },
        { label: commission.kpi.totalPay, value: summaryMetrics?.total_pay_amount ?? 0, cls: 'bg-indigo-50 text-indigo-600' },
        { label: commission.kpi.dailyPay, value: summaryMetrics?.daily_pay_amount ?? 0, cls: 'bg-rose-50 text-rose-600' },
        {
            label: commission.kpi.totalCount,
            value: summaryMetrics ? `${summaryMetrics.total_count} ${commission.kpi.countSuffix}` : '-',
            cls: 'bg-teal-50 text-teal-600'
        },
        {
            label: commission.kpi.matchRate,
            value: summaryMetrics ? `${summaryMetrics.match_rate}%` : '-',
            cls: summaryMetrics && summaryMetrics.mismatch_count > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600',
        },
    ];

    const [searchQuery, setSearchQuery] = useState('');
    const [onlyMismatch, setOnlyMismatch] = useState(false);
    const [sortBy, setSortBy] = useState<keyof CommissionDetail | 'id'>('id');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [analysisPagination, setAnalysisPagination] = useState({ page: 1, pageSize: 10 });
    const [analysisPageInput, setAnalysisPageInput] = useState('1');

    const filteredDetails = useMemo(() => {
        let list = allCommissionDetails;

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter(
                (d) =>
                    d.tax_name?.toLowerCase().includes(q) ||
                    d.enterprise_name?.toLowerCase().includes(q) ||
                    d.batch_no?.toLowerCase().includes(q) ||
                    d.balance_no?.toLowerCase().includes(q) ||
                    d.month_str?.toLowerCase().includes(q)
            );
        }

        if (onlyMismatch) {
            list = list.filter((d) => !d.is_matched || d.difference !== 0);
        }
        return list;
    }, [allCommissionDetails, searchQuery, onlyMismatch]);

    const sortedAnalysisDetails = useMemo(() => {
        const list = [...filteredDetails];
        const getVal = (d: CommissionDetail) => d[sortBy as keyof CommissionDetail];
        list.sort((a, b) => {
            const va = getVal(a);
            const vb = getVal(b);
            if (va == null && vb == null) return 0;
            if (va == null) return sortDir === 'asc' ? -1 : 1;
            if (vb == null) return sortDir === 'asc' ? 1 : -1;
            if (typeof va === 'number' && typeof vb === 'number') {
                return sortDir === 'asc' ? va - vb : vb - va;
            }
            return sortDir === 'asc'
                ? String(va).localeCompare(String(vb))
                : String(vb).localeCompare(String(va));
        });
        return list;
    }, [filteredDetails, sortBy, sortDir]);

    const analysisTotalPages = useMemo(
        () => Math.max(1, Math.ceil(sortedAnalysisDetails.length / analysisPagination.pageSize)),
        [sortedAnalysisDetails.length, analysisPagination.pageSize]
    );
    const analysisPageSafe = Math.min(Math.max(1, analysisPagination.page), analysisTotalPages);

    useEffect(() => {
        if (analysisPagination.page > analysisTotalPages) {
            setAnalysisPagination((prev) => ({ ...prev, page: 1 }));
            setAnalysisPageInput('1');
        }
    }, [analysisTotalPages, analysisPagination.page]);

    const analysisPaginatedDetails = useMemo(() => {
        const start = (analysisPageSafe - 1) * analysisPagination.pageSize;
        return sortedAnalysisDetails.slice(start, start + analysisPagination.pageSize);
    }, [sortedAnalysisDetails, analysisPageSafe, analysisPagination.pageSize]);

    const handleAnalysisPageChange = useCallback((newPage: number) => {
        if (newPage < 1 || newPage > analysisTotalPages) return;
        setAnalysisPagination((prev) => ({ ...prev, page: newPage }));
        setAnalysisPageInput(String(newPage));
    }, [analysisTotalPages]);

    const handleAnalysisPageInputSubmit = useCallback(() => {
        const n = parseInt(analysisPageInput, 10);
        if (Number.isNaN(n)) {
            setAnalysisPageInput(String(analysisPageSafe));
            return;
        }
        const clamped = Math.min(Math.max(1, n), analysisTotalPages);
        handleAnalysisPageChange(clamped);
    }, [analysisPageInput, analysisTotalPages, analysisPageSafe, handleAnalysisPageChange]);

    const toggleSort = (key: keyof CommissionDetail | 'id') => {
        if (sortBy === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortBy(key);
            setSortDir('asc');
        }
    };

    const SortableHead = ({ label, field }: { label: string; field: keyof CommissionDetail | 'id' }) => (
        <TableHead className="whitespace-nowrap">
            <Button
                variant="ghost"
                size="sm"
                className="p-0 h-auto font-medium"
                onClick={() => toggleSort(field)}
            >
                <span className="inline-flex items-center gap-1">
                    {label}
                    <ArrowUpDown
                        className={`h-4 w-4 ${sortBy === field ? 'text-foreground' : 'text-muted-foreground'}`}
                    />
                </span>
            </Button>
        </TableHead>
    );
    // -------------------- 新增结束 --------------------

    return (
        <div className="min-h-screen colorful-background">
            <div className="max-w-7xl mx-auto p-6">
                {/* 顶部 */}
                <div className="mb-6">
                    <Button variant="ghost" onClick={onBack} className="mb-4">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        {commission.back}
                    </Button>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl">{commission.title}</h1>
                        <Badge variant={isLoading ? 'destructive' : 'secondary'}>
                            {isLoading ? commission.status.running : commission.status.ready}
                        </Badge>
                        {!apiVerification && (
                            <Badge variant="outline" className="text-amber-600 border-amber-600">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                {commission.status.apiMismatch}
                            </Badge>
                        )}
                    </div>
                    <p className="text-muted-foreground">
                        {commission.subtitle}
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* 左侧：参数 + 日志 */}
                    <div className="lg:col-span-1 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>{commission.params.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label>{commission.params.env}</Label>
                                    <Select value={environment} onValueChange={setEnvironment} disabled={isLoading}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={commission.params.envPlaceholder} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="test">Beta</SelectItem>
                                            <SelectItem value="prod">Prod</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>{commission.params.channelId}</Label>
                                    <Input
                                        value={channelId}
                                        onChange={(e) => setChannelId(e.target.value.replace(/[^\d]/g, ''))}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !isLoading) startExecution();
                                        }}
                                        placeholder={commission.params.channelIdPlaceholder}
                                        inputMode="numeric"
                                        pattern="\d*"
                                        disabled={isLoading}
                                    />
                                </div>
                                <Button
                                    onClick={startExecution}
                                    disabled={!environment || !channelId || isLoading}
                                    className="w-full"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            {commission.params.loading}
                                        </>
                                    ) : (
                                        <>
                                            <Play className="w-4 h-4 mr-2" />
                                            {commission.params.start}
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>{commission.logs.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                {/* 单一滚动容器，裁剪稳定 */}
                                <div
                                    ref={logViewportRef}
                                    onScroll={onLogScroll}
                                    className="h-48 w-full overflow-auto overscroll-contain p-4"
                                >
                                    <div className="space-y-2 max-w-full break-words">
                                        {logs.length === 0 ? (
                                            <p className="text-muted-foreground px-1">{commission.logs.waiting}</p>
                                        ) : (
                                            logs.map((log, i) => (
                                                <div key={i} className="text-xs font-mono tabular-nums">
                                                    {log}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between px-4 py-2 border-t">
                                    <span className="text-xs text-muted-foreground">
                                        {logAutoFollow ? commission.logs.autoFollow : commission.logs.paused}
                                    </span>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setLogAutoFollow(true);
                                                requestAnimationFrame(() => {
                                                    if (logViewportRef.current) {
                                                        logViewportRef.current.scrollTop =
                                                            logViewportRef.current.scrollHeight;
                                                    }
                                                });
                                            }}
                                        >
                                            {commission.logs.bottom}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setLogs([])}
                                        >
                                            {commission.logs.clear}
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* 右侧：数据区 */}
                    <div className="lg:col-span-3 space-y-6">
                        {/* KPI 汇总（加载时骨架） */}
                        <Card>
                            <CardHeader>
                                <CardTitle>渠道汇总统计</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {kpis.map((k, idx) => (
                                        <div key={idx} className={`p-4 rounded-lg ${k.cls}`}>
                                            {isLoading ? (
                                                <Skeleton className="h-12 w-full" />
                                            ) : (
                                                <>
                                                    <p className="text-sm/6 text-muted-foreground">{k.label}</p>
                                                    <p className="text-xl font-semibold tabular-nums">
                                                        {typeof k.value === 'number' ? formatCurrency(k.value) : k.value}
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* 税地级别分析 */}
                        <div ref={tableTopRef} />
                        <Card>
                            <CardHeader>
                                <CardTitle>{commission.taxAnalysis.title}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {/* 筛选工具条 */}
                                <div
                                    className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between mb-3">
                                    <div className="flex gap-2 items-center">
                                        <Input
                                            placeholder={commission.taxAnalysis.searchPlaceholder}
                                            value={searchQuery}
                                            onChange={(e) => {
                                                setSearchQuery(e.target.value);
                                                setAnalysisPagination((prev) => ({ ...prev, page: 1 }));
                                                setAnalysisPageInput('1');
                                            }}
                                            className="w-64"
                                        />
                                        <Button
                                            variant={onlyMismatch ? 'default' : 'outline'}
                                            onClick={() => {
                                                setOnlyMismatch((v) => !v);
                                                setAnalysisPagination((prev) => ({ ...prev, page: 1 }));
                                                setAnalysisPageInput('1');
                                            }}
                                        >
                                            {commission.taxAnalysis.onlyMismatch}
                                        </Button>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Label className="text-sm text-muted-foreground">{commission.taxAnalysis.pageSize}</Label>
                                        <Select
                                            value={String(analysisPagination.pageSize)}
                                            onValueChange={(v) => {
                                                const size = parseInt(v, 10);
                                                setAnalysisPagination((prev) => ({ ...prev, pageSize: size, page: 1 }));
                                                setAnalysisPageInput('1');
                                            }}
                                        >
                                            <SelectTrigger className="w-24">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {[10, 20, 50, 100].map((n) => (
                                                    <SelectItem key={n} value={String(n)}>
                                                        {n}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="overflow-x-auto rounded-md border">
                                    <Table className="text-sm">
                                        <TableHeader className="sticky top-0 bg-white z-10">
                                            <TableRow>
                                                <SortableHead label={commission.table.taxName} field="tax_name" />
                                                <SortableHead label={commission.table.actualPay} field="actual_amount" />
                                                <SortableHead label={commission.table.payAmount} field="pay_amount" />
                                                <SortableHead label={commission.table.serviceFee} field="server_amount" />
                                                <SortableHead label={commission.table.channelFee} field="commission" />
                                                <SortableHead label={commission.table.apiCommission} field="api_commission" />
                                                <SortableHead label={commission.table.difference} field="difference" />
                                                <SortableHead label={commission.table.channelProfit} field="channel_profit" />
                                                <TableHead className="whitespace-nowrap">{commission.table.batchNo}</TableHead>
                                                <TableHead className="whitespace-nowrap">{commission.table.settlementNo}</TableHead>
                                                <SortableHead label={commission.table.month} field="month_str" />
                                                <SortableHead label={commission.table.history} field="history_amount" />
                                                <TableHead className="whitespace-nowrap">{commission.table.actions}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isLoading ? (
                                                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                                            ) : analysisPaginatedDetails.length > 0 ? (
                                                analysisPaginatedDetails.map((detail) => (
                                                    <TableRow
                                                        key={detail.id}
                                                        className={!detail.is_matched ? 'bg-red-50' : undefined}
                                                    >
                                                        <TableCell className="max-w-[260px] truncate"
                                                            title={detail.tax_name}>
                                                            {detail.tax_name}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono tabular-nums">
                                                            {formatCurrency(detail.actual_amount)}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono tabular-nums">
                                                            {formatCurrency(detail.pay_amount)}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono tabular-nums">
                                                            {formatCurrency(detail.server_amount)}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono tabular-nums">
                                                            {formatCurrency(detail.commission)}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono tabular-nums">
                                                            {formatCurrency(detail.api_commission)}
                                                        </TableCell>
                                                        <TableCell
                                                            className={`text-right font-mono tabular-nums ${detail.difference !== 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'
                                                                }`}
                                                        >
                                                            {formatCurrency(detail.difference)}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono tabular-nums">
                                                            {formatCurrency(detail.channel_profit)}
                                                        </TableCell>
                                                        <TableCell className="max-w-[200px] truncate"
                                                            title={detail.batch_no}>
                                                            {detail.batch_no}
                                                        </TableCell>
                                                        <TableCell className="max-w-[200px] truncate"
                                                            title={detail.balance_no}>
                                                            {detail.balance_no}
                                                        </TableCell>
                                                        <TableCell
                                                            className="whitespace-nowrap">{detail.month_str}</TableCell>
                                                        <TableCell className="text-right font-mono tabular-nums">
                                                            {formatCurrency(detail.history_amount)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Dialog
                                                                onOpenChange={(isOpen) => !isOpen && setSelectedDetail(null)}>
                                                                <DialogTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => setSelectedDetail(detail)}
                                                                    >
                                                                        {commission.table.detail}
                                                                    </Button>
                                                                </DialogTrigger>
                                                                {selectedDetail && (
                                                                    <DialogContent className="max-w-2xl">
                                                                        <DialogHeader>
                                                                            <DialogTitle>
                                                                                {selectedDetail.tax_name} - {commission.dialog.title}
                                                                            </DialogTitle>
                                                                        </DialogHeader>
                                                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.taxName}:</strong> {selectedDetail.tax_name}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.taxId}:</strong> {selectedDetail.tax_id}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.entName}:</strong> {selectedDetail.enterprise_name}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.entId}:</strong> {selectedDetail.enterprise_id}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.actualPay}:</strong> {formatCurrency(selectedDetail.actual_amount)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.payAmount}:</strong> {formatCurrency(selectedDetail.pay_amount)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.serverFee}:</strong> {formatCurrency(selectedDetail.server_amount)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.channelFee}:</strong> {formatCurrency(selectedDetail.commission)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.apiCommission}:</strong> {formatCurrency(selectedDetail.api_commission)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.difference}:</strong> {formatCurrency(selectedDetail.difference)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.allowance}:</strong> {formatCurrency(selectedDetail.tolerance)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.rawFee}:</strong> {selectedDetail.raw_commission}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.channelProfit}:</strong> {formatCurrency(selectedDetail.channel_profit)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.rawProfit}:</strong> {selectedDetail.raw_channel_profit}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.batchNo}:</strong> {selectedDetail.batch_no}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.settlementNo}:</strong> {selectedDetail.balance_no}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.rateConfig}:</strong> {selectedDetail.rate_config}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.rateDetail}:</strong> {selectedDetail.rate_detail}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.history}:</strong> {formatCurrency(selectedDetail.history_amount)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.payTime}:</strong> {selectedDetail.payment_over_time}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.month}:</strong> {selectedDetail.month_str}
                                                                            </div>
                                                                            <div>
                                                                                <strong>{commission.dialog.fields.verifyStatus}:</strong> {selectedDetail.is_matched ? commission.dialog.fields.matched : commission.dialog.fields.mismatched}
                                                                            </div>
                                                                        </div>
                                                                        <Button
                                                                            onClick={() => handleCopyToClipboard(selectedDetail)}
                                                                            className="mt-4 w-full"
                                                                        >
                                                                            <Copy className="w-4 h-4 mr-2" />
                                                                            {commission.dialog.copy}
                                                                        </Button>
                                                                    </DialogContent>
                                                                )}
                                                            </Dialog>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={13}
                                                        className="h-24 text-center text-muted-foreground">
                                                        {searchQuery || onlyMismatch
                                                            ? commission.taxAnalysis.noData
                                                            : commission.taxAnalysis.empty}
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>

                                {/* 分页（新版税地表专用，不影响其他部分） */}
                                {!isLoading && sortedAnalysisDetails.length > 0 && (
                                    <div
                                        className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mt-4">
                                        <p className="text-sm text-muted-foreground">
                                            {commission.taxAnalysis.totalPages.replace('{total}', String(sortedAnalysisDetails.length))}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleAnalysisPageChange(analysisPageSafe - 1)}
                                                disabled={analysisPageSafe === 1}
                                            >
                                                {commission.taxAnalysis.prev}
                                            </Button>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    value={analysisPageInput}
                                                    onChange={(e) => setAnalysisPageInput(e.target.value.replace(/[^\d]/g, ''))}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleAnalysisPageInputSubmit();
                                                    }}
                                                    onBlur={handleAnalysisPageInputSubmit}
                                                    className="w-16 text-center"
                                                    min={1}
                                                    max={analysisTotalPages}
                                                />
                                                <span
                                                    className="text-sm text-muted-foreground">/ {analysisTotalPages}</span>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleAnalysisPageChange(analysisPageSafe + 1)}
                                                disabled={analysisPageSafe === analysisTotalPages}
                                            >
                                                {commission.taxAnalysis.next}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* 企业汇总数据 */}
                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>{commission.enterpriseAnalysis.title}</CardTitle>
                                    {uniqueEnterprises.length > 1 && (
                                        <div className="flex gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEnterpriseChange('prev')}
                                                disabled={currentEnterpriseIndex <= 0}
                                            >
                                                <ChevronLeft />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEnterpriseChange('next')}
                                                disabled={currentEnterpriseIndex >= uniqueEnterprises.length - 1}
                                            >
                                                <ChevronRight />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                {currentEnterprise && (
                                    <p className="text-sm text-muted-foreground">
                                        {commission.enterpriseAnalysis.info
                                            .replace('{current}', String(currentEnterpriseIndex + 1))
                                            .replace('{total}', String(uniqueEnterprises.length))
                                            .replace('{name}', currentEnterprise.enterprise_name)
                                            .replace('{id}', String(currentEnterprise.enterprise_id))}
                                    </p>
                                )}
                            </CardHeader>
                            <CardContent>
                                {isLoading ? (
                                    <Skeleton className="h-40 w-full" />
                                ) : !currentEnterprise ? (
                                    <div className="text-center py-8">{commission.enterpriseAnalysis.empty}</div>
                                ) : (
                                    <>
                                        <div
                                            className="mb-6 p-4 bg-gray-50 rounded-lg grid grid-cols-2 md:grid-cols-3 gap-4">
                                            {Object.entries({
                                                [commission.enterpriseAnalysis.fields.name]: currentEnterprise.enterprise_name,
                                                [commission.enterpriseAnalysis.fields.id]: `${currentEnterprise.enterprise_id} `,
                                                [commission.enterpriseAnalysis.fields.totalPay]: formatCurrency(currentEnterprise.total_pay_amount),
                                                [commission.enterpriseAnalysis.fields.totalCommission]: formatCurrency(currentEnterprise.total_profit),
                                                [commission.enterpriseAnalysis.fields.totalCount]: `${currentEnterprise.total_count} ${commission.kpi.countSuffix}`,
                                                [commission.enterpriseAnalysis.fields.totalRecharge]: formatCurrency(currentEnterprise.total_recharge_amount),
                                            }).map(([label, value]) => (
                                                <div key={label}>
                                                    <p className="text-sm text-muted-foreground">{label}</p>
                                                    <p className="font-medium tabular-nums">{value}</p>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="overflow-x-auto rounded-md border">
                                            <Table className="text-sm">
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>{commission.enterpriseAnalysis.table.month}</TableHead>
                                                        <TableHead className="text-right">{commission.enterpriseAnalysis.table.monthPay}</TableHead>
                                                        <TableHead className="text-right">{commission.enterpriseAnalysis.table.monthCommission}</TableHead>
                                                        <TableHead className="text-right">{commission.enterpriseAnalysis.table.monthCount}</TableHead>
                                                        <TableHead className="text-right">{commission.enterpriseAnalysis.table.monthRecharge}</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {currentEnterpriseMonthlyData.map((d) => (
                                                        <TableRow key={d.month}>
                                                            <TableCell>{d.month}</TableCell>
                                                            <TableCell className="text-right font-mono tabular-nums">
                                                                {formatCurrency(d.month_pay_amount)}
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono tabular-nums">
                                                                {formatCurrency(d.month_profit)}
                                                            </TableCell>
                                                            <TableCell
                                                                className="text-right tabular-nums">{d.month_count} {commission.kpi.countSuffix}</TableCell>
                                                            <TableCell className="text-right font-mono tabular-nums">
                                                                {formatCurrency(d.month_recharge_amount)}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
