import React, {useState} from 'react';
import axios from 'axios';
import {Toaster, toast} from 'sonner';
import {Card, CardContent, CardHeader, CardTitle} from './ui/card';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Label} from './ui/label';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from './ui/select';
import {Badge} from './ui/badge';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from './ui/table';
import {ArrowLeft, Search, RotateCcw, AlertTriangle, CheckCircle, Loader2} from 'lucide-react';
import {Skeleton} from './ui/skeleton';

// API响应数据结构
interface ApiResponse<T = unknown> {
    success: boolean;
    message: string;
    data: T;
    request_id: string;
    enterprise_id: number;
}

// 余额核对结果结构
interface BalanceResult {
    tax_location_id: number;
    tax_address: string;
    enterprise_name: string;
    is_correct: boolean;
    total_deductions: number;
    total_recharges: number;
    expected_balance: number;
    actual_balance: number;
    balance_diff: number;
}

interface BalanceScriptProps {
    onBack: () => void;
}

// 骨架屏行组件
const SkeletonRow = () => (
    <TableRow>
        {Array.from({length: 9}).map((_, i) => (
            <TableCell key={i}><Skeleton className="h-5"/></TableCell>
        ))}
    </TableRow>
);

export default function BalanceScript({onBack}: BalanceScriptProps) {
    const [environment, setEnvironment] = useState('test');
    const [tenantId, setTenantId] = useState('');
    const [isQuerying, setIsQuerying] = useState(false);
    const [results, setResults] = useState<BalanceResult[]>([]);
    const [queryCount, setQueryCount] = useState(0);
    const [errorCount, setErrorCount] = useState(0);

    // 处理查询
    const startQuery = async () => {
        if (!tenantId || isNaN(Number(tenantId))) {
            toast.error('请输入有效的企业租户ID');
            return;
        }

        setIsQuerying(true);
        setResults([]); // 清空旧结果以显示加载状态

        try {
            const response = await axios.post<ApiResponse<BalanceResult[]>>(`${process.env.NEXT_PUBLIC_API_BASE_URL}/balance/verify`, {
                tenant_id: Number(tenantId),
                environment: environment,
                timeout: 15
            });

            if (response.data.success) {
                const data = response.data.data as BalanceResult[];
                setResults(data);
                if (data.length === 0) {
                    toast.info('未查询到该企业的余额数据');
                } else {
                    toast.success(response.data.message);
                }
                setErrorCount(data.filter(r => !r.is_correct).length);
                setQueryCount(prev => prev + 1);
            } else {
                toast.error(response.data.message || '查询失败，请重试');
                setResults([]);
            }
        } catch (err) {
            console.error('API调用错误:', err);
            const errorMsg = err instanceof Error ? err.message : '与服务器通信失败，请检查网络连接';
            toast.error(errorMsg);
            setResults([]);
        } finally {
            setIsQuerying(false);
        }
    };

    // 重置结果
    const resetResults = () => {
        setResults([]);
        setQueryCount(0);
        setErrorCount(0);
        setTenantId('');
        toast.info('查询结果已重置');
    };

    // 格式化金额显示
    const formatCurrency = (amount: number) => {
        return '¥' + amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
    };

    return (
        <div className="min-h-screen colorful-background p-6">
            <Toaster richColors position="top-center"/>
            <div className="max-w-6xl mx-auto">
                <div className="mb-6">
                    <Button variant="ghost" onClick={onBack} className="mb-4">
                        <ArrowLeft className="w-4 h-4 mr-2"/>
                        返回脚本列表
                    </Button>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl">企业账户余额核对</h1>
                        <Badge variant={isQuerying ? "destructive" : "secondary"}>
                            {isQuerying ? "查询中" : "就绪"}
                        </Badge>
                    </div>
                    <p className="text-muted-foreground">核对企业账户余额的准确性，检测异常并提供详细对比信息</p>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader><CardTitle>查询参数</CardTitle></CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                <div>
                                    <Label htmlFor="environment">环境</Label>
                                    <Select value={environment} onValueChange={setEnvironment} disabled={isQuerying}>
                                        <SelectTrigger><SelectValue placeholder="选择环境"/></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="test">Beta</SelectItem>
                                            <SelectItem value="prod">生产环境</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="tenant-id">企业租户ID</Label>
                                    <Input
                                        id="tenant-id"
                                        value={tenantId}
                                        onChange={(e) => setTenantId(e.target.value)}
                                        placeholder="输入企业租户ID"
                                        disabled={isQuerying}
                                        type="number"
                                    />
                                </div>
                                <div>
                                    <Button onClick={startQuery} disabled={!environment || !tenantId || isQuerying}
                                            className="w-full">
                                        {isQuerying ? <><Loader2
                                            className="w-4 h-4 mr-2 animate-spin"/>查询中...</> : <><Search
                                            className="w-4 h-4 mr-2"/>查询</>}
                                    </Button>
                                </div>
                                <div>
                                    <Button onClick={resetResults} variant="outline" disabled={isQuerying}
                                            className="w-full">
                                        <RotateCcw className="w-4 h-4 mr-2"/>
                                        重置结果
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {(queryCount > 0 || isQuerying) && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                {[
                                    {icon: CheckCircle, color: 'text-green-600', label: '查询次数', value: queryCount},
                                    {icon: null, color: '', label: '总税地数', value: results.length},
                                    {
                                        icon: AlertTriangle,
                                        color: 'text-red-600',
                                        label: '异常税地数',
                                        value: errorCount
                                    },
                                    {
                                        icon: CheckCircle,
                                        color: 'text-green-600',
                                        label: '正常税地数',
                                        value: results.length - errorCount
                                    }
                                ].map((item, index) => (
                                    <Card key={index}>
                                        <CardContent className="pt-6">
                                            {isQuerying ? <Skeleton className="h-12 w-full"/> : (
                                                <div className="flex items-center gap-2">
                                                    {item.icon && <item.icon className={`w-5 h-5 ${item.color}`}/>}
                                                    <div>
                                                        <p className="text-sm text-muted-foreground">{item.label}</p>
                                                        <p className={`text-2xl ${item.color}`}>{item.value}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>

                            <Card>
                                <CardHeader><CardTitle>余额核对结果</CardTitle></CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>税地ID</TableHead>
                                                <TableHead>税地地址</TableHead>
                                                <TableHead>企业名称</TableHead>
                                                <TableHead>扣款总额</TableHead>
                                                <TableHead>充值总额</TableHead>
                                                <TableHead>应有余额</TableHead>
                                                <TableHead>实际余额</TableHead>
                                                <TableHead>余额差值</TableHead>
                                                <TableHead>校对结果</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isQuerying ? (
                                                Array.from({length: 5}).map((_, i) => <SkeletonRow key={i}/>)
                                            ) : results.length > 0 ? (
                                                results.map((result) => (
                                                    <TableRow key={result.tax_location_id}
                                                              className={!result.is_correct ? "bg-red-50 hover:bg-red-100" : ""}>
                                                        <TableCell>{result.tax_location_id}</TableCell>
                                                        <TableCell>{result.tax_address}</TableCell>
                                                        <TableCell>{result.enterprise_name}</TableCell>
                                                        <TableCell>{formatCurrency(result.total_deductions)}</TableCell>
                                                        <TableCell>{formatCurrency(result.total_recharges)}</TableCell>
                                                        <TableCell>{formatCurrency(result.expected_balance)}</TableCell>
                                                        <TableCell>{formatCurrency(result.actual_balance)}</TableCell>
                                                        <TableCell
                                                            className={result.balance_diff !== 0 ? "text-red-600 font-medium" : "text-green-600"}>
                                                            {result.balance_diff === 0 ? '无差异' : formatCurrency(result.balance_diff)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge
                                                                variant={result.is_correct ? "secondary" : "destructive"}
                                                                className={result.is_correct ? "bg-green-100 text-green-800" : ""}>
                                                                {result.is_correct ? '✅ 正确' : '❌ 异常'}
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={9}
                                                               className="h-24 text-center">未查询到数据。</TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
