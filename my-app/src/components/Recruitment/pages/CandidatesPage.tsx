"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import ReactMarkdown from "react-markdown";
import {useVirtualizer} from "@tanstack/react-virtual";
import {
    ArrowRightLeft,
    AtSign,
    Bot,
    Briefcase,
    Calendar,
    Check,
    ChevronDown,
    ChevronUp,
    Copy,
    Download,
    ExternalLink,
    Eye,
    FileText,
    GraduationCap,
    LayoutGrid,
    List,
    Loader2,
    Mail,
    MapPin,
    MoreHorizontal,
    NotebookText,
    Phone,
    Plus,
    Printer,
    RotateCcw,
    Save,
    Search,
    SlidersHorizontal,
    Sparkles,
    Square,
    Star,
    Tag,
    Trash2,
    UserCheck,
    UserPlus,
    Users,
} from "lucide-react";

import {
    joinTags,
    recruitmentApi,
    type AITaskLog,
    type CandidateDetail,
    type CandidateScoreDimension,
    type CandidateSummary,
    type DepartmentReviewBatch,
    type DepartmentReviewReviewerOption,
    type InterviewAvailabilitySlot,
    type InterviewSchedule,
    type PositionSummary,
    type RecruitmentSkill,
    type ResumeFile,
} from "@/lib/recruitment-api";
import {authenticatedFetch} from "@/lib/auth";
import {getCurrentLanguage, useI18n} from "@/lib/i18n";
import {toast} from "@/lib/toast";
import {cn} from "@/lib/utils";
import {Badge} from "@/components/ui/badge";
import {CandidateRadarChart} from "../components/CandidateRadarChart";
import {Button} from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Textarea} from "@/components/ui/textarea";

import {
    type AssistantDisplayMode,
    type CandidateEditorState,
    type CandidateListColumnKey,
    candidateStatusLabels,
    type CandidateViewMode,
    panelClass as defaultPanelClass,
} from "../types";
import {
    CANDIDATE_PIPELINE_STAGES,
    type CandidatePipelineStageConfig,
} from "../workflowStages";
import {
    EmptyState,
    Field,
    HoverRevealText,
    InfoTile,
    LoadingCard,
    LoadingPanel,
    NativeSelect,
    SearchField,
} from "../components/SharedComponents";
import {
    formatActionError,
    formatDateTime,
    formatLongDateTime,
    formatPercent,
    formatScoreValue,
    formatSkillNames,
    formatSkillSnapshotNames,
    formatStructuredValue,
    labelForCandidateStatus,
    labelForMemorySource,
    labelForProvider,
    labelForScreeningTaskStage,
    labelForTaskExecutionStatus,
    labelForTaskType,
    isLiveTaskStatus,
    parseStructuredLogOutput,
    resolveCandidateDisplayStatus,
    resolveCandidateFacingErrorContext,
    resolveLogSkillSnapshots,
    sanitizeCandidateFacingErrorText,
    statusBadgeClass,
} from "../utils";

type CandidateBoardGroup = {
    status: string;
    label: string;
    items: CandidateSummary[];
};

type CandidateListDisplayColumnWidths = Record<CandidateListColumnKey, number>;

type CandidateInterviewQuestion = CandidateDetail["interview_questions"][number];
type CandidateQuickDispositionAction = "pass" | "talent_pool" | "reject";
type CandidateDetailPanelKey = "resume" | "assessment" | "screening" | "review" | "exam" | "interview" | "offer" | "background";
type CandidateResumeViewKey = "original" | "standard" | "history";
type DetailIcon = React.ComponentType<{className?: string}>;
type PdfJsModule = typeof import("pdfjs-dist");
type PdfLoadingTask = ReturnType<PdfJsModule["getDocument"]>;

function readStructuredText(source: unknown, keys: string[]): string | null {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
        return null;
    }
    const record = source as Record<string, unknown>;
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" || typeof value === "number") {
            const text = String(value).trim();
            if (text) return text;
        }
    }
    return null;
}

function firstStructuredRecord(value: unknown): Record<string, unknown> | null {
    if (!Array.isArray(value)) {
        return null;
    }
    const item = value.find((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
    return item ? item as Record<string, unknown> : null;
}

function CandidateDetailAvatar({name}: {name: string}) {
    const initial = (name || "?").trim().charAt(0) || "?";
    return (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#F5F5F5] to-[#E5E5E5] text-2xl font-semibold text-[#171717] ring-4 ring-white">
            {initial}
        </div>
    );
}

function CandidateMetaItem({
                               icon: Icon,
                               children,
                           }: {
    icon: DetailIcon;
    children: React.ReactNode;
}) {
    return (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-slate-500">
            <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400"/>
            <span className="truncate">{children}</span>
        </span>
    );
}

function InlineResumePdfPreview({
                                    blob,
                                    fileName,
                                    isZh,
                                    onReady,
                                    onError,
                                }: {
    blob: Blob;
    fileName: string;
    isZh: boolean;
    onReady: () => void;
    onError: (message: string) => void;
}) {
    const hostRef = React.useRef<HTMLDivElement | null>(null);
    const [hostWidth, setHostWidth] = React.useState(0);

    React.useEffect(() => {
        const node = hostRef.current;
        if (!node) return;

        const updateWidth = () => {
            const nextWidth = Math.floor(node.clientWidth);
            setHostWidth((current) => Math.abs(current - nextWidth) > 2 ? nextWidth : current);
        };
        updateWidth();

        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", updateWidth);
            return () => window.removeEventListener("resize", updateWidth);
        }

        const observer = new ResizeObserver(updateWidth);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    React.useEffect(() => {
        const host = hostRef.current;
        if (!host || !blob || hostWidth <= 0) return;

        let cancelled = false;
        let loadingTask: PdfLoadingTask | null = null;
        let signaledReady = false;
        const clearHost = () => {
            while (host.firstChild) {
                host.removeChild(host.firstChild);
            }
        };
        const signalReady = () => {
            if (!signaledReady && !cancelled) {
                signaledReady = true;
                onReady();
            }
        };

        clearHost();

        const renderPdf = async () => {
            const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs") as PdfJsModule;
            pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
            const arrayBuffer = await blob.arrayBuffer();
            if (cancelled) return;

            loadingTask = pdfjsLib.getDocument({
                data: new Uint8Array(arrayBuffer),
                verbosity: 0,
            });
            const pdf = await loadingTask.promise;
            const pageHostWidth = Math.max(320, Math.min(hostWidth - 8, 760));
            const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
                if (cancelled) break;

                const page = await pdf.getPage(pageNumber);
                const baseViewport = page.getViewport({scale: 1});
                const viewport = page.getViewport({scale: pageHostWidth / baseViewport.width});
                const canvas = document.createElement("canvas");
                const pageShell = document.createElement("div");
                const canvasContext = canvas.getContext("2d", {alpha: false});
                if (!canvasContext) {
                    throw new Error(isZh ? "浏览器不支持简历预览渲染" : "Canvas rendering is not supported");
                }

                canvas.width = Math.ceil(viewport.width * pixelRatio);
                canvas.height = Math.ceil(viewport.height * pixelRatio);
                canvas.style.width = `${Math.ceil(viewport.width)}px`;
                canvas.style.height = `${Math.ceil(viewport.height)}px`;
                canvas.className = "block bg-white";

                pageShell.className = cn(
                    "flex justify-center bg-white py-6",
                    pageNumber === 1 && "pt-0",
                    pageNumber === pdf.numPages && "pb-0",
                );
                pageShell.appendChild(canvas);
                host.appendChild(pageShell);

                await page.render({
                    canvas,
                    canvasContext,
                    viewport,
                    transform: pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined,
                    background: "#fff",
                }).promise;
                page.cleanup();

                if (pageNumber === 1) {
                    signalReady();
                }
            }

            await pdf.cleanup();
            await pdf.destroy();
            signalReady();
        };

        void renderPdf().catch((error) => {
            if (cancelled) return;
            const message = error instanceof Error && error.message
                ? error.message
                : (isZh ? "原始简历加载失败" : "Failed to load original resume");
            onError(message);
        });

        return () => {
            cancelled = true;
            clearHost();
            if (loadingTask) {
                void loadingTask.destroy().catch(() => undefined);
            }
        };
    }, [blob, hostWidth, isZh, onError, onReady]);

    return (
        <div className="h-full overflow-auto bg-white">
            <div
                ref={hostRef}
                aria-label={fileName}
                className="mx-auto min-h-full w-full bg-white px-4 py-6"
            />
        </div>
    );
}

function ResumeSection({
                           title,
                           children,
                       }: {
    title: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="border-t border-dashed border-slate-200 pt-5 first:border-t-0 first:pt-0">
            <div className="mb-4 flex items-center gap-2">
                <span className="h-4 w-1 rounded-full bg-[#171717]"/>
                <h4 className="text-[15px] font-semibold text-slate-800">{title}</h4>
            </div>
            {children}
        </section>
    );
}

function RailActionButton({
                              children,
                              onClick,
                              disabled,
                              tone = "default",
                          }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    tone?: "primary" | "default" | "success" | "warning" | "danger";
}) {
    return (
        <Button
            type="button"
            size="sm"
            variant={tone === "primary" ? "default" : "outline"}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "h-9 rounded-[4px] px-3 text-[14px] font-medium",
                tone === "primary" && "border-[#171717] bg-[#171717] text-white hover:bg-[#262626]",
                tone === "success" && "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600",
                tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100",
                tone === "danger" && "border-rose-200 bg-white text-rose-600 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-700",
            )}
        >
            {children}
        </Button>
    );
}

const CANDIDATE_LIST_ESTIMATED_ROW_HEIGHT = 178;
const CANDIDATE_LIST_OVERSCAN = 6;
const CANDIDATE_BOARD_ESTIMATED_CARD_HEIGHT = 150;
const CANDIDATE_BOARD_OVERSCAN = 5;
const SCORE_SUGGESTED_STATUS_VALUES = new Set(["screening_passed", "talent_pool", "screening_rejected"]);
const SMOOTH_VERTICAL_SCROLLBAR_CLASS = "[scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.82)_transparent] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[scrollbar-color:rgba(71,85,105,0.9)_transparent] dark:[&::-webkit-scrollbar-thumb]:bg-slate-700";
const SMOOTH_HORIZONTAL_SCROLLBAR_CLASS = "[scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.86)_transparent] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[scrollbar-color:rgba(71,85,105,0.92)_transparent] dark:[&::-webkit-scrollbar-thumb]:bg-slate-700";

type CandidateRowProps = {
    candidate: CandidateSummary;
    isSelected: boolean;
    isChecked: boolean;
    columns: CandidateListColumnKey[];
    columnWidths: CandidateListDisplayColumnWidths;
    gridTemplateColumns: string;
    rowStart: number;
    rowHeight: number;
    setSelectedCandidateId: React.Dispatch<React.SetStateAction<number | null>>;
    toggleCandidateSelection: (candidateId: number, nextChecked?: boolean) => void;
    getResumeMailSummary: (candidateId: number) => string | null;
    getOrganizationLabel: (orgCode: string | null | undefined) => string;
    tr: ReturnType<typeof getCandidatesLocale>;
    language: string;
};

const CandidateRow = React.memo(function CandidateRow({
    candidate,
    isSelected,
    isChecked,
    columns,
    columnWidths,
    gridTemplateColumns,
    rowStart,
    rowHeight,
    setSelectedCandidateId,
    toggleCandidateSelection,
    getResumeMailSummary,
    getOrganizationLabel,
    tr,
    language,
}: CandidateRowProps) {
    const resumeMailSummary = getResumeMailSummary(candidate.id);
    const displayStatus = resolveCandidateDisplayStatus(candidate);
    const isZh = language !== "en-US";
    const candidateProfileSummary = [
        candidate.current_company,
        candidate.years_of_experience,
        candidate.education,
    ].map((value) => String(value || "").trim()).filter(Boolean).join(" · ");
    const positionLabel = candidate.position_title || candidate.screened_position_title || tr.unassignedPosition;
    const aiPositionLabel = (
        candidate.ai_match_position_title
        && candidate.ai_match_position_title !== candidate.position_title
        && candidate.ai_match_position_title !== candidate.screened_position_title
    )
        ? candidate.ai_match_position_title
        : "";
    const onSelect = React.useCallback(() => setSelectedCandidateId(candidate.id), [candidate.id, setSelectedCandidateId]);
    const onToggleCheck = React.useCallback((checked: boolean) => {
        toggleCandidateSelection(candidate.id, checked);
    }, [candidate.id, toggleCandidateSelection]);

    return (
        <div
            role="row"
            data-candidate-id={candidate.id}
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: rowHeight,
                transform: `translateY(${rowStart}px)`,
                gridTemplateColumns,
            }}
            className={cn(
                "grid cursor-pointer overflow-hidden border-b border-slate-200/80 bg-white text-base transition-colors dark:border-slate-800 dark:bg-slate-950",
                "hover:bg-slate-50 dark:hover:bg-slate-900/70",
                isSelected && "bg-slate-100 dark:bg-slate-900",
            )}
            onClick={onSelect}
        >
            <div role="cell" className="flex items-center p-2 whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(event) => onToggleCheck(event.target.checked)}
                    aria-label={tr.selectCandidate(candidate.name)}
                />
            </div>
            {columns.map((columnKey) => {
                if (columnKey === "candidate") {
                    return (
                        <div
                            role="cell"
                            key={columnKey}
                            style={{
                                width: columnWidths.candidate,
                                minWidth: columnWidths.candidate,
                                maxWidth: columnWidths.candidate,
                            }}
                            className="flex min-w-0 items-center overflow-hidden p-2"
                        >
                            <div className="min-w-0 overflow-hidden">
                                <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                                    <HoverRevealText text={candidate.name + (candidate.age ? ` (${candidate.age}${tr.ageSuffix})` : "")} className="font-medium text-slate-900 dark:text-slate-100"/>
                                    {resumeMailSummary ? (
                                        <Badge className="shrink-0 rounded-full border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
                                            {tr.resumeSent}
                                        </Badge>
                                    ) : null}
                                </div>
                                <HoverRevealText
                                    text={candidate.phone || candidate.email || tr.noContact}
                                    className="text-xs text-slate-500 dark:text-slate-400"
                                />
                                {candidateProfileSummary ? (
                                    <HoverRevealText
                                        text={candidateProfileSummary}
                                        className="mt-0.5 text-sm text-slate-500 dark:text-slate-400"
                                        tooltipClassName="max-w-sm"
                                    />
                                ) : null}
                                {candidate.ai_potential_position ? (
                                    <HoverRevealText
                                        text={`${isZh ? "转岗潜力" : "Potential Transition"}: ${candidate.ai_potential_position}${candidate.ai_potential_reason ? ` · ${candidate.ai_potential_reason}` : ""}`}
                                        className="mt-1 text-xs text-violet-600 dark:text-violet-300"
                                        tooltipClassName="max-w-md"
                                    />
                                ) : null}
                                {resumeMailSummary ? (
                                    <HoverRevealText
                                        text={resumeMailSummary}
                                        className="mt-1 text-xs text-violet-600 dark:text-slate-300"
                                        tooltipClassName="max-w-sm"
                                    />
                                ) : null}
                            </div>
                        </div>
                    );
                }
                if (columnKey === "organization") {
                    return (
                        <div
                            role="cell"
                            key={columnKey}
                            style={{
                                width: columnWidths.organization,
                                minWidth: columnWidths.organization,
                                maxWidth: columnWidths.organization,
                            }}
                            className="flex min-w-0 items-center p-2"
                        >
                            <HoverRevealText
                                text={getOrganizationLabel(candidate.org_code)}
                                className="text-xs text-slate-600 dark:text-slate-300"
                            />
                        </div>
                    );
                }
                if (columnKey === "position") {
                    return (
                        <div
                            role="cell"
                            key={columnKey}
                            style={{
                                width: columnWidths.position,
                                minWidth: columnWidths.position,
                                maxWidth: columnWidths.position,
                            }}
                            className="flex min-w-0 items-center p-2"
                        >
                            <div className="min-w-0">
                                <HoverRevealText text={positionLabel}/>
                                {aiPositionLabel ? (
                                    <HoverRevealText
                                        text={`${isZh ? "AI 建议" : "AI Suggestion"}: ${aiPositionLabel}`}
                                        className="mt-1 text-xs text-violet-600 dark:text-violet-300"
                                        tooltipClassName="max-w-sm"
                                    />
                                ) : null}
                            </div>
                        </div>
                    );
                }
                if (columnKey === "status") {
                    return (
                        <div
                            role="cell"
                            key={columnKey}
                            style={{
                                width: columnWidths.status,
                                minWidth: columnWidths.status,
                                maxWidth: columnWidths.status,
                            }}
                            className="flex min-w-0 flex-col justify-center p-2 whitespace-nowrap"
                        >
                            <Badge className={cn("rounded-full border max-w-full", statusBadgeClass("candidate", displayStatus))}>
                                <span className="truncate">{labelForCandidateStatus(displayStatus)}</span>
                            </Badge>
                            {candidate.display_status_reason ? (
                                <HoverRevealText
                                    text={sanitizeCandidateFacingErrorText(candidate.display_status_reason, {
                                        context: resolveCandidateFacingErrorContext(
                                            candidate.active_screening_task_type,
                                            { autoRetry: candidate.active_screening_auto_retry_scheduled },
                                        ),
                                        language,
                                    })}
                                    className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400"
                                    tooltipClassName="max-w-sm"
                                />
                            ) : null}
                        </div>
                    );
                }
                if (columnKey === "match") {
                    return (
                        <div
                            role="cell"
                            key={columnKey}
                            style={{
                                width: columnWidths.match,
                                minWidth: columnWidths.match,
                                maxWidth: columnWidths.match,
                            }}
                            className="flex items-center p-2 whitespace-nowrap"
                        >
                            {formatPercent(resolveCandidateSummaryMatchPercent(candidate))}
                        </div>
                    );
                }
                if (columnKey === "city") {
                    return (
                        <div
                            role="cell"
                            key={columnKey}
                            style={{
                                width: columnWidths.city,
                                minWidth: columnWidths.city,
                                maxWidth: columnWidths.city,
                            }}
                            className="flex min-w-0 items-center p-2"
                        >
                            <HoverRevealText text={candidate.city || "-"} className="text-xs text-slate-600 dark:text-slate-300"/>
                        </div>
                    );
                }
                if (columnKey === "expected_city") {
                    return (
                        <div
                            role="cell"
                            key={columnKey}
                            style={{
                                width: columnWidths.expected_city,
                                minWidth: columnWidths.expected_city,
                                maxWidth: columnWidths.expected_city,
                            }}
                            className="flex min-w-0 items-center p-2"
                        >
                            <HoverRevealText text={candidate.expected_city || "-"} className="text-xs text-slate-600 dark:text-slate-300"/>
                        </div>
                    );
                }
                if (columnKey === "source") {
                    return (
                        <div
                            role="cell"
                            key={columnKey}
                            style={{
                                width: columnWidths.source,
                                minWidth: columnWidths.source,
                                maxWidth: columnWidths.source,
                            }}
                            className="flex min-w-0 items-center p-2"
                        >
                            <HoverRevealText text={candidate.source || "-"} className="text-xs text-slate-600 dark:text-slate-300"/>
                        </div>
                    );
                }
                if (columnKey === "updated") {
                    return (
                        <div
                            role="cell"
                            key={columnKey}
                            style={{
                                width: columnWidths.updated,
                                minWidth: columnWidths.updated,
                                maxWidth: columnWidths.updated,
                            }}
                            className="flex min-w-0 items-center p-2"
                        >
                            <HoverRevealText text={formatDateTime(candidate.updated_at)}/>
                        </div>
                    );
                }
                return null;
            })}
        </div>
    );
}, (prev, next) => {
    return prev.isSelected === next.isSelected
        && prev.isChecked === next.isChecked
        && prev.columns === next.columns
        && prev.columnWidths === next.columnWidths
        && prev.gridTemplateColumns === next.gridTemplateColumns
        && prev.rowStart === next.rowStart
        && prev.rowHeight === next.rowHeight
        && prev.candidate.status === next.candidate.status
        && prev.candidate.active_screening_task_status === next.candidate.active_screening_task_status
        && prev.candidate.display_status_reason === next.candidate.display_status_reason
        && prev.candidate.match_percent === next.candidate.match_percent
        && prev.candidate.updated_at === next.candidate.updated_at
        && prev.candidate.name === next.candidate.name
        && prev.candidate.phone === next.candidate.phone
        && prev.candidate.email === next.candidate.email
        && prev.candidate.org_code === next.candidate.org_code
        && prev.candidate.position_title === next.candidate.position_title
        && prev.candidate.screened_position_title === next.candidate.screened_position_title
        && prev.candidate.ai_match_position_title === next.candidate.ai_match_position_title
        && prev.candidate.ai_potential_position === next.candidate.ai_potential_position
        && prev.candidate.ai_potential_reason === next.candidate.ai_potential_reason
        && prev.candidate.source === next.candidate.source
        && prev.candidate.age === next.candidate.age
        && prev.candidate.current_company === next.candidate.current_company
        && prev.candidate.years_of_experience === next.candidate.years_of_experience
        && prev.candidate.education === next.candidate.education
        && prev.candidate.city === next.candidate.city
        && prev.candidate.expected_city === next.candidate.expected_city
        && prev.language === next.language
        && prev.getResumeMailSummary(prev.candidate.id) === next.getResumeMailSummary(next.candidate.id);
});

type CandidateApplicantCardProps = {
    candidate: CandidateSummary;
    isSelected: boolean;
    isChecked: boolean;
    rowStart: number;
    rowHeight: number;
    setSelectedCandidateId: React.Dispatch<React.SetStateAction<number | null>>;
    toggleCandidateSelection: (candidateId: number, nextChecked?: boolean) => void;
    getResumeMailSummary: (candidateId: number) => string | null;
    onDisposition: (candidateId: number, action: CandidateQuickDispositionAction) => void;
    tr: ReturnType<typeof getCandidatesLocale>;
    language: string;
};

const CandidateApplicantCard = React.memo(function CandidateApplicantCard({
    candidate,
    isSelected,
    isChecked,
    rowStart,
    rowHeight,
    setSelectedCandidateId,
    toggleCandidateSelection,
    getResumeMailSummary,
    onDisposition,
    tr,
    language,
}: CandidateApplicantCardProps) {
    const isZh = language !== "en-US";
    const displayStatus = resolveCandidateDisplayStatus(candidate);
    const matchPercent = resolveCandidateSummaryMatchPercent(candidate);
    const resumeMailSummary = getResumeMailSummary(candidate.id);
    const contactText = candidate.phone || candidate.email || tr.noContact;
    const profileText = [
        candidate.age ? `${candidate.age}${tr.ageSuffix}` : "",
        candidate.education,
        candidate.city,
        candidate.expected_city ? `${isZh ? "期望" : "Expect"} ${candidate.expected_city}` : "",
    ].filter(Boolean).join(" · ");
    const experienceLines = [
        candidate.education ? `${isZh ? "学历" : "Education"}：${candidate.education}` : "",
        candidate.current_company ? `${isZh ? "最近公司" : "Recent Company"}：${candidate.current_company}${candidate.years_of_experience ? ` · ${candidate.years_of_experience}` : ""}` : "",
    ].filter(Boolean);
    const positionLabel = candidate.position_title || candidate.screened_position_title || tr.unassignedPosition;
    const aiPositionLabel = candidate.ai_match_position_title || candidate.ai_potential_position || "";
    const fitLabel = (() => {
        if (displayStatus === "screening_running") {
            return isZh ? "初筛中" : "Screening";
        }
        if (displayStatus === "pending_screening") {
            return isZh ? "待初筛" : "To Screen";
        }
        if (displayStatus === "screening_rejected" || displayStatus === "interview_rejected") {
            return isZh ? "不符合" : "Rejected";
        }
        if (matchPercent != null && matchPercent >= 80) {
            return isZh ? "非常符合" : "Strong Fit";
        }
        if (matchPercent != null && matchPercent >= 60) {
            return isZh ? "较符合" : "Good Fit";
        }
        if (matchPercent != null && matchPercent > 0) {
            return isZh ? "待确认" : "Review";
        }
        return isZh ? "未评估" : "Not Scored";
    })();
    const fitClassName = cn(
        "rounded px-2 py-0.5 text-xs font-medium",
        displayStatus === "screening_running"
            ? "bg-[#F5F5F5] text-[#171717] dark:bg-neutral-900/30 dark:text-neutral-200"
            : displayStatus === "pending_screening"
                ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                : displayStatus === "screening_rejected" || displayStatus === "interview_rejected"
                    ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200"
                    : matchPercent != null && matchPercent >= 60
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200",
    );
    const topTags = (candidate.tags || []).slice(0, 5);

    const openDetail = React.useCallback(() => {
        setSelectedCandidateId(candidate.id);
    }, [candidate.id, setSelectedCandidateId]);
    const onToggleCheck = React.useCallback((checked: boolean) => {
        toggleCandidateSelection(candidate.id, checked);
    }, [candidate.id, toggleCandidateSelection]);

    return (
        <div
            role="listitem"
            data-candidate-id={candidate.id}
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: rowHeight,
                transform: `translateY(${rowStart}px)`,
            }}
            className="px-0 pb-3.5"
        >
            <div
                role="button"
                tabIndex={0}
                onClick={openDetail}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openDetail();
                    }
                }}
                className={cn(
                    "flex h-full w-full min-w-0 flex-col rounded-md border bg-white px-4 pb-4 pt-3 text-left shadow-none transition dark:bg-slate-950",
                    "border-[#e5e5e5] hover:border-[#d4d4d4] hover:bg-[#fafafa] dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-900/70",
                    isSelected && "border-[#171717] bg-[#f5f5f5] dark:border-slate-500 dark:bg-slate-900",
                )}
            >
                <div className="flex min-w-0 items-start gap-3.5">
                    <div className="pt-1.5" onClick={(event) => event.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(event) => onToggleCheck(event.target.checked)}
                            aria-label={tr.selectCandidate(candidate.name)}
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-lime-500"/>
                            <span className="truncate text-[15px] font-semibold leading-5 text-slate-950 dark:text-slate-50">{candidate.name}</span>
                            {profileText ? <span className="truncate text-sm leading-5 text-slate-500 dark:text-slate-400">{profileText}</span> : null}
                            {resumeMailSummary ? (
                                <Badge className="rounded border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
                                    {tr.resumeSent}
                                </Badge>
                            ) : null}
                        </div>
                        <div className="mt-2 space-y-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                            {experienceLines.length ? experienceLines.map((line) => (
                                <p key={line} className="line-clamp-1">
                                    <span className="mr-1 text-slate-400">◆</span>{line}
                                </p>
                            )) : (
                                <p className="text-slate-400 dark:text-slate-500">{contactText}</p>
                            )}
                        </div>
                        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                            {topTags.map((tag) => (
                                <span key={tag} className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                                    {tag}
                                </span>
                            ))}
                            {aiPositionLabel ? (
                                <span className="max-w-[280px] truncate rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
                                    AI：{aiPositionLabel}
                                </span>
                            ) : null}
                            {candidate.ai_potential_position ? (
                                <span className="rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
                                    {isZh ? "转岗" : "Potential"}：{candidate.ai_potential_position}
                                </span>
                            ) : null}
                        </div>
                        <div className="mt-2 flex min-w-0 items-center gap-2">
                            <span className={fitClassName}>{fitLabel}</span>
                            <p className="line-clamp-1 text-sm text-slate-600 dark:text-slate-300">
                                {candidate.display_status_reason
                                    ? sanitizeCandidateFacingErrorText(candidate.display_status_reason, {
                                        context: resolveCandidateFacingErrorContext(candidate.active_screening_task_type, {
                                            autoRetry: candidate.active_screening_auto_retry_scheduled,
                                        }),
                                        language,
                                    })
                                    : (isZh ? "该应聘者信息已进入当前筛选流程，可继续处理。" : "Candidate is ready for the current hiring flow.")}
                            </p>
                        </div>
                    </div>
                    <div className="hidden w-[250px] shrink-0 flex-col items-end gap-1 pt-1 text-right md:flex">
                        <div className="min-w-0 space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                            <p className="truncate font-medium text-[#171717] dark:text-neutral-300">{positionLabel}</p>
                            <p className="truncate">{candidate.source || "-"} · {formatDateTime(candidate.updated_at)}</p>
                            <p className="truncate">{isZh ? "业务筛选" : "Business Screening"}：{labelForCandidateStatus(displayStatus)}</p>
                        </div>
                    </div>
                </div>
                <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 pb-2 pt-2.5 dark:border-slate-800">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <Badge variant="outline" className="h-6 rounded px-2">
                            {tr.matchBadge} {formatPercent(matchPercent)}
                        </Badge>
                        <Badge className={cn("h-6 rounded border px-2", statusBadgeClass("candidate", displayStatus))}>
                            {labelForCandidateStatus(displayStatus)}
                        </Badge>
                        <span className="hidden max-w-[320px] truncate md:inline">
                            {positionLabel} · {candidate.source || "-"} · {formatDateTime(candidate.updated_at)}
                        </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                        <Button size="sm" variant="outline" className="h-7 rounded-md border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50" onClick={openDetail}>
                            <Eye className="h-3.5 w-3.5"/>
                            {isZh ? "详情" : "Details"}
                        </Button>
                        <Button size="sm" className="h-7 rounded-md bg-emerald-600 px-2.5 text-xs text-white shadow-none hover:bg-emerald-700" onClick={() => onDisposition(candidate.id, "pass")}>
                            <Check className="h-3.5 w-3.5"/>
                            {tr.quickDispositionPass}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 rounded-md border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50" onClick={() => onDisposition(candidate.id, "talent_pool")}>
                            <Users className="h-3.5 w-3.5"/>
                            {tr.quickDispositionTalentPool}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 rounded-md border-rose-200 bg-white px-2.5 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-300" onClick={() => onDisposition(candidate.id, "reject")}>
                            <Trash2 className="h-3.5 w-3.5"/>
                            {tr.quickDispositionReject}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}, (prev, next) => (
    prev.isSelected === next.isSelected
    && prev.isChecked === next.isChecked
    && prev.rowStart === next.rowStart
    && prev.rowHeight === next.rowHeight
    && prev.candidate.status === next.candidate.status
    && prev.candidate.display_status === next.candidate.display_status
    && prev.candidate.display_status_reason === next.candidate.display_status_reason
    && prev.candidate.match_percent === next.candidate.match_percent
    && prev.candidate.updated_at === next.candidate.updated_at
    && prev.candidate.name === next.candidate.name
    && prev.candidate.phone === next.candidate.phone
    && prev.candidate.email === next.candidate.email
    && prev.candidate.position_title === next.candidate.position_title
    && prev.candidate.screened_position_title === next.candidate.screened_position_title
    && prev.candidate.ai_match_position_title === next.candidate.ai_match_position_title
    && prev.candidate.ai_potential_position === next.candidate.ai_potential_position
    && prev.candidate.source === next.candidate.source
    && prev.candidate.age === next.candidate.age
    && prev.candidate.education === next.candidate.education
    && prev.candidate.current_company === next.candidate.current_company
    && prev.candidate.years_of_experience === next.candidate.years_of_experience
    && prev.candidate.city === next.candidate.city
    && prev.candidate.expected_city === next.candidate.expected_city
    && prev.candidate.tags === next.candidate.tags
    && prev.language === next.language
    && prev.getResumeMailSummary(prev.candidate.id) === next.getResumeMailSummary(next.candidate.id)
));

type CandidateBoardColumnProps = {
    group: CandidateBoardGroup;
    scrollElement: HTMLDivElement | null;
    selectedCandidateId: number | null;
    selectedCandidateIdSet: ReadonlySet<number>;
    setSelectedCandidateId: React.Dispatch<React.SetStateAction<number | null>>;
    toggleCandidateSelection: (candidateId: number, nextChecked?: boolean) => void;
    getCandidateResumeMailSummary: (candidateId: number) => string | null;
    tr: ReturnType<typeof getCandidatesLocale>;
};

const CandidateBoardColumn = React.memo(function CandidateBoardColumn({
    group,
    scrollElement,
    selectedCandidateId,
    selectedCandidateIdSet,
    setSelectedCandidateId,
    toggleCandidateSelection,
    getCandidateResumeMailSummary,
    tr,
}: CandidateBoardColumnProps) {
    const virtualizer = useVirtualizer({
        count: group.items.length,
        getScrollElement: () => scrollElement,
        estimateSize: () => CANDIDATE_BOARD_ESTIMATED_CARD_HEIGHT,
        overscan: CANDIDATE_BOARD_OVERSCAN,
    });

    return (
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="mb-4 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{group.label}</p>
                <Badge variant="outline" className="rounded-full">{group.items.length}</Badge>
            </div>
            {group.items.length ? (
                <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
                    {virtualizer.getVirtualItems().map((virtualItem) => {
                        const candidate = group.items[virtualItem.index];
                        const mailSummary = getCandidateResumeMailSummary(candidate.id);
                        return (
                            <div
                                key={candidate.id}
                                ref={virtualizer.measureElement}
                                data-index={virtualItem.index}
                                className="absolute left-0 top-0 w-full pb-3"
                                style={{ transform: `translateY(${virtualItem.start}px)` }}
                            >
                                <div
                                    className={cn(
                                        "w-full rounded-2xl border px-4 py-4 transition",
                                        selectedCandidateId === candidate.id
                                            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                            : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-950",
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedCandidateId(candidate.id)}
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="line-clamp-2 break-words text-sm font-medium leading-6">
                                                    {candidate.name}
                                                </p>
                                                {mailSummary ? (
                                                    <Badge className="rounded-full border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
                                                        {tr.resumeSent}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                            <p className="mt-1 line-clamp-2 break-words text-xs leading-5 opacity-80">
                                                {candidate.position_title || tr.unassignedPosition}
                                            </p>
                                            {mailSummary ? (
                                                <p className="mt-2 text-[11px] opacity-80">{mailSummary}</p>
                                            ) : null}
                                            <div className="mt-3 flex items-center justify-between text-xs opacity-80">
                                                <span>{tr.matchBadge} {formatPercent(resolveCandidateSummaryMatchPercent(candidate))}</span>
                                                <span>{formatDateTime(candidate.updated_at)}</span>
                                            </div>
                                        </button>
                                        <input
                                            type="checkbox"
                                            checked={selectedCandidateIdSet.has(candidate.id)}
                                            onChange={(event) => toggleCandidateSelection(candidate.id, event.target.checked)}
                                            aria-label={tr.selectCandidate(candidate.name)}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    {tr.noCandidatesInStatus}
                </p>
            )}
        </div>
    );
});

type CandidatePipelineStageSummary = CandidatePipelineStageConfig & {
    label: string;
    hint: string;
    count: number;
    active: boolean;
};

function CandidatePipelineBar({
    stages,
    onSelect,
}: {
    stages: CandidatePipelineStageSummary[];
    onSelect: (stage: CandidatePipelineStageSummary) => void;
}) {
    return (
        <div className="grid overflow-hidden rounded-md border border-slate-200 bg-white [grid-template-columns:repeat(auto-fit,minmax(118px,1fr))] dark:border-slate-800 dark:bg-slate-950">
            {stages.map((stage) => (
                <button
                    key={stage.key}
                    type="button"
                    aria-pressed={stage.active}
                    onClick={() => onSelect(stage)}
                    className={cn(
                        "min-w-0 border-r border-slate-100 px-3 py-2 text-left transition last:border-r-0 dark:border-slate-800",
                        stage.active
                            ? "bg-white text-[#171717] shadow-[inset_0_-2px_0_#171717] dark:bg-slate-950 dark:text-neutral-300"
                            : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900",
                    )}
                >
                    <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{stage.label}</span>
                        <span className="shrink-0 text-lg font-semibold tabular-nums">{stage.count.toLocaleString()}</span>
                    </div>
                    <p
                        className={cn(
                            "mt-1 truncate text-xs",
                            stage.active ? "text-[#171717]/80 dark:text-neutral-200/80" : "text-slate-500 dark:text-slate-400",
                        )}
                    >
                        {stage.hint}
                    </p>
                </button>
            ))}
        </div>
    );
}

function CandidatePositionScopeSidebar({
    positions,
    activePositionId,
    allPositionCandidateCount,
    onSelectPosition,
    tr,
    isZh,
}: {
    positions: PositionSummary[];
    activePositionId: string;
    allPositionCandidateCount: number;
    onSelectPosition: (positionId: string) => void;
    tr: ReturnType<typeof getCandidatesLocale>;
    isZh: boolean;
}) {
    const [query, setQuery] = React.useState("");
    const normalizedQuery = query.trim().toLowerCase();
    const filteredPositions = React.useMemo(() => (
        positions.filter((position) => {
            if (!normalizedQuery) {
                return true;
            }
            return [
                position.title,
                position.department,
                position.location,
                position.position_code,
            ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
        }).slice(0, 80)
    ), [normalizedQuery, positions]);
    const recruitingCount = React.useMemo(() => (
        positions.filter((position) => position.status === "recruiting").length
    ), [positions]);

    return (
        <aside className="hidden min-h-0 xl:block">
            <div className="flex h-full min-h-0 flex-col rounded-md border border-[#e5e5e5] bg-white shadow-none dark:border-slate-800 dark:bg-slate-950">
                <div className="border-b border-[#e5e5e5] px-4 py-3.5 dark:border-slate-800">
                    <p className="text-sm font-semibold leading-5 text-slate-950 dark:text-slate-50">
                        {isZh ? "招聘中职位" : "Open Positions"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {isZh ? `共 ${recruitingCount || positions.length} 个职位` : `${recruitingCount || positions.length} positions`}
                    </p>
                    <SearchField
                        value={query}
                        onChange={setQuery}
                        placeholder={isZh ? "搜索职位" : "Search positions"}
                        inputClassName="mt-3 h-8 text-sm"
                    />
                </div>
                <div className="border-b border-[#e5e5e5] p-2.5 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={() => onSelectPosition("")}
                        className={cn(
                            "flex min-h-10 w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm leading-5 transition",
                            !activePositionId
                                ? "bg-[#F5F5F5] text-[#171717]"
                                : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900",
                        )}
                    >
                        <span>{isZh ? "全部职位" : "All Positions"}</span>
                        <span className={cn("text-xs", !activePositionId ? "text-[#171717]/70" : "text-slate-400")}>
                            {allPositionCandidateCount}
                        </span>
                    </button>
                </div>
                <div className={cn("min-h-0 flex-1 overflow-y-auto p-2.5", SMOOTH_VERTICAL_SCROLLBAR_CLASS)}>
                    {filteredPositions.length ? filteredPositions.map((position) => {
                        const positionId = String(position.id);
                        const active = activePositionId === positionId;
                        return (
                            <button
                                key={position.id}
                                type="button"
                                onClick={() => onSelectPosition(positionId)}
                                className={cn(
                                    "mb-1.5 flex w-full min-w-0 items-start justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm leading-5 transition",
                                    active
                                        ? "bg-[#F5F5F5] text-[#171717] dark:bg-slate-900 dark:text-neutral-300"
                                        : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900",
                                )}
                            >
                                <span className="min-w-0">
                                    <span className="block truncate font-medium leading-5">{position.title}</span>
                                    <span className="mt-1 block truncate text-xs leading-4 text-slate-400">
                                        {[position.department, position.location].filter(Boolean).join(" · ") || tr.unassignedPosition}
                                    </span>
                                </span>
                                <span className="mt-0.5 shrink-0 text-xs leading-5 text-slate-400">{position.candidate_count || 0}</span>
                            </button>
                        );
                    }) : (
                        <div className="px-3 py-8 text-center text-sm text-slate-400">
                            {isZh ? "没有匹配的职位" : "No matching positions"}
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}

function getCandidatesLocale(language = getCurrentLanguage()) {
    const isZh = language !== "en-US";
    return {
        collapse: isZh ? "收起" : "Collapse",
        expandAll: (count: number) => (isZh ? `展开全部（${count} 行）` : `Expand all (${count} lines)`),
        generatedAt: (value: string) => (isZh ? `生成于 ${formatDateTime(value)}` : `Generated ${formatDateTime(value)}`),
        generated: isZh ? "已生成" : "Generated",
        moduleCount: isZh ? "模块数" : "Modules",
        modulesSuffix: isZh ? " 个" : "",
        parsing: isZh ? "解析中" : "Parsing",
        estimatedQuestions: isZh ? "题目数（估）" : "Estimated Questions",
        questionSuffix: isZh ? " 题" : "",
        moduleOutline: isZh ? "模块目录" : "Module Outline",
        extraModules: (count: number) => (isZh ? `+ ${count} 个模块` : `+ ${count} more modules`),
        downloadHtml: isZh ? "下载 HTML" : "Download HTML",
        standalonePreview: isZh ? "独立预览" : "Standalone Preview",
        noAiScoreOutput: isZh ? "暂无 AI 评分输出。" : "No AI screening output yet.",
        aiScreeningResultHeading: isZh ? "# AI 初筛结果" : "# AI Screening Result",
        totalScoreLine: (value: string) => (isZh ? `- 总分：${value}` : `- Total Score: ${value}`),
        matchLine: (value: string) => (isZh ? `- 匹配度：${value}` : `- Match: ${value}`),
        suggestedStatusLine: (value: string) => (isZh ? `- 推荐状态：${value}` : `- Suggested Status: ${value}`),
        aiRecommendationHeading: isZh ? "## AI 建议" : "## AI Recommendation",
        dimensionScoresHeading: isZh ? "## 逐维度评分" : "## Dimension Scores",
        advantagesHeading: isZh ? "## 优势" : "## Strengths",
        concernsHeading: isZh ? "## 风险点" : "## Risks",
        evidenceLabel: isZh ? "证据" : "Evidence",
        delimiter: isZh ? "；" : "; ",
        fullAiOutput: isZh ? "完整 AI 输出" : "Full AI Output",
        modelLabel: isZh ? "模型" : "Model",
        timeLabel: isZh ? "时间" : "Time",
        copied: isZh ? "已复制" : "Copied",
        copyAll: isZh ? "复制全文" : "Copy All",
        viewStructuredRaw: isZh ? "查看结构化原始输出" : "View Structured Raw Output",
        keywordChipPrefix: isZh ? "关键词：" : "Keyword:",
        noKeyword: isZh ? "无关键词" : "No keyword",
        allPrefix: isZh ? "全部" : "All",
        filters: isZh ? "筛选" : "Filters",
        refresh: isZh ? "刷新" : "Refresh",
        listView: isZh ? "列表" : "List",
        boardView: isZh ? "看板" : "Board",
        collapseFilters: isZh ? "收起筛选" : "Collapse Filters",
        search: isZh ? "搜索" : "Search",
        searchPlaceholder: isZh ? "搜索候选人、手机号、邮箱、公司" : "Search candidates, phone, email, or company",
        organization: isZh ? "组织" : "Organization",
        position: isZh ? "岗位" : "Position",
        allPositions: isZh ? "全部岗位" : "All Positions",
        status: isZh ? "状态" : "Status",
        allStatuses: isZh ? "全部状态" : "All Statuses",
        matchPercent: isZh ? "匹配度" : "Match",
        sortingByMatchPercent: isZh ? "正在按匹配度重新排序，当前列表先保留，完成后自动更新。" : "Sorting by match. Keeping the current list visible until the new order is ready.",
        allMatchPercent: isZh ? "全部匹配度" : "All Match Scores",
        above80: isZh ? "80% 以上" : "80%+",
        above60: isZh ? "60% 以上" : "60%+",
        above40: isZh ? "40% 以上" : "40%+",
        source: isZh ? "来源" : "Source",
        allSources: isZh ? "全部来源" : "All Sources",
        selectedLabel: (count: number) => (isZh ? `已选 ${count} 项` : `${count} selected`),
        timeFilter: isZh ? "时间" : "Time",
        allTime: isZh ? "全部时间" : "All Time",
        today: isZh ? "今天" : "Today",
        last7Days: isZh ? "近 7 天" : "Last 7 Days",
        last30Days: isZh ? "近 30 天" : "Last 30 Days",
        matchedCandidates: (count: number) => (isZh ? `共匹配到 ${count} 位候选人` : `${count} candidates matched`),
        reset: isZh ? "重置" : "Reset",
        currentResults: isZh ? "当前结果" : "Current Results",
        pendingScreening: isZh ? "待初筛" : "Pending Screening",
        pendingInterview: isZh ? "待面试" : "Pending Interview",
        talentPoolAndSent: isZh ? "人才库 / 已发简历" : "Talent Pool / Sent Resume",
        peopleSuffix: isZh ? " 人" : "",
        sendCountZero: isZh ? "0 次" : "0 sent",
        sentCountRegex: isZh ? /已发送\s*(\d+)\s*次/ : /(\d+)\s*sent/i,
        sentCountLabel: (count: string) => (isZh ? `${count} 次` : `${count} sent`),
        sentLabel: isZh ? "已发送" : "Sent",
        candidateList: isZh ? "候选人列表" : "Candidate List",
        candidatePageRange: (start: number, end: number, total: number) => (
            isZh ? `${start}-${end} / 共 ${total} 条` : `${start}-${end} of ${total}`
        ),
        rowsPerPage: isZh ? "条/页" : "Rows/Page",
        previousPage: isZh ? "上一页" : "Previous",
        nextPage: isZh ? "下一页" : "Next",
        loadingCandidateList: isZh ? "正在加载候选人列表" : "Loading candidate list",
        loadingCandidateDetail: isZh ? "正在加载候选人详情" : "Loading candidate details",
        splitResizeHint: isZh ? "✨ 列表宽度可自由拖拽调整，找到你最舒适的视图。" : "✨ Drag to resize the list width and find your perfect view.",
        selectedCandidates: (count: number) => (isZh ? `已选中 ${count} 位候选人` : `${count} candidates selected`),
        selectVisibleCandidates: isZh ? "全选当前列表" : "Select current list",
        unselectVisibleCandidates: isZh ? "取消全选" : "Unselect current list",
        visibleSelectionCount: (selected: number, total: number) => (
            isZh ? `当前列表 ${selected}/${total}` : `${selected}/${total} visible`
        ),
        clearSelection: isZh ? "清空选择" : "Clear Selection",
        stopBatchScreening: isZh ? "停止批量初筛" : "Stop Batch Screening",
        queueBatch: isZh ? "批量入队" : "Queue Batch",
        requeueFreshScreening: isZh ? "批量重新初筛" : "Fresh Screen Batch",
        quickDispositionPass: isZh ? "通过" : "Pass",
        quickDispositionTalentPool: isZh ? "入人才库" : "Talent Pool",
        quickDispositionReject: isZh ? "淘汰" : "Reject",
        quickDispositionReasonPass: isZh ? "批量操作：初筛通过" : "Batch action: screening passed",
        quickDispositionReasonTalentPool: isZh ? "批量操作：归入人才库" : "Batch action: moved to talent pool",
        quickDispositionReasonReject: isZh ? "批量操作：初筛淘汰" : "Batch action: screening rejected",
        sendResumesBatch: isZh ? "发送简历" : "Send Resumes",
        exportCandidates: isZh ? "导出" : "Export",
        exporting: isZh ? "导出中..." : "Exporting...",
        batchDelete: isZh ? "批量删除" : "Batch Delete",
        batchBindPosition: isZh ? "设置岗位" : "Set Position",
        batchBindPositionTitle: isZh ? "设置目标岗位" : "Set Target Position",
        batchBindPositionConfirm: isZh ? "确定" : "OK",
        batchBindPositionCancel: isZh ? "取消" : "Cancel",
        batchUpdateStatus: isZh ? "变更状态" : "Change Status",
        batchUpdateStatusTitle: isZh ? "变更候选人状态" : "Change Candidate Status",
        batchUpdateStatusLabel: isZh ? "目标状态" : "Target Status",
        batchUpdateStatusSelectPlaceholder: isZh ? "请选择状态" : "Select status",
        batchUpdateStatusReason: isZh ? "变更原因（选填）" : "Reason (optional)",
        batchUpdateStatusReasonPlaceholder: isZh ? "填写变更原因" : "Enter reason for status change",
        batchUpdateStatusConfirm: isZh ? "确定变更" : "Confirm Change",
        duplicateWarning: isZh ? "发现重复候选人" : "Duplicate Candidates Found",
        duplicateWarningDesc: (count: number) => isZh ? `检测到 ${count} 位候选人的联系方式与当前候选人相同。` : `${count} candidate(s) have the same contact info.`,
        viewDuplicate: isZh ? "查看" : "View",
        ageSuffix: isZh ? "岁" : "yo",
        cityLabel: isZh ? "所在城市" : "Current City",
        expectedCityLabel: isZh ? "期望城市" : "Expected City",
        selectAllCandidates: isZh ? "全选候选人" : "Select all candidates",
        selectCandidate: (name: string) => (isZh ? `选择候选人 ${name}` : `Select candidate ${name}`),
        stopping: isZh ? "停止中..." : "Stopping...",
        queueing: isZh ? "入队中..." : "Queueing...",
        candidate: isZh ? "候选人" : "Candidate",
        resumeSent: isZh ? "已发简历" : "Resume Sent",
        noContact: isZh ? "未填写联系方式" : "No contact info",
        unassignedPosition: isZh ? "未分配岗位" : "Unassigned Position",
        noCandidatesMatched: isZh ? "没有符合条件的候选人" : "No matching candidates",
        noCandidatesMatchedDesc: isZh ? "调整筛选条件，或先上传一批简历进入系统。" : "Adjust filters or upload resumes first.",
        noCandidatesInStatus: isZh ? "当前状态暂无候选人" : "No candidates in this status",
        originalStatus: isZh ? "原状态" : "Original Status",
        matchBadge: isZh ? "匹配度" : "Match",
        sentBadge: isZh ? "发送" : "Sent",
        profileTab: isZh ? "档案" : "Profile",
        aiAssessmentTab: isZh ? "AI 评估" : "AI Review",
        interviewPrepTab: isZh ? "面试准备" : "Interview Prep",
        startScreening: isZh ? "开始初筛" : "Start Screening",
        restartScreening: isZh ? "重新初筛" : "Re-screen",
        stopScreening: isZh ? "停止初筛" : "Stop Screening",
        viewResume: isZh ? "查看简历" : "View Resume",
        previewResume: isZh ? "预览简历" : "Preview Resume",
        previewOriginal: isZh ? "预览原件" : "Preview Original",
        sendResume: isZh ? "发送简历" : "Send Resume",
        interviewQuestions: isZh ? "面试题" : "Interview Questions",
        stopGeneration: isZh ? "停止生成" : "Stop",
        deleteCandidate: isZh ? "删除候选人" : "Delete Candidate",
        currentScreeningTask: isZh ? "当前初筛任务" : "Current Screening Task",
        taskRunning: isZh ? "任务执行中" : "Task running",
        baseInfo: isZh ? "基础信息" : "Basic Info",
        namePlaceholder: isZh ? "姓名" : "Name",
        phonePlaceholder: isZh ? "手机号" : "Phone",
        emailPlaceholder: isZh ? "邮箱" : "Email",
        companyPlaceholder: isZh ? "当前公司" : "Current Company",
        experiencePlaceholder: isZh ? "工作年限" : "Years of Experience",
        educationPlaceholder: isZh ? "学历" : "Education",
        agePlaceholder: isZh ? "年龄" : "Age",
        cityPlaceholder: isZh ? "所在城市" : "Current City",
        expectedCityPlaceholder: isZh ? "期望城市" : "Expected City",
        tagsAndNotes: isZh ? "标签与备注" : "Tags & Notes",
        tagsPlaceholder: isZh ? "标签，使用英文逗号分隔" : "Tags, separated by commas",
        notesPlaceholder: isZh ? "例如：沟通不错，但对设备联调经验需要进一步核实" : "Example: strong communication, but device integration experience needs follow-up",
        saveCandidateInfo: isZh ? "保存候选人信息" : "Save Candidate Info",
        savingCandidate: isZh ? "保存中..." : "Saving...",
        statusFlow: isZh ? "状态流转" : "Status Flow",
        confirmStatusChange: (label: string) => (isZh ? `确认变更为「${label}」？` : `Change status to "${label}"?`),
        currentStatusLine: (label: string) => (isZh ? `当前：${label}` : `Current: ${label}`),
        confirm: isZh ? "确认" : "Confirm",
        cancel: isZh ? "取消" : "Cancel",
        statusReasonPlaceholder: isZh ? "状态变更原因，例如：AI 初筛通过，安排技术面试" : "Reason for status change, e.g. AI screening passed and a technical interview is scheduled",
        noReasonProvided: isZh ? "未填写原因" : "No reason provided",
        noStatusHistory: isZh ? "暂无状态记录" : "No Status History",
        noStatusHistoryDesc: isZh ? "候选人发生流转后，这里会记录完整状态历史。" : "Status changes will be recorded here once the candidate moves through the process.",
        aiScoreAndAdvice: isZh ? "AI 评分与建议" : "AI Score & Advice",
        viewFullAiOutput: isZh ? "查看完整 AI 输出" : "View Full AI Output",
        aiRecommendationLine: (recommendation: string, status: string) => (isZh ? `AI 建议：${recommendation} · 推荐状态 ${status}` : `AI recommendation: ${recommendation} · Suggested status ${status}`),
        scoreValidationWarnings: isZh ? "评分有校验警告" : "Score validation warnings",
        viewScoreWarnings: isZh ? "查看评分校验警告" : "View Score Validation Warnings",
        strengths: isZh ? "优势" : "Strengths",
        risks: isZh ? "风险点" : "Risks",
        dimensionScores: isZh ? "维度评分" : "Dimension Scores",
        evidence: isZh ? "证据" : "Evidence",
        dimensionReason: isZh ? "评分依据" : "Reasoning",
        inferredDimension: isZh ? "（推断）" : "(inferred)",
        screeningMemory: isZh ? "初筛工作记忆" : "Screening Memory",
        memorySource: isZh ? "记忆来源" : "Memory Source",
        lastScreeningTime: isZh ? "最近初筛时间" : "Last Screening Time",
        screeningSkills: isZh ? "初筛评估方案" : "Screening Assessment Plans",
        interviewSkills: isZh ? "面试题评估方案" : "Interview Assessment Plans",
        noScreeningMemory: isZh ? "暂无初筛工作记忆" : "No Screening Memory",
        noScreeningMemoryDesc: isZh ? "完成一次初筛后，这里会显示本次初筛使用的评估方案、来源和时间，便于后续生成面试题时复用。" : "After a screening run, the used assessment plans, source, and time will appear here for reuse in interview generation.",
        screeningMemoryHint: (source: string) => (isZh ? `点击“开始初筛”时，会按“岗位绑定评估方案 > 初筛工作记忆”继续执行；若均未配置，则本次不会传评估方案。当前预计来源：${source}。` : `When you click "Start Screening", the system uses "position-bound assessment plans > screening memory". If neither exists, no assessment plans are passed. Current expected source: ${source}.`),
        screeningSkillPreview: (skillsText: string) => (isZh ? `当前预计使用：${skillsText}` : `Expected assessment plans: ${skillsText}`),
        manualOverrideScore: isZh ? "人工修正分数" : "Manual Override Score",
        overrideScorePlaceholder: isZh ? "例如 88" : "e.g. 88",
        overrideReason: isZh ? "修正原因" : "Override Reason",
        overrideReasonPlaceholder: isZh ? "为什么要修正这次 AI 评分" : "Why this AI score needs adjustment",
        hrFeedback: isZh ? "HR 反馈" : "HR Feedback",
        hrFeedbackAgree: isZh ? "认同" : "Agree",
        hrFeedbackDisagree: isZh ? "不认同" : "Disagree",
        hrFeedbackNeutral: isZh ? "待定" : "Neutral",
        hrFeedbackReason: isZh ? "反馈原因" : "Feedback Reason",
        hrFeedbackReasonPlaceholder: isZh ? "可选，填写反馈原因" : "Optional, enter reason",
        hrFeedbackSaved: isZh ? "HR 反馈已保存" : "HR feedback saved",
        aiAssistant: isZh ? "AI 助手" : "AI Assistant",
        assistantPackedTitle: isZh ? "对话记录已收纳到独立助手面板" : "Conversation history is grouped in the assistant panel",
        assistantPackedDescWithCount: (count: number) => (isZh ? `当前候选人已有 ${count} 条助手对话留痕。为避免详情页被聊天卡片刷满，这里改为收纳展示。` : `${count} assistant traces already exist for this candidate. To keep the detail panel readable, the conversation is grouped instead of expanded inline.`),
        assistantPackedDescEmpty: isZh ? "这里不再逐条展开助手对话，避免右侧详情被聊天记录挤满。" : "Assistant conversations are no longer expanded inline so the detail panel stays readable.",
        defaultInterviewSource: (source: string) => (isZh ? `面试题默认使用：${source}` : `Default interview source: ${source}`),
        actualSource: (source: string) => (isZh ? `当前实际来源：${source}` : `Actual source: ${source}`),
        openAiAssistant: isZh ? "打开 AI 助手" : "Open AI Assistant",
        aiExecutionLogs: isZh ? "AI 执行日志" : "AI Execution Logs",
        recordedLogs: (count: number) => (isZh ? `已记录 ${count} 条流程日志` : `${count} process logs recorded`),
        logsCollapsedHint: isZh ? "默认收起，避免右侧详情被日志卡片挤满；需要排查时再展开查看。" : "Logs stay collapsed by default so the detail panel does not get crowded. Expand them when you need to investigate.",
        collapseLogs: isZh ? "收起日志" : "Collapse Logs",
        expandLogs: isZh ? "展开日志" : "Expand Logs",
        runningAwaitModel: isZh ? "执行中，等待模型返回..." : "Running, waiting for model output...",
        viewFullLog: isZh ? "查看完整日志" : "View Full Log",
        noAiLogs: isZh ? "暂无 AI 执行日志" : "No AI Execution Logs",
        noAiLogsDesc: isZh ? "开始初筛、生成面试题后，这里会显示候选人的流程任务留痕与输出内容。" : "Process logs and outputs will appear here after screening or interview-question generation starts.",
        noResumeFile: isZh ? "暂无简历文件" : "No resume file",
        resumeFileDesc: (fileExt: string, size: number, status: string) => (isZh ? `${fileExt} · ${size} bytes · 解析状态 ${status}` : `${fileExt} · ${size} bytes · Parse status ${status}`),
        resumeFileEmptyDesc: isZh ? "上传简历后，这里会显示当前文件、类型与解析状态。" : "After a resume is uploaded, its file info, type, and parse status will appear here.",
        viewOriginal: isZh ? "预览原件" : "Preview Original",
        downloadResume: isZh ? "下载简历" : "Download Resume",
        deleteResume: isZh ? "删除简历" : "Delete Resume",
        parseErrorLine: (message: string) => (isZh ? `解析异常：${message}` : `Parse error: ${message}`),
        roundPlaceholder: isZh ? "轮次，例如 初试 / 复试" : "Round, e.g. Round 1 / Final",
        currentSkillsPlaceholder: isZh ? "当前使用的评估方案" : "Current Assessment Plans",
        interviewRequirementsPlaceholder: isZh ? "补充要求，例如：偏向 IoT 设备联调、自动化稳定性、跨部门协作追问" : "Extra requirements, e.g. IoT device integration, automation stability, or cross-team collaboration follow-ups",
        actualSkills: (skillsText: string) => (isZh ? `当前实际评估方案：${skillsText}` : `Actual assessment plans: ${skillsText}`),
        restoreDefaultSkills: isZh ? "恢复默认评估方案" : "Restore Default Assessment Plans",
        interviewSkillHintDefault: isZh ? "未手动选择时，生成面试题会按“岗位绑定评估方案 > 面试题工作记忆”执行；若均未配置，则本次不会传评估方案。" : "Without manual selection, interview generation uses \"position-bound assessment plans > interview memory\". If neither exists, no assessment plans are passed.",
        interviewSkillHintManual: isZh ? "当前已手动选择评估方案，本次会以手动选择为准。" : "Manual assessment plan selection is active and will be used for this run.",
        noInterviewQuestions: isZh ? "暂无面试题" : "No Interview Questions",
        noInterviewQuestionsDesc: isZh ? "点击上方按钮后，系统会结合岗位 JD、候选人简历和评估方案生成定制化题目。" : "After you click the button above, the system will generate tailored questions from the JD, resume, and assessment plans.",
        candidateWorkspace: isZh ? "候选人工作区" : "Candidate Workspace",
        candidateWorkspaceDesc: isZh ? "未选中候选人时，先在这里查看当前筛选结果的概览、最近更新对象和推荐入口。" : "When no candidate is selected, use this area to review the current result set, recent updates, and recommended next actions.",
        recentCandidates: isZh ? "最近更新候选人" : "Recently Updated Candidates",
        noCandidates: isZh ? "暂无候选人" : "No Candidates",
        noCandidatesDesc: isZh ? "当前筛选结果为空，调整筛选条件或先上传简历后再继续处理。" : "The current result set is empty. Adjust filters or upload resumes first.",
        loadingMoreCandidates: isZh ? "加载中…" : "Loading more…",
        allCandidatesLoaded: isZh ? "已加载全部候选人" : "All candidates loaded",
        recommendedActions: isZh ? "推荐操作" : "Recommended Actions",
        continueFiltering: isZh ? "继续筛选列表" : "Continue Filtering",
        continueFilteringDesc: isZh ? "保持当前筛选条件，在左侧列表中选择一位候选人后，右侧会切换到完整档案工作区。" : "Keep the current filters, choose a candidate on the left, and the full workspace will open on the right.",
        batchHandleResults: isZh ? "批量处理当前结果" : "Batch Handle Results",
        batchHandleResultsDesc: isZh ? "可以先在左侧勾选需要处理的候选人，再执行批量初筛或批量发送简历。" : "Select candidates on the left first, then run batch screening or send resumes in batch.",
        zoomHintExpand: isZh ? "双击放大" : "Double-click to expand",
        zoomHintCollapse: isZh ? "双击缩小" : "Double-click to collapse",
        unrecorded: isZh ? "未记录" : "Unrecorded",
        interviewSchedules: isZh ? "面试安排" : "Interview Schedules",
        addSchedule: isZh ? "添加面试安排" : "Add Interview Schedule",
        scheduleRound: isZh ? "面试轮次" : "Round",
        roundNameDefault: isZh ? "初试" : "Round 1",
        scheduleInterviewer: isZh ? "面试官" : "Interviewer",
        scheduleTime: isZh ? "面试时间" : "Scheduled Time",
        scheduleDuration: isZh ? "时长（分钟）" : "Duration (min)",
        scheduleLocation: isZh ? "地点" : "Location",
        scheduleMeetingLink: isZh ? "会议链接" : "Meeting Link",
        scheduleNotes: isZh ? "备注" : "Notes",
        scheduleStatus: isZh ? "状态" : "Status",
        noSchedules: isZh ? "暂无面试安排" : "No interview schedules",
        noSchedulesDesc: isZh ? "点击上方按钮添加面试安排。" : "Click the button above to add an interview schedule.",
        deleteSchedule: isZh ? "删除" : "Delete",
        confirmDeleteSchedule: isZh ? "确认删除此面试安排？" : "Delete this interview schedule?",
        offers: isZh ? "Offer 管理" : "Offer Management",
        addOffer: isZh ? "创建 Offer" : "Create Offer",
        offerTitle: isZh ? "Offer 标题" : "Offer Title",
        offerSalary: isZh ? "薪资" : "Salary",
        offerDepartment: isZh ? "部门" : "Department",
        offerEntryDate: isZh ? "入职日期" : "Entry Date",
        offerContent: isZh ? "Offer 内容" : "Offer Content",
        offerNotes: isZh ? "备注" : "Notes",
        offerStatus: isZh ? "状态" : "Status",
        noOffers: isZh ? "暂无 Offer" : "No offers",
        noOffersDesc: isZh ? "点击上方按钮创建 Offer。" : "Click the button above to create an offer.",
        confirmDeleteOffer: isZh ? "确认删除此 Offer？" : "Delete this offer?",
        offerStatusDraft: isZh ? "草稿" : "Draft",
        offerStatusSent: isZh ? "已发送" : "Sent",
        offerStatusAccepted: isZh ? "已接受" : "Accepted",
        offerStatusRejected: isZh ? "已拒绝" : "Rejected",
        offerStatusCancelled: isZh ? "已撤回" : "Cancelled",
        followUps: isZh ? "跟进记录" : "Follow-ups",
        addFollowUp: isZh ? "添加跟进" : "Add Follow-up",
        followUpContent: isZh ? "跟进内容" : "Content",
        followUpContentPlaceholder: isZh ? "记录跟进内容..." : "Enter follow-up content...",
        followUpType: isZh ? "类型" : "Type",
        followUpTypeNote: isZh ? "备注" : "Note",
        followUpTypeCall: isZh ? "电话" : "Call",
        followUpTypeEmail: isZh ? "邮件" : "Email",
        followUpTypeInterview: isZh ? "面试" : "Interview",
        followUpTypeOther: isZh ? "其他" : "Other",
        noFollowUps: isZh ? "暂无跟进记录" : "No follow-up records",
        noFollowUpsDesc: isZh ? "添加跟进记录，记录与候选人的沟通和进展。" : "Add follow-up records to track communication and progress.",
        confirmDeleteFollowUp: isZh ? "确认删除此跟进记录？" : "Delete this follow-up record?",
        owner: isZh ? "负责人" : "Owner",
        ownerPlaceholder: isZh ? "负责人 ID 或姓名" : "Owner ID or name",
    };
}

function OutputSnippet({content}: { content: string }) {
    const {language} = useI18n();
    const tr = React.useMemo(() => getCandidatesLocale(language), [language]);
    const [expanded, setExpanded] = React.useState(false);
    const lines = React.useMemo(() => content.split("\n"), [content]);
    const preview = React.useMemo(() => lines.slice(0, 3).join("\n"), [lines]);
    const hasMore = lines.length > 3;

    return (
        <div className="mt-3 min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
            <pre className="min-w-0 whitespace-pre-wrap break-all text-xs leading-6 text-slate-600 dark:text-slate-300">
                {expanded ? content : preview}
            </pre>
            {hasMore ? (
                <button
                    type="button"
                    className="mt-2 text-xs text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
                    onClick={() => setExpanded((current) => !current)}
                >
                    {expanded ? tr.collapse : tr.expandAll(lines.length)}
                </button>
            ) : null}
        </div>
    );
}

function parseInterviewQuestionMetrics(htmlContent: string) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const questionCards = Array.from(doc.querySelectorAll(".qcard"));
    const moduleTitles = questionCards
        .map((card) => (
            card.querySelector(".qcard-heading h2")?.textContent?.trim()
            || card.querySelector("h2")?.textContent?.trim()
            || ""
        ))
        .filter(Boolean);
    const fallbackTitles = moduleTitles.length
        ? moduleTitles
        : Array.from(doc.querySelectorAll("section h2"))
            .map((heading) => heading.textContent?.trim() || "")
            .filter(Boolean);

    return {
        modules: fallbackTitles,
        questionCount: questionCards.length || fallbackTitles.length || null,
    };
}

function InterviewQuestionCard({
    question,
    onDownload,
    onPreview,
}: {
    question: CandidateInterviewQuestion;
    onDownload: () => void;
    onPreview: () => void;
}) {
    const {language} = useI18n();
    const tr = React.useMemo(() => getCandidatesLocale(language), [language]);
    const {modules, questionCount} = React.useMemo(
        () => question.html_content
            ? parseInterviewQuestionMetrics(question.html_content)
            : {modules: [], questionCount: null as number | null},
        [question.html_content],
    );

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/85 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3 dark:border-slate-800">
                <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{question.round_name}</p>
                    {question.created_at ? (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {tr.generatedAt(question.created_at)}
                        </p>
                    ) : null}
                </div>
                <Badge className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                    {tr.generated}
                </Badge>
            </div>

            <div className="grid grid-cols-2 gap-px border-b border-slate-200/80 bg-slate-200/80 dark:border-slate-800 dark:bg-slate-800">
                <div className="bg-white px-4 py-2.5 dark:bg-slate-950">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{tr.moduleCount}</p>
                    <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {modules.length > 0 ? `${modules.length}${tr.modulesSuffix}` : tr.parsing}
                    </p>
                </div>
                <div className="bg-white px-4 py-2.5 dark:bg-slate-950">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{tr.estimatedQuestions}</p>
                    <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {questionCount != null ? `${questionCount}${tr.questionSuffix}` : "-"}
                    </p>
                </div>
            </div>

            {modules.length > 0 ? (
                <div className="space-y-1.5 border-b border-slate-200/80 px-4 py-3 dark:border-slate-800">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{tr.moduleOutline}</p>
                    {modules.slice(0, 5).map((moduleName, index) => (
                        <div key={`${moduleName}-${index}`} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500 dark:bg-slate-800">
                                {index + 1}
                            </span>
                            <span className="truncate">{moduleName}</span>
                        </div>
                    ))}
                    {modules.length > 5 ? (
                        <p className="text-xs text-slate-400 dark:text-slate-500">{tr.extraModules(modules.length - 5)}</p>
                    ) : null}
                </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                <Button size="sm" onClick={onDownload}>
                    <Download className="h-4 w-4"/>
                    {tr.downloadHtml}
                </Button>
                <Button size="sm" variant="outline" onClick={onPreview}>
                    <ExternalLink className="h-4 w-4"/>
                    {tr.standalonePreview}
                </Button>
            </div>
        </div>
    );
}

function buildCandidateScoreFallbackMarkdown(score?: CandidateDetail["score"] | null, tr?: ReturnType<typeof getCandidatesLocale>) {
    const localTr = tr ?? getCandidatesLocale();
    if (!score) {
        return localTr.noAiScoreOutput;
    }
    const displayValues = resolveScoreDisplayValues(score as Record<string, unknown>);
    const recommendation = readScoreText(score.recommendation) || "-";
    const suggestedStatus = readSuggestedStatus(score.suggested_status);
    const advantages = readScoreTextArray(score.advantages);
    const concerns = readScoreTextArray(score.concerns);
    const dimensionLines = readScoreDimensions((score as Record<string, unknown>).dimensions)
        .map((d) => buildDimensionMarkdownLine(d, localTr))
        .filter(Boolean);
    const sections = [
        localTr.aiScreeningResultHeading,
        localTr.totalScoreLine(displayValues.totalScore !== null ? formatScoreValue(displayValues.totalScore, displayValues.totalScoreScale) : "-"),
        localTr.matchLine(displayValues.matchPercent !== null ? formatPercent(displayValues.matchPercent) : "-"),
        localTr.suggestedStatusLine(labelForCandidateStatus(suggestedStatus) || "-"),
        "",
        localTr.aiRecommendationHeading,
        recommendation,
        "",
        ...(dimensionLines.length > 0
            ? [
                localTr.dimensionScoresHeading,
                ...dimensionLines,
                "",
            ]
            : []),
        localTr.advantagesHeading,
        ...(advantages.length > 0 ? advantages.map((item, index) => `${index + 1}. ${item}`) : ["-"]),
        "",
        localTr.concernsHeading,
        ...(concerns.length > 0 ? concerns.map((item, index) => `${index + 1}. ${item}`) : ["-"]),
    ];
    return sections.join("\n");
}

function toScoreRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

function toScoreNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        const numeric = Number(trimmed.replace(/%$/, ""));
        return Number.isFinite(numeric) ? numeric : null;
    }
    return null;
}

function readScoreNumberStrict(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }
    return value;
}

function readScoreText(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
}

function readScoreTextArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
}

function readSuggestedStatus(value: unknown): string {
    const normalized = readScoreText(value);
    if (!normalized || !SCORE_SUGGESTED_STATUS_VALUES.has(normalized)) {
        return "";
    }
    return normalized;
}

function readScoreDimensions(value: unknown): CandidateScoreDimension[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as CandidateScoreDimension[];
}

function readDimensionEvidenceList(value: unknown): string[] {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed ? [trimmed] : [];
    }
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
}

function readDimensionEvidence(value: unknown): string | null {
    const items = readDimensionEvidenceList(value);
    return items.length ? items.join(" / ") : null;
}

function extractScreeningTaskStage(log?: AITaskLog | null): string {
    const parsed = parseStructuredLogOutput(log?.output_snapshot);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const payload = parsed as Record<string, unknown>;
        const directStage = typeof payload.stage === "string" ? payload.stage.trim() : "";
        if (directStage) {
            return directStage;
        }
        const meta = payload.meta;
        if (meta && typeof meta === "object" && !Array.isArray(meta)) {
            const metaStage = typeof (meta as Record<string, unknown>).stage === "string"
                ? String((meta as Record<string, unknown>).stage).trim()
                : "";
            if (metaStage) {
                return metaStage;
            }
        }
    }
    switch (log?.status) {
        case "queued":
        case "pending":
            return "queued";
        case "running":
            return "scoring";
        case "success":
        case "fallback":
            return "completed";
        case "cancelled":
            return "cancelled";
        default:
            return log?.status ? "failed" : "";
    }
}

function buildDimensionMarkdownLine(item: CandidateScoreDimension, tr?: ReturnType<typeof getCandidatesLocale>) {
    const localTr = tr ?? getCandidatesLocale();
    const label = readScoreText(item.label) || readScoreText(item.key) || "";
    if (!label) {
        return "";
    }
    const reason = readScoreText(item.reason) || "";
    const evidence = readDimensionEvidence(item.evidence);
    const extra = [reason, evidence ? `${localTr.evidenceLabel}: ${evidence}` : ""].filter(Boolean).join(localTr.delimiter);
    const scoreValue = readScoreNumberStrict(item.score);
    const maxScore = readScoreNumberStrict(item.max_score);
    return `- ${label}：${scoreValue !== null ? scoreValue : "-"} / ${maxScore !== null ? maxScore : "-"}${extra ? ` — ${extra}` : ""}`;
}

function resolveScoreDisplayValues(scoreLike?: Record<string, unknown> | null) {
    return {
        totalScore: readScoreNumberStrict(scoreLike?.total_score),
        matchPercent: readScoreNumberStrict(scoreLike?.match_percent),
        totalScoreScale: typeof scoreLike?.total_score_scale === "number" ? scoreLike.total_score_scale : null,
    };
}

function deriveScoreDecisionValues(scoreLike?: Record<string, unknown> | null) {
    return {
        recommendation: readScoreText(scoreLike?.recommendation) || "",
        suggestedStatus: readSuggestedStatus(scoreLike?.suggested_status),
    };
}

function resolveCandidateSummaryMatchPercent(candidate?: CandidateSummary | null) {
    if (!candidate) {
        return null;
    }
    return toScoreNumber(candidate.match_percent);
}

function buildStructuredAiOutputMarkdown(payload: Record<string, unknown>, tr?: ReturnType<typeof getCandidatesLocale>) {
    const localTr = tr ?? getCandidatesLocale();
    const displayValues = resolveScoreDisplayValues(payload);
    const decisionValues = deriveScoreDecisionValues(payload);
    const recommendation = decisionValues.recommendation;
    const suggestedStatus = decisionValues.suggestedStatus;
    const advantages = readScoreTextArray(payload.advantages);
    const concerns = readScoreTextArray(payload.concerns);
    const dimensionLines = readScoreDimensions(payload.dimensions)
        .map((d) => buildDimensionMarkdownLine(d, localTr))
        .filter(Boolean);

    return [
        localTr.aiScreeningResultHeading,
        localTr.totalScoreLine(displayValues.totalScore !== null ? formatScoreValue(displayValues.totalScore, displayValues.totalScoreScale) : "-"),
        localTr.matchLine(displayValues.matchPercent !== null ? `${displayValues.matchPercent}%` : "-"),
        localTr.suggestedStatusLine(labelForCandidateStatus(suggestedStatus) || "-"),
        "",
        localTr.aiRecommendationHeading,
        recommendation || "-",
        "",
        ...(dimensionLines.length > 0 ? [localTr.dimensionScoresHeading, ...dimensionLines, ""] : []),
        localTr.advantagesHeading,
        ...(advantages.length > 0 ? advantages.map((item, index) => `${index + 1}. ${item}`) : ["-"]),
        "",
        localTr.concernsHeading,
        ...(concerns.length > 0 ? concerns.map((item, index) => `${index + 1}. ${item}`) : ["-"]),
    ].join("\n");
}

function resolveCandidateAiOutputPayload(
    log?: AITaskLog | null,
    score?: CandidateDetail["score"] | null,
    tr?: ReturnType<typeof getCandidatesLocale>,
) {
    const parsed = parseStructuredLogOutput(log?.output_snapshot);
    let markdown = "";
    let raw = "";
    const scoreRecord = score && typeof score === "object" ? score as Record<string, unknown> : null;

    if (score) {
        markdown = buildCandidateScoreFallbackMarkdown(score, tr);
    }

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const payload = parsed as Record<string, unknown>;
        const scorePayload = toScoreRecord(payload.score)
            || (
                "total_score" in payload
                || "match_percent" in payload
                || "advantages" in payload
                || "concerns" in payload
                || "dimensions" in payload
                    ? payload
                    : null
            );
        if (!markdown && scorePayload) {
            markdown = buildStructuredAiOutputMarkdown(scorePayload, tr);
        }
        raw = formatStructuredValue(parsed, log?.output_summary || "");
    } else if (typeof parsed === "string" && parsed.trim()) {
        if (!markdown) {
            markdown = parsed.trim();
        }
        raw = parsed.trim();
    }

    if (!markdown) {
        markdown = buildCandidateScoreFallbackMarkdown(score, tr);
    }
    if (!raw) {
        raw = formatStructuredValue(parsed ?? scoreRecord ?? log?.output_snapshot, log?.output_summary || markdown);
    }

    return {markdown, raw};
}

function CandidateAiOutputDialog({
    open,
    onOpenChange,
    markdown,
    raw,
    modelLabel,
    generatedAt,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    markdown: string;
    raw?: string | null;
    modelLabel?: string | null;
    generatedAt?: string | null;
}) {
    const {language} = useI18n();
    const tr = React.useMemo(() => getCandidatesLocale(language), [language]);
    const [copied, setCopied] = React.useState(false);

    React.useEffect(() => {
        if (!open) {
            setCopied(false);
        }
    }, [open]);

    const copyContent = React.useCallback(async () => {
        const content = (markdown || raw || "").trim();
        if (!content) {
            return;
        }
        try {
            // 优先使用 Clipboard API（需要HTTPS或localhost）
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(content);
            } else {
                // Fallback：使用临时 textarea（兼容HTTP环境）
                const textarea = document.createElement("textarea");
                textarea.value = content;
                textarea.style.position = "fixed";
                textarea.style.left = "-9999px";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
            }
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch (err) {
            console.error("[CandidatesPage] copyContent failed:", err);
            setCopied(false);
        }
    }, [markdown, raw]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[min(88vh,900px)] max-h-[88vh] flex-col overflow-hidden sm:max-w-5xl">
                <DialogHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <DialogTitle>{tr.fullAiOutput}</DialogTitle>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                                {modelLabel ? <span>{tr.modelLabel}: {modelLabel}</span> : null}
                                {generatedAt ? <span>{tr.timeLabel}: {formatLongDateTime(generatedAt)}</span> : null}
                            </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => void copyContent()} disabled={!(markdown || raw)?.trim()}>
                            {copied ? <Check className="h-4 w-4"/> : <Copy className="h-4 w-4"/>}
                            {copied ? tr.copied : tr.copyAll}
                        </Button>
                    </div>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                    <div className="space-y-4 px-1 pb-2">
                        <div className="rounded-[22px] border border-slate-200/80 bg-white/90 px-5 py-5 dark:border-slate-800 dark:bg-slate-950/70">
                            <div className="prose prose-slate max-w-none text-sm leading-7 dark:prose-invert prose-headings:mb-3 prose-headings:mt-5 prose-headings:font-semibold prose-p:my-3 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-pre:rounded-2xl prose-pre:border prose-pre:border-slate-200/80 prose-pre:bg-slate-950 prose-pre:p-4 dark:prose-pre:border-slate-800">
                                <ReactMarkdown>{markdown}</ReactMarkdown>
                            </div>
                        </div>
                        {raw && raw.trim() && raw.trim() !== markdown.trim() ? (
                            <details className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <summary className="cursor-pointer text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {tr.viewStructuredRaw}
                                </summary>
                                <pre className="mt-4 whitespace-pre-wrap break-all rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-4 text-xs leading-6 text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                                    {raw}
                                </pre>
                            </details>
                        ) : null}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

type MultiSelectProps = {
    options: { value: string; label: string }[];
    selected: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
    selectedLabel?: (count: number) => string;
};

function MultiSelect({ options, selected, onChange, placeholder, selectedLabel }: MultiSelectProps) {
    const {language} = useI18n();
    const isZh = language !== "en-US";
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const openRef = useRef(open);
    openRef.current = open;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!openRef.current) return;
            const target = e.target as Node;
            if (triggerRef.current?.contains(target)) return;
            if (menuRef.current?.contains(target)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleOpen = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setMenuStyle({
                position: 'fixed',
                top: rect.bottom + 4,
                left: rect.left,
                width: Math.max(rect.width, 188),
                zIndex: 99999,
            });
        }
        setOpen(true);
    };

    const toggleValue = (value: string) => {
        if (selected.includes(value)) {
            onChange(selected.filter((v) => v !== value));
        } else {
            onChange([...selected, value]);
        }
    };

    const displayText = selected.length === 0
        ? (placeholder || "")
        : selected.length === 1
            ? options.find((o) => o.value === selected[0])?.label || selected[0]
            : (selectedLabel ? selectedLabel(selected.length) : `${selected.length} selected`);

    const menuContent = open && (
        <div
            ref={menuRef}
            style={menuStyle}
            onMouseDown={(e) => e.stopPropagation()}
            className="overflow-hidden rounded-md border border-slate-200 bg-white text-xs shadow-lg dark:border-slate-800 dark:bg-slate-950"
        >
            <div className="max-h-64 overflow-y-auto py-1">
                {options.map((option) => (
                    <label
                        key={option.value}
                        className={cn(
                            "flex cursor-pointer items-center gap-2 overflow-hidden px-3 py-2 text-slate-700 transition dark:text-slate-300",
                            selected.includes(option.value) ? "bg-slate-50 dark:bg-slate-900" : "hover:bg-slate-50 dark:hover:bg-slate-900"
                        )}
                    >
                        <input
                            type="checkbox"
                            checked={selected.includes(option.value)}
                            onChange={() => toggleValue(option.value)}
                            className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-[#171717] focus:ring-[#171717]"
                        />
                        <span className="block min-w-0 flex-1 truncate" title={option.label}>
                            {option.label}
                        </span>
                    </label>
                ))}
            </div>
            <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
                <button
                    type="button"
                    className="rounded-md bg-[#171717] px-4 py-1.5 text-xs font-medium text-white transition hover:bg-[#262626]"
                    onClick={() => setOpen(false)}
                >
                    {isZh ? "确定" : "OK"}
                </button>
            </div>
        </div>
    );

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={handleOpen}
                title={displayText}
                className="flex h-8 min-w-[116px] max-w-[220px] items-center justify-between gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
            >
                <span className={cn(
                    "block w-full truncate",
                    selected.length === 0 ? "text-slate-500" : "text-slate-900 dark:text-slate-100"
                )}>
                    {displayText}
                </span>
                <ChevronDown className={cn("h-4 w-4 text-slate-400 shrink-0", open && "rotate-180")} />
            </button>
            {open && ReactDOM.createPortal(menuContent, document.body)}
        </>
    );
}

function CandidateFilterBar({
    candidateFilterSummary,
    candidateViewMode,
    setCandidateViewMode,
    candidateQuery,
    setCandidateQuery,
    candidatePositionFilter,
    setCandidatePositionFilter,
    candidateStatusFilter,
    setCandidateStatusFilter,
    candidateMatchFilter,
    setCandidateMatchFilter,
    candidateSourceFilter,
    setCandidateSourceFilter,
    candidateTimeFilter,
    setCandidateTimeFilter,
    positions,
    sourceOptions,
    visibleCandidateCount,
    onCollapse,
}: {
    candidateFilterSummary: string;
    candidateViewMode: CandidateViewMode;
    setCandidateViewMode: React.Dispatch<React.SetStateAction<CandidateViewMode>>;
    candidateQuery: string;
    setCandidateQuery: (value: string) => void;
    candidatePositionFilter: string[];
    setCandidatePositionFilter: React.Dispatch<React.SetStateAction<string[]>>;
    candidateStatusFilter: string[];
    setCandidateStatusFilter: React.Dispatch<React.SetStateAction<string[]>>;
    candidateMatchFilter: string;
    setCandidateMatchFilter: React.Dispatch<React.SetStateAction<string>>;
    candidateSourceFilter: string[];
    setCandidateSourceFilter: React.Dispatch<React.SetStateAction<string[]>>;
    candidateTimeFilter: string;
    setCandidateTimeFilter: React.Dispatch<React.SetStateAction<string>>;
    positions: PositionSummary[];
    sourceOptions: string[];
    visibleCandidateCount: number;
    onCollapse: () => void;
}) {
    const {language} = useI18n();
    const tr = React.useMemo(() => getCandidatesLocale(language), [language]);
    const isZh = language !== "en-US";
    const summaryChips = React.useMemo(() => (
        candidateFilterSummary
            .split("·")
            .map((item) => item.trim())
            .filter(Boolean)
    ), [candidateFilterSummary]);

    const hasActiveFilters = React.useMemo(() => (
        candidateQuery.trim().length > 0
        || candidatePositionFilter.length > 0
        || candidateStatusFilter.length > 0
        || candidateMatchFilter !== "all"
        || candidateSourceFilter.length > 0
        || candidateTimeFilter !== "all"
    ), [
        candidateMatchFilter,
        candidatePositionFilter,
        candidateQuery,
        candidateSourceFilter,
        candidateStatusFilter,
        candidateTimeFilter,
    ]);

    const resetFilters = React.useCallback(() => {
        setCandidateQuery("");
        setCandidatePositionFilter([]);
        setCandidateStatusFilter([]);
        setCandidateMatchFilter("all");
        setCandidateSourceFilter([]);
        setCandidateTimeFilter("all");
    }, [
        setCandidateMatchFilter,
        setCandidatePositionFilter,
        setCandidateQuery,
        setCandidateSourceFilter,
        setCandidateStatusFilter,
        setCandidateTimeFilter,
    ]);

    const filterSelectClassName = "h-8 min-w-[116px] rounded-md border-slate-200 bg-white px-2.5 py-1 pr-7 text-xs text-slate-600 shadow-none focus-visible:ring-1 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300";

    return (
        <Card className={cn(defaultPanelClass, "gap-0 rounded-md py-0 shadow-none")}>
            <CardContent className="px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <NativeSelect
                            value={candidateMatchFilter}
                            onChange={(event) => setCandidateMatchFilter(event.target.value)}
                            className={cn(filterSelectClassName, "w-[132px]")}
                        >
                            <option value="all">{tr.allMatchPercent}</option>
                            <option value="80+">{tr.above80}</option>
                            <option value="60+">{tr.above60}</option>
                            <option value="40+">{tr.above40}</option>
                        </NativeSelect>
                        <MultiSelect
                            options={positions.map((position) => ({value: String(position.id), label: position.title}))}
                            selected={candidatePositionFilter}
                            onChange={setCandidatePositionFilter}
                            placeholder={tr.allPositions}
                            selectedLabel={tr.selectedLabel}
                        />
                        <MultiSelect
                            options={Object.entries(candidateStatusLabels).map(([value, label]) => ({value, label}))}
                            selected={candidateStatusFilter}
                            onChange={setCandidateStatusFilter}
                            placeholder={isZh ? "全部筛选结果" : "All Results"}
                            selectedLabel={tr.selectedLabel}
                        />
                        <MultiSelect
                            options={sourceOptions.map((s) => ({ value: s, label: s }))}
                            selected={candidateSourceFilter}
                            onChange={setCandidateSourceFilter}
                            placeholder={isZh ? "最后投递渠道" : "Last Channel"}
                            selectedLabel={tr.selectedLabel}
                        />
                        <NativeSelect
                            value={candidateTimeFilter}
                            onChange={(event) => setCandidateTimeFilter(event.target.value)}
                            className={cn(filterSelectClassName, "w-[120px]")}
                        >
                            <option value="all">{tr.allTime}</option>
                            <option value="today">{tr.today}</option>
                            <option value="7d">{tr.last7Days}</option>
                            <option value="30d">{tr.last30Days}</option>
                        </NativeSelect>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-[#171717] hover:bg-[#F5F5F5] hover:text-[#171717] disabled:text-slate-300 dark:hover:bg-neutral-900/30"
                            onClick={resetFilters}
                            disabled={!hasActiveFilters}
                        >
                            {isZh ? "清空筛选" : "Clear"}
                        </Button>
                        <span className="text-xs text-slate-400">{tr.matchedCandidates(visibleCandidateCount)}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                        <SearchField
                            value={candidateQuery}
                            onChange={setCandidateQuery}
                            placeholder={tr.searchPlaceholder}
                            inputClassName="h-8 w-[280px] rounded-md border-slate-200 bg-white text-xs shadow-none placeholder:text-slate-400 dark:border-slate-800 dark:bg-slate-950"
                        />
                        <div className="flex h-8 items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-900">
                            <Button size="sm" variant={candidateViewMode === "list" ? "default" : "ghost"} className="h-7 rounded px-2 text-xs" onClick={() => setCandidateViewMode("list")}>
                                <List className="h-3.5 w-3.5"/>
                            </Button>
                            <Button size="sm" variant={candidateViewMode === "board" ? "default" : "ghost"} className="h-7 rounded px-2 text-xs" onClick={() => setCandidateViewMode("board")}>
                                <LayoutGrid className="h-3.5 w-3.5"/>
                            </Button>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onCollapse}
                            className="h-8 rounded-md px-2.5 text-xs"
                            title={tr.collapseFilters}
                        >
                            <ChevronUp className="h-3.5 w-3.5"/>
                            {tr.collapseFilters}
                        </Button>
                    </div>
                </div>
                {hasActiveFilters ? (
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        {summaryChips.map((chip) => (
                            <span key={chip} className="inline-flex max-w-[220px] items-center rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-900">
                                <span className="truncate">{chip}</span>
                            </span>
                        ))}
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}

type CandidatesPageProps = {
    panelClass?: string;
    candidateFilterSummary: string;
    candidateViewMode: CandidateViewMode;
    setCandidateViewMode: React.Dispatch<React.SetStateAction<CandidateViewMode>>;
    candidateQuery: string;
    setCandidateQuery: (value: string) => void;
    candidatePositionFilter: string[];
    setCandidatePositionFilter: React.Dispatch<React.SetStateAction<string[]>>;
    candidateStatusFilter: string[];
    setCandidateStatusFilter: React.Dispatch<React.SetStateAction<string[]>>;
    candidateMatchFilter: string;
    setCandidateMatchFilter: React.Dispatch<React.SetStateAction<string>>;
    candidateSourceFilter: string[];
    setCandidateSourceFilter: React.Dispatch<React.SetStateAction<string[]>>;
    candidateTimeFilter: string;
    setCandidateTimeFilter: React.Dispatch<React.SetStateAction<string>>;
    positions: PositionSummary[];
    sourceOptions: string[];
    visibleCandidates: CandidateSummary[];
    selectedCandidateIds: number[];
    setSelectedCandidateIds: React.Dispatch<React.SetStateAction<number[]>>;
    triggerScreening: (candidateIds?: number[]) => Promise<void>;
    triggerFreshScreening: (candidateIds?: number[]) => Promise<void>;
    isBatchScreeningCancelling: boolean;
    screeningSubmitting: boolean;
    isBatchScreeningRunning: boolean;
    openResumeMailDialog: (candidateIds?: number[]) => void;
    candidatesLoading: boolean;
    candidatesInitialLoaded: boolean;
    candidateListTransitionLoading: boolean;
    candidateMatchSortLoading: boolean;
    allCandidatesCount: number;
    allPositionCandidateCount: number;
    candidateTotal: number;
    candidatePageIndex: number;
    candidatePageSize: number;
    candidatePageSizeOptions: number[];
    candidatePipelineStatusCounts?: Record<string, number>;
    candidatePipelineTotal?: number;
    setCandidatePageIndex: (pageIndex: number) => void;
    setCandidatePageSize: (pageSize: number) => void;
    candidateListScrollRef: (node: HTMLDivElement | null) => void;
    candidateListHorizontalRailRef: (node: HTMLDivElement | null) => void;
    renderCandidateListHeaderCell: (key: CandidateListColumnKey, label: string) => React.ReactNode;
    selectedCandidateId: number | null;
    setSelectedCandidateId: React.Dispatch<React.SetStateAction<number | null>>;
    toggleCandidateSelection: (candidateId: number, nextChecked?: boolean) => void;
    candidateListDisplayColumnWidths: CandidateListDisplayColumnWidths;
    showOrganizationColumn: boolean;
    getOrganizationLabel: (orgCode?: string | null) => string;
    getCandidateResumeMailSummary: (candidateId: number) => string | null;
    groupedCandidates: CandidateBoardGroup[];
    candidateDetailLoading: boolean;
    candidateDetail: CandidateDetail | null;
    departmentReviews: DepartmentReviewBatch[];
    createDepartmentReview?: (payload: {
        candidate_id: number;
        reviewers: Array<{user_code: string; name?: string}>;
        visible_sections?: string[];
        cc_user_codes?: string[];
        message?: string;
        due_at?: string | null;
        replace_existing?: boolean;
    }) => Promise<unknown>;
    departmentReviewDecisionContext?: {
        candidateId: number;
        assignmentId: number;
        status: string;
        comment?: string | null;
        reviewerName?: string | null;
    } | null;
    submitDepartmentReviewDecision?: (assignmentId: number, status: "passed" | "rejected", comment: string) => Promise<void>;
    isSelectedCandidateScreeningCancelling: boolean;
    selectedCandidateScreeningTaskId: number | null;
    openResumeFile: (file: ResumeFile, download?: boolean) => Promise<void>;
    requestDeleteResumeFile: (file: ResumeFile) => void;
    requestDeleteCandidate: (candidate: CandidateSummary) => void;
    generateInterviewQuestions: () => Promise<void>;
    isCurrentInterviewTaskCancelling: boolean;
    currentCandidateInterviewTaskId: number | null;
    candidateEditor: CandidateEditorState;
    setCandidateEditor: React.Dispatch<React.SetStateAction<CandidateEditorState>>;
    saveCandidate: () => Promise<void>;
    candidateSaving: boolean;
    exporting: boolean;
    effectiveScreeningSkillSourceLabel: string;
    effectiveScreeningSkillIds: number[];
    skillMap: Map<number, RecruitmentSkill>;
    pendingStatus: string | null;
    setPendingStatus: React.Dispatch<React.SetStateAction<string | null>>;
    updateCandidateStatus: (nextStatus: string) => Promise<void>;
    statusUpdateReason: string;
    setStatusUpdateReason: React.Dispatch<React.SetStateAction<string>>;
    candidateAssistantActivity: AITaskLog[];
    preferredInterviewSkillSourceLabel: string;
    effectiveInterviewSkillSourceLabel: string;
    openAssistantMode: (mode: AssistantDisplayMode) => void;
    candidateProcessActivity: AITaskLog[];
    candidateProcessLogsExpanded: boolean;
    setCandidateProcessLogsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    openTaskLogDetail: (logId?: number | null) => void;
    interviewRoundName: string;
    setInterviewRoundName: React.Dispatch<React.SetStateAction<string>>;
    effectiveInterviewSkillIds: number[];
    interviewCustomRequirements: string;
    setInterviewCustomRequirements: React.Dispatch<React.SetStateAction<string>>;
    interviewSkillSelectionDirty: boolean;
    setSelectedInterviewSkillIds: React.Dispatch<React.SetStateAction<number[]>>;
    setInterviewSkillSelectionDirty: React.Dispatch<React.SetStateAction<boolean>>;
    skills: RecruitmentSkill[];
    toggleInterviewSkillSelection: (skillId: number) => void;
    downloadInterviewQuestion: (questionId: number) => Promise<void>;
    exportCandidates: (candidateIds: number[], options?: { includeResumes?: boolean; fields?: string[] }) => Promise<void>;
    requestBatchDelete: (candidateIds: number[]) => void;
    batchBindPosition: (candidateIds: number[], positionId: number | null) => Promise<void>;
    onMoveToTalentPool?: (candidateIds: number[]) => Promise<void>;
    onRefresh?: () => Promise<void>;
    onRefreshCandidateDetail?: (candidateId: number) => Promise<void>;
    autoOpenInterviewScheduleCandidateId?: number | null;
    onAutoOpenInterviewScheduleHandled?: (candidateId: number) => void;
    batchUpdateStatus: (candidateIds: number[], status: string, reason: string) => Promise<void>;
    duplicateCandidates: Array<{id: number; candidate_code: string; name: string; phone: string | null; email: string | null; status: string}>;
    interviewSchedules: InterviewSchedule[];
    createInterviewSchedule: (payload: {candidate_id: number; round_name?: string; round_index?: number; interviewer_user_code?: string; interviewer_name?: string; scheduled_at?: string; duration_minutes?: number; location?: string; meeting_link?: string; notes?: string; availability_slot_id?: number; department_review_assignment_id?: number}) => Promise<unknown>;
    deleteInterviewSchedule: (scheduleId: number) => Promise<void>;
    offers: Array<{id: number; candidate_id: number; offer_title?: string | null; salary?: string | null; department?: string | null; entry_date?: string | null; offer_content?: string | null; notes?: string | null; status: string; created_at?: string | null}>;
    createOffer: (payload: {candidate_id: number; offer_title?: string; salary?: string; department?: string; entry_date?: string; offer_content?: string; notes?: string}) => Promise<unknown>;
    updateOffer: (offerId: number, payload: Record<string, unknown>) => Promise<unknown>;
    deleteOffer: (offerId: number) => Promise<void>;
    followUps: Array<{id: number; candidate_id: number; content: string; follow_up_type: string; created_by?: string | null; created_at?: string | null}>;
    createFollowUp: (candidateId: number, content: string, followUpType?: string) => Promise<unknown>;
    deleteFollowUp: (followUpId: number) => Promise<void>;
};

export function CandidatesPage({
    panelClass = defaultPanelClass,
    candidateFilterSummary,
    candidateViewMode,
    setCandidateViewMode,
    candidateQuery,
    setCandidateQuery,
    candidatePositionFilter,
    setCandidatePositionFilter,
    candidateStatusFilter,
    setCandidateStatusFilter,
    candidateMatchFilter,
    setCandidateMatchFilter,
    candidateSourceFilter,
    setCandidateSourceFilter,
    candidateTimeFilter,
    setCandidateTimeFilter,
    positions,
    sourceOptions,
    visibleCandidates,
    selectedCandidateIds,
    setSelectedCandidateIds,
    triggerScreening,
    triggerFreshScreening,
    isBatchScreeningCancelling,
    screeningSubmitting,
    isBatchScreeningRunning,
    openResumeMailDialog,
    candidatesLoading,
    candidatesInitialLoaded,
    candidateListTransitionLoading,
    candidateMatchSortLoading,
    allCandidatesCount,
    allPositionCandidateCount,
    candidateTotal,
    candidatePageIndex,
    candidatePageSize,
    candidatePageSizeOptions,
    candidatePipelineStatusCounts,
    candidatePipelineTotal,
    setCandidatePageIndex,
    setCandidatePageSize,
    candidateListScrollRef,
    candidateListHorizontalRailRef,
    renderCandidateListHeaderCell,
    selectedCandidateId,
    setSelectedCandidateId,
    toggleCandidateSelection,
    candidateListDisplayColumnWidths,
    showOrganizationColumn,
    getOrganizationLabel,
    getCandidateResumeMailSummary,
    groupedCandidates,
    candidateDetailLoading,
    candidateDetail,
    departmentReviews,
    createDepartmentReview,
    departmentReviewDecisionContext,
    submitDepartmentReviewDecision,
    isSelectedCandidateScreeningCancelling,
    selectedCandidateScreeningTaskId,
    openResumeFile,
    requestDeleteResumeFile,
    requestDeleteCandidate,
    generateInterviewQuestions,
    isCurrentInterviewTaskCancelling,
    currentCandidateInterviewTaskId,
    candidateEditor,
    setCandidateEditor,
    saveCandidate,
    candidateSaving,
    exporting,
    effectiveScreeningSkillSourceLabel,
    effectiveScreeningSkillIds,
    skillMap,
    pendingStatus,
    setPendingStatus,
    updateCandidateStatus,
    statusUpdateReason,
    setStatusUpdateReason,
    candidateAssistantActivity,
    preferredInterviewSkillSourceLabel,
    effectiveInterviewSkillSourceLabel,
    openAssistantMode,
    candidateProcessActivity,
    candidateProcessLogsExpanded,
    setCandidateProcessLogsExpanded,
    openTaskLogDetail,
    interviewRoundName,
    setInterviewRoundName,
    effectiveInterviewSkillIds,
    interviewCustomRequirements,
    setInterviewCustomRequirements,
    interviewSkillSelectionDirty,
    setSelectedInterviewSkillIds,
    setInterviewSkillSelectionDirty,
    skills,
    toggleInterviewSkillSelection,
    downloadInterviewQuestion,
    exportCandidates,
    requestBatchDelete,
    batchBindPosition,
    onMoveToTalentPool,
    onRefresh,
    onRefreshCandidateDetail,
    autoOpenInterviewScheduleCandidateId,
    onAutoOpenInterviewScheduleHandled,
    batchUpdateStatus,
    duplicateCandidates,
    interviewSchedules,
    createInterviewSchedule,
    deleteInterviewSchedule,
    offers,
    createOffer,
    updateOffer,
    deleteOffer,
    followUps,
    createFollowUp,
    deleteFollowUp,
}: CandidatesPageProps) {
    const {language} = useI18n();
    const isZh = language !== "en-US";
    const tr = React.useMemo(() => getCandidatesLocale(language), [language]);
    const activeQuickPosition = candidatePositionFilter[0] || "";
    const exportFieldOptions = React.useMemo(() => ([
        { key: "name", label: isZh ? "姓名" : "Name", defaultChecked: true },
        { key: "phone", label: isZh ? "手机号" : "Phone", defaultChecked: true },
        { key: "email", label: isZh ? "邮箱" : "Email", defaultChecked: true },
        { key: "position_title", label: isZh ? "应聘岗位" : "Applied Position", defaultChecked: true },
        { key: "source", label: isZh ? "简历来源" : "Resume Source", defaultChecked: true },
        { key: "current_status", label: isZh ? "当前状态" : "Current Status", defaultChecked: true },
        { key: "screening_score", label: isZh ? "初筛得分" : "Screening Score", defaultChecked: true },
        { key: "uploaded_at", label: isZh ? "上传时间" : "Uploaded At", defaultChecked: true },
        { key: "education", label: isZh ? "学历" : "Education", defaultChecked: false },
        { key: "graduation_school", label: isZh ? "毕业院校" : "Graduation School", defaultChecked: false },
        { key: "major", label: isZh ? "专业" : "Major", defaultChecked: false },
        { key: "work_years", label: isZh ? "工作年限" : "Work Years", defaultChecked: false },
        { key: "expected_salary", label: isZh ? "期望薪资" : "Expected Salary", defaultChecked: false },
        { key: "current_city", label: isZh ? "所在城市" : "Current City", defaultChecked: false },
        { key: "expected_city", label: isZh ? "期望城市" : "Expected City", defaultChecked: false },
        { key: "ai_recommended_position", label: isZh ? "AI推荐岗位" : "AI Recommended Position", defaultChecked: false },
        { key: "screening_conclusion", label: isZh ? "初筛结论" : "Screening Conclusion", defaultChecked: false },
        { key: "screening_dimension_scores", label: isZh ? "初筛维度得分" : "Screening Dimension Scores", defaultChecked: false },
        { key: "audit_operator", label: isZh ? "审计操作人" : "Audit Operator", defaultChecked: false },
        { key: "last_updated_at", label: isZh ? "最后更新时间" : "Last Updated At", defaultChecked: false },
    ]), [isZh]);
    const defaultExportFieldKeys = React.useMemo(
        () => exportFieldOptions.filter((item) => item.defaultChecked).map((item) => item.key),
        [exportFieldOptions],
    );
    const [candidateListViewportEl, setCandidateListViewportEl] = React.useState<HTMLDivElement | null>(null);
    const [candidateBoardViewportEl, setCandidateBoardViewportEl] = React.useState<HTMLDivElement | null>(null);
    const [candidateListCompactMode, setCandidateListCompactMode] = React.useState(false);
    const [candidateFilterBarExpanded, setCandidateFilterBarExpanded] = React.useState(false);
    const [refreshing, setRefreshing] = React.useState(false);
    const [candidateAiOutputDialogOpen, setCandidateAiOutputDialogOpen] = React.useState(false);
    const [exportDialogOpen, setExportDialogOpen] = React.useState(false);
    const [exportIncludeResumes, setExportIncludeResumes] = React.useState(true);
    const [exportFieldKeys, setExportFieldKeys] = React.useState<string[]>(defaultExportFieldKeys);
    const [batchBindDialogOpen, setBatchBindDialogOpen] = React.useState(false);
    const [batchBindPositionId, setBatchBindPositionId] = React.useState<string>("");
    const [batchBindSubmitting, setBatchBindSubmitting] = React.useState(false);
    const [batchStatusDialogOpen, setBatchStatusDialogOpen] = React.useState(false);
    useEffect(() => {
        setExportFieldKeys(defaultExportFieldKeys);
    }, [defaultExportFieldKeys]);
    const [batchStatusValue, setBatchStatusValue] = React.useState<string>("");
    const [batchStatusReason, setBatchStatusReason] = React.useState<string>("");
    const [batchStatusSubmitting, setBatchStatusSubmitting] = React.useState(false);
    const [statusFlowSubmitting, setStatusFlowSubmitting] = React.useState<string | null>(null);
    const batchStatusSubmittingRef = React.useRef(false);
    const updateBatchStatusSubmitting = React.useCallback((nextValue: boolean) => {
        batchStatusSubmittingRef.current = nextValue;
        setBatchStatusSubmitting(nextValue);
    }, []);
    const runCandidateDisposition = React.useCallback(async (candidateIds: number[], action: CandidateQuickDispositionAction) => {
        if (!candidateIds.length || batchStatusSubmittingRef.current) {
            return;
        }
        const nextConfig = {
            pass: {
                status: "screening_passed",
                reason: tr.quickDispositionReasonPass,
            },
            talent_pool: {
                status: "talent_pool",
                reason: tr.quickDispositionReasonTalentPool,
            },
            reject: {
                status: "screening_rejected",
                reason: tr.quickDispositionReasonReject,
            },
        }[action];
        updateBatchStatusSubmitting(true);
        try {
            await batchUpdateStatus(candidateIds, nextConfig.status, nextConfig.reason);
        } finally {
            updateBatchStatusSubmitting(false);
        }
    }, [batchUpdateStatus, tr, updateBatchStatusSubmitting]);
    const runQuickDisposition = React.useCallback(async (action: CandidateQuickDispositionAction) => {
        await runCandidateDisposition(selectedCandidateIds, action);
    }, [runCandidateDisposition, selectedCandidateIds]);
    const [scheduleFormOpen, setScheduleFormOpen] = React.useState(false);
    const defaultRoundName = tr.roundNameDefault;
    const [scheduleForm, setScheduleForm] = React.useState({
        round_name: defaultRoundName,
        round_index: "1",
        interviewer_user_code: "",
        interviewer_name: "",
        scheduled_at: "",
        duration_minutes: "60",
        availability_slot_id: "",
        department_review_assignment_id: "",
        location: "",
        meeting_link: "",
        notes: "",
    });
    const [scheduleAvailabilitySlots, setScheduleAvailabilitySlots] = React.useState<InterviewAvailabilitySlot[]>([]);
    const [scheduleAvailabilityLoading, setScheduleAvailabilityLoading] = React.useState(false);
    const [scheduleSubmitting, setScheduleSubmitting] = React.useState(false);
    const [offerFormOpen, setOfferFormOpen] = React.useState(false);
    const [offerForm, setOfferForm] = React.useState({offer_title: "", salary: "", department: "", entry_date: "", offer_content: "", notes: ""});
    const [offerSubmitting, setOfferSubmitting] = React.useState(false);
    const [followUpFormOpen, setFollowUpFormOpen] = React.useState(false);
    const [followUpContent, setFollowUpContent] = React.useState("");
    const [followUpType, setFollowUpType] = React.useState("note");
    const [followUpSubmitting, setFollowUpSubmitting] = React.useState(false);
    const candidateDetailToolbarScrollRef = React.useRef<HTMLDivElement | null>(null);
    const candidateDetailToolbarRailRef = React.useRef<HTMLDivElement | null>(null);
    const candidateDetailToolbarSyncSourceRef = React.useRef<"viewport" | "rail" | null>(null);
    const [candidateDetailToolbarRailWidth, setCandidateDetailToolbarRailWidth] = React.useState(0);
    const [candidateDetailToolbarHasOverflow, setCandidateDetailToolbarHasOverflow] = React.useState(false);

    const updateCandidateDetailToolbarMetrics = React.useCallback(() => {
        const node = candidateDetailToolbarScrollRef.current;
        if (!node) {
            setCandidateDetailToolbarRailWidth(0);
            setCandidateDetailToolbarHasOverflow(false);
            return;
        }
        setCandidateDetailToolbarRailWidth(node.scrollWidth);
        setCandidateDetailToolbarHasOverflow(node.scrollWidth > node.clientWidth + 1);
    }, []);

    const syncCandidateDetailToolbarScroll = React.useCallback((left: number, source: "viewport" | "rail") => {
        const viewport = candidateDetailToolbarScrollRef.current;
        const rail = candidateDetailToolbarRailRef.current;

        if (source !== "viewport" && viewport && Math.abs(viewport.scrollLeft - left) > 1) {
            candidateDetailToolbarSyncSourceRef.current = "rail";
            viewport.scrollLeft = left;
        }
        if (source !== "rail" && rail && Math.abs(rail.scrollLeft - left) > 1) {
            candidateDetailToolbarSyncSourceRef.current = "viewport";
            rail.scrollLeft = left;
        }
    }, []);

    const handleCandidateDetailToolbarScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
        if (candidateDetailToolbarSyncSourceRef.current === "rail") {
            candidateDetailToolbarSyncSourceRef.current = null;
            return;
        }
        syncCandidateDetailToolbarScroll(event.currentTarget.scrollLeft, "viewport");
    }, [syncCandidateDetailToolbarScroll]);

    const handleCandidateDetailToolbarRailScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
        if (candidateDetailToolbarSyncSourceRef.current === "viewport") {
            candidateDetailToolbarSyncSourceRef.current = null;
            return;
        }
        syncCandidateDetailToolbarScroll(event.currentTarget.scrollLeft, "rail");
    }, [syncCandidateDetailToolbarScroll]);

    const handleCandidateDetailToolbarWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
        const node = event.currentTarget;
        if (node.scrollWidth <= node.clientWidth + 1) {
            return;
        }
        if (!event.shiftKey && Math.abs(event.deltaX) <= 0) {
            return;
        }
        const delta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
        if (!delta) {
            return;
        }
        event.preventDefault();
        const nextLeft = node.scrollLeft + delta;
        node.scrollLeft = nextLeft;
        syncCandidateDetailToolbarScroll(nextLeft, "viewport");
    }, [syncCandidateDetailToolbarScroll]);

    React.useEffect(() => {
        if (!candidateListViewportEl) {
            return;
        }

        const syncCompactMode = () => {
            setCandidateListCompactMode(candidateListViewportEl.clientWidth <= 760);
        };

        syncCompactMode();

        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", syncCompactMode);
            return () => window.removeEventListener("resize", syncCompactMode);
        }

        let rafId: number | null = null;
        const observer = new ResizeObserver(() => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                syncCompactMode();
                rafId = null;
            });
        });
        observer.observe(candidateListViewportEl);
        return () => {
            observer.disconnect();
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [candidateListViewportEl]);

    const mergedCandidateListScrollRef = React.useCallback((node: HTMLDivElement | null) => {
        setCandidateListViewportEl(node);
        candidateListScrollRef(node);
    }, [candidateListScrollRef]);

    const rowVirtualizer = useVirtualizer({
        count: visibleCandidates.length,
        getScrollElement: () => candidateListViewportEl,
        estimateSize: () => CANDIDATE_LIST_ESTIMATED_ROW_HEIGHT,
        overscan: CANDIDATE_LIST_OVERSCAN,
    });

    const candidateListVisibleColumns = React.useMemo<CandidateListColumnKey[]>(
        () => (
            showOrganizationColumn
                ? ["candidate", "status", "match", "city", "expected_city", "position", "organization", "source", "updated"]
                : ["candidate", "status", "match", "city", "expected_city", "position", "source", "updated"]
        ),
        [showOrganizationColumn],
    );

    const candidateListEffectiveColumnWidths = React.useMemo<CandidateListDisplayColumnWidths>(() => (
        candidateListCompactMode
            ? {
                ...candidateListDisplayColumnWidths,
                candidate: 132,
                position: 108,
            }
            : candidateListDisplayColumnWidths
    ), [candidateListCompactMode, candidateListDisplayColumnWidths]);

    const candidateListEffectiveTableWidth = React.useMemo(() => {
        return 56 + candidateListVisibleColumns.reduce(
            (sum, key) => sum + candidateListEffectiveColumnWidths[key],
            0,
        );
    }, [candidateListEffectiveColumnWidths, candidateListVisibleColumns]);
    const candidateListGridTemplateColumns = React.useMemo(() => {
        return `56px ${candidateListVisibleColumns.map((key) => `${candidateListEffectiveColumnWidths[key]}px`).join(" ")}`;
    }, [candidateListEffectiveColumnWidths, candidateListVisibleColumns]);

    const selectedCandidateIdSet = React.useMemo(() => new Set(selectedCandidateIds), [selectedCandidateIds]);
    const visibleCandidateIds = React.useMemo(() => visibleCandidates.map((candidate) => candidate.id), [visibleCandidates]);
    const selectedVisibleCandidateCount = React.useMemo(() => (
        visibleCandidateIds.reduce((count, candidateId) => count + (selectedCandidateIdSet.has(candidateId) ? 1 : 0), 0)
    ), [selectedCandidateIdSet, visibleCandidateIds]);
    const allVisibleCandidatesSelected = React.useMemo(() => (
        visibleCandidateIds.length > 0 && visibleCandidateIds.every((candidateId) => selectedCandidateIdSet.has(candidateId))
    ), [selectedCandidateIdSet, visibleCandidateIds]);
    const someVisibleCandidatesSelected = selectedVisibleCandidateCount > 0 && !allVisibleCandidatesSelected;
    const visibleSelectAllCheckboxRef = React.useRef<HTMLInputElement | null>(null);
    React.useEffect(() => {
        if (visibleSelectAllCheckboxRef.current) {
            visibleSelectAllCheckboxRef.current.indeterminate = someVisibleCandidatesSelected;
        }
    }, [someVisibleCandidatesSelected]);
    const toggleVisibleCandidateSelection = React.useCallback(() => {
        if (!visibleCandidateIds.length) return;
        const visibleCandidateIdSet = new Set(visibleCandidateIds);
        setSelectedCandidateIds((current) => {
            const currentSet = new Set(current);
            const shouldClearVisibleSelection = visibleCandidateIds.every((candidateId) => currentSet.has(candidateId));
            if (shouldClearVisibleSelection) {
                return current.filter((candidateId) => !visibleCandidateIdSet.has(candidateId));
            }
            const next = [...current];
            visibleCandidateIds.forEach((candidateId) => {
                if (!currentSet.has(candidateId)) {
                    next.push(candidateId);
                }
            });
            return next;
        });
    }, [setSelectedCandidateIds, visibleCandidateIds]);
    const visibleCandidateResumeMailSummaryMap = React.useMemo(() => {
        const nextMap = new Map<number, string | null>();
        visibleCandidates.forEach((candidate) => {
            nextMap.set(candidate.id, getCandidateResumeMailSummary(candidate.id));
        });
        return nextMap;
    }, [getCandidateResumeMailSummary, visibleCandidates]);
    const getVisibleCandidateResumeMailSummary = React.useCallback(
        (candidateId: number) => visibleCandidateResumeMailSummaryMap.get(candidateId) ?? null,
        [visibleCandidateResumeMailSummaryMap],
    );
    const candidatePipelineStages = React.useMemo<CandidatePipelineStageSummary[]>(() => {
        const statusCounts = new Map<string, number>();
        visibleCandidates.forEach((candidate) => {
            const status = resolveCandidateDisplayStatus(candidate);
            statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
        });
        const scopedStatusCounts = candidatePipelineStatusCounts || null;
        const scopedTotal = typeof candidatePipelineTotal === "number" ? candidatePipelineTotal : null;
        return CANDIDATE_PIPELINE_STAGES.map((stage) => {
            const stageStatusValues = stage.statusValues || (stage.statusValue ? [stage.statusValue] : []);
            const stageCount = stageStatusValues.length
                ? stageStatusValues.reduce((sum, value) => sum + (scopedStatusCounts ? Number(scopedStatusCounts[value] || 0) : (statusCounts.get(value) || 0)), 0)
                : (scopedTotal ?? visibleCandidates.length);
            const active = stageStatusValues.length
                ? candidateStatusFilter.length === stageStatusValues.length && stageStatusValues.every((value) => candidateStatusFilter.includes(value))
                : candidateStatusFilter.length === 0;
            return {
                ...stage,
                label: isZh ? stage.labelZh : stage.labelEn,
                hint: isZh ? stage.hintZh : stage.hintEn,
                count: stageCount,
                active,
            };
        });
    }, [candidatePipelineStatusCounts, candidatePipelineTotal, candidateStatusFilter, isZh, visibleCandidates]);
    const selectCandidatePipelineStage = React.useCallback((stage: CandidatePipelineStageSummary) => {
        setCandidateStatusFilter(stage.statusValues || (stage.statusValue ? [stage.statusValue] : []));
    }, [setCandidateStatusFilter]);

    const virtualItems = rowVirtualizer.getVirtualItems();
    const candidateTotalPages = React.useMemo(() => (
        Math.max(1, Math.ceil(Math.max(0, candidateTotal) / Math.max(1, candidatePageSize)))
    ), [candidatePageSize, candidateTotal]);
    const candidatePaginationPages = React.useMemo(() => {
        const totalPages = candidateTotalPages;
        const currentPage = Math.min(Math.max(0, candidatePageIndex), totalPages - 1);
        const first = Math.max(0, Math.min(currentPage - 2, totalPages - 5));
        const last = Math.min(totalPages - 1, first + 4);
        return Array.from({ length: last - first + 1 }, (_, index) => first + index);
    }, [candidatePageIndex, candidateTotalPages]);
    const candidatePageStart = candidateTotal > 0 ? candidatePageIndex * candidatePageSize + 1 : 0;
    const candidatePageEnd = candidateTotal > 0 ? Math.min(candidateTotal, candidatePageIndex * candidatePageSize + allCandidatesCount) : 0;

    React.useEffect(() => {
        if (candidateTotal > 0 && candidatePageIndex >= candidateTotalPages) {
            setCandidatePageIndex(candidateTotalPages - 1);
        }
    }, [candidatePageIndex, candidateTotal, candidateTotalPages, setCandidatePageIndex]);

    const getColumnHeaderLabel = React.useCallback((columnKey: string) => {
        switch (columnKey) {
            case "candidate": return tr.candidate;
            case "organization": return tr.organization;
            case "position": return tr.position;
            case "status": return tr.status;
            case "match": return tr.matchPercent;
            case "city": return tr.cityLabel;
            case "expected_city": return tr.expectedCityLabel;
            case "source": return tr.source;
            default: return tr.timeLabel;
        }
    }, [tr]);

    const [candidateDetailPanel, setCandidateDetailPanel] = React.useState<CandidateDetailPanelKey>("resume");
    const [candidateResumeView, setCandidateResumeView] = React.useState<CandidateResumeViewKey>("original");
    const [selectedResumeFileId, setSelectedResumeFileId] = React.useState<number | null>(null);
    const [candidateResumeMoreOpen, setCandidateResumeMoreOpen] = React.useState(false);
    const [candidateDetailRefreshing, setCandidateDetailRefreshing] = React.useState(false);
    const [candidateResumePreviewRefreshKey, setCandidateResumePreviewRefreshKey] = React.useState(0);
    const [candidateDetailMainScrolled, setCandidateDetailMainScrolled] = React.useState(false);
    const [potentialReasonExpanded, setPotentialReasonExpanded] = React.useState(false);
    const [departmentReviewDialogOpen, setDepartmentReviewDialogOpen] = React.useState(false);
    const [departmentReviewSubmitting, setDepartmentReviewSubmitting] = React.useState(false);
    const [departmentReviewReviewerOptions, setDepartmentReviewReviewerOptions] = React.useState<DepartmentReviewReviewerOption[]>([]);
    const [departmentReviewReviewerLoading, setDepartmentReviewReviewerLoading] = React.useState(false);
    const [interviewerOptions, setInterviewerOptions] = React.useState<DepartmentReviewReviewerOption[]>([]);
    const [interviewerLoading, setInterviewerLoading] = React.useState(false);
    const [departmentReviewReviewerPickerOpen, setDepartmentReviewReviewerPickerOpen] = React.useState(false);
    const [departmentReviewReviewerQuery, setDepartmentReviewReviewerQuery] = React.useState("");
    const [selectedDepartmentReviewers, setSelectedDepartmentReviewers] = React.useState<string[]>([]);
    const [departmentReviewMessage, setDepartmentReviewMessage] = React.useState("");
    const [departmentReviewDecisionComment, setDepartmentReviewDecisionComment] = React.useState("");
    const [departmentReviewDecisionSubmitting, setDepartmentReviewDecisionSubmitting] = React.useState<"passed" | "rejected" | null>(null);
    const [candidateDetailNoteSubmitting, setCandidateDetailNoteSubmitting] = React.useState(false);
    const [candidateDetailSideRailTab, setCandidateDetailSideRailTab] = React.useState<"note" | "followups">("note");
    const [departmentReviewVisibleSections, setDepartmentReviewVisibleSections] = React.useState<string[]>([
        "original_resume",
        "standard_resume",
        "screening_result",
    ]);
    const candidateDetailMainScrollRef = React.useRef<HTMLElement | null>(null);

    const switchCandidateResumeView = React.useCallback((view: CandidateResumeViewKey) => {
        setCandidateDetailPanel("resume");
        setCandidateResumeView(view);
        setCandidateResumeMoreOpen(false);
        window.requestAnimationFrame(() => {
            candidateDetailMainScrollRef.current?.scrollTo({
                top: 0,
                behavior: "auto",
            });
        });
    }, []);
    const toggleDepartmentReviewSection = React.useCallback((section: string) => {
        setDepartmentReviewVisibleSections((current) => (
            current.includes(section)
                ? current.filter((item) => item !== section)
                : [...current, section]
        ));
    }, []);
    const activeDepartmentReviewBatch = React.useMemo(() => (
        departmentReviews.find((review) => review.status === "pending") || null
    ), [departmentReviews]);
    const latestPassedDepartmentReviewAssignmentId = React.useMemo(() => {
        for (const batch of departmentReviews) {
            const passedAssignment = batch.assignments?.find((assignment) => assignment.status === "passed");
            if (passedAssignment) {
                return passedAssignment.id;
            }
        }
        return null;
    }, [departmentReviews]);
    const activeDepartmentReviewerCodes = React.useMemo(() => {
        if (!activeDepartmentReviewBatch) {
            return [];
        }
        return Array.from(new Set(
            activeDepartmentReviewBatch.assignments
                .filter((assignment) => assignment.status === "pending" || assignment.status === "deferred")
                .map((assignment) => assignment.reviewer_user_code)
                .filter(Boolean),
        ));
    }, [activeDepartmentReviewBatch]);
    const loadDepartmentReviewers = React.useCallback(async () => {
        const params = new URLSearchParams();
        params.set("limit", "200");
        const orgCode = candidateDetail?.candidate.org_code;
        if (orgCode) {
            params.set("org_code", orgCode);
        }
        setDepartmentReviewReviewerLoading(true);
        try {
            const data = await recruitmentApi<DepartmentReviewReviewerOption[]>(`/department-reviews/reviewers?${params.toString()}`);
            setDepartmentReviewReviewerOptions(data || []);
        } catch (error) {
            console.warn("Failed to load department reviewers", error);
            setDepartmentReviewReviewerOptions([]);
        } finally {
            setDepartmentReviewReviewerLoading(false);
        }
    }, [candidateDetail?.candidate.org_code]);
    const loadInterviewers = React.useCallback(async () => {
        const params = new URLSearchParams();
        params.set("limit", "200");
        const orgCode = candidateDetail?.candidate.org_code;
        if (orgCode) {
            params.set("org_code", orgCode);
        }
        setInterviewerLoading(true);
        try {
            const data = await recruitmentApi<DepartmentReviewReviewerOption[]>(`/interviews/interviewers?${params.toString()}`);
            setInterviewerOptions(data || []);
        } catch (error) {
            console.warn("Failed to load interviewers", error);
            setInterviewerOptions([]);
        } finally {
            setInterviewerLoading(false);
        }
    }, [candidateDetail?.candidate.org_code]);
    const openDepartmentReviewDialog = React.useCallback(() => {
        setSelectedDepartmentReviewers(activeDepartmentReviewerCodes);
        setDepartmentReviewReviewerQuery("");
        setDepartmentReviewReviewerPickerOpen(false);
        setDepartmentReviewMessage("");
        setDepartmentReviewVisibleSections(["original_resume", "standard_resume", "screening_result"]);
        setDepartmentReviewDialogOpen(true);
    }, [activeDepartmentReviewerCodes]);
    React.useEffect(() => {
        if (!departmentReviewDialogOpen) {
            return;
        }
        void loadDepartmentReviewers();
    }, [departmentReviewDialogOpen, loadDepartmentReviewers]);
    React.useEffect(() => {
        if (!scheduleFormOpen) {
            return;
        }
        void loadInterviewers();
    }, [loadInterviewers, scheduleFormOpen]);
    const departmentReviewerByCode = React.useMemo(() => new Map(
        departmentReviewReviewerOptions.map((reviewer) => [reviewer.user_code, reviewer]),
    ), [departmentReviewReviewerOptions]);
    const interviewerByCode = React.useMemo(() => new Map(
        interviewerOptions.map((reviewer) => [reviewer.user_code, reviewer]),
    ), [interviewerOptions]);
    const visibleDepartmentReviewerOptions = React.useMemo(() => {
        const normalized = departmentReviewReviewerQuery.trim().toLowerCase();
        if (!normalized) {
            return departmentReviewReviewerOptions;
        }
        return departmentReviewReviewerOptions.filter((reviewer) => [
            reviewer.user_code,
            reviewer.name,
            reviewer.display_name,
            reviewer.primary_org_code,
        ].some((value) => String(value || "").toLowerCase().includes(normalized)));
    }, [departmentReviewReviewerOptions, departmentReviewReviewerQuery]);
    const toggleDepartmentReviewer = React.useCallback((userCode: string) => {
        setSelectedDepartmentReviewers((current) => (
            current.includes(userCode)
                ? current.filter((item) => item !== userCode)
                : [...current, userCode]
        ));
    }, []);
    const handleDepartmentReviewerOptionPointerDown = React.useCallback((event: React.PointerEvent<HTMLButtonElement>, userCode: string) => {
        event.preventDefault();
        event.stopPropagation();
        toggleDepartmentReviewer(userCode);
    }, [toggleDepartmentReviewer]);
    const handleDepartmentReviewerOptionKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLButtonElement>, userCode: string) => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        toggleDepartmentReviewer(userCode);
    }, [toggleDepartmentReviewer]);
    const loadScheduleAvailabilitySlots = React.useCallback(async (userCode: string) => {
        const normalizedUserCode = userCode.trim();
        if (!normalizedUserCode) {
            setScheduleAvailabilitySlots([]);
            return;
        }
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
        const params = new URLSearchParams({
            user_codes: normalizedUserCode,
            start_at: start.toISOString(),
            end_at: end.toISOString(),
        });
        setScheduleAvailabilityLoading(true);
        try {
            const data = await recruitmentApi<{items: InterviewAvailabilitySlot[]}>(`/interview-availability?${params.toString()}`);
            setScheduleAvailabilitySlots((data?.items || []).filter((slot) => slot.status === "available"));
        } catch (error) {
            console.warn("Failed to load interview availability", error);
            setScheduleAvailabilitySlots([]);
        } finally {
            setScheduleAvailabilityLoading(false);
        }
    }, []);
    React.useEffect(() => {
        if (!scheduleFormOpen) {
            return;
        }
        void loadScheduleAvailabilitySlots(scheduleForm.interviewer_user_code);
    }, [loadScheduleAvailabilitySlots, scheduleForm.interviewer_user_code, scheduleFormOpen]);
    const applyScheduleAvailabilitySlot = React.useCallback((slotId: string) => {
        const slot = scheduleAvailabilitySlots.find((item) => String(item.id) === slotId);
        setScheduleForm((current) => {
            if (!slot) {
                return {...current, availability_slot_id: slotId};
            }
            const start = slot.start_at ? new Date(slot.start_at) : null;
            const end = slot.end_at ? new Date(slot.end_at) : null;
            const duration = start && end && Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
                ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000))
                : Number(current.duration_minutes || 60);
            const toInput = (date: Date | null) => {
                if (!date || !Number.isFinite(date.getTime())) {
                    return current.scheduled_at;
                }
                const pad = (value: number) => String(value).padStart(2, "0");
                return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
            };
            return {
                ...current,
                availability_slot_id: slotId,
                scheduled_at: toInput(start),
                duration_minutes: String(duration),
            };
        });
    }, [scheduleAvailabilitySlots]);
    const scheduleFormCanSubmit = Boolean(
        scheduleForm.interviewer_user_code.trim()
        && scheduleForm.scheduled_at
        && Number(scheduleForm.duration_minutes || 0) > 0
    );
    const buildNextInterviewRoundName = React.useCallback((roundIndex: number) => {
        if (!isZh) {
            return roundIndex <= 1 ? "First Interview" : `Round ${roundIndex} Interview`;
        }
        if (roundIndex <= 1) return "初试";
        if (roundIndex === 2) return "复试";
        return `第 ${roundIndex} 轮面试`;
    }, [isZh]);
    const openInterviewScheduleForm = React.useCallback(() => {
        const nextRoundIndex = Math.max(1, interviewSchedules.length + 1);
        setCandidateDetailPanel("interview");
        setScheduleForm({
            round_name: buildNextInterviewRoundName(nextRoundIndex),
            round_index: String(nextRoundIndex),
            interviewer_user_code: "",
            interviewer_name: "",
            scheduled_at: "",
            duration_minutes: "60",
            availability_slot_id: "",
            department_review_assignment_id: latestPassedDepartmentReviewAssignmentId ? String(latestPassedDepartmentReviewAssignmentId) : "",
            location: "",
            meeting_link: "",
            notes: "",
        });
        setScheduleAvailabilitySlots([]);
        setScheduleFormOpen(true);
    }, [buildNextInterviewRoundName, interviewSchedules.length, latestPassedDepartmentReviewAssignmentId]);
    const lastAutoOpenedScheduleCandidateIdRef = React.useRef<number | null>(null);
    React.useEffect(() => {
        if (!autoOpenInterviewScheduleCandidateId) {
            lastAutoOpenedScheduleCandidateIdRef.current = null;
            return;
        }
        if (candidateDetail?.candidate.id !== autoOpenInterviewScheduleCandidateId) {
            return;
        }
        if (lastAutoOpenedScheduleCandidateIdRef.current === autoOpenInterviewScheduleCandidateId) {
            return;
        }
        lastAutoOpenedScheduleCandidateIdRef.current = autoOpenInterviewScheduleCandidateId;
        openInterviewScheduleForm();
        onAutoOpenInterviewScheduleHandled?.(autoOpenInterviewScheduleCandidateId);
    }, [
        autoOpenInterviewScheduleCandidateId,
        candidateDetail?.candidate.id,
        onAutoOpenInterviewScheduleHandled,
        openInterviewScheduleForm,
    ]);
    const submitDepartmentReview = React.useCallback(async () => {
        if (!candidateDetail?.candidate.id || !createDepartmentReview || departmentReviewSubmitting) {
            return;
        }
        const reviewers = selectedDepartmentReviewers.map((userCode) => {
            const reviewer = departmentReviewerByCode.get(userCode);
            return {
                user_code: userCode,
                name: reviewer?.name || reviewer?.display_name || userCode,
            };
        });
        if (!reviewers.length) {
            window.alert(isZh ? "请选择评审人" : "Please select reviewers");
            return;
        }
        setDepartmentReviewSubmitting(true);
        try {
            await createDepartmentReview({
                candidate_id: candidateDetail.candidate.id,
                reviewers,
                visible_sections: departmentReviewVisibleSections,
                message: departmentReviewMessage.trim() || undefined,
                replace_existing: Boolean(activeDepartmentReviewBatch),
            });
            setDepartmentReviewDialogOpen(false);
            setCandidateDetailPanel("review");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : (isZh ? "提交部门评审失败" : "Failed to submit department review"));
        } finally {
            setDepartmentReviewSubmitting(false);
        }
    }, [
        activeDepartmentReviewBatch,
        candidateDetail?.candidate.id,
        createDepartmentReview,
        departmentReviewMessage,
        departmentReviewSubmitting,
        departmentReviewVisibleSections,
        departmentReviewerByCode,
        isZh,
        selectedDepartmentReviewers,
    ]);

    const handleCandidateDetailMainScroll = React.useCallback((event: React.UIEvent<HTMLElement>) => {
        const nextScrolled = event.currentTarget.scrollTop > 132;
        setCandidateDetailMainScrolled((current) => current === nextScrolled ? current : nextScrolled);
    }, []);
    const isDepartmentReviewDecisionMode = Boolean(
        candidateDetail?.candidate.id
        && departmentReviewDecisionContext?.candidateId === candidateDetail.candidate.id
        && submitDepartmentReviewDecision
    );
    React.useEffect(() => {
        if (!isDepartmentReviewDecisionMode) {
            setDepartmentReviewDecisionComment("");
            setDepartmentReviewDecisionSubmitting(null);
            return;
        }
        setDepartmentReviewDecisionComment(departmentReviewDecisionContext?.comment || "");
        setDepartmentReviewDecisionSubmitting(null);
    }, [departmentReviewDecisionContext?.assignmentId, departmentReviewDecisionContext?.comment, isDepartmentReviewDecisionMode]);
    const submitCandidateDetailDepartmentReviewDecision = React.useCallback(async (status: "passed" | "rejected") => {
        if (!departmentReviewDecisionContext || !submitDepartmentReviewDecision || departmentReviewDecisionSubmitting) {
            return;
        }
        setDepartmentReviewDecisionSubmitting(status);
        try {
            await submitDepartmentReviewDecision(
                departmentReviewDecisionContext.assignmentId,
                status,
                departmentReviewDecisionComment,
            );
        } catch (error) {
            toast.error(error instanceof Error ? error.message : (isZh ? "提交评审结果失败" : "Failed to submit review decision"));
        } finally {
            setDepartmentReviewDecisionSubmitting(null);
        }
    }, [
        departmentReviewDecisionComment,
        departmentReviewDecisionContext,
        departmentReviewDecisionSubmitting,
        isZh,
        submitDepartmentReviewDecision,
    ]);
    const saveCandidateDetailNote = React.useCallback(async () => {
        const candidateId = candidateDetail?.candidate.id;
        const content = statusUpdateReason.trim();
        if (!candidateId || !content || candidateDetailNoteSubmitting) {
            return;
        }
        setCandidateDetailNoteSubmitting(true);
        try {
            await createFollowUp(candidateId, content, "note");
            setStatusUpdateReason("");
            setCandidateDetailSideRailTab("followups");
            setCandidateDetailPanel("background");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : (isZh ? "保存备注失败" : "Failed to save note"));
        } finally {
            setCandidateDetailNoteSubmitting(false);
        }
    }, [
        candidateDetail?.candidate.id,
        candidateDetailNoteSubmitting,
        createFollowUp,
        isZh,
        setStatusUpdateReason,
        statusUpdateReason,
    ]);
    const manualCandidateStatusOptions = React.useMemo(
        () => Object.entries(candidateStatusLabels).filter(([value]) => value !== "screening_running"),
        [],
    );
    const pendingStatusOption = React.useMemo(
        () => pendingStatus
            ? manualCandidateStatusOptions.find(([value]) => value === pendingStatus) || null
            : null,
        [manualCandidateStatusOptions, pendingStatus],
    );
    const handleStatusFlowUpdate = React.useCallback(async (nextStatus: string) => {
        const currentStatus = candidateDetail?.candidate.status;
        if (!nextStatus || nextStatus === currentStatus || statusFlowSubmitting) {
            return;
        }
        setStatusFlowSubmitting(nextStatus);
        try {
            await updateCandidateStatus(nextStatus);
        } finally {
            setStatusFlowSubmitting(null);
        }
    }, [candidateDetail?.candidate.status, statusFlowSubmitting, updateCandidateStatus]);

    React.useEffect(() => {
        setCandidateDetailPanel("resume");
        setCandidateResumeView("original");
        setSelectedResumeFileId(null);
        setCandidateResumeMoreOpen(false);
        setCandidateAiOutputDialogOpen(false);
        setCandidateDetailMainScrolled(false);
        setCandidateDetailSideRailTab("note");
        setPotentialReasonExpanded(false);
        const frameId = window.requestAnimationFrame(() => {
            candidateDetailMainScrollRef.current?.scrollTo({top: 0, behavior: "auto"});
        });
        return () => window.cancelAnimationFrame(frameId);
    }, [selectedCandidateId]);

    React.useEffect(() => {
        updateCandidateDetailToolbarMetrics();

        const node = candidateDetailToolbarScrollRef.current;
        if (!node || typeof ResizeObserver === "undefined") {
            return;
        }

        let rafId: number | null = null;
        const observer = new ResizeObserver(() => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                updateCandidateDetailToolbarMetrics();
                rafId = null;
            });
        });
        observer.observe(node);
        if (node.firstElementChild instanceof HTMLElement) {
            observer.observe(node.firstElementChild);
        }

        return () => {
            observer.disconnect();
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [candidateDetail, candidateDetailPanel, updateCandidateDetailToolbarMetrics]);

    const candidateOverviewCounts = React.useMemo(() => {
        return visibleCandidates.reduce((acc, candidate) => {
            const status = resolveCandidateDisplayStatus(candidate);
            if (status === "pending_screening") acc.pendingScreening++;
            if (status === "pending_interview") acc.pendingInterview++;
            if (status === "talent_pool") acc.talentPool++;
            if (visibleCandidateResumeMailSummaryMap.get(candidate.id)) acc.sent++;
            return acc;
        }, {pendingScreening: 0, pendingInterview: 0, talentPool: 0, sent: 0});
    }, [visibleCandidateResumeMailSummaryMap, visibleCandidates]);

    const candidateOverviewStats = React.useMemo(() => {
        return [
            {label: tr.currentResults, value: `${visibleCandidates.length}${tr.peopleSuffix}`},
            {label: tr.pendingScreening, value: `${candidateOverviewCounts.pendingScreening}${tr.peopleSuffix}`},
            {label: tr.pendingInterview, value: `${candidateOverviewCounts.pendingInterview}${tr.peopleSuffix}`},
            {label: tr.talentPoolAndSent, value: `${candidateOverviewCounts.talentPool} / ${candidateOverviewCounts.sent}`},
        ];
    }, [candidateOverviewCounts, tr, visibleCandidates]);

    const recentVisibleCandidates = React.useMemo(() => {
        const toTimestamp = (value?: string | null) => (value ? new Date(value).getTime() : 0);
        return [...visibleCandidates]
            .sort((left, right) => toTimestamp(right.updated_at) - toTimestamp(left.updated_at))
            .slice(0, 5);
    }, [visibleCandidates]);

    const selectedCandidateResumeMailSummary = candidateDetail
        ? getCandidateResumeMailSummary(candidateDetail.candidate.id)
        : null;
    const selectedCandidateResumeMailCountLabel = React.useMemo(() => {
        if (!selectedCandidateResumeMailSummary) {
            return tr.sendCountZero;
        }
        const match = selectedCandidateResumeMailSummary.match(tr.sentCountRegex);
        return match ? tr.sentCountLabel(match[1]) : tr.sentLabel;
    }, [selectedCandidateResumeMailSummary, tr]);
    const candidateDetailIdentityMeta = candidateDetail?.candidate.current_company || "";
    const resumeFiles = candidateDetail?.resume_files ?? [];
    const primaryResumeFile = React.useMemo(() => {
        if (!resumeFiles.length) {
            return null;
        }
        if (selectedResumeFileId == null) {
            return resumeFiles[0];
        }
        return resumeFiles.find((file) => file.id === selectedResumeFileId) ?? resumeFiles[0];
    }, [resumeFiles, selectedResumeFileId]);
    const [inlineResumePreviewBlob, setInlineResumePreviewBlob] = React.useState<Blob | null>(null);
    const [inlineResumePreviewUrl, setInlineResumePreviewUrl] = React.useState<string | null>(null);
    const [inlineResumePreviewFallback, setInlineResumePreviewFallback] = React.useState(false);
    const [inlineResumePreviewLoading, setInlineResumePreviewLoading] = React.useState(false);
    const [inlineResumePreviewError, setInlineResumePreviewError] = React.useState<string | null>(null);
    const [inlineResumeFrameReady, setInlineResumeFrameReady] = React.useState(false);
    const inlineResumeFrameReadyTimerRef = React.useRef<number | null>(null);
    const latestInterviewQuestion = candidateDetail?.interview_questions[0] ?? null;
    const latestResumeScoreLog = React.useMemo(
        () => candidateProcessActivity.find((log) => log.task_type === "resume_score") || null,
        [candidateProcessActivity],
    );
    const currentScreeningTaskLog = React.useMemo(
        () => (
            selectedCandidateScreeningTaskId
                ? candidateProcessActivity.find((log) => log.id === selectedCandidateScreeningTaskId) || latestResumeScoreLog
                : null
        ),
        [candidateProcessActivity, latestResumeScoreLog, selectedCandidateScreeningTaskId],
    );
    const currentScreeningTaskStage = React.useMemo(
        () => (
            extractScreeningTaskStage(currentScreeningTaskLog)
            || candidateDetail?.candidate.active_screening_stage
            || ""
        ),
        [candidateDetail?.candidate.active_screening_stage, currentScreeningTaskLog],
    );
    const currentScreeningTaskType = React.useMemo(
        () => currentScreeningTaskLog?.task_type || candidateDetail?.candidate.active_screening_task_type || "",
        [candidateDetail?.candidate.active_screening_task_type, currentScreeningTaskLog],
    );
    const currentScreeningTaskStatus = React.useMemo(
        () => currentScreeningTaskLog?.status || candidateDetail?.candidate.active_screening_status || "",
        [candidateDetail?.candidate.active_screening_status, currentScreeningTaskLog],
    );
    const shouldShowCurrentScreeningTask = Boolean(
        currentScreeningTaskLog
        || candidateDetail?.candidate.active_screening_stage
        || candidateDetail?.candidate.display_status_reason,
    );
    const candidateAiOutputPayload = React.useMemo(
        () => resolveCandidateAiOutputPayload(latestResumeScoreLog, candidateDetail?.score, tr),
        [candidateDetail?.score, latestResumeScoreLog],
    );
    const candidateAiOutputAvailable = Boolean(
        candidateAiOutputPayload.markdown.trim()
        || candidateAiOutputPayload.raw.trim(),
    );
    const candidateDetailHasScreeningAttempt = Boolean(
        candidateDetail?.score
        || candidateDetail?.workflow_memory?.last_screened_at
        || candidateDetail?.candidate.active_screening_failure_code
        || candidateProcessActivity.some((log) => Boolean(log.screening_run_id) || log.task_type === "screening_flow" || log.task_type === "resume_score")
        || [
            "screening_failed",
            "screening_passed",
            "screening_rejected",
            "department_review_pending",
            "department_review_passed",
            "department_review_rejected",
            "pending_interview",
            "talent_pool",
        ].includes(resolveCandidateDisplayStatus(candidateDetail?.candidate)),
    );
    const candidateScoreDisplayValues = React.useMemo(
        () => resolveScoreDisplayValues(toScoreRecord(candidateDetail?.score ?? null)),
        [candidateDetail?.score],
    );
    const candidateScoreDecisionValues = React.useMemo(
        () => deriveScoreDecisionValues(toScoreRecord(candidateDetail?.score ?? null)),
        [candidateDetail?.score],
    );
    const candidateDetailDisplayStatus = resolveCandidateDisplayStatus(candidateDetail?.candidate);
    const candidateDetailHasRuntimeOverride = Boolean(
        candidateDetail?.candidate
        && candidateDetailDisplayStatus
        && candidateDetailDisplayStatus !== candidateDetail.candidate.status,
    );
    const candidateDetailScreeningLive = Boolean(
        candidateDetailDisplayStatus === "screening_running"
        || isLiveTaskStatus(currentScreeningTaskStatus)
        || isLiveTaskStatus(candidateDetail?.candidate.active_screening_task_status)
        || isLiveTaskStatus(candidateDetail?.candidate.active_screening_status),
    );
    const candidateDetailScreeningActionLabel = candidateDetailScreeningLive
        ? (isZh ? "智能初筛中" : "Screening")
        : candidateDetailHasScreeningAttempt
            ? (isZh ? "重新智能初筛" : "Re-screen")
            : (isZh ? "智能初筛" : "Smart Screening");
    const handleCandidateDetailScreeningAction = React.useCallback(async () => {
        if (!candidateDetail?.candidate.id || candidateDetailScreeningLive || screeningSubmitting) {
            return;
        }
        setCandidateDetailPanel("screening");
        if (candidateDetailHasScreeningAttempt) {
            await triggerFreshScreening();
            return;
        }
        await triggerScreening();
    }, [
        candidateDetail?.candidate.id,
        candidateDetailHasScreeningAttempt,
        candidateDetailScreeningLive,
        screeningSubmitting,
        triggerFreshScreening,
        triggerScreening,
    ]);
    const candidateDetailScreenedPositionTitle = String(candidateDetail?.candidate.screened_position_title || "").trim();
    const candidateDetailAiMatchPositionTitle = String(candidateDetail?.candidate.ai_match_position_title || "").trim();
    const candidateDetailAiMatchReason = String(candidateDetail?.candidate.ai_match_reason || "").trim();
    const candidateDetailAiPotentialPosition = String(candidateDetail?.candidate.ai_potential_position || "").trim();
    const candidateDetailAiPotentialReason = String(candidateDetail?.candidate.ai_potential_reason || "").trim();
    const candidateDetailPositionInsightVisible = Boolean(
        candidateDetailScreenedPositionTitle
        || candidateDetailAiMatchPositionTitle
        || candidateDetailAiMatchReason
        || candidateDetailAiPotentialPosition
        || candidateDetailAiPotentialReason,
    );
    const refreshCurrentCandidateDetail = React.useCallback(async () => {
        const candidateId = candidateDetail?.candidate.id;
        if (!candidateId || !onRefreshCandidateDetail || candidateDetailRefreshing) {
            return;
        }
        setCandidateDetailRefreshing(true);
        try {
            await onRefreshCandidateDetail(candidateId);
            setCandidateResumePreviewRefreshKey((current) => current + 1);
        } finally {
            setCandidateDetailRefreshing(false);
        }
    }, [candidateDetail?.candidate.id, candidateDetailRefreshing, onRefreshCandidateDetail]);
    const openCandidatePositionDialog = React.useCallback(() => {
        if (!candidateDetail) {
            return;
        }
        setSelectedCandidateIds([candidateDetail.candidate.id]);
        setBatchBindPositionId(candidateDetail.candidate.position_id ? String(candidateDetail.candidate.position_id) : "");
        setBatchBindDialogOpen(true);
    }, [candidateDetail, setSelectedCandidateIds]);

    React.useEffect(() => {
        if (!resumeFiles.length) {
            setSelectedResumeFileId(null);
            return;
        }
        setSelectedResumeFileId((current) => {
            if (current != null && resumeFiles.some((file) => file.id === current)) {
                return current;
            }
            return resumeFiles[0].id;
        });
    }, [candidateDetail?.candidate.id, resumeFiles]);

    React.useEffect(() => {
        if (candidateDetailPanel !== "resume" || candidateResumeView !== "original" || !primaryResumeFile) {
            setInlineResumePreviewBlob(null);
            setInlineResumePreviewUrl(null);
            setInlineResumePreviewFallback(false);
            setInlineResumePreviewLoading(false);
            setInlineResumePreviewError(null);
            setInlineResumeFrameReady(false);
            return;
        }

        const abortController = new AbortController();
        let objectUrl: string | null = null;
        if (inlineResumeFrameReadyTimerRef.current !== null) {
            window.clearTimeout(inlineResumeFrameReadyTimerRef.current);
            inlineResumeFrameReadyTimerRef.current = null;
        }
        setInlineResumePreviewBlob(null);
        setInlineResumePreviewUrl(null);
        setInlineResumePreviewFallback(false);
        setInlineResumeFrameReady(false);
        setInlineResumePreviewLoading(true);
        setInlineResumePreviewError(null);

        authenticatedFetch(`/api/recruitment/resume-files/${primaryResumeFile.id}/download`, {
            method: "GET",
            cache: "no-store",
            signal: abortController.signal,
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(await response.text());
                }
                return response.blob();
            })
            .then((blob) => {
                if (abortController.signal.aborted) {
                    return;
                }
                objectUrl = URL.createObjectURL(blob);
                setInlineResumePreviewBlob(blob);
                setInlineResumePreviewUrl(objectUrl);
                setInlineResumePreviewLoading(false);
            })
            .catch((error) => {
                if (abortController.signal.aborted) {
                    return;
                }
                setInlineResumePreviewBlob(null);
                setInlineResumeFrameReady(false);
                setInlineResumePreviewLoading(false);
                setInlineResumePreviewError(
                    error instanceof Error && error.message
                        ? error.message
                        : (isZh ? "原始简历加载失败" : "Failed to load original resume"),
                );
            });

        return () => {
            abortController.abort();
            if (inlineResumeFrameReadyTimerRef.current !== null) {
                window.clearTimeout(inlineResumeFrameReadyTimerRef.current);
                inlineResumeFrameReadyTimerRef.current = null;
            }
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [candidateDetailPanel, candidateResumePreviewRefreshKey, candidateResumeView, isZh, primaryResumeFile?.id]);
    const handleInlineResumeFrameLoad = React.useCallback(() => {
        if (inlineResumeFrameReadyTimerRef.current !== null) {
            window.clearTimeout(inlineResumeFrameReadyTimerRef.current);
        }
        inlineResumeFrameReadyTimerRef.current = window.setTimeout(() => {
            inlineResumeFrameReadyTimerRef.current = null;
            setInlineResumeFrameReady(true);
        }, 180);
    }, []);
    const handleInlineResumePreviewError = React.useCallback((message: string) => {
        setInlineResumePreviewFallback(true);
        setInlineResumeFrameReady(false);
        setInlineResumePreviewLoading(false);
        setInlineResumePreviewError(message);
    }, []);
    const candidateDetailTabs = React.useMemo<Array<{key: CandidateDetailPanelKey; label: string; count?: number | null; disabled?: boolean}>>(() => ([
        {key: "resume", label: isZh ? "简历" : "Resume"},
        {key: "assessment", label: isZh ? "测评" : "Assessment", count: candidateDetail?.score ? 1 : null},
        {key: "screening", label: isZh ? "筛选" : "Screening", count: candidateProcessActivity.length || null},
        {key: "review", label: isZh ? "评审" : "Review", count: departmentReviews.length || null},
        {key: "exam", label: isZh ? "考试" : "Exam", disabled: true},
        {key: "interview", label: isZh ? "面试" : "Interview", count: interviewSchedules.length || candidateDetail?.interview_questions.length || null},
        {key: "offer", label: "Offer", count: offers.length || null},
        {key: "background", label: isZh ? "背调" : "Background", count: followUps.length || null},
    ]), [candidateDetail?.interview_questions.length, candidateDetail?.score, candidateProcessActivity.length, departmentReviews.length, followUps.length, interviewSchedules.length, isZh, offers.length]);
    const candidateDetailFlowSteps = React.useMemo(() => ([
        {status: "pending_screening", label: isZh ? "简历初筛" : "Resume Screen"},
        {status: "department_review_pending", label: isZh ? "部门评审" : "Dept Review"},
        {status: "pending_interview", label: isZh ? "面试" : "Interview"},
        {status: "pending_offer", label: "Offer"},
        {status: "hired", label: isZh ? "入职" : "Hired"},
    ]), [isZh]);
    const normalizedCandidateDetailFlowStatus = React.useMemo(() => {
        if (candidateDetailDisplayStatus === "screening_passed") return "department_review_pending";
        if (candidateDetailDisplayStatus === "department_review_passed") return "pending_interview";
        return candidateDetailDisplayStatus;
    }, [candidateDetailDisplayStatus]);
    const candidateDetailFlowIndex = Math.max(
        0,
        candidateDetailFlowSteps.findIndex((step) => step.status === normalizedCandidateDetailFlowStatus),
    );
    const parsedResumeBasicInfo = candidateDetail?.parse_result?.basic_info ?? null;
    const parsedResumeEducation = firstStructuredRecord(candidateDetail?.parse_result?.education_experiences);
    const parsedResumeWork = firstStructuredRecord(candidateDetail?.parse_result?.work_experiences);
    const parsedResumeSkills = Array.isArray(candidateDetail?.parse_result?.skills)
        ? candidateDetail.parse_result.skills
            .map((item) => (typeof item === "string" || typeof item === "number" ? String(item).trim() : formatStructuredValue(item, "")))
            .filter(Boolean)
            .slice(0, 8)
        : [];
	    const sanitizeTaskMessage = React.useCallback((
        value?: string | null,
        taskType?: string | null,
        autoRetry = false,
    ) => sanitizeCandidateFacingErrorText(value, {
        context: resolveCandidateFacingErrorContext(taskType, { autoRetry }),
        language,
    }), [language]);
    const refreshLikeLoading = refreshing || candidateListTransitionLoading;

    return (
        <>
            <div
                className={cn(
                    "grid h-full min-h-0 overflow-hidden",
                    candidateFilterBarExpanded
                        ? "grid-rows-[auto_minmax(0,1fr)] gap-2"
                        : "grid-rows-[minmax(0,1fr)] gap-0",
                )}
            >
                {candidateFilterBarExpanded ? (
                    <CandidateFilterBar
                        candidateFilterSummary={candidateFilterSummary}
                        candidateViewMode={candidateViewMode}
                        setCandidateViewMode={setCandidateViewMode}
                        candidateQuery={candidateQuery}
                        setCandidateQuery={setCandidateQuery}
                        candidatePositionFilter={candidatePositionFilter}
                        setCandidatePositionFilter={setCandidatePositionFilter}
                        candidateStatusFilter={candidateStatusFilter}
                        setCandidateStatusFilter={setCandidateStatusFilter}
                        candidateMatchFilter={candidateMatchFilter}
                        setCandidateMatchFilter={setCandidateMatchFilter}
                        candidateSourceFilter={candidateSourceFilter}
                        setCandidateSourceFilter={setCandidateSourceFilter}
                        candidateTimeFilter={candidateTimeFilter}
                        setCandidateTimeFilter={setCandidateTimeFilter}
                        positions={positions}
                        sourceOptions={sourceOptions}
                        visibleCandidateCount={visibleCandidates.length}
                        onCollapse={() => setCandidateFilterBarExpanded(false)}
                    />
                ) : null}

                <div className="grid min-h-0 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-[248px_minmax(0,1fr)]">
                    <CandidatePositionScopeSidebar
                        positions={positions}
                        activePositionId={activeQuickPosition}
                        allPositionCandidateCount={allPositionCandidateCount}
                        onSelectPosition={(positionId) => setCandidatePositionFilter(positionId ? [positionId] : [])}
                        tr={tr}
                        isZh={isZh}
                    />
                <Card className="h-full !gap-0 overflow-hidden rounded-md border border-[#e5e5e5] bg-white !py-0 shadow-none dark:border-slate-800 dark:bg-slate-950">
                    <CardHeader className="px-4 pt-2 pb-0 sm:px-5">
                        <CandidatePipelineBar
                            stages={candidatePipelineStages}
                            onSelect={selectCandidatePipelineStage}
                        />
                        <div
                            className={cn(
                                "mt-1.5 flex items-center gap-2 border-t border-slate-100 py-1.5 dark:border-slate-800",
                                selectedCandidateIds.length > 0
                                    ? "overflow-hidden rounded-md bg-[#F5F5F5]/50 px-2 dark:bg-neutral-900/20"
                                    : "flex-wrap justify-between",
                            )}
                        >
                            {selectedCandidateIds.length > 0 ? (
                                <>
                                    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                        <label
                                            className={cn(
                                                "inline-flex h-7 shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900",
                                                visibleCandidateIds.length ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                                            )}
                                        >
                                            <input
                                                ref={visibleSelectAllCheckboxRef}
                                                type="checkbox"
                                                className="h-3.5 w-3.5 rounded border-slate-300 text-[#171717] focus:ring-[#171717]"
                                                checked={allVisibleCandidatesSelected}
                                                disabled={!visibleCandidateIds.length}
                                                aria-checked={someVisibleCandidatesSelected ? "mixed" : allVisibleCandidatesSelected}
                                                aria-label={allVisibleCandidatesSelected ? tr.unselectVisibleCandidates : tr.selectVisibleCandidates}
                                                onChange={toggleVisibleCandidateSelection}
                                            />
                                            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                                                {allVisibleCandidatesSelected ? tr.unselectVisibleCandidates : tr.selectVisibleCandidates}
                                            </span>
                                        </label>
                                        <span className="inline-flex h-7 shrink-0 items-center rounded-md border border-[#D4D4D4] bg-white px-2.5 text-xs font-medium text-[#171717] dark:border-neutral-800/70 dark:bg-slate-950 dark:text-neutral-300">
                                            {tr.selectedCandidates(selectedCandidateIds.length)}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 shrink-0 rounded-md px-2.5 text-xs text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                                            onClick={() => void runQuickDisposition("pass")}
                                            disabled={batchStatusSubmitting}
                                        >
                                            <Check className="h-3.5 w-3.5"/>
                                            {tr.quickDispositionPass}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 shrink-0 rounded-md px-2.5 text-xs"
                                            onClick={() => void runQuickDisposition("talent_pool")}
                                            disabled={batchStatusSubmitting}
                                        >
                                            <Users className="h-3.5 w-3.5"/>
                                            {tr.quickDispositionTalentPool}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 shrink-0 rounded-md px-2.5 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30"
                                            onClick={() => void runQuickDisposition("reject")}
                                            disabled={batchStatusSubmitting}
                                        >
                                            <Trash2 className="h-3.5 w-3.5"/>
                                            {tr.quickDispositionReject}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 shrink-0 rounded-md px-2.5 text-xs"
                                            onClick={() => void triggerScreening(selectedCandidateIds)}
                                            disabled={isBatchScreeningCancelling || (screeningSubmitting && !isBatchScreeningRunning) || (!isBatchScreeningRunning && !selectedCandidateIds.length)}
                                        >
                                            {isBatchScreeningCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : isBatchScreeningRunning ? <Square className="h-3.5 w-3.5"/> : screeningSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Sparkles className="h-3.5 w-3.5"/>}
                                            {isBatchScreeningCancelling ? tr.stopping : isBatchScreeningRunning ? tr.stopBatchScreening : screeningSubmitting ? tr.queueing : tr.queueBatch}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 shrink-0 rounded-md px-2.5 text-xs"
                                            onClick={() => void triggerFreshScreening(selectedCandidateIds)}
                                            disabled={screeningSubmitting}
                                        >
                                            <RotateCcw className="h-3.5 w-3.5"/>
                                            {tr.requeueFreshScreening}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 shrink-0 rounded-md px-2.5 text-xs"
                                            onClick={() => void (async () => {
                                                if (onMoveToTalentPool) {
                                                    await onMoveToTalentPool(selectedCandidateIds);
                                                } else {
                                                    await batchBindPosition(selectedCandidateIds, null);
                                                }
                                            })()}
                                        >
                                            <Users className="h-3.5 w-3.5"/>
                                            {isZh ? "归入人才库" : "Move to Talent Pool"}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 shrink-0 rounded-md px-2.5 text-xs"
                                            onClick={() => setExportDialogOpen(true)}
                                            disabled={exporting}
                                        >
                                            <Download className="h-3.5 w-3.5"/>
                                            {exporting ? tr.exporting : tr.exportCandidates}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 shrink-0 rounded-md px-2.5 text-xs"
                                            onClick={() => openResumeMailDialog(selectedCandidateIds)}
                                        >
                                            <Mail className="h-3.5 w-3.5"/>
                                            {tr.sendResumesBatch}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 shrink-0 rounded-md px-2.5 text-xs"
                                            onClick={() => {
                                                setBatchBindPositionId("");
                                                setBatchBindDialogOpen(true);
                                            }}
                                        >
                                            <Briefcase className="h-3.5 w-3.5"/>
                                            {tr.batchBindPosition}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 shrink-0 rounded-md px-2.5 text-xs"
                                            onClick={() => {
                                                setBatchStatusValue("");
                                                setBatchStatusReason("");
                                                setBatchStatusDialogOpen(true);
                                            }}
                                        >
                                            <ArrowRightLeft className="h-3.5 w-3.5"/>
                                            {tr.batchUpdateStatus}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 shrink-0 rounded-md px-2.5 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                                            onClick={() => requestBatchDelete(selectedCandidateIds)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5"/>
                                            {tr.batchDelete}
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 text-xs text-slate-500 dark:text-slate-400">
                                            <label
                                                className={cn(
                                                    "inline-flex h-7 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900",
                                                    visibleCandidateIds.length ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                                                )}
                                            >
                                                <input
                                                    ref={visibleSelectAllCheckboxRef}
                                                    type="checkbox"
                                                    className="h-3.5 w-3.5 rounded border-slate-300 text-[#171717] focus:ring-[#171717]"
                                                    checked={allVisibleCandidatesSelected}
                                                    disabled={!visibleCandidateIds.length}
                                                    aria-checked={someVisibleCandidatesSelected ? "mixed" : allVisibleCandidatesSelected}
                                                    aria-label={allVisibleCandidatesSelected ? tr.unselectVisibleCandidates : tr.selectVisibleCandidates}
                                                    onChange={toggleVisibleCandidateSelection}
                                                />
                                                <span className="font-medium text-slate-700 dark:text-slate-200">
                                                    {allVisibleCandidatesSelected ? tr.unselectVisibleCandidates : tr.selectVisibleCandidates}
                                                </span>
                                            </label>
                                            <span>{tr.visibleSelectionCount(selectedVisibleCandidateCount, visibleCandidateIds.length)}</span>
                                            <span className="hidden text-slate-300 sm:inline">|</span>
                                            <span>{tr.selectedCandidates(selectedCandidateIds.length)}</span>
                                        </div>
                                        {onRefresh ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 rounded-md px-2 text-xs font-normal"
                                                disabled={refreshLikeLoading || candidatesLoading}
                                                onClick={async () => {
                                                    setRefreshing(true);
                                                    try {
                                                        await onRefresh();
                                                    } finally {
                                                        setRefreshing(false);
                                                    }
                                                }}
                                            >
                                                <RotateCcw className={cn("h-3.5 w-3.5", refreshLikeLoading && "animate-spin")}/>
                                                {tr.refresh}
                                            </Button>
                                        ) : null}
                                    </div>
                                    <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
                                        <div className="w-[150px] max-w-[150px] min-w-0 shrink-0">
                                            <NativeSelect
                                                value={activeQuickPosition || "__all__"}
                                                title={
                                                    activeQuickPosition
                                                        ? (positions.find((position) => String(position.id) === activeQuickPosition)?.title || "")
                                                        : tr.allPositions
                                                }
                                                onChange={(event) => {
                                                    const nextValue = event.target.value;
                                                    setCandidatePositionFilter(nextValue === "__all__" ? [] : [nextValue]);
                                                }}
                                                className="h-7 w-full max-w-full truncate rounded-md border-slate-200 bg-white px-2 py-0 pr-6 text-xs text-slate-700 shadow-none hover:border-slate-300 hover:text-slate-950 focus-visible:ring-1 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-slate-100"
                                            >
                                                <option value="__all__">{tr.allPositions}</option>
                                                {positions.map((position) => (
                                                    <option key={position.id} value={String(position.id)}>
                                                        {position.title}
                                                    </option>
                                                ))}
                                            </NativeSelect>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-normal text-slate-700 shadow-none hover:bg-slate-50 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100"
                                            onClick={() => setCandidateFilterBarExpanded((current) => !current)}
                                        >
                                            <SlidersHorizontal className="h-3.5 w-3.5"/>
                                            {candidateFilterBarExpanded ? tr.collapseFilters : tr.filters}
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="relative flex min-h-0 flex-1 flex-col px-4 pt-1 pb-2.5 sm:px-5">
                        {candidateMatchSortLoading ? (
                            <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                                <Loader2 className="h-4 w-4 animate-spin"/>
                                <span>{tr.sortingByMatchPercent}</span>
                            </div>
                        ) : null}
                        {candidatesLoading || !candidatesInitialLoaded ? (
                            <LoadingCard label={tr.loadingCandidateList}/>
                        ) : candidateViewMode === "list" ? (
                            visibleCandidates.length === 0 ? (
                                <div className="flex min-h-0 flex-1 items-center justify-center">
                                    <EmptyState title={tr.noCandidatesMatched} description={tr.noCandidatesMatchedDesc}/>
                                </div>
                            ) : (
                                <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
                                    <div
                                        ref={mergedCandidateListScrollRef}
                                        className={cn("relative min-h-0 flex-1 overflow-y-auto pr-1", SMOOTH_VERTICAL_SCROLLBAR_CLASS)}
                                    >
                                        <div
                                            role="list"
                                            aria-rowcount={visibleCandidates.length}
                                            className="relative"
                                            style={{height: rowVirtualizer.getTotalSize()}}
                                        >
                                            {virtualItems.map((virtualRow) => {
                                                const candidate = visibleCandidates[virtualRow.index];
                                                return (
                                                    <CandidateApplicantCard
                                                        key={candidate.id}
                                                        candidate={candidate}
                                                        isSelected={selectedCandidateId === candidate.id}
                                                        isChecked={selectedCandidateIdSet.has(candidate.id)}
                                                        rowStart={virtualRow.start}
                                                        rowHeight={virtualRow.size}
                                                        setSelectedCandidateId={setSelectedCandidateId}
                                                        toggleCandidateSelection={toggleCandidateSelection}
                                                        getResumeMailSummary={getVisibleCandidateResumeMailSummary}
                                                        onDisposition={(candidateId, action) => void runCandidateDisposition([candidateId], action)}
                                                        tr={tr}
                                                        language={language}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="shrink-0 border-t border-slate-200/80 pt-3 dark:border-slate-800">
                                        <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-slate-500 dark:text-slate-400">
                                            <span>
                                                {tr.candidatePageRange(candidatePageStart, candidatePageEnd, candidateTotal)}
                                            </span>
                                            <div className="flex flex-wrap items-center gap-2.5">
                                                <NativeSelect
                                                    value={String(candidatePageSize)}
                                                    title={tr.rowsPerPage}
                                                    onChange={(event) => setCandidatePageSize(Number(event.target.value))}
                                                    className="h-8 w-[118px] shrink-0 rounded-md border-slate-200 bg-white pr-8 text-sm shadow-none dark:border-slate-800 dark:bg-slate-950"
                                                >
                                                    {candidatePageSizeOptions.map((option) => (
                                                        <option key={option} value={option}>{option}{tr.rowsPerPage}</option>
                                                    ))}
                                                </NativeSelect>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 rounded-md px-2.5 text-xs"
                                                    disabled={candidatePageIndex <= 0 || candidatesLoading}
                                                    onClick={() => setCandidatePageIndex(candidatePageIndex - 1)}
                                                >
                                                    {tr.previousPage}
                                                </Button>
                                                {candidatePaginationPages.map((pageIndex) => (
                                                    <Button
                                                        key={pageIndex}
                                                        size="sm"
                                                        variant={pageIndex === candidatePageIndex ? "default" : "outline"}
                                                        className="h-7 min-w-7 rounded-md px-2 text-sm"
                                                        disabled={candidatesLoading}
                                                        onClick={() => setCandidatePageIndex(pageIndex)}
                                                    >
                                                        {pageIndex + 1}
                                                    </Button>
                                                ))}
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 rounded-md px-2.5 text-xs"
                                                    disabled={candidatePageIndex >= candidateTotalPages - 1 || candidatesLoading}
                                                    onClick={() => setCandidatePageIndex(candidatePageIndex + 1)}
                                                >
                                                    {tr.nextPage}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="min-h-0 flex flex-1 flex-col">
                                <div
                                    ref={setCandidateBoardViewportEl}
                                    className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]"
                                >
                                    <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                                        {groupedCandidates.map((group) => (
                                            <CandidateBoardColumn
                                                key={group.status}
                                                group={group}
                                                scrollElement={candidateBoardViewportEl}
                                                selectedCandidateId={selectedCandidateId}
                                                selectedCandidateIdSet={selectedCandidateIdSet}
                                                setSelectedCandidateId={setSelectedCandidateId}
                                                toggleCandidateSelection={toggleCandidateSelection}
                                                getCandidateResumeMailSummary={getVisibleCandidateResumeMailSummary}
                                                tr={tr}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 pt-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                    <span>{tr.candidatePageRange(candidatePageStart, candidatePageEnd, candidateTotal)}</span>
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        <NativeSelect
                                            value={String(candidatePageSize)}
                                            title={tr.rowsPerPage}
                                            onChange={(event) => setCandidatePageSize(Number(event.target.value))}
                                            className="h-8 w-[118px] shrink-0 rounded-md border-slate-200 bg-white pr-8 text-sm shadow-none dark:border-slate-800 dark:bg-slate-950"
                                        >
                                            {candidatePageSizeOptions.map((option) => (
                                                <option key={option} value={option}>{option}{tr.rowsPerPage}</option>
                                            ))}
                                        </NativeSelect>
                                        <Button size="sm" variant="outline" className="h-7 rounded-md px-2.5 text-sm" disabled={candidatePageIndex <= 0 || candidatesLoading} onClick={() => setCandidatePageIndex(candidatePageIndex - 1)}>
                                            {tr.previousPage}
                                        </Button>
                                        {candidatePaginationPages.map((pageIndex) => (
                                            <Button key={pageIndex} size="sm" variant={pageIndex === candidatePageIndex ? "default" : "outline"} className="h-7 min-w-7 rounded-md px-2 text-sm" disabled={candidatesLoading} onClick={() => setCandidatePageIndex(pageIndex)}>
                                                {pageIndex + 1}
                                            </Button>
                                        ))}
                                        <Button size="sm" variant="outline" className="h-7 rounded-md px-2.5 text-sm" disabled={candidatePageIndex >= candidateTotalPages - 1 || candidatesLoading} onClick={() => setCandidatePageIndex(candidatePageIndex + 1)}>
                                            {tr.nextPage}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
                </div>

                <Dialog
                    open={selectedCandidateId !== null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setSelectedCandidateId(null);
                        }
                    }}
                >
                    <DialogContent
                        className="h-[min(92vh,920px)] max-h-[92vh] overflow-hidden rounded-[6px] border border-slate-200 bg-[#f4f7fb] p-0 shadow-2xl"
                        style={{
                            width: "min(1180px, calc(100vw - 32px))",
                            maxWidth: "min(1180px, calc(100vw - 32px))",
                        }}
                    >
                        <DialogTitle className="sr-only">
                            {candidateDetail?.candidate.name
                                ? `${candidateDetail.candidate.name} · ${isZh ? "候选人详情" : "Candidate Details"}`
                                : (isZh ? "候选人详情" : "Candidate Details")}
                        </DialogTitle>
                    {candidateDetailLoading ? (
                        <div className="flex h-full items-center justify-center bg-white">
                            <LoadingPanel label={tr.loadingCandidateDetail}/>
                        </div>
                    ) : candidateDetail ? (
                        <div className="grid h-full min-h-0 grid-cols-1 bg-[#f4f7fb] lg:grid-cols-[minmax(0,1fr)_320px]">
                            <section
                                ref={candidateDetailMainScrollRef}
                                onScroll={handleCandidateDetailMainScroll}
                                className={cn("relative min-h-0 min-w-0 overflow-y-auto bg-white", SMOOTH_VERTICAL_SCROLLBAR_CLASS)}
                            >
                                <div className="sticky top-0 z-30 h-0 overflow-visible">
                                    <div className={cn(
                                        "border-b border-slate-200 bg-white/95 px-7 py-3 shadow-[0_4px_18px_rgba(15,23,42,0.08)] backdrop-blur transition duration-200",
                                        candidateDetailMainScrolled ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0",
                                    )}>
                                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                    <span className="truncate text-[18px] font-semibold leading-6 text-slate-950">{candidateDetail.candidate.name}</span>
                                                    <span className="truncate text-[13px] text-slate-500">{candidateDetail.candidate.candidate_code || "-"}</span>
                                                    <span className="text-[13px] text-slate-400">|</span>
                                                    <span className="text-[13px] text-slate-600">{candidateDetail.candidate.age ? `${candidateDetail.candidate.age}${isZh ? "岁" : ""}` : "--"}</span>
                                                    <span className="text-[13px] text-slate-400">|</span>
                                                    <span className="truncate text-[13px] text-slate-600">
                                                        {candidateDetail.candidate.education || readStructuredText(parsedResumeEducation, ["degree", "education", "学历"]) || "-"}
                                                    </span>
                                                </div>
                                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500">
                                                    <span className="truncate">
                                                        {candidateDetail.candidate.position_title || candidateDetail.candidate.screened_position_title || candidateDetail.candidate.ai_match_position_title || tr.unassignedPosition}
                                                    </span>
                                                    <span className="truncate">{candidateDetail.candidate.phone || candidateDetail.candidate.email || tr.noContact}</span>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                                                <Badge className={cn("h-6 rounded-[3px] border px-2 text-[12px]", statusBadgeClass("candidate", candidateDetailDisplayStatus))}>
                                                    {labelForCandidateStatus(candidateDetailDisplayStatus)}
                                                </Badge>
                                                <Badge variant="outline" className="h-6 rounded-[3px] border-emerald-200 bg-emerald-50 px-2 text-[12px] text-emerald-700">
                                                    {tr.matchBadge} {formatPercent(candidateScoreDisplayValues.matchPercent ?? resolveCandidateSummaryMatchPercent(candidateDetail.candidate))}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="border-b border-slate-200 px-7 pb-0 pt-5">
                                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-[13px] text-slate-500">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="rounded-[3px] bg-slate-100 px-3 py-1.5 text-slate-700">{isZh ? "1次应聘" : "1 Application"}</span>
                                            <span className="max-w-[360px] truncate rounded-[3px] border border-slate-200 px-3 py-1.5 text-slate-700">
                                                {candidateDetail.candidate.position_title || candidateDetail.candidate.screened_position_title || tr.unassignedPosition}
                                            </span>
                                        </div>
                                        <span className="truncate">
                                            {formatLongDateTime(candidateDetail.candidate.updated_at || candidateDetail.candidate.created_at)}
                                        </span>
                                    </div>

                                    <div className="flex items-start gap-5">
                                        <CandidateDetailAvatar name={candidateDetail.candidate.name}/>
                                        <div className="min-w-0 flex-1 pb-5">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 data-no-zoom className="truncate text-[22px] font-semibold leading-8 text-slate-950">
                                                    {candidateDetail.candidate.name}
                                                </h3>
                                                <span className="text-[14px] text-slate-500">{candidateDetail.candidate.candidate_code}</span>
                                                <span className="text-[14px] text-slate-500">|</span>
                                                <span className="text-[14px] text-slate-600">{candidateDetail.candidate.age ? `${candidateDetail.candidate.age}${isZh ? "岁" : ""}` : "--"}</span>
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                                                <CandidateMetaItem icon={GraduationCap}>{candidateDetail.candidate.education || readStructuredText(parsedResumeEducation, ["degree", "education", "学历"]) || "-"}</CandidateMetaItem>
                                                <CandidateMetaItem icon={Briefcase}>{candidateDetail.candidate.years_of_experience || candidateDetailIdentityMeta || "-"}</CandidateMetaItem>
                                                <CandidateMetaItem icon={Phone}>{candidateDetail.candidate.phone || "-"}</CandidateMetaItem>
                                                <CandidateMetaItem icon={AtSign}>{candidateDetail.candidate.email || tr.noContact}</CandidateMetaItem>
                                            </div>
                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                <Badge className={cn("h-6 rounded-[3px] border px-2 text-[12px]", statusBadgeClass("candidate", candidateDetailDisplayStatus))}>
                                                    {labelForCandidateStatus(candidateDetailDisplayStatus)}
                                                </Badge>
                                                <Badge variant="outline" className="h-6 rounded-[3px] border-emerald-200 bg-emerald-50 px-2 text-[12px] text-emerald-700">
                                                    {tr.matchBadge} {formatPercent(candidateScoreDisplayValues.matchPercent ?? resolveCandidateSummaryMatchPercent(candidateDetail.candidate))}
                                                </Badge>
                                                <Badge variant="outline" className="h-6 rounded-[3px] px-2 text-[12px]">
                                                    {candidateDetail.candidate.position_title || candidateDetail.candidate.ai_match_position_title || tr.unassignedPosition}
                                                </Badge>
                                                {selectedCandidateResumeMailSummary ? (
                                                    <Badge variant="outline" className="h-6 rounded-[3px] border-violet-200 bg-violet-50 px-2 text-[12px] text-violet-700">
                                                        {selectedCandidateResumeMailSummary}
                                                    </Badge>
                                                ) : null}
                                                <Button size="sm" variant="outline" className="h-6 rounded-[3px] px-2 text-[12px]" onClick={() => setCandidateDetailPanel("resume")}>
                                                    <Tag className="h-3.5 w-3.5"/>
                                                    {isZh ? "打标签" : "Tag"}
                                                </Button>
                                            </div>
                                            {candidateDetailPositionInsightVisible ? (
                                                <div className="mt-3 grid gap-2 text-[12px] text-slate-600 lg:grid-cols-2">
                                                    <div className="min-w-0 rounded-[4px] border border-violet-100 bg-violet-50/70 px-3 py-2">
                                                        <div className="mb-1 flex items-center gap-1.5 font-medium text-violet-700">
                                                            <Sparkles className="h-3.5 w-3.5"/>
                                                            {isZh ? "AI 推荐" : "AI Recommendation"}
                                                        </div>
                                                        <p className="truncate text-slate-800">
                                                            {candidateDetailAiMatchPositionTitle || candidateDetailScreenedPositionTitle || tr.unassignedPosition}
                                                        </p>
                                                        {candidateDetailAiMatchReason ? (
                                                            <p className="mt-1 line-clamp-2 text-slate-500">
                                                                {sanitizeCandidateFacingErrorText(candidateDetailAiMatchReason, {
                                                                    context: resolveCandidateFacingErrorContext("ai_position_match"),
                                                                    language,
                                                                })}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    <div className="min-w-0 rounded-[4px] border border-violet-100 bg-violet-50/60 px-3 py-2">
                                                        <div className="mb-1 flex items-center gap-1.5 font-medium text-violet-700">
                                                            <ArrowRightLeft className="h-3.5 w-3.5"/>
                                                            {isZh ? "转岗建议" : "Transfer Suggestion"}
                                                        </div>
                                                        <p className="truncate text-slate-800">
                                                            {candidateDetailAiPotentialPosition || (isZh ? "暂无转岗建议" : "No suggestion")}
                                                        </p>
                                                        {candidateDetailAiPotentialReason ? (
                                                            <p className="mt-1 line-clamp-2 text-slate-500">
                                                                {sanitizeCandidateFacingErrorText(candidateDetailAiPotentialReason, {
                                                                    context: resolveCandidateFacingErrorContext("ai_position_match"),
                                                                    language,
                                                                })}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ) : null}
                                            {candidateDetailHasRuntimeOverride ? (
                                                <p className="mt-2 text-[12px] text-slate-400">
                                                    {tr.originalStatus} {labelForCandidateStatus(candidateDetail.candidate.status)}
                                                </p>
                                            ) : null}
                                        </div>
                                        <div className="hidden items-center gap-2 xl:flex">
                                            <Button size="icon" variant="outline" className="h-9 w-9 rounded-[4px] text-amber-500">
                                                <Star className="h-4 w-4"/>
                                            </Button>
                                            <Button size="icon" variant="outline" className="h-9 w-9 rounded-[4px]">
                                                <UserPlus className="h-4 w-4"/>
                                            </Button>
                                            <Button size="icon" variant="outline" className="h-9 w-9 rounded-[4px]">
                                                <ExternalLink className="h-4 w-4"/>
                                            </Button>
                                        </div>
                                    </div>

                                    <div data-no-zoom className="flex min-w-0 items-center gap-6 overflow-x-auto border-t border-slate-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                        {candidateDetailTabs.map((tab) => (
                                            <button
                                                key={tab.key}
                                                type="button"
                                                className={cn(
                                                    "relative h-12 shrink-0 text-[15px] text-slate-700 transition hover:text-[#171717]",
                                                    candidateDetailPanel === tab.key && "font-semibold text-[#171717]",
                                                    tab.disabled && "text-slate-400",
                                                )}
                                                onClick={() => setCandidateDetailPanel(tab.key)}
                                            >
                                                {tab.label}
                                                <span className="ml-1 text-[13px] text-slate-500">{tab.count || 0}</span>
                                                {candidateDetailPanel === tab.key ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#171717]"/> : null}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 py-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant={candidateResumeView === "original" ? "default" : "outline"}
                                                className={cn("h-8 rounded-[4px] px-3 text-[13px]", candidateResumeView === "original" && "bg-[#171717] text-white hover:bg-[#262626]")}
                                                onClick={() => switchCandidateResumeView("original")}
                                            >
                                                {isZh ? "原始简历" : "Original"}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant={candidateResumeView === "standard" ? "default" : "outline"}
                                                className={cn("h-8 rounded-[4px] px-3 text-[13px]", candidateResumeView === "standard" && "bg-[#171717] text-white hover:bg-[#262626]")}
                                                onClick={() => switchCandidateResumeView("standard")}
                                            >
                                                {isZh ? "标准简历" : "Standard"}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant={candidateResumeView === "history" ? "default" : "outline"}
                                                className={cn("h-8 rounded-[4px] px-3 text-[13px]", candidateResumeView === "history" && "bg-[#171717] text-white hover:bg-[#262626]")}
                                                onClick={() => switchCandidateResumeView("history")}
                                            >
                                                {isZh ? "历史简历" : "History"}
                                            </Button>
                                        </div>
                                        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-[13px] text-slate-500">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 px-2 text-[13px]"
                                                onClick={() => void refreshCurrentCandidateDetail()}
                                                disabled={!onRefreshCandidateDetail || candidateDetailRefreshing}
                                            >
                                                <RotateCcw className={cn("h-3.5 w-3.5", candidateDetailRefreshing && "animate-spin")}/>
                                                {tr.refresh}
                                            </Button>
                                            {primaryResumeFile ? (
                                                <>
                                                    <Button size="sm" variant="ghost" className="h-8 px-2 text-[13px]" onClick={() => void openResumeFile(primaryResumeFile, true)}>
                                                        <Download className="h-3.5 w-3.5"/>
                                                        {tr.downloadResume}
                                                    </Button>
                                                </>
                                            ) : null}
                                            <Button size="sm" variant="ghost" className="h-8 px-2 text-[13px]" onClick={() => window.print()}>
                                                <Printer className="h-3.5 w-3.5"/>
                                                {isZh ? "打印" : "Print"}
                                            </Button>
                                            <Popover open={candidateResumeMoreOpen} onOpenChange={setCandidateResumeMoreOpen}>
                                                <PopoverTrigger asChild>
                                                    <Button size="sm" variant="ghost" className="h-8 px-2 text-[13px]">
                                                        <MoreHorizontal className="h-3.5 w-3.5"/>
                                                        {isZh ? "更多" : "More"}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-44 p-1" align="end">
	                                                    <button
	                                                        type="button"
	                                                        className="flex w-full items-center rounded-[4px] px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100"
	                                                        onClick={(event) => {
	                                                            event.preventDefault();
	                                                            event.stopPropagation();
	                                                            switchCandidateResumeView("standard");
	                                                        }}
	                                                    >
	                                                        {isZh ? "查看标准简历" : "Standard Resume"}
	                                                    </button>
	                                                    <button
	                                                        type="button"
	                                                        className="flex w-full items-center rounded-[4px] px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100"
	                                                        onClick={(event) => {
	                                                            event.preventDefault();
	                                                            event.stopPropagation();
	                                                            switchCandidateResumeView("history");
	                                                        }}
	                                                    >
	                                                        {isZh ? "查看历史简历" : "Resume History"}
	                                                    </button>
                                                    <button
	                                                        type="button"
	                                                        className="flex w-full items-center rounded-[4px] px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
	                                                        disabled={!primaryResumeFile}
	                                                        onClick={(event) => {
	                                                            event.preventDefault();
	                                                            event.stopPropagation();
	                                                            setCandidateResumeMoreOpen(false);
	                                                            if (primaryResumeFile) void openResumeFile(primaryResumeFile, false);
	                                                        }}
	                                                    >
                                                        {isZh ? "新窗口打开" : "Open in New Window"}
                                                    </button>
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                    </div>

                                    <div className="flex min-w-0 items-center gap-3 pb-3">
                                        <div className="min-w-0 flex-1">
                                            <NativeSelect
                                                className="h-8 rounded-[3px] border-slate-200 text-[13px]"
                                                value={primaryResumeFile ? String(primaryResumeFile.id) : ""}
                                                onChange={(event) => {
                                                    const nextId = Number(event.target.value);
                                                    setSelectedResumeFileId(Number.isFinite(nextId) ? nextId : null);
                                                    setCandidateResumeView("original");
                                                }}
                                            >
                                                {resumeFiles.length ? (
                                                    resumeFiles.map((file) => (
                                                        <option key={file.id} value={String(file.id)}>{file.original_name}</option>
                                                    ))
                                                ) : (
                                                    <option value="">{tr.noResumeFile}</option>
                                                )}
                                            </NativeSelect>
                                        </div>
	                                    </div>
                                </div>

                                <div className="bg-white">
                                    <div className="mx-auto min-w-0 max-w-[820px] space-y-6 px-8 py-7">
                                    {candidateDetailPanel === "resume" ? (
                                        <>
	                                            {duplicateCandidates.length > 0 && (
	                                                <details className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 dark:border-amber-900/80 dark:bg-amber-950/30">
                                                    <summary className="cursor-pointer text-sm font-medium text-amber-800 dark:text-amber-200">
                                                        {tr.duplicateWarning}（{duplicateCandidates.length}）
                                                    </summary>
                                                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{tr.duplicateWarningDesc(duplicateCandidates.length)}</p>
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {duplicateCandidates.map((dup) => (
                                                            <Button
                                                                key={dup.id}
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-6 rounded-full border-amber-300 px-2 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900/40"
                                                                onClick={() => setSelectedCandidateId(dup.id)}
                                                            >
                                                                {dup.name} ({dup.candidate_code})
                                                            </Button>
                                                        ))}
                                                    </div>
		                                                </details>
		                                            )}

                                            {candidateResumeView === "original" ? (
                                            <div className="overflow-hidden rounded-[4px] bg-white">
                                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-[14px] font-medium text-slate-900">
                                                            {primaryResumeFile ? primaryResumeFile.original_name : tr.noResumeFile}
                                                        </p>
                                                        <p className="mt-0.5 text-[12px] text-slate-500">
                                                            {primaryResumeFile
                                                                ? tr.resumeFileDesc(primaryResumeFile.file_ext || "-", primaryResumeFile.file_size || 0, primaryResumeFile.parse_status)
                                                                : tr.resumeFileEmptyDesc}
                                                        </p>
                                                    </div>
                                                    {primaryResumeFile ? (
                                                        <div className="flex items-center gap-2">
                                                            <Button size="sm" variant="outline" className="h-8 rounded-[4px] px-3 text-[13px]" onClick={() => void openResumeFile(primaryResumeFile, false)}>
                                                                <ExternalLink className="h-3.5 w-3.5"/>
                                                                {isZh ? "新窗口打开" : "Open"}
                                                            </Button>
                                                            <Button size="sm" variant="outline" className="h-8 rounded-[4px] px-3 text-[13px]" onClick={() => void openResumeFile(primaryResumeFile, true)}>
                                                                <Download className="h-3.5 w-3.5"/>
                                                                {tr.downloadResume}
                                                            </Button>
                                                        </div>
                                                    ) : null}
                                                </div>
                                                <div className="relative h-[min(70vh,720px)] min-h-[560px] overflow-hidden bg-white">
                                                    {inlineResumePreviewLoading || ((inlineResumePreviewBlob || inlineResumePreviewUrl) && !inlineResumeFrameReady) ? (
                                                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/90 text-slate-500">
                                                            <Loader2 className="h-8 w-8 animate-spin text-[#171717]"/>
                                                            <span className="text-[14px]">{isZh ? "正在加载原始简历..." : "Loading original resume..."}</span>
                                                        </div>
                                                    ) : null}
                                                    {inlineResumePreviewBlob && !inlineResumePreviewFallback ? (
                                                        <div
                                                            className={cn(
                                                                "absolute inset-0 bg-white transition-opacity duration-150",
                                                                inlineResumeFrameReady ? "opacity-100" : "opacity-0",
                                                            )}
                                                        >
                                                            <InlineResumePdfPreview
                                                                blob={inlineResumePreviewBlob}
                                                                fileName={primaryResumeFile?.original_name || "Original Resume"}
                                                                isZh={isZh}
                                                                onReady={handleInlineResumeFrameLoad}
                                                                onError={handleInlineResumePreviewError}
                                                            />
                                                        </div>
                                                    ) : inlineResumePreviewUrl ? (
                                                        <iframe
                                                            src={`${inlineResumePreviewUrl}#toolbar=0&navpanes=0&view=FitH&scrollbar=0`}
                                                            className={cn(
                                                                "absolute -left-7 -top-1 h-[calc(100%+8px)] w-[calc(100%+56px)] border-0 bg-white transition-opacity duration-150",
                                                                inlineResumeFrameReady ? "opacity-100" : "opacity-0",
                                                            )}
                                                            style={{colorScheme: "light", backgroundColor: "#fff"}}
                                                            title={primaryResumeFile?.original_name || "Original Resume"}
                                                            onLoad={handleInlineResumeFrameLoad}
                                                        />
                                                    ) : !inlineResumePreviewLoading ? (
                                                        <div className="flex h-full items-center justify-center px-6">
                                                            <EmptyState
                                                                title={primaryResumeFile ? (isZh ? "原始简历暂无法显示" : "Original Resume Unavailable") : tr.noResumeFile}
                                                                description={inlineResumePreviewError || (primaryResumeFile ? (isZh ? "可使用上方按钮在新窗口打开或下载文件。" : "Use the actions above to open or download the file.") : tr.resumeFileEmptyDesc)}
                                                            />
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                            ) : null}

                                            {candidateResumeView === "standard" ? (
                                            <>
                                            <div className="rounded-[4px] border border-slate-100 bg-white px-10 py-8 shadow-[0_1px_8px_rgba(15,23,42,0.04)]">
                                                <div className="flex items-start gap-5 border-b border-slate-100 pb-6">
                                                    <CandidateDetailAvatar name={candidateDetail.candidate.name}/>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-4">
                                                            <h4 className="text-[20px] font-semibold text-slate-900">{candidateDetail.candidate.name}</h4>
                                                            <span className="text-[14px] text-slate-500">{candidateDetail.candidate.age ? `${candidateDetail.candidate.age}${isZh ? "岁" : ""}` : "--"}</span>
                                                            <span className="text-[14px] text-slate-500">{candidateDetail.candidate.education || readStructuredText(parsedResumeEducation, ["degree", "education", "学历"]) || "-"}</span>
                                                        </div>
                                                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                                                            <CandidateMetaItem icon={GraduationCap}>{candidateDetail.candidate.education || readStructuredText(parsedResumeEducation, ["school", "school_name", "university", "学校"]) || "-"}</CandidateMetaItem>
                                                            <CandidateMetaItem icon={Briefcase}>{candidateDetail.candidate.current_company || readStructuredText(parsedResumeWork, ["company", "company_name", "公司"]) || "-"}</CandidateMetaItem>
                                                            <CandidateMetaItem icon={MapPin}>{candidateDetail.candidate.city || candidateDetail.candidate.expected_city || readStructuredText(parsedResumeBasicInfo, ["city", "current_city", "location", "城市"]) || "-"}</CandidateMetaItem>
                                                            <CandidateMetaItem icon={FileText}>{primaryResumeFile?.parse_status || "-"}</CandidateMetaItem>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-7 space-y-7">
                                                    <ResumeSection title={isZh ? "个人信息" : "Personal Info"}>
                                                        <div className="grid gap-y-4 text-[14px] text-slate-700 sm:grid-cols-2">
                                                            <div><span className="mr-10 text-slate-400">{isZh ? "姓名" : "Name"}</span>{candidateDetail.candidate.name}</div>
                                                            <div><span className="mr-10 text-slate-400">{isZh ? "年龄" : "Age"}</span>{candidateDetail.candidate.age || "-"}</div>
                                                            <div><span className="mr-10 text-slate-400">{isZh ? "手机" : "Phone"}</span>{candidateDetail.candidate.phone || "-"}</div>
                                                            <div><span className="mr-10 text-slate-400">{isZh ? "邮箱" : "Email"}</span>{candidateDetail.candidate.email || "-"}</div>
                                                        </div>
                                                    </ResumeSection>

                                                    <ResumeSection title={isZh ? "求职意向" : "Job Intention"}>
                                                        <div className="grid gap-y-4 text-[14px] text-slate-700 sm:grid-cols-2">
                                                            <div><span className="mr-10 text-slate-400">{isZh ? "应聘职位" : "Position"}</span>{candidateDetail.candidate.position_title || candidateDetail.candidate.ai_match_position_title || tr.unassignedPosition}</div>
                                                            <div><span className="mr-10 text-slate-400">{isZh ? "期望城市" : "Expected City"}</span>{candidateDetail.candidate.expected_city || candidateDetail.candidate.city || "-"}</div>
                                                        </div>
                                                    </ResumeSection>

                                                    <ResumeSection title={isZh ? "教育经历" : "Education"}>
                                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-slate-700">
                                                            <span className="font-medium text-slate-900">{readStructuredText(parsedResumeEducation, ["school", "school_name", "university", "学校"]) || "-"}</span>
                                                            <span>{readStructuredText(parsedResumeEducation, ["major", "专业"]) || "-"}</span>
                                                            <span>{candidateDetail.candidate.education || readStructuredText(parsedResumeEducation, ["degree", "education", "学历"]) || "-"}</span>
                                                            <span className="text-slate-400">{readStructuredText(parsedResumeEducation, ["start_date", "end_date", "time_range", "时间"]) || ""}</span>
                                                        </div>
                                                    </ResumeSection>

                                                    <ResumeSection title={isZh ? "工作经历" : "Work Experience"}>
                                                        <div className="space-y-2 text-[14px] leading-7 text-slate-700">
                                                            <p className="font-medium text-slate-900">{candidateDetail.candidate.current_company || readStructuredText(parsedResumeWork, ["company", "company_name", "公司"]) || "-"}</p>
                                                            <p>{readStructuredText(parsedResumeWork, ["position", "job_title", "title", "职位"]) || candidateDetail.candidate.years_of_experience || "-"}</p>
                                                            {readStructuredText(parsedResumeWork, ["description", "职责", "work_content", "summary"]) ? (
                                                                <p className="whitespace-pre-wrap text-slate-600">{readStructuredText(parsedResumeWork, ["description", "职责", "work_content", "summary"])}</p>
                                                            ) : null}
                                                        </div>
                                                    </ResumeSection>

                                                    {parsedResumeSkills.length ? (
                                                        <ResumeSection title={isZh ? "技能标签" : "Skills"}>
                                                            <div className="flex flex-wrap gap-2">
                                                                {parsedResumeSkills.map((skill) => (
                                                                    <span key={skill} className="rounded-[3px] bg-slate-100 px-2.5 py-1 text-[13px] text-slate-600">{skill}</span>
                                                                ))}
                                                            </div>
                                                        </ResumeSection>
                                                    ) : null}
                                                </div>
                                            </div>

	                                            <Field label={tr.baseInfo}>
                                                <div className="grid gap-3 md:grid-cols-2">
                                                    <Input value={candidateEditor.name} onChange={(event) => setCandidateEditor((current) => ({...current, name: event.target.value}))} placeholder={tr.namePlaceholder}/>
                                                    <Input value={candidateEditor.phone} onChange={(event) => setCandidateEditor((current) => ({...current, phone: event.target.value}))} placeholder={tr.phonePlaceholder}/>
                                                    <Input value={candidateEditor.email} onChange={(event) => setCandidateEditor((current) => ({...current, email: event.target.value}))} placeholder={tr.emailPlaceholder}/>
                                                    <Input value={candidateEditor.currentCompany} onChange={(event) => setCandidateEditor((current) => ({...current, currentCompany: event.target.value}))} placeholder={tr.companyPlaceholder}/>
                                                    <Input value={candidateEditor.yearsOfExperience} onChange={(event) => setCandidateEditor((current) => ({...current, yearsOfExperience: event.target.value}))} placeholder={tr.experiencePlaceholder}/>
                                                    <Input value={candidateEditor.education} onChange={(event) => setCandidateEditor((current) => ({...current, education: event.target.value}))} placeholder={tr.educationPlaceholder}/>
                                                    <Input value={candidateEditor.age} onChange={(event) => setCandidateEditor((current) => ({...current, age: event.target.value}))} placeholder={tr.agePlaceholder}/>
                                                    <Input value={candidateEditor.city} onChange={(event) => setCandidateEditor((current) => ({...current, city: event.target.value}))} placeholder={tr.cityPlaceholder}/>
                                                    <Input value={candidateEditor.expectedCity} onChange={(event) => setCandidateEditor((current) => ({...current, expectedCity: event.target.value}))} placeholder={tr.expectedCityPlaceholder}/>
                                                </div>
                                            </Field>

                                            <Field label={tr.position}>
                                                <NativeSelect value={candidateEditor.positionId} onChange={(event) => setCandidateEditor((current) => ({...current, positionId: event.target.value}))}>
                                                    <option value="">{tr.unassignedPosition}</option>
                                                    {positions.map((p) => (
                                                        <option key={p.id} value={String(p.id)}>{p.title}</option>
                                                    ))}
                                                </NativeSelect>
                                            </Field>

                                            <div className="grid gap-4 md:grid-cols-2">
                                                <Field label={tr.owner}>
                                                    <Input value={candidateEditor.ownerId} onChange={(event) => setCandidateEditor((current) => ({...current, ownerId: event.target.value}))} placeholder={tr.ownerPlaceholder}/>
                                                </Field>
                                            </div>

                                            <Field label={tr.tagsAndNotes}>
                                                <div className="space-y-3">
                                                    <Input value={candidateEditor.tagsText} onChange={(event) => setCandidateEditor((current) => ({...current, tagsText: event.target.value}))} placeholder={tr.tagsPlaceholder}/>
                                                    <Textarea
                                                        value={candidateEditor.notes}
                                                        onChange={(event) => setCandidateEditor((current) => ({...current, notes: event.target.value}))}
                                                        rows={4}
                                                        placeholder={tr.notesPlaceholder}
                                                    />
                                                    <Button onClick={() => void saveCandidate()}>
                                                        <Save className="h-4 w-4"/>
                                                        {tr.saveCandidateInfo}
                                                    </Button>
                                                </div>
                                            </Field>

                                            <div className="rounded-md border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                            {primaryResumeFile ? primaryResumeFile.original_name : tr.noResumeFile}
                                                        </p>
                                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                            {primaryResumeFile
                                                                ? tr.resumeFileDesc(primaryResumeFile.file_ext || "-", primaryResumeFile.file_size || 0, primaryResumeFile.parse_status)
                                                                : tr.resumeFileEmptyDesc}
                                                        </p>
                                                    </div>
                                                    {primaryResumeFile ? (
                                                        <div className="flex flex-wrap gap-2">
                                                            <Button size="sm" variant="outline" onClick={() => void openResumeFile(primaryResumeFile, true)}>{tr.downloadResume}</Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/80 dark:text-rose-200 dark:hover:bg-rose-950/30"
                                                                onClick={() => requestDeleteResumeFile(primaryResumeFile)}
                                                            >
                                                                <Trash2 className="h-4 w-4"/>
                                                                {tr.deleteResume}
                                                            </Button>
                                                        </div>
                                                    ) : null}
                                                </div>
                                                {primaryResumeFile?.parse_error ? (
                                                    <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-base text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                                                        {tr.parseErrorLine(primaryResumeFile.parse_error)}
                                                    </div>
                                                ) : null}
                                            </div>
                                            </>
                                            ) : null}

                                            {candidateResumeView === "history" ? (
                                                <div className="rounded-[4px] bg-white px-5 py-4">
                                                    {resumeFiles.length ? (
                                                        <div className="space-y-3">
                                                            {resumeFiles.map((file) => {
                                                                const active = primaryResumeFile?.id === file.id;
                                                                return (
                                                                    <div
                                                                        key={file.id}
                                                                        className={cn(
                                                                            "flex flex-wrap items-center justify-between gap-3 rounded-[4px] border px-4 py-3",
                                                                            active ? "border-[#171717] bg-[#F5F5F5]/60" : "border-slate-200 bg-white",
                                                                        )}
                                                                    >
                                                                        <div className="min-w-0">
                                                                            <p className="truncate text-[14px] font-medium text-slate-900">{file.original_name}</p>
                                                                            <p className="mt-1 text-[12px] text-slate-500">
                                                                                {tr.resumeFileDesc(file.file_ext || "-", file.file_size || 0, file.parse_status)}
                                                                            </p>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <Button
                                                                                size="sm"
                                                                                variant={active ? "default" : "outline"}
                                                                                className={cn("h-8 rounded-[4px] px-3 text-[13px]", active && "bg-[#171717] text-white hover:bg-[#262626]")}
                                                                                onClick={() => {
                                                                                    setSelectedResumeFileId(file.id);
                                                                                    setCandidateResumeView("original");
                                                                                }}
                                                                            >
                                                                                {isZh ? "查看原始简历" : "View Original"}
                                                                            </Button>
                                                                            <Button size="sm" variant="outline" className="h-8 rounded-[4px] px-3 text-[13px]" onClick={() => void openResumeFile(file, true)}>
                                                                                <Download className="h-3.5 w-3.5"/>
                                                                                {tr.downloadResume}
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <EmptyState title={tr.noResumeFile} description={tr.resumeFileEmptyDesc}/>
                                                    )}
                                                </div>
                                            ) : null}
                                        </>
                                    ) : null}

                                    {candidateDetailPanel === "screening" ? (
                                        <>

                                            <Field label={tr.statusFlow}>
                                                <div className="space-y-3">
                                                    <div className="flex flex-wrap gap-2">
                                                        {manualCandidateStatusOptions.map(([value, label]) => {
                                                            const isCurrent = candidateDetail.candidate.status === value;
                                                            const isSubmitting = statusFlowSubmitting === value;
                                                            return (
                                                                <Button
                                                                    key={value}
                                                                    size="sm"
                                                                    variant={isCurrent ? "default" : "outline"}
                                                                    aria-pressed={isCurrent}
                                                                    disabled={Boolean(statusFlowSubmitting)}
                                                                    title={isCurrent ? tr.currentStatusLine(label) : tr.confirmStatusChange(label)}
                                                                    onClick={() => {
                                                                        if (!isCurrent) setPendingStatus(value);
                                                                    }}
                                                                >
                                                                    {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : null}
                                                                    {label}
                                                                </Button>
                                                            );
                                                        })}
                                                    </div>
                                                    <Textarea
                                                        value={statusUpdateReason}
                                                        onChange={(event) => setStatusUpdateReason(event.target.value)}
                                                        rows={3}
                                                        placeholder={tr.statusReasonPlaceholder}
                                                    />
                                                    <div className="space-y-3">
                                                        {candidateDetail.status_history.length ? candidateDetail.status_history.map((history) => (
                                                            <div key={history.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                                        {labelForCandidateStatus(history.from_status || "")} → {labelForCandidateStatus(history.to_status)}
                                                                    </p>
                                                                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(history.created_at)}</p>
                                                                </div>
                                                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{history.reason || tr.noReasonProvided}</p>
                                                            </div>
                                                        )) : (
                                                            <EmptyState title={tr.noStatusHistory} description={tr.noStatusHistoryDesc}/>
                                                        )}
                                                    </div>
                                                </div>
                                            </Field>

                                            <Field label={tr.screeningMemory}>
                                                {candidateDetail.workflow_memory ? (
                                                    <div className="grid gap-3 md:grid-cols-2">
                                                        <InfoTile label={tr.memorySource} value={labelForMemorySource(candidateDetail.workflow_memory.screening_memory_source)}/>
                                                        <InfoTile label={tr.lastScreeningTime} value={formatLongDateTime(candidateDetail.workflow_memory.last_screened_at)}/>
                                                        <InfoTile label={tr.screeningSkills} value={formatSkillNames(candidateDetail.workflow_memory.screening_skill_ids, skillMap, language)}/>
                                                        <InfoTile label={tr.interviewSkills} value={formatSkillNames(candidateDetail.workflow_memory.interview_skill_ids, skillMap, language)}/>
                                                    </div>
                                                ) : (
                                                    <EmptyState title={tr.noScreeningMemory} description={tr.noScreeningMemoryDesc}/>
                                                )}
                                                <p className="mt-3 break-words text-xs leading-6 text-slate-500 dark:text-slate-400">
                                                    {tr.screeningMemoryHint(effectiveScreeningSkillSourceLabel)}
                                                </p>
                                                <p className="mt-2 break-words text-xs leading-6 text-slate-500 dark:text-slate-400">
                                                    {tr.screeningSkillPreview(formatSkillNames(effectiveScreeningSkillIds, skillMap, language))}
                                                </p>
                                            </Field>

                                            <Field label={tr.aiAssistant}>
                                                <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{tr.assistantPackedTitle}</p>
                                                            <p className="mt-1 break-words text-xs leading-6 text-slate-500 dark:text-slate-400">
                                                                {candidateAssistantActivity.length
                                                                    ? tr.assistantPackedDescWithCount(candidateAssistantActivity.length)
                                                                    : tr.assistantPackedDescEmpty}
                                                            </p>
                                                        </div>
                                                        <Button size="sm" variant="outline" onClick={() => openAssistantMode("drawer")}>
                                                            <Bot className="h-4 w-4"/>
                                                            {tr.openAiAssistant}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </Field>

                                            <Field label={tr.aiExecutionLogs}>
                                                <div className="space-y-3">
                                                    {candidateProcessActivity.length ? (
                                                        <>
                                                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                                        {tr.recordedLogs(candidateProcessActivity.length)}
                                                                    </p>
                                                                    <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">
                                                                        {tr.logsCollapsedHint}
                                                                    </p>
                                                                </div>
                                                                <Button size="sm" variant="outline" onClick={() => setCandidateProcessLogsExpanded((current) => !current)}>
                                                                    {candidateProcessLogsExpanded ? tr.collapseLogs : tr.expandLogs}
                                                                </Button>
                                                            </div>
                                                            {candidateProcessLogsExpanded ? candidateProcessActivity.map((log) => {
                                                                const logSkillSnapshots = resolveLogSkillSnapshots(log, skillMap);
                                                                return (
                                                                    <div key={log.id} className="rounded-md border border-slate-200 px-4 py-4 dark:border-slate-800">
                                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                                            <div className="min-w-0 flex-1">
                                                                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{labelForTaskType(log.task_type)}</p>
                                                                                <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">{labelForProvider(log.model_provider)} · {log.model_name || "-"} · {formatLongDateTime(log.created_at)}</p>
                                                                            </div>
                                                                            <Badge className={cn("rounded border", statusBadgeClass("task", log.status))}>
                                                                                {labelForTaskExecutionStatus(log.status)}
                                                                            </Badge>
                                                                        </div>
                                                                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                                                                            <InfoTile label={tr.screeningSkills} value={formatSkillSnapshotNames(logSkillSnapshots, language)}/>
                                                                            <InfoTile label={tr.memorySource} value={labelForMemorySource(log.memory_source)}/>
                                                                        </div>
                                                                        {log.error_message ? (
                                                                            <p className="mt-3 break-all text-sm text-rose-600">
                                                                                {sanitizeTaskMessage(
                                                                                    log.error_message,
                                                                                    log.task_type,
                                                                                    Boolean(log.status === "queued"),
                                                                                )}
                                                                            </p>
                                                                        ) : null}
                                                                        <OutputSnippet content={formatStructuredValue(
                                                                            log.output_snapshot,
                                                                            sanitizeTaskMessage(
                                                                                log.output_summary || tr.runningAwaitModel,
                                                                                log.task_type,
                                                                                Boolean(log.status === "queued"),
                                                                            ),
                                                                        )}/>
                                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                                            <Button size="sm" variant="outline" onClick={() => openTaskLogDetail(log.id)}>{tr.viewFullLog}</Button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }) : null}
                                                        </>
                                                    ) : (
                                                        <EmptyState title={tr.noAiLogs} description={tr.noAiLogsDesc}/>
                                                    )}
                                                </div>
                                            </Field>
                                        </>
                                    ) : null}

                                    {candidateDetailPanel === "review" ? (
                                        <div className="space-y-3">
                                            <div className="rounded-md border border-slate-200 bg-white px-4 py-4">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-semibold text-slate-900">{isZh ? "部门评审" : "Department Review"}</p>
                                                        <p className="mt-1 text-xs text-slate-500">
                                                            {isZh ? "把候选人提交给用人部门，评审结果会回写到当前流程。" : "Send the candidate to hiring reviewers and keep the result in this workflow."}
                                                        </p>
                                                    </div>
                                                    <Button size="sm" onClick={openDepartmentReviewDialog} disabled={!createDepartmentReview}>
                                                        <Users className="h-4 w-4"/>
                                                        {isZh ? "提交部门评审" : "Submit Review"}
                                                    </Button>
                                                </div>
                                            </div>
                                            {departmentReviews.length ? departmentReviews.map((review) => (
                                                <div key={review.id} className="rounded-md border border-slate-200 bg-white px-4 py-4">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline" className="rounded-[3px]">
                                                                {review.status === "passed"
                                                                    ? (isZh ? "评审通过" : "Passed")
                                                                    : review.status === "rejected"
                                                                        ? (isZh ? "评审淘汰" : "Rejected")
                                                                        : (isZh ? "评审中" : "Pending")}
                                                            </Badge>
                                                            <span className="text-sm text-slate-500">{formatDateTime(review.created_at)}</span>
                                                        </div>
                                                        <span className="text-sm text-slate-500">{isZh ? "发起人" : "Created by"}：{review.created_by || "-"}</span>
                                                    </div>
                                                    {review.message ? <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{review.message}</p> : null}
                                                    <div className="mt-3 divide-y divide-slate-100">
                                                        {review.assignments.map((assignment) => (
                                                            <div key={assignment.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                                                                <div>
                                                                    <p className="text-sm font-medium text-slate-900">{assignment.reviewer_name || assignment.reviewer_user_code}</p>
                                                                    <p className="mt-1 text-xs text-slate-500">{assignment.reviewer_user_code}</p>
                                                                    {assignment.comment ? <p className="mt-2 text-sm text-slate-600">{assignment.comment}</p> : null}
                                                                </div>
                                                                <div className="text-right">
                                                                    <Badge className={cn(
                                                                        "rounded-[3px] border",
                                                                        assignment.status === "passed" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                                                                        assignment.status === "rejected" && "border-rose-200 bg-rose-50 text-rose-700",
                                                                        assignment.status === "deferred" && "border-amber-200 bg-amber-50 text-amber-700",
                                                                        (!assignment.status || assignment.status === "pending") && "border-[#D4D4D4] bg-[#F5F5F5] text-[#171717]",
                                                                    )}>
                                                                        {assignment.status === "passed"
                                                                            ? (isZh ? "通过" : "Passed")
                                                                            : assignment.status === "rejected"
                                                                                ? (isZh ? "淘汰" : "Rejected")
                                                                                : assignment.status === "deferred"
                                                                                    ? (isZh ? "暂缓" : "Deferred")
                                                                                    : (isZh ? "待评审" : "Pending")}
                                                                    </Badge>
                                                                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(assignment.decision_at)}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )) : (
                                                <EmptyState
                                                    title={isZh ? "暂无部门评审" : "No department review"}
                                                    description={isZh ? "点击提交部门评审，将候选人发送给用人部门处理。" : "Submit the candidate to hiring reviewers when needed."}
                                                />
                                            )}
                                        </div>
                                    ) : null}

                                    {candidateDetailPanel === "offer" ? (
                                        <>
                                            <div className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{tr.offers}</p>
                                                    <Button size="sm" variant="outline" onClick={() => { setOfferForm({offer_title: "", salary: "", department: "", entry_date: "", offer_content: "", notes: ""}); setOfferFormOpen(!offerFormOpen); }}>
                                                        <Plus className="h-4 w-4"/>
                                                        {tr.addOffer}
                                                    </Button>
                                                </div>
                                                {offerFormOpen && candidateDetail && (
                                                    <div className="mt-3 space-y-2 rounded-xl border border-slate-200/70 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                                                        <div className="grid gap-2 md:grid-cols-2">
                                                            <Input value={offerForm.offer_title} onChange={(e) => setOfferForm((f) => ({...f, offer_title: e.target.value}))} placeholder={tr.offerTitle}/>
                                                            <Input value={offerForm.salary} onChange={(e) => setOfferForm((f) => ({...f, salary: e.target.value}))} placeholder={tr.offerSalary}/>
                                                            <Input value={offerForm.department} onChange={(e) => setOfferForm((f) => ({...f, department: e.target.value}))} placeholder={tr.offerDepartment}/>
                                                            <Input type="date" value={offerForm.entry_date} onChange={(e) => setOfferForm((f) => ({...f, entry_date: e.target.value}))} placeholder={tr.offerEntryDate}/>
                                                        </div>
                                                        <Textarea value={offerForm.offer_content} onChange={(e) => setOfferForm((f) => ({...f, offer_content: e.target.value}))} rows={3} placeholder={tr.offerContent}/>
                                                        <Input value={offerForm.notes} onChange={(e) => setOfferForm((f) => ({...f, notes: e.target.value}))} placeholder={tr.offerNotes}/>
                                                        <div className="flex justify-end gap-2">
                                                            <Button size="sm" variant="outline" onClick={() => setOfferFormOpen(false)}>{tr.batchBindPositionCancel}</Button>
                                                            <Button size="sm" disabled={offerSubmitting} onClick={async () => {
                                                                setOfferSubmitting(true);
                                                                try {
                                                                    await createOffer({
                                                                        candidate_id: candidateDetail.candidate.id,
                                                                        offer_title: offerForm.offer_title || undefined,
                                                                        salary: offerForm.salary || undefined,
                                                                        department: offerForm.department || undefined,
                                                                        entry_date: offerForm.entry_date || undefined,
                                                                        offer_content: offerForm.offer_content || undefined,
                                                                        notes: offerForm.notes || undefined,
                                                                    });
                                                                    setOfferFormOpen(false);
                                                                } finally {
                                                                    setOfferSubmitting(false);
                                                                }
                                                            }}>
                                                                {offerSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                                                {tr.batchBindPositionConfirm}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="mt-3 space-y-2">
                                                    {offers.length > 0 ? offers.map((offer) => {
                                                        const statusLabels: Record<string, string> = {draft: tr.offerStatusDraft, sent: tr.offerStatusSent, accepted: tr.offerStatusAccepted, rejected: tr.offerStatusRejected, cancelled: tr.offerStatusCancelled};
                                                        return (
                                                            <div key={offer.id} className="rounded-xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{offer.offer_title || "-"}</p>
                                                                            <Badge variant="outline" className="rounded-full text-xs">{statusLabels[offer.status] || offer.status}</Badge>
                                                                        </div>
                                                                        {offer.salary && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{offer.salary}</p>}
                                                                        {offer.department && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{offer.department}</p>}
                                                                        {offer.entry_date && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{offer.entry_date}</p>}
                                                                        {offer.offer_content && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{offer.offer_content}</p>}
                                                                    </div>
                                                                    <div className="flex items-center gap-1">
                                                                        <NativeSelect
                                                                            value={offer.status}
                                                                            onChange={(e) => void updateOffer(offer.id, {status: e.target.value})}
                                                                            className="h-6 text-xs"
                                                                        >
                                                                            <option value="draft">{tr.offerStatusDraft}</option>
                                                                            <option value="sent">{tr.offerStatusSent}</option>
                                                                            <option value="accepted">{tr.offerStatusAccepted}</option>
                                                                            <option value="rejected">{tr.offerStatusRejected}</option>
                                                                            <option value="cancelled">{tr.offerStatusCancelled}</option>
                                                                        </NativeSelect>
                                                                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-rose-500 hover:text-rose-700" onClick={() => { if (window.confirm(tr.confirmDeleteOffer)) void deleteOffer(offer.id); }}>
                                                                            <Trash2 className="h-3.5 w-3.5"/>
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    }) : (
                                                        <EmptyState title={tr.noOffers} description={tr.noOffersDesc}/>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    ) : null}

                                    {candidateDetailPanel === "background" ? (
                                        <>
                                            <div className="rounded-md border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950">
                                                <p className="text-base font-medium text-slate-900 dark:text-slate-100">{isZh ? "背调信息" : "Background Check"}</p>
                                                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                                    {isZh ? "当前系统还没有独立背调数据模型，先把跟进记录放在这里承接；后续新增背调供应商、授权、报告状态时可以直接扩展本页。" : "No dedicated background-check data model is available yet. Follow-up notes are shown here for now and can be extended with providers, authorizations, and report status later."}
                                                </p>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{tr.followUps}</p>
                                                    <Button size="sm" variant="outline" onClick={() => { setFollowUpContent(""); setFollowUpType("note"); setFollowUpFormOpen(!followUpFormOpen); }}>
                                                        <Plus className="h-4 w-4"/>
                                                        {tr.addFollowUp}
                                                    </Button>
                                                </div>
                                                {followUpFormOpen && candidateDetail && (
                                                    <div className="mt-3 space-y-2 rounded-xl border border-slate-200/70 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                                                        <Textarea value={followUpContent} onChange={(e) => setFollowUpContent(e.target.value)} rows={3} placeholder={tr.followUpContentPlaceholder}/>
                                                        <div className="flex items-center gap-2">
                                                            <NativeSelect value={followUpType} onChange={(e) => setFollowUpType(e.target.value)} className="h-8 text-xs">
                                                                <option value="note">{tr.followUpTypeNote}</option>
                                                                <option value="call">{tr.followUpTypeCall}</option>
                                                                <option value="email">{tr.followUpTypeEmail}</option>
                                                                <option value="interview">{tr.followUpTypeInterview}</option>
                                                                <option value="other">{tr.followUpTypeOther}</option>
                                                            </NativeSelect>
                                                            <div className="flex-1"/>
                                                            <Button size="sm" variant="outline" onClick={() => setFollowUpFormOpen(false)}>{tr.batchBindPositionCancel}</Button>
                                                            <Button size="sm" disabled={followUpSubmitting || !followUpContent.trim()} onClick={async () => {
                                                                setFollowUpSubmitting(true);
                                                                try {
                                                                    await createFollowUp(candidateDetail.candidate.id, followUpContent.trim(), followUpType);
                                                                    setFollowUpFormOpen(false);
                                                                    setFollowUpContent("");
                                                                } finally {
                                                                    setFollowUpSubmitting(false);
                                                                }
                                                            }}>
                                                                {followUpSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                                                {tr.batchBindPositionConfirm}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="mt-3 space-y-2">
                                                    {followUps.length > 0 ? followUps.map((fu) => {
                                                        const typeLabels: Record<string, string> = {note: tr.followUpTypeNote, call: tr.followUpTypeCall, email: tr.followUpTypeEmail, interview: tr.followUpTypeInterview, other: tr.followUpTypeOther};
                                                        return (
                                                            <div key={fu.id} className="rounded-xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <Badge variant="outline" className="rounded-full text-xs">{typeLabels[fu.follow_up_type] || fu.follow_up_type}</Badge>
                                                                            {fu.created_at && <span className="text-xs text-slate-400 dark:text-slate-500">{formatDateTime(fu.created_at)}</span>}
                                                                        </div>
                                                                        <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{fu.content}</p>
                                                                    </div>
                                                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-rose-500 hover:text-rose-700" onClick={() => { if (window.confirm(tr.confirmDeleteFollowUp)) void deleteFollowUp(fu.id); }}>
                                                                        <Trash2 className="h-3.5 w-3.5"/>
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        );
                                                    }) : (
                                                        <EmptyState title={tr.noFollowUps} description={tr.noFollowUpsDesc}/>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    ) : null}

                                    {candidateDetailPanel === "assessment" ? (
                                        <>
                                            <div className="min-w-0 space-y-2">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{tr.aiScoreAndAdvice}</p>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setCandidateAiOutputDialogOpen(true)}
                                                        disabled={!candidateAiOutputAvailable}
                                                    >
                                                        <Bot className="h-4 w-4"/>
                                                        {tr.viewFullAiOutput}
                                                    </Button>
                                                </div>
                                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
                                                                    {candidateScoreDisplayValues.totalScore !== null
                                                                        ? formatScoreValue(
                                                                            candidateScoreDisplayValues.totalScore,
                                                                            candidateScoreDisplayValues.totalScoreScale,
                                                                        )
                                                                        : "-"}
                                                                </p>
                                                            <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">
                                                                {tr.aiRecommendationLine(
                                                                    candidateScoreDecisionValues.recommendation || "-",
                                                                    labelForCandidateStatus(candidateScoreDecisionValues.suggestedStatus) || "-",
                                                                )}
                                                            </p>
                                                        </div>
                                                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                                                            {candidateDetail.score?.score_validation_passed === false ? (
                                                                <Badge variant="outline" className="rounded-full border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                                                    {tr.scoreValidationWarnings}
                                                                </Badge>
                                                            ) : null}
                                                            <Badge variant="outline" className="rounded-full">
                                                                {tr.matchBadge} {candidateScoreDisplayValues.matchPercent !== null
                                                                    ? formatPercent(candidateScoreDisplayValues.matchPercent)
                                                                    : "-"}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                    <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                                                        {Array.isArray(candidateDetail.score?.validation_warnings) && candidateDetail.score.validation_warnings.length > 0 ? (
                                                            <details className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/80 dark:bg-amber-950/30 dark:text-amber-200">
                                                                <summary className="cursor-pointer font-medium">{tr.viewScoreWarnings}</summary>
                                                                <ul className="mt-2 space-y-1">
                                                                    {candidateDetail.score.validation_warnings.map((item, index) => (
                                                                        <li key={`score-warning-${index}`} className="break-words leading-6">
                                                                            {index + 1}. {item}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </details>
                                                        ) : null}
                                                        <div className="space-y-2">
                                                            <p className="font-medium text-slate-900 dark:text-slate-100">{tr.strengths}</p>
                                                            {readScoreTextArray(candidateDetail.score?.advantages).length > 0 ? (
                                                                <ul className="space-y-1">
                                                                    {readScoreTextArray(candidateDetail.score?.advantages).map((item, index) => (
                                                                        <li key={`advantage-${index}`} className="break-words leading-7">
                                                                            {index + 1}. {item}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            ) : (
                                                                <p className="break-words leading-7">-</p>
                                                            )}
                                                        </div>
                                                        <div className="space-y-2">
                                                            <p className="font-medium text-slate-900 dark:text-slate-100">{tr.risks}</p>
                                                            {readScoreTextArray(candidateDetail.score?.concerns).length > 0 ? (
                                                                <ul className="space-y-1">
                                                                    {readScoreTextArray(candidateDetail.score?.concerns).map((item, index) => (
                                                                        <li key={`concern-${index}`} className="break-words leading-7">
                                                                            {index + 1}. {item}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            ) : (
                                                                <p className="break-words leading-7">-</p>
                                                            )}
                                                        </div>
                                                        <div className="space-y-2">
                                                            <p className="font-medium text-slate-900 dark:text-slate-100">{isZh ? "综合能力概览" : "Competency Overview"}</p>
                                                            <CandidateRadarChart
                                                                dimensions={readScoreDimensions(candidateDetail.score?.dimensions)}
                                                                radarScores={candidateDetail.score?.radar_scores}
                                                                isZh={isZh}
                                                                mode="aggregated"
                                                                uiText={{
                                                                    scoreDetails: isZh ? "评分详情" : "Score Details",
                                                                    coreSkills: isZh ? "核心能力" : "Core Competencies",
                                                                    otherSkills: isZh ? "其他维度" : "Other Dimensions",
                                                                    noData: isZh ? "AI 尚未完成维度评分" : "No evaluation data",
                                                                    benchmark: isZh ? "岗位基准线" : "Benchmark",
                                                                }}
                                                            />
                                                            <p className="font-medium text-slate-900 dark:text-slate-100 mt-4">{isZh ? "各维度得分" : "Dimension Scores"}</p>
                                                            <CandidateRadarChart
                                                                dimensions={readScoreDimensions(candidateDetail.score?.dimensions)}
                                                                isZh={isZh}
                                                                mode="individual"
                                                                uiText={{
                                                                    scoreDetails: isZh ? "评分详情" : "Score Details",
                                                                    coreSkills: isZh ? "核心能力" : "Core Competencies",
                                                                    otherSkills: isZh ? "其他维度" : "Other Dimensions",
                                                                    noData: isZh ? "AI 尚未完成维度评分" : "No evaluation data",
                                                                    benchmark: isZh ? "岗位基准线" : "Benchmark",
                                                                }}
                                                            />
                                                            <p className="font-medium text-slate-900 dark:text-slate-100 mt-4">{tr.dimensionScores}</p>
                                                            {readScoreDimensions(candidateDetail.score?.dimensions).length > 0 ? (
                                                                <ul className="space-y-2">
                                                                    {readScoreDimensions(candidateDetail.score?.dimensions).map((item, index) => {
                                                                        const label = readScoreText(item.label) || "-";
                                                                        const scoreValue = readScoreNumberStrict(item.score);
                                                                        const maxScore = readScoreNumberStrict(item.max_score);
                                                                        const evidences = readDimensionEvidenceList(item.evidence);
                                                                        const reason = readScoreText(item.reason);
                                                                        const isInferred = item.is_inferred === true;
                                                                        const percent = scoreValue !== null && maxScore !== null && maxScore > 0
                                                                            ? Math.min(100, Math.round((scoreValue / maxScore) * 100))
                                                                            : null;
                                                                        return (
                                                                            <li key={`dimension-${index}`} className="rounded-xl border border-slate-200/70 px-3 py-3 dark:border-slate-800">
                                                                                <div className="flex items-center justify-between gap-2">
                                                                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                                                        {label}
                                                                                        {isInferred ? <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">{tr.inferredDimension}</span> : null}
                                                                                    </p>
                                                                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                                                                        {scoreValue !== null ? scoreValue : "-"} / {maxScore !== null ? maxScore : "-"}
                                                                                    </p>
                                                                                </div>
                                                                                {percent !== null && (
                                                                                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                                                                        <div
                                                                                            className={`h-full rounded-full transition-all ${percent >= 80 ? "bg-emerald-500" : percent >= 60 ? "bg-[#171717]" : percent >= 40 ? "bg-amber-500" : "bg-rose-500"}`}
                                                                                            style={{width: `${percent}%`}}
                                                                                        />
                                                                                    </div>
                                                                                )}
                                                                                {reason && (
                                                                                    <div className="mt-2 text-xs leading-6 text-slate-600 dark:text-slate-300">
                                                                                        <p className="font-medium text-slate-700 dark:text-slate-200">{tr.dimensionReason}:</p>
                                                                                        <p className="mt-0.5 break-words">{reason}</p>
                                                                                    </div>
                                                                                )}
                                                                                <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
                                                                                    <p>{tr.evidence}:</p>
                                                                                    {evidences.length ? (
                                                                                        <ul className="mt-1 space-y-1">
                                                                                            {evidences.map((evidence, evidenceIndex) => (
                                                                                                <li key={`dimension-${index}-evidence-${evidenceIndex}`} className="break-words">
                                                                                                    {evidence}
                                                                                                </li>
                                                                                            ))}
                                                                                        </ul>
                                                                                    ) : (
                                                                                        <p>-</p>
                                                                                    )}
                                                                                </div>
                                                                            </li>
                                                                        );
                                                                    })}
                                                                </ul>
                                                            ) : (
                                                                <p className="break-words leading-7">-</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid gap-4 md:grid-cols-2">
                                                <Field label={tr.manualOverrideScore}>
                                                    <Input value={candidateEditor.manualOverrideScore} onChange={(event) => setCandidateEditor((current) => ({...current, manualOverrideScore: event.target.value}))} placeholder={tr.overrideScorePlaceholder}/>
                                                </Field>
                                                <Field label={tr.overrideReason}>
                                                    <Input value={candidateEditor.manualOverrideReason} onChange={(event) => setCandidateEditor((current) => ({...current, manualOverrideReason: event.target.value}))} placeholder={tr.overrideReasonPlaceholder}/>
                                                </Field>
                                            </div>

                                            <Field label={tr.hrFeedback}>
                                                <div className="space-y-3">
                                                    <div className="flex flex-wrap gap-2">
                                                        {[
                                                            {value: "agree", label: tr.hrFeedbackAgree, activeClass: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"},
                                                            {value: "disagree", label: tr.hrFeedbackDisagree, activeClass: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"},
                                                            {value: "neutral", label: tr.hrFeedbackNeutral, activeClass: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"},
                                                        ].map((opt) => {
                                                            const isActive = candidateEditor.hrFeedback === opt.value;
                                                            return (
                                                                <Button
                                                                    key={opt.value}
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className={isActive ? opt.activeClass : ""}
                                                                    onClick={() => setCandidateEditor((current) => ({...current, hrFeedback: isActive ? "" : opt.value}))}
                                                                >
                                                                    {opt.label}
                                                                </Button>
                                                            );
                                                        })}
                                                    </div>
                                                    {candidateEditor.hrFeedback && (
                                                        <Input
                                                            value={candidateEditor.hrFeedbackReason}
                                                            onChange={(event) => setCandidateEditor((current) => ({...current, hrFeedbackReason: event.target.value}))}
                                                            placeholder={tr.hrFeedbackReasonPlaceholder}
                                                        />
                                                    )}
                                                </div>
                                            </Field>

                                            <Button onClick={() => void saveCandidate()} disabled={candidateSaving}>
                                                <Save className="h-4 w-4"/>
                                                {candidateSaving ? tr.savingCandidate : tr.saveCandidateInfo}
                                            </Button>

                                        </>
                                    ) : null}

                                    {candidateDetailPanel === "exam" ? (
                                        <div className="rounded-md border border-dashed border-slate-200 bg-white px-4 py-10 dark:border-slate-800 dark:bg-slate-950">
                                            <EmptyState
                                                title={isZh ? "暂无考试记录" : "No Exam Records"}
                                                description={isZh ? "考试模块先按竞品结构预留，后续接入笔试、测评考试或第三方测评后可直接落在这里。" : "The exam section is reserved for written tests, assessment exams, or third-party assessments."}
                                            />
                                        </div>
                                    ) : null}

                                    {candidateDetailPanel === "interview" ? (
                                        <div className="space-y-4">
                                            <div className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70 space-y-3">
                                                <div className="grid gap-3">
                                                    <Input value={interviewRoundName} onChange={(event) => setInterviewRoundName(event.target.value)} placeholder={tr.roundPlaceholder}/>
                                                    <Input value={joinTags(effectiveInterviewSkillIds.map((id) => skillMap.get(id)?.name || ""))} readOnly placeholder={tr.currentSkillsPlaceholder}/>
                                                </div>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">{tr.defaultInterviewSource(preferredInterviewSkillSourceLabel)}</p>
                                                <Textarea
                                                    value={interviewCustomRequirements}
                                                    onChange={(event) => setInterviewCustomRequirements(event.target.value)}
                                                    rows={3}
                                                    placeholder={tr.interviewRequirementsPlaceholder}
                                                />
                                                <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                                                    {tr.actualSkills(formatSkillNames(effectiveInterviewSkillIds, skillMap, language))}
                                                </p>
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <p className="text-xs text-slate-500 dark:text-slate-400">{tr.actualSource(effectiveInterviewSkillSourceLabel)}</p>
                                                    {interviewSkillSelectionDirty ? (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => {
                                                                setSelectedInterviewSkillIds([]);
                                                                setInterviewSkillSelectionDirty(false);
                                                            }}
                                                        >
                                                            {tr.restoreDefaultSkills}
                                                        </Button>
                                                    ) : null}
                                                </div>
                                                <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                                                    {!interviewSkillSelectionDirty
                                                        ? tr.interviewSkillHintDefault
                                                        : tr.interviewSkillHintManual}
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {skills.map((skill) => (
                                                        <button
                                                            key={skill.id}
                                                            type="button"
                                                            className={cn(
                                                                "rounded-full border px-3 py-2 text-xs transition",
                                                                effectiveInterviewSkillIds.includes(skill.id)
                                                                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                                    : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                                            )}
                                                            onClick={() => toggleInterviewSkillSelection(skill.id)}
                                                        >
                                                            {skill.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
                                                {latestInterviewQuestion ? (
                                                    <InterviewQuestionCard
                                                        question={latestInterviewQuestion}
                                                        onDownload={() => void downloadInterviewQuestion(latestInterviewQuestion.id)}
                                                        onPreview={() => {
                                                            const blob = new Blob([latestInterviewQuestion.html_content], {type: "text/html"});
                                                            const previewUrl = URL.createObjectURL(blob);
                                                            window.open(previewUrl, "_blank", "noopener,noreferrer");
                                                            window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
                                                        }}
                                                    />
                                                ) : (
                                                    <EmptyState title={tr.noInterviewQuestions} description={tr.noInterviewQuestionsDesc}/>
                                                )}
                                            </div>

                                            <div className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{tr.interviewSchedules}</p>
                                                    <Button size="sm" variant="outline" onClick={() => {
                                                        if (scheduleFormOpen) {
                                                            setScheduleFormOpen(false);
                                                            return;
                                                        }
                                                        openInterviewScheduleForm();
                                                    }}>
                                                        <Plus className="h-4 w-4"/>
                                                        {tr.addSchedule}
                                                    </Button>
                                                </div>
                                                {scheduleFormOpen && candidateDetail && (
                                                    <div className="mt-3 space-y-2 rounded-xl border border-slate-200/70 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                                                        <div className="grid gap-2 md:grid-cols-2">
                                                            <Input value={scheduleForm.round_name} onChange={(e) => setScheduleForm((f) => ({...f, round_name: e.target.value}))} placeholder={tr.scheduleRound}/>
                                                            <Input type="number" min={1} value={scheduleForm.round_index} onChange={(e) => setScheduleForm((f) => ({...f, round_index: e.target.value}))} placeholder={isZh ? "面试轮次" : "Round index"}/>
                                                            <NativeSelect
                                                                value={scheduleForm.interviewer_user_code}
                                                                onChange={(event) => {
                                                                    const userCode = event.target.value;
                                                                    const reviewer = interviewerByCode.get(userCode);
                                                                    setScheduleForm((current) => ({
                                                                        ...current,
                                                                        interviewer_user_code: userCode,
                                                                        interviewer_name: reviewer?.name || reviewer?.display_name || userCode,
                                                                        availability_slot_id: "",
                                                                    }));
                                                                }}
                                                                className="h-10"
                                                            >
                                                                <option value="">{interviewerLoading ? (isZh ? "正在加载面试官..." : "Loading interviewers...") : (isZh ? "选择面试官" : "Select interviewer")}</option>
                                                                {interviewerOptions.map((reviewer) => (
                                                                    <option key={reviewer.user_code} value={reviewer.user_code}>
                                                                        {reviewer.name || reviewer.display_name || reviewer.user_code} · {reviewer.user_code}
                                                                    </option>
                                                                ))}
                                                            </NativeSelect>
                                                            <NativeSelect
                                                                value={scheduleForm.availability_slot_id}
                                                                onChange={(event) => applyScheduleAvailabilitySlot(event.target.value)}
                                                                disabled={!scheduleForm.interviewer_user_code || scheduleAvailabilityLoading}
                                                                className="h-10"
                                                            >
                                                                <option value="">
                                                                    {scheduleForm.interviewer_user_code
                                                                        ? (isZh ? "选择可面试时间（可手动填写）" : "Select available time or fill manually")
                                                                        : (isZh ? "先选择面试官" : "Select interviewer first")}
                                                                </option>
                                                                {scheduleAvailabilitySlots.map((slot) => (
                                                                    <option key={slot.id} value={String(slot.id)}>
                                                                        {formatDateTime(slot.start_at)} - {formatDateTime(slot.end_at)}{slot.notes ? ` · ${slot.notes}` : ""}
                                                                    </option>
                                                                ))}
                                                            </NativeSelect>
                                                            <Input type="datetime-local" value={scheduleForm.scheduled_at} onChange={(e) => setScheduleForm((f) => ({...f, scheduled_at: e.target.value}))} placeholder={tr.scheduleTime}/>
                                                            <Input type="number" value={scheduleForm.duration_minutes} onChange={(e) => setScheduleForm((f) => ({...f, duration_minutes: e.target.value}))} placeholder={tr.scheduleDuration}/>
                                                            <Input value={scheduleForm.location} onChange={(e) => setScheduleForm((f) => ({...f, location: e.target.value}))} placeholder={tr.scheduleLocation}/>
                                                            <Input value={scheduleForm.meeting_link} onChange={(e) => setScheduleForm((f) => ({...f, meeting_link: e.target.value}))} placeholder={tr.scheduleMeetingLink}/>
                                                        </div>
                                                        {scheduleForm.interviewer_user_code && !scheduleAvailabilityLoading && scheduleAvailabilitySlots.length === 0 ? (
                                                            <p className="text-xs text-amber-600">
                                                                {isZh ? "该面试官近 14 天暂无可面试时间，可以手动填写时间；保存时系统仍会校验冲突。" : "No available slots in the next 14 days. You can fill the time manually; conflicts are still checked."}
                                                            </p>
                                                        ) : null}
                                                        <Textarea value={scheduleForm.notes} onChange={(e) => setScheduleForm((f) => ({...f, notes: e.target.value}))} rows={2} placeholder={tr.scheduleNotes}/>
                                                        <div className="flex justify-end gap-2">
                                                            <Button size="sm" variant="outline" onClick={() => setScheduleFormOpen(false)}>{tr.batchBindPositionCancel}</Button>
                                                            <Button size="sm" disabled={scheduleSubmitting || !scheduleFormCanSubmit} onClick={async () => {
                                                                setScheduleSubmitting(true);
                                                                try {
                                                                    await createInterviewSchedule({
                                                                        candidate_id: candidateDetail.candidate.id,
                                                                        round_name: scheduleForm.round_name || undefined,
                                                                        round_index: scheduleForm.round_index ? Number(scheduleForm.round_index) : undefined,
                                                                        interviewer_user_code: scheduleForm.interviewer_user_code || undefined,
                                                                        interviewer_name: scheduleForm.interviewer_name || undefined,
                                                                        scheduled_at: scheduleForm.scheduled_at ? new Date(scheduleForm.scheduled_at).toISOString() : undefined,
                                                                        duration_minutes: scheduleForm.duration_minutes ? Number(scheduleForm.duration_minutes) : undefined,
                                                                        availability_slot_id: scheduleForm.availability_slot_id ? Number(scheduleForm.availability_slot_id) : undefined,
                                                                        department_review_assignment_id: scheduleForm.department_review_assignment_id ? Number(scheduleForm.department_review_assignment_id) : undefined,
                                                                        location: scheduleForm.location || undefined,
                                                                        meeting_link: scheduleForm.meeting_link || undefined,
                                                                        notes: scheduleForm.notes || undefined,
                                                                    });
                                                                    setScheduleFormOpen(false);
                                                                } catch (error) {
                                                                    toast.error(isZh ? `安排面试失败：${formatActionError(error)}` : `Failed to schedule interview: ${formatActionError(error)}`);
                                                                } finally {
                                                                    setScheduleSubmitting(false);
                                                                }
                                                            }}>
                                                                {scheduleSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                                                {tr.batchBindPositionConfirm}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="mt-3 space-y-2">
                                                    {interviewSchedules.length > 0 ? interviewSchedules.map((schedule) => (
                                                        <div key={schedule.id} className="rounded-xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                                        {schedule.round_name}
                                                                        {schedule.interviewer_name ? ` · ${schedule.interviewer_name}` : ""}
                                                                    </p>
                                                                    {schedule.scheduled_at && (
                                                                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                                                            <Calendar className="h-3 w-3"/>
                                                                            {new Date(schedule.scheduled_at).toLocaleString()}
                                                                            {schedule.duration_minutes ? ` (${schedule.duration_minutes} min)` : ""}
                                                                        </p>
                                                                    )}
                                                                    {schedule.location && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{schedule.location}</p>}
                                                                    {schedule.meeting_link && <p className="mt-0.5 text-xs text-[#171717] dark:text-neutral-400 truncate">{schedule.meeting_link}</p>}
                                                                    {schedule.notes && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{schedule.notes}</p>}
                                                                </div>
                                                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-rose-500 hover:text-rose-700" onClick={() => { if (window.confirm(tr.confirmDeleteSchedule)) void deleteInterviewSchedule(schedule.id); }}>
                                                                    <Trash2 className="h-3.5 w-3.5"/>
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )) : (
                                                        <EmptyState title={tr.noSchedules} description={tr.noSchedulesDesc}/>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}
                                    </div>
                                </div>
                            </section>
                            <aside className={cn("hidden min-h-0 overflow-y-auto bg-[#f4f7fb] px-4 py-4 lg:block", SMOOTH_VERTICAL_SCROLLBAR_CLASS)}>
                                <div className="space-y-3">
                                    {isDepartmentReviewDecisionMode ? (
                                        <>
                                            <div className="rounded-[6px] bg-white px-5 py-5">
                                                <div className="flex items-center justify-between">
                                                    {candidateDetailFlowSteps.map((step, index) => {
                                                        const isActive = index === candidateDetailFlowIndex;
                                                        const isDone = index < candidateDetailFlowIndex;
                                                        return (
                                                            <React.Fragment key={step.status}>
                                                                <span className={cn(
                                                                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                                                                    isActive || isDone ? "bg-[#171717] text-white" : "bg-slate-300 text-white",
                                                                )}>
                                                                    {index + 1}
                                                                </span>
                                                                {index < candidateDetailFlowSteps.length - 1 ? (
                                                                    <span className={cn("h-px flex-1 border-t border-dashed", index < candidateDetailFlowIndex ? "border-[#171717]" : "border-slate-300")}/>
                                                                ) : null}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </div>
                                                <div className="mt-3">
                                                    <p className="text-[15px] font-medium text-slate-900">
                                                        {isZh ? "部门评审" : "Department Review"}
                                                    </p>
                                                    <p className="mt-1 text-[13px] text-slate-500">
                                                        {departmentReviewDecisionContext?.reviewerName
                                                            ? (isZh ? `评审人：${departmentReviewDecisionContext.reviewerName}` : `Reviewer: ${departmentReviewDecisionContext.reviewerName}`)
                                                            : labelForCandidateStatus(candidateDetailDisplayStatus)}
                                                    </p>
                                                </div>
                                                <div className="mt-5 grid gap-2">
                                                    <RailActionButton
                                                        tone="success"
                                                        onClick={() => void submitCandidateDetailDepartmentReviewDecision("passed")}
                                                        disabled={Boolean(departmentReviewDecisionSubmitting)}
                                                    >
                                                        {departmentReviewDecisionSubmitting === "passed" ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : null}
                                                        {isZh ? "通过" : "Pass"}
                                                    </RailActionButton>
                                                    <RailActionButton
                                                        tone="danger"
                                                        onClick={() => void submitCandidateDetailDepartmentReviewDecision("rejected")}
                                                        disabled={Boolean(departmentReviewDecisionSubmitting)}
                                                    >
                                                        {departmentReviewDecisionSubmitting === "rejected" ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : null}
                                                        {isZh ? "淘汰" : "Reject"}
                                                    </RailActionButton>
                                                </div>
                                            </div>
                                            <div className="rounded-[6px] bg-white px-5 py-4">
                                                <div className="flex items-center gap-5 border-b border-slate-100">
                                                    <button type="button" className="relative h-9 text-[15px] font-semibold text-[#171717]">
                                                        {isZh ? "备注" : "Notes"}
                                                        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#171717]"/>
                                                    </button>
                                                </div>
                                                <Textarea
                                                    value={departmentReviewDecisionComment}
                                                    onChange={(event) => setDepartmentReviewDecisionComment(event.target.value)}
                                                    rows={6}
                                                    maxLength={1000}
                                                    className="mt-4 resize-none rounded-[4px] border-slate-200 text-[14px]"
                                                    placeholder={isZh ? "填写评审意见，点击通过或淘汰时会一并提交" : "Add review comments. They will be submitted with Pass or Reject."}
                                                />
                                                <div className="mt-3 flex items-center justify-end text-[13px] text-slate-500">
                                                    <span>{departmentReviewDecisionComment.length}/1000</span>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                    <div className="rounded-[6px] bg-white px-5 py-5">
                                        <div className="flex items-center justify-between">
                                            {candidateDetailFlowSteps.map((step, index) => {
                                                const isActive = index === candidateDetailFlowIndex;
                                                const isDone = index < candidateDetailFlowIndex;
                                                return (
                                                    <React.Fragment key={step.status}>
                                                        <span className={cn(
                                                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                                                            isActive || isDone ? "bg-[#171717] text-white" : "bg-slate-300 text-white",
                                                        )}>
                                                            {index + 1}
                                                        </span>
                                                        {index < candidateDetailFlowSteps.length - 1 ? (
                                                            <span className={cn("h-px flex-1 border-t border-dashed", index < candidateDetailFlowIndex ? "border-[#171717]" : "border-slate-300")}/>
                                                        ) : null}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </div>
                                        <div className="mt-3">
                                            <p className="text-[15px] font-medium text-slate-900">
                                                {candidateDetailFlowSteps[candidateDetailFlowIndex]?.label || labelForCandidateStatus(candidateDetailDisplayStatus)}
                                            </p>
                                            <p className="mt-1 text-[13px] text-slate-500">
                                                {labelForCandidateStatus(candidateDetailDisplayStatus)}
                                            </p>
                                        </div>
                                        <div className="mt-5 grid gap-2">
                                            <RailActionButton
                                                tone="primary"
                                                onClick={() => void handleCandidateDetailScreeningAction()}
                                                disabled={screeningSubmitting || candidateDetailScreeningLive}
                                            >
                                                {screeningSubmitting || candidateDetailScreeningLive ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <Sparkles className="mr-1 h-4 w-4"/>}
                                                {candidateDetailScreeningActionLabel}
                                            </RailActionButton>
                                            <RailActionButton tone="success" onClick={() => void updateCandidateStatus("screening_passed")}>
                                                {isZh ? "通过" : "Pass"}
                                            </RailActionButton>
                                            <RailActionButton tone="warning" onClick={() => void updateCandidateStatus("pending_screening")}>
                                                {isZh ? "待定" : "Pending"}
                                            </RailActionButton>
                                            <RailActionButton tone="danger" onClick={() => void updateCandidateStatus("screening_rejected")}>
                                                {isZh ? "淘汰" : "Reject"}
                                            </RailActionButton>
                                        </div>
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            <RailActionButton
                                                onClick={openDepartmentReviewDialog}
                                                disabled={!createDepartmentReview}
                                            >
                                                {isZh ? "提交部门评审" : "Submit Review"}
                                            </RailActionButton>
                                            <RailActionButton onClick={openCandidatePositionDialog}>
                                                {isZh ? "转移" : "Transfer"}
                                            </RailActionButton>
                                            <RailActionButton onClick={() => setCandidateDetailPanel("exam")}>
                                                {isZh ? "邀请测评" : "Assessment"}
                                            </RailActionButton>
                                            <RailActionButton onClick={() => openResumeMailDialog([candidateDetail.candidate.id])}>
                                                {isZh ? "邀请更新简历" : "Update Resume"}
                                            </RailActionButton>
                                            <RailActionButton onClick={openCandidatePositionDialog}>
                                                {isZh ? "推荐到职位" : "Recommend"}
                                            </RailActionButton>
                                            <RailActionButton onClick={() => openResumeMailDialog([candidateDetail.candidate.id])}>
                                                {isZh ? "转发简历" : "Forward Resume"}
                                            </RailActionButton>
                                            <RailActionButton onClick={() => void updateCandidateStatus("talent_pool")}>
                                                {isZh ? "储备至人才库" : "Talent Pool"}
                                            </RailActionButton>
                                            <RailActionButton disabled>
                                                {isZh ? "加入黑名单" : "Blacklist"}
                                            </RailActionButton>
                                            <RailActionButton tone="danger" onClick={() => requestDeleteCandidate(candidateDetail.candidate)}>
                                                {isZh ? "删除" : "Delete"}
                                            </RailActionButton>
                                            <RailActionButton disabled>
                                                {isZh ? "加入人才地图" : "Talent Map"}
                                            </RailActionButton>
                                            <RailActionButton onClick={() => void generateInterviewQuestions()} disabled={isCurrentInterviewTaskCancelling}>
                                                {isCurrentInterviewTaskCancelling ? tr.stopping : currentCandidateInterviewTaskId ? tr.stopGeneration : tr.interviewQuestions}
                                            </RailActionButton>
                                        </div>
                                        <button type="button" className="mt-4 w-full text-center text-[13px] font-medium text-[#171717]">
                                            {isZh ? "操作设置" : "Action Settings"}
                                        </button>
                                    </div>
                                    {shouldShowCurrentScreeningTask ? (
                                        <div className="rounded-[6px] bg-white px-5 py-4">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-[15px] font-semibold text-slate-900">{tr.currentScreeningTask}</p>
                                                {currentScreeningTaskStatus ? (
                                                    <Badge className={cn("rounded-[3px] border", statusBadgeClass("task", currentScreeningTaskStatus))}>
                                                        {labelForTaskExecutionStatus(currentScreeningTaskStatus)}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                            {(() => {
                                                const autoRetry = Boolean(candidateDetail?.candidate.active_screening_auto_retry_scheduled);
                                                const logMsg = sanitizeTaskMessage(
                                                    currentScreeningTaskLog?.output_summary || currentScreeningTaskLog?.error_message || "",
                                                    currentScreeningTaskType || currentScreeningTaskLog?.task_type,
                                                    autoRetry,
                                                );
                                                const displayReason = sanitizeTaskMessage(
                                                    candidateDetail?.candidate.display_status_reason || "",
                                                    currentScreeningTaskType || candidateDetail?.candidate.active_screening_task_type,
                                                    autoRetry,
                                                );
                                                const primary = displayReason || logMsg || tr.taskRunning;
                                                return <p className="mt-2 text-[13px] leading-6 text-slate-500">{primary}</p>;
                                            })()}
                                        </div>
                                    ) : null}
                                    <div className="rounded-[6px] bg-white px-5 py-4">
                                        <div className="flex items-center gap-5 border-b border-slate-100">
                                            <button
                                                type="button"
                                                onClick={() => setCandidateDetailSideRailTab("note")}
                                                className={cn(
                                                    "relative h-9 text-[15px] transition",
                                                    candidateDetailSideRailTab === "note"
                                                        ? "font-semibold text-[#171717]"
                                                        : "text-slate-600 hover:text-slate-900",
                                                )}
                                            >
                                                {isZh ? "备注" : "Notes"}
                                                {candidateDetailSideRailTab === "note" ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#171717]"/> : null}
                                            </button>
                                            <button
                                                type="button"
                                                className={cn(
                                                    "relative h-9 text-[15px] transition",
                                                    candidateDetailSideRailTab === "followups"
                                                        ? "font-semibold text-[#171717]"
                                                        : "text-slate-600 hover:text-slate-900",
                                                )}
                                                onClick={() => {
                                                    setCandidateDetailSideRailTab("followups");
                                                    setCandidateDetailPanel("background");
                                                }}
                                            >
                                                {isZh ? "我的跟进" : "Follow-ups"}
                                                {candidateDetailSideRailTab === "followups" ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#171717]"/> : null}
                                            </button>
                                        </div>
                                        {candidateDetailSideRailTab === "note" ? (
                                            <>
                                                <Textarea
                                                    value={statusUpdateReason}
                                                    onChange={(event) => setStatusUpdateReason(event.target.value)}
                                                    rows={5}
                                                    maxLength={1000}
                                                    className="mt-4 resize-none rounded-[4px] border-slate-200 text-[14px]"
                                                    placeholder={isZh ? "填写候选人备注，保存后会进入跟进记录" : "Add a candidate note. It will be saved to follow-ups."}
                                                />
                                                <div className="mt-3 flex items-center justify-between gap-2 text-[13px] text-slate-500">
                                                    <span>@ {isZh ? "同事" : "Colleague"}</span>
                                                    <span>{statusUpdateReason.length}/1000</span>
                                                    <Button
                                                        size="sm"
                                                        className="h-7 rounded-[4px] bg-[#6c7cff] px-3 text-[13px] text-white hover:bg-[#5264f6]"
                                                        onClick={() => void saveCandidateDetailNote()}
                                                        disabled={candidateDetailNoteSubmitting || !statusUpdateReason.trim()}
                                                    >
                                                        {candidateDetailNoteSubmitting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : null}
                                                        {isZh ? "确定" : "Confirm"}
                                                    </Button>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="mt-4 space-y-2">
                                                {followUps.length ? (
                                                    followUps.slice(0, 4).map((followUp) => {
                                                        const typeLabels: Record<string, string> = {
                                                            note: tr.followUpTypeNote,
                                                            call: tr.followUpTypeCall,
                                                            email: tr.followUpTypeEmail,
                                                            interview: tr.followUpTypeInterview,
                                                            other: tr.followUpTypeOther,
                                                        };
                                                        return (
                                                            <div key={followUp.id} className="rounded-[6px] border border-slate-100 bg-slate-50 px-3 py-2">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-[12px] font-medium text-[#171717]">
                                                                        {typeLabels[followUp.follow_up_type] || followUp.follow_up_type}
                                                                    </span>
                                                                    {followUp.created_at ? <span className="shrink-0 text-[12px] text-slate-400">{formatDateTime(followUp.created_at)}</span> : null}
                                                                </div>
                                                                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] leading-5 text-slate-600">{followUp.content}</p>
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="rounded-[6px] border border-dashed border-slate-200 px-3 py-5 text-center text-[13px] text-slate-400">
                                                        {isZh ? "暂无跟进记录" : "No follow-ups yet"}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                        </>
                                    )}
                                </div>
                            </aside>
                        </div>
                    ) : (
                        <div className="flex h-full min-h-0 flex-1 flex-col">
                            <div className="border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
                                <div className="space-y-1.5">
                                    <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{tr.candidateWorkspace}</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{tr.candidateWorkspaceDesc}</p>
                                </div>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                                <div className="space-y-5 px-5 py-5">
                                    <div className="grid gap-3 md:grid-cols-2">
                                        {candidateOverviewStats.map((item) => (
                                            <InfoTile key={item.label} label={item.label} value={item.value}/>
                                        ))}
                                    </div>

                                    <Field label={tr.recentCandidates}>
                                        <div className="space-y-3">
                                            {candidatesLoading || !candidatesInitialLoaded ? (
                                                <div className="flex items-center justify-center py-8">
                                                    <LoadingPanel label={tr.loadingCandidateList}/>
                                                </div>
                                            ) : recentVisibleCandidates.length ? recentVisibleCandidates.map((candidate) => (
                                                <button
                                                    key={candidate.id}
                                                    type="button"
                                                    className="flex w-full items-start justify-between rounded-2xl border border-slate-200/80 px-4 py-4 text-left transition hover:border-slate-400 dark:border-slate-800"
                                                    onClick={() => setSelectedCandidateId(candidate.id)}
                                                >
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-slate-900 dark:text-slate-100">{candidate.name}</p>
                                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                            {candidate.position_title || tr.unassignedPosition} · {labelForCandidateStatus(resolveCandidateDisplayStatus(candidate))} · {tr.matchBadge} {formatPercent(resolveCandidateSummaryMatchPercent(candidate))}
                                                        </p>
                                                        {candidate.ai_potential_position ? (
                                                            <p className="mt-1 text-xs text-violet-600 dark:text-violet-300">
                                                                {`${isZh ? "转岗潜力" : "Potential Transition"}：${candidate.ai_potential_position}`}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    <p className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(candidate.updated_at)}</p>
                                                </button>
                                            )) : (
                                                <EmptyState title={tr.noCandidates} description={tr.noCandidatesDesc}/>
                                            )}
                                        </div>
                                    </Field>

                                    <Field label={tr.recommendedActions}>
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{tr.continueFiltering}</p>
                                                <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">{tr.continueFilteringDesc}</p>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{tr.batchHandleResults}</p>
                                                <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">{tr.batchHandleResultsDesc}</p>
                                            </div>
                                        </div>
                                    </Field>
                                </div>
                            </div>
                        </div>
                    )}
                    </DialogContent>
                </Dialog>
                </div>
            <Dialog open={departmentReviewDialogOpen} onOpenChange={setDepartmentReviewDialogOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{isZh ? "提交部门评审" : "Submit Department Review"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-sm font-medium text-slate-900">
                                {candidateDetail?.candidate.name || (isZh ? "当前候选人" : "Current candidate")}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                                {candidateDetail?.candidate.position_title || candidateDetail?.candidate.screened_position_title || (isZh ? "未分配岗位" : "Unassigned")}
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-sm font-medium text-slate-700">{isZh ? "评审人" : "Reviewers"}</p>
                            <Popover modal open={departmentReviewReviewerPickerOpen} onOpenChange={setDepartmentReviewReviewerPickerOpen}>
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        className="flex min-h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-[#D4D4D4]"
                                    >
                                        <span className={cn("truncate", selectedDepartmentReviewers.length ? "text-slate-900" : "text-slate-400")}>
                                            {selectedDepartmentReviewers.length
                                                ? (isZh ? `已选择 ${selectedDepartmentReviewers.length} 位评审人` : `${selectedDepartmentReviewers.length} reviewers selected`)
                                                : (isZh ? "请选择用人部门评审人" : "Select hiring reviewers")}
                                        </span>
                                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400"/>
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="z-[10050] w-[var(--radix-popover-trigger-width)] p-0">
                                    <div className="border-b border-slate-100 p-2">
                                        <div className="relative">
                                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
                                            <Input
                                                value={departmentReviewReviewerQuery}
                                                onChange={(event) => setDepartmentReviewReviewerQuery(event.target.value)}
                                                className="h-8 rounded-md pl-8"
                                                placeholder={isZh ? "搜索姓名或账号" : "Search name or account"}
                                            />
                                        </div>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto p-1">
                                        {departmentReviewReviewerLoading ? (
                                            <div className="flex items-center justify-center px-3 py-6 text-sm text-slate-500">
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                                                {isZh ? "正在加载评审人..." : "Loading reviewers..."}
                                            </div>
                                        ) : visibleDepartmentReviewerOptions.length ? (
                                            visibleDepartmentReviewerOptions.map((reviewer) => {
                                                const selected = selectedDepartmentReviewers.includes(reviewer.user_code);
                                                const displayName = reviewer.name || reviewer.display_name || reviewer.user_code;
                                                return (
                                                    <button
                                                        key={reviewer.user_code}
                                                        type="button"
                                                        onPointerDown={(event) => handleDepartmentReviewerOptionPointerDown(event, reviewer.user_code)}
                                                        onKeyDown={(event) => handleDepartmentReviewerOptionKeyDown(event, reviewer.user_code)}
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                        }}
                                                        className={cn(
                                                            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition",
                                                            selected ? "bg-[#F5F5F5] text-[#171717]" : "text-slate-700 hover:bg-slate-50",
                                                        )}
                                                    >
                                                        <span className={cn(
                                                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                                            selected ? "border-[#171717] bg-[#171717] text-white" : "border-slate-300 bg-white",
                                                        )}>
                                                            {selected ? <Check className="h-3 w-3"/> : null}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate font-medium">{displayName}</span>
                                                            <span className="block truncate text-xs text-slate-400">{reviewer.user_code} · {reviewer.primary_org_code || "-"}</span>
                                                        </span>
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            <div className="px-3 py-6 text-center text-sm text-slate-500">
                                                {isZh ? "暂无可选评审人，请先给账号分配“用人部门评审”角色。" : "No reviewers. Assign the reviewer role first."}
                                            </div>
                                        )}
                                    </div>
                                </PopoverContent>
                            </Popover>
                            {selectedDepartmentReviewers.length ? (
                                <div className="flex flex-wrap gap-2">
                                    {selectedDepartmentReviewers.map((userCode) => {
                                        const reviewer = departmentReviewerByCode.get(userCode);
                                        return (
                                            <button
                                                key={userCode}
                                                type="button"
                                                onClick={() => toggleDepartmentReviewer(userCode)}
                                                className="rounded-md border border-[#E5E5E5] bg-[#F5F5F5] px-2 py-1 text-xs text-[#171717]"
                                                title={isZh ? "点击移除" : "Click to remove"}
                                            >
                                                {reviewer?.name || reviewer?.display_name || userCode}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : null}
                            <p className="text-xs text-slate-500">
                                {isZh ? "只显示已分配“用人部门评审”角色，或具备部门评审处理权限的账号。" : "Only users with reviewer permission are shown."}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700">{isZh ? "可见内容" : "Visible content"}</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {[
                                    ["original_resume", isZh ? "原始简历" : "Original resume"],
                                    ["standard_resume", isZh ? "标准简历" : "Standard resume"],
                                    ["screening_result", isZh ? "初筛结果" : "Screening result"],
                                    ["assessment_result", isZh ? "测评结果" : "Assessment result"],
                                    ["interview_feedback", isZh ? "面试评价" : "Interview feedback"],
                                    ["attachments", isZh ? "附加资料" : "Attachments"],
                                ].map(([value, label]) => (
                                    <label key={value} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={departmentReviewVisibleSections.includes(value)}
                                            onChange={() => toggleDepartmentReviewSection(value)}
                                        />
                                        <span>{label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-sm font-medium text-slate-700">{isZh ? "评审说明" : "Review note"}</p>
                            <Textarea
                                value={departmentReviewMessage}
                                onChange={(event) => setDepartmentReviewMessage(event.target.value)}
                                rows={3}
                                placeholder={isZh ? "例如：请重点评估硬件测试经验、项目复杂度和可面试方向" : "e.g. Please focus on relevant experience and interview direction"}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setDepartmentReviewDialogOpen(false)}>
                                {tr.batchBindPositionCancel}
                            </Button>
                            <Button disabled={departmentReviewSubmitting || selectedDepartmentReviewers.length === 0} onClick={() => void submitDepartmentReview()}>
                                {departmentReviewSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                {isZh ? "提交评审" : "Submit"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <CandidateAiOutputDialog
                open={candidateAiOutputDialogOpen}
                onOpenChange={setCandidateAiOutputDialogOpen}
                markdown={candidateAiOutputPayload.markdown}
                raw={candidateAiOutputPayload.raw}
                modelLabel={latestResumeScoreLog ? `${labelForProvider(latestResumeScoreLog.model_provider)} / ${latestResumeScoreLog.model_name || tr.unrecorded}` : null}
                generatedAt={latestResumeScoreLog?.created_at || candidateDetail?.score?.updated_at || candidateDetail?.score?.created_at}
            />
            <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{isZh ? "导出候选人" : "Export Candidates"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                            {isZh ? `将导出 ${selectedCandidateIds.length} 位候选人，可自定义字段，并选择是否打包原始简历。` : `Export ${selectedCandidateIds.length} candidates with custom fields and optional resume files.`}
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <input
                                type="checkbox"
                                checked={exportIncludeResumes}
                                onChange={(event) => setExportIncludeResumes(event.target.checked)}
                            />
                            <span>{isZh ? "同时导出原始简历文件" : "Include original resume files"}</span>
                        </label>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{isZh ? "导出字段" : "Export Fields"}</p>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setExportFieldKeys(defaultExportFieldKeys)}
                                >
                                    {isZh ? "恢复默认字段" : "Reset Defaults"}
                                </Button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {exportFieldOptions.map((field) => {
                                    const checked = exportFieldKeys.includes(field.key);
                                    return (
                                        <label key={`export-field-${field.key}`} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(event) => {
                                                    const nextChecked = event.target.checked;
                                                    setExportFieldKeys((current) => {
                                                        if (nextChecked) {
                                                            return Array.from(new Set([...current, field.key]));
                                                        }
                                                        if (current.length <= 1) {
                                                            return current;
                                                        }
                                                        return current.filter((item) => item !== field.key);
                                                    });
                                                }}
                                            />
                                            <span>{field.label}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
                                {tr.batchBindPositionCancel}
                            </Button>
                            <Button
                                disabled={!exportFieldKeys.length || exporting}
                                onClick={async () => {
                                    await exportCandidates(selectedCandidateIds, {
                                        includeResumes: exportIncludeResumes,
                                        fields: exportFieldKeys,
                                    });
                                    setExportDialogOpen(false);
                                }}
                            >
                                {exporting ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                {tr.exportCandidates}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <Dialog open={batchBindDialogOpen} onOpenChange={setBatchBindDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{tr.batchBindPositionTitle}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <NativeSelect value={batchBindPositionId} onChange={(event) => setBatchBindPositionId(event.target.value)}>
                            <option value="">{tr.unassignedPosition}</option>
                            {positions.map((p) => (
                                <option key={p.id} value={String(p.id)}>{p.title}</option>
                            ))}
                        </NativeSelect>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setBatchBindDialogOpen(false)}>
                                {tr.batchBindPositionCancel}
                            </Button>
                            <Button
                                disabled={batchBindSubmitting}
                                onClick={async () => {
                                    setBatchBindSubmitting(true);
                                    try {
                                        await batchBindPosition(selectedCandidateIds, batchBindPositionId ? Number(batchBindPositionId) : null);
                                        setBatchBindDialogOpen(false);
                                    } finally {
                                        setBatchBindSubmitting(false);
                                    }
                                }}
                            >
                                {batchBindSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                {tr.batchBindPositionConfirm}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <Dialog open={batchStatusDialogOpen} onOpenChange={setBatchStatusDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{tr.batchUpdateStatusTitle}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{tr.batchUpdateStatusLabel}</p>
                            <NativeSelect value={batchStatusValue} onChange={(event) => setBatchStatusValue(event.target.value)}>
                                <option value="" disabled>{tr.batchUpdateStatusSelectPlaceholder}</option>
                                {Object.entries(candidateStatusLabels).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </NativeSelect>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{tr.batchUpdateStatusReason}</p>
                            <Textarea
                                value={batchStatusReason}
                                onChange={(event) => setBatchStatusReason(event.target.value)}
                                rows={3}
                                placeholder={tr.batchUpdateStatusReasonPlaceholder}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setBatchStatusDialogOpen(false)}>
                                {tr.batchBindPositionCancel}
                            </Button>
                            <Button
                                disabled={batchStatusSubmitting || !batchStatusValue}
                                onClick={async () => {
                                    updateBatchStatusSubmitting(true);
                                    try {
                                        await batchUpdateStatus(selectedCandidateIds, batchStatusValue, batchStatusReason);
                                        setBatchStatusDialogOpen(false);
                                    } finally {
                                        updateBatchStatusSubmitting(false);
                                    }
                                }}
                            >
                                {batchStatusSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                {tr.batchUpdateStatusConfirm}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <Dialog
                open={Boolean(pendingStatusOption)}
                onOpenChange={(open) => {
                    if (!open && !statusFlowSubmitting) {
                        setPendingStatus(null);
                    }
                }}
            >
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>
                            {pendingStatusOption ? tr.confirmStatusChange(pendingStatusOption[1]) : tr.statusFlow}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            {candidateDetail
                                ? tr.currentStatusLine(labelForCandidateStatus(resolveCandidateDisplayStatus(candidateDetail.candidate)))
                                : null}
                        </p>
                        {statusUpdateReason.trim() ? (
                            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                {statusUpdateReason.trim()}
                            </div>
                        ) : null}
                        <div className="flex justify-end gap-2 pt-1">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPendingStatus(null)}
                                disabled={Boolean(statusFlowSubmitting)}
                            >
                                {tr.cancel}
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => {
                                    if (pendingStatusOption) void handleStatusFlowUpdate(pendingStatusOption[0]);
                                }}
                                disabled={Boolean(statusFlowSubmitting)}
                            >
                                {statusFlowSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                {tr.confirm}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
