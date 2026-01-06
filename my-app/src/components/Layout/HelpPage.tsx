import React, { useState } from 'react';
import { FileText, ArrowLeft, BookOpen, ChevronRight } from 'lucide-react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface HelpDoc {
    id: string;
    title: string;
    file: string;
}

const docs: HelpDoc[] = [
    {
        id: 'sig-guide',
        title: '共享经济合作伙伴协议签约指南',
        file: '/docs/春苗 (Seedling Intl) 共享经济合作伙伴协议签约指南.pdf'
    },
    {
        id: 'ocr-guide',
        title: '个人信息 OCR 比对工具 使用说明',
        file: '/docs/个人信息 OCR 比对工具 使用说明.pdf'
    }
];

export function HelpPage({ onBack }: { onBack?: () => void }) {
    const [selectedDocId, setSelectedDocId] = useState<string>(docs[0].id);
    const selectedDoc = docs.find(d => d.id === selectedDocId);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-slate-50/50">
            {/* Header */}
            <div className="h-12 px-4 flex items-center justify-between bg-white/80 backdrop-blur border-b border-slate-200 shrink-0 z-10">
                <div className="flex items-center gap-4">
                    {onBack && (
                        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100">
                            <ArrowLeft className="w-4 h-4" />
                            <span>返回</span>
                        </Button>
                    )}
                    <div className="w-px h-4 bg-slate-200" />
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-teal-50 text-teal-600 rounded-md">
                            <BookOpen className="w-4 h-4" />
                        </div>
                        <h1 className="text-sm font-semibold text-slate-800">帮助中心</h1>
                    </div>
                </div>

                {/* Sub-header Content: Document Title Centered relative to the remaining space */}
                <div className="flex-1 flex items-center justify-center px-6 overflow-hidden">
                    {selectedDoc && (
                        <h2 className="text-sm font-medium text-slate-600 truncate flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            {selectedDoc.title}
                        </h2>
                    )}
                </div>

                {/* Right Side Actions */}
                <div className="flex items-center shrink-0 min-w-[100px] justify-end">
                    {selectedDoc && (
                        <a
                            href={selectedDoc.file}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-teal-600 hover:text-teal-700 hover:underline flex items-center gap-1.5 font-medium transition-colors"
                        >
                            在新窗口打开
                            <ChevronRight className="w-3 h-3" />
                        </a>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar */}
                <div className="w-64 bg-white/50 backdrop-blur-sm border-r border-slate-200 flex flex-col">
                    <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-teal-600" />
                        <h2 className="text-sm font-semibold text-slate-700">帮助文档列表</h2>
                    </div>
                    <div className="p-2 space-y-1 overflow-y-auto flex-1">
                        {docs.map(doc => (
                            <button
                                key={doc.id}
                                onClick={() => setSelectedDocId(doc.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors text-left
                                    ${selectedDocId === doc.id
                                        ? 'bg-teal-50 text-teal-700'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                            >
                                <FileText className={`w-4 h-4 ${selectedDocId === doc.id ? 'text-teal-500' : 'text-slate-400'}`} />
                                <span className="flex-1 truncate">{doc.title}</span>
                                {selectedDocId === doc.id && <ChevronRight className="w-3 h-3 text-teal-400" />}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Viewer */}
                <div className="flex-1 p-3 overflow-hidden flex flex-col">
                    {selectedDoc ? (
                        <Card className="flex-1 border border-slate-100 shadow-sm overflow-hidden flex flex-col bg-white">
                            <div className="flex-1 bg-slate-200 relative">
                                <iframe
                                    src={selectedDoc.file}
                                    className="absolute inset-0 w-full h-full"
                                    title={selectedDoc.title}
                                />
                            </div>
                        </Card>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-slate-400">
                            请选择文档查看
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
