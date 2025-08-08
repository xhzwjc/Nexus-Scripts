import React, {useState, useRef} from 'react';
import {Card, CardContent, CardHeader, CardTitle} from './ui/card';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Label} from './ui/label';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from './ui/select';
import {Textarea} from './ui/textarea';
import {Badge} from './ui/badge';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from './ui/table';
import {Tabs, TabsContent, TabsList, TabsTrigger} from './ui/tabs';
import {ArrowLeft, Upload, Play, Download, Trash2, AlertCircle, ChevronDown, ChevronRight} from 'lucide-react';
import { Toaster, toast } from 'sonner';

// 定义步骤信息接口
interface StepInfo {
    code?: number | string;
    data?: any;
    msg?: string;
    open?: boolean;
    taskStaffId?: string;
    taskAssignId?: string;
}

// 定义详细执行结果接口
interface ExecutionDetail {
    mobile: string;
    success: boolean;
    error: string | null;
    steps: {
        login: StepInfo;
        sign: StepInfo;
        get_task_ids: StepInfo;
        delivery: StepInfo;
        get_balance_id: StepInfo; // 结算单步骤
    };
}

// 定义手机号状态接口
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

export default function TaskAutomationScript({onBack}: TaskAutomationScriptProps) {
    // 主要状态 - 新增environment状态
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

    const fileInputRef = useRef<HTMLInputElement>(null);

    // 任务信息状态
    const [taskInfo, setTaskInfo] = useState<TaskInfo>({
        task_id: '',
        task_content: "交付成果：列明本阶段完成的具体交付物（如代码模块、设计文档、测试报告等），需标注版本号及对应功能清单。\n验收指标：对照合同要求的KPI（如性能参数、安全标准、测试覆盖率等），逐项说明达标情况，附检测数据截图。\n问题记录：汇总验收过程中发现的缺陷（如Bug清单、未达标项），并注明整改计划与预计完成时间。\n附件清单：列出所有提交的支撑文件（如日志、测试用例、第三方认证等），确保可追溯。",
        report_name: "XX项目阶段交付验收报告",
        report_address: "北京市丰台区看丹街道看丹路418号",
        supplement: "补充一",
        attachments: [
            {
                fileName: "tmp_1eb627ad4a5d62e68b9ef43759a4c750.jpg",
                fileType: ".jpg",
                uploadTime: 1751247594260,
                fileLength: 246533,
                isPic: 1,
                isWx: 0,
                filePath: "app/2025-06-30/tmp_1eb627ad4a5d62e68b9ef43759a4c750.jpg"
            }
        ]
    });

    // 安全获取步骤属性，防止undefined错误
    const getStepProperty = (step: StepInfo | undefined, property: keyof StepInfo, defaultValue: string = 'N/A') => {
        if (!step) return defaultValue;
        return step[property] ?? defaultValue;
    };

    // 根据执行模式获取应显示的步骤 - 修复mode=3的步骤映射
    const getStepsForMode = (mode: string): Array<{
        key: 'login' | 'sign' | 'get_task_ids' | 'delivery' | 'get_balance_id';
        label: string
    }> => {
        const allSteps: Array<{
            key: 'login' | 'sign' | 'get_task_ids' | 'delivery' | 'get_balance_id';
            label: string
        }> = [
            {key: 'login', label: '登录'},
            {key: 'sign', label: '报名'},
            {key: 'get_task_ids', label: '任务ID获取'},
            {key: 'delivery', label: '交付'},
            {key: 'get_balance_id', label: '结算单确认'}
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

    // 文件转Base64
    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result.split(',')[1]);
                } else {
                    reject(new Error('文件转换失败'));
                }
            };
            reader.onerror = (error) => reject(error);
        });
    };

    const goToTaskStep = () => {
        // 在进入任务执行页之前清空历史执行记录
        setExecutionResults([]);
        setPhoneNumbers(phoneNumbers.map(phone => ({
            ...phone,
            status: 'pending',
            success: false,
            error: null,
            steps: {
                login: {},
                sign: {},
                get_task_ids: {},
                delivery: {},
                get_balance_id: {}
            }
        })));
        setCurrentTab('task');
    };

    // 提取手机号列表
    const fetchPhoneNumbers = async () => {
        setError('');
        if (!selectedFile) {
            setError('请先选择文件');
            return;
        }

        try {
            setIsLoading(true);
            const base64Content = await fileToBase64(selectedFile);

            // 验证起始行和结束行
            const start = parseInt(startLine);
            const end = parseInt(endLine);

            if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
                setError('请输入有效的行数范围（起始行 <= 结束行，且均为正数）');
                setIsLoading(false);
                return;
            }

            // 调用后端接口解析文件
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/mobile/parse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    file_content: base64Content,
                    range: `${startLine}-${endLine}`,
                })
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.message && (data.message.includes('超出索引') || data.message.includes('不存在'))) {
                    setError(`行数范围错误: ${data.message}`);
                } else {
                    setError(data.message || '文件解析失败');
                }
                setIsLoading(false);
                return;
            }

            // 更新手机号列表
            setPhoneNumbers(data.data.mobiles.map((mobile: string) => ({
                phone: mobile,
                mobile: mobile,
                status: 'pending',
                success: false,
                error: null,
                steps: {
                    login: {},
                    sign: {},
                    get_task_ids: {},
                    delivery: {},
                    get_balance_id: {} // 初始化结算单步骤
                }
            })));
            setIsLoading(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : '文件处理出错，请重试');
            console.error('文件上传错误:', err);
            setIsLoading(false);
        }
    };

    // 处理文件上传点击
    const handleFileUploadClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    // 处理文件选择
    const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        setError('');
        const file = event.target.files?.[0];
        if (!file) return;

        setSelectedFile(file);
        setPhoneNumbers([]);
        setStartLine('');
        setEndLine('');

        // 清除input值，允许重复选择同一文件
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // 手动提交手机号
    const handleManualSubmit = () => {
        setError('');
        const phones = manualInput.split('\n').filter(phone => phone.trim());
        if (phones.length === 0) {
            toast.error('请输入有效的手机号');
            return;
        }

        setPhoneNumbers(phones.map(phone => ({
            phone: phone.trim(),
            mobile: phone.trim(),
            status: 'pending',
            success: false,
            error: null,
            steps: {
                login: {},
                sign: {},
                get_task_ids: {},
                delivery: {},
                get_balance_id: {} // 初始化结算单步骤
            }
        })));
        setCurrentTab('mode');
    };

    // 清空数据（保留文件和输入框）
    const clearPhoneNumbers = () => {
        setPhoneNumbers([]);
        setManualInput('');
        setError('');
    };

    // 切换手机号详情
    const togglePhoneDetails = (mobile: string) => {
        setExpandedPhone(expandedPhone === mobile ? null : mobile);
    };

    // 格式化步骤数据 - 针对不同步骤类型进行特殊处理
    const formatStepData = (step: StepInfo | undefined, stepKey: string): string => {
        if (!step) return JSON.stringify({}, null, 2);

        // 任务ID获取步骤特殊处理
        if (stepKey === 'get_task_ids') {
            return JSON.stringify({
                taskStaffId: step.taskStaffId || 'N/A',
                taskAssignId: step.taskAssignId || 'N/A',
                code: step.code ?? 'N/A',
                msg: step.msg || ''
            }, null, 2);
        }

        // 结算单确认步骤特殊处理
        if (stepKey === 'get_balance_id') {
            if (step.data?.list?.length === 0 && step.data?.total === 0) {
                return JSON.stringify({list: '无结算单数据', total: 0}, null, 2);
            }
            return JSON.stringify(step.data || '无数据', null, 2);
        }

        // 其他通用步骤
        return JSON.stringify({
            code: step.code ?? 'N/A',
            msg: step.msg || '',
            data: step.data || null
        }, null, 2);
    };

    // 开始执行任务
    const startExecution = async () => {
        setError('');
        if (!taskId || !mode || phoneNumbers.length === 0) {
            setError('请完善任务信息并确保有手机号数据');
            return;
        }

        try {
            setIsRunning(true);
            setCurrentTab('task');

            // 更新任务ID
            const updatedTaskInfo = {
                ...taskInfo,
                task_id: taskId
            };
            setTaskInfo(updatedTaskInfo);

            // 调用后端执行任务接口
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/mobile/task/process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    mobiles: phoneNumbers.map(p => p.phone),
                    file_content: null,
                    range: null,
                    task_info: updatedTaskInfo,
                    mode: mode === 'full' ? null : parseInt(mode),
                    concurrent_workers: parseInt(concurrency),
                    interval_seconds: 0.5,
                    environment: environment
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || '任务执行失败');
            }

            // 处理返回结果
            const formattedResults: PhoneNumber[] = data.data.map((item: ExecutionDetail): PhoneNumber => ({
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
            if (!Array.isArray(data.data)) {
                setError('返回数据格式错误');
                return;
            }

            // 同时更新执行中的列表和结果存储
            setPhoneNumbers(formattedResults);
            setExecutionResults(formattedResults);

            // 轮询获取任务执行结果
            const pollResults = async () => {
                const allCompleted = formattedResults.every((item: PhoneNumber) =>
                    item.status === 'success' || item.status === 'failed'
                );

                if (allCompleted) {
                    setIsRunning(false);
                    setCurrentTab('results');
                } else {
                    setTimeout(() => {
                        setIsRunning(false);
                        setCurrentTab('results');
                    }, 2000);
                }
            };

            // 开始轮询
            setTimeout(pollResults, 2000);
        } catch (err) {
            setIsRunning(false);
            setError(err instanceof Error ? err.message : '任务执行出错，请重试');
            console.error('执行任务错误:', err);
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

        const blob = new Blob([JSON.stringify(results, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `task_${taskId}_results.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // 获取模式描述
    const getModeDescription = (modeValue: string) => {
        switch (modeValue) {
            case 'full':
                return '完整流程（登录→报名→提交交付物）';
            case '1':
                return '登录+报名（mode = 1）';
            case '2':
                return '登录+提交交付物（mode = 2）';
            case '3':
                return '登录+结算确认（mode = 3）';
            default:
                return '';
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <Toaster richColors position="top-center" />
            <div className="max-w-6xl mx-auto">
                <div className="mb-6">
                    <Button variant="ghost" onClick={onBack} className="mb-4">
                        <ArrowLeft className="w-4 h-4 mr-2"/>
                        返回脚本列表
                    </Button>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl">任务自动化管理工具</h1>
                        <Badge variant={isRunning ? "destructive" : "secondary"}>
                            {isRunning ? "执行中" : "就绪"}
                        </Badge>
                    </div>
                    <p className="text-muted-foreground">批量对多个手机号用户执行任务流程操作，支持报名、交付、结算确认等功能</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-md flex items-center">
                        <AlertCircle className="w-4 h-4 mr-2"/>
                        <span>{error}</span>
                    </div>
                )}

                <Tabs value={currentTab} onValueChange={setCurrentTab} className="space-y-6">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="upload">文件上传</TabsTrigger>
                        <TabsTrigger value="mode" disabled={phoneNumbers.length === 0}>模式选择</TabsTrigger>
                        <TabsTrigger value="task" disabled={!mode}>任务执行</TabsTrigger>
                        <TabsTrigger value="results"
                                     disabled={executionResults.filter(p => p.status !== 'pending').length === 0}>执行结果</TabsTrigger>
                    </TabsList>

                    {/* 文件上传页 */}
                    <TabsContent value="upload" className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>上传TXT文件</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <Label htmlFor="file-upload">选择文件</Label>
                                        <div
                                            onClick={handleFileUploadClick}
                                            className="mt-1 border-2 border-dashed border-gray-300 rounded-md p-4 text-center cursor-pointer hover:border-blue-500 transition-colors"
                                        >
                                            <Upload className="w-6 h-6 mx-auto text-gray-400"/>
                                            <p className="mt-2 text-sm text-gray-600">点击或拖拽文件到此处上传</p>
                                            <p className="text-xs text-gray-500 mt-1">支持 .txt 格式文件</p>
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
                                        <div className="space-y-3 animate-fadeIn">
                                            <p className="text-sm text-muted-foreground">
                                                已选择文件: {selectedFile.name}
                                            </p>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <Label htmlFor="start-line">起始行数</Label>
                                                    <Input
                                                        id="start-line"
                                                        type="number"
                                                        value={startLine}
                                                        onChange={(e) => setStartLine(e.target.value)}
                                                        placeholder="请输入起始行"
                                                        min="1"
                                                    />
                                                </div>
                                                <div>
                                                    <Label htmlFor="end-line">结束行数</Label>
                                                    <Input
                                                        id="end-line"
                                                        type="number"
                                                        value={endLine}
                                                        onChange={(e) => setEndLine(e.target.value)}
                                                        placeholder="请输入结束行"
                                                        min={startLine || 1}
                                                    />
                                                </div>
                                            </div>

                                            <Button
                                                onClick={fetchPhoneNumbers}
                                                disabled={!startLine || !endLine || isLoading}
                                                className="w-full"
                                            >
                                                {isLoading ? '获取中...' : '获取手机号列表'}
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>手动输入手机号</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <Label htmlFor="manual-input">手机号列表（每行一个）</Label>
                                        <Textarea
                                            id="manual-input"
                                            value={manualInput}
                                            onChange={(e) => setManualInput(e.target.value)}
                                            placeholder="13800138001&#10;13800138002&#10;13800138003"
                                            rows={8}
                                        />
                                    </div>
                                    <Button onClick={handleManualSubmit} className="w-full">
                                        <Upload className="w-4 h-4 mr-2"/>
                                        提交手机号
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>

                        {phoneNumbers.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle>已提取手机号列表</CardTitle>
                                        <div className="flex gap-2">
                                            <Badge variant="outline">{phoneNumbers.length} 个手机号</Badge>
                                            <Button variant="outline" size="sm" onClick={clearPhoneNumbers}>
                                                <Trash2 className="w-4 h-4 mr-2"/>
                                                清空列表
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="max-h-48 overflow-y-auto">
                                        <div className="grid grid-cols-4 gap-2">
                                            {phoneNumbers.map((phone, index) => (
                                                <div key={index} className="text-sm p-2 bg-gray-100 rounded">
                                                    {phone.phone}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <Button
                                        onClick={() => setCurrentTab('mode')}
                                        className="w-full mt-4"
                                    >
                                        下一步：选择模式
                                    </Button>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    {/* 模式选择页 */}
                    <TabsContent value="mode" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>执行模式配置</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div>
                                    <Label htmlFor="mode-select">选择执行模式</Label>
                                    <Select value={mode} onValueChange={setMode}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="选择执行模式"/>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="full">完整流程</SelectItem>
                                            <SelectItem value="1">登录+报名</SelectItem>
                                            <SelectItem value="2">登录+提交交付物</SelectItem>
                                            <SelectItem value="3">登录+结算确认</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {mode && (
                                        <p className="text-sm text-muted-foreground mt-2">
                                            {getModeDescription(mode)}
                                        </p>
                                    )}
                                </div>

                                {/* 新增环境配置选项 */}
                                <div>
                                    <Label htmlFor="environment-select">运行环境</Label>
                                    <Select value={environment} onValueChange={setEnvironment}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="选择运行环境"/>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="test">Beta</SelectItem>
                                            <SelectItem value="prod">生产环境</SelectItem>
                                            {/*<SelectItem value="local">本地环境</SelectItem>*/}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="execution-type">执行方式</Label>
                                        <Select value={executionType} onValueChange={setExecutionType}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="选择执行方式"/>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="sequential">顺序执行</SelectItem>
                                                <SelectItem value="concurrent">并发执行</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="concurrency">并发线程数</Label>
                                        <Input
                                            id="concurrency"
                                            type="number"
                                            value={concurrency}
                                            onChange={(e) => setConcurrency(e.target.value)}
                                            min="1"
                                            max="200"
                                            disabled={executionType !== 'concurrent'}
                                        />
                                    </div>
                                </div>

                                <Button
                                    onClick={goToTaskStep}
                                    disabled={!mode}
                                    className="w-full"
                                >
                                    下一步：执行任务
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* 任务执行页 */}
                    <TabsContent value="task" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>任务执行</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label htmlFor="task-id">任务ID</Label>
                                    <Input
                                        id="task-id"
                                        value={taskId}
                                        onChange={(e) => setTaskId(e.target.value)}
                                        placeholder="输入任务ID"
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <Button
                                        onClick={startExecution}
                                        disabled={!taskId || isRunning || phoneNumbers.length === 0}
                                        className="flex-1"
                                    >
                                        <Play className="w-4 h-4 mr-2"/>
                                        {isRunning ? '执行中...' : '开始执行'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>执行状态</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>手机号</TableHead>
                                            <TableHead>执行状态</TableHead>
                                            <TableHead>结果/原因</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(executionResults.length > 0 ? executionResults : phoneNumbers).map((phone, index) => (
                                            <React.Fragment key={index}>
                                                <TableRow>
                                                    <TableCell>{phone.phone}</TableCell>
                                                    <TableCell>
                                                        {phone.status === 'pending' && (
                                                            <Badge variant="outline">待执行</Badge>
                                                        )}
                                                        {phone.status === 'success' && (
                                                            <Badge variant="secondary"
                                                                   className="bg-green-100 text-green-800">成功</Badge>
                                                        )}
                                                        {phone.status === 'failed' && (
                                                            <Badge variant="destructive">失败</Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {phone.status === 'success' && '执行成功'}
                                                        {phone.status === 'failed' && phone.error}
                                                        {phone.status === 'pending' && '-'}
                                                    </TableCell>
                                                </TableRow>

                                                {/* 显示详细步骤信息 */}
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
                                                                        <ChevronDown className="w-4 h-4 mr-1"/>
                                                                        隐藏步骤详情
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <ChevronRight className="w-4 h-4 mr-1"/>
                                                                        查看步骤详情
                                                                    </>
                                                                )}
                                                            </Button>

                                                            {expandedPhone === phone.mobile && (
                                                                <div
                                                                    className="mt-2 p-3 bg-gray-50 rounded-md text-sm space-y-4">
                                                                    {getStepsForMode(mode).map(({key, label}) => (
                                                                        <div key={key}>
                                                                            <p className="font-medium">{label}步骤：</p>

                                                                            {/* mode=3 结算单确认步骤特殊展示 */}
                                                                            {mode === '3' && key === 'get_balance_id' ? (
                                                                                <>
                                                                                    <p>状态码：{getStepProperty(phone.steps[key], 'code')}</p>
                                                                                    <p>信息：{getStepProperty(phone.steps[key], 'msg') || '无信息'}</p>

                                                                                    <div className="mt-1">
                                                                                        <p className="font-medium">结算单数据：</p>
                                                                                        <pre
                                                                                            className="bg-gray-100 p-2 rounded overflow-x-auto text-xs">
                                                      {formatStepData(phone.steps[key], key)}
                                                    </pre>
                                                                                    </div>

                                                                                    {/* 显示无可确认的结算单异常 */}
                                                                                    {!phone.success && phone.error === "无可确认的结算单" && (
                                                                                        <div
                                                                                            className="mt-2 p-2 bg-red-50 text-red-600 rounded text-xs">
                                                                                            <AlertCircle
                                                                                                className="w-3 h-3 inline mr-1"/>
                                                                                            异常：{phone.error}
                                                                                        </div>
                                                                                    )}
                                                                                </>
                                                                            ) : (
                                                                                // 其他步骤统一JSON格式展示
                                                                                <pre
                                                                                    className="bg-gray-100 p-2 rounded overflow-x-auto text-xs">
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
                                        <Download className="w-4 h-4 mr-2"/>
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
                                            <React.Fragment key={index}>
                                                <TableRow>
                                                    <TableCell>{phone.phone}</TableCell>
                                                    <TableCell>
                                                        {phone.status === 'success' && (
                                                            <Badge variant="secondary"
                                                                   className="bg-green-100 text-green-800">执行成功</Badge>
                                                        )}
                                                        {phone.status === 'failed' && (
                                                            <Badge variant="destructive">执行失败</Badge>
                                                        )}
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

                                                {/* 详细步骤信息 */}
                                                {expandedPhone === phone.mobile && (
                                                    <TableRow>
                                                        <TableCell colSpan={3}>
                                                            <div className="p-4 bg-gray-50 rounded-md space-y-4">
                                                                {getStepsForMode(mode).map(({key, label}) => (
                                                                    <div key={key}>
                                                                        <h4 className="font-medium mb-2">{label}信息</h4>

                                                                        {/* mode=3 结算单确认步骤特殊展示 */}
                                                                        {mode === '3' && key === 'get_balance_id' ? (
                                                                            <div
                                                                                className="bg-gray-100 p-3 rounded overflow-x-auto">
                                                                                <p className="mb-1"><span
                                                                                    className="font-medium">状态码：</span>{getStepProperty(phone.steps[key], 'code')}
                                                                                </p>
                                                                                <p className="mb-1"><span
                                                                                    className="font-medium">信息：</span>{getStepProperty(phone.steps[key], 'msg') || '无信息'}
                                                                                </p>

                                                                                <div className="mt-2">
                                                                                    <p className="font-medium mb-1">结算单数据：</p>
                                                                                    <pre
                                                                                        className="text-xs">{formatStepData(phone.steps[key], key)}</pre>
                                                                                </div>

                                                                                {!phone.success && phone.error === "无可确认的结算单" && (
                                                                                    <div
                                                                                        className="mt-2 p-2 bg-red-50 text-red-600 rounded text-xs">
                                                                                        <AlertCircle
                                                                                            className="w-3 h-3 inline mr-1"/>
                                                                                        异常：{phone.error}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        ) : (
                                                                            // 其他步骤统一JSON格式展示
                                                                            <pre
                                                                                className="bg-gray-100 p-2 rounded overflow-x-auto text-xs">
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
