import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { ArrowLeft, Play, FileText, Folder, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { getApiBaseUrl } from '../lib/api';

interface OCRScriptProps {
    onBack: () => void;
}

export default function OCRScript({ onBack }: OCRScriptProps) {
    // 文件选择
    const [excelFile, setExcelFile] = useState<File | null>(null);
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [mode, setMode] = useState('1');
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [downloadUrl, setDownloadUrl] = useState('');

    // 滚动控制
    const scrollRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const folderInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    // 设置 webkitdirectory 属性
    useEffect(() => {
        if (folderInputRef.current) {
            folderInputRef.current.setAttribute('webkitdirectory', '');
            folderInputRef.current.setAttribute('directory', '');
        }
    }, []);

    const handleScroll = () => {
        if (scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
            setAutoScroll(isAtBottom);
        }
    };

    const handleExcelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setExcelFile(file);
        }
    };

    const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            // 转换 FileList 为 File 数组
            const fileArray: File[] = [];
            for (let i = 0; i < files.length; i++) {
                fileArray.push(files[i]);
            }
            setImageFiles(fileArray);
        }
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

        try {
            const base = getApiBaseUrl();
            if (!base) {
                setIsRunning(false);
                return;
            }

            // 构建 FormData
            const formData = new FormData();
            formData.append('mode', mode);
            formData.append('excel_file', excelFile);

            // 添加所有图片，使用 webkitRelativePath 保持目录结构
            for (const file of imageFiles) {
                const relativePath = (file as any).webkitRelativePath || file.name;
                formData.append('image_files', file, relativePath);
            }

            setLogs(prev => [...prev, `📤 上传中: Excel(${excelFile.name}), 图片(${imageFiles.length}个)`]);

            const response = await fetch(`${base}/ocr/process-upload`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || response.statusText);
            }

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
                    } catch (e) {
                        console.error('解析日志失败:', line, e);
                    }
                }
            }

            // 处理剩余buffer
            if (buffer.trim()) {
                try {
                    const data = JSON.parse(buffer);
                    if (data.type === 'log') {
                        setLogs(prev => [...prev, data.content]);
                    } else if (data.type === 'result') {
                        if (data.success) {
                            toast.success(data.message);
                            if (data.download_url) {
                                setDownloadUrl(`${base}/${data.download_url}`);
                            }
                        } else {
                            toast.error(data.message);
                        }
                    }
                } catch (e) {
                    // ignore
                }
            }

        } catch (error: any) {
            toast.error('请求失败: ' + error.message);
            setLogs(prev => [...prev, `❌ 请求出错: ${error.message}`]);
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
                    <p className="text-muted-foreground">上传 Excel 和附件文件夹，自动识别并比对</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>上传文件</CardTitle>
                        <CardDescription>选择 Excel 文件和包含图片的文件夹</CardDescription>
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
                            {excelFile && (
                                <p className="text-sm text-green-600">✓ 已选择: {excelFile.name}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="folder-input">附件文件夹（包含图片）</Label>
                            <div className="relative">
                                <Folder className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                                <input
                                    id="folder-input"
                                    ref={folderInputRef}
                                    type="file"
                                    multiple
                                    className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm cursor-pointer file:border-0 file:bg-transparent file:text-sm file:font-medium"
                                    onChange={handleFolderChange}
                                />
                            </div>
                            {imageFiles.length > 0 && (
                                <p className="text-sm text-green-600">✓ 已选择: {imageFiles.length} 个文件</p>
                            )}
                        </div>

                        <div className="space-y-3 pt-2">
                            <Label>运行模式</Label>
                            <RadioGroup defaultValue="1" value={mode} onValueChange={setMode} className="flex flex-col space-y-1">
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="1" id="mode-1" />
                                    <Label htmlFor="mode-1" className="font-normal">模式1：按 Excel 顺序匹配附件（默认）</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="2" id="mode-2" />
                                    <Label htmlFor="mode-2" className="font-normal">模式2：按 附件识别 → 反查匹配 Excel</Label>
                                </div>
                            </RadioGroup>
                        </div>

                        <div className="pt-4 flex gap-3">
                            <Button className="flex-1" onClick={handleRun} disabled={isRunning || !excelFile || imageFiles.length === 0}>
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
                        <CardDescription>实时显示处理进度</CardDescription>
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
                                    <div key={index} className="mb-1 whitespace-pre-wrap break-all">
                                        {log}
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
