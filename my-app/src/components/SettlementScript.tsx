import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { ArrowLeft, Plus, Trash2, Play, Square, AlertCircle, RefreshCw, Clock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'; // 导入Tooltip组件
import { Info } from 'lucide-react'; // 导入信息图标

interface Enterprise {
    id: string;
    name: string;
    token: string;
    tenantId: string;
    taxId: string;
    items1: string; // 格式："批次1,批次2" → 数组
    items2: string; // 同上
    items3: string; // 格式："批次1:结算单1,结算单2;批次2:结算单3" → 对象
}

interface SettlementScriptProps {
    onBack: () => void;
}

// 解析items3为对象结构
const parseItems3 = (input: string): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    if (!input.trim()) return result;

    const batches = input.split(';').filter(b => b.trim());
    batches.forEach(batch => {
        const [batchNo, balancesStr] = batch.split(':').map(s => s.trim());
        if (!batchNo || !balancesStr) return;
        const balances = balancesStr.split(',').map(b => b.trim()).filter(Boolean);
        result[batchNo] = balances;
    });
    return result;
};

export default function SettlementScript({ onBack }: SettlementScriptProps) {
    // 状态管理
    const [mode, setMode] = useState<number | null>(null); // 1:发起结算, 2:重新发起, 3:单个结算单
    const [concurrency, setConcurrency] = useState('10');
    const [intervalSeconds, setIntervalSeconds] = useState('1');
    const [environment, setEnvironment] = useState('test');
    const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

    // 核心逻辑：判断执行模式（并发/顺序）
    const isConcurrent = parseFloat(intervalSeconds) === 0;

    // 当执行间隔变化时，自动提示执行模式
    useEffect(() => {
        const errors: Record<string, string> = {};

        if (mode && enterprises.length > 0) {
            enterprises.forEach((e, index) => {
                if (mode === 1 && !e.items1.trim()) {
                    errors[`enterprise-${index}-items1`] = `企业 ${index + 1} 的Items1为必填项（模式1）`;
                }
                if (mode === 2 && !e.items2.trim()) {
                    errors[`enterprise-${index}-items2`] = `企业 ${index + 1} 的Items2为必填项（模式2）`;
                }
                if (mode === 3 && !e.items3.trim()) {
                    errors[`enterprise-${index}-items3`] = `企业 ${index + 1} 的Items3为必填项（模式3）`;
                }
            });
        }

        setValidationErrors(errors);
    }, [mode, enterprises]);

    // 添加企业
    const addEnterprise = () => {
        const newEnterprise: Enterprise = {
            id: Date.now().toString(),
            name: '',
            token: '',
            tenantId: '',
            taxId: '',
            items1: '',
            items2: '',
            items3: ''
        };
        setEnterprises([...enterprises, newEnterprise]);
    };

    const removeEnterprise = (id: string) => {
        setEnterprises(enterprises.filter(e => e.id !== id));
    };

    const updateEnterprise = (id: string, field: keyof Enterprise, value: string) => {
        setEnterprises(enterprises.map(e =>
            e.id === id ? { ...e, [field]: value } : e
        ));
    };

    // 执行结算
    const startExecution = async () => {
        setIsRunning(true);
        setLogs(['[INFO] 开始执行结算处理脚本...']);
        const errors: string[] = [];

        try {
            // 1. 验证参数
            if (mode === null) {
                throw new Error('请选择执行模式（发起结算/重新发起/单个结算单）');
            }
            if (enterprises.length === 0) {
                throw new Error('请至少添加一个企业');
            }
            enterprises.forEach((e, index) => {
                if (!e.token) throw new Error(`企业 ${index + 1} 未填写Token`);
                if (!e.tenantId) throw new Error(`企业 ${index + 1} 未填写Tenant ID`);
                if (!e.taxId) throw new Error(`企业 ${index + 1} 未填写Tax ID`);

                // 模式与输入框匹配验证
                if (mode === 1 && !e.items1.trim()) {
                    errors.push(`企业 ${index + 1} 未填写Items1（模式1需填写）`);
                }
                if (mode === 2 && !e.items2.trim()) {
                    errors.push(`企业 ${index + 1} 未填写Items2（模式2需填写）`);
                }
                if (mode === 3 && !e.items3.trim()) {
                    errors.push(`企业 ${index + 1} 未填写Items3（模式3需填写）`);
                }
            });

            if (errors.length > 0) {
                throw new Error(`参数验证失败：\n${errors.join('\n')}`);
            }

            // 2. 打印执行模式信息
            setLogs(prev => [...prev, `[INFO] 执行模式：${isConcurrent ? '并发执行' : '顺序执行'}`]);
            if (isConcurrent) {
                setLogs(prev => [...prev, `[INFO] 并发数：${concurrency}`]);
            } else {
                setLogs(prev => [...prev, `[INFO] 执行间隔：${intervalSeconds}秒`]);
            }
            setLogs(prev => [...prev, `[INFO] 环境：${environment}，模式：${mode}，企业总数：${enterprises.length}`]);

            // 3. 构造请求体
            const requestBody = {
                enterprises: enterprises.map(enterprise => ({
                    name: enterprise.name,
                    token: enterprise.token,
                    tenant_id: enterprise.tenantId,
                    tax_id: enterprise.taxId,
                    items1: enterprise.items1.split(',').map(i => i.trim()).filter(Boolean),
                    items2: enterprise.items2.split(',').map(i => i.trim()).filter(Boolean),
                    items3: parseItems3(enterprise.items3)
                })),
                mode: mode, // 直接使用数字mode（1/2/3）
                concurrent_workers: parseInt(concurrency, 10),
                interval_seconds: parseFloat(intervalSeconds),
                environment: environment // 新增：传递环境参数
            };

            // 3. 打印请求体（调试用）
            setLogs(prev => [...prev, `[DEBUG] 请求体: ${JSON.stringify(requestBody, null, 2)}`]);

            // 4. 调用接口（8000端口）
            const response = await fetch(process.env.NEXT_PUBLIC_API_BASE_URL + '/settlement/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                throw new Error(`接口调用失败：HTTP ${response.status}`);
            }

            const data = await response.json();
            setLogs(prev => [...prev, `[SUCCESS] 执行完成：${JSON.stringify(data)}`]);

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : '未知错误';
            setLogs(prev => [...prev, `[ERROR] ${errorMsg}`]);
        } finally {
            setIsRunning(false);
            setLogs(prev => [...prev, '[INFO] 执行结束']);
        }
    };

    const stopExecution = () => {
        setIsRunning(false);
        setLogs(prev => [...prev, '[WARN] 执行已手动停止']);
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <div className="mb-6">
                    <Button variant="ghost" onClick={onBack} className="mb-4">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        返回脚本列表
                    </Button>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl">结算处理脚本</h1>
                        <Badge variant={isRunning ? "destructive" : "secondary"}>
                            {isRunning ? "运行中" : "就绪"}
                        </Badge>
                        {/* 新增：显示当前执行模式 */}
                        <Badge variant={isConcurrent ? "outline" : "secondary"} className="flex items-center gap-1">
                            {isConcurrent ? (
                                <>
                                    <RefreshCw className="w-3 h-3" /> 并发模式
                                </>
                            ) : (
                                <>
                                    <Clock className="w-3 h-3" /> 顺序模式
                                </>
                            )}
                        </Badge>
                    </div>
                    <p className="text-muted-foreground">批量处理企业结算任务，支持并发执行和实时监控</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* 参数配置区 */}
                    <div className="lg:col-span-2 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>执行参数配置</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* 执行模式（1/2/3） */}
                                    <div>
                                        <Label htmlFor="mode">执行模式 <span className="text-red-500">*</span></Label>
                                        <Select value={mode?.toString() || ''}
                                            onValueChange={(v) => setMode(v ? parseInt(v) : null)}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="选择模式" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">1 - 发起结算（items1）</SelectItem>
                                                <SelectItem value="2">2 - 重新发起结算（items2）</SelectItem>
                                                <SelectItem value="3">3 - 单个结算单发起（items3）</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* 并发数（优化：仅并发模式显示必填标识） */}
                                    <div>
                                        <Label htmlFor="concurrency">
                                            并发数
                                            {isConcurrent && <span className="text-red-500">*</span>}
                                            {!isConcurrent && (
                                                <span className="ml-2 text-xs text-gray-500">
                                                    <AlertCircle className="inline w-3 h-3" /> 顺序模式忽略
                                                </span>
                                            )}
                                        </Label>
                                        <Input
                                            id="concurrency"
                                            type="number"
                                            value={concurrency}
                                            onChange={(e) => setConcurrency(e.target.value)}
                                            min="1"
                                            max="50"
                                        />
                                    </div>

                                    {/* 执行间隔（优化：明确说明0=并发） */}
                                    <div>
                                        <Label htmlFor="intervalSeconds" className="flex items-center gap-1">
                                            执行间隔（秒）
                                            <span className="text-red-500">*</span>
                                            {/* 新增：悬停提示 */}
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Info
                                                            className="w-4 h-4 text-blue-500 cursor-help"
                                                            style={{ marginBottom: '1px' }}
                                                        />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>0=并发执行，&gt;0=顺序执行</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </Label>
                                        <Input
                                            id="intervalSeconds"
                                            type="number"
                                            value={intervalSeconds}
                                            onChange={(e) => setIntervalSeconds(e.target.value)}
                                            min="0"
                                            step="0.1"
                                        />
                                    </div>
                                </div>

                                {/* 新增：环境选择 */}
                                <div>
                                    <Label htmlFor="environment">运行环境 <span
                                        className="text-red-500">*</span></Label>
                                    <Select value={environment} onValueChange={setEnvironment}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="选择环境" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="test">Beta（test）</SelectItem>
                                            <SelectItem value="prod">生产环境（prod）</SelectItem>
                                            {/*<SelectItem value="local">本地环境（local）</SelectItem>*/}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        {/* 企业配置 */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>企业配置</CardTitle>
                                    <Button onClick={addEnterprise} size="sm">
                                        <Plus className="w-4 h-4 mr-2" />
                                        添加企业
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {enterprises.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <p>暂无企业配置，点击"添加企业"开始配置</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {enterprises.map((enterprise, index) => (
                                            <Card key={enterprise.id} className="border-dashed">
                                                <CardHeader className="pb-3">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-sm">企业 {index + 1} {enterprise.name ? `- ${enterprise.name}` : ''}</h4>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => removeEnterprise(enterprise.id)}
                                                            disabled={isRunning}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="space-y-3">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <div>
                                                            <Label htmlFor={`name-${enterprise.id}`}>企业名称</Label>
                                                            <Input
                                                                id={`name-${enterprise.id}`}
                                                                value={enterprise.name}
                                                                onChange={(e) => updateEnterprise(enterprise.id, 'name', e.target.value)}
                                                                placeholder="例如：多场景测试企业"
                                                                disabled={isRunning}
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label htmlFor={`token-${enterprise.id}`}>Token <span
                                                                className="text-red-500">*</span></Label>
                                                            <Input
                                                                id={`token-${enterprise.id}`}
                                                                value={enterprise.token}
                                                                onChange={(e) => updateEnterprise(enterprise.id, 'token', e.target.value)}
                                                                placeholder="企业认证Token"
                                                                type="password"
                                                                disabled={isRunning}
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label htmlFor={`tenant-${enterprise.id}`}>Tenant ID <span
                                                                className="text-red-500">*</span></Label>
                                                            <Input
                                                                id={`tenant-${enterprise.id}`}
                                                                value={enterprise.tenantId}
                                                                onChange={(e) => updateEnterprise(enterprise.id, 'tenantId', e.target.value)}
                                                                placeholder="例如：510"
                                                                disabled={isRunning}
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label htmlFor={`tax-${enterprise.id}`}>Tax ID <span
                                                                className="text-red-500">*</span></Label>
                                                            <Input
                                                                id={`tax-${enterprise.id}`}
                                                                value={enterprise.taxId}
                                                                onChange={(e) => updateEnterprise(enterprise.id, 'taxId', e.target.value)}
                                                                placeholder="例如：2"
                                                                disabled={isRunning}
                                                            />
                                                        </div>
                                                    </div>

                                                    <Separator />

                                                    {/* 批次配置（根据mode显示对应说明） */}
                                                    <div className="space-y-3">
                                                        <h5 className="text-sm font-medium">批次配置</h5>

                                                        <div
                                                            className={`${mode === 1 ? "border-l-2 border-blue-500 pl-2" : ""}`}>
                                                            <Label htmlFor={`items1-${enterprise.id}`}>
                                                                Items1 <span
                                                                    className="text-xs text-blue-500">(模式1生效)</span>
                                                                {mode === 1 &&
                                                                    <span className="text-red-500 ml-1">*</span>}
                                                                <span className="ml-2 text-xs text-muted-foreground">
                                                                    格式：逗号分隔批次号（例如：ZDPC-1,ZDPC-2）
                                                                </span>
                                                            </Label>
                                                            <Input
                                                                id={`items1-${enterprise.id}`}
                                                                value={enterprise.items1}
                                                                onChange={(e) => updateEnterprise(enterprise.id, 'items1', e.target.value)}
                                                                placeholder="ZDPC-470406410111422464,ZDPC-470406410111422465"
                                                                disabled={isRunning}
                                                                className={validationErrors[`enterprise-${index}-items1`] ? "border-red-500" : ""}
                                                            />
                                                            {validationErrors[`enterprise-${index}-items1`] && (
                                                                <p className="text-red-500 text-xs mt-1 flex items-center">
                                                                    <AlertCircle className="w-3 h-3 mr-1 inline" />
                                                                    {validationErrors[`enterprise-${index}-items1`]}
                                                                </p>
                                                            )}
                                                        </div>

                                                        {/* Items2 - 模式2必填 */}
                                                        <div
                                                            className={`${mode === 2 ? "border-l-2 border-blue-500 pl-2" : ""}`}>
                                                            <Label htmlFor={`items2-${enterprise.id}`}>
                                                                Items2 <span
                                                                    className="text-xs text-blue-500">(模式2生效)</span>
                                                                {mode === 2 &&
                                                                    <span className="text-red-500 ml-1">*</span>}
                                                                <span
                                                                    className="ml-2 text-xs text-muted-foreground">格式同上</span>
                                                            </Label>
                                                            <Input
                                                                id={`items2-${enterprise.id}`}
                                                                value={enterprise.items2}
                                                                onChange={(e) => updateEnterprise(enterprise.id, 'items2', e.target.value)}
                                                                placeholder="ZDPC-470406410111422464"
                                                                disabled={isRunning}
                                                                className={validationErrors[`enterprise-${index}-items2`] ? "border-red-500" : ""}
                                                            />
                                                            {validationErrors[`enterprise-${index}-items2`] && (
                                                                <p className="text-red-500 text-xs mt-1 flex items-center">
                                                                    <AlertCircle className="w-3 h-3 mr-1 inline" />
                                                                    {validationErrors[`enterprise-${index}-items2`]}
                                                                </p>
                                                            )}
                                                        </div>

                                                        {/* Items3 - 模式3必填 */}
                                                        <div
                                                            className={`${mode === 3 ? "border-l-2 border-blue-500 pl-2" : ""}`}>
                                                            <Label htmlFor={`items3-${enterprise.id}`}>
                                                                Items3 <span
                                                                    className="text-xs text-blue-500">(模式3生效)</span>
                                                                {mode === 3 &&
                                                                    <span className="text-red-500 ml-1">*</span>}
                                                                <span className="ml-2 text-xs text-muted-foreground">
                                                                    格式：批次号:结算单1,结算单2;批次号2:结算单3
                                                                </span>
                                                            </Label>
                                                            <Input
                                                                id={`items3-${enterprise.id}`}
                                                                value={enterprise.items3}
                                                                onChange={(e) => updateEnterprise(enterprise.id, 'items3', e.target.value)}
                                                                placeholder="例如：ZDPC-3:JSZD-1,JSZD-2;ZDPC-4:JSZD-3"
                                                                disabled={isRunning}
                                                                className={validationErrors[`enterprise-${index}-items3`] ? "border-red-500" : ""}
                                                            />
                                                            {validationErrors[`enterprise-${index}-items3`] && (
                                                                <p className="text-red-500 text-xs mt-1 flex items-center">
                                                                    <AlertCircle className="w-3 h-3 mr-1 inline" />
                                                                    {validationErrors[`enterprise-${index}-items3`]}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* 执行按钮 */}
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex gap-3">
                                    {!isRunning ? (
                                        <Button
                                            onClick={startExecution}
                                            disabled={!mode || enterprises.length === 0 || Object.keys(validationErrors).length > 0}
                                            className="flex-1"
                                        >
                                            <Play className="w-4 h-4 mr-2" />
                                            开始执行
                                        </Button>
                                    ) : (
                                        <Button
                                            onClick={stopExecution}
                                            variant="destructive"
                                            className="flex-1"
                                        >
                                            <Square className="w-4 h-4 mr-2" />
                                            停止执行
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* 实时日志区 */}
                    <div className="sticky top-6 self-start">
                        <Card className="h-[calc(100vh-4rem)] overflow-hidden">
                            <CardHeader className="border-b">
                                <CardTitle>实时日志</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ScrollArea
                                    className="h-[calc(100vh-8rem)] w-full p-4"
                                    ref={(scrollArea) => {
                                        if (scrollArea && logs.length > 0) {
                                            // 强制滚动到最底部（使用setTimeout确保DOM更新后执行）
                                            setTimeout(() => {
                                                scrollArea.scrollTop = scrollArea.scrollHeight;
                                            }, 0);
                                        }
                                    }}
                                >
                                    <div className="space-y-4 px-1">
                                        {logs.length === 0 ? (
                                            <p className="text-muted-foreground text-sm">等待执行...</p>
                                        ) : (
                                            logs.map((log, index) => {
                                                // 检测是否为JSON响应日志
                                                const isJsonResponse = log.includes('[SUCCESS] 执行完成：') && log.includes('{');
                                                let logContent = log;

                                                // 提取并格式化JSON内容
                                                if (isJsonResponse) {
                                                    try {
                                                        const jsonStr = log.split('[SUCCESS] 执行完成：')[1];
                                                        const jsonObj = JSON.parse(jsonStr);
                                                        logContent = `[SUCCESS] 执行完成：\n${JSON.stringify(jsonObj, null, 2)}`;
                                                    } catch (e) {
                                                        // 解析失败则使用原始内容
                                                    }
                                                }

                                                return (
                                                    <div key={index} className="text-xs font-mono break-all whitespace-pre-wrap"
                                                    style={{ maxWidth: 'calc(100% - 1rem)' }}
                                                    >
                                                        <span className="text-muted-foreground">
                                                            {new Date().toLocaleTimeString()}
                                                        </span>
                                                        <span className="ml-2 block mt-1">
                                                            {log.includes('[ERROR]') ? (
                                                                <span className="text-red-500 flex items-start">
                                                                    <AlertCircle className="w-3 h-3 inline mr-1 mt-0.5 flex-shrink-0" />
                                                                    {log}
                                                                </span>
                                                            ) : log.includes('[SUCCESS]') ? (
                                                                <span className="text-green-500">{logContent}</span>
                                                            ) : log.includes('[DEBUG]') ? (
                                                                <span className="text-purple-500">{log}</span>
                                                            ) : log.includes('[WARN]') ? (
                                                                <span className="text-amber-500">{log}</span>
                                                            ) : (
                                                                log
                                                            )}
                                                        </span>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}