import React, {useEffect, useMemo, useRef, useState, useCallback} from 'react';
import {
    ArrowLeft,
    Copy,
    Download,
    Info,
    Play,
    RotateCcw,
    Search,
    Check,
    Loader2,
    RefreshCw as Refresh,
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
import axios, {AxiosError} from 'axios';
import {Toaster, toast} from 'sonner';

// ===== Types =====
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
    code: number;
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

type ResendType = 'mobile' | 'batch';

// ===== Helpers =====
const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
    timeout: 20000,
});

function getErrorMessage(err: unknown, fallback = '请求失败，请重试'): string {
    if (axios.isAxiosError(err)) {
        const ax = err as AxiosError<{ detail?: string; message?: string }>;
        return (
            ax.response?.data?.detail ||
            ax.response?.data?.message ||
            (ax.response ? `请求失败: ${ax.response.status}` : ax.message) ||
            fallback
        );
    }
    if (err instanceof Error) return err.message || fallback;
    return fallback;
}

function clampTimeout(value: number, min = 1, max = 60, defaultVal = 15) {
    if (!Number.isFinite(value)) return defaultVal;
    return Math.min(Math.max(Math.floor(value), min), max);
}

const CN_MOBILE_REGEX = /^1[3-9]\d{9}$/;

function parseMobiles(text: string) {
    const arr = text
        .split(/[,\s\n]+/g)
        .map((m) => m.trim())
        .filter(Boolean);
    const unique = Array.from(new Set(arr));
    const valid = unique.filter((m) => CN_MOBILE_REGEX.test(m));
    const invalid = unique.filter((m) => !CN_MOBILE_REGEX.test(m));
    return {valid, invalid, total: unique.length};
}

function serializeAllowedTemplates(obj: Record<string, string>) {
    const entries = Object.entries(obj);
    const lines = entries.map(
        ([code, name], i) => `    "${code}": "${name.trim()}"${i === entries.length - 1 ? '' : ','}`
    );
    return `self.allowed_templates = {\n${lines.join('\n')}\n}`;
}

function copyToClipboardWithFallback(text: string) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }
    return new Promise<void>((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
            const ok = document.execCommand('copy');
            if (!ok) throw new Error('execCommand 复制失败');
            resolve();
        } catch (e) {
            reject(e);
        } finally {
            document.body.removeChild(textarea);
        }
    });
}

const RadioButton = ({
                         id,
                         name,
                         checked,
                         onChange,
                         label,
                     }: {
    id: string;
    name: string;
    checked: boolean;
    onChange: () => void;
    label: string;
}) => (
    <div className="flex items-center space-x-2 cursor-pointer">
        <input
            type="radio"
            id={id}
            name={name}
            checked={checked}
            onChange={onChange}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded-full focus:ring-blue-500"
        />
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
            {label}
        </label>
    </div>
);

const LoadingButton = ({
                           onClick,
                           disabled,
                           isLoading,
                           children,
                           className = '',
                           icon: Icon,
                       }: {
    onClick: () => void;
    disabled?: boolean;
    isLoading?: boolean;
    children: React.ReactNode;
    className?: string;
    icon?: React.ElementType;
}) => (
    <Button onClick={onClick} disabled={!!disabled || !!isLoading} className={className}>
        {isLoading ? (
            <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin"/>
                处理中...
            </>
        ) : Icon ? (
            <>
                <Icon className="w-4 h-4 mr-2"/>
                {children}
            </>
        ) : (
            children
        )}
    </Button>
);

// ===== Component =====
export default function SmsManagementScript({onBack}: { onBack: () => void }) {
    // Shared config
    const [environment, setEnvironment] = useState<'test' | 'prod'>('test');
    const [timeout, setTimeoutValue] = useState<number>(15);

    // Templates
    const [allTemplates, setAllTemplates] = useState<Template[]>([]);
    const [allowedTemplates, setAllowedTemplates] = useState<Template[]>([]);
    const [templateFilter, setTemplateFilter] = useState('');
    const [allowedFilter, setAllowedFilter] = useState('');
    const [isFetchingAll, setIsFetchingAll] = useState(false);
    const [isFetchingAllowed, setIsFetchingAllowed] = useState(false);
    const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);

    // Single send
    const [selectedTemplate, setSelectedTemplate] = useState<string>('');
    const [usePresetMobiles, setUsePresetMobiles] = useState(true);
    const [mobiles, setMobiles] = useState('');
    const [templateParams, setTemplateParams] = useState<TemplateParam[]>([]);
    const [isSending, setIsSending] = useState(false);

    // Batch send
    const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
    const [randomSend, setRandomSend] = useState(false);

    // Resend
    const [resendType, setResendType] = useState<ResendType>('mobile');
    const [resendMobile, setResendMobile] = useState('');
    const [resendBatchNo, setResendBatchNo] = useState('');
    const [resendTaxId, setResendTaxId] = useState('');
    const [isResending, setIsResending] = useState(false);
    const [resendResult, setResendResult] = useState<ApiResponse | null>(null);

    // Results
    const [sendResults, setSendResults] = useState<SendResult[]>([]);
    const [sendStats, setSendStats] = useState({total: 0, success: 0, failure: 0});
    const [expandedResult, setExpandedResult] = useState<string | null>(null);

    // Formatting view
    const [allTemplatesFormatted, setAllTemplatesFormatted] = useState<Record<string, string>>({});
    const [showFormatted, setShowFormatted] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);

    // Mounted guard
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const overallBusy = isSending || isFetchingAll || isFetchingAllowed || isUpdatingConfig || isResending;

    const filteredAllTemplates = useMemo(() => {
        if (!templateFilter.trim()) return allTemplates;
        const kw = templateFilter.trim().toLowerCase();
        return allTemplates.filter(
            (t) => t.name.toLowerCase().includes(kw) || t.code.toLowerCase().includes(kw)
        );
    }, [allTemplates, templateFilter]);

    const filteredAllowedTemplates = useMemo(() => {
        if (!allowedFilter.trim()) return allowedTemplates;
        const kw = allowedFilter.trim().toLowerCase();
        return allowedTemplates.filter(
            (t) => t.name.toLowerCase().includes(kw) || t.code.toLowerCase().includes(kw)
        );
    }, [allowedTemplates, allowedFilter]);

    const isAllowed = useCallback(
        (code: string) => allowedTemplates.some((t) => t.code === code),
        [allowedTemplates]
    );

    // ===== Actions =====
    const fetchAllowedTemplates = async () => {
        setIsFetchingAllowed(true);
        try {
            const res = await api.post<ApiResponse<Template[]>>('/sms/templates/allowed', {
                environment,
                timeout: clampTimeout(timeout),
            });
            if (!mountedRef.current) return;
            setAllowedTemplates(res.data.data || []);
            toast.success(res.data.message || '已获取允许的模板');
        } catch (err) {
            toast.error(getErrorMessage(err, '获取允许的模板失败，请重试'));
        } finally {
            if (mountedRef.current) setIsFetchingAllowed(false);
        }
    };

    const fetchAllTemplates = async () => {
        setIsFetchingAll(true);
        try {
            const res = await api.post<ApiResponse<Template[]>>('/sms/templates', {
                environment,
                timeout: clampTimeout(timeout),
            });
            const templates = (res.data.data || []) as Template[];
            if (!mountedRef.current) return;

            setAllTemplates(templates);
            toast.success(res.data.message || '已获取模板列表');

            const formatted: Record<string, string> = {};
            templates.forEach((t) => {
                formatted[t.code] = (t.name || '').trim();
            });
            setAllTemplatesFormatted(formatted);
        } catch (err) {
            toast.error(getErrorMessage(err, '获取模板列表失败，请重试'));
        } finally {
            if (mountedRef.current) setIsFetchingAll(false);
        }
    };

    const updateTemplateConfig = async () => {
        setIsUpdatingConfig(true);
        try {
            const res = await api.post<ApiResponse>('/sms/templates/update', {
                environment,
                timeout: clampTimeout(timeout),
            });

            // 判断更新是否成功
            if (!res.data.success || res.data.code === 500) {
                toast.error(res.data.message || '模板更新失败，请检查登录状态', {
                    style: {
                        backgroundColor: '#ffeef0',
                        color: '#86181d',
                    },
                });
                return; // 失败时直接返回，不调用后续接口
            }

            // 成功后刷新两个列表
            await Promise.all([fetchAllTemplates(), fetchAllowedTemplates()]);
            toast.success(res.data.message || '模板配置已更新');
        } catch (err) {
            toast.error(getErrorMessage(err, '更新模板配置失败'), {
                style: {
                    backgroundColor: '#ffeef0',
                    color: '#86181d',
                },
            });
        } finally {
            setIsUpdatingConfig(false);
        }
    };

    const copyFormattedTemplates = async () => {
        if (Object.keys(allTemplatesFormatted).length === 0) return;
        const text = serializeAllowedTemplates(allTemplatesFormatted);
        try {
            await copyToClipboardWithFallback(text);
            if (!mountedRef.current) return;
            setCopySuccess(true);
            toast.success('模板代码已复制到剪贴板');
            setTimeout(() => mountedRef.current && setCopySuccess(false), 2000);
        } catch {
            toast.error('复制失败，请手动复制');
        }
    };

    const handleTemplateChange = (code: string) => {
        setSelectedTemplate(code);
        // 示例参数预填：可按真实模板自定义
        if (code === 'reset_worker_sign') {
            setTemplateParams([
                {name: 'name', value: '张三'},
                {name: 'deadline', value: '2025-12-31'},
                {name: 'signUrl', value: '5a3'},
            ]);
        } else if (code === 'channel_open_notice') {
            setTemplateParams([
                {name: 'channel_name', value: '默认渠道'},
                {name: 'open_time', value: new Date().toLocaleString()},
            ]);
        } else {
            setTemplateParams([]);
        }
    };

    const handleParamChange = (index: number, value: string) => {
        setTemplateParams((prev) => {
            const next = [...prev];
            next[index] = {...next[index], value};
            return next;
        });
    };

    const confirmMobiles = (text: string) => {
        const {valid, invalid, total} = parseMobiles(text);
        if (total > 0) {
            if (invalid.length > 0) {
                toast.info(`检测到 ${invalid.length}/${total} 个非法号码，已自动忽略`);
            } else {
                toast.success(`已解析 ${valid.length} 个手机号`);
            }
        }
        return valid;
    };

    const sendSingleTemplate = async () => {
        if (!selectedTemplate) return toast.error('请选择发送模板');
        if (!usePresetMobiles && !mobiles.trim()) return toast.error('请输入手机号');

        const mobileList = usePresetMobiles ? [] : confirmMobiles(mobiles);
        if (!usePresetMobiles && mobileList.length === 0) {
            return toast.error('没有可用的有效手机号');
        }

        setIsSending(true);
        try {
            const paramsObj: Record<string, string> = {};
            templateParams.forEach((p) => {
                if (p.name) paramsObj[p.name] = p.value ?? '';
            });

            const res = await api.post<ApiResponse<SendResult[]>>('/sms/send/single', {
                environment,
                timeout: clampTimeout(timeout),
                template_code: selectedTemplate,
                use_preset_mobiles: usePresetMobiles,
                mobiles: mobileList,
                params: paramsObj,
            });

            if (!mountedRef.current) return;
            setSendResults(res.data.data || []);
            setSendStats({
                total: res.data.total || 0,
                success: res.data.success_count || 0,
                failure: res.data.failure_count || 0,
            });
            toast.success(res.data.message || '短信发送完成');
        } catch (err) {
            toast.error(getErrorMessage(err, '发送短信失败，请重试'));
        } finally {
            if (mountedRef.current) setIsSending(false);
        }
    };

    const sendBatchTemplates = async () => {
        if (selectedTemplates.length === 0) return toast.error('请至少选择一个发送模板');
        if (!usePresetMobiles && !mobiles.trim()) return toast.error('请输入手机号');

        const mobileList = usePresetMobiles ? [] : confirmMobiles(mobiles);
        if (!usePresetMobiles && mobileList.length === 0) {
            return toast.error('没有可用的有效手机号');
        }

        setIsSending(true);
        try {
            const res = await api.post<ApiResponse<SendResult[]>>('/sms/send/batch', {
                environment,
                timeout: clampTimeout(timeout),
                template_codes: selectedTemplates,
                use_preset_mobiles: usePresetMobiles,
                mobiles: mobileList,
                random_send: randomSend,
            });

            if (!mountedRef.current) return;
            setSendResults(res.data.data || []);
            setSendStats({
                total: res.data.total || 0,
                success: res.data.success_count || 0,
                failure: res.data.failure_count || 0,
            });
            toast.success(res.data.message || '批量发送完成');
        } catch (err) {
            toast.error(getErrorMessage(err, '批量发送短信失败，请重试'));
        } finally {
            if (mountedRef.current) setIsSending(false);
        }
    };

    const resendSignSms = async () => {
        setIsResending(true);
        try {
            if (resendType === 'mobile') {
                const m = resendMobile.trim();
                const taxId = resendTaxId.trim();
                if (!CN_MOBILE_REGEX.test(m)) throw new Error('请输入正确的手机号');
                if (!taxId) throw new Error('请输入税地ID');
            } else {
                if (!resendBatchNo.trim()) throw new Error('请输入批次号');
            }

            const params =
                resendType === 'mobile'
                ? {
                mobiles: [resendMobile.trim()],
                tax_id: resendTaxId.trim()
                }
                : {batch_no: resendBatchNo.trim()};

            const res = await api.post<ApiResponse>('/sms/resend', {
                environment,
                timeout: clampTimeout(timeout),
                template_code: 'reset_worker_sign',
                ...params,
            });

            if (!mountedRef.current) return;
            setResendResult(res.data);
            res.data.success ? toast.success(res.data.message || '补发成功') : toast.error(res.data.message || '补发失败');
        } catch (err) {
            const msg = getErrorMessage(err, '补发签约短信失败，请重试');
            toast.error(msg);
            if (mountedRef.current) setResendResult(null);
        } finally {
            if (mountedRef.current) setIsResending(false);
        }
    };

    const toggleTemplateSelection = (code: string) =>
        setSelectedTemplates((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

    const toggleResultDetails = (key: string) =>
        setExpandedResult((prev) => (prev === key ? null : key));

    const downloadResults = () => {
        if (sendResults.length === 0) return toast.info('没有结果可供下载');
        const results = {
            timestamp: new Date().toISOString(),
            environment,
            total: sendStats.total,
            success: sendStats.success,
            failure: sendStats.failure,
            details: sendResults,
        };
        const blob = new Blob([JSON.stringify(results, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sms_send_results_${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const selectAllAllowed = () => setSelectedTemplates(filteredAllowedTemplates.map((t) => t.code));
    const clearAllSelected = () => setSelectedTemplates([]);

    return (
        <div className="min-h-screen colorful-background">
            <Toaster richColors position="top-center"/>
            <div className="max-w-6xl mx-auto">
                <div className="mb-6">
                    <Button variant="ghost" onClick={onBack} className="mb-4">
                        <ArrowLeft className="w-4 h-4 mr-2"/>
                        返回脚本列表
                    </Button>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl">短信模板管理与发送</h1>
                        <Badge variant={overallBusy ? 'destructive' : 'secondary'}>
                            {isSending
                                ? '发送中'
                                : isResending
                                    ? '补发中'
                                    : isFetchingAll || isFetchingAllowed || isUpdatingConfig
                                        ? '加载中'
                                        : '就绪'}
                        </Badge>
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

                    {/* 模板管理 */}
                    <TabsContent value="templateManagement" className="space-y-6 animate-in fade-in-50 duration-300">
                        <Card>
                            <CardHeader>
                                <CardTitle>模板配置</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                                    <div>
                                        <Label htmlFor="env-select">环境</Label>
                                        <Select value={environment}
                                                onValueChange={(v) => setEnvironment(v as 'test' | 'prod')}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="选择环境"/>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="test">Beta</SelectItem>
                                                <SelectItem value="prod">生产环境</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="timeout-input">超时时间(秒)</Label>
                                        <Input
                                            id="timeout-input"
                                            type="number"
                                            value={timeout}
                                            onChange={(e) => setTimeoutValue(clampTimeout(Number(e.target.value)))}
                                            min={1}
                                            max={60}
                                            required
                                        />
                                    </div>
                                    <LoadingButton
                                        onClick={fetchAllTemplates}
                                        isLoading={isFetchingAll}
                                        icon={Search}
                                        className="w-full"
                                    >
                                        获取所有模板
                                    </LoadingButton>
                                    <LoadingButton
                                        onClick={fetchAllowedTemplates}
                                        isLoading={isFetchingAllowed}
                                        icon={Check}
                                        className="w-full"
                                    >
                                        获取允许的模板
                                    </LoadingButton>
                                    <Button
                                        onClick={() => setShowFormatted((s) => !s)}
                                        disabled={allTemplates.length === 0}
                                        variant="ghost"
                                        className="w-full"
                                    >
                                        {showFormatted ? '隐藏格式' : '查看代码格式'}
                                    </Button>
                                    <LoadingButton
                                        onClick={updateTemplateConfig}
                                        isLoading={isUpdatingConfig}
                                        icon={RotateCcw}
                                        className="w-full"
                                    >
                                        更新模板配置
                                    </LoadingButton>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>模板列表</CardTitle>
                                    <div className="w-60">
                                        <Input
                                            placeholder="搜索编码或名称..."
                                            value={templateFilter}
                                            onChange={(e) => setTemplateFilter(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {allTemplates.length === 0 ? (
                                    <div className="text-center py-12 text-muted-foreground">
                                        <Info className="w-12 h-12 mx-auto mb-4 opacity-50 text-blue-500"/>
                                        <p>点击“获取所有模板”按钮加载模板列表</p>
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>模板编码</TableHead>
                                                <TableHead>模板名称</TableHead>
                                                <TableHead>状态</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredAllTemplates.map((t) => (
                                                <TableRow key={t.code}>
                                                    <TableCell>{t.code}</TableCell>
                                                    <TableCell>{t.name}</TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant={isAllowed(t.code) ? 'secondary' : 'outline'}
                                                            className={isAllowed(t.code) ? 'bg-green-100 text-green-800 hover:bg-green-200' : ''}
                                                        >
                                                            {isAllowed(t.code) ? '允许发送' : '限制发送'}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>

                        {showFormatted && allTemplates.length > 0 && (
                            <Card className="animate-in fade-in slide-in-from-top-5 duration-300">
                                <CardHeader>
                                    <div className="flex justify-between items-center">
                                        <CardTitle>所有模板代码格式</CardTitle>
                                        <Button onClick={copyFormattedTemplates} size="sm" className="gap-1">
                                            {copySuccess ? (
                                                <>
                                                    <Check className="w-4 h-4"/>
                                                    已复制
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="w-4 h-4"/>
                                                    复制到剪贴板
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                  <pre className="p-4 bg-gray-800 text-gray-100 rounded-md overflow-x-auto max-h-96 text-sm">
                    {serializeAllowedTemplates(allTemplatesFormatted)}
                  </pre>
                                    <p className="text-xs text-gray-500 mt-2">点击复制按钮可直接将格式复制到剪贴板，方便粘贴到代码中</p>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    {/* 单模板发送 */}
                    <TabsContent value="singleSend" className="space-y-6 animate-in fade-in-50 duration-300">
                        <Card>
                            <CardHeader>
                                <CardTitle>单模板发送配置</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <Label htmlFor="single-env-select">环境</Label>
                                        <Select value={environment}
                                                onValueChange={(v) => setEnvironment(v as 'test' | 'prod')}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="选择环境"/>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="test">Beta</SelectItem>
                                                <SelectItem value="prod">生产环境</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="timeout-single-input">超时时间(秒)</Label>
                                        <Input
                                            id="timeout-single-input"
                                            type="number"
                                            value={timeout}
                                            onChange={(e) => setTimeoutValue(clampTimeout(Number(e.target.value)))}
                                            min={1}
                                            max={60}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <Label htmlFor="single-template-select">选择模板</Label>
                                            <Button variant="ghost" size="sm" onClick={fetchAllowedTemplates}
                                                    disabled={isFetchingAllowed}>
                                                <Refresh className="w-4 h-4 mr-1"/>
                                                刷新
                                            </Button>
                                        </div>
                                        <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="选择发送模板"/>
                                            </SelectTrigger>
                                            <SelectContent>
                                                {allowedTemplates.map((t) => (
                                                    <SelectItem key={t.code} value={t.code}>
                                                        {t.name} ({t.code})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex items-end">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="use-preset-single"
                                                checked={usePresetMobiles}
                                                onCheckedChange={(checked) => setUsePresetMobiles(Boolean(checked))}
                                            />
                                            <Label htmlFor="use-preset-single">使用预设手机号</Label>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <Label htmlFor="mobiles-single-input">手机号（多个用逗号、空格或换行分隔）</Label>
                                    <Textarea
                                        id="mobiles-single-input"
                                        value={mobiles}
                                        onChange={(e) => setMobiles(e.target.value)}
                                        placeholder="13800138001,13800138002 13800138003"
                                        rows={3}
                                        disabled={usePresetMobiles}
                                    />
                                </div>

                                {selectedTemplate && (
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <Label>模板参数</Label>
                                            <span className="text-xs text-muted-foreground">可按示例预填并修改</span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                                            {templateParams.map((param, index) => (
                                                <div key={index}>
                                                    <Label htmlFor={`param-${index}`}>{param.name}</Label>
                                                    <Input
                                                        id={`param-${index}`}
                                                        value={param.value}
                                                        onChange={(e) => handleParamChange(index, e.target.value)}
                                                        placeholder={`请输入${param.name}`}
                                                    />
                                                </div>
                                            ))}
                                            {templateParams.length === 0 && (
                                                <p className="text-xs text-muted-foreground">该模板暂无预设参数</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <LoadingButton
                                    onClick={sendSingleTemplate}
                                    disabled={!selectedTemplate}
                                    isLoading={isSending}
                                    icon={Play}
                                    className="w-full"
                                >
                                    发送短信
                                </LoadingButton>
                            </CardContent>
                        </Card>

                        {sendResults.length > 0 && (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="text-center">
                                                <p className="text-sm text-muted-foreground">总发送数</p>
                                                <p className="text-2xl">{sendStats.total}</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="text-center">
                                                <p className="text-sm text-muted-foreground">成功数</p>
                                                <p className="text-2xl text-green-600">{sendStats.success}</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="text-center">
                                                <p className="text-sm text-muted-foreground">失败数</p>
                                                <p className="text-2xl text-red-600">{sendStats.failure}</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                <Card>
                                    <CardHeader>
                                        <div className="flex justify-between items-center">
                                            <CardTitle>发送结果详情</CardTitle>
                                            <Button onClick={downloadResults} size="sm">
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
                                                    <TableHead>发送状态</TableHead>
                                                    <TableHead>操作</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {sendResults.map((result, index) => {
                                                    const rowKey = `${result.mobile}-${result.template_code ?? 'single'}-${index}`;
                                                    return (
                                                        <React.Fragment key={rowKey}>
                                                            <TableRow>
                                                                <TableCell>{result.mobile}</TableCell>
                                                                <TableCell>
                                                                    {result.result.code === 0 ? (
                                                                        <Badge variant="secondary"
                                                                               className="bg-green-100 text-green-800">
                                                                            发送成功
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge variant="destructive">发送失败</Badge>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => toggleResultDetails(rowKey)}
                                                                    >
                                                                        {expandedResult === rowKey ? '隐藏详情' : '查看详情'}
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                            {expandedResult === rowKey && (
                                                                <TableRow>
                                                                    <TableCell colSpan={3}>
                                                                        <div
                                                                            className="p-3 bg-gray-50 rounded-md text-sm animate-in fade-in-50 duration-200">
                                      <pre className="whitespace-pre-wrap">
                                        {JSON.stringify(result.result, null, 2)}
                                      </pre>
                                                                        </div>
                                                                    </TableCell>
                                                                </TableRow>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>
                            </>
                        )}
                    </TabsContent>

                    {/* 批量发送 */}
                    <TabsContent value="batchSend" className="space-y-6 animate-in fade-in-50 duration-300">
                        <Card>
                            <CardHeader>
                                <CardTitle>批量模板发送配置</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <Label htmlFor="batch-env-select">环境</Label>
                                        <Select value={environment}
                                                onValueChange={(v) => setEnvironment(v as 'test' | 'prod')}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="选择环境"/>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="test">Beta</SelectItem>
                                                <SelectItem value="prod">生产环境</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="timeout-batch-input">超时时间(秒)</Label>
                                        <Input
                                            id="timeout-batch-input"
                                            type="number"
                                            value={timeout}
                                            onChange={(e) => setTimeoutValue(clampTimeout(Number(e.target.value)))}
                                            min={1}
                                            max={60}
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <Label>选择模板（可多选）</Label>
                                        <div className="flex items-center gap-2">
                                            <div className="w-56">
                                                <Input
                                                    placeholder="搜索允许模板..."
                                                    value={allowedFilter}
                                                    onChange={(e) => setAllowedFilter(e.target.value)}
                                                />
                                            </div>
                                            <Button variant="ghost" size="sm" onClick={fetchAllowedTemplates}
                                                    disabled={isFetchingAllowed}>
                                                <Refresh className="w-4 h-4 mr-1"/>
                                                刷新
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={selectAllAllowed}>
                                                全选
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={clearAllSelected}>
                                                清空
                                            </Button>
                                        </div>
                                    </div>

                                    {allowedTemplates.length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <Info className="w-10 h-10 mx-auto mb-3 opacity-50 text-blue-500"/>
                                            <p>暂无允许的模板，点击“刷新”获取</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {filteredAllowedTemplates.map((t) => {
                                                const checked = selectedTemplates.includes(t.code);
                                                return (
                                                    <div
                                                        key={t.code}
                                                        className={`p-3 border rounded-md cursor-pointer transition-all duration-200 ${
                                                            checked ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                                                        }`}
                                                        onClick={() => toggleTemplateSelection(t.code)}
                                                    >
                                                        <div className="flex items-center">
                                                            <Checkbox
                                                                checked={checked}
                                                                onCheckedChange={() => toggleTemplateSelection(t.code)}
                                                                className="mr-2"
                                                            />
                                                            <div>
                                                                <p className="font-medium">{t.name}</p>
                                                                <p className="text-xs text-muted-foreground">{t.code}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <Label htmlFor="mobiles-batch-input">手机号（多个用逗号、空格或换行分隔）</Label>
                                        <Textarea
                                            id="mobiles-batch-input"
                                            value={mobiles}
                                            onChange={(e) => setMobiles(e.target.value)}
                                            placeholder="13800138001,13800138002 13800138003"
                                            rows={3}
                                            disabled={usePresetMobiles}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-4 justify-end">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="use-preset-batch"
                                                checked={usePresetMobiles}
                                                onCheckedChange={(checked) => setUsePresetMobiles(Boolean(checked))}
                                            />
                                            <Label htmlFor="use-preset-batch">使用预设手机号</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="random-send"
                                                checked={randomSend}
                                                onCheckedChange={(checked) => setRandomSend(Boolean(checked))}
                                            />
                                            <Label htmlFor="random-send">随机发送顺序</Label>
                                        </div>
                                    </div>
                                </div>

                                <LoadingButton
                                    onClick={sendBatchTemplates}
                                    disabled={selectedTemplates.length === 0}
                                    isLoading={isSending}
                                    icon={Play}
                                    className="w-full"
                                >
                                    批量发送短信
                                </LoadingButton>
                            </CardContent>
                        </Card>

                        {sendResults.length > 0 && (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="text-center">
                                                <p className="text-sm text-muted-foreground">总发送数</p>
                                                <p className="text-2xl">{sendStats.total}</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="text-center">
                                                <p className="text-sm text-muted-foreground">成功数</p>
                                                <p className="text-2xl text-green-600">{sendStats.success}</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="text-center">
                                                <p className="text-sm text-muted-foreground">失败数</p>
                                                <p className="text-2xl text-red-600">{sendStats.failure}</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                <Card>
                                    <CardHeader>
                                        <div className="flex justify-between items-center">
                                            <CardTitle>发送结果详情</CardTitle>
                                            <Button onClick={downloadResults} size="sm">
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
                                                    <TableHead>模板</TableHead>
                                                    <TableHead>发送状态</TableHead>
                                                    <TableHead>操作</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {sendResults.map((result, index) => {
                                                    const rowKey = `${result.mobile}-${result.template_code ?? 'single'}-${index}`;
                                                    return (
                                                        <React.Fragment key={rowKey}>
                                                            <TableRow>
                                                                <TableCell>{result.mobile}</TableCell>
                                                                <TableCell>
                                                                    {result.template_name || '-'}
                                                                    <p className="text-xs text-muted-foreground">{result.template_code || '-'}</p>
                                                                </TableCell>
                                                                <TableCell>
                                                                    {result.result.code === 0 ? (
                                                                        <Badge variant="secondary"
                                                                               className="bg-green-100 text-green-800">
                                                                            发送成功
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge variant="destructive">发送失败</Badge>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => toggleResultDetails(rowKey)}
                                                                    >
                                                                        {expandedResult === rowKey ? '隐藏详情' : '查看详情'}
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                            {expandedResult === rowKey && (
                                                                <TableRow>
                                                                    <TableCell colSpan={4}>
                                                                        <div
                                                                            className="p-3 bg-gray-50 rounded-md text-sm animate-in fade-in-50 duration-200">
                                      <pre className="whitespace-pre-wrap">
                                        {JSON.stringify(result.result, null, 2)}
                                      </pre>
                                                                        </div>
                                                                    </TableCell>
                                                                </TableRow>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>
                            </>
                        )}
                    </TabsContent>

                    {/* 补发签约短信 */}
                    <TabsContent value="resendSign" className="space-y-6 animate-in fade-in-50 duration-300">
                        <Card>
                            <CardHeader>
                                <CardTitle>补发共享协议签约短信</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <Label htmlFor="resend-env-select">环境</Label>
                                        <Select value={environment}
                                                onValueChange={(v) => setEnvironment(v as 'test' | 'prod')}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="选择环境"/>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="test">Beta</SelectItem>
                                                <SelectItem value="prod">生产环境</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="timeout-resend-input">超时时间(秒)</Label>
                                        <Input
                                            id="timeout-resend-input"
                                            type="number"
                                            value={timeout}
                                            onChange={(e) => setTimeoutValue(clampTimeout(Number(e.target.value)))}
                                            min={1}
                                            max={60}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-3">
                                        <Label>补发方式</Label>
                                        <div className="flex space-x-6">
                                            <RadioButton
                                                id="resend-by-mobile"
                                                name="resend-mode"
                                                checked={resendType === 'mobile'}
                                                onChange={() => setResendType('mobile')}
                                                label="按手机号补发"
                                            />
                                            <RadioButton
                                                id="resend-by-batch"
                                                name="resend-mode"
                                                checked={resendType === 'batch'}
                                                onChange={() => setResendType('batch')}
                                                label="按批次号补发"
                                            />
                                        </div>
                                    </div>

                                    {resendType === 'mobile' ? (
                                        <div className="space-y-4">
                                            <div>
                                                <Label htmlFor="resend-mobile-input">手机号</Label>
                                                <Input
                                                    id="resend-mobile-input"
                                                    value={resendMobile}
                                                    onChange={(e) => setResendMobile(e.target.value)}
                                                    placeholder="请输入需要补发的手机号"
                                                    maxLength={11}
                                                    required
                                                />
                                                <p className="text-xs text-muted-foreground mt-1">请输入正确的 11
                                                    位手机号码</p>
                                            </div>
                                            {/* 新增税地ID输入框 */}
                                            <div>
                                                <Label htmlFor="resend-tax-id-input">税地ID</Label>
                                                <Input
                                                    id="resend-tax-id-input"
                                                    value={resendTaxId}
                                                    onChange={(e) => setResendTaxId(e.target.value)}
                                                    placeholder="请输入税地ID"
                                                    required
                                                />
                                                <p className="text-xs text-muted-foreground mt-1">请输入对应的税地ID，不能为空</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <Label htmlFor="resend-batch-input">批次号</Label>
                                            <Input
                                                id="resend-batch-input"
                                                value={resendBatchNo}
                                                onChange={(e) => setResendBatchNo(e.target.value)}
                                                placeholder="请输入需要补发的批次号"
                                            />
                                            <p className="text-xs text-muted-foreground mt-1">请输入该批次的唯一标识编号</p>
                                        </div>
                                    )}
                                </div>

                                <LoadingButton
                                    onClick={resendSignSms}
                                    isLoading={isResending}
                                    icon={Play}
                                    className="w-full"
                                    disabled={
                                        (resendType === 'mobile' && (!resendMobile || !resendTaxId)) ||
                                        (resendType === 'batch' && !resendBatchNo)
                                    }
                                >
                                    补发签约短信
                                </LoadingButton>
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