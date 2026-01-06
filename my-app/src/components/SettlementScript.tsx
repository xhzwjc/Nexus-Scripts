import React, {useEffect, useMemo, useRef, useState} from 'react';
import axios from 'axios';
import {toast} from 'sonner';
import {Card, CardContent, CardHeader, CardTitle} from './ui/card';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Label} from './ui/label';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from './ui/select';
import {Badge} from './ui/badge';
import {ScrollArea} from './ui/scroll-area';
import {Separator} from './ui/separator';
import {ArrowLeft, Plus, Trash2, Play, Square, RefreshCw, Clock, Info, Loader2, Copy, Trash} from 'lucide-react';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from './ui/tooltip';
import {getApiBaseUrl} from '../lib/api';

interface Enterprise {
    id: string;
    name: string;
    token: string;
    tenantId: string;
    taxId: string;
    items1: string; // 逗号分隔
    items2: string; // 逗号分隔
    items3: string; // 批次号:结算单1,结算单2;批次号2:结算单3
}

type LogLevel = 'INFO' | 'DEBUG' | 'SUCCESS' | 'ERROR';

interface LogItem {
    ts: string;   // HH:mm:ss
    level: LogLevel;
    text: string;
}

// 服务端错误体的轻量类型（兼容 detail/message）
type MaybeApiError = {
    detail?: string;
    message?: string;
};

// 解析 Items3
const parseItems3 = (input: string): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    if (!input || !input.trim()) return result;
    input.split(';').filter(b => b.trim()).forEach(batch => {
        const [batchNo, balancesStr] = batch.split(':').map(s => s.trim());
        if (batchNo && balancesStr) {
            const arr = balancesStr.split(',').map(b => b.trim()).filter(Boolean);
            if (arr.length > 0) result[batchNo] = arr;
        }
    });
    return result;
};

const nowTime = () => new Date().toLocaleTimeString();

export default function SettlementScript({onBack}: { onBack: () => void }) {
    // 执行参数
    const [mode, setMode] = useState<number | null>(null);
    const [concurrency, setConcurrency] = useState('10');
    const [intervalSeconds, setIntervalSeconds] = useState('1'); // 0=并发，>0=顺序
    const [environment, setEnvironment] = useState('test');

    // 数据与状态
    const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<LogItem[]>([]);

    // 日志滚动容器 & 是否跟随底部
    const logViewportRef = useRef<HTMLDivElement | null>(null);
    const [stickBottom, setStickBottom] = useState(true);

    // 请求中止器
    const abortRef = useRef<AbortController | null>(null);

    // 模式判断
    const interval = useMemo(() => Math.max(0, parseFloat(intervalSeconds) || 0), [intervalSeconds]);
    const isConcurrent = interval === 0;

    // 规范化并发数（仅并发模式使用）
    const normalizedConcurrency = useMemo(() => {
        const n = parseInt(concurrency, 10);
        if (!Number.isFinite(n) || n < 1) return 1;
        if (n > 50) return 50;
        return n;
    }, [concurrency]);

    // 日志工具
    const addLog = (level: LogLevel, text: string) => {
        setLogs(prev => {
            const next = [...prev, {ts: nowTime(), level, text}];
            // 限制最多 1000 条，避免无限增长
            if (next.length > 1000) next.shift();
            return next;
        });
    };

    // 企业项操作
    const addEnterprise = () =>
        setEnterprises(prev => [
            ...prev,
            {
                id: Date.now().toString(),
                name: '',
                token: '',
                tenantId: '',
                taxId: '',
                items1: '',
                items2: '',
                items3: ''
            },
        ]);

    const removeEnterprise = (id: string) => setEnterprises(prev => prev.filter(e => e.id !== id));

    const updateEnterprise = (id: string, field: keyof Enterprise, value: string) =>
        setEnterprises(prev => prev.map(e => (e.id === id ? {...e, [field]: value} : e)));

    // 停止执行
    const stopExecution = () => {
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
        setIsRunning(false);
        addLog('INFO', '收到停止指令，已尝试中止请求');
        toast.info('已请求停止');
    };

    // 返回确认（执行中防误触）
    const handleBack = () => {
        if (!isRunning) return onBack();
        const ok = window.confirm('任务仍在执行中，确定要返回吗？这不会取消后台任务。');
        if (ok) onBack();
    };

    // 当日志变化时，仅在“跟随底部”状态下滚动内部容器，不滚动页面
    useEffect(() => {
        const el = logViewportRef.current;
        if (!el || !stickBottom) return;
        el.scrollTop = el.scrollHeight;
    }, [logs, stickBottom]);

    // 监听用户在日志区域的滚动，判断是否靠近底部
    const onLogScroll = () => {
        const el = logViewportRef.current;
        if (!el) return;
        const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        setStickBottom(distanceToBottom < 40); // 40px 阈值
    };

    // 执行
    const startExecution = async () => {
        const base = getApiBaseUrl();
        if (!base) return;

        // 基本校验
        if (mode === null) return toast.error('请选择执行模式');
        if (enterprises.length === 0) return toast.error('请至少添加一个企业');

        for (const [index, e] of enterprises.entries()) {
            const nth = index + 1;
            if (!e.token || !e.tenantId || !e.taxId) {
                return toast.error(`企业 ${nth} 的基础信息（Token、Tenant ID、Tax ID）未填写完整`);
            }
            if (mode === 1 && !e.items1.trim()) {
                return toast.error(`企业 ${nth} 在模式 1 下需填写 Items1（逗号分隔批次号）`);
            }
            if (mode === 2 && !e.items2.trim()) {
                return toast.error(`企业 ${nth} 在模式 2 下需填写 Items2（逗号分隔批次号）`);
            }
            if (mode === 3) {
                if (!e.items3.trim()) {
                    return toast.error(`企业 ${nth} 在模式 3 下需填写 Items3（批次号:结算单1,结算单2;批次号2:结算单3）`);
                }
                const parsed = parseItems3(e.items3);
                if (Object.keys(parsed).length === 0) {
                    return toast.error(`企业 ${nth} 的 Items3 格式不正确，请按示例填写：批次A:单1,单2;批次B:单3`);
                }
            }
        }

        // 构造请求体
        const requestBody = {
            enterprises: enterprises.map(e => ({
                name: e.name,
                token: e.token,
                tenant_id: e.tenantId,
                tax_id: e.taxId,
                items1: e.items1.split(',').map(i => i.trim()).filter(Boolean),
                items2: e.items2.split(',').map(i => i.trim()).filter(Boolean),
                items3: parseItems3(e.items3),
            })),
            mode,
            concurrent_workers: isConcurrent ? normalizedConcurrency : 1,
            interval_seconds: interval, // 0 并发；>0 顺序间隔
            environment,
        };

        // 启动前置
        setIsRunning(true);
        setLogs([{ts: nowTime(), level: 'INFO', text: '开始执行结算处理脚本...'}]);
        toast.info('执行已开始...');
        addLog('DEBUG', `请求体:\n${JSON.stringify(requestBody, null, 2)}`);

        // 设置中止器
        if (abortRef.current) {
            abortRef.current.abort();
        }
        abortRef.current = new AbortController();

        try {
            const resp = await axios.post(`${base}/settlement/process`, requestBody, {
                signal: abortRef.current.signal,
                // 如需超时：timeout: 1000 * 60 * 10,
            });
            addLog('SUCCESS', `执行完成:\n${JSON.stringify(resp.data, null, 2)}`);
            toast.success('脚本执行成功');
        } catch (err: unknown) {
            if (axios.isCancel(err)) {
                addLog('INFO', '请求已被取消');
                toast.info('请求已取消');
            } else if (axios.isAxiosError(err)) {
                let errorMsg = err.message;
                const data = err.response?.data;

                if (data instanceof Blob) {
                    try {
                        const text = await data.text();
                        try {
                            const json = JSON.parse(text) as MaybeApiError;
                            errorMsg = json.detail ?? json.message ?? text ?? errorMsg;
                        } catch {
                            errorMsg = text || errorMsg;
                        }
                    } catch {
                        // ignore
                    }
                } else if (data && typeof data === 'object') {
                    const json = data as MaybeApiError;
                    errorMsg = json.detail ?? json.message ?? errorMsg;
                }

                addLog('ERROR', errorMsg);
                toast.error(`执行失败: ${errorMsg}`);
            } else {
                const msg = err instanceof Error ? err.message : '未知错误';
                addLog('ERROR', msg);
                toast.error(`执行失败: ${msg}`);
            }
        } finally {
            setIsRunning(false);
            addLog('INFO', '执行结束');
            abortRef.current = null;
        }
    };

    // 清空/复制日志
    const clearLogs = () => setLogs([]);
    const copyLogs = async () => {
        const text = logs.map(l => `[${l.ts}] [${l.level}] ${l.text}`).join('\n');
        try {
            await navigator.clipboard.writeText(text);
            toast.success('日志已复制到剪贴板');
        } catch {
            toast.error('复制失败，请手动选择文本复制');
        }
    };

    return (
        <div className="min-h-screen colorful-background">
            <div className="max-w-6xl mx-auto">
                <div className="mb-6">
                    <Button variant="ghost" onClick={handleBack} className="mb-4">
                        <ArrowLeft className="w-4 h-4 mr-2"/>返回脚本列表
                    </Button>

                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl">结算处理脚本</h1>
                        <Badge variant={isRunning ? 'destructive' : 'secondary'}>{isRunning ? '运行中' : '就绪'}</Badge>
                        <Badge variant={isConcurrent ? 'outline' : 'secondary'} className="flex items-center gap-1">
                            {isConcurrent ? <RefreshCw className="w-3 h-3"/> : <Clock className="w-3 h-3"/>}
                            {isConcurrent ? '并发' : '顺序'}模式
                        </Badge>
                        <Badge variant="secondary">环境：{environment === 'prod' ? '生产' : 'Beta'}</Badge>
                    </div>
                    <p className="text-muted-foreground">批量处理企业结算任务，支持并发执行和实时监控</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* 左侧表单 */}
                    <div className="lg:col-span-2 space-y-6">
                        <Card>
                            <CardHeader><CardTitle>执行参数配置</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <Label>执行模式 <span className="text-red-500">*</span></Label>
                                        <Select value={mode?.toString() || ''}
                                                onValueChange={(v) => setMode(v ? parseInt(v) : null)}>
                                            <SelectTrigger><SelectValue placeholder="选择模式"/></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">1 - 发起结算</SelectItem>
                                                <SelectItem value="2">2 - 重新发起</SelectItem>
                                                <SelectItem value="3">3 - 单个结算单</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>并发数</Label>
                                        <Input
                                            type="number"
                                            value={concurrency}
                                            onChange={(e) => setConcurrency(e.target.value)}
                                            min="1" max="50"
                                            disabled={!isConcurrent || isRunning}
                                            placeholder="1-50"
                                        />
                                        {!isConcurrent &&
                                            <p className="text-xs text-muted-foreground mt-1">顺序模式下不使用并发数</p>}
                                    </div>
                                    <div>
                                        <Label className="flex items-center gap-1">
                                            执行间隔(秒)
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Info className="w-4 h-4 text-blue-500 cursor-help"/>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>0 表示并发执行；大于 0 表示顺序执行，每个任务之间的间隔秒数</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </Label>
                                        <Input
                                            type="number"
                                            value={intervalSeconds}
                                            onChange={(e) => setIntervalSeconds(e.target.value)}
                                            min="0" step="0.1"
                                            disabled={isRunning}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <Label>运行环境 <span className="text-red-500">*</span></Label>
                                    <Select value={environment} onValueChange={setEnvironment}>
                                        <SelectTrigger><SelectValue placeholder="选择环境"/></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="test">Beta</SelectItem>
                                            <SelectItem value="prod">生产环境</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>企业配置</CardTitle>
                                    <Button onClick={addEnterprise} size="sm" disabled={isRunning}>
                                        <Plus className="w-4 h-4 mr-2"/>添加企业
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {enterprises.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <p>点击“添加企业”开始配置</p>
                                        <p className="text-xs mt-1">模式 1/2：Items 逗号分隔；模式
                                            3：批次号:结算单1,结算单2;批次号2:结算单3</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {enterprises.map((e, index) => (
                                            <Card key={e.id} className="border-dashed">
                                                <CardHeader className="pb-3">
                                                    <div className="flex items-center justify-between">
                                                        <h4>企业 {index + 1} {e.name && `- ${e.name}`}</h4>
                                                        <Button variant="ghost" size="sm"
                                                                onClick={() => removeEnterprise(e.id)}
                                                                disabled={isRunning} aria-label="删除企业">
                                                            <Trash2 className="w-4 h-4"/>
                                                        </Button>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="space-y-3">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <div>
                                                            <Label>企业名称</Label>
                                                            <Input
                                                                value={e.name}
                                                                onChange={(ev) => updateEnterprise(e.id, 'name', ev.target.value)}
                                                                placeholder="请输入企业名称"
                                                                disabled={isRunning}
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label>Token <span className="text-red-500">*</span></Label>
                                                            <Input
                                                                value={e.token}
                                                                onChange={(ev) => updateEnterprise(e.id, 'token', ev.target.value)}
                                                                placeholder="请填写企业 Token"
                                                                type="password"
                                                                disabled={isRunning}
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label>Tenant ID <span
                                                                className="text-red-500">*</span></Label>
                                                            <Input
                                                                value={e.tenantId}
                                                                onChange={(ev) => updateEnterprise(e.id, 'tenantId', ev.target.value)}
                                                                placeholder="请填写企业对应的租户 ID"
                                                                disabled={isRunning}
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label>Tax ID <span
                                                                className="text-red-500">*</span></Label>
                                                            <Input
                                                                value={e.taxId}
                                                                onChange={(ev) => updateEnterprise(e.id, 'taxId', ev.target.value)}
                                                                placeholder="请输入税地 ID"
                                                                disabled={isRunning}
                                                            />
                                                        </div>
                                                    </div>

                                                    <Separator/>

                                                    <div className="space-y-3">
                                                        <div
                                                            className={mode === 1 ? 'border-l-2 border-blue-500 pl-2' : ''}>
                                                            <Label>
                                                                Items1 (模式 1) {mode === 1 &&
                                                                <span className="text-red-500">*</span>}
                                                            </Label>
                                                            <Input
                                                                value={e.items1}
                                                                onChange={(ev) => updateEnterprise(e.id, 'items1', ev.target.value)}
                                                                placeholder="批次号1,批次号2（逗号分隔）"
                                                                disabled={isRunning}
                                                            />
                                                        </div>
                                                        <div
                                                            className={mode === 2 ? 'border-l-2 border-blue-500 pl-2' : ''}>
                                                            <Label>
                                                                Items2 (模式 2) {mode === 2 &&
                                                                <span className="text-red-500">*</span>}
                                                            </Label>
                                                            <Input
                                                                value={e.items2}
                                                                onChange={(ev) => updateEnterprise(e.id, 'items2', ev.target.value)}
                                                                placeholder="批次号1,批次号2（逗号分隔）"
                                                                disabled={isRunning}
                                                            />
                                                        </div>
                                                        <div
                                                            className={mode === 3 ? 'border-l-2 border-blue-500 pl-2' : ''}>
                                                            <Label>
                                                                Items3 (模式 3) {mode === 3 &&
                                                                <span className="text-red-500">*</span>}
                                                            </Label>
                                                            <Input
                                                                value={e.items3}
                                                                onChange={(ev) => updateEnterprise(e.id, 'items3', ev.target.value)}
                                                                placeholder="批次A:单1,单2;批次B:单3"
                                                                disabled={isRunning}
                                                            />
                                                            <p className="text-xs text-muted-foreground mt-1">示例：BATCH001:SETT1001,SETT1002;BATCH002:SETT2001</p>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="pt-6">
                                {isRunning ? (
                                    <div className="flex gap-3">
                                        <Button variant="secondary" disabled className="flex-1">
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin"/>执行中...
                                        </Button>
                                        <Button onClick={stopExecution} variant="destructive" className="w-32">
                                            <Square className="w-4 h-4 mr-2"/>停止
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        onClick={startExecution}
                                        disabled={!mode || enterprises.length === 0}
                                        className="w-full"
                                    >
                                        <Play className="w-4 h-4 mr-2"/>开始执行
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* 右侧日志 */}
                    <div className="sticky top-6 self-start">
                        <Card className="h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
                            <CardHeader className="border-b">
                                <div className="flex items-center justify-between">
                                    <CardTitle>实时日志</CardTitle>
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="sm" onClick={copyLogs} aria-label="复制日志">
                                            <Copy className="w-4 h-4"/>
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={clearLogs} aria-label="清空日志">
                                            <Trash className="w-4 h-4"/>
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>

                            {/* 关键：flex-1 + min-h-0 */}
                            <CardContent className="p-0 overflow-hidden flex-1 min-h-0">
                                <div
                                    ref={logViewportRef}
                                    onScroll={onLogScroll}
                                    className="w-full h-full overflow-auto overscroll-contain p-4"
                                >
                                    <div className="space-y-3 px-1 max-w-full break-words whitespace-pre-wrap">
                                        {logs.length === 0 ? (
                                            <p className="text-muted-foreground">等待执行...</p>
                                        ) : (
                                            logs.map((log, i) => (
                                                <div key={i} className="text-xs font-mono">
                                                    <span className="text-muted-foreground">[{log.ts}]</span>
                                                    <span
                                                        className={`ml-2 ${log.level === 'ERROR'
                                                            ? 'text-red-500'
                                                            : log.level === 'SUCCESS'
                                                                ? 'text-green-500'
                                                                : log.level === 'DEBUG'
                                                                    ? 'text-blue-500'
                                                                    : ''
                                                        }`}
                                                    >
                                                        [{log.level}] {log.text}
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
