import React, { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { AlertCircle, ArrowLeft, ChevronDown, ChevronRight, Download, Play, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { getApiBaseUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';

// ---------- 类型定义 ----------
interface StepInfo {
    code?: number | string;
    data?: unknown;
    msg?: string;
    open?: boolean;
    taskStaffId?: string;
    taskAssignId?: string;
}

type StepKey = 'login' | 'sign' | 'get_task_ids' | 'delivery' | 'get_balance_id';

interface Steps {
    login: StepInfo;
    sign: StepInfo;
    get_task_ids: StepInfo;
    delivery: StepInfo;
    get_balance_id: StepInfo;
}

interface ExecutionDetail {
    mobile: string;
    success: boolean;
    error: string | null;
    steps: Steps;
}

interface PhoneNumber extends ExecutionDetail {
    phone: string;
    status: 'pending' | 'success' | 'failed';
}

interface TaskInfo {
    task_id: string;
    task_content: string;
    report_name: string;
    report_address: string;
    supplement: string;
    attachments: Array<{
        fileName: string;
        fileType: string;
        uploadTime: number;
        fileLength: number;
        isPic: number;
        isWx: number;
        filePath: string;
    }>;
}

interface TaskAutomationScriptProps {
    onBack: () => void;
}

// 解析手机号 API 响应
interface ParseMobilesResponse {
    data?: { mobiles?: string[] };
    message?: string;
    detail?: string;
}

// 执行任务 API 响应
interface TaskProcessResponse {
    data?: ExecutionDetail[];
    message?: string;
    detail?: string;
}

// ---------- 工具函数（无 any） ----------
// 统一安全 JSON 解析
async function parseJson<T>(resp: Response): Promise<T | null> {
    try {
        return (await resp.json()) as unknown as T;
    } catch {
        return null;
    }
}

// 文件转 Base64
const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1]);
            } else {
                reject(new Error('File conversion failed'));
            }
        };
        reader.onerror = (error) => reject(error);
    });

// 仅支持读取 'code' | 'msg'，并返回 string
const getStepProperty = (step: StepInfo | undefined, property: 'code' | 'msg', defaultValue = 'N/A'): string => {
    if (!step) return defaultValue;
    const value = step[property];
    if (value === undefined || value === null) return defaultValue;
    return String(value);
};

// 结算单数据类型守卫
type BalanceData = { list?: unknown[]; total?: number };
const isBalanceData = (v: unknown): v is BalanceData => {
    if (typeof v !== 'object' || v === null) return false;
    // 有 list 或 total 字段即认为是结算单数据
    return 'list' in v || 'total' in v;
};

// 格式化步骤数据
const formatStepData = (step: StepInfo | undefined, stepKey: StepKey): string => {
    if (!step) return JSON.stringify({}, null, 2);

    if (stepKey === 'get_task_ids') {
        return JSON.stringify(
            {
                taskStaffId: step.taskStaffId || 'N/A',
                taskAssignId: step.taskAssignId || 'N/A',
                code: step.code ?? 'N/A',
                msg: step.msg || ''
            },
            null,
            2
        );
    }

    if (stepKey === 'get_balance_id') {
        const d = step.data;
        if (isBalanceData(d)) {
            if ((d.list?.length ?? 0) === 0 && (d.total ?? 0) === 0) {
                return JSON.stringify({ list: 'No settlement data', total: 0 }, null, 2);
            }
            return JSON.stringify(d, null, 2);
        }
        return JSON.stringify('No Data', null, 2);
    }

    return JSON.stringify({ code: step.code ?? 'N/A', msg: step.msg || '', data: step.data ?? null }, null, 2);
};

// ---------- 组件 ----------
export default function TaskAutomationScript({ onBack }: TaskAutomationScriptProps) {
    const { t } = useI18n();
    const ta = t.scripts.taskAutomation;

    // 根据执行模式获取步骤
    const getStepsForMode = (mode: string): Array<{ key: StepKey; label: string }> => {
        const allSteps: Array<{ key: StepKey; label: string }> = [
            { key: 'login', label: ta.mode?.options?.full?.split(' ')[0] || 'Login' }, // Simplified label or modify translation structure if needed
            { key: 'sign', label: ta.mode?.options?.loginSign?.split('+')[1] || 'Sign' },
            { key: 'get_task_ids', label: 'Task IDs' },
            { key: 'delivery', label: 'Delivery' },
            { key: 'get_balance_id', label: 'Balance' }
        ];

        switch (mode) {
            case '1':
                return allSteps.filter(s => ['login', 'sign'].includes(s.key));
            case '2':
                return allSteps.filter(s => ['login', 'delivery'].includes(s.key));
            case '3':
                return allSteps.filter(s => ['login', 'get_balance_id'].includes(s.key));
            default:
                return allSteps;
        }
    };

    // 主要状态
    const [environment, setEnvironment] = useState('test');
    const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
    const [manualInput, setManualInput] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [startLine, setStartLine] = useState('');
    const [endLine, setEndLine] = useState('');
    const [mode, setMode] = useState<string>('');
    const [executionType, setExecutionType] = useState('sequential');
    const [concurrency, setConcurrency] = useState('50');
    const [taskId, setTaskId] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [currentTab, setCurrentTab] = useState('upload');
    const [error, setError] = useState('');
    const [expandedPhone, setExpandedPhone] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [executionResults, setExecutionResults] = useState<PhoneNumber[]>([]);
    const [dragOver, setDragOver] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // 任务信息状态
    const [taskInfo, setTaskInfo] = useState<TaskInfo>({
        task_id: '',
        task_content:
            'Deliverables: List specific deliverables completed in this phase (e.g. code modules, design docs, test reports), specifying version numbers and function lists.\nAcceptance Criteria: Indicators required by checking against contract (e.g. performance params, safety standards, test coverage), explain compliance item by item, attach screenshot of test data.\nIssue Record: Summary of defects found during acceptance (e.g. Bug list, substandard items), and note rectification plan and estimated completion time.\nAttachment List: List all supporting files submitted (e.g. logs, test cases, 3rd party certs), ensuring traceability.',
        report_name: 'XX Project Phase Delivery Acceptance Report',
        report_address: 'No. 418 Kandan Road, Kandan Street, Fengtai District, Beijing',
        supplement: 'Supplement 1',
        attachments: [
            {
                fileName: 'tmp_1eb627ad4a5d62e68b9ef43759a4c750.jpg',
                fileType: '.jpg',
                uploadTime: 1751247594260,
                fileLength: 246533,
                isPic: 1,
                isWx: 0,
                filePath: 'app/2025-06-30/tmp_1eb627ad4a5d62e68b9ef43759a4c750.jpg'
            }
        ]
    });

    // 交互函数
    const togglePhoneDetails = (mobile: string) => {
        setExpandedPhone(expandedPhone === mobile ? null : mobile);
    };

    const goToTaskStep = () => {
        setExecutionResults([]);
        setPhoneNumbers(prev =>
            prev.map(phone => ({
                ...phone,
                status: 'pending',
                success: false,
                error: null,
                steps: { login: {}, sign: {}, get_task_ids: {}, delivery: {}, get_balance_id: {} }
            }))
        );
        setCurrentTab('task');
    };

    const handleFileUploadClick = () => fileInputRef.current?.click();

    const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        setError('');
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.txt')) {
            setError(ta.upload.supportTxt);
            return;
        }
        setSelectedFile(file);
        setPhoneNumbers([]);
        setStartLine('');
        setEndLine('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(true);
    };
    const onDragLeave = () => setDragOver(false);
    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.txt')) {
            setError(ta.upload.supportTxt);
            return;
        }
        setSelectedFile(file);
        setPhoneNumbers([]);
        setStartLine('');
        setEndLine('');
    };

    // 提取手机号列表
    const fetchPhoneNumbers = async () => {
        setError('');
        const base = getApiBaseUrl();
        if (!base) return;

        if (!selectedFile) {
            setError(ta.messages.fileRequired);
            return;
        }

        const start = parseInt(startLine, 10);
        const end = parseInt(endLine, 10);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) {
            setError(ta.messages.invalidRange);
            return;
        }

        try {
            setIsLoading(true);
            const base64Content = await fileToBase64(selectedFile);

            const resp = await fetch(`${base}/mobile/parse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_content: base64Content, range: `${start}-${end}` })
            });

            const data = await parseJson<ParseMobilesResponse>(resp);

            if (!resp.ok) {
                const msg =
                    (data && (data.message || data.detail)) ||
                    `${ta.messages.parseFail} (HTTP ${resp.status})`;
                setError(
                    data && data.message && (data.message.includes('out of index') || data.message.includes('not exist') || data.message.includes('超出索引') || data.message.includes('不存在'))
                        ? `${ta.messages.invalidRange}: ${data.message}`
                        : msg
                );
                return;
            }

            const mobiles = data?.data?.mobiles;
            if (!Array.isArray(mobiles)) {
                setError('Invalid Data Structure: Missing mobiles array');
                return;
            }

            const list: PhoneNumber[] = mobiles.map((mobile: string) => ({
                phone: String(mobile).trim(),
                mobile: String(mobile).trim(),
                status: 'pending',
                success: false,
                error: null,
                steps: { login: {}, sign: {}, get_task_ids: {}, delivery: {}, get_balance_id: {} }
            }));
            setPhoneNumbers(list);
            toast.success(ta.messages.parseSuccess.replace('{count}', list.length.toString()));
        } catch (err) {
            const msg = err instanceof Error ? err.message : ta.messages.parseFail;
            setError(msg);
            console.error('File upload error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // 手动提交手机号
    const handleManualSubmit = () => {
        setError('');
        const phones = manualInput
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);
        if (phones.length === 0) {
            toast.error(ta.messages.inputValidPhone);
            return;
        }
        const list: PhoneNumber[] = phones.map(p => ({
            phone: p,
            mobile: p,
            status: 'pending',
            success: false,
            error: null,
            steps: { login: {}, sign: {}, get_task_ids: {}, delivery: {}, get_balance_id: {} }
        }));
        setPhoneNumbers(list);
        setCurrentTab('mode');
    };

    const clearPhoneNumbers = () => {
        setPhoneNumbers([]);
        setManualInput('');
        setError('');
    };

    // 开始执行任务
    const startExecution = async () => {
        setError('');
        const base = getApiBaseUrl();
        if (!base) return;

        if (!taskId || !mode || phoneNumbers.length === 0) {
            setError(ta.messages.taskInfoRequired);
            return;
        }

        try {
            setIsRunning(true);
            setCurrentTab('task');

            const updatedTaskInfo: TaskInfo = { ...taskInfo, task_id: taskId };
            setTaskInfo(updatedTaskInfo);

            const concurrent_workers =
                executionType === 'concurrent'
                    ? Math.max(1, Math.min(200, parseInt(concurrency, 10) || 1))
                    : 1;

            const body = {
                mobiles: phoneNumbers.map(p => p.phone),
                file_content: null as string | null,
                range: null as string | null,
                task_info: updatedTaskInfo,
                mode: mode === 'full' ? null : parseInt(mode, 10),
                concurrent_workers,
                interval_seconds: 0.5,
                environment
            };

            const resp = await fetch(`${base}/mobile/task/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await parseJson<TaskProcessResponse>(resp);

            if (!resp.ok) {
                const msg = (data && (data.message || data.detail)) || `${ta.messages.fail} (HTTP ${resp.status})`;
                throw new Error(msg);
            }

            const arr = data?.data;
            if (!Array.isArray(arr)) {
                setError('Invalid response format: data is not an array');
                return;
            }

            const formattedResults: PhoneNumber[] = arr.map((item: ExecutionDetail) => ({
                ...item,
                phone: item.mobile,
                status: item.success ? 'success' : 'failed',
                steps: {
                    login: item.steps?.login || {},
                    sign: item.steps?.sign || {},
                    get_task_ids: item.steps?.get_task_ids || {},
                    delivery: item.steps?.delivery || {},
                    get_balance_id: item.steps?.get_balance_id || {}
                }
            }));

            setPhoneNumbers(formattedResults);
            setExecutionResults(formattedResults);

            setIsRunning(false);
            setCurrentTab('results');
            toast.success(ta.messages.processSuccess);
        } catch (err) {
            setIsRunning(false);
            const msg = err instanceof Error ? err.message : ta.messages.fail;
            setError(msg);
            console.error('Execution error:', err);
        }
    };

    // 下载结果
    const downloadResults = () => {
        const results = {
            executionTime: new Date().toISOString(),
            mode,
            environment,
            executionType,
            concurrency,
            total: executionResults.length,
            success: executionResults.filter(p => p.status === 'success').length,
            failed: executionResults.filter(p => p.status === 'failed').length,
            results: executionResults
        };
        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `task_${taskId || 'unnamed'}_results.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getModeDescription = (modeValue: string) => {
        switch (modeValue) {
            case 'full':
                return ta.mode.desc.full;
            case '1':
                return ta.mode.desc.loginSign;
            case '2':
                return ta.mode.desc.loginDelivery;
            case '3':
                return ta.mode.desc.loginBalance;
            default:
                return '';
        }
    };

    // ---------- JSX ----------
    return (
        <div className="min-h-screen colorful-background">
            <div className="max-w-6xl mx-auto">
                <div className="mb-6">
                    <Button variant="ghost" onClick={onBack} className="mb-4">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        {ta.back}
                    </Button>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl">{ta.title}</h1>
                        <Badge variant={isRunning ? 'destructive' : 'secondary'}>{isRunning ? ta.task.executing : ta.task.ready}</Badge>
                    </div>
                    <p className="text-muted-foreground">{ta.subtitle}</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-md flex items-center">
                        <AlertCircle className="w-4 h-4 mr-2" />
                        <span>{error}</span>
                    </div>
                )}

                <Tabs value={currentTab} onValueChange={setCurrentTab} className="space-y-6">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="upload">{ta.tabs.upload}</TabsTrigger>
                        <TabsTrigger value="mode" disabled={phoneNumbers.length === 0}>{ta.tabs.mode}</TabsTrigger>
                        <TabsTrigger value="task" disabled={!mode}>{ta.tabs.task}</TabsTrigger>
                        <TabsTrigger
                            value="results"
                            disabled={executionResults.filter(p => p.status !== 'pending').length === 0}
                        >
                            {ta.tabs.results}
                        </TabsTrigger>
                    </TabsList>

                    {/* 文件上传页 */}
                    <TabsContent value="upload" className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>{ta.upload.title}</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <Label htmlFor="file-upload">{ta.upload.label}</Label>
                                        <div
                                            onClick={handleFileUploadClick}
                                            onDragOver={onDragOver}
                                            onDragLeave={onDragLeave}
                                            onDrop={onDrop}
                                            className={`mt-1 border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-500'
                                                }`}
                                        >
                                            <Upload className="w-6 h-6 mx-auto text-gray-400" />
                                            <p className="mt-2 text-sm text-gray-600">{ta.upload.dragDrop}</p>
                                            <p className="text-xs text-gray-500 mt-1">{ta.upload.dragDropHint}</p>
                                            <Input
                                                id="file-upload"
                                                ref={fileInputRef}
                                                type="file"
                                                accept=".txt"
                                                onChange={handleFileSelected}
                                                className="hidden"
                                            />
                                        </div>
                                    </div>

                                    {selectedFile && (
                                        <div className="space-y-3">
                                            <p className="text-sm text-muted-foreground">{ta.upload.fileSelected.replace('{name}', selectedFile.name)}</p>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <Label htmlFor="start-line">{ta.upload.startLine}</Label>
                                                    <Input
                                                        id="start-line"
                                                        type="number"
                                                        value={startLine}
                                                        onChange={(e) => setStartLine(e.target.value)}
                                                        placeholder={ta.upload.startPlaceholder}
                                                        min={1}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' && endLine && !isLoading) fetchPhoneNumbers();
                                                        }}
                                                    />
                                                </div>
                                                <div>
                                                    <Label htmlFor="end-line">{ta.upload.endLine}</Label>
                                                    <Input
                                                        id="end-line"
                                                        type="number"
                                                        value={endLine}
                                                        onChange={(e) => setEndLine(e.target.value)}
                                                        placeholder={ta.upload.endPlaceholder}
                                                        min={Number(startLine) || 1}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' && startLine && !isLoading) fetchPhoneNumbers();
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            <Button
                                                onClick={fetchPhoneNumbers}
                                                disabled={!startLine || !endLine || isLoading}
                                                className="w-full"
                                            >
                                                {isLoading ? ta.upload.fetching : ta.upload.fetchBtn}
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>{ta.upload.manualTitle}</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <Label htmlFor="manual-input">{ta.upload.manualLabel}</Label>
                                        <Textarea
                                            id="manual-input"
                                            value={manualInput}
                                            onChange={(e) => setManualInput(e.target.value)}
                                            placeholder={ta.upload.manualPlaceholder}
                                            rows={8}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleManualSubmit();
                                            }}
                                        />
                                    </div>
                                    <Button onClick={handleManualSubmit} className="w-full" disabled={isLoading}>
                                        <Upload className="w-4 h-4 mr-2" />
                                        {ta.upload.submitBtn}
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>

                        {phoneNumbers.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle>Phone Numbers</CardTitle>
                                        <div className="flex gap-2">
                                            <Badge variant="outline">{phoneNumbers.length} items</Badge>
                                            <Button variant="outline" size="sm" onClick={clearPhoneNumbers}
                                                disabled={isLoading}>
                                                <Trash2 className="w-4 h-4 mr-2" />
                                                {ta.upload.clear}
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="max-h-48 overflow-y-auto">
                                        <div className="grid grid-cols-4 gap-2">
                                            {phoneNumbers.map((phone, index) => (
                                                <div key={`${phone.phone}-${index}`}
                                                    className="text-sm p-2 bg-gray-100 rounded">
                                                    {phone.phone}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <Button onClick={() => setCurrentTab('mode')} className="w-full mt-4">
                                        {ta.execution.next}
                                    </Button>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    {/* 模式选择页 */}
                    <TabsContent value="mode" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>{ta.mode.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div>
                                    <Label htmlFor="mode-select">{ta.mode.label}</Label>
                                    <Select value={mode} onValueChange={setMode}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={ta.mode.placeholder} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="full">{ta.mode.options.full}</SelectItem>
                                            <SelectItem value="1">{ta.mode.options.loginSign}</SelectItem>
                                            <SelectItem value="2">{ta.mode.options.loginDelivery}</SelectItem>
                                            <SelectItem value="3">{ta.mode.options.loginBalance}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {mode &&
                                        <p className="text-sm text-muted-foreground mt-2">{getModeDescription(mode)}</p>}
                                </div>

                                <div>
                                    <Label htmlFor="environment-select">{ta.execution.envLabel}</Label>
                                    <Select value={environment} onValueChange={setEnvironment}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={ta.execution.envPlaceholder} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="test">Beta</SelectItem>
                                            <SelectItem value="prod">Production</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="execution-type">{ta.execution.typeLabel}</Label>
                                        <Select value={executionType} onValueChange={setExecutionType}>
                                            <SelectTrigger>
                                                <SelectValue placeholder={ta.execution.typePlaceholder} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="sequential">{ta.execution.sequential}</SelectItem>
                                                <SelectItem value="concurrent">{ta.execution.concurrent}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="concurrency">{ta.execution.concurrencyLabel}</Label>
                                        <Input
                                            id="concurrency"
                                            type="number"
                                            value={concurrency}
                                            onChange={(e) => setConcurrency(e.target.value)}
                                            min={1}
                                            max={200}
                                            disabled={executionType !== 'concurrent'}
                                        />
                                    </div>
                                </div>

                                <Button onClick={goToTaskStep} disabled={!mode} className="w-full">
                                    {ta.execution.next}
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* 任务执行页 */}
                    <TabsContent value="task" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>{ta.task.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label htmlFor="task-id">{ta.task.idLabel}</Label>
                                    <Input
                                        id="task-id"
                                        value={taskId}
                                        onChange={(e) => setTaskId(e.target.value)}
                                        placeholder={ta.task.idPlaceholder}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !isRunning && phoneNumbers.length > 0) startExecution();
                                        }}
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <Button
                                        onClick={startExecution}
                                        disabled={!taskId || isRunning || phoneNumbers.length === 0}
                                        className="flex-1"
                                    >
                                        <Play className="w-4 h-4 mr-2" />
                                        {isRunning ? ta.task.running : ta.task.start}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>{ta.task.status}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{ta.table.phone}</TableHead>
                                            <TableHead>{ta.table.status}</TableHead>
                                            <TableHead>{ta.table.result}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(executionResults.length > 0 ? executionResults : phoneNumbers).map((phone, index) => (
                                            <React.Fragment key={`${phone.mobile}-${index}`}>
                                                <TableRow>
                                                    <TableCell>{phone.phone}</TableCell>
                                                    <TableCell>
                                                        {phone.status === 'pending' &&
                                                            <Badge variant="outline">{ta.table.pending}</Badge>}
                                                        {phone.status === 'success' && (
                                                            <Badge variant="secondary"
                                                                className="bg-green-100 text-green-800">
                                                                {ta.table.success}
                                                            </Badge>
                                                        )}
                                                        {phone.status === 'failed' &&
                                                            <Badge variant="destructive">{ta.table.failed}</Badge>}
                                                    </TableCell>
                                                    <TableCell>
                                                        {phone.status === 'success' && ta.table.success}
                                                        {phone.status === 'failed' && (phone.error || ta.table.failed)}
                                                        {phone.status === 'pending' && '-'}
                                                    </TableCell>
                                                </TableRow>

                                                {phone.status !== 'pending' && (
                                                    <TableRow>
                                                        <TableCell colSpan={3}>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => togglePhoneDetails(phone.mobile)}
                                                                className="p-1 h-auto"
                                                            >
                                                                {expandedPhone === phone.mobile ? (
                                                                    <>
                                                                        <ChevronDown className="w-4 h-4 mr-1" />
                                                                        隐藏步骤详情
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <ChevronRight className="w-4 h-4 mr-1" />
                                                                        查看步骤详情
                                                                    </>
                                                                )}
                                                            </Button>

                                                            {expandedPhone === phone.mobile && (
                                                                <div
                                                                    className="mt-2 p-3 bg-muted/50 rounded-md text-sm space-y-4">
                                                                    {getStepsForMode(mode).map(({ key, label }) => (
                                                                        <div key={key}>
                                                                            <p className="font-medium">{label}步骤：</p>

                                                                            {mode === '3' && key === 'get_balance_id' ? (
                                                                                <>
                                                                                    <p>状态码：{getStepProperty(phone.steps[key], 'code')}</p>
                                                                                    <p>信息：{getStepProperty(phone.steps[key], 'msg') || '无信息'}</p>
                                                                                    <div className="mt-1">
                                                                                        <p className="font-medium">结算单数据：</p>
                                                                                        <pre
                                                                                            className="bg-muted p-2 rounded overflow-x-auto text-xs text-foreground">
                                                                                            {formatStepData(phone.steps[key], key)}
                                                                                        </pre>
                                                                                    </div>
                                                                                    {!phone.success && phone.error === '无可确认的结算单' && (
                                                                                        <div
                                                                                            className="mt-2 p-2 bg-red-50 text-red-600 rounded text-xs">
                                                                                            <AlertCircle
                                                                                                className="w-3 h-3 inline mr-1" />
                                                                                            异常：{phone.error}
                                                                                        </div>
                                                                                    )}
                                                                                </>
                                                                            ) : (
                                                                                <pre
                                                                                    className="bg-muted p-2 rounded overflow-x-auto text-xs text-foreground">
                                                                                    {formatStepData(phone.steps[key], key)}
                                                                                </pre>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* 执行结果页 */}
                    <TabsContent value="results" className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-center">
                                        <p className="text-sm text-muted-foreground">总数</p>
                                        <p className="text-2xl">{executionResults.length}</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-center">
                                        <p className="text-sm text-muted-foreground">成功</p>
                                        <p className="text-2xl text-green-600">
                                            {executionResults.filter(p => p.status === 'success').length}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-center">
                                        <p className="text-sm text-muted-foreground">失败</p>
                                        <p className="text-2xl text-red-600">
                                            {executionResults.filter(p => p.status === 'failed').length}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>详细结果</CardTitle>
                                    <Button onClick={downloadResults}>
                                        <Download className="w-4 h-4 mr-2" />
                                        下载结果
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>手机号</TableHead>
                                            <TableHead>执行状态</TableHead>
                                            <TableHead>操作</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {executionResults.map((phone, index) => (
                                            <React.Fragment key={`${phone.mobile}-result-${index}`}>
                                                <TableRow>
                                                    <TableCell>{phone.phone}</TableCell>
                                                    <TableCell>
                                                        {phone.status === 'success' && (
                                                            <Badge variant="secondary"
                                                                className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                                                                执行成功
                                                            </Badge>
                                                        )}
                                                        {phone.status === 'failed' &&
                                                            <Badge variant="destructive">执行失败</Badge>}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => togglePhoneDetails(phone.mobile)}
                                                        >
                                                            {expandedPhone === phone.mobile ? '隐藏详情' : '查看详情'}
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>

                                                {expandedPhone === phone.mobile && (
                                                    <TableRow>
                                                        <TableCell colSpan={3}>
                                                            <div className="p-4 bg-muted/50 rounded-md space-y-4">
                                                                {getStepsForMode(mode).map(({ key, label }) => (
                                                                    <div key={key}>
                                                                        <h4 className="font-medium mb-2">{label}信息</h4>
                                                                        {mode === '3' && key === 'get_balance_id' ? (
                                                                            <div
                                                                                className="bg-muted p-3 rounded overflow-x-auto text-foreground">
                                                                                <p className="mb-1">
                                                                                    <span
                                                                                        className="font-medium">状态码：</span>
                                                                                    {getStepProperty(phone.steps[key], 'code')}
                                                                                </p>
                                                                                <p className="mb-1">
                                                                                    <span
                                                                                        className="font-medium">信息：</span>
                                                                                    {getStepProperty(phone.steps[key], 'msg') || '无信息'}
                                                                                </p>
                                                                                <div className="mt-2">
                                                                                    <p className="font-medium mb-1">结算单数据：</p>
                                                                                    <pre
                                                                                        className="text-xs">{formatStepData(phone.steps[key], key)}</pre>
                                                                                </div>
                                                                                {!phone.success && phone.error === '无可确认的结算单' && (
                                                                                    <div
                                                                                        className="mt-2 p-2 bg-red-50 text-red-600 rounded text-xs">
                                                                                        <AlertCircle
                                                                                            className="w-3 h-3 inline mr-1" />
                                                                                        异常：{phone.error}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        ) : (
                                                                            <pre
                                                                                className="bg-muted p-2 rounded overflow-x-auto text-xs text-foreground">
                                                                                {formatStepData(phone.steps[key], key)}
                                                                            </pre>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
