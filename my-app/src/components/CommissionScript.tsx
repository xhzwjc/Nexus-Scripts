import React, {
    useState,
    useMemo,
    useCallback,
    useEffect,
    useRef,
} from 'react';
import axios from 'axios';
import {Toaster, toast} from 'sonner';
import {Card, CardContent, CardHeader, CardTitle} from './ui/card';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Label} from './ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from './ui/select';
import {Badge} from './ui/badge';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from './ui/table';
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
    Info,
    ArrowUpDown, // 新增：用于可排序表头图标
} from 'lucide-react';
import {Skeleton} from './ui/skeleton';
import {getApiBaseUrl} from '../lib/api';

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
        {Array.from({length: 13}).map((_, i) => (
            <TableCell key={i}>
                <Skeleton className="h-5"/>
            </TableCell>
        ))}
    </TableRow>
);

// ---------- 组件 ----------
export default function CommissionScript({onBack}: { onBack: () => void }) {
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


    // 分页
    const [pagination, setPagination] = useState({page: 1, pageSize: 10, totalItems: 0});
    const pageSize = 10;
    const totalPages = useMemo(
        () => Math.max(1, Math.ceil((pagination.totalItems || allCommissionDetails.length) / pagination.pageSize)),
        [pagination.totalItems, pagination.pageSize, allCommissionDetails.length]
    );
    const paginatedDetails = useMemo(
        () => allCommissionDetails.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize),
        [allCommissionDetails, pagination.page, pagination.pageSize]
    );
    const [pageInput, setPageInput] = useState('1');
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
    const formatCurrency = (amount: number) => currency.format(amount);

    // 复制详情
    const handleCopyToClipboard = useCallback((detail: CommissionDetail | null) => {
        if (!detail) return;
        const text = Object.entries(detail)
            .map(([key, value]) => `${key}: ${typeof value === 'number' ? formatCurrency(value as number) : value}`)
            .join('\n');
        navigator.clipboard
            .writeText(text)
            .then(() => toast.success('数据已复制到剪贴板'))
            .catch(() => toast.error('复制失败'));
    }, [formatCurrency]);

    // 日志：自动跟随到底部（用户上滑则暂停）
    const onLogScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
        setLogAutoFollow(nearBottom);
    };
    useEffect(() => {
        if (logAutoFollow && logViewportRef.current) {
            logViewportRef.current.scrollTo({top: logViewportRef.current.scrollHeight, behavior: 'smooth'});
        }
    }, [logs, logAutoFollow]);

    // 翻页回顶
    const scrollToTableTop = () => {
        tableTopRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
    };

    const handlePageChange = (newPage: number) => {
        const page = Math.min(Math.max(1, newPage), totalPages);
        if (page === pagination.page) return;
        setPagination((prev) => ({...prev, page}));
        setPageInput(String(page));
        requestAnimationFrame(scrollToTableTop);
    };

    const handlePageInputSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handlePageChange(Number(pageInput || '1'));
    };

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
            toast.error('请选择环境并输入渠道ID');
            return;
        }

        setIsLoading(true);
        setLogs(['[INFO] 开始执行渠道佣金计算脚本...']);
        // 清空旧数据
        setAllCommissionDetails([]);
        setSummaryMetrics(null);
        setEnterpriseData([]);
        setApiVerification(true);
        setPagination({page: 1, pageSize, totalItems: 0});
        setPageInput('1');
        setCurrentEnterpriseIndex(0);

        // 同步清空（新税地分析用的本地状态）
        setSelectedDetail(null);
        setSearchQuery('');
        setOnlyMismatch(false);
        setSortBy('id');
        setSortDir('asc');
        setAnalysisPagination({page: 1, pageSize: 10});
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
                    total_items,
                    api_verification,
                } = response.data.data;

                setLogs((prev) => [...prev, `[SUCCESS] ${response.data.message}`]);
                toast.success(response.data.message);

                // 排序稳定
                const sorted = [...commission_details].sort((a, b) => a.id - b.id);
                setAllCommissionDetails(sorted);
                setSummaryMetrics(summary_metrics);
                setEnterpriseData(enterprise_data);
                setApiVerification(api_verification);
                setPagination((prev) => ({
                    ...prev,
                    page: 1,
                    totalItems: total_items || sorted.length,
                }));
                setPageInput('1');
                setCurrentEnterpriseIndex(0);
            } else {
                throw new Error(response.data.message || '接口返回失败');
            }
        } catch (error) {
            const errorMsg = axios.isAxiosError(error)
                ? error.response?.data?.detail || error.message
                : error instanceof Error
                    ? error.message
                    : '未知错误';
            setLogs((prev) => [...prev, `[ERROR] ${errorMsg}`]);
            toast.error(errorMsg);

            // 失败清空
            setAllCommissionDetails([]);
            setSummaryMetrics(null);
            setEnterpriseData([]);
            setPagination({page: 1, pageSize, totalItems: 0});
            setPageInput('1');
            setCurrentEnterpriseIndex(0);

            // 同步清空新税地分析状态
            setSelectedDetail(null);
            setSearchQuery('');
            setOnlyMismatch(false);
            setSortBy('id');
            setSortDir('asc');
            setAnalysisPagination({page: 1, pageSize: 10});
            setAnalysisPageInput('1');
        } finally {
            setIsLoading(false);
            requestAnimationFrame(scrollToTableTop);
        }
    };

    // KPI 卡片数据（避免动态类名）
    const kpis = [
        {label: '渠道总利润', value: summaryMetrics?.total_profit ?? 0, cls: 'bg-blue-50 text-blue-600'},
        {label: '本月佣金', value: summaryMetrics?.monthly_profit ?? 0, cls: 'bg-emerald-50 text-emerald-600'},
        {label: '今日佣金', value: summaryMetrics?.daily_profit ?? 0, cls: 'bg-purple-50 text-purple-600'},
        {
            label: '盈利状态',
            value: summaryMetrics ? (summaryMetrics.is_profitable ? '盈利' : '亏损') : '-',
            cls: 'bg-amber-50 text-amber-600'
        },
        {label: '累计发放', value: summaryMetrics?.total_pay_amount ?? 0, cls: 'bg-indigo-50 text-indigo-600'},
        {label: '当日发放', value: summaryMetrics?.daily_pay_amount ?? 0, cls: 'bg-rose-50 text-rose-600'},
        {
            label: '累计笔数',
            value: summaryMetrics ? `${summaryMetrics.total_count} 笔` : '-',
            cls: 'bg-teal-50 text-teal-600'
        },
        {
            label: '匹配率',
            value: summaryMetrics ? `${summaryMetrics.match_rate}%` : '-',
            cls: summaryMetrics && summaryMetrics.mismatch_count > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600',
        },
    ];

    const [searchQuery, setSearchQuery] = useState('');
    const [onlyMismatch, setOnlyMismatch] = useState(false);
    const [sortBy, setSortBy] = useState<keyof CommissionDetail | 'id'>('id');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [analysisPagination, setAnalysisPagination] = useState({page: 1, pageSize: 10});
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
            setAnalysisPagination((prev) => ({...prev, page: 1}));
            setAnalysisPageInput('1');
        }
    }, [analysisTotalPages, analysisPagination.page]);

    const analysisPaginatedDetails = useMemo(() => {
        const start = (analysisPageSafe - 1) * analysisPagination.pageSize;
        return sortedAnalysisDetails.slice(start, start + analysisPagination.pageSize);
    }, [sortedAnalysisDetails, analysisPageSafe, analysisPagination.pageSize]);

    const handleAnalysisPageChange = (newPage: number) => {
        if (newPage < 1 || newPage > analysisTotalPages) return;
        setAnalysisPagination((prev) => ({...prev, page: newPage}));
        setAnalysisPageInput(String(newPage));
    };

    const handleAnalysisPageInputSubmit = useCallback(() => {
        const n = parseInt(analysisPageInput, 10);
        if (Number.isNaN(n)) {
            setAnalysisPageInput(String(analysisPageSafe));
            return;
        }
        const clamped = Math.min(Math.max(1, n), analysisTotalPages);
        handleAnalysisPageChange(clamped);
    }, [analysisPageInput, analysisTotalPages, analysisPageSafe]);

    const toggleSort = (key: keyof CommissionDetail | 'id') => {
        if (sortBy === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortBy(key);
            setSortDir('asc');
        }
    };

    const SortableHead = ({label, field}: { label: string; field: keyof CommissionDetail | 'id' }) => (
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
            <Toaster richColors position="top-center"/>
            <div className="max-w-7xl mx-auto p-6">
                {/* 顶部 */}
                <div className="mb-6">
                    <Button variant="ghost" onClick={onBack} className="mb-4">
                        <ArrowLeft className="w-4 h-4 mr-2"/>
                        返回脚本列表
                    </Button>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl">渠道佣金计算与验证</h1>
                        <Badge variant={isLoading ? 'destructive' : 'secondary'}>
                            {isLoading ? '运行中' : '就绪'}
                        </Badge>
                        {!apiVerification && (
                            <Badge variant="outline" className="text-amber-600 border-amber-600">
                                <AlertCircle className="w-3 h-3 mr-1"/>
                                API验证不匹配
                            </Badge>
                        )}
                    </div>
                    <p className="text-muted-foreground">
                        计算渠道佣金并进行数据校验，支持税地级别和企业汇总分析
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* 左侧：参数 + 日志 */}
                    <div className="lg:col-span-1 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>参数配置</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label>环境</Label>
                                    <Select value={environment} onValueChange={setEnvironment} disabled={isLoading}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="选择环境"/>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="test">Beta</SelectItem>
                                            <SelectItem value="prod">生产环境</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>渠道ID</Label>
                                    <Input
                                        value={channelId}
                                        onChange={(e) => setChannelId(e.target.value.replace(/[^\d]/g, ''))}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !isLoading) startExecution();
                                        }}
                                        placeholder="输入渠道ID"
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
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin"/>
                                            加载中...
                                        </>
                                    ) : (
                                        <>
                                            <Play className="w-4 h-4 mr-2"/>
                                            开始执行
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>实时日志</CardTitle>
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
                                            <p className="text-muted-foreground px-1">等待执行...</p>
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
                    {logAutoFollow ? '自动跟随' : '已暂停自动跟随（上滑以查看历史）'}
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
                                            跳到底部
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setLogs([])}
                                        >
                                            清空
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
                                                <Skeleton className="h-12 w-full"/>
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
                        <div ref={tableTopRef}/>
                        <Card>
                            <CardHeader>
                                <CardTitle>税地级别分析</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {/* 筛选工具条 */}
                                <div
                                    className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between mb-3">
                                    <div className="flex gap-2 items-center">
                                        <Input
                                            placeholder="搜索 税地/企业/批次/结算单/月..."
                                            value={searchQuery}
                                            onChange={(e) => {
                                                setSearchQuery(e.target.value);
                                                setAnalysisPagination((prev) => ({...prev, page: 1}));
                                                setAnalysisPageInput('1');
                                            }}
                                            className="w-64"
                                        />
                                        <Button
                                            variant={onlyMismatch ? 'default' : 'outline'}
                                            onClick={() => {
                                                setOnlyMismatch((v) => !v);
                                                setAnalysisPagination((prev) => ({...prev, page: 1}));
                                                setAnalysisPageInput('1');
                                            }}
                                        >
                                            仅看不匹配
                                        </Button>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Label className="text-sm text-muted-foreground">每页</Label>
                                        <Select
                                            value={String(analysisPagination.pageSize)}
                                            onValueChange={(v) => {
                                                const size = parseInt(v, 10);
                                                setAnalysisPagination((prev) => ({...prev, pageSize: size, page: 1}));
                                                setAnalysisPageInput('1');
                                            }}
                                        >
                                            <SelectTrigger className="w-24">
                                                <SelectValue/>
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
                                                <SortableHead label="税地名称" field="tax_name"/>
                                                <SortableHead label="实际支付" field="actual_amount"/>
                                                <SortableHead label="发放金额" field="pay_amount"/>
                                                <SortableHead label="企业服务费" field="server_amount"/>
                                                <SortableHead label="渠道服务费" field="commission"/>
                                                <SortableHead label="API佣金" field="api_commission"/>
                                                <SortableHead label="差额" field="difference"/>
                                                <SortableHead label="渠道利润" field="channel_profit"/>
                                                <TableHead className="whitespace-nowrap">批次号</TableHead>
                                                <TableHead className="whitespace-nowrap">结算单号</TableHead>
                                                <SortableHead label="所属月份" field="month_str"/>
                                                <SortableHead label="历史累计" field="history_amount"/>
                                                <TableHead className="whitespace-nowrap">操作</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isLoading ? (
                                                Array.from({length: 5}).map((_, i) => <SkeletonRow key={i}/>)
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
                                                            className={`text-right font-mono tabular-nums ${
                                                                detail.difference !== 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'
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
                                                                        详情
                                                                    </Button>
                                                                </DialogTrigger>
                                                                {selectedDetail && (
                                                                    <DialogContent className="max-w-2xl">
                                                                        <DialogHeader>
                                                                            <DialogTitle>
                                                                                {selectedDetail.tax_name} - 详细信息
                                                                            </DialogTitle>
                                                                        </DialogHeader>
                                                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                                                            <div>
                                                                                <strong>税地名称:</strong> {selectedDetail.tax_name}
                                                                            </div>
                                                                            <div>
                                                                                <strong>税地ID:</strong> {selectedDetail.tax_id}
                                                                            </div>
                                                                            <div>
                                                                                <strong>企业名称:</strong> {selectedDetail.enterprise_name}
                                                                            </div>
                                                                            <div>
                                                                                <strong>企业ID:</strong> {selectedDetail.enterprise_id}
                                                                            </div>
                                                                            <div>
                                                                                <strong>实际支付:</strong> {formatCurrency(selectedDetail.actual_amount)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>发放金额:</strong> {formatCurrency(selectedDetail.pay_amount)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>企业服务费:</strong> {formatCurrency(selectedDetail.server_amount)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>渠道服务费:</strong> {formatCurrency(selectedDetail.commission)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>API佣金:</strong> {formatCurrency(selectedDetail.api_commission)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>差额:</strong> {formatCurrency(selectedDetail.difference)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>允许误差:</strong> {formatCurrency(selectedDetail.tolerance)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>原始渠道服务费:</strong> {selectedDetail.raw_commission}
                                                                            </div>
                                                                            <div>
                                                                                <strong>渠道利润:</strong> {formatCurrency(selectedDetail.channel_profit)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>原始渠道利润:</strong> {selectedDetail.raw_channel_profit}
                                                                            </div>
                                                                            <div>
                                                                                <strong>批次号:</strong> {selectedDetail.batch_no}
                                                                            </div>
                                                                            <div>
                                                                                <strong>结算单号:</strong> {selectedDetail.balance_no}
                                                                            </div>
                                                                            <div>
                                                                                <strong>费率配置:</strong> {selectedDetail.rate_config}
                                                                            </div>
                                                                            <div>
                                                                                <strong>详细费率:</strong> {selectedDetail.rate_detail}
                                                                            </div>
                                                                            <div>
                                                                                <strong>历史累计金额:</strong> {formatCurrency(selectedDetail.history_amount)}
                                                                            </div>
                                                                            <div>
                                                                                <strong>支付时间:</strong> {selectedDetail.payment_over_time}
                                                                            </div>
                                                                            <div>
                                                                                <strong>所属月份:</strong> {selectedDetail.month_str}
                                                                            </div>
                                                                            <div>
                                                                                <strong>验证状态:</strong> {selectedDetail.is_matched ? '匹配' : '不匹配'}
                                                                            </div>
                                                                        </div>
                                                                        <Button
                                                                            onClick={() => handleCopyToClipboard(selectedDetail)}
                                                                            className="mt-4 w-full"
                                                                        >
                                                                            <Copy className="w-4 h-4 mr-2"/>
                                                                            复制
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
                                                            ? '没有符合筛选条件的数据'
                                                            : '执行后将显示税地数据'}
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
                                            第 {analysisPageSafe}/{analysisTotalPages} 页 ·
                                            共 {sortedAnalysisDetails.length} 条
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleAnalysisPageChange(analysisPageSafe - 1)}
                                                disabled={analysisPageSafe === 1}
                                            >
                                                上一页
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
                                                下一页
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
                                    <CardTitle>企业汇总数据</CardTitle>
                                    {uniqueEnterprises.length > 1 && (
                                        <div className="flex gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEnterpriseChange('prev')}
                                                disabled={currentEnterpriseIndex <= 0}
                                            >
                                                <ChevronLeft/>
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEnterpriseChange('next')}
                                                disabled={currentEnterpriseIndex >= uniqueEnterprises.length - 1}
                                            >
                                                <ChevronRight/>
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                {currentEnterprise && (
                                    <p className="text-sm text-muted-foreground">
                                        企业 {currentEnterpriseIndex + 1}/{uniqueEnterprises.length}：{currentEnterprise.enterprise_name}（{currentEnterprise.enterprise_id}）
                                    </p>
                                )}
                            </CardHeader>
                            <CardContent>
                                {isLoading ? (
                                    <Skeleton className="h-40 w-full"/>
                                ) : !currentEnterprise ? (
                                    <div className="text-center py-8">无企业数据</div>
                                ) : (
                                    <>
                                        <div
                                            className="mb-6 p-4 bg-gray-50 rounded-lg grid grid-cols-2 md:grid-cols-3 gap-4">
                                            {Object.entries({
                                                企业名称: currentEnterprise.enterprise_name,
                                                企业ID: `${currentEnterprise.enterprise_id} `,
                                                累计发放: formatCurrency(currentEnterprise.total_pay_amount),
                                                累计佣金: formatCurrency(currentEnterprise.total_profit),
                                                累计笔数: `${currentEnterprise.total_count} 笔`,
                                                累计充值金额: formatCurrency(currentEnterprise.total_recharge_amount),
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
                                                        <TableHead>月份</TableHead>
                                                        <TableHead className="text-right">月发放额</TableHead>
                                                        <TableHead className="text-right">月佣金</TableHead>
                                                        <TableHead className="text-right">月笔数</TableHead>
                                                        <TableHead className="text-right">月充值</TableHead>
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
                                                                className="text-right tabular-nums">{d.month_count} 笔</TableCell>
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
