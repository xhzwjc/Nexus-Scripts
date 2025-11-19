import React, {useMemo, useRef, useState, useCallback, useEffect} from 'react';
import axios from 'axios';
import {Toaster, toast} from 'sonner';
import {Card, CardContent, CardHeader, CardTitle} from './ui/card';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Label} from './ui/label';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from './ui/select';
import {Badge} from './ui/badge';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from './ui/table';
import {
    ArrowLeft,
    Search,
    RotateCcw,
    AlertTriangle,
    CheckCircle,
    Loader2,
    FileDown,
    Info
} from 'lucide-react';
import {Skeleton} from './ui/skeleton';
import {getApiBaseUrl} from '../lib/api';

// API响应数据结构
interface ApiResponse<T = unknown> {
    success: boolean;
    message: string;
    data: T;
    request_id: string;
    enterprise_id: number;
}

// 企业信息结构
interface Enterprise {
    tenant_id: number;
    enterprise_name: string;
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

// 骨架屏行组件（10 行用）
const SkeletonRow = () => (
    <TableRow>
        {Array.from({length: 9}).map((_, i) => (
            <TableCell key={i}>
                <Skeleton className="h-5"/>
            </TableCell>
        ))}
    </TableRow>
);

export default function BalanceScript({onBack}: BalanceScriptProps) {
    const [environment, setEnvironment] = useState('test');
    const [tenantId, setTenantId] = useState('');
    const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
    const [isQuerying, setIsQuerying] = useState(false);
    const [isFetchingEnterprises, setIsFetchingEnterprises] = useState(false);
    const [results, setResults] = useState<BalanceResult[]>([]);
    const [queryCount, setQueryCount] = useState(0);
    const [errorCount, setErrorCount] = useState(0);
    const [hasQueried, setHasQueried] = useState(false);

    // 分页
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
    const paginatedResults = results.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const tableTopRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    // 新增：下拉容器的引用
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    // 控制下拉框显示状态
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
// 搜索关键词
    const [searchTerm, setSearchTerm] = useState('');
// 选中的企业信息
    const [selectedEnterprise, setSelectedEnterprise] = useState<Enterprise | undefined>(undefined);

    // 新增：点击空白处关闭下拉框的处理
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // 如果下拉框是打开的，且点击的不是下拉框内部或输入框
            if (
                isDropdownOpen &&
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(event.target as Node)
            ) {
                setIsDropdownOpen(false);
            }
        };

        // 监听全局点击事件
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            // 组件卸载时移除监听
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isDropdownOpen]);

    // 货币格式化
    const currency = useMemo(
        () =>
            new Intl.NumberFormat('zh-CN', {
                style: 'currency',
                currency: 'CNY',
                minimumFractionDigits: 2
            }),
        []
    );
    const formatCurrency = (amount: number) => currency.format(amount);

    // 生成分页按钮（带省略）
    const getPageNumbers = (current: number, total: number) => {
        if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
        const pages: (number | '...')[] = [];
        const add = (p: number | '...') => pages.push(p);

        add(1);
        if (current > 4) add('...');
        const start = Math.max(2, current - 1);
        const end = Math.min(total - 1, current + 1);
        for (let p = start; p <= end; p++) add(p);
        if (current < total - 3) add('...');
        add(total);
        return pages;
    };

    const scrollToTableTop = () => {
        // 平滑滚动到结果卡片顶部
        tableTopRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
    };

    const handlePageChange = (page: number) => {
        if (page >= 1 && page <= totalPages && page !== currentPage) {
            setCurrentPage(page);
            // 翻页后回到结果顶部
            // 用 rAF 确保 DOM 更新后滚动更顺滑
            requestAnimationFrame(scrollToTableTop);
        }
    };

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
                // toast.success(response.data.message || '企业列表已更新');
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

    // 环境变更时重新获取企业列表
    useEffect(() => {
        const controller = new AbortController();
        fetchEnterprises(controller.signal);
        return () => controller.abort();
    }, [fetchEnterprises]);

    // 查询
    const startQuery = async () => {
        if (!tenantId || isNaN(Number(tenantId))) {
            toast.error('请输入有效的企业租户ID');
            inputRef.current?.focus();
            return;
        }

        const base = getApiBaseUrl();
        if (!base) return;

        setIsQuerying(true);
        setHasQueried(true);
        setResults([]);
        setCurrentPage(1);

        try {
            const response = await axios.post<ApiResponse<BalanceResult[]>>(
                `${base}/balance/verify`,
                {
                    tenant_id: Number(tenantId),
                    environment: environment,
                    timeout: 15
                }
            );

            if (response.data.success) {
                const data = response.data.data as BalanceResult[];
                setResults(data);
                if (data.length === 0) {
                    toast.info('未查询到该企业的余额数据');
                } else {
                    toast.success(response.data.message);
                }
                const errors = data.filter((r) => !r.is_correct).length;
                setErrorCount(errors);
                setQueryCount((prev) => prev + 1);
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
            // 查询完成后把视线带到结果顶部
            requestAnimationFrame(scrollToTableTop);
        }
    };

    // 重置
    const resetResults = () => {
        setResults([]);
        setQueryCount(0);
        setErrorCount(0);
        setTenantId('');
        setHasQueried(false);
        setCurrentPage(1);
        setSearchTerm('');
        setSelectedEnterprise(undefined);
        inputRef.current?.focus();
        toast.info('查询结果已重置');
    };

    // 导出 CSV
    const exportCSV = () => {
        if (!results.length) return;
        const headers = [
            '税地ID',
            '税地地址',
            '企业名称',
            '扣款总额',
            '充值总额',
            '应有余额',
            '实际余额',
            '余额差值',
            '校对结果'
        ];
        const rows = results.map((r) => [
            r.tax_location_id,
            `"${(r.tax_address || '').replace(/"/g, '""')}"`,
            `"${(r.enterprise_name || '').replace(/"/g, '""')}"`,
            r.total_deductions,
            r.total_recharges,
            r.expected_balance,
            r.actual_balance,
            r.balance_diff,
            r.is_correct ? '正确' : '异常'
        ]);
        const csv = '\uFEFF' + [headers.join(','), ...rows.map((arr) => arr.join(','))].join('\n');
        const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `余额核对_${tenantId || '未命名'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const showEmptyState = !isQuerying && results.length === 0;

    return (
        <div className="min-h-screen colorful-background p-6">
            <Toaster richColors position="top-center"/>
            <div className="max-w-6xl mx-auto flex flex-col gap-6">
                {/* 顶部：返回 + 状态 */}
                <div className="flex items-center justify-between">
                    <Button variant="ghost" onClick={onBack}>
                        <ArrowLeft className="w-4 h-4 mr-2"/>
                        返回脚本列表
                    </Button>
                    <Badge variant={isQuerying ? 'destructive' : 'secondary'}>
                        {isQuerying ? '查询中' : '就绪'}
                    </Badge>
                </div>

                {/* 标题 */}
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">企业账户余额核对</h1>
                    <p className="text-muted-foreground">
                        核对企业账户余额的准确性，检测异常并提供详细对比信息
                    </p>
                </div>

                {/* 查询参数 */}
                <Card>
                    <CardHeader className="pb-4">
                        <CardTitle>查询参数</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <div>
                                <Label htmlFor="environment">环境</Label>
                                <Select value={environment} onValueChange={setEnvironment} disabled={isQuerying}>
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
                                <Label htmlFor="tenant-id">企业租户ID</Label>
                                <div className="relative">
                                    {/* 输入框 - 输入企业名称或ID */}
                                    <Input
                                        id="tenant-id"
                                        ref={inputRef}
                                        value={searchTerm}
                                        onChange={(e) => {
                                            const inputValue = e.target.value;
                                            setSearchTerm(inputValue);
                                            setIsDropdownOpen(true);

                                            // 输入是纯数字 → 暂存 tenantId
                                            if (/^\d+$/.test(inputValue)) {
                                                setTenantId(inputValue);
                                                setSelectedEnterprise(undefined);
                                            } else {
                                                setTenantId('');
                                                setSelectedEnterprise(undefined);
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                // 如果输入的是数字，直接用 tenantId 查询
                                                if (!isQuerying && tenantId) {
                                                    startQuery();
                                                    setIsDropdownOpen(false);
                                                }
                                                // 如果输入的是文字，尝试选第一个匹配项
                                                else {
                                                    const matched = enterprises.find(ent =>
                                                        ent.enterprise_name.includes(searchTerm) ||
                                                        ent.tenant_id.toString().includes(searchTerm)
                                                    );
                                                    if (matched) {
                                                        setTenantId(matched.tenant_id.toString());
                                                        setSelectedEnterprise(matched);
                                                        setSearchTerm(matched.enterprise_name);
                                                        startQuery();
                                                        setIsDropdownOpen(false);
                                                    }
                                                }
                                            }
                                            // 新增：按ESC键关闭下拉框
                                            if (e.key === 'Escape') {
                                                setIsDropdownOpen(false);
                                            }
                                        }}
                                        onClick={() => setIsDropdownOpen(true)}
                                        placeholder="输入租户ID或企业名称"
                                        disabled={isQuerying || isFetchingEnterprises}
                                        className="pr-8"
                                    />

                                    {/* 清除按钮 */}
                                    {searchTerm && (
                                        <button
                                            type="button"
                                            className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
                                            onClick={(e) => {
                                                // 阻止事件冒泡，避免触发输入框的点击事件
                                                e.stopPropagation();
                                                setSearchTerm('');
                                                setTenantId('');
                                                setSelectedEnterprise(undefined);
                                                setIsDropdownOpen(false);
                                            }}
                                        >
                                            ✕
                                        </button>
                                    )}

                                    {/* 下拉过滤列表 - 添加ref属性 */}
                                    {isDropdownOpen && (
                                        <div
                                            ref={dropdownRef}
                                            className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-lg max-h-60 overflow-auto"
                                        >
                                            {isFetchingEnterprises ? (
                                                <div className="flex justify-center p-4">
                                                    <Loader2 className="w-4 h-4 animate-spin"/>
                                                    <span className="ml-2 text-sm">加载中...</span>
                                                </div>
                                            ) : enterprises.length === 0 ? (
                                                <div className="p-4 text-center text-sm text-muted-foreground">
                                                    未获取到企业数据
                                                </div>
                                            ) : (
                                                enterprises
                                                    .filter(ent => {
                                                        const searchLower = searchTerm.toLowerCase();
                                                        return (
                                                            ent.tenant_id.toString().includes(searchLower) ||
                                                            ent.enterprise_name.toLowerCase().includes(searchLower)
                                                        );
                                                    })
                                                    .map(enterprise => (
                                                        <div
                                                            key={enterprise.tenant_id}
                                                            className="cursor-pointer px-4 py-2 hover:bg-gray-100 text-sm"
                                                            onClick={() => {
                                                                setTenantId(enterprise.tenant_id.toString());
                                                                setSelectedEnterprise(enterprise);
                                                                setSearchTerm(enterprise.enterprise_name);
                                                                setIsDropdownOpen(false);
                                                            }}
                                                        >
                                                            {enterprise.enterprise_name}（{enterprise.tenant_id}）
                                                        </div>
                                                    ))
                                            )}
                                        </div>
                                    )}
                                </div>

                            </div>

                            <div className="md:col-span-1 flex gap-3">
                                <Button
                                    onClick={startQuery}
                                    disabled={!environment || !tenantId || isQuerying}
                                    className="flex-1"
                                >
                                    {isQuerying ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin"/>
                                            查询中...
                                        </>
                                    ) : (
                                        <>
                                            <Search className="w-4 h-4 mr-2"/>
                                            查询
                                        </>
                                    )}
                                </Button>

                                <Button onClick={resetResults} variant="outline" disabled={isQuerying}>
                                    <RotateCcw className="w-4 h-4 mr-2"/>
                                    重置
                                </Button>
                            </div>

                            <div className="md:col-span-1">
                                <Button
                                    onClick={exportCSV}
                                    variant="secondary"
                                    disabled={!results.length || isQuerying}
                                    className="w-full"
                                >
                                    <FileDown className="w-4 h-4 mr-2"/>
                                    导出 CSV
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* KPI 概览 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[
                        {icon: CheckCircle, color: 'text-emerald-600', label: '查询次数', value: queryCount},
                        {icon: null, color: '', label: '总税地数', value: results.length},
                        {icon: AlertTriangle, color: 'text-red-600', label: '异常税地数', value: errorCount},
                        {
                            icon: CheckCircle,
                            color: 'text-emerald-600',
                            label: '正常税地数',
                            value: Math.max(results.length - errorCount, 0)
                        }
                    ].map((item, index) => (
                        <Card key={index} className="border-muted/50">
                            <CardContent className="pt-6">
                                {isQuerying ? (
                                    <Skeleton className="h-12 w-full"/>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        {item.icon && <item.icon className={`w-5 h-5 ${item.color}`}/>}
                                        <div>
                                            <p className="text-sm text-muted-foreground">{item.label}</p>
                                            <p className={`text-2xl font-medium tabular-nums ${item.color}`}>{item.value}</p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* 结果卡片 */}
                <div ref={tableTopRef}/>
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle>余额核对结果</CardTitle>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>每页 {pageSize} 条</span>
                                {results.length > 0 && <span>· 共 {results.length} 条</span>}
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="p-0">
                        <Table className="text-sm">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="whitespace-nowrap">税地ID</TableHead>
                                    <TableHead className="whitespace-nowrap">税地地址</TableHead>
                                    <TableHead className="whitespace-nowrap">企业名称</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">扣款总额</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">充值总额</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">应有余额</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">实际余额</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">余额差值</TableHead>
                                    <TableHead className="whitespace-nowrap">校对结果</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {isQuerying ? (
                                    Array.from({length: pageSize}).map((_, i) => <SkeletonRow key={i}/>)
                                ) : results.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="h-48 p-0">
                                            <div
                                                className="h-full w-full flex flex-col items-center justify-center text-center gap-3 p-8">
                                                <div className="rounded-full p-3 bg-muted">
                                                    <Info className="h-5 w-5 text-muted-foreground"/>
                                                </div>
                                                <p className="text-base font-medium">
                                                    {hasQueried ? '未查询到数据' : '准备就绪'}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    选择环境，输入企业租户ID，点击“查询”。支持回车快速提交。
                                                </p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedResults.map((result) => (
                                        <TableRow
                                            key={result.tax_location_id}
                                            className={`odd:bg-muted/30 ${
                                                !result.is_correct ? 'bg-red-50 hover:bg-red-100' : ''
                                            }`}
                                        >
                                            <TableCell className="tabular-nums">{result.tax_location_id}</TableCell>
                                            <TableCell className="max-w-[320px] truncate" title={result.tax_address}>
                                                {result.tax_address}
                                            </TableCell>
                                            <TableCell className="max-w-[240px] truncate"
                                                       title={result.enterprise_name}>
                                                {result.enterprise_name}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatCurrency(result.total_deductions)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatCurrency(result.total_recharges)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatCurrency(result.expected_balance)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatCurrency(result.actual_balance)}
                                            </TableCell>
                                            <TableCell
                                                className={`text-right font-mono tabular-nums ${
                                                    result.balance_diff !== 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'
                                                }`}
                                            >
                                                {result.balance_diff === 0 ? '无差异' : formatCurrency(result.balance_diff)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={result.is_correct ? 'secondary' : 'destructive'}
                                                    className={result.is_correct ? 'bg-emerald-100 text-emerald-800' : undefined}
                                                >
                                                    {result.is_correct ? '✅ 正确' : '❌ 异常'}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>

                        {/* 分页条 */}
                        {results.length > 0 && (
                            <div
                                className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:justify-between items-center p-4 border-t">
                                <div className="text-sm text-muted-foreground">
                                    第 {currentPage} / {totalPages} 页
                                </div>
                                <div className="flex items-center gap-1 sm:gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={currentPage === 1}
                                        onClick={() => handlePageChange(currentPage - 1)}
                                    >
                                        上一页
                                    </Button>

                                    {getPageNumbers(currentPage, totalPages).map((p, idx) =>
                                        p === '...' ? (
                                            <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                                                ...
                                              </span>
                                        ) : (
                                            <Button
                                                key={p}
                                                variant={currentPage === p ? 'secondary' : 'outline'}
                                                size="sm"
                                                onClick={() => handlePageChange(p as number)}
                                            >
                                                {p}
                                            </Button>
                                        )
                                    )}

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={currentPage === totalPages}
                                        onClick={() => handlePageChange(currentPage + 1)}
                                    >
                                        下一页
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}