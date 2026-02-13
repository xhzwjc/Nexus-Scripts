import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
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

// ===== 接口定义 =====

interface ApiResponse<T = unknown> {
    success: boolean;
    message: string;
    data: T;
    request_id: string;
    enterprise_id: number;
}

interface Enterprise {
    tenant_id: number;
    enterprise_name: string;
}

interface BalanceResult {
    tax_location_id: number;
    tax_address: string;
    enterprise_name: string;
    is_correct: boolean;
    tenant_id?: number;
    total_deductions: number;
    total_recharges: number;
    total_refunds: number;
    expected_balance: number;
    actual_balance: number;
    balance_diff: number;
}

interface BalanceScriptProps {
    onBack: () => void;
}

// ===== Tab 统一状态 =====

interface TabState {
    results: BalanceResult[];
    queryCount: number;
    errorCount: number;
    hasQueried: boolean;
    currentPage: number;
}

const INITIAL_TAB_STATE: TabState = {
    results: [],
    queryCount: 0,
    errorCount: 0,
    hasQueried: false,
    currentPage: 1,
};

// ===== 常量 =====

const PAGE_SIZE = 10;
const MAX_DROPDOWN_ITEMS = 50;

// ===== 组件外部纯工具函数 =====

/** 生成分页按钮序列（带省略号） */
const getPageNumbers = (current: number, total: number): (number | '...')[] => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (current > 4) pages.push('...');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let p = start; p <= end; p++) pages.push(p);
    if (current < total - 3) pages.push('...');
    pages.push(total);
    return pages;
};

// ===== 骨架屏行组件（React.memo 避免重复渲染） =====

const SkeletonRow = React.memo(() => (
    <TableRow>
        {Array.from({ length: 10 }).map((_, i) => (
            <TableCell key={i}>
                <Skeleton className="h-5" />
            </TableCell>
        ))}
    </TableRow>
));
SkeletonRow.displayName = 'SkeletonRow';

// ===== 主组件 =====

export default function BalanceScript({ onBack }: BalanceScriptProps) {
    const { t } = useI18n();
    const balance = t.scripts.balance;

    // -- 基础状态 --
    const [environment, setEnvironment] = useState('test');
    const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
    const [tenantId, setTenantId] = useState('');
    const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
    const [isQuerying, setIsQuerying] = useState(false);
    const [isFetchingEnterprises, setIsFetchingEnterprises] = useState(false);

    // -- 统一 Tab 状态（取代 10 个独立 state） --
    const [tabStates, setTabStates] = useState<Record<string, TabState>>({
        single: { ...INITIAL_TAB_STATE },
        batch: { ...INITIAL_TAB_STATE },
    });

    // -- 下拉框 --
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // -- Refs --
    const tableTopRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const dropdownRef = useRef<HTMLDivElement | null>(null);
    const isDropdownOpenRef = useRef(false);

    // 同步 ref（让事件监听器读取最新值）
    useEffect(() => {
        isDropdownOpenRef.current = isDropdownOpen;
    }, [isDropdownOpen]);

    // 点击空白处关闭下拉框（只绑定一次，用 ref 读取状态）
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                isDropdownOpenRef.current &&
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(event.target as Node)
            ) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // ===== 派生状态（useMemo 缓存） =====

    const activeState = useMemo(() => tabStates[activeTab], [tabStates, activeTab]);

    const totalPages = useMemo(
        () => Math.max(1, Math.ceil(activeState.results.length / PAGE_SIZE)),
        [activeState.results.length]
    );

    const paginatedResults = useMemo(
        () => activeState.results.slice(
            (activeState.currentPage - 1) * PAGE_SIZE,
            activeState.currentPage * PAGE_SIZE
        ),
        [activeState.results, activeState.currentPage]
    );

    // 过滤企业列表（限制最多显示 MAX_DROPDOWN_ITEMS 条）
    const filteredEnterpriseData = useMemo(() => {
        const searchLower = searchTerm.toLowerCase();
        const matched = enterprises.filter(
            ent =>
                ent.tenant_id.toString().includes(searchLower) ||
                ent.enterprise_name.toLowerCase().includes(searchLower)
        );
        return {
            items: matched.slice(0, MAX_DROPDOWN_ITEMS),
            hasMore: matched.length > MAX_DROPDOWN_ITEMS,
        };
    }, [enterprises, searchTerm]);

    // 货币格式化
    const currency = useMemo(
        () => new Intl.NumberFormat('zh-CN', {
            style: 'currency',
            currency: 'CNY',
            minimumFractionDigits: 2,
        }),
        []
    );
    const formatCurrency = useCallback(
        (amount: number) => currency.format(amount),
        [currency]
    );

    // KPI 卡片配置
    const kpiItems = useMemo(() => [
        { icon: CheckCircle, color: 'text-emerald-600', label: balance.kpi.queryCount, value: activeState.queryCount },
        { icon: null, color: '', label: balance.kpi.totalTax, value: activeState.results.length },
        { icon: AlertTriangle, color: 'text-red-600', label: balance.kpi.errorTax, value: activeState.errorCount },
        {
            icon: CheckCircle,
            color: 'text-emerald-600',
            label: balance.kpi.normalTax,
            value: Math.max(activeState.results.length - activeState.errorCount, 0),
        },
    ], [balance.kpi, activeState.queryCount, activeState.results.length, activeState.errorCount]);

    // ===== Tab 状态辅助函数 =====

    const updateTabState = useCallback((tab: string, updater: (prev: TabState) => Partial<TabState>) => {
        setTabStates(prev => ({
            ...prev,
            [tab]: { ...prev[tab], ...updater(prev[tab]) },
        }));
    }, []);

    const resetTabState = useCallback((tab: string) => {
        setTabStates(prev => ({
            ...prev,
            [tab]: { ...INITIAL_TAB_STATE },
        }));
    }, []);

    // ===== 分页 =====

    const handlePageChange = useCallback((page: number) => {
        if (page >= 1 && page <= totalPages && page !== activeState.currentPage) {
            updateTabState(activeTab, () => ({ currentPage: page }));
            requestAnimationFrame(() => {
                tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    }, [totalPages, activeState.currentPage, activeTab, updateTabState]);

    // ===== API 调用 =====

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

    // 环境变更时重新获取企业列表并清空所有状态
    useEffect(() => {
        const controller = new AbortController();
        fetchEnterprises(controller.signal);
        setTenantId('');
        setSearchTerm('');
        setTabStates({
            single: { ...INITIAL_TAB_STATE },
            batch: { ...INITIAL_TAB_STATE },
        });
        return () => controller.abort();
    }, [fetchEnterprises]);

    // 查询
    const startQuery = useCallback(async () => {
        if (activeTab === 'single' && (!tenantId || isNaN(Number(tenantId)))) {
            toast.error(balance.messages.inputValidId);
            inputRef.current?.focus();
            return;
        }

        const base = getApiBaseUrl();
        if (!base) return;

        setIsQuerying(true);
        updateTabState(activeTab, () => ({
            hasQueried: true,
            results: [],
            currentPage: 1,
        }));

        try {
            const response = await axios.post<ApiResponse<BalanceResult[]>>(
                `${base}/balance/verify`,
                {
                    tenant_id: activeTab === 'single' ? Number(tenantId) : undefined,
                    environment,
                    timeout: activeTab === 'batch' ? 120 : 15,
                }
            );

            if (response.data.success) {
                const data = response.data.data as BalanceResult[];
                const errors = data.filter(r => !r.is_correct).length;

                // 批量模式排序：按 tenant_id → tax_location_id
                const finalData = activeTab === 'batch'
                    ? [...data].sort((a, b) => {
                        const tenantA = a.tenant_id ?? 0;
                        const tenantB = b.tenant_id ?? 0;
                        if (tenantA !== tenantB) return tenantA - tenantB;
                        return a.tax_location_id - b.tax_location_id;
                    })
                    : data;

                updateTabState(activeTab, prev => ({
                    results: finalData,
                    errorCount: errors,
                    queryCount: prev.queryCount + 1,
                }));

                if (data.length === 0) {
                    toast.info(balance.messages.noData);
                } else {
                    toast.success(balance.messages.verifySuccess);
                }
            } else {
                toast.error(response.data.message || balance.messages.fail);
                updateTabState(activeTab, () => ({ results: [] }));
            }
        } catch (err) {
            console.error('API调用错误:', err);
            toast.error(err instanceof Error ? err.message : balance.messages.fail);
            updateTabState(activeTab, () => ({ results: [] }));
        } finally {
            setIsQuerying(false);
            requestAnimationFrame(() => {
                tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    }, [activeTab, tenantId, environment, balance.messages, updateTabState]);

    // 重置
    const resetResults = useCallback(() => {
        resetTabState(activeTab);
        if (activeTab === 'single') {
            setTenantId('');
            setSearchTerm('');
            inputRef.current?.focus();
        }
        toast.info(balance.messages.reset);
    }, [activeTab, resetTabState, balance.messages.reset]);

    // 导出 CSV
    const exportCSV = useCallback(() => {
        if (!activeState.results.length) return;
        const headers = [
            balance.table.taxId, balance.table.taxAddress, balance.table.entName,
            balance.table.deductions, balance.table.recharges, balance.table.refunds,
            balance.table.expected, balance.table.actual, balance.table.diff, balance.table.result,
        ];
        const rows = activeState.results.map(r => [
            r.tax_location_id,
            `"${(r.tax_address || '').replace(/"/g, '""')}"`,
            `"${(r.enterprise_name || '').replace(/"/g, '""')}"`,
            r.total_deductions, r.total_recharges, r.total_refunds,
            r.expected_balance, r.actual_balance, r.balance_diff,
            r.is_correct ? balance.table.correct : balance.table.abnormal,
        ]);
        const csv = '\uFEFF' + [headers.join(','), ...rows.map(arr => arr.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fileNameSuffix = activeTab === 'single' ? (tenantId || '未命名') : '批量全部';
        a.download = balance.messages.file.replace('{id}', fileNameSuffix);
        a.click();
        URL.revokeObjectURL(url);
    }, [activeState.results, activeTab, tenantId, balance.table, balance.messages.file]);

    // ===== 渲染辅助：提取重复 JSX =====

    /** 环境选择器（单个/批量 Tab 共用） */
    const renderEnvironmentSelect = (selectId?: string) => (
        <div>
            <Label htmlFor={selectId || 'environment'}>{balance.params.env}</Label>
            <Select value={environment} onValueChange={setEnvironment} disabled={isQuerying}>
                <SelectTrigger id={selectId}>
                    <SelectValue placeholder={balance.params.envPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="test">{balance.params.envTest}</SelectItem>
                    <SelectItem value="prod">{balance.params.envProd}</SelectItem>
                </SelectContent>
            </Select>
        </div>
    );

    /** 操作按钮组：查询 + 重置 + 导出（单个/批量 Tab 共用） */
    const renderActionButtons = (queryLabel: string, queryDisabled: boolean, exportColClass?: string) => (
        <>
            <div className="md:col-span-1 flex gap-3">
                <Button
                    onClick={startQuery}
                    disabled={queryDisabled || isQuerying}
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
                            {queryLabel}
                        </>
                    )}
                </Button>
                <Button onClick={resetResults} variant="outline" disabled={isQuerying}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {balance.params.reset}
                </Button>
            </div>

            <div className={exportColClass || 'md:col-span-1'}>
                <Button
                    onClick={exportCSV}
                    variant="secondary"
                    disabled={!activeState.results.length || isQuerying}
                    className="w-full"
                >
                    <FileDown className="w-4 h-4 mr-2" />
                    {balance.params.export}
                </Button>
            </div>
        </>
    );

    // ===== JSX =====

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

                {/* 查询参数 Tabs */}
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'single' | 'batch')} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="single">{balance.tabs.single}</TabsTrigger>
                        <TabsTrigger value="batch">{balance.tabs.batch}</TabsTrigger>
                    </TabsList>

                    {/* ====== 单个企业 Tab ====== */}
                    <TabsContent value="single">
                        <Card>
                            <CardHeader className="pb-4">
                                <CardTitle>{balance.params.title}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                    {renderEnvironmentSelect()}

                                    <div>
                                        <Label htmlFor="tenant-id">{balance.params.label}</Label>
                                        <div className="relative">
                                            <Input
                                                id="tenant-id"
                                                ref={inputRef}
                                                value={searchTerm}
                                                onChange={(e) => {
                                                    const inputValue = e.target.value;
                                                    setSearchTerm(inputValue);
                                                    setIsDropdownOpen(true);
                                                    setTenantId(/^\d+$/.test(inputValue) ? inputValue : '');
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        if (!isQuerying && tenantId) {
                                                            startQuery();
                                                            setIsDropdownOpen(false);
                                                        } else {
                                                            const matched = enterprises.find(ent =>
                                                                ent.enterprise_name.includes(searchTerm) ||
                                                                ent.tenant_id.toString().includes(searchTerm)
                                                            );
                                                            if (matched) {
                                                                setTenantId(matched.tenant_id.toString());
                                                                setSearchTerm(matched.enterprise_name);
                                                                setIsDropdownOpen(false);
                                                            }
                                                        }
                                                    }
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
                                                        e.stopPropagation();
                                                        setSearchTerm('');
                                                        setTenantId('');
                                                        setIsDropdownOpen(false);
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                            )}

                                            {/* 下拉过滤列表 */}
                                            {isDropdownOpen && (
                                                <div
                                                    ref={dropdownRef}
                                                    className="absolute z-10 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-lg max-h-60 overflow-auto"
                                                >
                                                    {isFetchingEnterprises ? (
                                                        <div className="flex justify-center p-4">
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                            <span className="ml-2 text-sm">{t.common.loading}</span>
                                                        </div>
                                                    ) : enterprises.length === 0 ? (
                                                        <div className="p-4 text-center text-sm text-muted-foreground">
                                                            {balance.empty.noData}
                                                        </div>
                                                    ) : filteredEnterpriseData.items.length === 0 ? (
                                                        /* 新增：过滤后无结果的提示 */
                                                        <div className="p-4 text-center text-sm text-muted-foreground">
                                                            {t.header.noResults}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {filteredEnterpriseData.items.map(enterprise => (
                                                                <div
                                                                    key={enterprise.tenant_id}
                                                                    className="cursor-pointer px-4 py-2 hover:bg-accent hover:text-accent-foreground text-sm"
                                                                    onClick={() => {
                                                                        setTenantId(enterprise.tenant_id.toString());
                                                                        setSearchTerm(enterprise.enterprise_name);
                                                                        setIsDropdownOpen(false);
                                                                    }}
                                                                >
                                                                    {enterprise.enterprise_name}（{enterprise.tenant_id}）
                                                                </div>
                                                            ))}
                                                            {/* 新增：超出限制时的提示 */}
                                                            {filteredEnterpriseData.hasMore && (
                                                                <div className="px-4 py-2 text-center text-xs text-muted-foreground border-t">
                                                                    ...
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {renderActionButtons(balance.params.query, !environment || !tenantId)}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ====== 批量 Tab ====== */}
                    <TabsContent value="batch">
                        <Card>
                            <CardHeader className="pb-4">
                                <CardTitle>{balance.tabs.batch}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                    {renderEnvironmentSelect('environment-batch')}
                                    {renderActionButtons(
                                        balance.actions.startBatch,
                                        !environment,
                                        'md:col-span-1 md:col-start-4'
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                {/* KPI 概览 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {kpiItems.map((item, index) => (
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
                                <span>{balance.table.pageSize.replace('{size}', PAGE_SIZE.toString())}</span>
                                {activeState.results.length > 0 && <span>· {balance.table.total.replace('{total}', activeState.results.length.toString())}</span>}
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
                                    <TableHead className="text-right whitespace-nowrap">{balance.table.refunds}</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">{balance.table.expected}</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">{balance.table.actual}</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">{balance.table.diff}</TableHead>
                                    <TableHead className="whitespace-nowrap">{balance.table.result}</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {isQuerying ? (
                                    Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonRow key={i} />)
                                ) : activeState.results.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={10} className="h-48 p-0">
                                            <div className="h-full w-full flex flex-col items-center justify-center text-center gap-3 p-8">
                                                <div className="rounded-full p-3 bg-muted">
                                                    <Info className="h-5 w-5 text-muted-foreground" />
                                                </div>
                                                <p className="text-base font-medium">
                                                    {activeState.hasQueried ? balance.messages.noData : balance.empty.ready}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {balance.empty.instruction}
                                                </p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedResults.map((result, index) => (
                                        <TableRow
                                            key={`${result.tenant_id ?? 'unknown'}-${result.tax_location_id}-${index}`}
                                            className={`odd:bg-muted/30 ${!result.is_correct ? 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20' : ''}`}
                                        >
                                            <TableCell className="tabular-nums">{result.tax_location_id}</TableCell>
                                            <TableCell className="max-w-[320px] truncate" title={result.tax_address}>
                                                {result.tax_address}
                                            </TableCell>
                                            <TableCell className="max-w-[240px] truncate" title={result.enterprise_name}>
                                                {result.enterprise_name}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatCurrency(result.total_deductions)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatCurrency(result.total_recharges)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatCurrency(result.total_refunds)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatCurrency(result.expected_balance)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatCurrency(result.actual_balance)}
                                            </TableCell>
                                            <TableCell
                                                className={`text-right font-mono tabular-nums ${result.balance_diff !== 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'}`}
                                            >
                                                {result.balance_diff === 0 ? balance.table.noDiff : formatCurrency(result.balance_diff)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={result.is_correct ? 'secondary' : 'destructive'}
                                                    className={result.is_correct ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300' : undefined}
                                                >
                                                    {result.is_correct ? balance.table.correct : balance.table.abnormal}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>

                        {/* 分页条 */}
                        {activeState.results.length > 0 && (
                            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:justify-between items-center p-4 border-t">
                                <div className="text-sm text-muted-foreground">
                                    {t.common.pagination.prefix} {activeState.currentPage} {t.common.pagination.separator} {totalPages} {t.common.pagination.suffix}
                                </div>
                                <div className="flex items-center gap-1 sm:gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={activeState.currentPage === 1}
                                        onClick={() => handlePageChange(activeState.currentPage - 1)}
                                    >
                                        {t.common.prev}
                                    </Button>

                                    {getPageNumbers(activeState.currentPage, totalPages).map((p, idx) =>
                                        p === '...' ? (
                                            <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                                                ...
                                            </span>
                                        ) : (
                                            <Button
                                                key={p}
                                                variant={activeState.currentPage === p ? 'secondary' : 'outline'}
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
                                        disabled={activeState.currentPage === totalPages}
                                        onClick={() => handlePageChange(activeState.currentPage + 1)}
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