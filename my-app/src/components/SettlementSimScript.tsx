import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from '@/lib/toast';
import { ArrowLeft, Loader2, Play, AlertTriangle } from 'lucide-react';

import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { getApiBaseUrl } from '../lib/api';
import { getScriptHubAuthHeaderRecord } from '../lib/auth';
import { useI18n } from '../lib/i18n';

interface SettlementSimResponse {
    success: boolean;
    affected_rows: number;
    pay_over_time: string;
    message: string;
}

type Mode = 'batch_no' | 'balance_no' | 'batch_no_tax' | 'balance_no_tax';

export default function SettlementSimScript({ onBack }: { onBack: () => void }) {
    const { t } = useI18n();
    const tr = t.scripts.settlementSim;

    // 环境状态
    const [environment, setEnvironment] = useState<'test' | 'prod'>('test');

    // Tab 状态
    const [activeTab, setActiveTab] = useState<Mode>('batch_no');

    // 执行状态
    const [isExecuting, setIsExecuting] = useState(false);

    // 结果状态
    const [result1, setResult1] = useState<SettlementSimResponse | null>(null);
    const [result2, setResult2] = useState<SettlementSimResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Tab 1/2 勾选框
    const [writeTaxChecked, setWriteTaxChecked] = useState(false);

    // 表单值
    const [batchNo, setBatchNo] = useState('');
    const [balanceNo, setBalanceNo] = useState('');
    const [payStatusBatch, setPayStatusBatch] = useState(4);
    const [payStatusWorker, setPayStatusWorker] = useState(3);
    const [year, setYear] = useState('');
    const [month, setMonth] = useState('');

    // 校验函数
    const validateYear = (y: string) => {
        if (!y) return true;
        return /^\d{4}$/.test(y) && Number(y) >= 2000 && Number(y) <= 2100;
    };

    const validateMonth = (m: string) => {
        if (!m) return true;
        const num = Number(m);
        return num >= 1 && num <= 12;
    };

    const canExecute = useCallback(() => {
        if (isExecuting) return false;

        if (activeTab === 'batch_no') {
            if (!batchNo.trim()) return false;
            if (!validateYear(year)) return false;
            if (!validateMonth(month)) return false;
        } else if (activeTab === 'balance_no') {
            if (!balanceNo.trim()) return false;
            if (!validateYear(year)) return false;
            if (!validateMonth(month)) return false;
        } else if (activeTab === 'batch_no_tax') {
            if (!batchNo.trim()) return false;
            if (!validateYear(year)) return false;
            if (!validateMonth(month)) return false;
        } else if (activeTab === 'balance_no_tax') {
            if (!balanceNo.trim()) return false;
            if (!validateYear(year)) return false;
            if (!validateMonth(month)) return false;
        }
        return true;
    }, [activeTab, batchNo, balanceNo, year, month, isExecuting]);

    // 执行函数
    const execute = useCallback(async () => {
        const baseUrl = getApiBaseUrl();
        if (!baseUrl) return;

        setIsExecuting(true);
        setResult1(null);
        setResult2(null);
        setError(null);

        const yearNum = year ? Number(year) : undefined;
        const monthNum = month ? Number(month) : undefined;

        try {
            if (activeTab === 'batch_no' && writeTaxChecked) {
                // Tab 1 + 勾选：先 batch_no，再 batch_no_tax
                const res1 = await axios.post<SettlementSimResponse>(
                    `${baseUrl}/settlement-sim/execute`,
                    {
                        env: environment,
                        mode: 'batch_no',
                        batch_no: batchNo,
                        pay_status_batch: payStatusBatch,
                        pay_status_worker: payStatusWorker,
                        year: yearNum,
                        month: monthNum,
                    },
                    { headers: getScriptHubAuthHeaderRecord() }
                );
                setResult1(res1.data);

                if (!res1.data.success) {
                    setError(res1.data.message);
                    return;
                }

                // 第二次请求
                const res2 = await axios.post<SettlementSimResponse>(
                    `${baseUrl}/settlement-sim/execute`,
                    {
                        env: environment,
                        mode: 'batch_no_tax',
                        batch_no: batchNo,
                        year: yearNum,
                        month: monthNum,
                    },
                    { headers: getScriptHubAuthHeaderRecord() }
                );
                setResult2(res2.data);

                if (!res2.data.success) {
                    setError(res2.data.message);
                    return;
                }

                toast.success(tr.messages.success);

            } else if (activeTab === 'balance_no' && writeTaxChecked) {
                // Tab 2 + 勾选：先 balance_no，再 balance_no_tax
                const res1 = await axios.post<SettlementSimResponse>(
                    `${baseUrl}/settlement-sim/execute`,
                    {
                        env: environment,
                        mode: 'balance_no',
                        balance_no: balanceNo,
                        pay_status_worker: payStatusWorker,
                        year: yearNum,
                        month: monthNum,
                    },
                    { headers: getScriptHubAuthHeaderRecord() }
                );
                setResult1(res1.data);

                if (!res1.success) {
                    setError(res1.data.message);
                    return;
                }

                // 第二次请求
                const res2 = await axios.post<SettlementSimResponse>(
                    `${baseUrl}/settlement-sim/execute`,
                    {
                        env: environment,
                        mode: 'balance_no_tax',
                        balance_no: balanceNo,
                        year: yearNum,
                        month: monthNum,
                    },
                    { headers: getScriptHubAuthHeaderRecord() }
                );
                setResult2(res2.data);

                if (!res2.data.success) {
                    setError(res2.data.message);
                    return;
                }

                toast.success(tr.messages.success);

            } else {
                // 不勾选或 Tab 3/4：单次请求
                let requestData: Record<string, unknown> = {
                    env: environment,
                    mode: activeTab,
                    year: yearNum,
                    month: monthNum,
                };

                if (activeTab === 'batch_no') {
                    requestData.batch_no = batchNo;
                    requestData.pay_status_batch = payStatusBatch;
                    requestData.pay_status_worker = payStatusWorker;
                } else if (activeTab === 'balance_no') {
                    requestData.balance_no = balanceNo;
                    requestData.pay_status_worker = payStatusWorker;
                } else if (activeTab === 'batch_no_tax') {
                    requestData.batch_no = batchNo;
                } else if (activeTab === 'balance_no_tax') {
                    requestData.balance_no = balanceNo;
                }

                const response = await axios.post<SettlementSimResponse>(
                    `${baseUrl}/settlement-sim/execute`,
                    requestData,
                    { headers: getScriptHubAuthHeaderRecord() }
                );
                setResult1(response.data);

                if (!response.data.success) {
                    setError(response.data.message);
                    return;
                }

                toast.success(tr.messages.success);
            }
        } catch (err) {
            if (axios.isAxiosError(err)) {
                const errorMsg = err.response?.data?.detail || err.message;
                setError(errorMsg);
                toast.error(errorMsg);
            } else if (err instanceof Error) {
                setError(err.message);
                toast.error(err.message);
            }
        } finally {
            setIsExecuting(false);
        }
    }, [activeTab, environment, batchNo, balanceNo, payStatusBatch, payStatusWorker, year, month, writeTaxChecked, tr]);

    // 重置结果
    const handleTabChange = (value: string) => {
        setActiveTab(value as Mode);
        setResult1(null);
        setResult2(null);
        setError(null);
    };

    // 环境变化时重置
    const handleEnvironmentChange = (value: 'test' | 'prod') => {
        setEnvironment(value);
        setResult1(null);
        setResult2(null);
        setError(null);
    };

    return (
        <div className="min-h-screen p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <Button variant="ghost" onClick={onBack}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        {tr.back}
                    </Button>
                    <Badge variant={isExecuting ? 'destructive' : 'secondary'}>
                        {isExecuting ? tr.executing : tr.ready}
                    </Badge>
                </div>

                {/* Title */}
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">{tr.title}</h1>
                    <p className="text-muted-foreground">
                        {tr.description}
                    </p>
                </div>

                {/* 环境切换 */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="space-y-2">
                                <Label>{tr.environment}</Label>
                                <Select value={environment} onValueChange={(v) => handleEnvironmentChange(v as 'test' | 'prod')}>
                                    <SelectTrigger className="w-[180px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="test">{tr.envTest}</SelectItem>
                                        <SelectItem value="prod">{tr.envProd}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {environment === 'prod' && (
                                <div className="flex items-center gap-2 text-red-600">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span className="text-sm font-medium">{tr.prodWarning}</span>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Tabs */}
                <Card>
                    <CardHeader>
                        <CardTitle>{tr.tabs.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Tabs value={activeTab} onValueChange={handleTabChange}>
                            <TabsList className="grid w-full grid-cols-4">
                                <TabsTrigger value="batch_no">{tr.tabs.batchUpdate}</TabsTrigger>
                                <TabsTrigger value="balance_no">{tr.tabs.balanceUpdate}</TabsTrigger>
                                <TabsTrigger value="batch_no_tax">{tr.tabs.batchTaxWrite}</TabsTrigger>
                                <TabsTrigger value="balance_no_tax">{tr.tabs.balanceTaxWrite}</TabsTrigger>
                            </TabsList>

                            {/* Tab 1: 按批次更新状态 */}
                            <TabsContent value="batch_no" className="space-y-6 mt-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="batch_no">{tr.fields.batchNo} *</Label>
                                        <Input
                                            id="batch_no"
                                            value={batchNo}
                                            onChange={(e) => setBatchNo(e.target.value)}
                                            placeholder="ZDPC-xxx"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="pay_status_batch">{tr.fields.batchStatus}</Label>
                                        <Input
                                            id="pay_status_batch"
                                            type="number"
                                            value={payStatusBatch}
                                            onChange={(e) => setPayStatusBatch(Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="pay_status_worker">{tr.fields.workerStatus}</Label>
                                        <Input
                                            id="pay_status_worker"
                                            type="number"
                                            value={payStatusWorker}
                                            onChange={(e) => setPayStatusWorker(Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="year">{tr.fields.year} ({tr.optional})</Label>
                                        <Input
                                            id="year"
                                            type="number"
                                            value={year}
                                            onChange={(e) => setYear(e.target.value)}
                                            placeholder="2026"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="month">{tr.fields.month} ({tr.optional})</Label>
                                        <Input
                                            id="month"
                                            type="number"
                                            value={month}
                                            onChange={(e) => setMonth(e.target.value)}
                                            placeholder="1-12"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="write_tax"
                                        checked={writeTaxChecked}
                                        onCheckedChange={(checked) => setWriteTaxChecked(checked as boolean)}
                                    />
                                    <Label htmlFor="write_tax" className="cursor-pointer">
                                        {tr.fields.writeTax}
                                    </Label>
                                </div>
                            </TabsContent>

                            {/* Tab 2: 按结算单更新状态 */}
                            <TabsContent value="balance_no" className="space-y-6 mt-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="balance_no">{tr.fields.balanceNo} *</Label>
                                        <Input
                                            id="balance_no"
                                            value={balanceNo}
                                            onChange={(e) => setBalanceNo(e.target.value)}
                                            placeholder="JSZD-xxx"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="pay_status_worker2">{tr.fields.workerStatus}</Label>
                                        <Input
                                            id="pay_status_worker2"
                                            type="number"
                                            value={payStatusWorker}
                                            onChange={(e) => setPayStatusWorker(Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="year2">{tr.fields.year} ({tr.optional})</Label>
                                        <Input
                                            id="year2"
                                            type="number"
                                            value={year}
                                            onChange={(e) => setYear(e.target.value)}
                                            placeholder="2026"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="month2">{tr.fields.month} ({tr.optional})</Label>
                                        <Input
                                            id="month2"
                                            type="number"
                                            value={month}
                                            onChange={(e) => setMonth(e.target.value)}
                                            placeholder="1-12"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="write_tax2"
                                        checked={writeTaxChecked}
                                        onCheckedChange={(checked) => setWriteTaxChecked(checked as boolean)}
                                    />
                                    <Label htmlFor="write_tax2" className="cursor-pointer">
                                        {tr.fields.writeTax}
                                    </Label>
                                </div>
                            </TabsContent>

                            {/* Tab 3: 批次个税写入 */}
                            <TabsContent value="batch_no_tax" className="space-y-6 mt-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="batch_no_tax">{tr.fields.batchNo} *</Label>
                                        <Input
                                            id="batch_no_tax"
                                            value={batchNo}
                                            onChange={(e) => setBatchNo(e.target.value)}
                                            placeholder="ZDPC-xxx"
                                        />
                                    </div>
                                </div>
                            </TabsContent>

                            {/* Tab 4: 结算单个税写入 */}
                            <TabsContent value="balance_no_tax" className="space-y-6 mt-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="balance_no_tax">{tr.fields.balanceNo} *</Label>
                                        <Input
                                            id="balance_no_tax"
                                            value={balanceNo}
                                            onChange={(e) => setBalanceNo(e.target.value)}
                                            placeholder="JSZD-xxx"
                                        />
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>

                        {/* 执行按钮 */}
                        <div className="mt-6 flex justify-end">
                            <Button onClick={execute} disabled={!canExecute()}>
                                {isExecuting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        {tr.executing}
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-4 h-4 mr-2" />
                                        {tr.execute}
                                    </>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 结果展示 */}
                {(result1 || result2 || error) && (
                    <Card>
                        <CardHeader>
                            <CardTitle>{tr.resultTitle}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {error && (
                                <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
                                    {tr.resultError}: {error}
                                </div>
                            )}

                            {result1 && (
                                <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                                    <p className="font-medium text-green-800">{tr.resultStep1}</p>
                                    <p>{tr.resultAffected}: {result1.affected_rows}</p>
                                    <p>{tr.resultTime}: {result1.pay_over_time}</p>
                                    {writeTaxChecked && result1.message && (
                                        <p className="text-sm text-green-600">{result1.message}</p>
                                    )}
                                </div>
                            )}

                            {result2 && (
                                <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                                    <p className="font-medium text-green-800">{tr.resultStep2}</p>
                                    <p>{tr.resultAffected}: {result2.affected_rows}</p>
                                    <p>{tr.resultTime}: {result2.pay_over_time}</p>
                                    {result2.message && (
                                        <p className="text-sm text-green-600">{result2.message}</p>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
