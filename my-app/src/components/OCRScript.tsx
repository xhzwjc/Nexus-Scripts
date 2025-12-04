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

    const handleRun = async () => {
        if (!excelPath || !sourceFolder || !targetExcelPath) {
            toast.error('请填写所有路径');
            return;
        }

        setIsRunning(true);
        setLogs([]);
        
        try {
            const response = await axios.post('http://localhost:8000/ocr/process', {
                excel_path: excelPath,
                source_folder: sourceFolder,
                target_excel_path: targetExcelPath,
                mode: parseInt(mode)
            });

            if (response.data.success) {
                toast.success('OCR处理完成');
                setLogs(response.data.logs || []);
            } else {
                toast.error('OCR处理失败: ' + response.data.message);
                setLogs(response.data.logs || []);
            }
        } catch (error: any) {
            toast.error('请求失败: ' + (error.response?.data?.detail || error.message));
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
                            <div className="relative">
                                <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    id="excel-path" 
                                    placeholder="C:\Users\...\个人信息表.xlsx" 
                                    className="pl-9"
                                    value={excelPath}
                                    onChange={(e) => setExcelPath(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="source-folder">附件文件夹路径</Label>
                            <div className="relative">
                                <Folder className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    id="source-folder" 
                                    placeholder="C:\Users\...\附件信息" 
                                    className="pl-9"
                                    value={sourceFolder}
                                    onChange={(e) => setSourceFolder(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="target-path">结果输出路径 (Excel)</Label>
                            <div className="relative">
                                <FileOutput className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    id="target-path" 
                                    placeholder="C:\Users\...\个人信息表_OCR对比结果.xlsx" 
                                    className="pl-9"
                                    value={targetExcelPath}
                                    onChange={(e) => setTargetExcelPath(e.target.value)}
                                />
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
                        <ScrollArea className="h-[300px] w-full rounded-md border p-4 bg-slate-950 text-slate-50 font-mono text-sm">
                            {logs.length === 0 ? (
                                <div className="text-slate-500 italic">等待执行...</div>
                            ) : (
                                logs.map((log, index) => (
                                    <div key={index} className="mb-1 whitespace-pre-wrap break-all">
                                        {log}
                                    </div>
                                ))
                            )}
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
