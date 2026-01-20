import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
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
import { Skeleton } from './ui/skeleton';
import { getApiBaseUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';

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
        {Array.from({ length: 9 }).map((_, i) => (
            <TableCell key={i}>
                <Skeleton className="h-5" />
            </TableCell>
        ))}
    </TableRow>
);

export default function BalanceScript({ onBack }: BalanceScriptProps) {
    const { t } = useI18n();
    const balance = t.scripts.balance; // Helper shorthand

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
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
        tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
                { params: { environment }, signal }
            );
            if (response.data.success) {
                setEnterprises(response.data.data as Enterprise[]);
                // toast.success(response.data.message || '企业列表已更新');
            } else {
                toast.error(response.data.message || balance.messages.listFail);
            }
        } catch (err) {
            if (axios.isCancel(err)) return;
            console.error('获取企业列表错误:', err);
            toast.error(err instanceof Error ? err.message : balance.messages.listFail);
        } finally {
            setIsFetchingEnterprises(false);
        }
    }, [environment, balance.messages.listFail]);

    // 环境变更时重新获取企业列表
    useEffect(() => {
        const controller = new AbortController();
        fetchEnterprises(controller.signal);
        return () => controller.abort();
    }, [fetchEnterprises]);

    // 查询
    const startQuery = async () => {
        if (!tenantId || isNaN(Number(tenantId))) {
            toast.error(balance.messages.inputValidId);
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
                    toast.info(balance.messages.noData);
                } else {
                    toast.success(balance.messages.verifySuccess);
                }
                const errors = data.filter((r) => !r.is_correct).length;
                setErrorCount(errors);
                setQueryCount((prev) => prev + 1);
            } else {
                toast.error(response.data.message || balance.messages.fail);
                setResults([]);
            }
        } catch (err) {
            console.error('API调用错误:', err);
            const errorMsg = err instanceof Error ? err.message : balance.messages.fail;
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
        toast.info(balance.messages.reset);
    };

    // 导出 CSV
    const exportCSV = () => {
        if (!results.length) return;
        const headers = [
            balance.table.taxId,
            balance.table.taxAddress,
            balance.table.entName,
            balance.table.deductions,
            balance.table.recharges,
            balance.table.expected,
            balance.table.actual,
            balance.table.diff,
            balance.table.result
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
            r.is_correct ? balance.table.correct : balance.table.abnormal // Simplified correct/abnormal
        ]);
        const csv = '\uFEFF' + [headers.join(','), ...rows.map((arr) => arr.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = balance.messages.file.replace('{id}', tenantId || '未命名');
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen colorful-background p-6">
            <div className="max-w-6xl mx-auto flex flex-col gap-6">
                {/* 顶部：返回 + 状态 */}
                <div className="flex items-center justify-between">
                    <Button variant="ghost" onClick={onBack}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        {balance.back}
                    </Button>
                    <Badge variant={isQuerying ? 'destructive' : 'secondary'}>
                        {isQuerying ? balance.status.querying : balance.status.ready}
                    </Badge>
                </div>

                {/* 标题 */}
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">{balance.title}</h1>
                    <p className="text-muted-foreground">{balance.subtitle}</p>
                </div>

                {/* 查询参数 */}
                <Card>
                    <CardHeader className="pb-4">
                        <CardTitle>{balance.params.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <div>
                                <Label htmlFor="environment">{balance.params.env}</Label>
                                <Select value={environment} onValueChange={setEnvironment} disabled={isQuerying}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={balance.params.envPlaceholder} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="test">{balance.params.envTest}</SelectItem>
                                        <SelectItem value="prod">{balance.params.envProd}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label htmlFor="tenant-id">{balance.params.label}</Label>
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
                                        placeholder={balance.params.searchPlaceholder}
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
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    <span className="ml-2 text-sm">{t.common.loading}...</span>
                                                </div>
                                            ) : enterprises.length === 0 ? (
                                                <div className="p-4 text-center text-sm text-muted-foreground">
                                                    {balance.empty.noData}
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
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            {balance.params.querying}
                                        </>
                                    ) : (
                                        <>
                                            <Search className="w-4 h-4 mr-2" />
                                            {balance.params.query}
                                        </>
                                    )}
                                </Button>

                                <Button onClick={resetResults} variant="outline" disabled={isQuerying}>
                                    <RotateCcw className="w-4 h-4 mr-2" />
                                    {balance.params.reset}
                                </Button>
                            </div>

                            <div className="md:col-span-1">
                                <Button
                                    onClick={exportCSV}
                                    variant="secondary"
                                    disabled={!results.length || isQuerying}
                                    className="w-full"
                                >
                                    <FileDown className="w-4 h-4 mr-2" />
                                    {balance.params.export}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* KPI 概览 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[
                        { icon: CheckCircle, color: 'text-emerald-600', label: balance.kpi.queryCount, value: queryCount },
                        { icon: null, color: '', label: balance.kpi.totalTax, value: results.length },
                        { icon: AlertTriangle, color: 'text-red-600', label: balance.kpi.errorTax, value: errorCount },
                        {
                            icon: CheckCircle,
                            color: 'text-emerald-600',
                            label: balance.kpi.normalTax,
                            value: Math.max(results.length - errorCount, 0)
                        }
                    ].map((item, index) => (
                        <Card key={index} className="border-muted/50">
                            <CardContent className="pt-6">
                                {isQuerying ? (
                                    <Skeleton className="h-12 w-full" />
                                ) : (
                                    <div className="flex items-center gap-3">
                                        {item.icon && <item.icon className={`w-5 h-5 ${item.color}`} />}
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
                <div ref={tableTopRef} />
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle>{balance.table.title}</CardTitle>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>{balance.table.pageSize.replace('{size}', pageSize.toString())}</span>
                                {results.length > 0 && <span>· {balance.table.total.replace('{total}', results.length.toString())}</span>}
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="p-0">
                        <Table className="text-sm">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="whitespace-nowrap">{balance.table.taxId}</TableHead>
                                    <TableHead className="whitespace-nowrap">{balance.table.taxAddress}</TableHead>
                                    <TableHead className="whitespace-nowrap">{balance.table.entName}</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">{balance.table.deductions}</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">{balance.table.recharges}</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">{balance.table.expected}</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">{balance.table.actual}</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">{balance.table.diff}</TableHead>
                                    <TableHead className="whitespace-nowrap">{balance.table.result}</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {isQuerying ? (
                                    Array.from({ length: pageSize }).map((_, i) => <SkeletonRow key={i} />)
                                ) : results.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="h-48 p-0">
                                            <div
                                                className="h-full w-full flex flex-col items-center justify-center text-center gap-3 p-8">
                                                <div className="rounded-full p-3 bg-muted">
                                                    <Info className="h-5 w-5 text-muted-foreground" />
                                                </div>
                                                <p className="text-base font-medium">
                                                    {hasQueried ? balance.messages.noData : balance.empty.ready}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {balance.empty.instruction}
                                                </p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedResults.map((result) => (
                                        <TableRow
                                            key={result.tax_location_id}
                                            className={`odd:bg-muted/30 ${!result.is_correct ? 'bg-red-50 hover:bg-red-100' : ''
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
                                                className={`text-right font-mono tabular-nums ${result.balance_diff !== 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'
                                                    }`}
                                            >
                                                {result.balance_diff === 0 ? balance.table.noDiff : formatCurrency(result.balance_diff)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={result.is_correct ? 'secondary' : 'destructive'}
                                                    className={result.is_correct ? 'bg-emerald-100 text-emerald-800' : undefined}
                                                >
                                                    {result.is_correct ? balance.table.correct : balance.table.abnormal}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>

                        {/* 分页条 (keeping hardcoded generic text like 'Previous' or using t.common if available, but for now just replacing what I planned) */}
                        {results.length > 0 && (
                            <div
                                className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:justify-between items-center p-4 border-t">
                                <div className="text-sm text-muted-foreground">
                                    {/* Using t.balance.table.total or similar to construct "Page X / Y" ? Or just keep basic structure for now */}
                                    {t.common.pagination.prefix} {currentPage} {t.common.pagination.separator} {totalPages} {t.common.pagination.suffix}
                                </div>
                                <div className="flex items-center gap-1 sm:gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={currentPage === 1}
                                        onClick={() => handlePageChange(currentPage - 1)}
                                    >
                                        {t.common.prev}
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
                                        {t.common.next}
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