import React, {useState, useEffect} from 'react';
import axios from 'axios';
import {Toaster, toast} from 'sonner';
import {Card, CardContent, CardHeader, CardTitle} from './ui/card';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Label} from './ui/label';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from './ui/select';
import {Badge} from './ui/badge';
import {ScrollArea} from './ui/scroll-area';
import {Separator} from './ui/separator';
import {ArrowLeft, Plus, Trash2, Play, Square, AlertCircle, RefreshCw, Clock, Info, Loader2} from 'lucide-react';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from './ui/tooltip';

interface Enterprise {
    id: string;
    name: string;
    token: string;
    tenantId: string;
    taxId: string;
    items1: string;
    items2: string;
    items3: string;
}

const parseItems3 = (input: string): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    if (!input.trim()) return result;
    input.split(';').filter(b => b.trim()).forEach(batch => {
        const [batchNo, balancesStr] = batch.split(':').map(s => s.trim());
        if (batchNo && balancesStr) result[batchNo] = balancesStr.split(',').map(b => b.trim()).filter(Boolean);
    });
    return result;
};

export default function SettlementScript({onBack}: { onBack: () => void }) {
    const [mode, setMode] = useState<number | null>(null);
    const [concurrency, setConcurrency] = useState('10');
    const [intervalSeconds, setIntervalSeconds] = useState('1');
    const [environment, setEnvironment] = useState('test');
    const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);

    const isConcurrent = parseFloat(intervalSeconds) === 0;

    const addEnterprise = () => setEnterprises(prev => [...prev, {
        id: Date.now().toString(),
        name: '',
        token: '',
        tenantId: '',
        taxId: '',
        items1: '',
        items2: '',
        items3: ''
    }]);
    const removeEnterprise = (id: string) => setEnterprises(prev => prev.filter(e => e.id !== id));
    const updateEnterprise = (id: string, field: keyof Enterprise, value: string) => setEnterprises(prev => prev.map(e => e.id === id ? {
        ...e,
        [field]: value
    } : e));

    const startExecution = async () => {
        // Validation
        if (mode === null) return toast.error('请选择执行模式');
        if (enterprises.length === 0) return toast.error('请至少添加一个企业');
        for (const [index, e] of enterprises.entries()) {
            if (!e.token || !e.tenantId || !e.taxId) return toast.error(`企业 ${index + 1} 的基础信息（Token, Tenant ID, Tax ID）未填写完整`);
            if (mode === 1 && !e.items1.trim()) return toast.error(`企业 ${index + 1} 在模式1下需填写Items1`);
            if (mode === 2 && !e.items2.trim()) return toast.error(`企业 ${index + 1} 在模式2下需填写Items2`);
            if (mode === 3 && !e.items3.trim()) return toast.error(`企业 ${index + 1} 在模式3下需填写Items3`);
        }

        setIsRunning(true);
        setLogs(['[INFO] 开始执行结算处理脚本...']);
        toast.info('执行已开始...');

        try {
            const requestBody = {
                enterprises: enterprises.map(e => ({
                    name: e.name, token: e.token, tenant_id: e.tenantId, tax_id: e.taxId,
                    items1: e.items1.split(',').map(i => i.trim()).filter(Boolean),
                    items2: e.items2.split(',').map(i => i.trim()).filter(Boolean),
                    items3: parseItems3(e.items3)
                })),
                mode,
                concurrent_workers: parseInt(concurrency, 10),
                interval_seconds: parseFloat(intervalSeconds),
                environment
            };
            setLogs(prev => [...prev, `[DEBUG] 请求体: ${JSON.stringify(requestBody, null, 2)}`]);

            const response = await axios.post(`${process.env.NEXT_PUBLIC_API_BASE_URL}/settlement/process`, requestBody);

            setLogs(prev => [...prev, `[SUCCESS] 执行完成: ${JSON.stringify(response.data, null, 2)}`]);
            toast.success("脚本执行成功！");

        } catch (error) {
            const errorMsg = axios.isAxiosError(error) ? error.response?.data?.detail || error.message : error instanceof Error ? error.message : '未知错误';
            setLogs(prev => [...prev, `[ERROR] ${errorMsg}`]);
            toast.error(`执行失败: ${errorMsg}`);
        } finally {
            setIsRunning(false);
            setLogs(prev => [...prev, '[INFO] 执行结束']);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <Toaster richColors position="top-center"/>
            <div className="max-w-6xl mx-auto">
                <div className="mb-6">
                    <Button variant="ghost" onClick={onBack} className="mb-4"><ArrowLeft className="w-4 h-4 mr-2"/>返回脚本列表</Button>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl">结算处理脚本</h1>
                        <Badge variant={isRunning ? "destructive" : "secondary"}>{isRunning ? "运行中" : "就绪"}</Badge>
                        <Badge variant={isConcurrent ? "outline" : "secondary"}
                               className="flex items-center gap-1">{isConcurrent ? <RefreshCw className="w-3 h-3"/> :
                            <Clock className="w-3 h-3"/>} {isConcurrent ? '并发' : '顺序'}模式</Badge>
                    </div>
                    <p className="text-muted-foreground">批量处理企业结算任务，支持并发执行和实时监控</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <Card><CardHeader><CardTitle>执行参数配置</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div><Label>执行模式 <span className="text-red-500">*</span></Label><Select
                                        value={mode?.toString() || ''}
                                        onValueChange={(v) => setMode(v ? parseInt(v) : null)}><SelectTrigger><SelectValue
                                        placeholder="选择模式"/></SelectTrigger><SelectContent><SelectItem
                                        value="1">1-发起结算</SelectItem><SelectItem
                                        value="2">2-重新发起</SelectItem><SelectItem value="3">3-单个结算单</SelectItem></SelectContent></Select>
                                    </div>
                                    <div><Label>并发数</Label><Input type="number" value={concurrency}
                                                                     onChange={(e) => setConcurrency(e.target.value)}
                                                                     min="1" max="50" disabled={!isConcurrent}/></div>
                                    <div><Label
                                        className="flex items-center gap-1">执行间隔(秒)<TooltipProvider><Tooltip><TooltipTrigger
                                        asChild><Info
                                        className="w-4 h-4 text-blue-500 cursor-help"/></TooltipTrigger><TooltipContent>
                                        <p>0=并发, &gt;0=顺序</p>
                                    </TooltipContent></Tooltip></TooltipProvider></Label><Input type="number"
                                                                                                value={intervalSeconds}
                                                                                                onChange={(e) => setIntervalSeconds(e.target.value)}
                                                                                                min="0" step="0.1"/>
                                    </div>
                                </div>
                                <div><Label>运行环境 <span className="text-red-500">*</span></Label><Select
                                    value={environment} onValueChange={setEnvironment}><SelectTrigger><SelectValue
                                    placeholder="选择环境"/></SelectTrigger><SelectContent><SelectItem
                                    value="test">Beta</SelectItem><SelectItem
                                    value="prod">生产环境</SelectItem></SelectContent></Select></div>
                            </CardContent>
                        </Card>
                        <Card><CardHeader>
                            <div className="flex items-center justify-between"><CardTitle>企业配置</CardTitle><Button
                                onClick={addEnterprise} size="sm" disabled={isRunning}><Plus className="w-4 h-4 mr-2"/>添加企业</Button>
                            </div>
                        </CardHeader>
                            <CardContent>{enterprises.length === 0 ?
                                <div className="text-center py-8 text-muted-foreground">
                                    <p>点击&quot;添加企业&quot;开始配置</p>
                                </div> : <div className="space-y-4">{enterprises.map((e, index) => (
                                    <Card key={e.id} className="border-dashed"><CardHeader className="pb-3">
                                        <div className="flex items-center justify-between">
                                            <h4>企业 {index + 1} {e.name && `- ${e.name}`}</h4><Button variant="ghost"
                                                                                                       size="sm"
                                                                                                       onClick={() => removeEnterprise(e.id)}
                                                                                                       disabled={isRunning}><Trash2
                                            className="w-4 h-4"/></Button></div>
                                    </CardHeader>
                                        <CardContent className="space-y-3">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div><Label>企业名称</Label><Input value={e.name}
                                                                                   onChange={(ev) => updateEnterprise(e.id, 'name', ev.target.value)}
                                                                                   placeholder="请输入企业名称"
                                                                                   disabled={isRunning}/></div>
                                                <div><Label>Token <span className="text-red-500">*</span></Label><Input
                                                    value={e.token}
                                                    onChange={(ev) => updateEnterprise(e.id, 'token', ev.target.value)}
                                                    placeholder="请填写企业Token"
                                                    type="password" disabled={isRunning}/></div>
                                                <div><Label>Tenant ID <span
                                                    className="text-red-500">*</span></Label><Input value={e.tenantId}
                                                                                                    onChange={(ev) => updateEnterprise(e.id, 'tenantId', ev.target.value)}
                                                                                                    placeholder="请填写企业对应的租户ID"
                                                                                                    disabled={isRunning}/>
                                                </div>
                                                <div><Label>Tax ID <span className="text-red-500">*</span></Label><Input
                                                    value={e.taxId}
                                                    onChange={(ev) => updateEnterprise(e.id, 'taxId', ev.target.value)}
                                                    placeholder="请输入税地ID"
                                                    disabled={isRunning}/></div>
                                            </div>
                                            <Separator/>
                                            <div className="space-y-3">
                                                <div className={mode === 1 ? "border-l-2 border-blue-500 pl-2" : ""}>
                                                    <Label>Items1 (模式1) {mode === 1 &&
                                                        <span className="text-red-500">*</span>}</Label><Input
                                                    value={e.items1}
                                                    onChange={(ev) => updateEnterprise(e.id, 'items1', ev.target.value)}
                                                    placeholder="批次号,逗号分隔" disabled={isRunning}/></div>
                                                <div className={mode === 2 ? "border-l-2 border-blue-500 pl-2" : ""}>
                                                    <Label>Items2 (模式2) {mode === 2 &&
                                                        <span className="text-red-500">*</span>}</Label><Input
                                                    value={e.items2}
                                                    onChange={(ev) => updateEnterprise(e.id, 'items2', ev.target.value)}
                                                    placeholder="批次号,逗号分隔" disabled={isRunning}/></div>
                                                <div className={mode === 3 ? "border-l-2 border-blue-500 pl-2" : ""}>
                                                    <Label>Items3 (模式3) {mode === 3 &&
                                                        <span className="text-red-500">*</span>}</Label><Input
                                                    value={e.items3}
                                                    onChange={(ev) => updateEnterprise(e.id, 'items3', ev.target.value)}
                                                    placeholder="批次号:结算单1,结算单2;批次号2:结算单3"
                                                    disabled={isRunning}/></div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}</div>}</CardContent>
                        </Card>
                        <Card><CardContent className="pt-6"><Button onClick={startExecution}
                                                                    disabled={isRunning || !mode || enterprises.length === 0}
                                                                    className="w-full">{isRunning ? <><Loader2
                            className="w-4 h-4 mr-2 animate-spin"/>执行中...</> : <><Play
                            className="w-4 h-4 mr-2"/>开始执行</>}</Button></CardContent></Card>
                    </div>
                    <div className="sticky top-6 self-start">
                        <Card className="h-[calc(100vh-4rem)]"><CardHeader
                            className="border-b"><CardTitle>实时日志</CardTitle></CardHeader>
                            <CardContent><ScrollArea className="h-[calc(100vh-8rem)] w-full p-4">
                                <div className="space-y-4 px-1">{logs.length === 0 ?
                                    <p>等待执行...</p> : logs.map((log, i) => <div key={i}
                                                                                   className="text-xs font-mono break-all whitespace-pre-wrap">
                                        <span className="text-muted-foreground">{new Date().toLocaleTimeString()}</span><span
                                        className={`ml-2 block mt-1 ${log.includes('[ERROR]') ? 'text-red-500' : log.includes('[SUCCESS]') ? 'text-green-500' : ''}`}>{log}</span>
                                    </div>)}</div>
                            </ScrollArea></CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
