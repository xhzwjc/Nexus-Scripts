import React, { useState, useMemo } from 'react';
import { FileText, ArrowLeft, BookOpen, ChevronRight } from 'lucide-react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from '@/lib/i18n';

interface HelpDoc {
    id: 'sig-guide' | 'ocr-guide';
    title: string;
    file: string;
}

export function HelpPage({ onBack }: { onBack?: () => void }) {
    const { t } = useI18n();
    const tr = t.helpPage;

    const docs = useMemo<HelpDoc[]>(() => [
        {
            id: 'sig-guide',
            title: tr.docs.sigGuide,
            file: '/docs/春苗 (Seedling Intl) 共享经济合作伙伴协议签约指南.pdf'
        },
        {
            id: 'ocr-guide',
            title: tr.docs.ocrGuide,
            file: '/docs/个人信息 OCR 比对工具 使用说明.pdf'
        }
    ], [tr]);

    const [selectedDocId, setSelectedDocId] = useState<string>(docs[0].id);
    const selectedDoc = docs.find(d => d.id === selectedDocId);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-muted/30">
            {/* Header */}
            <div className="h-12 px-4 flex items-center justify-between bg-background/80 backdrop-blur border-b border-border shrink-0 z-10">
                <div className="flex items-center gap-4">
                    {onBack && (
                        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 text-muted-foreground hover:text-foreground hover:bg-muted">
                            <ArrowLeft className="w-4 h-4" />
                            <span>{t.common.back}</span>
                        </Button>
                    )}
                    <div className="w-px h-4 bg-border" />
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-primary/10 text-primary rounded-md">
                            <BookOpen className="w-4 h-4" />
                        </div>
                        <h1 className="text-sm font-semibold text-foreground">{tr.title}</h1>
                    </div>
                </div>

                {/* Sub-header Content: Document Title Centered relative to the remaining space */}
                <div className="flex-1 flex items-center justify-center px-6 overflow-hidden">
                    {selectedDoc && (
                        <h2 className="text-sm font-medium text-muted-foreground truncate flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-muted-foreground/70" />
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
                            className="text-xs text-primary hover:text-primary/80 hover:underline flex items-center gap-1.5 font-medium transition-colors"
                        >
                            {tr.openInNewWindow}
                            <ChevronRight className="w-3 h-3" />
                        </a>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar */}
                <div className="w-64 bg-background/50 backdrop-blur-sm border-r border-border flex flex-col">
                    <div className="p-4 border-b border-border flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-primary" />
                        <h2 className="text-sm font-semibold text-foreground/80">{tr.listTitle}</h2>
                    </div>
                    <div className="p-2 space-y-1 overflow-y-auto flex-1">
                        {docs.map(doc => (
                            <button
                                key={doc.id}
                                onClick={() => setSelectedDocId(doc.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors text-left
                                    ${selectedDocId === doc.id
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }`}
                            >
                                <FileText className={`w-4 h-4 ${selectedDocId === doc.id ? 'text-primary' : 'text-muted-foreground/70'}`} />
                                <span className="flex-1 truncate">{doc.title}</span>
                                {selectedDocId === doc.id && <ChevronRight className="w-3 h-3 text-primary/60" />}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Viewer */}
                <div className="flex-1 p-3 overflow-hidden flex flex-col">
                    {selectedDoc ? (
                        <Card className="flex-1 border border-border shadow-sm overflow-hidden flex flex-col bg-card">
                            <div className="flex-1 bg-muted relative">
                                <iframe
                                    src={selectedDoc.file}
                                    className="absolute inset-0 w-full h-full"
                                    title={selectedDoc.title}
                                />
                            </div>
                        </Card>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                            {tr.selectDocPlaceholder}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
