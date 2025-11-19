import React, {useState, useEffect, useMemo, useCallback} from 'react';
import axios from 'axios';
import {Toaster, toast} from 'sonner';
import {
    Search,
    Download,
    RefreshCw,
    Loader2,
    FileText,
    Calendar,
    Info,
    X,
} from 'lucide-react';

// UI组件
import {Button} from './ui/button';
import {Card, CardContent, CardHeader, CardTitle, CardDescription} from './ui/card';
import {Input} from './ui/input';
import {Label} from './ui/label';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from './ui/select';
import {Badge} from './ui/badge';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from './ui/table';
import {Tabs, TabsContent, TabsList, TabsTrigger} from './ui/tabs';
import {Checkbox} from './ui/checkbox';
import {Separator} from './ui/separator';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from './ui/tooltip';
import {Skeleton} from './ui/skeleton';
import {getApiBaseUrl} from '../lib/api';

// 定义接口响应类型
interface ApiResponse<T = unknown> {
    success: boolean;
    message: string;
    data: T;
    request_id: string;
    total?: number;
}

// 错误响应类型
interface ErrorResponse {
    detail: string;
}

// 企业信息类型
interface Enterprise {
    id: number;
    enterprise_name: string;
    channel_id: number;
    status: number;
    create_time: string;
}

// 金额类型字面量（更严谨）
type AmountType = 1 | 2 | 3;

// 税务数据类型
interface TaxData {
    纳税人姓名: string;
    身份证号: string;
    营业额_元: number | string;
    tax_amount: number | string;
    enterprise_name: string;
    enterprise_id: number;
    service_pay_status: number;
    tax_pay_status: number;
    增值税_元: number | string;
    教育费附加_元: number | string;
    地方教育附加_元: number | string;
    城市维护建设费_元: number | string;
    个人经营所得税税率: number | string;
    应纳个人经营所得税_元: number | string;
    备注: string;
    "税地ID": number;
    "税地名称": string;
    序号?: number;
}

// 报表生成请求参数
interface GenerateReportParams {
    year_month: string;
    enterprise_ids?: number[]; // 未选择时不传
    amount_type: AmountType;
    platform_company?: string;
    credit_code?: string;
    environment: string;
    timeout?: number;
    overwrite?: boolean;
}

// 金额明细类型
interface AmountDetails {
    grandTotal: number;
    breakdown: {
        key: string;
        amount: number;
    }[];
}

interface TaxReportManagementProps {
    onBack: () => void;
}

// 骨架屏行组件
const SkeletonRow = () => (
    <TableRow>
        <TableCell className="w-[80px]"><Skeleton className="h-5"/></TableCell>
        <TableCell><Skeleton className="h-5"/></TableCell>
        <TableCell><Skeleton className="h-5"/></TableCell>
        <TableCell><Skeleton className="h-5"/></TableCell>
        <TableCell><Skeleton className="h-5"/></TableCell>
        <TableCell><Skeleton className="h-5"/></TableCell>
        <TableCell><Skeleton className="h-5"/></TableCell>
        <TableCell><Skeleton className="h-5"/></TableCell>
        <TableCell><Skeleton className="h-5"/></TableCell>
        <TableCell><Skeleton className="h-5"/></TableCell>
        <TableCell><Skeleton className="h-5"/></TableCell>
    </TableRow>
);

// 工具：格式化金额
const formatCurrency = (amount: number | string) => {
    const n = typeof amount === 'number' ? amount : Number(amount || 0);
    return new Intl.NumberFormat('zh-CN', {
        style: 'currency', currency: 'CNY', minimumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);
};

// 工具：身份证脱敏（兼容非 18 位）
const maskId = (id: string) => {
    if (!id) return '';
    const s = String(id);
    if (s.length >= 14) return s.replace(/(\w{6})\w+(\w{4})/, '$1********$2');
    if (s.length >= 8) return s.replace(/(\w{3})\w+(\w{3})/, '$1****$2');
    if (s.length >= 4) return s.replace(/(\w{2})\w+(\w{1})/, '$1**$2');
    return '*'.repeat(Math.max(1, s.length));
};

// 工具：解析 Content-Disposition 获取文件名（兼容 filename* 与 filename）
const getFilenameFromDisposition = (cd?: string, fallback = 'report.xlsx') => {
    if (!cd) return fallback;
    try {
        // filename*=
        const fnStarMatch = cd.match(/filename\*\s*=\s*([^']+)''([^;]+)/i);
        if (fnStarMatch && fnStarMatch[2]) {
            const enc = fnStarMatch[1];
            const raw = fnStarMatch[2];
            try {
                // RFC5987 编码（通常是 UTF-8'')
                return decodeURIComponent(raw);
            } catch {
                return raw;
            }
        }
        // filename=
        const fnMatch = cd.match(/filename\s*=\s*("?)([^";]+)\1/i);
        if (fnMatch && fnMatch[2]) {
            try {
                return decodeURIComponent(fnMatch[2]);
            } catch {
                return fnMatch[2];
            }
        }
    } catch {
        // ignore
    }
    return fallback;
};

export default function TaxReportManagement({onBack}: TaxReportManagementProps) {
    // 环境和基础状态
    const [environment, setEnvironment] = useState('prod');
    const [activeTab, setActiveTab] = useState('query');

    // 加载状态
    const [isFetchingEnterprises, setIsFetchingEnterprises] = useState(false);
    const [isFetchingTaxData, setIsFetchingTaxData] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // 查询标记
    const [searchAttempted, setSearchAttempted] = useState(false);

    // 企业列表相关状态
    const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
    const [selectedEnterpriseIds, setSelectedEnterpriseIds] = useState<number[]>([]);

    // 税务数据相关状态
    const [taxData, setTaxData] = useState<TaxData[]>([]);
    const [yearMonth, setYearMonth] = useState('');
    const [amountType, setAmountType] = useState<AmountType>(1);
    const [amountDetails, setAmountDetails] = useState<AmountDetails>({grandTotal: 0, breakdown: []});
    const [platformCompany, setPlatformCompany] = useState('');
    const [creditCode, setCreditCode] = useState('');

    // 服务费状态筛选
    const [servicePayStatusFilter, setServicePayStatusFilter] = useState<number | null>(null);

    // 下载确认弹窗
    const [showDownloadConfirmDialog, setShowDownloadConfirmDialog] = useState(false);

    // 分页状态
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [pageInput, setPageInput] = useState('1');

    // 获取企业列表
    const fetchEnterprises = useCallback(async (signal?: AbortSignal) => {
        const base = getApiBaseUrl();
        if (!base) return;

        setIsFetchingEnterprises(true);
        try {
            const response = await axios.get<ApiResponse<Enterprise[]>>(
                `${base}/enterprises/list`,
                {params: {environment}, signal}
            );
            if (response.data.success) {
                setEnterprises(response.data.data as Enterprise[]);
                toast.success(response.data.message || '企业列表已更新');
            } else {
                toast.error(response.data.message || '获取企业列表失败');
            }
        } catch (err) {
            if (axios.isCancel(err)) return;
            console.error('获取企业列表错误:', err);
            toast.error(err instanceof Error ? err.message : '获取企业列表时发生错误，请重试');
        } finally {
            setIsFetchingEnterprises(false);
        }
    }, [environment]);

    // 获取税务数据
    const fetchTaxData = useCallback(async () => {
        const base = getApiBaseUrl();
        if (!base) return;

        if (!yearMonth) {
            toast.error('请选择年月');
            return;
        }

        setIsFetchingTaxData(true);
        setSearchAttempted(true);
        try {
            const response = await axios.post<ApiResponse<TaxData[]>>(
                `${base}/tax/data`,
                {
                    year_month: yearMonth,
                    enterprise_ids: selectedEnterpriseIds.length > 0 ? selectedEnterpriseIds : undefined,
                    amount_type: amountType,
                    environment
                }
            );

            if (response.data.success) {
                const data = (response.data.data || []) as TaxData[];
                setTaxData(Array.isArray(data) ? data : []);
                setCurrentPage(1);
                setPageInput('1');
                setServicePayStatusFilter(null);
                toast.success(response.data.message || '获取税务数据成功');
            } else {
                toast.error(response.data.message || '获取税务数据失败');
                setTaxData([]);
            }
        } catch (err) {
            console.error('获取税务数据错误:', err);
            toast.error(err instanceof Error ? err.message : '获取税务数据时发生错误，请重试');
            setTaxData([]);
        } finally {
            setIsFetchingTaxData(false);
        }
    }, [amountType, environment, selectedEnterpriseIds, yearMonth]);

    // 点击“下载税务报表”前的校验
    const handleGenerateReportClick = () => {
        if (!yearMonth) {
            toast.error('请选择年月');
            return;
        }
        if (filteredTaxData.length === 0) {
            toast.error('没有查询到数据，无法生成报表');
            return;
        }
        setShowDownloadConfirmDialog(true);
    };

    // 确认并生成报表下载
    const handleConfirmDownload = useCallback(async () => {
        const base = getApiBaseUrl();
        if (!base) return;

        setShowDownloadConfirmDialog(false);
        toast.info('报表生成中，请耐心等待...');
        setIsGenerating(true);
        try {
            const params: GenerateReportParams = {
                year_month: yearMonth,
                enterprise_ids: selectedEnterpriseIds.length > 0 ? selectedEnterpriseIds : undefined,
                amount_type: amountType,
                environment,
                timeout: 120,
                overwrite: true,
                ...(platformCompany && {platform_company: platformCompany}),
                ...(creditCode && {credit_code: creditCode}),
            };

            const response = await axios.post(
                `${base}/tax/report/generate`,
                params,
                {responseType: 'blob', timeout: (params.timeout ?? 300) * 1000}
            );

            const cd = response.headers['content-disposition'] as string | undefined;
            const fileName = getFilenameFromDisposition(cd, `完税报表_${yearMonth.replace(/-/g, '_')}.xlsx`);

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast.success(`报表生成成功，已开始下载: ${fileName}`);
        } catch (err) {
            console.error('生成报表错误:', err);
            let errorMsg = '生成报表时发生错误，请重试';
            if (axios.isAxiosError(err) && err.response) {
                const respData = err.response.data;
                if (respData instanceof Blob) {
                    const text = await new Response(respData).text();
                    try {
                        const jsonData = JSON.parse(text);
                        errorMsg = jsonData.message || jsonData.detail || text || errorMsg;
                    } catch {
                        errorMsg = text || errorMsg;
                    }
                } else {
                    const errorResponse = respData as ErrorResponse;
                    errorMsg = errorResponse?.detail || `请求错误: ${err.message}`;
                }
            } else if (err instanceof Error) {
                errorMsg = err.message;
            }
            toast.error(errorMsg);
        } finally {
            setIsGenerating(false);
        }
    }, [amountType, environment, selectedEnterpriseIds, yearMonth, platformCompany, creditCode]);

    // 处理企业选择
    const handleEnterpriseSelect = (enterpriseId: number) => {
        setSelectedEnterpriseIds(prev =>
            prev.includes(enterpriseId) ? prev.filter(id => id !== enterpriseId) : [...prev, enterpriseId]
        );
    };

    // 全选/取消全选企业
    const toggleSelectAllEnterprises = () => {
        setSelectedEnterpriseIds(
            selectedEnterpriseIds.length === enterprises.length ? [] : enterprises.map(ent => ent.id)
        );
    };

    // 服务费状态筛选
    const handleStatusFilterChange = (value: string) => {
        setServicePayStatusFilter(value === 'all' ? null : Number(value));
        setCurrentPage(1);
    };

    // 初始化 + 环境变化时
    useEffect(() => {
        const controller = new AbortController();

        fetchEnterprises(controller.signal);

        const now = new Date();
        now.setMonth(now.getMonth() - 1);
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        setYearMonth(`${year}-${month}`);

        // 重置
        setSelectedEnterpriseIds([]);
        setTaxData([]);
        setAmountDetails({grandTotal: 0, breakdown: []});
        setSearchAttempted(false);
        setServicePayStatusFilter(null);
        setCurrentPage(1);
        setPageInput('1');

        return () => controller.abort();
    }, [environment, fetchEnterprises]);

    // 筛选数据
    const filteredTaxData = useMemo(() => {
        if (!taxData.length) return [];
        return taxData.filter(item => {
            if (servicePayStatusFilter !== null && item.service_pay_status !== servicePayStatusFilter) {
                return false;
            }
            return true;
        });
    }, [taxData, servicePayStatusFilter]);

    // 金额统计（基于筛选后数据）
    useEffect(() => {
        if (!filteredTaxData.length) {
            setAmountDetails({grandTotal: 0, breakdown: []});
            return;
        }
        const grandTotal = filteredTaxData.reduce((sum, item) => sum + Number(item['营业额_元'] || 0), 0);
        const breakdownMap: Record<string, number> = {};
        filteredTaxData.forEach(item => {
            const key = `${item.enterprise_name} (${item['税地名称']})`;
            breakdownMap[key] = (breakdownMap[key] || 0) + Number(item['营业额_元'] || 0);
        });
        const breakdown = Object.entries(breakdownMap)
            .map(([key, amount]) => ({key, amount}))
            .sort((a, b) => b.amount - a.amount);
        setAmountDetails({grandTotal, breakdown});
    }, [filteredTaxData]);

    // 计算分页
    const totalPagesRaw = useMemo(
        () => Math.ceil(filteredTaxData.length / rowsPerPage),
        [filteredTaxData.length, rowsPerPage]
    );
    const totalPages = totalPagesRaw > 0 ? totalPagesRaw : 1;

    // 当前页数据
    const currentTaxData: TaxData[] = useMemo(() => {
        if (!filteredTaxData.length) return [];
        const start = (currentPage - 1) * rowsPerPage;
        const end = currentPage * rowsPerPage;
        return filteredTaxData.slice(start, end);
    }, [filteredTaxData, currentPage, rowsPerPage]);

    // 当筛选或每页数变化导致页码越界时，自动纠正
    useEffect(() => {
        if (filteredTaxData.length === 0) {
            if (currentPage !== 1) setCurrentPage(1);
            if (pageInput !== '1') setPageInput('1');
            return;
        }
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [filteredTaxData.length, totalPages, currentPage, pageInput]);

    // 同步页码输入框和当前页码
    useEffect(() => {
        setPageInput(String(currentPage));
    }, [currentPage]);

    // 分页控制
    const handleNextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
    const handlePrevPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));
    const handleRowsPerPageChange = (value: string) => {
        const n = Number(value);
        setRowsPerPage(Number.isFinite(n) && n > 0 ? n : 10);
        setCurrentPage(1);
    };
    const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setPageInput(e.target.value);
    const handlePageInputSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const pageNumber = parseInt(pageInput, 10);
            if (!isNaN(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages) {
                setCurrentPage(pageNumber);
            } else {
                setPageInput(String(currentPage));
            }
        }
    };

    // 已选企业名称展示
    const selectedEnterpriseNames = useMemo(() => {
        if (selectedEnterpriseIds.length === 0) {
            return '所有企业';
        }
        return selectedEnterpriseIds.map(id => {
            const enterprise = enterprises.find(e => e.id === id);
            return enterprise ? enterprise.enterprise_name : `企业ID: ${id}`;
        }).join('、');
    }, [selectedEnterpriseIds, enterprises]);

    return (
        <div className="min-h-screen colorful-background p-6">
            <Toaster richColors position="top-center"/>

            {/* 下载确认弹窗 */}
            {showDownloadConfirmDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50/80 backdrop-blur-sm">
                    <Card className="w-full max-w-lg p-6">
                        <div className="flex justify-between items-center mb-4">
                            <CardTitle>确认下载</CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => setShowDownloadConfirmDialog(false)}>
                                <X size={20}/>
                            </Button>
                        </div>
                        <p className="text-gray-700 mb-6">
                            确定要为 <strong>{selectedEnterpriseNames}</strong> 生成 <strong>{yearMonth}</strong> 完税报表吗？此操作可能需要一段时间。
                        </p>
                        <div className="flex justify-end space-x-4">
                            <Button variant="outline" onClick={() => setShowDownloadConfirmDialog(false)}>
                                取消
                            </Button>
                            <Button onClick={handleConfirmDownload} disabled={isGenerating}>
                                {isGenerating ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>正在生成...</>
                                ) : (
                                    <><Download className="mr-2 h-4 w-4"/>确认下载</>
                                )}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            <div className="max-w-6xl mx-auto px-4 py-6 colorful-background">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold">税务报表管理</h1>
                    <Button variant="outline" onClick={onBack}>返回</Button>
                </div>

                <div className="flex justify-end mb-4">
                    <div className="flex items-center space-x-2">
                        <Label htmlFor="environment" className="whitespace-nowrap">环境:</Label>
                        <Select value={environment} onValueChange={setEnvironment}>
                            <SelectTrigger id="environment" className="w-[180px]"><SelectValue placeholder="选择环境"/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="prod">生产环境 (prod)</SelectItem>
                                <SelectItem value="test">Beta (test)</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => fetchEnterprises(new AbortController().signal)}
                            disabled={isFetchingEnterprises}
                            aria-label="刷新企业列表"
                        >
                            <RefreshCw size={16}/>
                        </Button>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="mb-6 w-full max-w-md mx-auto grid grid-cols-2">
                        <TabsTrigger value="query" className="flex-1">获取税务数据</TabsTrigger>
                        <TabsTrigger value="generate" className="flex-1">生成报表（请先获取税务数据）</TabsTrigger>
                    </TabsList>

                    <TabsContent value="query" className="space-y-6">
                        <Card className="shadow-sm">
                            <CardHeader className="pb-3">
                                <CardTitle>查询条件</CardTitle>
                                <CardDescription>设置查询参数，获取企业税务数据</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="yearMonth">年月（默认上月）</Label>
                                        <div className="relative">
                                            <Calendar size={16}
                                                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500"/>
                                            <Input
                                                id="yearMonth"
                                                type="month"
                                                value={yearMonth}
                                                onChange={(e) => setYearMonth(e.target.value)}
                                                className="pl-10"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="amountType">金额类型</Label>
                                        <Select value={amountType.toString()}
                                                onValueChange={(val) => setAmountType(Number(val) as AmountType)}>
                                            <SelectTrigger id="amountType"><SelectValue
                                                placeholder="选择金额类型"/></SelectTrigger>
                                            <SelectContent>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild><SelectItem value="1">含服务费
                                                            (pay_amount)</SelectItem></TooltipTrigger>
                                                        <TooltipContent className="max-w-xs z-50">指企业的总支出金额，包含服务费<br/>例：110元（100元本金+10元服务费）</TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild><SelectItem value="2">不含服务费
                                                            (worker_pay_amount)</SelectItem></TooltipTrigger>
                                                        <TooltipContent className="max-w-xs z-50">指合作者实际到手金额，扣除了服务费<br/>例：90元（100元本金-10元服务费）</TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild><SelectItem value="3">账单金额
                                                            (bill_amount)</SelectItem></TooltipTrigger>
                                                        <TooltipContent className="max-w-xs z-50">指原始导入和报名时的金额，未计算服务费<br/>例：100元（原始金额）</TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex items-end">
                                        <Button onClick={fetchTaxData} disabled={isFetchingTaxData} className="w-full">
                                            {isFetchingTaxData ? (
                                                <><Loader2 size={16} className="mr-2 animate-spin"/>查询中...</>
                                            ) : (
                                                <><Search size={16} className="mr-2"/>获取税务数据</>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label>选择企业 (可多选，不选默认获取所有企业数据！！！)</Label>
                                        <Button variant="ghost" size="sm" onClick={toggleSelectAllEnterprises}
                                                disabled={!enterprises.length}>
                                            {selectedEnterpriseIds.length === enterprises.length ? '取消全选' : '全选'}
                                        </Button>
                                    </div>
                                    <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                                        {isFetchingEnterprises ? (
                                            <div className="flex justify-center py-6">
                                                <Loader2 size={20} className="animate-spin text-gray-500"/>
                                            </div>
                                        ) : enterprises.length === 0 ? (
                                            <div className="text-gray-500 text-center py-6">未获取到企业数据</div>
                                        ) : (
                                            enterprises.map(enterprise => (
                                                <div key={enterprise.id} className="flex items-center">
                                                    <Checkbox
                                                        id={`ent-${enterprise.id}`}
                                                        checked={selectedEnterpriseIds.includes(enterprise.id)}
                                                        onCheckedChange={() => handleEnterpriseSelect(enterprise.id)}
                                                    />
                                                    <Label htmlFor={`ent-${enterprise.id}`}
                                                           className="ml-2 flex-1 cursor-pointer">
                                                        {enterprise.enterprise_name}
                                                    </Label>
                                                    <Badge
                                                        variant={[0, 2, 3, 4, 5, 7].includes(enterprise.status) ? "default" : "destructive"}>
                                                        状态: {enterprise.status}
                                                    </Badge>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* 仅在开始查询后显示结果区域 */}
                        {searchAttempted && (
                            <Card className="shadow-sm">
                                <CardHeader className="pb-3">
                                    <div className="flex justify-between items-center">
                                        {/* 左侧：标题 + 筛选 */}
                                        <div className="flex items-center space-x-4">
                                            <div>
                                                <CardTitle>税务数据列表</CardTitle>
                                                <CardDescription>{yearMonth} 查询结果</CardDescription>
                                            </div>

                                            {/* 服务费状态筛选 */}
                                            <div className="w-[200px]">
                                                <Select
                                                    value={servicePayStatusFilter === null ? 'all' : String(servicePayStatusFilter)}
                                                    onValueChange={handleStatusFilterChange}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="服务费状态"/>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="all">全部</SelectItem>
                                                        <SelectItem value="0">成功</SelectItem>
                                                        <SelectItem value="1">失败</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* 右侧：总金额 */}
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <div
                                                        className="text-lg font-semibold text-primary cursor-pointer flex items-center">
                                                        总金额: {formatCurrency(amountDetails.grandTotal)}
                                                        {amountDetails.breakdown.length > 1 && (
                                                            <Info size={16} className="ml-2 text-blue-500"/>
                                                        )}
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-md text-white">
                                                    <p className="font-bold mb-2 border-b pb-1">金额明细</p>
                                                    <div className="space-y-1 max-h-60 overflow-y-auto">
                                                        {amountDetails.breakdown.map((item) => (
                                                            <div key={item.key}
                                                                 className="flex justify-between items-center text-sm">
                                                                <span className="mr-4 text-gray-200">{item.key}:</span>
                                                                <span
                                                                    className="font-mono">{formatCurrency(item.amount)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="overflow-x-auto rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[80px]">序号</TableHead>
                                                    <TableHead>纳税人姓名</TableHead>
                                                    <TableHead>证件号</TableHead>
                                                    <TableHead>企业名称</TableHead>
                                                    <TableHead>税地名称</TableHead>
                                                    <TableHead>营业额(元)</TableHead>
                                                    <TableHead>税额(元)</TableHead>
                                                    {/*<TableHead>增值税(元)</TableHead>*/}
                                                    {/*<TableHead>个人经营所得税(元)</TableHead>*/}
                                                    <TableHead>服务费扣除状态</TableHead>
                                                    <TableHead>税金扣除状态</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {isFetchingTaxData ? (
                                                    Array.from({length: rowsPerPage}).map((_, i) => <SkeletonRow
                                                        key={i}/>)
                                                ) : currentTaxData.length > 0 ? (
                                                    currentTaxData.map((item, index) => (
                                                        <TableRow
                                                            key={`${item.身份证号 || 'id'}-${item.enterprise_id}-${index}`}>
                                                            <TableCell>{(currentPage - 1) * rowsPerPage + index + 1}</TableCell>
                                                            <TableCell>{item['纳税人姓名']}</TableCell>
                                                            <TableCell>{maskId(item['身份证号'])}</TableCell>
                                                            <TableCell>{item.enterprise_name}</TableCell>
                                                            <TableCell>{item['税地名称']}</TableCell>
                                                            <TableCell>{formatCurrency(item['营业额_元'])}</TableCell>
                                                            <TableCell>{formatCurrency(item['tax_amount'])}</TableCell>
                                                            {/*<TableCell>{formatCurrency(item['增值税_元'])}</TableCell>*/}
                                                            {/*<TableCell>{formatCurrency(item['应纳个人经营所得税_元'])}</TableCell>*/}
                                                            <TableCell>
                                                                <span style={{color: item.service_pay_status === 1 ? 'red' : 'inherit'}}>
                                                                  {item.service_pay_status === 0 ? '成功' : '失败'}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell>
                                                                {Number(item.tax_amount) > 0 ? (
                                                                    <span style={{ color: item.tax_pay_status === 1 ? 'red' : 'inherit' }}>
                                                                      {item.tax_pay_status === 0 ? '成功' : '失败'}
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ color: '#999' }}>无需扣税</span>
                                                                )}
                                                            </TableCell>

                                                        </TableRow>
                                                    ))
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={9} className="h-24 text-center">
                                                            未找到数据！
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>

                                    {/* 仅在筛选后仍有数据时显示分页 */}
                                    {filteredTaxData.length > 0 && (
                                        <fieldset disabled={isFetchingTaxData}
                                                  className="flex items-center justify-between pt-4">
                                            <div className="text-sm text-muted-foreground">
                                                共 {filteredTaxData.length} 条记录（筛选后）/ 原 {taxData.length} 条
                                            </div>
                                            <div className="flex items-center space-x-4">
                                                <div className="flex items-center space-x-2">
                                                    <p className="text-sm font-medium">每页行数</p>
                                                    <Select value={rowsPerPage.toString()}
                                                            onValueChange={handleRowsPerPageChange}>
                                                        <SelectTrigger className="h-8 w-[70px]"><SelectValue
                                                            placeholder={rowsPerPage}/></SelectTrigger>
                                                        <SelectContent side="top">
                                                            {[10, 20, 50, 100, 500, 1000].map((pageSize) => (
                                                                <SelectItem key={pageSize}
                                                                            value={`${pageSize}`}>{pageSize}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <Button variant="outline" size="sm" onClick={handlePrevPage}
                                                            disabled={currentPage === 1}>
                                                        上一页
                                                    </Button>
                                                    <div className="flex items-center text-sm font-medium">
                                                        第
                                                        <Input
                                                            type="text"
                                                            className="h-8 w-12 mx-1 text-center"
                                                            value={pageInput}
                                                            onChange={handlePageInputChange}
                                                            onKeyDown={handlePageInputSubmit}
                                                        />
                                                        页 / {totalPages}
                                                    </div>
                                                    <Button variant="outline" size="sm" onClick={handleNextPage}
                                                            disabled={currentPage === totalPages}>
                                                        下一页
                                                    </Button>
                                                </div>
                                            </div>
                                        </fieldset>
                                    )}
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    <TabsContent value="generate" className="space-y-6">
                        <Card className="shadow-sm">
                            <CardHeader className="pb-3">
                                <CardTitle>生成税务报表</CardTitle>
                                <CardDescription>设置报表参数，生成Excel格式的税务报表并下载</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6 pt-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="reportYearMonth">年月 <span
                                            className="text-red-500">*</span></Label>
                                        <div className="relative">
                                            <Calendar size={16}
                                                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500"/>
                                            <Input
                                                id="reportYearMonth"
                                                type="month"
                                                value={yearMonth}
                                                onChange={(e) => setYearMonth(e.target.value)}
                                                className="pl-10"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="reportAmountType">金额类型</Label>
                                        <Select value={amountType.toString()}
                                                onValueChange={(val) => setAmountType(Number(val) as AmountType)}>
                                            <SelectTrigger id="reportAmountType"><SelectValue
                                                placeholder="选择金额类型"/></SelectTrigger>
                                            <SelectContent>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild><SelectItem value="1">含服务费
                                                            (pay_amount)</SelectItem></TooltipTrigger>
                                                        <TooltipContent className="max-w-xs z-50">指企业的总支出金额，包含服务费<br/>例：110元（100元本金+10元服务费）</TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild><SelectItem value="2">不含服务费
                                                            (worker_pay_amount)</SelectItem></TooltipTrigger>
                                                        <TooltipContent className="max-w-xs z-50">指合作者实际到手金额，扣除了服务费<br/>例：90元（100元本金-10元服务费）</TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild><SelectItem value="3">账单金额
                                                            (bill_amount)</SelectItem></TooltipTrigger>
                                                        <TooltipContent className="max-w-xs z-50">指原始导入和报名时的金额，未计算服务费<br/>例：100元（原始金额）</TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="platformCompany">平台企业名称 (可选)</Label>
                                        <Input
                                            id="platformCompany"
                                            value={platformCompany}
                                            onChange={(e) => setPlatformCompany(e.target.value)}
                                            placeholder="云策企服（驻马店）人力资源服务有限公司（可修改）"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="creditCode">社会统一信用代码 (可选)</Label>
                                        <Input
                                            id="creditCode"
                                            value={creditCode}
                                            onChange={(e) => setCreditCode(e.target.value)}
                                            placeholder="91411700MAEFDQ7P7T（可修改）"
                                        />
                                    </div>
                                </div>

                                <Separator/>
                                <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded">
                                    <p className="font-bold">即将生成报表预览：</p>
                                    <p className="mt-1 text-sm">
                                        年月: <span className="font-semibold">{yearMonth || "未选择"}</span>
                                    </p>
                                    <p className="text-sm">
                                        企业: <span className="font-semibold">{selectedEnterpriseNames}</span>
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label>已选择的企业</Label>
                                    <div className="border rounded-md p-3 min-h-[100px]">
                                        {selectedEnterpriseIds.length === 0 ? (
                                            <div
                                                className="text-gray-500 italic">未选择任何企业，将为所有企业生成报表</div>
                                        ) : (
                                            <div className="flex flex-wrap gap-2">
                                                {selectedEnterpriseIds.map(entId => {
                                                    const enterprise = enterprises.find(e => e.id === entId);
                                                    return (
                                                        <Badge key={entId} variant="secondary"
                                                               className="flex items-center gap-1">
                                                            {enterprise?.enterprise_name || `企业ID: ${entId}`}
                                                            <button
                                                                onClick={() => handleEnterpriseSelect(entId)}
                                                                className="ml-1 rounded-full hover:bg-white hover:bg-opacity-20 p-0.5"
                                                                aria-label="移除企业"
                                                            >
                                                                ×
                                                            </button>
                                                        </Badge>
                                                    );
                                                })}
                                                <Button variant="ghost" size="sm"
                                                        onClick={() => setSelectedEnterpriseIds([])} className="mt-2">
                                                    清除选择
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-center pt-2">
                                    <Button
                                        onClick={handleGenerateReportClick}
                                        disabled={isGenerating || filteredTaxData.length === 0}
                                        className="mt-4"
                                    >
                                        <Download className="mr-2 h-4 w-4"/>下载税务报表
                                    </Button>
                                </div>

                                <div
                                    className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded flex items-start mt-4">
                                    <FileText size={18} className="mr-2 mt-0.5 flex-shrink-0"/>
                                    <div>
                                        <p className="font-medium">报表生成说明</p>
                                        <ul className="list-disc pl-5 mt-1 space-y-1 text-sm">
                                            <li>生成报表可能需要几秒钟到几分钟，请耐心等待</li>
                                            <li>文件将自动下载到浏览器默认下载路径</li>
                                            <li>下载完成后可在浏览器右上角查看下载记录</li>
                                            <li>如果选择多个企业，将在一个Excel文件中生成多个工作表</li>
                                        </ul>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
