"use client";

import React from "react";
import {
    Download,
    ExternalLink,
    Loader2,
} from "lucide-react";
import {createPluginRegistration} from "@embedpdf/core";
import {EmbedPDF} from "@embedpdf/core/react";
import {usePdfiumEngine} from "@embedpdf/engines/react";
import {DocumentContent, DocumentManagerPluginPackage} from "@embedpdf/plugin-document-manager/react";
import {RenderLayer, RenderPluginPackage} from "@embedpdf/plugin-render/react";
import {Scroller, ScrollPluginPackage, ScrollStrategy} from "@embedpdf/plugin-scroll/react";
import {TilingLayer, TilingPluginPackage} from "@embedpdf/plugin-tiling/react";
import {Viewport, ViewportPluginPackage} from "@embedpdf/plugin-viewport/react";
import {ZoomMode, ZoomPluginPackage} from "@embedpdf/plugin-zoom/react";

import {authenticatedFetch} from "@/lib/auth";
import {cn} from "@/lib/utils";

const PDFIUM_WASM_URL = "/vendor/embedpdf/pdfium.wasm";
const PDF_RANGE_CHUNK_BYTES = 2 * 1024 * 1024;
const PDF_RANGE_PATTERN = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i;

export type ResumeAiOverlayAnnotation = {
    id: string;
    pageIndex: number;
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    label?: string;
    tone?: "evidence" | "skill" | "warning";
};

export type ResumeViewerSource = {
    id: string | number;
    url: string;
    fileName: string;
    mimeType?: string | null;
    fileSize?: number | null;
};

export type ResumeViewerAdapterProps = {
    source: ResumeViewerSource;
    isZh: boolean;
    annotations?: ResumeAiOverlayAnnotation[];
    className?: string;
    onDownload: () => void;
    onOpenExternal: () => void;
};

type ResumeBufferState =
    | {status: "loading"; buffer: null; error: null}
    | {status: "ready"; buffer: ArrayBuffer; error: null}
    | {status: "error"; buffer: null; error: string};

function clampNormalized(value: number) {
    return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function parseContentRange(value: string | null) {
    const match = String(value || "").trim().match(PDF_RANGE_PATTERN);
    if (!match) return null;
    const start = Number(match[1]);
    const end = Number(match[2]);
    const total = Number(match[3]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(total)) return null;
    if (start < 0 || end < start || total <= end) return null;
    return {start, end, total};
}

async function responseErrorMessage(response: Response, fallback: string) {
    const body = await response.text().catch(() => "");
    return body.trim() || `${fallback} (${response.status})`;
}

/**
 * Transport boundary for the PDF engine. It prefers authenticated HTTP Range
 * requests and falls back to a regular full response when the origin does not
 * advertise byte ranges. Every request shares the caller's AbortSignal.
 */
export async function loadResumePdfBuffer(
    source: ResumeViewerSource,
    options: {signal: AbortSignal; chunkSize?: number},
) {
    const chunkSize = Math.max(256 * 1024, options.chunkSize || PDF_RANGE_CHUNK_BYTES);
    const firstResponse = await authenticatedFetch(source.url, {
        method: "GET",
        cache: "no-store",
        headers: {Range: `bytes=0-${chunkSize - 1}`},
        signal: options.signal,
    });

    if (firstResponse.status === 200) {
        return firstResponse.arrayBuffer();
    }
    if (firstResponse.status !== 206) {
        throw new Error(await responseErrorMessage(firstResponse, "PDF request failed"));
    }

    const firstRange = parseContentRange(firstResponse.headers.get("content-range"));
    if (!firstRange || firstRange.start !== 0) {
        throw new Error("PDF server returned an invalid byte range");
    }
    const assembled = new Uint8Array(firstRange.total);
    const firstChunk = new Uint8Array(await firstResponse.arrayBuffer());
    if (firstChunk.byteLength !== firstRange.end - firstRange.start + 1) {
        throw new Error("PDF server returned an incomplete byte range");
    }
    assembled.set(firstChunk, firstRange.start);

    for (let start = firstRange.end + 1; start < firstRange.total; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, firstRange.total - 1);
        const response = await authenticatedFetch(source.url, {
            method: "GET",
            cache: "no-store",
            headers: {Range: `bytes=${start}-${end}`},
            signal: options.signal,
        });
        if (response.status !== 206) {
            throw new Error(await responseErrorMessage(response, "PDF range request failed"));
        }
        const range = parseContentRange(response.headers.get("content-range"));
        if (!range || range.start !== start || range.end !== end || range.total !== firstRange.total) {
            throw new Error("PDF server returned a mismatched byte range");
        }
        const chunk = new Uint8Array(await response.arrayBuffer());
        if (chunk.byteLength !== end - start + 1) {
            throw new Error("PDF server returned an incomplete byte range");
        }
        assembled.set(chunk, start);
    }

    return assembled.buffer;
}

function ViewerToolButton({
                              label,
                              tool,
                              active = false,
                              disabled = false,
                              onClick,
                              children,
                          }: {
    label: string;
    tool: string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            data-resume-viewer-tool={tool}
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-[6px] border px-2 text-[12px] transition-colors",
                "border-[#E2E5EB] bg-white text-[#4A4D55] hover:border-[#B8C0D0] hover:bg-[#F4F6FA]",
                "dark:border-[#333842] dark:bg-[#1B1E25] dark:text-[#D6D8DD] dark:hover:border-[#4A5260] dark:hover:bg-[#242832]",
                active && "border-[#1E3BFA] bg-[#EEF1FF] text-[#1E3BFA] dark:border-[#6274FF] dark:bg-[#27305A] dark:text-[#A7B3FF]",
                disabled && "cursor-not-allowed opacity-40",
            )}
        >
            {children}
        </button>
    );
}

function ResumeAiOverlay({
                             annotations,
                             pageIndex,
                             enabled,
                         }: {
    annotations: ResumeAiOverlayAnnotation[];
    pageIndex: number;
    enabled: boolean;
}) {
    if (!enabled) return null;
    return (
        <div
            data-resume-ai-overlay
            data-page-index={pageIndex}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
        >
            {annotations.filter((annotation) => annotation.pageIndex === pageIndex).map((annotation) => {
                const x = clampNormalized(annotation.rect.x);
                const y = clampNormalized(annotation.rect.y);
                const width = Math.min(clampNormalized(annotation.rect.width), 1 - x);
                const height = Math.min(clampNormalized(annotation.rect.height), 1 - y);
                const tone = annotation.tone || "evidence";
                return (
                    <span
                        key={annotation.id}
                        data-annotation-id={annotation.id}
                        title={annotation.label}
                        className={cn(
                            "absolute rounded-[3px] border-2 bg-[#1E3BFA]/10 shadow-[0_0_0_1px_rgba(255,255,255,0.42)]",
                            tone === "skill" && "border-[#0CC991] bg-[#0CC991]/10",
                            tone === "warning" && "border-[#FFAB24] bg-[#FFAB24]/12",
                            tone === "evidence" && "border-[#1E3BFA]",
                        )}
                        style={{
                            left: `${x * 100}%`,
                            top: `${y * 100}%`,
                            width: `${width * 100}%`,
                            height: `${height * 100}%`,
                        }}
                    />
                );
            })}
        </div>
    );
}

function ResumeDocumentViewer({
                                  documentId,
                                  annotations,
                                  isZh,
                              }: {
    documentId: string;
    annotations: ResumeAiOverlayAnnotation[];
    isZh: boolean;
}) {
    const [isFirstPageRendered, setIsFirstPageRendered] = React.useState(false);

    React.useEffect(() => {
        setIsFirstPageRendered(false);
    }, [documentId]);

    return (
        <div
            data-resume-viewer
            className="relative h-full min-h-0 overflow-hidden bg-white dark:bg-[#1B1E25]"
        >
            <Viewport
                documentId={documentId}
                className="h-full min-h-0 !overflow-auto !p-0 bg-transparent [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                <Scroller
                    documentId={documentId}
                    data-resume-viewer-scroll
                    className="h-full w-full overflow-auto bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    renderPage={({width, height, pageIndex}) => (
                        <div
                            data-resume-viewer-page={pageIndex}
                            className="relative mx-auto overflow-hidden bg-white"
                            style={{width, height, colorScheme: "light"}}
                        >
                            <RenderLayer
                                documentId={documentId}
                                pageIndex={pageIndex}
                                style={{width: "100%", height: "100%"}}
                                onLoadCapture={pageIndex === 0 ? () => setIsFirstPageRendered(true) : undefined}
                            />
                            <TilingLayer documentId={documentId} pageIndex={pageIndex} className="absolute inset-0"/>
                            <ResumeAiOverlay annotations={annotations} pageIndex={pageIndex} enabled/>
                        </div>
                    )}
                />
            </Viewport>
            {!isFirstPageRendered ? (
                <div
                    data-resume-viewer-render-loading
                    className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[#EEF0F3] text-[#686B73] dark:bg-[#15171C] dark:text-[#B0B2B8]"
                >
                    <Loader2 className="h-7 w-7 animate-spin text-[#1E3BFA] dark:text-[#8091FF]"/>
                    <span className="text-[13px]">{isZh ? "正在渲染简历..." : "Rendering resume..."}</span>
                </div>
            ) : null}
        </div>
    );
}

function ResumePdfEngine({
                             source,
                             buffer,
                             isZh,
                             annotations,
                         }: {
    source: ResumeViewerSource;
    buffer: ArrayBuffer;
    isZh: boolean;
    annotations: ResumeAiOverlayAnnotation[];
}) {
    const documentId = React.useMemo(() => `resume-${source.id}`, [source.id]);
    const {engine, isLoading: engineLoading, error: engineError} = usePdfiumEngine({
        wasmUrl: PDFIUM_WASM_URL,
        worker: false,
        fontFallback: null,
    });
    const plugins = React.useMemo(() => [
        createPluginRegistration(DocumentManagerPluginPackage, {
            maxDocuments: 1,
            initialDocuments: [{
                buffer,
                name: source.fileName,
                documentId,
                autoActivate: true,
            }],
        }),
        createPluginRegistration(ViewportPluginPackage, {viewportGap: 0}),
        createPluginRegistration(ScrollPluginPackage, {
            defaultStrategy: ScrollStrategy.Vertical,
            defaultPageGap: 16,
            defaultBufferSize: 2,
        }),
        createPluginRegistration(RenderPluginPackage, {
            withForms: false,
            withAnnotations: true,
            defaultImageType: "image/png",
        }),
        createPluginRegistration(TilingPluginPackage, {
            tileSize: 768,
            overlapPx: 4,
            extraRings: 0,
            defaultImageType: "image/png",
        }),
        createPluginRegistration(ZoomPluginPackage, {
            defaultZoomLevel: ZoomMode.FitWidth,
            minZoom: 0.5,
            maxZoom: 4,
            zoomStep: 0.15,
        }),
    ], [buffer, documentId, source.fileName]);

    if (engineLoading) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#EEF0F3] text-[#686B73] dark:bg-[#15171C] dark:text-[#B0B2B8]">
                <Loader2 className="h-7 w-7 animate-spin text-[#1E3BFA] dark:text-[#8091FF]"/>
                <span className="text-[13px]">{isZh ? "正在初始化简历阅读器..." : "Initializing resume viewer..."}</span>
            </div>
        );
    }
    if (!engine || engineError) {
        return (
            <div className="flex h-full items-center justify-center bg-[#EEF0F3] px-6 text-center text-[13px] text-[#686B73] dark:bg-[#15171C] dark:text-[#B0B2B8]">
                {isZh ? "简历阅读器初始化失败，请在新窗口打开文件。" : "The resume viewer failed to initialize. Open the file in a new window."}
            </div>
        );
    }

    return (
        <EmbedPDF engine={engine} plugins={plugins}>
            <DocumentContent documentId={documentId}>
                {({isLoading, isError, isLoaded}) => {
                    if (isLoading) {
                        return (
                            <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#EEF0F3] text-[#686B73] dark:bg-[#15171C] dark:text-[#B0B2B8]">
                                <Loader2 className="h-7 w-7 animate-spin text-[#1E3BFA] dark:text-[#8091FF]"/>
                                <span className="text-[13px]">{isZh ? "正在解析 PDF..." : "Parsing PDF..."}</span>
                            </div>
                        );
                    }
                    if (isError) {
                        return (
                            <div className="flex h-full items-center justify-center bg-[#EEF0F3] px-6 text-center text-[13px] text-[#686B73] dark:bg-[#15171C] dark:text-[#B0B2B8]">
                                {isZh ? "PDF 文件损坏、加密或格式异常，无法预览。" : "The PDF is damaged, encrypted, or invalid and cannot be previewed."}
                            </div>
                        );
                    }
                    if (!isLoaded) return null;
                    return (
                        <ResumeDocumentViewer
                            documentId={documentId}
                            annotations={annotations}
                            isZh={isZh}
                        />
                    );
                }}
            </DocumentContent>
        </EmbedPDF>
    );
}

export function ResumeViewerAdapter({
                                        source,
                                        isZh,
                                        annotations = [],
                                        className,
                                        onDownload,
                                        onOpenExternal,
                                    }: ResumeViewerAdapterProps) {
    const [state, setState] = React.useState<ResumeBufferState>({status: "loading", buffer: null, error: null});
    const sourceKey = `${source.id}:${source.url}`;

    React.useEffect(() => {
        const controller = new AbortController();
        let active = true;
        setState({status: "loading", buffer: null, error: null});
        void loadResumePdfBuffer(source, {signal: controller.signal})
            .then((buffer) => {
                if (!active || controller.signal.aborted) return;
                setState({status: "ready", buffer, error: null});
            })
            .catch((error) => {
                if (!active || controller.signal.aborted) return;
                setState({
                    status: "error",
                    buffer: null,
                    error: error instanceof Error && error.message
                        ? error.message
                        : (isZh ? "原始简历加载失败" : "Failed to load original resume"),
                });
            });
        return () => {
            active = false;
            controller.abort();
        };
    }, [isZh, sourceKey]);

    return (
        <div
            data-resume-viewer-adapter
            data-source-id={source.id}
            className={cn(
                "h-full min-h-0 overflow-hidden bg-white dark:bg-[#1B1E25]",
                className,
            )}
        >
            {state.status === "loading" ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-[#686B73] dark:text-[#B0B2B8]">
                    <Loader2 className="h-7 w-7 animate-spin text-[#1E3BFA] dark:text-[#8091FF]"/>
                    <span className="text-[13px]">{isZh ? "正在加载原始简历..." : "Loading original resume..."}</span>
                </div>
            ) : null}
            {state.status === "error" ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-[14px] font-medium text-[#1F2329] dark:text-[#F2F3F5]">{isZh ? "原始简历暂无法显示" : "Original resume unavailable"}</p>
                    <p className="max-w-lg text-[12px] leading-5 text-[#86888F] dark:text-[#9DA0A8]">{state.error}</p>
                    <div className="flex items-center gap-2">
                        <ViewerToolButton label={isZh ? "下载" : "Download"} tool="download" onClick={onDownload}>
                            <Download className="h-4 w-4"/>
                            <span>{isZh ? "下载" : "Download"}</span>
                        </ViewerToolButton>
                        <ViewerToolButton label={isZh ? "新窗口打开" : "Open in new window"} tool="open-external" onClick={onOpenExternal}>
                            <ExternalLink className="h-4 w-4"/>
                            <span>{isZh ? "新窗口打开" : "Open"}</span>
                        </ViewerToolButton>
                    </div>
                </div>
            ) : null}
            {state.status === "ready" ? (
                <ResumePdfEngine
                    key={sourceKey}
                    source={source}
                    buffer={state.buffer}
                    isZh={isZh}
                    annotations={annotations}
                />
            ) : null}
        </div>
    );
}
