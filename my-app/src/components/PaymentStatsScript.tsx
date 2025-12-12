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
        <div className="min-h-screen bg-slate-50/50 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <Button variant="ghost" onClick={onBack} className="-ml-2">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        返回脚本列表
                    </Button>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                        企业支付统计与分析
                    </h1>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Sidebar: Controls */}
                    <Card className="lg:col-span-1 h-fit">
                        <CardHeader>
                            <CardTitle className="text-lg">统计配置</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Environment */}
                            <div className="space-y-2">
                                <span className="text-sm font-medium">运行环境</span>
                                <Select value={environment} onValueChange={setEnvironment} disabled={isCalculating}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="test">测试环境 (Beta)</SelectItem>
                                        <SelectItem value="prod">生产环境</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Enterprise Filter */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">企业筛选</span>
                                    <span className="text-xs text-muted-foreground">
                                        已选 {selectedEnterpriseIds.length} / {enterprises.length}
                                    </span>
                                </div>
                                <Popover open={openFilter} onOpenChange={setOpenFilter}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openFilter}
                                            className="w-full justify-between"
                                            disabled={isLoadingUsers || isCalculating}
                                        >
                                            {isLoadingUsers ? (
                                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载中...</>
                                            ) : (
                                                <><Filter className="mr-2 h-4 w-4" /> 选择参与统计的企业</>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="搜索企业..." />
                                            <CommandEmpty>未找到企业</CommandEmpty>
                                            <CommandGroup>
                                                <CommandItem onSelect={toggleAll} className="cursor-pointer">
                                                    <div className={cn(
                                                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                        selectedEnterpriseIds.length === enterprises.length
                                                            ? "bg-primary text-primary-foreground"
                                                            : "opacity-50 [&_svg]:invisible"
                                                    )}>
                                                        <Check className={cn("h-4 w-4")} />
                                                    </div>
                                                    <span>全选 / 取消全选</span>
                                                </CommandItem>
                                                <ScrollArea className="h-[300px]">
                                                    {enterprises.map((ent) => (
                                                        <CommandItem
                                                            key={ent.id}
                                                            onSelect={() => toggleEnterprise(ent.id)}
                                                            className="cursor-pointer"
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
                                                                <span>{ent.enterprise_name}</span>
                                                                <span className="text-xs text-muted-foreground">ID: {ent.id}</span>
                                                            </div>
                                                            {ent.id === 36 && (
                                                                <Badge variant="secondary" className="ml-auto text-[10px] h-5">测试企业</Badge>
                                                            )}
                                                        </CommandItem>
                                                    ))}
                                                </ScrollArea>
                                            </CommandGroup>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                {enterprises.find(e => e.id === 36 && !selectedEnterpriseIds.includes(36)) && (
                                    <p className="text-xs text-amber-600 flex items-center">
                                        * 已默认排除盛达企业 (ID 36)
                                    </p>
                                )}
                            </div>

                            <Button
                                className="w-full"
                                onClick={handleCalculate}
                                disabled={isCalculating || isLoadingUsers}
                            >
                                {isCalculating ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 计算中...</>
                                ) : (
                                    <><Calculator className="mr-2 h-4 w-4" /> 开始统计</>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Main Content */}
                    <div className="lg:col-span-3 space-y-6">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card className="bg-primary/5 border-primary/20">
                                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                                    <CardTitle className="text-sm font-medium text-muted-foreground">平台总结算金额 (已过滤)</CardTitle>
                                    <div className="text-xs text-muted-foreground">
                                        涉及税地: {statsData ? statsData.tax_address_stats.length : '-'}
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold text-primary">
                                        {isCalculating ? (
                                            <Skeleton className="h-9 w-32" />
                                        ) : (
                                            statsData ? formatCurrency(statsData.total_settlement) : '---'
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        {isCalculating ? (
                                            <Skeleton className="h-3 w-48" />
                                        ) : (
                                            `基于 ${selectedEnterpriseIds.length} 个企业的统计结果`
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                                    <CardTitle className="text-sm font-medium text-muted-foreground">平台总服务费</CardTitle>
                                    <div className="text-xs text-muted-foreground">
                                        涉及税地: {statsData ? statsData.tax_address_stats.length : '-'}
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold text-amber-600">
                                        {isCalculating ? (
                                            <Skeleton className="h-9 w-32" />
                                        ) : (
                                            statsData ? formatCurrency(statsData.total_service_amount) : '---'
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        所有已选企业的服务费总和
                                    </div>
                                </CardContent>
                            </Card>

                        </div>

                        {/* Monthly Histogram & Details */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">月度结算金额趋势与明细</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {isCalculating ? (
                                    <div className="space-y-2">
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                    </div>
                                ) : !statsData || !statsData.monthly_stats || statsData.monthly_stats.length === 0 ? (
                                    <div className="text-sm text-muted-foreground">暂无数据</div>
                                ) : (
                                    <ScrollArea className="h-[600px] pr-4">
                                        <div className="space-y-4">
                                            {statsData.monthly_stats.map((item) => (
                                                <MonthlyItem key={item.month} item={item} formatCurrency={formatCurrency} />
                                            ))}
                                        </div>
                                    </ScrollArea>
                                )}
                            </CardContent>
                        </Card>

                        {/* Detail Table */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div className="space-y-1">
                                    <CardTitle>税地未开发票金额统计</CardTitle>
                                    <p className="text-sm text-muted-foreground">
                                        按税地维度展示已开票与未开票金额分布
                                    </p>
                                </div>
                                <BarChart3 className="w-5 h-5 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-50">
                                                <TableHead>税地名称</TableHead>
                                                <TableHead className="text-right">未开票金额</TableHead>
                                                <TableHead className="text-right">已开票金额</TableHead>
                                                <TableHead className="text-right">未开票占比</TableHead>
                                                <TableHead className="text-right">总金额</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isCalculating ? (
                                                Array.from({ length: 5 }).map((_, i) => (
                                                    <TableRow key={i}>
                                                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                                        <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                                                        <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                                                        <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                                                        <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                                                    </TableRow>
                                                ))
                                            ) : !statsData ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                                        请点击“开始统计”查看数据
                                                    </TableCell>
                                                </TableRow>
                                            ) : statsData.tax_address_stats.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                                        暂无数据
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                statsData.tax_address_stats.map((row) => (
                                                    <TableRow key={row.tax_id}>
                                                        <TableCell className="font-medium max-w-[200px] truncate" title={row.tax_address}>
                                                            {row.tax_address}
                                                            <div className="text-xs text-muted-foreground font-normal">ID: {row.tax_id}</div>
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-amber-600 font-medium">
                                                            {formatCurrency(row.uninvoiced_amount)}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-emerald-600">
                                                            {formatCurrency(row.invoiced_amount)}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {row.total_amount > 0
                                                                ? `${((row.uninvoiced_amount / row.total_amount) * 100).toFixed(1)}%`
                                                                : '0.0%'}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono">
                                                            {formatCurrency(row.total_amount)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Enterprise Detail Table */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div className="space-y-1">
                                    <CardTitle>企业维度未开票金额统计</CardTitle>
                                    <p className="text-sm text-muted-foreground">
                                        展示各企业在不同税地的开票情况
                                    </p>
                                </div>
                                <BarChart3 className="w-5 h-5 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-50">
                                                <TableHead>企业名称</TableHead>
                                                <TableHead>税地名称</TableHead>
                                                <TableHead className="text-right">未开票金额</TableHead>
                                                <TableHead className="text-right">已开票金额</TableHead>
                                                <TableHead className="text-right">未开票占比</TableHead>
                                                <TableHead className="text-right">总金额</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isCalculating ? (
                                                Array.from({ length: 5 }).map((_, i) => (
                                                    <TableRow key={i}>
                                                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                                        <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                                                        <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                                                        <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                                                        <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                                                    </TableRow>
                                                ))
                                            ) : !statsData ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                                        请点击“开始统计”查看数据
                                                    </TableCell>
                                                </TableRow>
                                            ) : (!statsData.enterprise_stats || statsData.enterprise_stats.length === 0) ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                                        暂无数据
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                statsData.enterprise_stats.map((row, index) => (
                                                    <TableRow key={index}>
                                                        <TableCell className="font-medium max-w-[200px] truncate" title={row.enterprise_name}>
                                                            {row.enterprise_name}
                                                        </TableCell>
                                                        <TableCell className="max-w-[200px] truncate" title={row.tax_address}>
                                                            {row.tax_address}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-amber-600 font-medium">
                                                            {formatCurrency(row.uninvoiced_amount)}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-emerald-600">
                                                            {formatCurrency(row.invoiced_amount)}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {row.total_amount > 0
                                                                ? `${((row.uninvoiced_amount / row.total_amount) * 100).toFixed(1)}%`
                                                                : '0.0%'}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono">
                                                            {formatCurrency(row.total_amount)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
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
        <div className="border rounded-md overflow-hidden bg-white">
            <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center space-x-2">
                    <span className="font-medium text-slate-800">{item.month}</span>
                    <Badge variant="secondary" className="text-xs font-normal">
                        {item.details.length} 条记录
                    </Badge>
                </div>
                <div className="flex items-center space-x-4">
                    <div className="flex flex-col items-end">
                        <span className="font-mono font-bold text-primary">
                            {formatCurrency(item.amount)}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                            服务费: {formatCurrency(item.service_amount)}
                        </span>
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </div>
            </div>

            {/* Progress Bar (Visible always as a summary) */}
            <div className="px-3 pb-2">
                {/*  We don't know global max here, so just a subtle line or maybe nothing. 
                      User asked for "breakdown below". Let's just keep the collapse logic. */}
            </div>

            {isOpen && (
                <div className="border-t bg-slate-50/50 p-3">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="h-8">企业名称</TableHead>
                                <TableHead className="h-8">税地名称</TableHead>
                                <TableHead className="h-8 text-right">总金额</TableHead>
                                <TableHead className="h-8 text-right">总服务费</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {item.details.map((detail, idx) => (
                                <TableRow key={idx} className="hover:bg-slate-100/50">
                                    <TableCell className="py-2 text-xs font-medium">{detail.enterprise_name}</TableCell>
                                    <TableCell className="py-2 text-xs text-muted-foreground">{detail.tax_address}</TableCell>
                                    <TableCell className="py-2 text-xs text-right font-mono">
                                        {formatCurrency(detail.total_amount)}
                                    </TableCell>
                                    <TableCell className="py-2 text-xs text-right font-mono">
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

// Ensure proper exports and closing braces
export { PaymentStatsScript }; // Re-export if needed, or just let default export handle it.
