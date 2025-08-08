import React, {useState, useEffect} from 'react';
import {
    AlertCircle,
    ArrowLeft,
    Copy,
    Download,
    Info,
    Play,
    RotateCcw,
    Search,
    Check,
    X,
    Loader2,
    RefreshCw as Refresh
} from 'lucide-react';
import {Button} from './ui/button';
import {Card, CardContent, CardHeader, CardTitle} from './ui/card';
import {Input} from './ui/input';
import {Label} from './ui/label';
import {Badge} from './ui/badge';
import {Tabs, TabsContent, TabsList, TabsTrigger} from './ui/tabs';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from './ui/table';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from './ui/select';
import {Textarea} from './ui/textarea';
import {Checkbox} from './ui/checkbox';
import axios from 'axios';
import {Toaster, toast} from 'sonner';

// 定义接口类型
interface Template {
    code: string;
    name: string;
}

interface SendResult {
    mobile: string;
    template_code?: string;
    template_name?: string;
    result: {
        code: number;
        data: number;
        msg: string;
        open: boolean;
    };
}

interface ApiResponse<T = unknown> {
    success: boolean;
    message: string;
    data: T;
    request_id: string;
    total?: number;
    success_count?: number;
    failure_count?: number;
}

interface TemplateParam {
    name: string;
    value: string;
}

// 补充缺失的组件定义
const CheckCircle = ({className}: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
);

const RadioButton = ({id, checked, onCheckedChange, label}: {
    id: string;
    checked: boolean;
    onCheckedChange: () => void;
    label: string;
}) => (
    <div className="flex items-center space-x-2 cursor-pointer">
        <input type="radio" id={id} checked={checked} onChange={onCheckedChange}
               className="w-4 h-4 text-blue-600 border-gray-300 rounded-full focus:ring-blue-500"/>
        <label htmlFor={id} className="text-sm font-medium text-gray-700">{label}</label>
    </div>
);


export default function SmsManagementScript({onBack}: { onBack: () => void }) {
    const [environment, setEnvironment] = useState('test');
    const [timeout, setTimeoutValue] = useState(15);
    const [allTemplates, setAllTemplates] = useState<Template[]>([]);
    const [allowedTemplates, setAllowedTemplates] = useState<Template[]>([]);
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<string>('');
    const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
    const [usePresetMobiles, setUsePresetMobiles] = useState(true);
    const [mobiles, setMobiles] = useState('');
    const [randomSend, setRandomSend] = useState(false);
    const [templateParams, setTemplateParams] = useState<TemplateParam[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [resendType, setResendType] = useState<'mobile' | 'batch'>('mobile');
    const [resendMobile, setResendMobile] = useState('');
    const [resendBatchNo, setResendBatchNo] = useState('');
    const [isResending, setIsResending] = useState(false);
    const [resendResult, setResendResult] = useState<ApiResponse | null>(null);
    const [sendResults, setSendResults] = useState<SendResult[]>([]);
    const [sendStats, setSendStats] = useState({total: 0, success: 0, failure: 0});
    const [expandedResult, setExpandedResult] = useState<string | null>(null);
    const [allTemplatesFormatted, setAllTemplatesFormatted] = useState<Record<string, string>>({});
    const [showFormatted, setShowFormatted] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);

    const fetchAllowedTemplates = async () => {
        setIsLoadingTemplates(true);
        try {
            const response = await axios.post<ApiResponse<Template[]>>(
                process.env.NEXT_PUBLIC_API_BASE_URL + '/sms/templates/allowed',
                {environment, timeout}
            );
            setAllowedTemplates(response.data.data as Template[]);
            toast.success(response.data.message);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : '获取允许的模板失败，请重试';
            toast.error(errorMsg);
        } finally {
            setIsLoadingTemplates(false);
        }
    };

    const fetchAllTemplates = async () => {
        setIsLoadingTemplates(true);
        try {
            const response = await axios.post<ApiResponse<Template[]>>(
                process.env.NEXT_PUBLIC_API_BASE_URL + '/sms/templates',
                {environment, timeout}
            );
            const templates = response.data.data as Template[];
            setAllTemplates(templates);
            toast.success(response.data.message);

            const formatted: Record<string, string> = {};
            templates.forEach(template => {
                formatted[template.code] = template.name.trim();
            });
            setAllTemplatesFormatted(formatted);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : '获取模板列表失败，请重试';
            toast.error(errorMsg);
        } finally {
            setIsLoadingTemplates(false);
        }
    };

    const updateTemplateConfig = async () => {
        setIsLoadingTemplates(true);
        const promise = () => new Promise(async (resolve, reject) => {
            try {
                const response = await axios.post<ApiResponse>(
                    process.env.NEXT_PUBLIC_API_BASE_URL + '/sms/templates/update',
                    {environment, timeout}
                );
                if (response.data.success) {
                    await fetchAllTemplates();
                    await fetchAllowedTemplates();
                    resolve(response.data.message);
                } else {
                    reject(new Error(response.data.message));
                }
            } catch (err) {
                reject(err);
            } finally {
                setIsLoadingTemplates(false);
            }
        });
        toast.promise(promise, {
            loading: '正在更新模板配置...',
            success: (message) => `${message}`,
            error: (err) => err instanceof Error ? err.message : '更新模板配置失败',
        });
    };

    const copyFormattedTemplates = () => {
        if (Object.keys(allTemplatesFormatted).length === 0) return;
        const entries = Object.entries(allTemplatesFormatted);
        const templateLines = entries.map(([code, name], index) => `    "${code}": "${name}"${index === entries.length - 1 ? '' : ','}`);
        const templateString = `self.allowed_templates = {\n${templateLines.join('\n')}\n}`;
        navigator.clipboard.writeText(templateString)
            .then(() => {
                setCopySuccess(true);
                toast.success('模板代码已成功复制到剪贴板');
                setTimeout(() => setCopySuccess(false), 3000);
            })
            .catch(() => toast.error('复制失败，请手动复制'));
    };

    const handleTemplateChange = (code: string) => {
        setSelectedTemplate(code);
        if (code === 'reset_worker_sign') {
            setTemplateParams([{name: 'name', value: '张三'}, {name: 'deadline', value: '2025-12-31'}, {
                name: 'signUrl',
                value: '5a3'
            }]);
        } else if (code === 'channel_open_notice') {
            setTemplateParams([{name: 'channel_name', value: '默认渠道'}, {
                name: 'open_time',
                value: new Date().toLocaleString()
            }]);
        } else {
            setTemplateParams([]);
        }
    };

    const handleParamChange = (index: number, value: string) => {
        const newParams = [...templateParams];
        newParams[index].value = value;
        setTemplateParams(newParams);
    };

    const sendSingleTemplate = async () => {
        if (!selectedTemplate) return toast.error('请选择发送模板');
        if (!usePresetMobiles && !mobiles.trim()) return toast.error('请输入手机号');
        setIsSending(true);
        try {
            const mobileList = usePresetMobiles ? [] : mobiles.split(',').map(m => m.trim()).filter(Boolean);
            const paramsObj: Record<string, string> = {};
            templateParams.forEach(param => {
                paramsObj[param.name] = param.value;
            });
            const response = await axios.post<ApiResponse<SendResult[]>>(
                process.env.NEXT_PUBLIC_API_BASE_URL + '/sms/send/single',
                {
                    environment,
                    timeout,
                    template_code: selectedTemplate,
                    use_preset_mobiles: usePresetMobiles,
                    mobiles: mobileList,
                    params: paramsObj
                }
            );
            setSendResults(response.data.data as SendResult[]);
            setSendStats({
                total: response.data.total || 0,
                success: response.data.success_count || 0,
                failure: response.data.failure_count || 0
            });
            toast.success(response.data.message);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '发送短信失败，请重试');
        } finally {
            setIsSending(false);
        }
    };

    const sendBatchTemplates = async () => {
        if (selectedTemplates.length === 0) return toast.error('请至少选择一个发送模板');
        if (!usePresetMobiles && !mobiles.trim()) return toast.error('请输入手机号');
        setIsSending(true);
        try {
            const mobileList = usePresetMobiles ? [] : mobiles.split(',').map(m => m.trim()).filter(Boolean);
            const response = await axios.post<ApiResponse<SendResult[]>>(
                process.env.NEXT_PUBLIC_API_BASE_URL + '/sms/send/batch',
                {
                    environment,
                    timeout,
                    template_codes: selectedTemplates,
                    use_preset_mobiles: usePresetMobiles,
                    mobiles: mobileList,
                    random_send: randomSend
                }
            );
            setSendResults(response.data.data as SendResult[]);
            setSendStats({
                total: response.data.total || 0,
                success: response.data.success_count || 0,
                failure: response.data.failure_count || 0
            });
            toast.success(response.data.message);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '批量发送短信失败，请重试');
        } finally {
            setIsSending(false);
        }
    };

    const resendSignSms = async () => {
        setIsResending(true);
        try {
            if (resendType === 'mobile' && (!resendMobile.trim() || !/^1[3-9]\d{9}$/.test(resendMobile.trim()))) throw new Error('请输入正确的手机号');
            if (resendType === 'batch' && !resendBatchNo.trim()) throw new Error('请输入批次号');

            const params = resendType === 'mobile' ? {mobiles: [resendMobile.trim()]} : {batch_no: resendBatchNo.trim()};
            const response = await axios.post<ApiResponse>(
                process.env.NEXT_PUBLIC_API_BASE_URL + '/sms/resend',
                {environment, timeout, template_code: 'reset_worker_sign', ...params}
            );
            setResendResult(response.data);
            if (response.data.success) {
                toast.success(response.data.message);
            } else {
                toast.error(response.data.message);
            }
        } catch (err) {
            let errorMsg = '补发签约短信失败，请重试';
            if (axios.isAxiosError(err)) {
                errorMsg = err.response?.data?.detail || err.response?.data?.message || `请求失败: ${err.response?.status}`;
            } else if (err instanceof Error) {
                errorMsg = err.message;
            }
            toast.error(errorMsg);
            setResendResult(null);
        } finally {
            setIsResending(false);
        }
    };

    const toggleTemplateSelection = (code: string) => setSelectedTemplates(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
    const toggleResultDetails = (mobile: string) => setExpandedResult(expandedResult === mobile ? null : mobile);

    const downloadResults = () => {
        if (sendResults.length === 0) return toast.info("没有结果可供下载");
        const results = {
            timestamp: new Date().toISOString(),
            environment,
            total: sendStats.total,
            success: sendStats.success,
            failure: sendStats.failure,
            details: sendResults
        };
        const blob = new Blob([JSON.stringify(results, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sms_send_results_${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const LoadingButton = ({onClick, disabled, isLoading, children, className = "", icon: Icon}: {
        onClick: () => void;
        disabled: boolean;
        isLoading: boolean;
        children: React.ReactNode;
        className?: string;
        icon?: React.ElementType;
    }) => (
        <Button onClick={onClick} disabled={disabled || isLoading} className={className}>
            {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/>处理中...</> : Icon ? <><Icon
                className="w-4 h-4 mr-2"/>{children}</> : children}
        </Button>
    );

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <Toaster richColors position="top-center"/>
            <div className="max-w-6xl mx-auto">
                <div className="mb-6">
                    <Button variant="ghost" onClick={onBack} className="mb-4"><ArrowLeft className="w-4 h-4 mr-2"/>返回脚本列表</Button>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl">短信模板管理与发送</h1>
                        <Badge
                            variant={isSending || isLoadingTemplates || isResending ? "destructive" : "secondary"}>{isSending ? "发送中" : isResending ? "补发中" : isLoadingTemplates ? "加载中" : "就绪"}</Badge>
                    </div>
                    <p className="text-muted-foreground">管理短信模板并批量发送短信，支持单模板和多模板批量发送</p>
                </div>

                <Tabs defaultValue="templateManagement" className="space-y-6">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="templateManagement">模板管理</TabsTrigger>
                        <TabsTrigger value="singleSend">单模板发送</TabsTrigger>
                        <TabsTrigger value="batchSend">批量模板发送</TabsTrigger>
                        <TabsTrigger value="resendSign">补发签约短信</TabsTrigger>
                    </TabsList>

                    <TabsContent value="templateManagement" className="space-y-6 animate-in fade-in-50 duration-300">
                        <Card>
                            <CardHeader><CardTitle>模板配置</CardTitle></CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                                    <div><Label htmlFor="env-select">环境</Label><Select value={environment}
                                                                                         onValueChange={setEnvironment}><SelectTrigger><SelectValue
                                        placeholder="选择环境"/></SelectTrigger><SelectContent><SelectItem
                                        value="test">Beta</SelectItem><SelectItem
                                        value="prod">生产环境</SelectItem></SelectContent></Select></div>
                                    <div><Label htmlFor="timeout-input">超时时间(秒)</Label><Input id="timeout-input"
                                                                                                   type="number"
                                                                                                   value={timeout}
                                                                                                   onChange={(e) => setTimeoutValue(Number(e.target.value))}
                                                                                                   min="1" max="60"
                                                                                                   required/></div>
                                    <LoadingButton onClick={fetchAllTemplates} disabled={false}
                                                   isLoading={isLoadingTemplates} icon={Search}
                                                   className="w-full">获取所有模板</LoadingButton>
                                    <LoadingButton onClick={() => fetchAllowedTemplates()} disabled={false}
                                                   isLoading={isLoadingTemplates} icon={Check}
                                                   className="w-full">获取允许的模板</LoadingButton>
                                    <Button onClick={() => setShowFormatted(!showFormatted)}
                                            disabled={allTemplates.length === 0} variant="ghost"
                                            className="w-full">{showFormatted ? '隐藏格式' : '查看代码格式'}</Button>
                                    <LoadingButton onClick={updateTemplateConfig} disabled={false}
                                                   isLoading={isLoadingTemplates} icon={RotateCcw}
                                                   className="w-full">更新模板配置</LoadingButton>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle>模板列表</CardTitle></CardHeader>
                            <CardContent>{allTemplates.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground"><Info
                                    className="w-12 h-12 mx-auto mb-4 opacity-50 text-blue-500"/>
                                    <p>点击&quot;获取所有模板&quot;按钮加载模板列表</p></div>) : (
                                <Table><TableHeader><TableRow><TableHead>模板编码</TableHead><TableHead>模板名称</TableHead><TableHead>状态</TableHead></TableRow></TableHeader><TableBody>{allTemplates.map((template) => (
                                    <TableRow
                                        key={template.code}><TableCell>{template.code}</TableCell><TableCell>{template.name}</TableCell><TableCell><Badge
                                        variant={allowedTemplates.some(t => t.code === template.code) ? "secondary" : "outline"}
                                        className={allowedTemplates.some(t => t.code === template.code) ? "bg-green-100 text-green-800 hover:bg-green-200" : ""}>{allowedTemplates.some(t => t.code === template.code) ? "允许发送" : "限制发送"}</Badge></TableCell></TableRow>))}</TableBody></Table>)}</CardContent>
                        </Card>
                        {showFormatted && allTemplates.length > 0 && (
                            <Card className="animate-in fade-in slide-in-from-top-5 duration-300"><CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>所有模板代码格式</CardTitle><Button onClick={copyFormattedTemplates}
                                                                                   size="sm"
                                                                                   className="gap-1">{copySuccess ? <>
                                    <Check className="w-4 h-4"/>已复制</> : <><Copy
                                    className="w-4 h-4"/>复制到剪贴板</>}</Button></div>
                            </CardHeader><CardContent>
                                <pre
                                    className="p-4 bg-gray-800 text-gray-100 rounded-md overflow-x-auto max-h-96 text-sm">{`self.allowed_templates = {\n${Object.entries(allTemplatesFormatted).map(([code, name], index) => `    "${code}": "${name}"${index === Object.entries(allTemplatesFormatted).length - 1 ? '' : ','}`).join('\n')}\n}`}</pre>
                                <p className="text-xs text-gray-500 mt-2">点击复制按钮可直接将格式复制到剪贴板，方便粘贴到代码中</p>
                            </CardContent></Card>)}
                    </TabsContent>

                    <TabsContent value="singleSend" className="space-y-6 animate-in fade-in-50 duration-300">
                        <Card>
                            <CardHeader><CardTitle>单模板发送配置</CardTitle></CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div><Label htmlFor="single-env-select">环境</Label><Select value={environment}
                                                                                                onValueChange={setEnvironment}><SelectTrigger><SelectValue
                                        placeholder="选择环境"/></SelectTrigger><SelectContent><SelectItem
                                        value="test">Beta</SelectItem><SelectItem
                                        value="prod">生产环境</SelectItem></SelectContent></Select></div>
                                    <div><Label htmlFor="timeout-single-input">超时时间(秒)</Label><Input
                                        id="timeout-single-input" type="number" value={timeout}
                                        onChange={(e) => setTimeoutValue(Number(e.target.value))} min="1" max="60"
                                        required/></div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <div className="flex justify-between items-center mb-1"><Label
                                            htmlFor="single-template-select">选择模板</Label><Button variant="ghost"
                                                                                                     size="sm"
                                                                                                     onClick={() => fetchAllowedTemplates()}
                                                                                                     disabled={isLoadingTemplates}><Refresh
                                            className="w-4 h-4 mr-1"/>刷新</Button></div>
                                        <Select value={selectedTemplate}
                                                onValueChange={handleTemplateChange}><SelectTrigger><SelectValue
                                            placeholder="选择发送模板"/></SelectTrigger><SelectContent>{allowedTemplates.map((template) => (
                                            <SelectItem key={template.code}
                                                        value={template.code}>{template.name} ({template.code})</SelectItem>))}</SelectContent></Select>
                                    </div>
                                    <div className="flex items-end">
                                        <div className="flex items-center space-x-2"><Checkbox id="use-preset-single"
                                                                                               checked={usePresetMobiles}
                                                                                               onCheckedChange={(checked) => setUsePresetMobiles(checked as boolean)}/><Label
                                            htmlFor="use-preset-single">使用预设手机号</Label></div>
                                    </div>
                                </div>
                                <div><Label htmlFor="mobiles-single-input">手机号（多个用逗号分隔）</Label><Textarea
                                    id="mobiles-single-input" value={mobiles}
                                    onChange={(e) => setMobiles(e.target.value)}
                                    placeholder="13800138001,13800138002,13800138003" rows={2}
                                    disabled={usePresetMobiles}/></div>
                                {selectedTemplate && (<div><Label>模板参数</Label>
                                    <div
                                        className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">{templateParams.map((param, index) => (
                                        <div key={index}><Label htmlFor={`param-${index}`}>{param.name}</Label><Input
                                            id={`param-${index}`} value={param.value}
                                            onChange={(e) => handleParamChange(index, e.target.value)}
                                            placeholder={`请输入${param.name}`}/></div>))}</div>
                                </div>)}
                                <LoadingButton onClick={sendSingleTemplate} disabled={!selectedTemplate}
                                               isLoading={isSending} icon={Play}
                                               className="w-full">发送短信</LoadingButton>
                            </CardContent>
                        </Card>
                        {sendResults.length > 0 && (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><Card><CardContent
                                    className="pt-6">
                                    <div className="text-center"><p
                                        className="text-sm text-muted-foreground">总发送数</p><p
                                        className="text-2xl">{sendStats.total}</p></div>
                                </CardContent></Card><Card><CardContent className="pt-6">
                                    <div className="text-center"><p className="text-sm text-muted-foreground">成功数</p>
                                        <p className="text-2xl text-green-600">{sendStats.success}</p></div>
                                </CardContent></Card><Card><CardContent className="pt-6">
                                    <div className="text-center"><p className="text-sm text-muted-foreground">失败数</p>
                                        <p className="text-2xl text-red-600">{sendStats.failure}</p></div>
                                </CardContent></Card></div>
                                <Card><CardHeader>
                                    <div className="flex justify-between items-center">
                                        <CardTitle>发送结果详情</CardTitle><Button onClick={downloadResults}
                                                                                   size="sm"><Download
                                        className="w-4 h-4 mr-2"/>下载结果</Button></div>
                                </CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>手机号</TableHead><TableHead>发送状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{sendResults.map((result, index) => (
                                    <React.Fragment
                                        key={index}><TableRow><TableCell>{result.mobile}</TableCell><TableCell>{result.result.code === 0 ? (
                                        <Badge variant="secondary"
                                               className="bg-green-100 text-green-800">发送成功</Badge>) : (
                                        <Badge variant="destructive">发送失败</Badge>)}</TableCell><TableCell><Button
                                        variant="ghost" size="sm"
                                        onClick={() => toggleResultDetails(result.mobile)}>{expandedResult === result.mobile ? '隐藏详情' : '查看详情'}</Button></TableCell></TableRow>{expandedResult === result.mobile && (
                                        <TableRow><TableCell colSpan={3}>
                                            <div
                                                className="p-3 bg-gray-50 rounded-md text-sm animate-in fade-in-50 duration-200">
                                                <pre
                                                    className="whitespace-pre-wrap">{JSON.stringify(result.result, null, 2)}</pre>
                                            </div>
                                        </TableCell></TableRow>)}</React.Fragment>))}</TableBody></Table></CardContent></Card>
                            </>
                        )}
                    </TabsContent>

                    <TabsContent value="batchSend" className="space-y-6 animate-in fade-in-50 duration-300">
                        <Card>
                            <CardHeader><CardTitle>批量模板发送配置</CardTitle></CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div><Label htmlFor="batch-env-select">环境</Label><Select value={environment}
                                                                                               onValueChange={setEnvironment}><SelectTrigger><SelectValue
                                        placeholder="选择环境"/></SelectTrigger><SelectContent><SelectItem
                                        value="test">Beta</SelectItem><SelectItem
                                        value="prod">生产环境</SelectItem></SelectContent></Select></div>
                                    <div><Label htmlFor="timeout-batch-input">超时时间(秒)</Label><Input
                                        id="timeout-batch-input" type="number" value={timeout}
                                        onChange={(e) => setTimeoutValue(Number(e.target.value))} min="1" max="60"
                                        required/></div>
                                </div>
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <Label>选择模板（可多选）</Label><Button variant="ghost" size="sm"
                                                                               onClick={() => fetchAllowedTemplates()}
                                                                               disabled={isLoadingTemplates}><Refresh
                                        className="w-4 h-4 mr-1"/>刷新允许的模板</Button></div>
                                    <div
                                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{allowedTemplates.map((template) => (
                                        <div key={template.code}
                                             className={`p-3 border rounded-md cursor-pointer transition-all duration-200 ${selectedTemplates.includes(template.code) ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'}`}
                                             onClick={() => toggleTemplateSelection(template.code)}>
                                            <div className="flex items-center"><Checkbox
                                                checked={selectedTemplates.includes(template.code)}
                                                onCheckedChange={() => toggleTemplateSelection(template.code)}
                                                className="mr-2"/>
                                                <div><p className="font-medium">{template.name}</p><p
                                                    className="text-xs text-muted-foreground">{template.code}</p></div>
                                            </div>
                                        </div>))}</div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div><Label htmlFor="mobiles-batch-input">手机号（多个用逗号分隔）</Label><Textarea
                                        id="mobiles-batch-input" value={mobiles}
                                        onChange={(e) => setMobiles(e.target.value)}
                                        placeholder="13800138001,13800138002,13800138003" rows={2}
                                        disabled={usePresetMobiles}/></div>
                                    <div className="flex flex-col gap-4 justify-end">
                                        <div className="flex items-center space-x-2"><Checkbox id="use-preset-batch"
                                                                                               checked={usePresetMobiles}
                                                                                               onCheckedChange={(checked) => setUsePresetMobiles(checked as boolean)}/><Label
                                            htmlFor="use-preset-batch">使用预设手机号</Label></div>
                                        <div className="flex items-center space-x-2"><Checkbox id="random-send"
                                                                                               checked={randomSend}
                                                                                               onCheckedChange={(checked) => setRandomSend(checked as boolean)}/><Label
                                            htmlFor="random-send">随机发送顺序</Label></div>
                                    </div>
                                </div>
                                <LoadingButton onClick={sendBatchTemplates} disabled={selectedTemplates.length === 0}
                                               isLoading={isSending} icon={Play}
                                               className="w-full">批量发送短信</LoadingButton>
                            </CardContent>
                        </Card>
                        {sendResults.length > 0 && (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><Card><CardContent
                                    className="pt-6">
                                    <div className="text-center"><p
                                        className="text-sm text-muted-foreground">总发送数</p><p
                                        className="text-2xl">{sendStats.total}</p></div>
                                </CardContent></Card><Card><CardContent className="pt-6">
                                    <div className="text-center"><p className="text-sm text-muted-foreground">成功数</p>
                                        <p className="text-2xl text-green-600">{sendStats.success}</p></div>
                                </CardContent></Card><Card><CardContent className="pt-6">
                                    <div className="text-center"><p className="text-sm text-muted-foreground">失败数</p>
                                        <p className="text-2xl text-red-600">{sendStats.failure}</p></div>
                                </CardContent></Card></div>
                                <Card><CardHeader>
                                    <div className="flex justify-between items-center">
                                        <CardTitle>发送结果详情</CardTitle><Button onClick={downloadResults}
                                                                                   size="sm"><Download
                                        className="w-4 h-4 mr-2"/>下载结果</Button></div>
                                </CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>手机号</TableHead><TableHead>模板</TableHead><TableHead>发送状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{sendResults.map((result, index) => (
                                    <React.Fragment
                                        key={index}><TableRow><TableCell>{result.mobile}</TableCell><TableCell>{result.template_name}
                                        <p className="text-xs text-muted-foreground">{result.template_code}</p>
                                    </TableCell><TableCell>{result.result.code === 0 ? (<Badge variant="secondary"
                                                                                               className="bg-green-100 text-green-800">发送成功</Badge>) : (
                                        <Badge variant="destructive">发送失败</Badge>)}</TableCell><TableCell><Button
                                        variant="ghost" size="sm"
                                        onClick={() => toggleResultDetails(result.mobile)}>{expandedResult === result.mobile ? '隐藏详情' : '查看详情'}</Button></TableCell></TableRow>{expandedResult === result.mobile && (
                                        <TableRow><TableCell colSpan={4}>
                                            <div
                                                className="p-3 bg-gray-50 rounded-md text-sm animate-in fade-in-50 duration-200">
                                                <pre
                                                    className="whitespace-pre-wrap">{JSON.stringify(result.result, null, 2)}</pre>
                                            </div>
                                        </TableCell></TableRow>)}</React.Fragment>))}</TableBody></Table></CardContent></Card>
                            </>
                        )}
                    </TabsContent>

                    <TabsContent value="resendSign" className="space-y-6 animate-in fade-in-50 duration-300">
                        <Card>
                            <CardHeader><CardTitle>补发共享协议签约短信</CardTitle></CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div><Label htmlFor="resend-env-select">环境</Label><Select value={environment}
                                                                                                onValueChange={setEnvironment}><SelectTrigger><SelectValue
                                        placeholder="选择环境"/></SelectTrigger><SelectContent><SelectItem
                                        value="test">Beta</SelectItem><SelectItem
                                        value="prod">生产环境</SelectItem></SelectContent></Select></div>
                                    <div><Label htmlFor="timeout-resend-input">超时时间(秒)</Label><Input
                                        id="timeout-resend-input" type="number" value={timeout}
                                        onChange={(e) => setTimeoutValue(Number(e.target.value))} min="1" max="60"
                                        required/></div>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-3"><Label>补发方式</Label>
                                        <div className="flex space-x-6"><RadioButton id="resend-by-mobile"
                                                                                     checked={resendType === 'mobile'}
                                                                                     onCheckedChange={() => setResendType('mobile')}
                                                                                     label="按手机号补发"/><RadioButton
                                            id="resend-by-batch" checked={resendType === 'batch'}
                                            onCheckedChange={() => setResendType('batch')} label="按批次号补发"/></div>
                                    </div>
                                    {resendType === 'mobile' ? (
                                        <div><Label htmlFor="resend-mobile-input">手机号</Label><Input
                                            id="resend-mobile-input" value={resendMobile}
                                            onChange={(e) => setResendMobile(e.target.value)}
                                            placeholder="请输入需要补发的手机号" maxLength={11}/><p
                                            className="text-xs text-muted-foreground mt-1">请输入正确的11位手机号码</p>
                                        </div>) : (<div><Label htmlFor="resend-batch-input">批次号</Label><Input
                                        id="resend-batch-input" value={resendBatchNo}
                                        onChange={(e) => setResendBatchNo(e.target.value)}
                                        placeholder="请输入需要补发的批次号"/><p
                                        className="text-xs text-muted-foreground mt-1">请输入该批次的唯一标识编号</p>
                                    </div>)}</div>
                                <LoadingButton onClick={resendSignSms} disabled={false} isLoading={isResending}
                                               icon={Play} className="w-full">补发签约短信</LoadingButton>
                            </CardContent>
                        </Card>
                        {resendResult && (
                            <Card className="animate-in fade-in-50 duration-300">
                                <CardHeader>
                                    <CardTitle>补发结果</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div
                                        className={`p-4 rounded-md ${
                                            resendResult.success
                                                ? 'bg-green-50 border border-green-200'
                                                : 'bg-red-50 border border-red-200'
                                        }`}
                                    >
                                        <div>
                                            <p
                                                className={`font-medium ${
                                                    resendResult.success ? 'text-green-800' : 'text-red-800'
                                                }`}
                                            >
                                                {resendResult.success ? '补发成功' : '补发失败'}
                                            </p>
                                            <p className="mt-1 text-sm">{resendResult.message}</p>
                                            {Array.isArray(resendResult.data) && resendResult.data.length > 0 && (
                                                <div className="mt-3">
                                                    <p className="text-xs text-muted-foreground mb-1">详细信息：</p>
                                                    <pre className="text-sm bg-gray-50 p-2 rounded whitespace-pre-wrap">
                                                        {JSON.stringify(resendResult.data, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                请求ID: {resendResult.request_id}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
