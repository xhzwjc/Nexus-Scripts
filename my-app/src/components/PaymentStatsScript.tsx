import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Checkbox } from './ui/checkbox';
import { ScrollArea } from './ui/scroll-area';
import { Skeleton } from './ui/skeleton';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
} from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
    ArrowLeft,
    Loader2,
    Filter,
    Calculator,
    BarChart3,
    Check,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import { getApiBaseUrl } from '../lib/api';
import { cn } from '../lib/utils'; // Assuming utils exists, if not use classnames or inline

interface Enterprise {
    id: number;
    enterprise_name: string;
}

interface TaxAddressStat {
    tax_id: number;
    tax_address: string;
    invoiced_amount: number;
    uninvoiced_amount: number;
    total_amount: number;
}

interface EnterpriseTaxStat {
    enterprise_name: string;
    tax_address: string;
    invoiced_amount: number;
    uninvoiced_amount: number;
    total_amount: number;
    service_amount: number;
}

interface MonthlyStatItem {
    month: string;
    amount: number;
    service_amount: number;
    details: EnterpriseTaxStat[];
}

interface PaymentStatsData {
    total_settlement: number;
    total_service_amount: number;
    tax_address_stats: TaxAddressStat[];
    enterprise_stats: EnterpriseTaxStat[];
    monthly_stats: MonthlyStatItem[];
}

function MonthlyItem({
    item,
    formatCurrency
}: {
    item: MonthlyStatItem,
    formatCurrency: (val: number) => string
}) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border border-white/40 rounded-2xl overflow-hidden bg-white/40 backdrop-blur-md transition-all hover:bg-white/60 hover:shadow-md">
            <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 font-bold text-sm">
                        {item.month.split('-')[1]}月
                    </div>
                    <div>
                        <div className="font-bold text-slate-800 text-lg">{item.month}</div>
                        <div className="text-xs text-slate-500 font-medium">包含 {item.details.length} 条企业明细</div>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <div className="font-mono font-black text-xl text-[#0f172a]">
                            {formatCurrency(item.amount)}
                        </div>
                        <div className="text-xs text-slate-500 font-medium font-mono">
                            服务费: <span className="text-amber-600">{formatCurrency(item.service_amount)}</span>
                        </div>
                    </div>
                    <div className={`w-8 h-8 rounded-full bg-white/50 flex items-center justify-center transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                        <ChevronDown className="h-4 w-4 text-slate-600" />
                    </div>
                </div>
            </div>

            {isOpen && (
                <div className="border-t border-white/20 bg-white/30 p-2 md:p-4 animate-in slide-in-from-top-2">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-0">
                                <TableHead className="h-8 text-[10px] md:text-xs font-bold text-slate-500">企业名称</TableHead>
                                <TableHead className="h-8 text-[10px] md:text-xs font-bold text-slate-500">税地名称</TableHead>
                                <TableHead className="h-8 text-[10px] md:text-xs font-bold text-slate-500 text-right">总金额</TableHead>
                                <TableHead className="h-8 text-[10px] md:text-xs font-bold text-slate-500 text-right">总服务费</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {item.details.map((detail, idx) => (
                                <TableRow key={idx} className="hover:bg-white/40 border-0">
                                    <TableCell className="py-1 md:py-2 text-[10px] md:text-xs font-medium text-slate-700 max-w-[100px] truncate" title={detail.enterprise_name}>{detail.enterprise_name}</TableCell>
                                    <TableCell className="py-1 md:py-2 text-[10px] md:text-xs text-slate-500 max-w-[80px] truncate" title={detail.tax_address}>{detail.tax_address}</TableCell>
                                    <TableCell className="py-1 md:py-2 text-[10px] md:text-xs text-right font-mono font-bold text-slate-700">
                                        {formatCurrency(detail.total_amount)}
                                    </TableCell>
                                    <TableCell className="py-1 md:py-2 text-[10px] md:text-xs text-right font-mono font-medium text-amber-600">
                                        {formatCurrency(detail.service_amount)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}

export default function PaymentStatsScript({ onBack }: { onBack: () => void }) {
    const [environment, setEnvironment] = useState('prod');
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [isCalculating, setIsCalculating] = useState(false);

    // Data
    const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
    const [selectedEnterpriseIds, setSelectedEnterpriseIds] = useState<number[]>([]);
    const [statsData, setStatsData] = useState<PaymentStatsData | null>(null);

    // Filter UI
    const [openFilter, setOpenFilter] = useState(false);

    // Fetch enterprises on mount/env change
    useEffect(() => {
        setStatsData(null); // Clear previous stats on environment change
        fetchEnterprises();
    }, [environment]);

    const fetchEnterprises = async () => {
        const base = getApiBaseUrl();
        if (!base) return;

        setIsLoadingUsers(true);
        try {
            const res = await axios.post(`${base}/stats/payment/enterprises`, {
                environment,
                timeout: 30
            });
            if (res.data.success) {
                const list: Enterprise[] = res.data.data.enterprises;
                setEnterprises(list);

                // Default selection: All EXCEPT id 36 (Shengda)
                const defaultIds = list
                    .filter(e => e.id !== 36)
                    .map(e => e.id);
                setSelectedEnterpriseIds(defaultIds);
            } else {
                toast.error(res.data.message);
            }
        } catch (err) {
            toast.error('获取企业列表失败');
            console.error(err);
        } finally {
            setIsLoadingUsers(false);
        }
    };

    const handleCalculate = async () => {
        if (selectedEnterpriseIds.length === 0) {
            toast.warning('请至少选择一个企业');
            return;
        }

        const base = getApiBaseUrl();
        if (!base) return;

        setIsCalculating(true);
        try {
            // Send the inclusion list directly
            const res = await axios.post(`${base}/stats/payment/calculate`, {
                environment,
                enterprise_ids: selectedEnterpriseIds,
                timeout: 30
            });

            if (res.data.success) {
                setStatsData(res.data.data);
                toast.success('计算完成');
            } else {
                toast.error(res.data.message);
            }
        } catch (err) {
            toast.error('计算失败');
            console.error(err);
        } finally {
            setIsCalculating(false);
        }
    };

    const toggleEnterprise = (id: number) => {
        setSelectedEnterpriseIds(prev =>
            prev.includes(id)
                ? prev.filter(x => x !== id)
                : [...prev, id]
        );
    };

    const toggleAll = () => {
        if (selectedEnterpriseIds.length === enterprises.length) {
            setSelectedEnterpriseIds([]);
        } else {
            setSelectedEnterpriseIds(enterprises.map(e => e.id));
        }
    };

    // Currency formatter
    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(val);

    return (
        <div className="min-h-screen bg-[#F5F5F7] p-6 font-sans">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header & Controls */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            onClick={onBack}
                            className="h-10 w-10 p-0 rounded-full hover:bg-white/50"
                        >
                            <ArrowLeft className="w-5 h-5 text-slate-600" />
                        </Button>
                        <div>
                            <h1 className="text-3xl font-black tracking-tight text-[#0f172a]">
                                企业支付统计
                            </h1>
                            <p className="text-sm text-slate-500 font-medium">
                                全局业务数据分析与结算概览
                            </p>
                        </div>
                    </div>
                </div>

                {/* Horizontal Filter Bar / Glass Toolbar */}
                <div className="sticky top-4 z-40 p-2 rounded-2xl bg-white/70 backdrop-blur-2xl border border-white/40 shadow-xl flex flex-col md:flex-row gap-3 items-center">
                    {/* Environment */}
                    <Select value={environment} onValueChange={setEnvironment} disabled={isCalculating}>
                        <SelectTrigger className="w-full md:w-[180px] h-12 rounded-xl bg-white/50 border-0 focus:ring-0 font-bold text-slate-700">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="test">测试环境 (Beta)</SelectItem>
                            <SelectItem value="prod">生产环境</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Enterprise Filter */}
                    <div className="flex-1 w-full">
                        <Popover open={openFilter} onOpenChange={setOpenFilter}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={openFilter}
                                    className="w-full h-12 justify-between rounded-xl bg-white/50 border-0 hover:bg-white/80 transition-colors text-slate-700"
                                    disabled={isLoadingUsers || isCalculating}
                                >
                                    {isLoadingUsers ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载企业数据...</>
                                    ) : (
                                        <div className="flex items-center">
                                            <Filter className="mr-2 h-4 w-4 text-blue-600" />
                                            <span className="font-bold">
                                                {selectedEnterpriseIds.length === 0
                                                    ? "选择参与统计的企业"
                                                    : `已选: ${selectedEnterpriseIds.length} 个企业`}
                                            </span>
                                        </div>
                                    )}
                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0 rounded-2xl overflow-hidden shadow-2xl border-0" align="start">
                                <Command className="bg-white/90 backdrop-blur-xl">
                                    <CommandInput placeholder="搜索企业..." className="h-12" />
                                    <CommandEmpty>未找到企业</CommandEmpty>
                                    <CommandGroup className="max-h-[300px] overflow-y-auto p-2">
                                        <CommandItem onSelect={toggleAll} className="cursor-pointer rounded-lg mb-1 aria-selected:bg-blue-50">
                                            <div className={cn(
                                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                selectedEnterpriseIds.length === enterprises.length
                                                    ? "bg-primary text-primary-foreground"
                                                    : "opacity-50 [&_svg]:invisible"
                                            )}>
                                                <Check className={cn("h-4 w-4")} />
                                            </div>
                                            <span className="font-bold">全选 / 取消全选</span>
                                        </CommandItem>
                                        {enterprises.map((ent) => (
                                            <CommandItem
                                                key={ent.id}
                                                onSelect={() => toggleEnterprise(ent.id)}
                                                className="cursor-pointer rounded-lg mb-1 aria-selected:bg-blue-50"
                                            >
                                                <div className={cn(
                                                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                    selectedEnterpriseIds.includes(ent.id)
                                                        ? "bg-primary text-primary-foreground"
                                                        : "opacity-50 [&_svg]:invisible"
                                                )}>
                                                    <Check className={cn("h-4 w-4")} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-slate-700">{ent.enterprise_name}</span>
                                                    <span className="text-[10px] text-slate-400">ID: {ent.id}</span>
                                                </div>
                                                {ent.id === 36 && (
                                                    <Badge variant="secondary" className="ml-auto text-[10px] h-5 bg-amber-100 text-amber-700">测试企业</Badge>
                                                )}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <Button
                        className="w-full md:w-auto h-12 px-8 rounded-xl !bg-gradient-to-r !from-[#0f172a] !to-[#334155] hover:!from-blue-600 hover:!to-blue-500 !text-white !shadow-lg hover:!shadow-blue-500/30 transition-all duration-300 font-bold text-base border-0"
                        onClick={handleCalculate}
                        disabled={isCalculating || isLoadingUsers}
                    >
                        {isCalculating ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 计算中...</>
                        ) : (
                            <><Calculator className="mr-2 h-4 w-4" /> 开始统计分析</>
                        )}
                    </Button>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="bg-white/60 dark:bg-white/5 backdrop-blur-3xl border border-white/40 shadow-sm rounded-3xl overflow-hidden group hover:bg-white/80 transition-all">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-wider">平台总结算金额</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl md:text-5xl font-black text-[#0f172a] tracking-tight">
                                {isCalculating ? (
                                    <Skeleton className="h-12 w-48 rounded-xl" />
                                ) : (
                                    statsData ? formatCurrency(statsData.total_settlement) : '---'
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-2 text-sm text-slate-500 font-medium">
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                    涉及税地: {statsData ? statsData.tax_address_stats.length : '-'}
                                </Badge>
                                <span>基于 {selectedEnterpriseIds.length} 个企业</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white/60 dark:bg-white/5 backdrop-blur-3xl border border-white/40 shadow-sm rounded-3xl overflow-hidden group hover:bg-white/80 transition-all">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-wider">平台总服务费</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl md:text-5xl font-black text-amber-600 tracking-tight">
                                {isCalculating ? (
                                    <Skeleton className="h-12 w-48 rounded-xl" />
                                ) : (
                                    statsData ? formatCurrency(statsData.total_service_amount) : '---'
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-2 text-sm text-slate-500 font-medium">
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                    服务费率分析
                                </Badge>
                                <span>所有已选企业汇总</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Monthly Histogram & Details */}
                <Card className="bg-white/60 dark:bg-white/5 backdrop-blur-3xl border border-white/40 shadow-sm rounded-3xl overflow-hidden">
                    <CardHeader className="px-8 pt-8">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-xl font-black text-[#0f172a]">月度结算趋势</CardTitle>
                                <p className="text-slate-500 font-medium mt-1">按月份统计的结算金额与服务费明细</p>
                            </div>
                            <BarChart3 className="w-6 h-6 text-slate-300" />
                        </div>
                    </CardHeader>
                    <CardContent className="p-8">
                        {isCalculating ? (
                            <div className="space-y-4">
                                <Skeleton className="h-16 w-full rounded-2xl" />
                                <Skeleton className="h-16 w-full rounded-2xl" />
                            </div>
                        ) : !statsData || !statsData.monthly_stats || statsData.monthly_stats.length === 0 ? (
                            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                                <BarChart3 className="w-12 h-12 mb-4 opacity-20" />
                                <p className="font-bold">暂无趋势数据</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {statsData.monthly_stats.map((item) => (
                                    <MonthlyItem key={item.month} item={item} formatCurrency={formatCurrency} />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Tables Section */}
                {/* Tables Section */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
                    {/* Tax Address Stats */}
                    <Card className="bg-white/60 dark:bg-white/5 backdrop-blur-3xl border border-white/40 shadow-sm rounded-3xl overflow-hidden">
                        <CardHeader className="px-4 py-4 md:px-6 md:py-6 border-b border-slate-100/50">
                            <CardTitle className="text-base md:text-lg font-bold text-[#0f172a]">税地开票概览</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 overflow-x-auto">
                            <Table className="min-w-[500px] md:min-w-0">
                                <TableHeader className="bg-slate-50/50">
                                    <TableRow className="hover:bg-transparent border-b-0">
                                        <TableHead className="py-2 pl-4 md:py-4 md:pl-6 text-xs md:text-sm font-bold text-slate-600">税地名称</TableHead>
                                        <TableHead className="py-2 md:py-4 text-right text-xs md:text-sm font-bold text-slate-600">未开票金额</TableHead>
                                        <TableHead className="py-2 md:py-4 text-right text-xs md:text-sm font-bold text-slate-600">已开票</TableHead>
                                        <TableHead className="py-2 md:py-4 text-right text-xs md:text-sm font-bold text-slate-600">进度</TableHead>
                                        <TableHead className="py-2 pr-4 md:py-4 md:pr-6 text-right text-xs md:text-sm font-bold text-slate-600">总金额</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isCalculating ? (
                                        <TableRow><TableCell colSpan={5} className="h-32 text-center text-xs md:text-sm">加载中...</TableCell></TableRow>
                                    ) : (!statsData || statsData.tax_address_stats.length === 0) ? (
                                        <TableRow><TableCell colSpan={5} className="h-32 text-center text-slate-400 text-xs md:text-sm">暂无数据</TableCell></TableRow>
                                    ) : (
                                        statsData.tax_address_stats.map((row) => (
                                            <TableRow key={row.tax_id} className="hover:bg-white/40 border-slate-100/50">
                                                <TableCell className="pl-4 md:pl-6 text-xs md:text-sm font-medium text-slate-700">
                                                    {row.tax_address}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-amber-600 font-bold text-xs md:text-sm">
                                                    {formatCurrency(row.uninvoiced_amount)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-emerald-600 font-bold text-xs md:text-sm">
                                                    {formatCurrency(row.invoiced_amount)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Badge variant={row.uninvoiced_amount > 0 ? "outline" : "secondary"} className="font-mono text-[10px] md:text-xs">
                                                        {row.total_amount > 0 ? `${((row.invoiced_amount / row.total_amount) * 100).toFixed(0)}%` : '0%'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="pr-4 md:pr-6 text-right font-mono font-medium text-slate-600 text-xs md:text-sm">
                                                    {formatCurrency(row.total_amount)}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Enterprise Stats */}
                    <Card className="bg-white/60 dark:bg-white/5 backdrop-blur-3xl border border-white/40 shadow-sm rounded-3xl overflow-hidden">
                        <CardHeader className="px-6 py-6 border-b border-slate-100/50">
                            <CardTitle className="text-base md:text-lg font-bold text-[#0f172a]">企业开票详情</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 overflow-x-auto">
                            <ScrollArea className="h-[500px]">
                                <Table className="min-w-[600px] md:min-w-0">
                                    <TableHeader className="bg-slate-50/50 sticky top-0 z-10 backdrop-blur-md">
                                        <TableRow className="hover:bg-transparent border-b-0">
                                            <TableHead className="py-2 pl-4 md:py-4 md:pl-4 text-xs md:text-sm font-bold text-slate-600">企业</TableHead>
                                            <TableHead className="py-2 md:py-4 text-xs md:text-sm font-bold text-slate-600">税地</TableHead>
                                            <TableHead className="py-2 md:py-4 text-right text-xs md:text-sm font-bold text-slate-600">未开票</TableHead>
                                            <TableHead className="py-2 md:py-4 text-right text-xs md:text-sm font-bold text-slate-600">已开票</TableHead>
                                            <TableHead className="py-2 md:py-4 text-right text-xs md:text-sm font-bold text-slate-600">进度</TableHead>
                                            <TableHead className="py-2 pr-4 md:py-4 md:pr-4 text-right text-xs md:text-sm font-bold text-slate-600">总金额</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isCalculating ? (
                                            <TableRow><TableCell colSpan={6} className="h-32 text-center text-xs md:text-sm">加载中...</TableCell></TableRow>
                                        ) : (!statsData || !statsData.enterprise_stats || statsData.enterprise_stats.length === 0) ? (
                                            <TableRow><TableCell colSpan={6} className="h-32 text-center text-slate-400 text-xs md:text-sm">暂无数据</TableCell></TableRow>
                                        ) : (
                                            statsData.enterprise_stats.map((row, index) => (
                                                <TableRow key={index} className="hover:bg-white/40 border-slate-100/50">
                                                    <TableCell className="pl-4 font-medium text-slate-700 text-xs md:text-sm max-w-[100px] md:max-w-[150px] truncate" title={row.enterprise_name}>
                                                        {row.enterprise_name}
                                                    </TableCell>
                                                    <TableCell className="text-[10px] md:text-xs text-slate-500 max-w-[80px] md:max-w-[120px] truncate" title={row.tax_address}>
                                                        {row.tax_address}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-amber-600 font-bold text-xs md:text-sm">
                                                        {formatCurrency(row.uninvoiced_amount)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-emerald-600 font-bold text-xs md:text-sm">
                                                        {formatCurrency(row.invoiced_amount)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span className="text-[10px] md:text-xs text-slate-400">
                                                            {row.total_amount > 0
                                                                ? `${((row.invoiced_amount / row.total_amount) * 100).toFixed(0)}%`
                                                                : '0%'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="pr-4 text-right font-mono text-slate-600 font-medium text-xs md:text-sm">
                                                        {formatCurrency(row.total_amount)}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}



