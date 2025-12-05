import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { ScrollArea } from './ui/scroll-area';
import { ArrowLeft, Play, FileText, Folder, FileOutput, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { getApiBaseUrl } from '../lib/api';

interface OCRScriptProps {
    onBack: () => void;
}

export default function OCRScript({ onBack }: OCRScriptProps) {
    const [excelPath, setExcelPath] = useState('');
    const [sourceFolder, setSourceFolder] = useState('');
    const [targetExcelPath, setTargetExcelPath] = useState('');
    const [mode, setMode] = useState('1');
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);

    // 滚动控制相关
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);

    // 监听日志更新，自动滚动
    React.useEffect(() => {
        if (autoScroll && scrollRef.current) {
            const div = scrollRef.current;
            div.scrollTop = div.scrollHeight;
        }
    }, [logs, autoScroll]);

    // 监听用户手动滚动
    const handleScroll = () => {
        if (scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            // 如果距离底部小于 50px，则认为是“在底部”，开启自动滚动
            // 否则认为是用户向上滚动了，关闭自动滚动
            const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
            setAutoScroll(isAtBottom);
        }
    };

    const handleSelectFile = async () => {
        try {
            const base = getApiBaseUrl();
            if (!base) return;
            const res = await fetch(`${base}/system/select-file`);
            const data = await res.json();
            if (data.path) setExcelPath(data.path);
        } catch (e) {
            toast.error('选择文件失败');
        }
    };

    const handleSelectFolder = async () => {
        try {
            const base = getApiBaseUrl();
            if (!base) return;
            const res = await fetch(`${base}/system/select-folder`);
            const data = await res.json();
            if (data.path) setSourceFolder(data.path);
        } catch (e) {
            toast.error('选择文件夹失败');
        }
    };

    const handleSaveFile = async () => {
        try {
            const base = getApiBaseUrl();
            if (!base) return;
            const res = await fetch(`${base}/system/save-file`);
            const data = await res.json();
            if (data.path) setTargetExcelPath(data.path);
        } catch (e) {
            toast.error('选择保存路径失败');
        }
    };

    const handleRun = async () => {
        if (!excelPath || !sourceFolder || !targetExcelPath) {
            toast.error('请填写所有路径');
            return;
        }

        setIsRunning(true);
        setLogs([]);

        try {
            const base = getApiBaseUrl();
            if (!base) {
                setIsRunning(false);
                return;
            }

            const response = await fetch(`${base}/ocr/process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    excel_path: excelPath,
                    source_folder: sourceFolder,
                    target_excel_path: targetExcelPath,
                    mode: parseInt(mode)
                }),
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

                // 处理完整的行，保留最后可能不完整的行在buffer中
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
                            } else {
                                toast.error(data.message);
                            }
                        }
                    } catch (e) {
                        console.error('解析日志行失败:', line, e);
                    }
                }
            }

            // 处理剩余的buffer
            if (buffer.trim()) {
                try {
                    const data = JSON.parse(buffer);
                    if (data.type === 'log') {
                        setLogs(prev => [...prev, data.content]);
                    } else if (data.type === 'result') {
                        if (data.success) {
                            toast.success(data.message);
                        } else {
                            toast.error(data.message);
                        }
                    }
                } catch (e) {
                    // 忽略最后可能的不完整数据
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
                    <p className="text-muted-foreground">自动识别身份证信息并与Excel表进行比对</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>配置参数</CardTitle>
                        <CardDescription>设置输入输出路径及运行模式</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="excel-path">个人信息表路径 (Excel)</Label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="excel-path"
                                        placeholder="C:\Users\...\个人信息表.xlsx"
                                        className="pl-9"
                                        value={excelPath}
                                        onChange={(e) => setExcelPath(e.target.value)}
                                    />
                                </div>
                                <Button variant="outline" onClick={handleSelectFile}>选择文件</Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="source-folder">附件文件夹路径</Label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Folder className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="source-folder"
                                        placeholder="C:\Users\...\附件信息"
                                        className="pl-9"
                                        value={sourceFolder}
                                        onChange={(e) => setSourceFolder(e.target.value)}
                                    />
                                </div>
                                <Button variant="outline" onClick={handleSelectFolder}>选择文件夹</Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="target-path">结果输出路径 (Excel)</Label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <FileOutput className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="target-path"
                                        placeholder="C:\Users\...\个人信息表_OCR对比结果.xlsx"
                                        className="pl-9"
                                        value={targetExcelPath}
                                        onChange={(e) => setTargetExcelPath(e.target.value)}
                                    />
                                </div>
                                <Button variant="outline" onClick={handleSaveFile}>选择保存位置</Button>
                            </div>
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

                        <div className="pt-4">
                            <Button className="w-full" onClick={handleRun} disabled={isRunning}>
                                {isRunning ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        正在处理中...
                                    </>
                                ) : (
                                    <>
                                        <Play className="mr-2 h-4 w-4" />
                                        开始执行
                                    </>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>执行日志</CardTitle>
                        <CardDescription>实时显示处理进度和结果</CardDescription>
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
