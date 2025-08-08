import React, {useState, useMemo, useCallback} from 'react';
import axios from 'axios';
import {Toaster, toast} from 'sonner';
import {Card, CardContent, CardHeader, CardTitle} from './ui/card';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Label} from './ui/label';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from './ui/select';
import {Badge} from './ui/badge';
import {ScrollArea} from './ui/scroll-area';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from './ui/table';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger} from './ui/dialog';
import {ArrowLeft, Play, Copy, AlertCircle, ChevronRight, ChevronLeft, Loader2} from 'lucide-react';
import {Skeleton} from './ui/skeleton';

// 定义接口类型
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
        }
    };
    request_id: string;
    channel_id: number;
}

const SkeletonCard = () => <Skeleton className="h-24 w-full"/>;
const SkeletonRow = () => <TableRow>{Array.from({length: 13}).map((_, i) => <TableCell key={i}><Skeleton
    className="h-5"/></TableCell>)}</TableRow>;

export default function CommissionScript({onBack}: { onBack: () => void }) {
    const [environment, setEnvironment] = useState('test');
    const [channelId, setChannelId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [allCommissionDetails, setAllCommissionDetails] = useState<CommissionDetail[]>([]);
    const [summaryMetrics, setSummaryMetrics] = useState<SummaryMetrics | null>(null);
    const [enterpriseData, setEnterpriseData] = useState<EnterpriseData[]>([]);
    const [pagination, setPagination] = useState({page: 1, pageSize: 10, totalItems: 0});
    const [selectedDetail, setSelectedDetail] = useState<CommissionDetail | null>(null);
    const [apiVerification, setApiVerification] = useState(true);
    const [pageInput, setPageInput] = useState('1');
    const [currentEnterpriseIndex, setCurrentEnterpriseIndex] = useState(0);

    const formatCurrency = (amount: number) => `¥${amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;

    const handleCopyToClipboard = useCallback((detail: CommissionDetail | null) => {
        if (!detail) return;
        const text = Object.entries(detail).map(([key, value]) => `${key}: ${typeof value === 'number' ? formatCurrency(value) : value}`).join('\n');
        navigator.clipboard.writeText(text).then(() => toast.success('数据已复制到剪贴板')).catch(() => toast.error('复制失败'));
    }, []);

    const uniqueEnterprises = useMemo(() => Array.from(new Map(enterpriseData.map(item => [item.enterprise_id, item])).values()), [enterpriseData]);
    const currentEnterprise = useMemo(() => uniqueEnterprises[currentEnterpriseIndex] || null, [uniqueEnterprises, currentEnterpriseIndex]);
    const currentEnterpriseMonthlyData = useMemo(() => currentEnterprise ? enterpriseData.filter(item => item.enterprise_id === currentEnterprise.enterprise_id).sort((a, b) => b.month.localeCompare(a.month)) : [], [currentEnterprise, enterpriseData]);

    const totalPages = useMemo(() => Math.ceil(pagination.totalItems / pagination.pageSize), [pagination.totalItems, pagination.pageSize]);
    const paginatedDetails = useMemo(() => allCommissionDetails.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize), [allCommissionDetails, pagination.page, pagination.pageSize]);

    const startExecution = async () => {
        if (!environment || !channelId) return toast.error("请选择环境并输入渠道ID");

        setIsLoading(true);
        setLogs(['[INFO] 开始执行渠道佣金计算脚本...']);
        toast.info('正在计算佣金...');

        // 清空旧数据
        setAllCommissionDetails([]);
        setSummaryMetrics(null);
        setEnterpriseData([]);
        setApiVerification(true);
        setPagination({page: 1, pageSize: 10, totalItems: 0});
        setSelectedDetail(null);
        setCurrentEnterpriseIndex(0);

        try {
            const response = await axios.post<ApiResponse>(process.env.NEXT_PUBLIC_API_BASE_URL + '/commission/calculate', {
                channel_id: Number(channelId),
                environment,
                timeout: 30
            });

            if (response.data.success) {
                const {
                    commission_details,
                    summary_metrics,
                    enterprise_data,
                    total_items,
                    api_verification
                } = response.data.data;
                setLogs(prev => [...prev, `[SUCCESS] ${response.data.message}`]);
                toast.success(response.data.message);

                setAllCommissionDetails(commission_details.sort((a, b) => a.id - b.id));
                setSummaryMetrics(summary_metrics);
                setEnterpriseData(enterprise_data);
                setApiVerification(api_verification);
                setPagination(prev => ({...prev, page: 1, totalItems: total_items || commission_details.length}));
                setPageInput('1');
                setCurrentEnterpriseIndex(0);
            } else {
                throw new Error(response.data.message || '接口返回失败');
            }
        } catch (error) {
            const errorMsg = axios.isAxiosError(error)
                ? error.response?.data?.detail || error.message
                : error instanceof Error ? error.message : '未知错误';
            setLogs(prev => [...prev, `[ERROR] ${errorMsg}`]);
            toast.error(`${errorMsg}`);

            // 失败也清空数据
            setAllCommissionDetails([]);
            setSummaryMetrics(null);
            setEnterpriseData([]);
            setPagination({page: 1, pageSize: 10, totalItems: 0});
            setSelectedDetail(null);
            setCurrentEnterpriseIndex(0);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > totalPages) return;
        setPagination(prev => ({...prev, page: newPage}));
        setPageInput(String(newPage));
    };

    const handlePageInputSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handlePageChange(Number(pageInput));
    };

    const handleEnterpriseChange = (direction: 'next' | 'prev') => {
        setCurrentEnterpriseIndex(prev => direction === 'next' ? (prev + 1) % uniqueEnterprises.length : (prev - 1 + uniqueEnterprises.length) % uniqueEnterprises.length);
    };

    return (
        <div className="min-h-screen colorful-background">
            <Toaster richColors position="top-center"/>
            <div className="max-w-7xl mx-auto">
                <div className="mb-6">
                    <Button variant="ghost" onClick={onBack} className="mb-4"><ArrowLeft className="w-4 h-4 mr-2"/>返回脚本列表</Button>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl">渠道佣金计算与验证</h1>
                        <Badge variant={isLoading ? "destructive" : "secondary"}>{isLoading ? "运行中" : "就绪"}</Badge>
                        {!apiVerification &&
                            <Badge variant="outline" className="text-amber-600 border-amber-600"><AlertCircle
                                className="w-3 h-3 mr-1"/>API验证不匹配</Badge>}
                    </div>
                    <p className="text-muted-foreground">计算渠道佣金并进行数据校验，支持税地级别和企业汇总分析</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <div className="lg:col-span-1 space-y-6">
                        <Card>
                            <CardHeader><CardTitle>参数配置</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div><Label>环境</Label><Select value={environment}
                                                                onValueChange={setEnvironment}><SelectTrigger><SelectValue
                                    placeholder="选择环境"/></SelectTrigger><SelectContent><SelectItem
                                    value="test">Beta</SelectItem><SelectItem
                                    value="prod">生产环境</SelectItem></SelectContent></Select></div>
                                <div><Label>渠道ID</Label><Input value={channelId}
                                                                 onChange={(e) => setChannelId(e.target.value)}
                                                                 placeholder="输入渠道ID"/></div>
                                <Button onClick={startExecution} disabled={!environment || !channelId || isLoading}
                                        className="w-full">{isLoading ? <><Loader2
                                    className="w-4 h-4 mr-2 animate-spin"/>加载中...</> : <><Play
                                    className="w-4 h-4 mr-2"/>开始执行</>}</Button>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle>实时日志</CardTitle></CardHeader>
                            <CardContent><ScrollArea className="h-48">
                                <div className="space-y-2">{logs.length === 0 ?
                                    <p>等待执行...</p> : logs.map((log, i) => <div key={i}
                                                                                   className="text-xs font-mono">{log}</div>)}</div>
                            </ScrollArea></CardContent>
                        </Card>
                    </div>

                    <div className="lg:col-span-3 space-y-6">
                        {summaryMetrics && (
                            <Card>
                                <CardHeader><CardTitle>渠道汇总统计</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {Object.entries({
                                            "渠道总利润": {value: summaryMetrics.total_profit, color: "blue"},
                                            "本月佣金": {value: summaryMetrics.monthly_profit, color: "green"},
                                            "今日佣金": {value: summaryMetrics.daily_profit, color: "purple"},
                                            "盈利状态": {
                                                value: summaryMetrics.is_profitable ? '盈利' : '亏损',
                                                color: "amber"
                                            },
                                            "累计发放": {value: summaryMetrics.total_pay_amount, color: "indigo"},
                                            "当日发放": {value: summaryMetrics.daily_pay_amount, color: "rose"},
                                            "累计笔数": {value: `${summaryMetrics.total_count} 笔`, color: "teal"},
                                            "匹配率": {
                                                value: `${summaryMetrics.match_rate}%`,
                                                color: summaryMetrics.mismatch_count > 0 ? "red" : "green"
                                            }
                                        }).map(([label, {value, color}]) => (
                                            <div key={label} className={`bg-${color}-50 p-4 rounded-lg`}><p
                                                className="text-sm text-muted-foreground">{label}</p><p
                                                className={`text-xl font-bold text-${color}-600`}>{typeof value === 'number' ? formatCurrency(value) : value}</p>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        <Card>
                            <CardHeader><CardTitle>税地级别分析</CardTitle></CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>税地名称</TableHead>
                                                <TableHead>实际支付</TableHead>
                                                <TableHead>发放金额</TableHead>
                                                <TableHead>企业服务费</TableHead>
                                                <TableHead>渠道服务费</TableHead>
                                                <TableHead>API佣金</TableHead>
                                                <TableHead>差额</TableHead>
                                                <TableHead>渠道利润</TableHead>
                                                <TableHead>批次号</TableHead>
                                                <TableHead>结算单号</TableHead>
                                                <TableHead>所属月份</TableHead>
                                                <TableHead>历史累计</TableHead>
                                                <TableHead>操作</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isLoading ? (
                                                Array.from({length: 5}).map((_, i) => <SkeletonRow key={i}/>)
                                            ) : paginatedDetails.length > 0 ? (
                                                paginatedDetails.map((detail) => (
                                                    <TableRow key={detail.id}
                                                              className={!detail.is_matched ? "bg-red-50" : ""}>
                                                        <TableCell>{detail.tax_name}</TableCell>
                                                        <TableCell>{formatCurrency(detail.actual_amount)}</TableCell>
                                                        <TableCell>{formatCurrency(detail.pay_amount)}</TableCell>
                                                        <TableCell>{formatCurrency(detail.server_amount)}</TableCell>
                                                        <TableCell>{formatCurrency(detail.commission)}</TableCell>
                                                        <TableCell>{formatCurrency(detail.api_commission)}</TableCell>
                                                        <TableCell
                                                            className={detail.difference !== 0 ? 'text-red-600 font-bold' : ''}>{formatCurrency(detail.difference)}</TableCell>
                                                        <TableCell>{formatCurrency(detail.channel_profit)}</TableCell>
                                                        <TableCell>{detail.batch_no}</TableCell>
                                                        <TableCell>{detail.balance_no}</TableCell>
                                                        <TableCell>{detail.month_str}</TableCell>
                                                        <TableCell>{formatCurrency(detail.history_amount)}</TableCell>
                                                        <TableCell>
                                                            <Dialog
                                                                onOpenChange={(isOpen) => !isOpen && setSelectedDetail(null)}>
                                                                <DialogTrigger asChild>
                                                                    <Button variant="ghost" size="sm"
                                                                            onClick={() => setSelectedDetail(detail)}>详情</Button>
                                                                </DialogTrigger>
                                                                {selectedDetail &&
                                                                    <DialogContent className="max-w-2xl">
                                                                        <DialogHeader><DialogTitle>{selectedDetail.tax_name} -
                                                                            详细信息</DialogTitle></DialogHeader>
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
                                                                            className="mt-4 w-full"><Copy
                                                                            className="w-4 h-4 mr-2"/>复制</Button>
                                                                    </DialogContent>
                                                                }
                                                            </Dialog>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={13}
                                                               className="h-24 text-center text-muted-foreground">
                                                        执行后将显示税地数据
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                                {!isLoading && paginatedDetails.length > 0 && (
                                    <div className="flex justify-between items-center mt-4">
                                        <p>第 {pagination.page}/{totalPages} 页, 共 {pagination.totalItems} 条</p>
                                        <div className="flex items-center gap-2">
                                            <Button variant="ghost" size="sm"
                                                    onClick={() => handlePageChange(pagination.page - 1)}
                                                    disabled={pagination.page === 1}>上一页</Button>
                                            <Input type="number" value={pageInput}
                                                   onChange={e => setPageInput(e.target.value)}
                                                   onKeyPress={handlePageInputSubmit} className="w-16 text-center"/>
                                            <span>/ {totalPages}</span>
                                            <Button variant="ghost" size="sm"
                                                    onClick={() => handlePageChange(pagination.page + 1)}
                                                    disabled={pagination.page === totalPages}>下一页</Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>企业汇总数据</CardTitle>{uniqueEnterprises.length > 1 &&
                                    <div className="flex gap-2"><Button variant="ghost" size="sm"
                                                                        onClick={() => handleEnterpriseChange('prev')}><ChevronLeft/></Button><Button
                                        variant="ghost" size="sm"
                                        onClick={() => handleEnterpriseChange('next')}><ChevronRight/></Button></div>}
                                </div>
                                {currentEnterprise &&
                                    <p>企业 {currentEnterpriseIndex + 1}/{uniqueEnterprises.length}：{currentEnterprise.enterprise_name} （{currentEnterprise.enterprise_id}）</p>}
                            </CardHeader>
                            <CardContent>{isLoading ? <Skeleton className="h-40 w-full"/> : !currentEnterprise ?
                                <div className="text-center py-8">无企业数据</div> : (
                                    <>
                                        <div
                                            className="mb-6 p-4 bg-gray-50 rounded-lg grid grid-cols-2 md:grid-cols-3 gap-4">{Object.entries({
                                            "企业名称": currentEnterprise.enterprise_name,
                                            "企业ID": `${currentEnterprise.enterprise_id} `,
                                            "累计发放": currentEnterprise.total_pay_amount,
                                            "累计佣金": currentEnterprise.total_profit,
                                            "累计笔数": `${currentEnterprise.total_count} 笔`,
                                            "累计充值金额": currentEnterprise.total_recharge_amount
                                        }).map(([label, value]) => <div key={label}><p
                                            className="text-sm text-muted-foreground">{label}</p><p
                                            className="font-medium">{typeof value === 'number' ? formatCurrency(value) : value}</p>
                                        </div>)}</div>
                                        <Table><TableHeader><TableRow><TableHead>月份</TableHead><TableHead>月发放额</TableHead><TableHead>月佣金</TableHead><TableHead>月笔数</TableHead><TableHead>月充值</TableHead></TableRow></TableHeader><TableBody>{currentEnterpriseMonthlyData.map(d =>
                                            <TableRow
                                                key={d.month}><TableCell>{d.month}</TableCell><TableCell>{formatCurrency(d.month_pay_amount)}</TableCell><TableCell>{formatCurrency(d.month_profit)}</TableCell><TableCell>{d.month_count} 笔</TableCell><TableCell>{formatCurrency(d.month_recharge_amount)} </TableCell></TableRow>)}</TableBody></Table></>
                                )}</CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
