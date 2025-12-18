
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast, Toaster } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { ArrowLeft, Loader2, Upload, File as FileIcon, X, CheckCircle, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { getApiBaseUrl } from '../lib/api';

interface DeliveryScriptProps {
    onBack: () => void;
}

interface Task {
    taskId: string;
    taskName: string;
    taskDesc: string;
    status: number;
    myStatus: number;
    minCost: string;
    maxCost: string;
    enterpriseName: string | null;
    taskType: number;
    taskStaffId: string;
    taskAssignId: string;
}

interface Attachment {
    fileName: string;
    tempPath: string; // wxfile://...
    fileType: string;
    uploadTime: number;
    fileLength: number;
    isPic: number; // 0 or 1
    isWx: number; // 0 or 1
    filePath: string;
    // Local helper
    uploading?: boolean;
    error?: string;
    fileObj?: File;
    previewUrl?: string; // Local preview URL
}

export default function DeliveryScript({ onBack }: DeliveryScriptProps) {
    // Auth State
    const [step, setStep] = useState<'login' | 'proccess'>('login');
    const [mobile, setMobile] = useState('');
    const [environment, setEnvironment] = useState('test');
    const [token, setToken] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // Data State
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoadingTasks, setIsLoadingTasks] = useState(false);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

    // Form State
    const [reportName, setReportName] = useState('');
    const [reportContent, setReportContent] = useState('');
    const [reportAddress, setReportAddress] = useState('');
    const [supplement, setSupplement] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Validation State
    const [showValidation, setShowValidation] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    const apiBaseUrl = getApiBaseUrl();

    // 0. Cleanup object URLs
    useEffect(() => {
        return () => {
            attachments.forEach(a => {
                if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
            });
        };
    }, []);

    // 1. Navigation Logic
    const handleBack = () => {
        if (step === 'proccess') {
            setStep('login');
            // Optional: clear state?
            setTasks([]);
            setToken('');
            setAttachments([]);
        } else {
            onBack();
        }
    };

    // 2. Login Logic
    const handleLogin = async () => {
        if (!mobile || mobile.length !== 11) {
            toast.error('请输入11位有效手机号');
            return;
        }
        setIsLoggingIn(true);
        try {
            const res = await axios.post(`${apiBaseUrl}/delivery/login`, {
                mobile,
                environment,
                code: '987654'
            });
            if (res.data.success) {
                setToken(res.data.token);
                toast.success('登录成功');
                setStep('proccess');
                fetchTasks(res.data.token);
            } else {
                toast.error(res.data.msg || '登录失败');
            }
        } catch (e) {
            toast.error('登录请求异常');
            console.error(e);
        } finally {
            setIsLoggingIn(false);
        }
    };

    // 3. Fetch Tasks Logic
    const fetchTasks = async (currentToken: string) => {
        setIsLoadingTasks(true);
        try {
            const res = await axios.post(`${apiBaseUrl}/delivery/tasks`, {
                environment,
                token: currentToken,
                status: 0
            });

            if (res.data && res.data.code === 0 && res.data.data && res.data.data.list) {
                const list: Task[] = res.data.data.list;
                // Filter myStatus == 4
                const filtered = list.filter(t => t.myStatus === 4);
                setTasks(filtered);

                if (filtered.length > 0) {
                    // Default select the first (which is usually latest from API)
                    setSelectedTaskId(filtered[0].taskId);
                } else {
                    // toast.info('该用户没有待交付(myStatus=4)的任务');
                    setSelectedTaskId(null);
                }
            } else {
                toast.error(res.data.msg || '获取任务失败');
            }
        } catch (e) {
            toast.error('获取任务列表异常');
            console.error(e);
        } finally {
            setIsLoadingTasks(false);
        }
    };

    // 4. Upload Logic
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isPic: boolean) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        // Validation limits
        const currentPics = attachments.filter(a => a.isPic === 1).length;
        const currentFiles = attachments.filter(a => a.isPic === 0).length;

        const newAttachments: Attachment[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            // Size check (10MB)
            if (file.size > 10 * 1024 * 1024) {
                toast.error(`文件 ${file.name} 超过10MB限制`);
                continue;
            }

            // Count check
            if (isPic) {
                if (currentPics + newAttachments.filter(a => a.isPic === 1).length >= 9) {
                    toast.error('图片最多上传9张');
                    break;
                }
            } else {
                if (currentFiles + newAttachments.filter(a => a.isPic === 0).length >= 6) {
                    toast.error('附件最多上传6个');
                    break;
                }
            }

            // Create placeholder
            const newItem: Attachment = {
                fileName: file.name,
                tempPath: '',
                fileType: '.' + file.name.split('.').pop()?.toLowerCase(),
                uploadTime: Date.now(),
                fileLength: file.size,
                isPic: isPic ? 1 : 0,
                isWx: 0,
                filePath: '',
                uploading: true,
                fileObj: file,
                previewUrl: isPic ? URL.createObjectURL(file) : undefined
            };
            newAttachments.push(newItem);
        }

        // Add to state
        setAttachments(prev => [...prev, ...newAttachments]);

        // Trigger upload for each
        for (const item of newAttachments) {
            await uploadSingleFile(item);
        }

        // Reset input
        e.target.value = '';
    };

    const uploadSingleFile = async (item: Attachment) => {
        if (!item.fileObj) return;
        const formData = new FormData();
        formData.append('environment', environment);
        formData.append('token', token);
        formData.append('file', item.fileObj);

        try {
            const res = await axios.post(`${apiBaseUrl}/delivery/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data && res.data.code === 0) {
                // Success
                const remoteData = res.data.data || {};
                // Assumption: remoteData has { filename: "...", url: "..." } or { path: "..." }
                // Based on user request, filePath should be "app/..."
                // We'll use remoteData.name or remoteData.url logic

                // Typical Ruoyi response: { url: "http.../profile/upload/...", fileName: "/profile/upload/...", newFileName: "..." }
                // User log sample: filePath: "app/2025-12-18/tmp_..."
                // We need to extract the relative path expected by backend.
                // Assuming the response returns the relative path or we assume just the name?
                // Safest bet: Use the 'data' field directly if it's a string, or extract 'fileName' or 'url'.
                // If data is just a string?

                let finalPath = '';
                if (typeof res.data.data === 'string') {
                    finalPath = res.data.data;
                } else if (typeof res.data.data === 'object') {
                    finalPath = res.data.data.fileName || res.data.data.url || '';
                }

                // If path starts with http, strip it? Or keep it? 
                // User log: "app/2025-12-18/..." (Verified relative path)

                setAttachments(prev => prev.map(p => {
                    if (p === item) {
                        return {
                            ...p,
                            uploading: false,
                            filePath: finalPath,
                            tempPath: finalPath // Use filePath as tempPath for web
                        };
                    }
                    return p;
                }));
            } else {
                throw new Error(res.data.msg || 'Upload failed');
            }
        } catch (e: any) {
            console.error(e);
            setAttachments(prev => prev.map(p => {
                if (p === item) {
                    return { ...p, uploading: false, error: e.message || '上传失败' };
                }
                return p;
            }));
            toast.error(`文件 ${item.fileName} 上传失败`);
        }
    };

    const removeAttachment = (index: number) => {
        setAttachments(prev => {
            const item = prev[index];
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            return prev.filter((_, i) => i !== index);
        });
    };

    // 5. Submit Logic
    const handleSubmit = async () => {
        setShowValidation(true);
        if (!selectedTaskId) return toast.error('请选择任务');

        // Validation
        let isValid = true;
        if (!reportName || reportName.length > 20) isValid = false;
        if (!reportContent || reportContent.length > 300) isValid = false;
        if (!reportAddress || reportAddress.length > 100) isValid = false;
        if (supplement.length > 50) isValid = false;

        // Attachment Rule: Must have at least one (pic or file)
        if (attachments.length === 0) {
            toast.error('请至少上传一张图片或一个附件');
            return;
        }

        if (!isValid) return; // UI shows error

        const uploadingItem = attachments.find(a => a.uploading);
        if (uploadingItem) return toast.error('请等待所有文件上传完成');
        const errorItem = attachments.find(a => a.error);
        if (errorItem) return toast.error('请删除上传失败的文件');
        const emptyItem = attachments.find(a => !a.filePath);
        if (emptyItem) return toast.error('存在未成功获取路径的文件');

        const selectedTask = tasks.find(t => t.taskId === selectedTaskId);
        if (!selectedTask) return;

        setIsSubmitting(true);

        const payload = {
            taskId: selectedTask.taskId,
            taskStaffId: selectedTask.taskStaffId,
            taskAssignId: selectedTask.taskAssignId,
            taskContent: reportContent,
            reportName: reportName,
            reportAddress: reportAddress,
            supplement: supplement || '', // Fix: Empty string instead of <Undefined>
            attachments: attachments.map(a => ({
                fileName: a.fileName,
                tempPath: a.tempPath || `wxfile://${a.fileName}`, // Fallback
                fileType: a.fileType,
                uploadTime: a.uploadTime,
                fileLength: a.fileLength,
                isPic: a.isPic,
                isWx: 0,
                filePath: a.filePath
            }))
        };

        try {
            const res = await axios.post(`${apiBaseUrl}/delivery/submit`, {
                environment,
                token,
                payload
            });

            if (res.data && res.data.code == 0) {
                toast.success('交付物已上传成功！');
                // Refresh tasks
                fetchTasks(token);
                // Clear form
                setReportName('');
                setReportContent('');
                setSupplement('');
                setAttachments([]);
                setShowValidation(false);
            } else {
                toast.error(res.data.msg || '提交失败');
            }
        } catch (e) {
            toast.error('提交请求异常');
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="container max-w-6xl mx-auto py-6 animate-in fade-in duration-500">
            <Toaster richColors position="top-center" />
            {/* Image Zoom Modal */}
            {previewImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setPreviewImage(null)}
                >
                    <div className="relative max-w-4xl max-h-[90vh] p-2">
                        <img
                            src={previewImage}
                            alt="Full Preview"
                            className="w-full h-full object-contain rounded-lg shadow-2xl"
                        />
                        <button
                            className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
                            onClick={() => setPreviewImage(null)}
                        >
                            <X className="h-8 w-8" />
                        </button>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                    <Button variant="ghost" size="icon" onClick={handleBack}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">交付物提交工具</h2>
                        <p className="text-muted-foreground">
                            协助运营人员为指定用户快速提交任务交付物
                        </p>
                    </div>
                </div>
            </div>

            {step === 'login' ? (
                <div className="max-w-md mx-auto mt-20">
                    <Card>
                        <CardHeader>
                            <CardTitle>用户登录</CardTitle>
                            <CardDescription>请输入用户手机号获取权限</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>环境</Label>
                                <Select value={environment} onValueChange={setEnvironment}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="test">测试环境</SelectItem>
                                        <SelectItem value="prod">生产环境</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>手机号</Label>
                                <Input
                                    placeholder="请输入11位手机号"
                                    value={mobile}
                                    onChange={e => setMobile(e.target.value)}
                                    maxLength={11}
                                />
                            </div>
                            <Button className="w-full" onClick={handleLogin} disabled={isLoggingIn}>
                                {isLoggingIn ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                登录并获取任务
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Task List */}
                    <Card className="lg:col-span-1 h-[calc(100vh-200px)] flex flex-col">
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">待交付任务 (myStatus=4)</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 p-0 overflow-hidden">
                            <ScrollArea className="h-full px-4">
                                {isLoadingTasks ? (
                                    <div className="space-y-2 py-4">
                                        <Skeleton className="h-20 w-full" />
                                        <Skeleton className="h-20 w-full" />
                                    </div>
                                ) : tasks.length === 0 ? (
                                    <div className="p-4 text-center text-sm text-muted-foreground">暂无待交付任务</div>
                                ) : (
                                    <div className="space-y-2 py-4">
                                        {tasks.map(task => (
                                            <div
                                                key={task.taskId}
                                                className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedTaskId === task.taskId ? 'bg-primary/10 border-primary' : 'hover:bg-accent'}`}
                                                onClick={() => setSelectedTaskId(task.taskId)}
                                            >
                                                <div className="font-medium text-sm line-clamp-1">{task.taskName}</div>
                                                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.taskDesc}</div>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <Badge variant="outline" className="text-[10px]">{task.minCost}-{task.maxCost}元</Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                        </CardContent>
                        <div className="p-4 border-t">
                            <Button variant="outline" className="w-full" size="sm" onClick={() => fetchTasks(token)}>
                                刷新列表
                            </Button>
                        </div>
                    </Card>

                    {/* Right: Form */}
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle>填写交付报告</CardTitle>
                            <CardDescription>
                                当前选中: {tasks.find(t => t.taskId === selectedTaskId)?.taskName || '未选择'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>报告名称 <span className="text-red-500">*</span></Label>
                                    <Input
                                        maxLength={20}
                                        placeholder="请填写报告名称"
                                        value={reportName}
                                        onChange={e => setReportName(e.target.value)}
                                        className={showValidation && !reportName ? 'border-red-500' : ''}
                                    />
                                    {showValidation && !reportName && <span className="text-xs text-red-500">请填写报告名称</span>}
                                </div>
                                <div className="space-y-2">
                                    <Label>位置信息 <span className="text-red-500">*</span></Label>
                                    <Input
                                        maxLength={100}
                                        placeholder="请填写位置信息"
                                        value={reportAddress}
                                        onChange={e => setReportAddress(e.target.value)}
                                        className={showValidation && !reportAddress ? 'border-red-500' : ''}
                                    />
                                    {showValidation && !reportAddress && <span className="text-xs text-red-500">请填写位置信息</span>}
                                </div>
                            </div>

                            <div className="space-y-2 relative">
                                <Label>报告内容 <span className="text-red-500">*</span></Label>
                                <div className="relative">
                                    <Textarea
                                        maxLength={300}
                                        placeholder="请填写报告内容，报告内容需要与实际业务匹配"
                                        className={`h-24 pb-6 ${showValidation && !reportContent ? 'border-red-500' : ''}`}
                                        value={reportContent}
                                        onChange={e => setReportContent(e.target.value)}
                                    />
                                    <span className="absolute bottom-2 right-2 text-xs text-muted-foreground pointer-events-none">
                                        {reportContent.length}/300
                                    </span>
                                </div>
                                {showValidation && !reportContent && <span className="text-xs text-red-500">请填写报告内容</span>}
                            </div>

                            <div className="space-y-2">
                                <Label>补充说明 (选填)</Label>
                                <Input
                                    maxLength={50}
                                    placeholder="请填写补充说明（选填项）"
                                    value={supplement}
                                    onChange={e => setSupplement(e.target.value)}
                                />
                            </div>

                            <div className="space-y-4 pt-4 border-t">
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <Label>图片 (最多9张, 10MB/张)</Label>
                                        <Badge variant="secondary">{attachments.filter(a => a.isPic === 1).length}/9</Badge>
                                    </div>
                                    <div className="flex flex-wrap gap-4">
                                        {attachments.filter(a => a.isPic === 1).map((item, idx) => (
                                            <div key={idx} className="relative w-20 h-20 border rounded-md flex items-center justify-center bg-slate-50 group overflow-hidden">
                                                {item.uploading ? (
                                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                                ) : item.error ? (
                                                    <AlertCircle className="h-6 w-6 text-red-500" />
                                                ) : item.previewUrl ? (
                                                    <img
                                                        src={item.previewUrl}
                                                        alt="preview"
                                                        className="w-full h-full object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
                                                        onClick={() => item.previewUrl && setPreviewImage(item.previewUrl)}
                                                    />
                                                ) : (
                                                    <ImageIcon className="h-8 w-8 text-slate-300" />
                                                )}
                                                <button
                                                    className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow-sm border opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                    onClick={() => removeAttachment(attachments.indexOf(item))}
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                                {!item.previewUrl && item.fileName && <span className="absolute bottom-0 text-[8px] w-full text-center truncate px-1 bg-white/80">{item.fileName}</span>}
                                            </div>
                                        ))}
                                        {attachments.filter(a => a.isPic === 1).length < 9 && (
                                            <Label htmlFor="upload-pic" className="w-20 h-20 border border-dashed rounded-md flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors">
                                                <Upload className="h-5 w-5 text-muted-foreground" />
                                                <span className="text-[10px] text-muted-foreground mt-1">上传</span>
                                                <input id="upload-pic" type="file" accept="image/*" multiple className="hidden" onChange={e => handleFileUpload(e, true)} />
                                            </Label>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <Label>附件 (最多6个, 10MB/个)</Label>
                                        <Badge variant="secondary">{attachments.filter(a => a.isPic === 0).length}/6</Badge>
                                    </div>
                                    <div className="space-y-2">
                                        {attachments.filter(a => a.isPic === 0).map((item, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-2 border rounded-md bg-slate-50 text-sm">
                                                <div className="flex items-center space-x-2 truncate">
                                                    <FileIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                                    <span className="truncate max-w-[200px]">{item.fileName}</span>
                                                    {item.uploading && <Loader2 className="h-3 w-3 animate-spin" />}
                                                    {item.error && <span className="text-red-500 text-xs">{item.error}</span>}
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeAttachment(attachments.indexOf(item))}>
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ))}
                                        {attachments.filter(a => a.isPic === 0).length < 6 && (
                                            <Label htmlFor="upload-file" className="block w-full">
                                                <div className="w-full h-10 border border-dashed rounded-md flex items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors">
                                                    <span className="text-xs text-muted-foreground flex items-center"><Upload className="h-3 w-3 mr-1" /> 点击上传附件</span>
                                                </div>
                                                <input id="upload-file" type="file" accept="*" multiple className="hidden" onChange={e => handleFileUpload(e, false)} />
                                            </Label>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Validation warning for attachments */}
                            {showValidation && attachments.length === 0 && (
                                <div className="text-sm text-red-500 flex items-center bg-red-50 p-2 rounded">
                                    <AlertCircle className="w-4 h-4 mr-2" />
                                    请至少上传一张图片或一个附件
                                </div>
                            )}

                            <Button className="w-full mt-4" onClick={handleSubmit} disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                确认提交交付
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
