import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { ArrowLeft, Play, FileText, Folder, Loader2, Download, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { getApiBaseUrl } from '../lib/api';

// Extend File interface to include webkitRelativePath (used by directory upload)
interface FileWithPath extends File {
    readonly webkitRelativePath: string;
}

interface OCRScriptProps {
    onBack: () => void;
}

export default function OCRScript({ onBack }: OCRScriptProps) {
    const [excelFile, setExcelFile] = useState<File | null>(null);
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [mode, setMode] = useState('1');
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [downloadUrl, setDownloadUrl] = useState('');
    const [uploadProgress, setUploadProgress] = useState(0);

    // 进度跟踪
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
    const [requestId, setRequestId] = useState<string>('');
    const [isAborting, setIsAborting] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const folderInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    useEffect(() => {
        if (folderInputRef.current) {
            folderInputRef.current.setAttribute('webkitdirectory', '');
            folderInputRef.current.setAttribute('directory', '');
        }
    }, []);

    const handleScroll = () => {
        if (scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
        }
    };

    const handleExcelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setExcelFile(file);
    };

    const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            const arr: File[] = [];
            for (let i = 0; i < files.length; i++) arr.push(files[i]);
            setImageFiles(arr);
        }
    };

    // 计算总文件大小
    const getTotalSize = () => {
        let total = excelFile?.size || 0;
        imageFiles.forEach(f => total += f.size);
        return (total / 1024 / 1024).toFixed(2);
    };

    const handleRun = async () => {
        if (!excelFile) {
            toast.error('请选择 Excel 文件');
            return;
        }
        if (imageFiles.length === 0) {
            toast.error('请选择附件文件夹');
            return;
        }

        setIsRunning(true);
        setLogs([]);
        setDownloadUrl('');
        setUploadProgress(0);
        setProgress(null);
        setRequestId('');
        setIsAborting(false);

        // 创建 AbortController 用于中止请求
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const base = getApiBaseUrl();
            if (!base) {
                setIsRunning(false);
                return;
            }

            const formData = new FormData();
            formData.append('mode', mode);
            formData.append('excel_file', excelFile);

            for (const file of imageFiles) {
                const relativePath = (file as FileWithPath).webkitRelativePath || file.name;
                formData.append('image_files', file, relativePath);
            }

            const totalSize = getTotalSize();
            setLogs(prev => [...prev, `📤 开始上传: Excel + ${imageFiles.length} 个图片 (共 ${totalSize} MB)`]);
            setLogs(prev => [...prev, `⏳ 上传中，请耐心等待...`]);

            const response = await fetch(`${base}/ocr/process-upload`, {
                method: 'POST',
                body: formData,
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || response.statusText);
            }

            setLogs(prev => [...prev, `✅ 上传完成，开始 OCR 处理...`]);

            const reader = response.body?.getReader();
            if (!reader) throw new Error('无法读取响应流');

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);
                        if (data.type === 'init' && data.request_id) {
                            // 保存 request_id 用于中止请求
                            setRequestId(data.request_id);
                        } else if (data.type === 'progress') {
                            // 更新进度
                            setProgress({ current: data.current, total: data.total });
                        } else if (data.type === 'log') {
                            setLogs(prev => [...prev, data.content]);
                        } else if (data.type === 'result') {
                            if (data.success) {
                                if (data.aborted) {
                                    toast.warning(data.message);
                                } else {
                                    toast.success(data.message);
                                }
                                setLogs(prev => [...prev, `✅ ${data.message}`]);
                                if (data.download_url) {
                                    setDownloadUrl(`${base}/${data.download_url}`);
                                }
                            } else {
                                toast.error(data.message);
                                setLogs(prev => [...prev, `❌ ${data.message}`]);
                            }
                        }
                    } catch { }
                }
            }

            if (buffer.trim()) {
                try {
                    const data = JSON.parse(buffer);
                    if (data.type === 'result' && data.success && data.download_url) {
                        setDownloadUrl(`${base}/${data.download_url}`);
                    }
                } catch { }
            }

        } catch (error: unknown) {
            // 检查是否为用户中止
            if (error instanceof Error && error.name === 'AbortError') {
                setLogs(prev => [...prev, `⚠️ 请求已被用户中止`]);
            } else {
                const errMsg = error instanceof Error ? error.message : String(error);
                toast.error('请求失败: ' + errMsg);
                setLogs(prev => [...prev, `❌ 错误: ${errMsg}`]);
            }
        } finally {
            setIsRunning(false);
            setIsAborting(false);
            setProgress(null);
            abortControllerRef.current = null;
        }
    };

    // 中止处理函数
    const handleAbort = async () => {
        if (!requestId || isAborting) return;

        setIsAborting(true);
        setLogs(prev => [...prev, `⚠️ 正在发送中止请求...`]);

        try {
            const base = getApiBaseUrl();
            if (base && requestId) {
                await fetch(`${base}/ocr/abort/${requestId}`, { method: 'POST' });
            }
            // 同时中止 fetch 流
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        } catch (err) {
            console.error('中止请求失败:', err);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 md:p-12 font-sans text-slate-900">
            {/* 顶栏：标题与返回 */}
            <div className="max-w-7xl mx-auto mb-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={onBack}
                        className="h-10 w-10 rounded-full border-slate-200 bg-white shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-all"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                            OCR 智能比对
                        </h1>
                        <p className="text-sm font-medium text-slate-500 mt-1">
                            个人信息自动化识别与校验系统
                        </p>
                    </div>
                </div>
                {/* 状态指示器 & 中止按钮 */}
                {isRunning && (
                    <div className="flex items-center gap-3">
                        {/* 进度显示 */}
                        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {progress ? (
                                <span>处理中: {progress.current} / {progress.total}</span>
                            ) : (
                                <span>正在初始化...</span>
                            )}
                        </div>
                        {/* 中止按钮 */}
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleAbort}
                            disabled={isAborting || !requestId}
                            className="rounded-full"
                        >
                            {isAborting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                    中止中...
                                </>
                            ) : (
                                '终止处理'
                            )}
                        </Button>
                    </div>
                )}
            </div>

            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* 左侧：配置与操作区域 */}
                <div className="lg:col-span-5 space-y-6">
                    {/* 文件上传卡片 */}
                    <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm ring-1 ring-slate-900/5 overflow-hidden">
                        <CardHeader className="pb-4 border-b border-slate-100 bg-white/50">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <FileText className="w-5 h-5 text-blue-600" />
                                数据源配置
                            </CardTitle>
                            <CardDescription>
                                请上传包含人员名单的 Excel 及对应的附件文件夹
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            {/* Excel 上传 */}
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-700">人员信息表 (Excel)</Label>
                                <div className="group relative">
                                    <div className={`
                                        relative flex flex-col items-center justify-center w-full h-32 rounded-xl border-2 border-dashed transition-all duration-200
                                        ${excelFile
                                            ? 'border-green-500/50 bg-green-50/50'
                                            : 'border-slate-200 bg-slate-50/50 hover:border-blue-400 hover:bg-blue-50/50'
                                        }
                                    `}>
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                                            {excelFile ? (
                                                <>
                                                    <FileText className="w-8 h-8 text-green-600 mb-2" />
                                                    <p className="text-sm font-medium text-green-700 truncate max-w-full px-4">
                                                        {excelFile.name}
                                                    </p>
                                                    <p className="text-xs text-green-600 mt-1">
                                                        {(excelFile.size / 1024).toFixed(1)} KB
                                                    </p>
                                                </>
                                            ) : (
                                                <>
                                                    <FileText className="w-8 h-8 text-slate-400 mb-2 group-hover:text-blue-500 transition-colors" />
                                                    <p className="text-sm text-slate-600 font-medium">
                                                        点击选择 Excel 文件
                                                    </p>
                                                    <p className="text-xs text-slate-400 mt-1">
                                                        支持 .xlsx, .xls
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                        <Input
                                            id="excel-file"
                                            type="file"
                                            accept=".xlsx,.xls"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            onChange={handleExcelChange}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* 文件夹上传 */}
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-700">
                                    附件图片库
                                    <span className="ml-1 text-xs font-normal text-slate-500">(包含以姓名命名的子文件夹)</span>
                                </Label>
                                <div className="group relative">
                                    <div className={`
                                        relative flex flex-col items-center justify-center w-full h-32 rounded-xl border-2 border-dashed transition-all duration-200
                                        ${imageFiles.length > 0
                                            ? 'border-green-500/50 bg-green-50/50'
                                            : 'border-slate-200 bg-slate-50/50 hover:border-blue-400 hover:bg-blue-50/50'
                                        }
                                    `}>
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                                            {imageFiles.length > 0 ? (
                                                <>
                                                    <Folder className="w-8 h-8 text-green-600 mb-2" />
                                                    <p className="text-sm font-medium text-green-700">
                                                        已选择 {imageFiles.length} 个文件
                                                    </p>
                                                    <p className="text-xs text-green-600 mt-1">
                                                        总大小: {getTotalSize()} MB
                                                    </p>
                                                </>
                                            ) : (
                                                <>
                                                    <Folder className="w-8 h-8 text-slate-400 mb-2 group-hover:text-blue-500 transition-colors" />
                                                    <p className="text-sm text-slate-600 font-medium">
                                                        点击选择附件文件夹
                                                    </p>
                                                    <p className="text-xs text-slate-400 mt-1">
                                                        请选择整个根目录
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                        <input
                                            id="folder-input"
                                            ref={folderInputRef}
                                            type="file"
                                            multiple
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            onChange={handleFolderChange}
                                        />
                                    </div>
                                </div>
                                {imageFiles.length > 500 && (
                                    <div className="flex items-start gap-2 p-3 mt-2 bg-amber-50 border border-amber-100 rounded-lg text-amber-800 text-xs">
                                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span>
                                            文件数量较多（{imageFiles.length}个），上传过程可能需要几分钟，请保持网络通畅。
                                        </span>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* 运行模式 & 按钮 */}
                    <Card className="border-0 shadow-lg bg-white overflow-hidden">
                        <CardContent className="p-6 space-y-6">
                            <div className="space-y-3">
                                <Label className="text-sm font-semibold text-slate-700">运行模式</Label>
                                <RadioGroup value={mode} onValueChange={setMode} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div
                                        className={`
                                            relative flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
                                            ${mode === '1'
                                                ? 'border-blue-600 bg-blue-50/50'
                                                : 'border-slate-100 hover:border-slate-200'
                                            }
                                        `}
                                        onClick={() => setMode('1')}
                                    >
                                        <RadioGroupItem value="1" id="mode-1" className="mt-1" />
                                        <div className="space-y-1">
                                            <Label htmlFor="mode-1" className="font-semibold cursor-pointer">Excel 优先</Label>
                                            <p className="text-xs text-slate-500">按 Excel 名单顺序去查找并匹配附件（推荐）</p>
                                        </div>
                                    </div>

                                    <div
                                        className={`
                                            relative flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
                                            ${mode === '2'
                                                ? 'border-blue-600 bg-blue-50/50'
                                                : 'border-slate-100 hover:border-slate-200'
                                            }
                                        `}
                                        onClick={() => setMode('2')}
                                    >
                                        <RadioGroupItem value="2" id="mode-2" className="mt-1" />
                                        <div className="space-y-1">
                                            <Label htmlFor="mode-2" className="font-semibold cursor-pointer">附件 优先</Label>
                                            <p className="text-xs text-slate-500">遍历附件文件夹识别，反查匹配 Excel</p>
                                        </div>
                                    </div>
                                </RadioGroup>
                            </div>

                            <Button
                                className="w-full h-12 text-lg font-medium shadow-blue-500/20 shadow-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all rounded-xl"
                                onClick={handleRun}
                                disabled={isRunning || !excelFile || imageFiles.length === 0}
                            >
                                {isRunning ? (
                                    <>
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        正在智能处理中...
                                    </>
                                ) : (
                                    <>
                                        <Play className="mr-2 h-5 w-5" />
                                        立即开始比对
                                    </>
                                )}
                            </Button>

                            {/* 进度条区域 */}
                            {isRunning && progress && (
                                <div className="space-y-2 pt-2">
                                    <div className="flex justify-between text-sm text-slate-600">
                                        <span>处理进度</span>
                                        <span className="font-mono font-medium">
                                            {progress.current} / {progress.total}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 ease-out"
                                            style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 text-center">
                                        预计剩余 {progress.total - progress.current} 人待处理
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* 右侧：日志与结果 */}
                <div className="lg:col-span-7 flex flex-col h-full space-y-6">
                    {/* 结果下载卡片 (动态出现) */}
                    {downloadUrl && (
                        <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                            <Card className="bg-gradient-to-r from-emerald-500 to-teal-500 border-0 shadow-lg text-white">
                                <CardContent className="flex items-center justify-between p-6">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-white/20 rounded-full backdrop-blur-sm">
                                            <FileText className="w-6 h-6 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg">处理完成！</h3>
                                            <p className="text-emerald-50 text-sm">您的比对结果报表已生成完毕。</p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="secondary"
                                        className="font-bold shadow-md h-10 bg-white text-emerald-700 hover:bg-emerald-50"
                                        onClick={() => window.open(downloadUrl, '_blank')}
                                    >
                                        <Download className="mr-2 h-4 w-4" />
                                        下载 Excel 报表
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* 日志终端 */}
                    <Card className="flex-1 flex flex-col border-0 shadow-xl bg-[#1e1e1e] ring-1 ring-white/10 overflow-hidden min-h-[500px]">
                        <CardHeader className="bg-[#2d2d2d] py-3 px-4 border-b border-white/5 flex flex-row items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1.5">
                                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                                </div>
                                <span className="ml-3 text-xs font-mono text-gray-400">task_output.log</span>
                            </div>
                            <div className="text-xs text-gray-500 font-mono">
                                {logs.length} lines
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 p-0 relative">
                            <div
                                ref={scrollRef}
                                onScroll={handleScroll}
                                className="absolute inset-0 p-4 overflow-y-auto font-mono text-sm leading-relaxed scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
                            >
                                {logs.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-3">
                                        <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-700 flex items-center justify-center">
                                            <Play className="w-5 h-5 ml-0.5" />
                                        </div>
                                        <p>等待任务开始...</p>
                                    </div>
                                ) : (
                                    logs.map((log, index) => {
                                        // 简单的日志着色
                                        let colorClass = "text-gray-300";
                                        if (log.includes("❌") || log.includes("Error") || log.includes("失败")) colorClass = "text-red-400";
                                        else if (log.includes("✅") || log.includes("完成") || log.includes("成功")) colorClass = "text-emerald-400";
                                        else if (log.includes("⚠️") || log.includes("警告")) colorClass = "text-yellow-400";
                                        else if (log.includes("开始") || log.includes("上传")) colorClass = "text-blue-400";

                                        return (
                                            <div key={index} className={`mb-1 break-all ${colorClass}`}>
                                                <span className="opacity-30 mr-2 select-none">›</span>
                                                {log}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
