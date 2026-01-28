import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { toast } from 'sonner';
import { getApiBaseUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';

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
    msg?: string; // Support alternative message field
}

interface LoginData {
    accessToken: string;
}

interface LogData {
    list: SMSLogItem[];
    total: number;
}

interface TemplateParam {
    name: string;
    value: string;
}

interface SMSLogItem {
    id: number;
    sendTime: number;
    mobile: string;
    templateContent: string;
    sendStatus: number;
    receiveStatus: number;
    templateCode: string;
    apiSendMsg: string;
}

type ResendType = 'mobile' | 'batch';

// ===== Helpers =====
let smsApiInstance: AxiosInstance | null = null;
const getSmsApi = (): AxiosInstance | null => {
    const base = getApiBaseUrl();
    if (!base) return null;
    if (!smsApiInstance) {
        smsApiInstance = axios.create({
            baseURL: base,
            timeout: 20000,
        });
    }
    return smsApiInstance;
};

function getErrorMessage(err: unknown, fallback: string): string {
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
    return { valid, invalid, total: unique.length };
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
}) => {
    const { t } = useI18n();
    return (
        <Button onClick={onClick} disabled={!!disabled || !!isLoading} className={className}>
            {isLoading ? (
                <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t.scripts.batchSms.status.processing}
                </>
            ) : Icon ? (
                <>
                    <Icon className="w-4 h-4 mr-2" />
                    {children}
                </>
            ) : (
                children
            )}
        </Button>
    );
};

// ===== Component =====
export default function SmsManagementScript({ onBack }: { onBack: () => void }) {
    const { t } = useI18n();
    const bs = t.scripts.batchSms;

    // Shared config
    const [environment, setEnvironment] = useState<'test' | 'prod'>('test');
    const [timeout, setTimeoutValue] = useState<number>(15);

    // Templates
    const [allTemplates, setAllTemplates] = useState<Template[]>([]);

    // Admin Login State
    const [adminToken, setAdminToken] = useState<string>('');
    const [showLoginPrompt, setShowLoginPrompt] = useState(false);
    const [secretKey, setSecretKey] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // SMS Logs State
    const [smsLogs, setSmsLogs] = useState<SMSLogItem[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logPage, setLogPage] = useState(1);
    const [logTotal, setLogTotal] = useState(0);
    // Log Filters
    const [logFilterMobile, setLogFilterMobile] = useState('');
    const [logFilterSendStatus, setLogFilterSendStatus] = useState<string>('');
    const [logFilterReceiveStatus, setLogFilterReceiveStatus] = useState<string>('');

    // Clear token on environment change
    useEffect(() => {
        setAdminToken('');
        setSmsLogs([]);
        setLogTotal(0);
        setLogPage(1);
    }, [environment]);

    // Handlers
    const handleAdminLogin = async () => {
        if (secretKey !== 'wjc') {
            toast.error(bs.login.toast.invalidKey);
            return;
        }

        const api = getSmsApi();
        if (!api) {
            toast.error(bs.login.toast.apiMissing);
            return;
        }

        setIsLoggingIn(true);
        try {
            const res = await api.post<ApiResponse<LoginData>>('/system/auth/login', { environment });
            if (res.data.success || res.data.code === 0) {
                const token = res.data.data?.accessToken;
                if (token) {
                    setAdminToken(token);
                    toast.success(bs.login.toast.success);
                    setShowLoginPrompt(false);
                    setSecretKey('');
                } else {
                    toast.error(bs.login.toast.fail);
                }
            } else {
                toast.error(bs.login.toast.error.replace('{msg}', res.data.message || res.data.msg || ''));
            }
        } catch (error) {
            toast.error(getErrorMessage(error, bs.login.toast.errorRequest));
        } finally {
            setIsLoggingIn(false);
        }
    };

    const fetchLogs = async (page = 1, filters?: { mobile?: string; sendStatus?: string; receiveStatus?: string }) => {
        if (!adminToken) {
            toast.error(bs.login.toast.loginRequired);
            return;
        }

        const api = getSmsApi();
        if (!api) {
            toast.error(bs.login.toast.apiMissing);
            return;
        }



        setLogsLoading(true);
        try {
            const res = await api.post<ApiResponse<LogData>>('/sms/logs', {
                environment,
                token: adminToken,
                page,
                pageSize: 10,
                mobile: (filters?.mobile !== undefined ? filters.mobile : logFilterMobile) || undefined,
                sendStatus: (filters?.sendStatus !== undefined ? filters.sendStatus : logFilterSendStatus) || undefined,
                receiveStatus: (filters?.receiveStatus !== undefined ? filters.receiveStatus : logFilterReceiveStatus) || undefined
            });

            if (res.data.code === 0 && res.data.data) {
                setSmsLogs(res.data.data.list || []);
                setLogTotal(res.data.data.total || 0);
                setLogPage(page);
                toast.success(bs.logs.toast.refreshSuccess);
            } else {
                toast.error(bs.logs.toast.fetchFailMsg.replace('{msg}', res.data.message || res.data.msg || ''));
            }
        } catch (error) {
            toast.error(getErrorMessage(error, bs.logs.toast.fetchFail));
        } finally {
            setLogsLoading(false);
        }
    };

    const resetFilters = () => {
        setLogFilterMobile('');
        setLogFilterSendStatus('');
        setLogFilterReceiveStatus('');
        fetchLogs(1, { mobile: '', sendStatus: '', receiveStatus: '' });
    };
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
    const [sendStats, setSendStats] = useState({ total: 0, success: 0, failure: 0 });
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
        const api = getSmsApi();
        if (!api) return;
        setIsFetchingAllowed(true);
        try {
            const res = await api.post<ApiResponse<Template[]>>('/sms/templates/allowed', {
                environment,
                timeout: clampTimeout(timeout),
            });
            if (!mountedRef.current) return;
            setAllowedTemplates(res.data.data || []);
            toast.success(res.data.message || bs.messages.fetchSuccess);
        } catch (err) {
            toast.error(getErrorMessage(err, bs.messages.fetchFail));
        } finally {
            if (mountedRef.current) setIsFetchingAllowed(false);
        }
    };

    const fetchAllTemplates = async () => {
        const api = getSmsApi();
        if (!api) return;
        setIsFetchingAll(true);
        try {
            const res = await api.post<ApiResponse<Template[]>>('/sms/templates', {
                environment,
                timeout: clampTimeout(timeout),
            });
            const templates = (res.data.data || []) as Template[];
            if (!mountedRef.current) return;

            setAllTemplates(templates);
            toast.success(res.data.message || bs.messages.fetchSuccess);

            const formatted: Record<string, string> = {};
            templates.forEach((t) => {
                formatted[t.code] = (t.name || '').trim();
            });
            setAllTemplatesFormatted(formatted);
        } catch (err) {
            toast.error(getErrorMessage(err, bs.messages.fetchFail));
        } finally {
            if (mountedRef.current) setIsFetchingAll(false);
        }
    };

    const updateTemplateConfig = async () => {
        const api = getSmsApi();
        if (!api) return;
        setIsUpdatingConfig(true);
        try {
            const res = await api.post<ApiResponse>('/sms/templates/update', {
                environment,
                timeout: clampTimeout(timeout),
                token: adminToken || undefined,
            });

            // 判断更新是否成功
            if (!res.data.success || res.data.code === 500) {
                toast.error(res.data.message || bs.messages.updateFail, {
                    style: {
                        backgroundColor: '#ffeef0',
                        color: '#86181d',
                    },
                });
                return; // 失败时直接返回，不调用后续接口
            }

            // 成功后刷新两个列表
            await Promise.all([fetchAllTemplates(), fetchAllowedTemplates()]);
            toast.success(res.data.message || bs.messages.updateSuccess);
        } catch (err) {
            toast.error(getErrorMessage(err, bs.messages.updateFail), {
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
            toast.success(bs.messages.copySuccess);
            setTimeout(() => mountedRef.current && setCopySuccess(false), 2000);
        } catch {
            toast.error(bs.messages.copyFail);
        }
    };

    const handleTemplateChange = (code: string) => {
        setSelectedTemplate(code);
        // 示例参数预填：可按真实模板自定义
        if (code === 'reset_worker_sign') {
            setTemplateParams([
                { name: 'name', value: '张三' },
                { name: 'deadline', value: '2025-12-31' },
                { name: 'signUrl', value: '5a3' },
            ]);
        } else if (code === 'channel_open_notice') {
            setTemplateParams([
                { name: 'channel_name', value: '默认渠道' },
                { name: 'open_time', value: new Date().toLocaleString() },
            ]);
        } else {
            setTemplateParams([]);
        }
    };

    const handleParamChange = (index: number, value: string) => {
        setTemplateParams((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], value };
            return next;
        });
    };

    const confirmMobiles = (text: string) => {
        const { valid, invalid, total } = parseMobiles(text);
        if (total > 0) {
            if (invalid.length > 0) {
                toast.info(bs.messages.mobileParse.replace('{invalid}', String(invalid.length)).replace('{total}', String(total)));
            } else {
                toast.success(bs.messages.mobileParse.replace('{invalid}', '0').replace('{total}', String(valid.length)));
            }
        }
        return valid;
    };

    const sendSingleTemplate = async () => {
        if (!selectedTemplate) return toast.error(bs.messages.selectTemplate);
        if (!usePresetMobiles && !mobiles.trim()) return toast.error(bs.messages.inputMobile);

        const mobileList = usePresetMobiles ? [] : confirmMobiles(mobiles);
        if (!usePresetMobiles && mobileList.length === 0) {
            return toast.error(bs.messages.noValidMobile);
        }

        const api = getSmsApi();
        if (!api) return;
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
                token: adminToken || undefined,
            });

            if (!mountedRef.current) return;
            setSendResults(res.data.data || []);
            setSendStats({
                total: res.data.total || 0,
                success: res.data.success_count || 0,
                failure: res.data.failure_count || 0,
            });
            toast.success(res.data.message || bs.messages.sendSuccess);
        } catch (err) {
            toast.error(getErrorMessage(err, bs.messages.sendFail));
        } finally {
            if (mountedRef.current) setIsSending(false);
        }
    };

    const sendBatchTemplates = async () => {
        if (selectedTemplates.length === 0) return toast.error(bs.messages.selectTemplate);
        if (!usePresetMobiles && !mobiles.trim()) return toast.error(bs.messages.inputMobile);

        const mobileList = usePresetMobiles ? [] : confirmMobiles(mobiles);
        if (!usePresetMobiles && mobileList.length === 0) {
            return toast.error(bs.messages.noValidMobile);
        }

        const api = getSmsApi();
        if (!api) return;
        setIsSending(true);
        try {
            const res = await api.post<ApiResponse<SendResult[]>>('/sms/send/batch', {
                environment,
                timeout: clampTimeout(timeout),
                template_codes: selectedTemplates,
                use_preset_mobiles: usePresetMobiles,
                mobiles: mobileList,
                random_send: randomSend,
                token: adminToken || undefined,
            });

            if (!mountedRef.current) return;
            setSendResults(res.data.data || []);
            setSendStats({
                total: res.data.total || 0,
                success: res.data.success_count || 0,
                failure: res.data.failure_count || 0,
            });
            toast.success(res.data.message || bs.messages.sendSuccess);
        } catch (err) {
            toast.error(getErrorMessage(err, bs.messages.sendFail));
        } finally {
            if (mountedRef.current) setIsSending(false);
        }
    };

    const resendSignSms = async () => {
        const api = getSmsApi();
        if (!api) return;
        setIsResending(true);
        try {
            if (resendType === 'mobile') {
                const m = resendMobile.trim();
                const taxId = resendTaxId.trim();
                if (!CN_MOBILE_REGEX.test(m)) throw new Error(bs.messages.mobileInvalid);
                if (!taxId) throw new Error(bs.resend.taxIdHint);
            } else {
                if (!resendBatchNo.trim()) throw new Error(bs.resend.batchNoHint);
            }

            const params =
                resendType === 'mobile'
                    ? {
                        mobiles: [resendMobile.trim()],
                        tax_id: resendTaxId.trim()
                    }
                    : { batch_no: resendBatchNo.trim() };

            const res = await api.post<ApiResponse>('/sms/resend', {
                environment,
                timeout: clampTimeout(timeout),
                template_code: 'reset_worker_sign',
                ...params,
                token: adminToken || undefined,
            });

            if (mountedRef.current) {
                setResendResult(res.data);
                if (res.data.success) {
                    toast.success(res.data.message || bs.messages.resendSuccess);
                } else {
                    toast.error(res.data.message || bs.messages.resendFail);
                }
            }
        } catch (err) {
            const msg = getErrorMessage(err, bs.messages.resendFail);
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
        if (sendResults.length === 0) return toast.info(bs.messages.noResult);
        const results = {
            timestamp: new Date().toISOString(),
            environment,
            total: sendStats.total,
            success: sendStats.success,
            failure: sendStats.failure,
            details: sendResults,
        };
        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
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
            <div className="max-w-6xl mx-auto">
                <div className="mb-6">
                    <Button variant="ghost" onClick={onBack} className="mb-4">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        {t.scripts.taskAutomation.back}
                    </Button>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl">{bs.title}</h1>
                        <Badge variant={overallBusy ? 'destructive' : 'secondary'}>
                            {isSending
                                ? bs.status.sending
                                : isResending
                                    ? bs.status.resending
                                    : isFetchingAll || isFetchingAllowed || isUpdatingConfig
                                        ? bs.status.loading
                                        : bs.status.ready}
                        </Badge>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto"
                            onClick={() => adminToken ? setAdminToken('') : setShowLoginPrompt(true)}
                        >
                            {adminToken ? (
                                <span className="text-green-500 font-bold flex items-center gap-1">
                                    <Check className="w-3 h-3" />
                                    {bs.login.loggedIn}
                                </span>
                            ) : (
                                <span className="text-muted-foreground text-xs">{bs.login.button}</span>
                            )}
                        </Button>
                    </div>
                    <p className="text-muted-foreground">{bs.subtitle}</p>
                </div>

                <Tabs defaultValue="templateManagement" className="space-y-6">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="templateManagement">{bs.tabs.template}</TabsTrigger>
                        <TabsTrigger value="singleSend">{bs.tabs.single}</TabsTrigger>
                        <TabsTrigger value="batchSend">{bs.tabs.batch}</TabsTrigger>
                        <TabsTrigger value="resendSign">{bs.tabs.resend}</TabsTrigger>
                        <TabsTrigger value="smsLogs">{bs.tabs.logs}</TabsTrigger>
                    </TabsList>

                    {/* 模板管理 */}
                    <TabsContent value="templateManagement" className="space-y-6 animate-in fade-in-50 duration-300">
                        <Card>
                            <CardHeader>
                                <CardTitle>{bs.template.configTitle}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                                    <div>
                                        <Label htmlFor="env-select">{bs.template.envLabel}</Label>
                                        <Select value={environment}
                                            onValueChange={(v) => setEnvironment(v as 'test' | 'prod')}>
                                            <SelectTrigger>
                                                <SelectValue placeholder={bs.template.envPlaceholder} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="test">{bs.template.envTest}</SelectItem>
                                                <SelectItem value="prod">{bs.template.envProd}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="timeout-input">{bs.template.timeoutLabel}</Label>
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
                                        {bs.template.fetchAll}
                                    </LoadingButton>
                                    <LoadingButton
                                        onClick={fetchAllowedTemplates}
                                        isLoading={isFetchingAllowed}
                                        icon={Check}
                                        className="w-full"
                                    >
                                        {bs.template.fetchAllowed}
                                    </LoadingButton>
                                    <Button
                                        onClick={() => setShowFormatted((s) => !s)}
                                        disabled={allTemplates.length === 0}
                                        variant="ghost"
                                        className="w-full"
                                    >
                                        {showFormatted ? bs.template.hideCode : bs.template.viewCode}
                                    </Button>
                                    <LoadingButton
                                        onClick={updateTemplateConfig}
                                        isLoading={isUpdatingConfig}
                                        icon={RotateCcw}
                                        className="w-full"
                                    >
                                        {bs.template.updateConfig}
                                    </LoadingButton>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>{bs.template.listTitle}</CardTitle>
                                    <div className="w-60">
                                        <Input
                                            placeholder={bs.template.searchPlaceholder}
                                            value={templateFilter}
                                            onChange={(e) => setTemplateFilter(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {allTemplates.length === 0 ? (
                                    <div className="text-center py-12 text-muted-foreground">
                                        <Info className="w-12 h-12 mx-auto mb-4 opacity-50 text-blue-500" />
                                        <p>{bs.template.empty}</p>
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>{bs.template.table.code}</TableHead>
                                                <TableHead>{bs.template.table.name}</TableHead>
                                                <TableHead>{bs.template.table.status}</TableHead>
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
                                                            className={isAllowed(t.code) ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/40' : ''}
                                                        >
                                                            {isAllowed(t.code) ? bs.template.table.allowed : bs.template.table.restricted}
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
                                        <CardTitle>{bs.template.codeFormatTitle}</CardTitle>
                                        <Button onClick={copyFormattedTemplates} size="sm" className="gap-1">
                                            {copySuccess ? (
                                                <>
                                                    <Check className="w-4 h-4" />
                                                    {bs.template.copied}
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="w-4 h-4" />
                                                    {bs.template.copy}
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <pre
                                        className="p-4 bg-gray-800 text-gray-100 rounded-md overflow-x-auto max-h-96 text-sm">
                                        {serializeAllowedTemplates(allTemplatesFormatted)}
                                    </pre>
                                    <p className="text-xs text-gray-500 mt-2">{bs.template.copyHint}</p>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    {/* 单模板发送 */}
                    <TabsContent value="singleSend" className="space-y-6 animate-in fade-in-50 duration-300">
                        <Card>
                            <CardHeader>
                                <CardTitle>{bs.single.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <Label htmlFor="single-env-select">{bs.template.envLabel}</Label>
                                        <Select value={environment}
                                            onValueChange={(v) => setEnvironment(v as 'test' | 'prod')}>
                                            <SelectTrigger>
                                                <SelectValue placeholder={bs.template.envPlaceholder} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="test">{bs.template.envTest}</SelectItem>
                                                <SelectItem value="prod">{bs.template.envProd}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="timeout-single-input">{bs.template.timeoutLabel}</Label>
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
                                            <Label htmlFor="single-template-select">{bs.single.selectTemplate}</Label>
                                            <Button variant="ghost" size="sm" onClick={fetchAllowedTemplates}
                                                disabled={isFetchingAllowed}>
                                                <Refresh className="w-4 h-4 mr-1" />
                                                {bs.single.refresh}
                                            </Button>
                                        </div>
                                        <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                                            <SelectTrigger>
                                                <SelectValue placeholder={bs.single.selectPlaceholder} />
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
                                            <Label htmlFor="use-preset-single">{bs.single.usePreset}</Label>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <Label htmlFor="mobiles-single-input">{bs.single.mobileList}</Label>
                                    <Textarea
                                        id="mobiles-single-input"
                                        value={mobiles}
                                        onChange={(e) => setMobiles(e.target.value)}
                                        placeholder={bs.single.mobilePlaceholder}
                                        rows={3}
                                        disabled={usePresetMobiles}
                                    />
                                </div>

                                {selectedTemplate && (
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <Label>{bs.single.paramsTitle}</Label>
                                            <span className="text-xs text-muted-foreground">{bs.single.paramHint}</span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                                            {templateParams.map((param, index) => (
                                                <div key={index}>
                                                    <Label htmlFor={`param-${index}`}>{param.name}</Label>
                                                    <Input
                                                        id={`param-${index}`}
                                                        value={param.value}
                                                        onChange={(e) => handleParamChange(index, e.target.value)}
                                                        placeholder={`${bs.single.paramValue}`}
                                                    />
                                                </div>
                                            ))}
                                            {templateParams.length === 0 && (
                                                <p className="text-xs text-muted-foreground">{bs.single.noParams}</p>
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
                                    {bs.single.send}
                                </LoadingButton>
                            </CardContent>
                        </Card>

                        {sendResults.length > 0 && (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="text-center">
                                                <p className="text-sm text-muted-foreground">{bs.results.total}</p>
                                                <p className="text-2xl">{sendStats.total}</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="text-center">
                                                <p className="text-sm text-muted-foreground">{bs.results.success}</p>
                                                <p className="text-2xl text-green-600">{sendStats.success}</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="text-center">
                                                <p className="text-sm text-muted-foreground">{bs.results.failure}</p>
                                                <p className="text-2xl text-red-600">{sendStats.failure}</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                <Card>
                                    <CardHeader>
                                        <div className="flex justify-between items-center">
                                            <CardTitle>{bs.results.title}</CardTitle>
                                            <Button onClick={downloadResults} size="sm">
                                                <Download className="w-4 h-4 mr-2" />
                                                {bs.results.export}
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>{bs.results.table.mobile}</TableHead>
                                                    <TableHead>{bs.results.table.result}</TableHead>
                                                    <TableHead>{bs.results.table.detail}</TableHead>
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
                                                                            className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                                                                            {t.scripts.taskAutomation.table.success}
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge variant="destructive">{t.scripts.taskAutomation.table.failed}</Badge>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => toggleResultDetails(rowKey)}
                                                                    >
                                                                        {expandedResult === rowKey ? bs.results.table.hide : bs.results.table.view}
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                            {expandedResult === rowKey && (
                                                                <TableRow>
                                                                    <TableCell colSpan={3}>
                                                                        <div
                                                                            className="p-3 bg-muted/50 rounded-md text-sm animate-in fade-in-50 duration-200">
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

                    {/* 批量模板发送 */}
                    <TabsContent value="batchSend" className="space-y-6 animate-in fade-in-50 duration-300">
                        <Card>
                            <CardHeader>
                                <CardTitle>{bs.batch.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <Label htmlFor="batch-env-select">{bs.template.envLabel}</Label>
                                        <Select value={environment}
                                            onValueChange={(v) => setEnvironment(v as 'test' | 'prod')}>
                                            <SelectTrigger>
                                                <SelectValue placeholder={bs.template.envPlaceholder} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="test">{bs.template.envTest}</SelectItem>
                                                <SelectItem value="prod">{bs.template.envProd}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="timeout-batch-input">{bs.template.timeoutLabel}</Label>
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
                                        <Label>{bs.batch.templateList}</Label>
                                        <div className="flex items-center gap-2">
                                            <div className="w-56">
                                                <Input
                                                    placeholder={bs.batch.searchAllowed}
                                                    value={allowedFilter}
                                                    onChange={(e) => setAllowedFilter(e.target.value)}
                                                />
                                            </div>
                                            <Button variant="ghost" size="sm" onClick={fetchAllowedTemplates}
                                                disabled={isFetchingAllowed}>
                                                <Refresh className="w-4 h-4 mr-1" />
                                                {bs.single.refresh}
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={selectAllAllowed}>
                                                {bs.batch.selectAll}
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={clearAllSelected}>
                                                {bs.batch.clearSelection}
                                            </Button>
                                        </div>
                                    </div>

                                    {allowedTemplates.length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <Info className="w-10 h-10 mx-auto mb-3 opacity-50 text-blue-500" />
                                            <p>{bs.batch.noAllowed}</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {filteredAllowedTemplates.map((t) => {
                                                const checked = selectedTemplates.includes(t.code);
                                                return (
                                                    <div
                                                        key={t.code}
                                                        className={`p-3 border rounded-md cursor-pointer transition-all duration-200 ${checked ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm' : 'border-gray-200 dark:border-border hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
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
                                        <Label htmlFor="mobiles-batch-input">{bs.batch.mobileList}</Label>
                                        <Textarea
                                            id="mobiles-batch-input"
                                            value={mobiles}
                                            onChange={(e) => setMobiles(e.target.value)}
                                            placeholder={bs.batch.mobilePlaceholder}
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
                                            <Label htmlFor="use-preset-batch">{bs.batch.usePreset}</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="random-send"
                                                checked={randomSend}
                                                onCheckedChange={(checked) => setRandomSend(Boolean(checked))}
                                            />
                                            <Label htmlFor="random-send">{bs.batch.randomSend}</Label>
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
                                    {bs.batch.send}
                                </LoadingButton>
                            </CardContent>
                        </Card>

                        {sendResults.length > 0 && (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="text-center">
                                                <p className="text-sm text-muted-foreground">{bs.results.total}</p>
                                                <p className="text-2xl">{sendStats.total}</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="text-center">
                                                <p className="text-sm text-muted-foreground">{bs.results.success}</p>
                                                <p className="text-2xl text-green-600">{sendStats.success}</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="text-center">
                                                <p className="text-sm text-muted-foreground">{bs.results.failure}</p>
                                                <p className="text-2xl text-red-600">{sendStats.failure}</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                <Card>
                                    <CardHeader>
                                        <div className="flex justify-between items-center">
                                            <CardTitle>{bs.results.title}</CardTitle>
                                            <Button onClick={downloadResults} size="sm">
                                                <Download className="w-4 h-4 mr-2" />
                                                {bs.results.export}
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>{bs.results.table.mobile}</TableHead>
                                                    <TableHead>{bs.results.table.template}</TableHead>
                                                    <TableHead>{bs.results.table.result}</TableHead>
                                                    <TableHead>{bs.results.table.detail}</TableHead>
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
                                                                            className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                                                                            {t.scripts.taskAutomation.table.success}
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge variant="destructive">{t.scripts.taskAutomation.table.failed}</Badge>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => toggleResultDetails(rowKey)}
                                                                    >
                                                                        {expandedResult === rowKey ? bs.results.table.hide : bs.results.table.view}
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                            {expandedResult === rowKey && (
                                                                <TableRow>
                                                                    <TableCell colSpan={4}>
                                                                        <div
                                                                            className="p-3 bg-muted/50 rounded-md text-sm animate-in fade-in-50 duration-200">
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
                                <CardTitle>{bs.resend.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <Label htmlFor="resend-env-select">{bs.template.envLabel}</Label>
                                        <Select value={environment}
                                            onValueChange={(v) => setEnvironment(v as 'test' | 'prod')}>
                                            <SelectTrigger>
                                                <SelectValue placeholder={bs.template.envPlaceholder} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="test">{bs.template.envTest}</SelectItem>
                                                <SelectItem value="prod">{bs.template.envProd}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="timeout-resend-input">{bs.template.timeoutLabel}</Label>
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
                                        <Label>{bs.resend.typeLabel}</Label>
                                        <div className="flex space-x-6">
                                            <RadioButton
                                                id="resend-by-mobile"
                                                name="resend-mode"
                                                checked={resendType === 'mobile'}
                                                onChange={() => setResendType('mobile')}
                                                label={bs.resend.mobileType}
                                            />
                                            <RadioButton
                                                id="resend-by-batch"
                                                name="resend-mode"
                                                checked={resendType === 'batch'}
                                                onChange={() => setResendType('batch')}
                                                label={bs.resend.batchType}
                                            />
                                        </div>
                                    </div>

                                    {resendType === 'mobile' ? (
                                        <div className="space-y-4">
                                            <div>
                                                <Label htmlFor="resend-mobile-input">{bs.resend.mobileLabel}</Label>
                                                <Input
                                                    id="resend-mobile-input"
                                                    value={resendMobile}
                                                    onChange={(e) => setResendMobile(e.target.value)}
                                                    placeholder={bs.resend.mobilePlaceholder}
                                                    maxLength={11}
                                                    required
                                                />
                                                <p className="text-xs text-muted-foreground mt-1">{bs.resend.mobileHint}</p>
                                            </div>
                                            {/* 新增税地ID输入框 */}
                                            <div>
                                                <Label htmlFor="resend-tax-id-input">{bs.resend.taxIdLabel}</Label>
                                                <Input
                                                    id="resend-tax-id-input"
                                                    value={resendTaxId}
                                                    onChange={(e) => setResendTaxId(e.target.value)}
                                                    placeholder={bs.resend.taxIdPlaceholder}
                                                    required
                                                />
                                                <p className="text-xs text-muted-foreground mt-1">{bs.resend.taxIdHint}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <Label htmlFor="resend-batch-input">{bs.resend.batchNoLabel}</Label>
                                            <Input
                                                id="resend-batch-input"
                                                value={resendBatchNo}
                                                onChange={(e) => setResendBatchNo(e.target.value)}
                                                placeholder={bs.resend.batchNoPlaceholder}
                                            />
                                            <p className="text-xs text-muted-foreground mt-1">{bs.resend.batchNoHint}</p>
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
                                    {bs.resend.submit}
                                </LoadingButton>
                            </CardContent>
                        </Card>

                        {resendResult && (
                            <Card className="animate-in fade-in-50 duration-300">
                                <CardHeader>
                                    <CardTitle>{bs.resend.resultTitle}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div
                                        className={`p-4 rounded-md ${resendResult.success
                                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                                            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                                            }`}
                                    >
                                        <div>
                                            <p
                                                className={`font-medium ${resendResult.success ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'
                                                    }`}
                                            >
                                                {resendResult.success ? bs.messages.resendSuccess : bs.messages.resendFail}
                                            </p>
                                            <p className="mt-1 text-sm">{resendResult.message}</p>
                                            {Array.isArray(resendResult.data) && resendResult.data.length > 0 && (
                                                <div className="mt-3">
                                                    <p className="text-xs text-muted-foreground mb-1">{bs.resend.details}</p>
                                                    <pre className="text-sm bg-muted text-foreground p-2 rounded whitespace-pre-wrap">
                                                        {JSON.stringify(resendResult.data, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                {bs.resend.requestId}: {resendResult.request_id}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    {/* 短信日志 */}
                    <TabsContent value="smsLogs" className="space-y-6 animate-in fade-in-50 duration-300">
                        <Card>
                            <CardHeader>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <CardTitle>{bs.logs.title}</CardTitle>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" onClick={() => fetchLogs(1)} disabled={logsLoading}>
                                                <Refresh className={`w-4 h-4 mr-2 ${logsLoading ? 'animate-spin' : ''}`} />
                                                {bs.logs.refresh}
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-4 items-end bg-muted/50 p-4 rounded-lg">
                                        <div className="w-full sm:w-48 space-y-2">
                                            <Label>{bs.logs.filters.mobile}</Label>
                                            <Input
                                                placeholder={bs.logs.filters.mobilePlaceholder}
                                                value={logFilterMobile}
                                                onChange={(e) => setLogFilterMobile(e.target.value)}
                                            />
                                        </div>
                                        <div className="w-full sm:w-32 space-y-2">
                                            <Label>{bs.logs.filters.sendStatus}</Label>
                                            <Select value={logFilterSendStatus} onValueChange={(val) => setLogFilterSendStatus(val === 'all' ? '' : val)}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={bs.logs.filters.all} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">{bs.logs.filters.all}</SelectItem>
                                                    <SelectItem value="10">{bs.logs.filters.success}</SelectItem>
                                                    <SelectItem value="20">{bs.logs.filters.failed}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="w-full sm:w-32 space-y-2">
                                            <Label>{bs.logs.filters.receiveStatus}</Label>
                                            <Select value={logFilterReceiveStatus} onValueChange={(val) => setLogFilterReceiveStatus(val === 'all' ? '' : val)}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={bs.logs.filters.all} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">{bs.logs.filters.all}</SelectItem>
                                                    <SelectItem value="10">{bs.logs.filters.success}</SelectItem>
                                                    <SelectItem value="20">{bs.logs.filters.failed}</SelectItem>
                                                    <SelectItem value="0">{bs.logs.filters.pending}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button
                                            onClick={() => fetchLogs(1)}
                                            disabled={logsLoading}
                                            className="mb-0.5"
                                        >
                                            {bs.logs.query}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={resetFilters}
                                            disabled={logsLoading}
                                            className="mb-0.5"
                                        >
                                            {bs.logs.reset}
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{bs.logs.table.id}</TableHead>
                                            <TableHead>{bs.logs.table.mobile}</TableHead>
                                            <TableHead>{bs.logs.table.templateCode}</TableHead>
                                            <TableHead>{bs.logs.table.content}</TableHead>
                                            <TableHead>{bs.logs.table.sendStatus}</TableHead>
                                            <TableHead>{bs.logs.table.receiveStatus}</TableHead>
                                            <TableHead>{bs.logs.table.sendTime}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {smsLogs.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                                    {bs.logs.table.empty}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            smsLogs.map((log) => (
                                                <TableRow key={log.id}>
                                                    <TableCell>{log.id}</TableCell>
                                                    <TableCell>{log.mobile}</TableCell>
                                                    <TableCell>{log.templateCode}</TableCell>
                                                    <TableCell className="max-w-xs truncate" title={log.templateContent}>
                                                        {log.templateContent}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={log.sendStatus === 10 ? 'default' : 'secondary'}>
                                                            {log.sendStatus === 10 ? bs.logs.table.success : log.sendStatus === 20 ? bs.logs.table.failed : bs.logs.table.unknown}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={log.receiveStatus === 10 ? 'default' : log.receiveStatus === 20 ? 'destructive' : 'secondary'}>
                                                            {log.receiveStatus === 10 ? bs.logs.table.success : log.receiveStatus === 20 ? bs.logs.table.failed : bs.logs.table.waiting}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>{new Date(log.sendTime).toLocaleString()}</TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>

                                {/* Pagination */}
                                {logTotal > 0 && (
                                    <div className="flex justify-between items-center mt-4">
                                        <div className="text-sm text-muted-foreground">
                                            {bs.logs.pagination.total.replace('{total}', logTotal.toString())}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={logPage <= 1 || logsLoading}
                                                onClick={() => fetchLogs(logPage - 1)}
                                            >
                                                {bs.logs.pagination.prev}
                                            </Button>
                                            <span className="flex items-center px-2 text-sm">
                                                {bs.logs.pagination.page.replace('{page}', logPage.toString())}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={logsLoading || smsLogs.length < 10} // Simple check, ideally check against total/pageSize
                                                onClick={() => fetchLogs(logPage + 1)}
                                            >
                                                {bs.logs.pagination.next}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Login Prompt Dialog */}
            <Dialog open={showLoginPrompt} onOpenChange={setShowLoginPrompt}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{bs.login.title}</DialogTitle>
                        <DialogDescription>
                            {bs.login.description.replace('{env}', environment === 'test' ? bs.login.envTest : bs.login.envProd)}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="secretKey" className="text-right">
                                {bs.login.secretLabel}
                            </Label>
                            <Input
                                id="secretKey"
                                type="password"
                                value={secretKey}
                                onChange={(e) => setSecretKey(e.target.value)}
                                className="col-span-3"
                                placeholder={bs.login.secretPlaceholder}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAdminLogin();
                                }}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowLoginPrompt(false)}>{bs.login.cancel}</Button>
                        <LoadingButton onClick={handleAdminLogin} isLoading={isLoggingIn}>
                            {bs.login.submit}
                        </LoadingButton>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}