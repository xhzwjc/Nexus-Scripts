import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { ArrowLeft, Play, FileText, Folder, Loader2, Download, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { getApiBaseUrl } from '../lib/api';

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
                const relativePath = (file as any).webkitRelativePath || file.name;
                formData.append('image_files', file, relativePath);
            }

            const totalSize = getTotalSize();
            setLogs(prev => [...prev, `📤 开始上传: Excel + ${imageFiles.length} 个图片 (共 ${totalSize} MB)`]);
            setLogs(prev => [...prev, `⏳ 上传中，请耐心等待...`]);

            const response = await fetch(`${base}/ocr/process-upload`, {
                method: 'POST',
                body: formData,
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
                        if (data.type === 'log') {
                            setLogs(prev => [...prev, data.content]);
                        } else if (data.type === 'result') {
                            if (data.success) {
                                toast.success(data.message);
                                setLogs(prev => [...prev, `✅ ${data.message}`]);
                                if (data.download_url) {
                                    setDownloadUrl(`${base}/${data.download_url}`);
                                }
                            } else {
                                toast.error(data.message);
                                setLogs(prev => [...prev, `❌ ${data.message}`]);
                            }
                        }
                    } catch (e) { }
                }
            }

            if (buffer.trim()) {
                try {
                    const data = JSON.parse(buffer);
                    if (data.type === 'result' && data.success && data.download_url) {
                        setDownloadUrl(`${base}/${data.download_url}`);
                    }
                } catch (e) { }
            }

        } catch (error: any) {
            toast.error('请求失败: ' + error.message);
            setLogs(prev => [...prev, `❌ 错误: ${error.message}`]);
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-4 mb-6">
                <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full hover:bg-secondary/80">
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">个人信息OCR比对工具</h1>
                    <p className="text-muted-foreground">上传 Excel 和附件文件夹，自动识别身份证并比对</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>上传文件</CardTitle>
                        <CardDescription>选择本地的 Excel 文件和附件文件夹</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="excel-file">个人信息表 (Excel)</Label>
                            <div className="relative">
                                <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                                <Input
                                    id="excel-file"
                                    type="file"
                                    accept=".xlsx,.xls"
                                    className="pl-9 cursor-pointer"
                                    onChange={handleExcelChange}
                                />
                            </div>
                            {excelFile && <p className="text-sm text-green-600">✓ {excelFile.name}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="folder-input">附件文件夹（包含以姓名命名的子文件夹）</Label>
                            <div className="relative">
                                <Folder className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                                <input
                                    id="folder-input"
                                    ref={folderInputRef}
                                    type="file"
                                    multiple
                                    className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm cursor-pointer"
                                    onChange={handleFolderChange}
                                />
                            </div>
                            {imageFiles.length > 0 && (
                                <p className="text-sm text-green-600">✓ {imageFiles.length} 个文件 ({getTotalSize()} MB)</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                文件夹结构示例：附件信息/张三/photo.jpg, 附件信息/李四/photo.jpg
                            </p>
                        </div>

                        {imageFiles.length > 500 && (
                            <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                                <span className="text-sm text-yellow-800">
                                    文件较多（{imageFiles.length}个），上传可能需要几分钟，请耐心等待
                                </span>
                            </div>
                        )}

                        <div className="space-y-3 pt-2">
                            <Label>运行模式</Label>
                            <RadioGroup value={mode} onValueChange={setMode} className="flex flex-col space-y-1">
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="1" id="mode-1" />
                                    <Label htmlFor="mode-1" className="font-normal">模式1：按 Excel 顺序匹配附件</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="2" id="mode-2" />
                                    <Label htmlFor="mode-2" className="font-normal">模式2：按附件识别 → 反查 Excel</Label>
                                </div>
                            </RadioGroup>
                        </div>

                        <div className="pt-4 flex gap-3">
                            <Button
                                className="flex-1"
                                onClick={handleRun}
                                disabled={isRunning || !excelFile || imageFiles.length === 0}
                            >
                                {isRunning ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        处理中...
                                    </>
                                ) : (
                                    <>
                                        <Play className="mr-2 h-4 w-4" />
                                        开始执行
                                    </>
                                )}
                            </Button>
                            {downloadUrl && (
                                <Button variant="outline" onClick={() => window.open(downloadUrl, '_blank')}>
                                    <Download className="mr-2 h-4 w-4" />
                                    下载结果
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>执行日志</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div
                            ref={scrollRef}
                            onScroll={handleScroll}
                            className="h-[300px] w-full rounded-md border p-4 bg-slate-950 text-slate-50 font-mono text-sm overflow-y-auto"
                        >
                            {logs.length === 0 ? (
                                <div className="text-slate-500 italic">等待执行...</div>
                            ) : (
                                logs.map((log, index) => (
                                    <div key={index} className="mb-1 whitespace-pre-wrap break-all">{log}</div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
