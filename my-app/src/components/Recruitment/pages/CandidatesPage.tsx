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
    CalendarClock,
    Check,
    ChevronDown,
    ChevronUp,
    Clock3,
    Copy,
    Download,
    ExternalLink,
    Eye,
    FileText,
    GraduationCap,
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
    Sparkles,
    Square,
    Trash2,
    UserCheck,
    Users,
    Video,
    X,
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
import {Button} from "@/components/ui/button";
import {useColumnResizeDrag} from "../hooks/useColumnResizeDrag";
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
    INTERVIEW_PIPELINE_STATUS_VALUES,
    INTERVIEW_REJECTED_STATUS_VALUES,
    type CandidatePipelineStageChildConfig,
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
import {CandidateRadarChart} from "../components/CandidateRadarChart";
import {
    formatActionError,
    formatDateTime,
    formatLongDateTime,
    formatPercent,
    formatScoreValue,
    formatSkillNames,
    formatSkillSnapshotNames,
    formatStructuredValue,
    labelForCandidateSource,
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
} from "../utils";

type InterviewMethod = "onsite" | "video" | "phone";

const INTERVIEW_ROUND_OPTIONS = [
    {value: "初试", labelZh: "初试", labelEn: "First interview", roundIndex: 1},
    {value: "复试", labelZh: "复试", labelEn: "Second interview", roundIndex: 2},
    {value: "加试", labelZh: "加试", labelEn: "Additional interview", roundIndex: 3},
    {value: "终试", labelZh: "终试", labelEn: "Final interview", roundIndex: 4},
] as const;

const INTERVIEW_METHOD_OPTIONS: Array<{value: InterviewMethod; labelZh: string; labelEn: string}> = [
    {value: "onsite", labelZh: "现场面试", labelEn: "Onsite"},
    {value: "video", labelZh: "视频面试", labelEn: "Video"},
    {value: "phone", labelZh: "电话面试", labelEn: "Phone"},
];

const INTERVIEW_VIDEO_TOOL_OPTIONS = ["腾讯会议", "飞书会议", "Zoom", "其他"];

const INTERVIEW_VISIBLE_SECTION_OPTIONS = [
    {value: "original_resume", labelZh: "原始简历", labelEn: "Original resume"},
    {value: "standard_resume", labelZh: "标准简历", labelEn: "Standard resume"},
    {value: "screening_result", labelZh: "初筛结果", labelEn: "Screening result"},
    {value: "assessment_result", labelZh: "测评结果", labelEn: "Assessment result"},
    {value: "interview_feedback", labelZh: "面试评价", labelEn: "Interview feedback"},
    {value: "attachments", labelZh: "附加资料", labelEn: "Attachments"},
] as const;

const DEFAULT_INTERVIEW_VISIBLE_SECTIONS = ["original_resume", "standard_resume", "screening_result", "assessment_result"];
const TIME_OPTION_STEP_MINUTES = 15;
const TIME_OPTION_START_MINUTES = 7 * 60;
const TIME_OPTION_END_MINUTES = 23 * 60 + 59;
const DERIVED_CANDIDATE_DISPLAY_STATUS_VALUES = new Set([
    "screening_running",
    ...INTERVIEW_PIPELINE_STATUS_VALUES,
]);
const INTERVIEW_PIPELINE_STATUS_SET = new Set<string>(INTERVIEW_PIPELINE_STATUS_VALUES);
const INTERVIEW_REJECTED_STATUS_SET = new Set<string>(INTERVIEW_REJECTED_STATUS_VALUES);
const BATCH_SCREENING_PROTECTED_STATUS_SET = new Set<string>([
    "department_review_pending",
    "department_review_passed",
    "department_review_rejected",
    ...INTERVIEW_PIPELINE_STATUS_VALUES,
    ...INTERVIEW_REJECTED_STATUS_VALUES,
    "interview_passed",
    "pending_offer",
    "offer_sent",
    "hired",
    "talent_pool",
]);

type CandidateScheduleFormErrorKey =
    | "subject"
    | "round_name"
    | "interview_method"
    | "interviewer_user_code"
    | "scheduled_date"
    | "scheduled_start_time"
    | "scheduled_end_time";

type CandidateNestedDeleteTarget =
    | {kind: "offer"; id: number; title: string}
    | {kind: "follow_up"; id: number; title: string}
    | {kind: "interview"; id: number; title: string};

type CandidatePagePermissions = {
    manageCandidate: boolean;
    executeProcess: boolean;
    viewReview: boolean;
    actReview: boolean;
    manageReview: boolean;
    viewInterview: boolean;
    manageInterview: boolean;
    viewSkill: boolean;
    bindSkill: boolean;
    sendMail: boolean;
    viewLog: boolean;
    viewAssistant: boolean;
    viewTalentPool: boolean;
};

function interviewRoundNameForIndex(roundIndex: number) {
    if (roundIndex <= 1) return "初试";
    if (roundIndex === 2) return "复试";
    if (roundIndex === 3) return "加试";
    return "终试";
}

function interviewRoundIndexForName(roundName: string, fallbackIndex: number) {
    const option = INTERVIEW_ROUND_OPTIONS.find((item) => item.value === roundName);
    return option?.roundIndex || Math.max(4, fallbackIndex || 4);
}

function defaultInterviewSubject(candidateName?: string | null) {
    const name = String(candidateName || "").trim();
    return name ? `${name}的面试` : "候选人的面试";
}

function formatLocalDateValue(date: Date) {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayDateValue() {
    return formatLocalDateValue(new Date());
}

function parseLocalDateValue(value?: string | null) {
    const normalized = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        return null;
    }
    const [year, month, day] = normalized.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateDisplay(value: string, isZh: boolean) {
    const date = parseLocalDateValue(value);
    if (!date) return isZh ? "请选择日期" : "Select date";
    const weekday = new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {weekday: "short"}).format(date);
    return `${value} ${weekday}`;
}

function buildDateOptions(days = 35) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({length: days}, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return formatLocalDateValue(date);
    });
}

function formatTimeValue(minutes: number) {
    const normalized = Math.max(0, minutes);
    const hours = Math.floor(normalized / 60);
    const rest = normalized % 60;
    return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function buildTimeOptions(start = TIME_OPTION_START_MINUTES, end = TIME_OPTION_END_MINUTES, includeExactEnd = false) {
    const options: string[] = [];
    for (let minutes = start; minutes <= end; minutes += TIME_OPTION_STEP_MINUTES) {
        options.push(formatTimeValue(minutes));
    }
    const exactEnd = formatTimeValue(end);
    if (includeExactEnd && options[options.length - 1] !== exactEnd) {
        options.push(exactEnd);
    }
    return options;
}

const INTERVIEW_START_TIME_OPTIONS = buildTimeOptions();
const INTERVIEW_END_TIME_OPTIONS = buildTimeOptions(TIME_OPTION_START_MINUTES + TIME_OPTION_STEP_MINUTES, TIME_OPTION_END_MINUTES, true);

function timeToMinutes(value?: string | null) {
    const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
}

function localDateTimeParts(value?: string | null) {
    const normalized = String(value || "");
    if (!normalized.includes("T")) return {date: "", time: ""};
    return {
        date: normalized.slice(0, 10),
        time: normalized.slice(11, 16),
    };
}

function combineLocalDateTime(date: string, time: string) {
    return date && time ? `${date}T${time}` : "";
}

function formatDurationText(minutes: number, isZh: boolean) {
    const safeMinutes = Math.max(0, Math.round(minutes));
    const hours = Math.floor(safeMinutes / 60);
    const rest = safeMinutes % 60;
    if (!isZh) {
        return hours ? `${hours}h${rest ? ` ${rest}m` : ""}` : `${rest}m`;
    }
    if (!hours) return `${rest}分钟`;
    return rest ? `${hours}小时${rest}分钟` : `${hours}小时`;
}

function ScheduleTimeSelect({
    value,
    options,
    placeholder,
    disabled,
    onChange,
    formatOption,
    className,
    buttonClassName,
}: {
    value: string;
    options: string[];
    placeholder: string;
    disabled?: boolean;
    onChange: (value: string) => void;
    formatOption?: (value: string) => React.ReactNode;
    className?: string;
    buttonClassName?: string;
}) {
    const [open, setOpen] = React.useState(false);

    return (
        <div
            className={cn("relative", className)}
            onBlur={(event) => {
                const nextTarget = event.relatedTarget;
                if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                    setOpen(false);
                }
            }}
        >
            <button
                type="button"
                disabled={disabled}
                onClick={() => {
                    if (!disabled) setOpen((current) => !current);
                }}
                className={cn(
                    "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-[#E6E7EB] bg-white px-3 text-left text-sm outline-none transition hover:border-[#D6D8DD] focus:border-[#1E3BFA] dark:border-[#33353D] dark:bg-[#0E1114] dark:hover:border-[#5E5F66] dark:focus:border-[#86888F]",
                    value ? "text-[#33353D] dark:text-[#F7F8FA]" : "text-[#B0B2B8] dark:text-[#86888F]",
                    disabled ? "cursor-not-allowed bg-[#F7F8FA] text-[#D6D8DD] hover:border-[#E6E7EB] dark:bg-[#16181B] dark:text-[#33353D] dark:hover:border-[#33353D]" : "",
                    buttonClassName,
                )}
            >
                <span className="min-w-0 truncate">{value || placeholder}</span>
                <Clock3 className="h-3.5 w-3.5 shrink-0 text-[#D6D8DD] dark:text-[#86888F]"/>
            </button>
            {open && !disabled ? (
                <div className="absolute left-0 top-[calc(100%+4px)] z-30 max-h-56 w-full overflow-y-auto rounded-lg border border-[#E6E7EB] bg-white py-1 shadow-xl dark:border-[#33353D] dark:bg-[#0E1114]">
                    {options.map((time) => {
                        const optionContent = formatOption ? formatOption(time) : time;
                        return (
                            <button
                                key={time}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                    onChange(time);
                                    setOpen(false);
                                }}
                                className={cn(
                                    "flex h-8 w-full min-w-0 items-center px-3 text-left text-sm transition",
                                    time === value
                                        ? "bg-[#F7F8FA] text-[#0E1114] dark:bg-[#202226] dark:text-[#F7F8FA]"
                                        : "text-[#33353D] hover:bg-[#F7F8FA] dark:text-[#D6D8DD] dark:hover:bg-[#16181B]",
                                )}
                            >
                                <span className="min-w-0 truncate">{optionContent}</span>
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

function parseInterviewScheduleDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

function formatTwoDigit(value: number) {
    return String(value).padStart(2, "0");
}

function formatInterviewDateWithWeekday(value?: string | null, isZh = true) {
    const date = parseInterviewScheduleDate(value);
    if (!date) return "--";
    const monthDay = `${formatTwoDigit(date.getMonth() + 1)}-${formatTwoDigit(date.getDate())}`;
    const weekday = new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {weekday: "short"}).format(date);
    return `${monthDay} ${weekday}`;
}

function formatInterviewTimeRange(schedule: InterviewSchedule) {
    const start = parseInterviewScheduleDate(schedule.scheduled_at);
    if (!start) return "--";
    const duration = Number(schedule.duration_minutes || 0);
    const end = duration > 0 ? new Date(start.getTime() + duration * 60_000) : null;
    const startText = `${formatTwoDigit(start.getHours())}:${formatTwoDigit(start.getMinutes())}`;
    if (!end || !Number.isFinite(end.getTime())) return startText;
    return `${startText}-${formatTwoDigit(end.getHours())}:${formatTwoDigit(end.getMinutes())}`;
}

function formatInterviewDateTime(value?: string | null, isZh = true) {
    const date = parseInterviewScheduleDate(value);
    if (!date) return "--";
    const year = date.getFullYear();
    const month = formatTwoDigit(date.getMonth() + 1);
    const day = formatTwoDigit(date.getDate());
    const time = `${formatTwoDigit(date.getHours())}:${formatTwoDigit(date.getMinutes())}`;
    return isZh ? `${year}-${month}-${day} ${time}` : `${month}/${day}/${year} ${time}`;
}

function interviewMethodLabel(method?: string | null, isZh = true) {
    const normalized = String(method || "onsite").trim().toLowerCase();
    if (normalized === "video") return isZh ? "视频面试" : "Video";
    if (normalized === "phone") return isZh ? "电话面试" : "Phone";
    return isZh ? "现场面试" : "Onsite";
}

function interviewMethodIcon(method?: string | null) {
    const normalized = String(method || "onsite").trim().toLowerCase();
    if (normalized === "video") return Video;
    if (normalized === "phone") return Phone;
    return Briefcase;
}

function interviewScheduleStatusLabel(schedule: InterviewSchedule, isZh = true) {
    const resultStatus = String(schedule.result_status || "").trim();
    if (resultStatus) {
        const resultLabels: Record<string, [string, string]> = {
            passed: ["面试通过", "Passed"],
            next_round: ["进入下轮", "Next round"],
            hold: ["待定", "Hold"],
            rejected: ["本轮淘汰", "Rejected"],
            no_show: ["未到场", "No-show"],
        };
        const label = resultLabels[resultStatus];
        if (label) return isZh ? label[0] : label[1];
    }
    const status = String(schedule.status || "").trim();
    const labels: Record<string, [string, string]> = {
        scheduled: ["待面试", "Scheduled"],
        confirmed: ["已确认", "Confirmed"],
        in_progress: ["进行中", "In progress"],
        completed: ["已完成", "Completed"],
        cancelled: ["已取消", "Cancelled"],
        no_show: ["未到场", "No-show"],
    };
    const label = labels[status];
    return label ? (isZh ? label[0] : label[1]) : (status || (isZh ? "待面试" : "Scheduled"));
}

function prototypeStatusBadgeClass(statusValue?: string | null) {
    const status = String(statusValue || "").trim().toLowerCase();
    if (["talent_pool"].includes(status)) {
        return "border-[rgba(30,59,250,0.24)] bg-[rgba(30,59,250,0.07)] text-[#0F23D9]";
    }
    if (["passed", "completed", "success", "succeeded", "next_round", "offer_sent", "hired", "screening_passed", "department_review_passed", "interview_passed", "accepted"].includes(status)) {
        return "border-[rgba(12,201,145,0.28)] bg-[rgba(12,201,145,0.08)] text-[#0A9C71]";
    }
    if (["rejected", "failed", "error", "no_show", "screening_failed", "screening_rejected", "department_review_rejected", "interview_rejected", "interview_first_rejected", "interview_second_rejected", "json_parse_failed", "timeout", "screening_total_timeout", "retry_exhausted", "rate_limited", "upstream_timeout", "request_failed"].includes(status)) {
        return "border-[rgba(245,63,63,0.26)] bg-[rgba(245,63,63,0.08)] text-[#F53F3F]";
    }
    if (["no_match", "fallback", "cancelling", "invalid_result", "quota_exceeded", "parsing", "hold", "deferred", "draft", "department_review_pending", "pending_offer"].includes(status)) {
        return "border-[rgba(255,171,36,0.30)] bg-[rgba(255,171,36,0.10)] text-[#D48806]";
    }
    if (["pending", "queued", "running", "processing", "scheduled", "confirmed", "in_progress", "sent", "matching", "pending_screening", "screening_running", "pending_interview", "interview_pending", "interview_first_pending", "interview_second_pending", "interview_first_active", "interview_second_active", "interview_scheduled", "interview_in_progress"].includes(status)) {
        return "border-[rgba(46,156,255,0.26)] bg-[rgba(46,156,255,0.08)] text-[#2E9CFF]";
    }
    if (["cancelled", "canceled"].includes(status)) {
        return "border-[#D6D8DD] bg-[#F2F3F5] text-[#86888F] dark:border-[#33353D] dark:bg-[#202226] dark:text-[#B0B2B8]";
    }
    if (status === "unmatched") {
        return "border-[rgba(255,171,36,0.30)] bg-[rgba(255,171,36,0.10)] text-[#D48806]";
    }
    return "border-[#E6E7EB] bg-[#F7F8FA] text-[#33353D] dark:border-[#33353D] dark:bg-[#16181B] dark:text-[#D6D8DD]";
}

function interviewScheduleStatusClass(schedule: InterviewSchedule) {
    const status = String(schedule.result_status || schedule.status || "").trim();
    return prototypeStatusBadgeClass(status);
}

type CandidateBoardGroup = {
    status: string;
    label: string;
    items: CandidateSummary[];
};

type CandidateListDisplayColumnWidths = Record<CandidateListColumnKey, number>;

type CandidateInterviewQuestion = CandidateDetail["interview_questions"][number];
type CandidateQuickDispositionAction = "pass" | "talent_pool" | "reject";
type CandidateDetailPanelKey = "resume" | "assessment" | "screening" | "review" | "exam" | "interview" | "offer" | "background";
type CandidateDetailPrimaryTabKey = "profile" | "resume" | "ai" | "prep";
type CandidateResumeViewKey = "original" | "standard" | "history";
type DetailIcon = React.ComponentType<{className?: string}>;
type PdfJsModule = typeof import("pdfjs-dist");
type PdfLoadingTask = ReturnType<PdfJsModule["getDocument"]>;

const PDF_RENDER_FIRST_PAGE_TIMEOUT_MS = 10000;

class PdfRenderTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PdfRenderTimeoutError";
    }
}

function withPdfRenderTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
    let timeoutId: number | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
            reject(new PdfRenderTimeoutError(message));
        }, PDF_RENDER_FIRST_PAGE_TIMEOUT_MS);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
        }
    });
}

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

function structuredRecords(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)));
}

function CandidateDetailAvatar({name}: {name: string}) {
    const initial = (name || "?").trim().charAt(0) || "?";
    return (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1E3BFA] text-[16px] font-semibold text-white">
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
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-[#86888F] dark:text-[#B0B2B8]">
            <Icon className="h-3.5 w-3.5 shrink-0 text-[#B0B2B8] dark:text-[#86888F]"/>
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

    React.useEffect(() => {
        const host = hostRef.current;
        if (!host || !blob) return;

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
        const measureHostWidth = () => Math.floor(host.clientWidth || host.parentElement?.clientWidth || 0);
        const waitForHostWidth = async () => {
            for (let attempt = 0; attempt < 10; attempt += 1) {
                const width = measureHostWidth();
                if (width > 0 || cancelled) {
                    return width;
                }
                await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
            }
            return measureHostWidth();
        };

        clearHost();

        const renderPdf = async () => {
            const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs") as PdfJsModule;
            const arrayBuffer = await blob.arrayBuffer();
            if (cancelled) return;
            const measuredHostWidth = await waitForHostWidth();
            if (cancelled) return;
            if (measuredHostWidth <= 0) {
                throw new Error(isZh ? "简历预览区域尚未准备好" : "Resume preview area is not ready");
            }

            const sourceBytes = new Uint8Array(arrayBuffer);
            pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
            loadingTask = pdfjsLib.getDocument({
                data: sourceBytes,
                verbosity: 0,
                useWorkerFetch: false,
            });
            const pdf = await withPdfRenderTimeout(
                loadingTask.promise,
                isZh ? "PDF 文档加载超时" : "PDF document loading timed out",
            );
            if (cancelled) {
                await pdf.destroy();
                return;
            }

            const pageHostWidth = Math.max(320, Math.min(measuredHostWidth - 8, 760));
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
                const renderTask = page.render({
                    canvas,
                    canvasContext,
                    viewport,
                    transform: pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined,
                    background: "#fff",
                });
                await withPdfRenderTimeout(
                    renderTask.promise,
                    isZh ? "PDF 页面渲染超时" : "PDF page rendering timed out",
                );
                if (cancelled) {
                    page.cleanup();
                    break;
                }
                pageShell.appendChild(canvas);
                host.appendChild(pageShell);
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
    }, [blob, isZh, onError, onReady]);

    return (
        <div className={cn("h-full overflow-auto bg-white", SMOOTH_VERTICAL_SCROLLBAR_CLASS)}>
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
        <section>
            <h4 className="mb-2.5 text-[14px] font-semibold text-[#0E1114] dark:text-[#F7F8FA]">{title}</h4>
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
                "h-9 rounded-[6px] px-3 text-[13px] font-medium shadow-none",
                tone === "default" && "border-[#E6E7EB] bg-white text-[#33353D] hover:border-[#1E3BFA] hover:bg-[#F7F8FA] hover:text-[#1E3BFA] dark:border-[#33353D] dark:bg-[#0E1114] dark:text-[#D6D8DD] dark:hover:border-[#1E3BFA] dark:hover:bg-[#16181B] dark:hover:text-white",
                tone === "primary" && "border-[#1E3BFA] bg-[#1E3BFA] text-white hover:bg-[#0F23D9]",
                tone === "success" && "border-[#0CC991] bg-[#0CC991] text-white hover:border-[#0A9C71] hover:bg-[#0A9C71] hover:text-white",
                tone === "warning" && "border-[rgba(255,171,36,0.30)] bg-[rgba(255,171,36,0.10)] text-[#D48806] hover:border-[#FFAB24] hover:bg-[rgba(255,171,36,0.16)] hover:text-[#D48806]",
                tone === "danger" && "border-[rgba(245,63,63,0.30)] bg-white text-[#F53F3F] hover:border-[#F53F3F] hover:bg-[rgba(245,63,63,0.06)] hover:text-[#F53F3F] dark:bg-[#0E1114] dark:text-[#F53F3F]",
            )}
        >
            {children}
        </Button>
    );
}

const CANDIDATE_LIST_ESTIMATED_ROW_HEIGHT = 56;
const CANDIDATE_LIST_OVERSCAN = 6;
const CANDIDATE_BOARD_ESTIMATED_CARD_HEIGHT = 150;
const CANDIDATE_BOARD_OVERSCAN = 5;
const CANDIDATE_POSITION_SCOPE_DEFAULT_WIDTH = 250;
const CANDIDATE_POSITION_SCOPE_MIN_WIDTH = 18;
const CANDIDATE_POSITION_SCOPE_MAX_WIDTH = 420;
const CANDIDATE_DETAIL_INPUT_CLASS = "h-9 rounded-[4px] border-[#E6E7EB] bg-white text-[13px] text-[#33353D] shadow-none focus-visible:border-[#1E3BFA] focus-visible:ring-0 dark:border-[#33353D] dark:bg-[#0E1114] dark:text-[#F7F8FA]";
const CANDIDATE_DETAIL_TEXTAREA_CLASS = "rounded-[4px] border-[#E6E7EB] bg-white text-[13px] text-[#33353D] shadow-none focus-visible:border-[#1E3BFA] focus-visible:ring-0 dark:border-[#33353D] dark:bg-[#0E1114] dark:text-[#F7F8FA]";
const CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS = "h-8 rounded-[6px] border-[#E6E7EB] bg-white px-3 text-[12px] text-[#33353D] shadow-none hover:border-[#1E3BFA] hover:bg-[#F7F8FA] hover:text-[#1E3BFA] dark:border-[#33353D] dark:bg-[#0E1114] dark:text-[#D6D8DD] dark:hover:border-[#1E3BFA] dark:hover:bg-[#16181B] dark:hover:text-white";
const CANDIDATE_DETAIL_PRIMARY_BUTTON_CLASS = "h-8 rounded-[6px] border-[#1E3BFA] bg-[#1E3BFA] px-3 text-[12px] text-white shadow-none hover:border-[#0F23D9] hover:bg-[#0F23D9] disabled:border-[#D6D8DD] disabled:bg-[#D6D8DD] disabled:text-white";
const CANDIDATE_DETAIL_GHOST_BUTTON_CLASS = "h-8 rounded-[6px] px-2 text-[12px] text-[#86888F] shadow-none hover:bg-[#F7F8FA] hover:text-[#1E3BFA] dark:text-[#B0B2B8] dark:hover:bg-[#16181B] dark:hover:text-white";
const CANDIDATE_DETAIL_TAG_CLASS = "h-6 rounded-[3px] border-[#E6E7EB] bg-[#F7F8FA] px-2 text-[12px] font-medium text-[#33353D] shadow-none dark:border-[#33353D] dark:bg-[#16181B] dark:text-[#D6D8DD]";
const CANDIDATE_DETAIL_STATUS_TAG_CLASS = "h-6 rounded-[3px] border px-2 text-[12px] font-medium shadow-none";
const CANDIDATE_PAGINATION_BUTTON_CLASS = "h-7 rounded-[4px] border-[#E6E7EB] bg-white text-[12px] leading-4 text-[#33353D] shadow-none hover:border-[#1E3BFA] hover:bg-[#F7F8FA] hover:text-[#1E3BFA] disabled:border-[#E6E7EB] disabled:bg-[#F7F8FA] disabled:text-[#B0B2B8]";
const CANDIDATE_PAGINATION_ACTIVE_CLASS = "h-7 min-w-7 rounded-[4px] border-[#1E3BFA] bg-[#1E3BFA] px-1.5 text-[12px] leading-4 text-white shadow-none hover:border-[#0F23D9] hover:bg-[#0F23D9] hover:text-white";
const SCORE_SUGGESTED_STATUS_VALUES = new Set(["screening_passed", "talent_pool", "screening_rejected"]);
const SMOOTH_VERTICAL_SCROLLBAR_CLASS = "[scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.82)_transparent] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#D6D8DD] dark:[scrollbar-color:rgba(71,85,105,0.9)_transparent] dark:[&::-webkit-scrollbar-thumb]:bg-[#33353D]";
const POSITION_SCOPE_SCROLLBAR_CLASS = "[scrollbar-width:thin] [scrollbar-color:transparent_transparent] hover:[scrollbar-color:rgba(134,136,143,0.52)_transparent] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-[#B0B2B8]/70 dark:hover:[scrollbar-color:rgba(134,136,143,0.62)_transparent] dark:hover:[&::-webkit-scrollbar-thumb]:bg-[#86888F]/70";

// AI 匹配度按分层配色：高-绿 / 中-琥珀 / 低-玫红，便于列表一眼分层
function matchPercentToneClass(percent: number | null | undefined) {
    if (percent == null) {
        return "text-[#B0B2B8] dark:text-[#86888F]";
    }
    if (percent >= 70) {
        return "text-[#0A9C71]";
    }
    if (percent >= 40) {
        return "text-[#D48806]";
    }
    return "text-[#F53F3F]";
}

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
                "grid cursor-pointer overflow-hidden border-b border-[#E6E7EB]/80 bg-white text-base transition-colors dark:border-[#202226] dark:bg-[#0E1114]",
                "hover:bg-[#F7F8FA] dark:hover:bg-[#16181B]/70",
                isSelected && "bg-[#F2F3F5] dark:bg-[#16181B]",
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
                                    <HoverRevealText text={candidate.name + (candidate.age ? ` (${candidate.age}${tr.ageSuffix})` : "")} className="font-medium text-[#0E1114] dark:text-[#F7F8FA]"/>
                                    {resumeMailSummary ? (
                                        <Badge className="shrink-0 rounded-full border border-[rgba(30,59,250,0.18)] bg-[rgba(30,59,250,0.06)] text-[#0F23D9] dark:border-[rgba(30,59,250,0.35)] dark:bg-[rgba(30,59,250,0.16)]/30 dark:text-[#AAB3FF]">
                                            {tr.resumeSent}
                                        </Badge>
                                    ) : null}
                                </div>
                                <HoverRevealText
                                    text={candidate.phone || candidate.email || tr.noContact}
                                    className="text-xs text-[#86888F] dark:text-[#B0B2B8]"
                                />
                                {candidateProfileSummary ? (
                                    <HoverRevealText
                                        text={candidateProfileSummary}
                                        className="mt-0.5 text-sm text-[#86888F] dark:text-[#B0B2B8]"
                                        tooltipClassName="max-w-sm"
                                    />
                                ) : null}
                                {candidate.ai_potential_position ? (
                                    <HoverRevealText
                                        text={`${isZh ? "转岗潜力" : "Potential Transition"}: ${candidate.ai_potential_position}${candidate.ai_potential_reason ? ` · ${candidate.ai_potential_reason}` : ""}`}
                                        className="mt-1 text-xs text-[#1E3BFA] dark:text-[#7D8BFF]"
                                        tooltipClassName="max-w-md"
                                    />
                                ) : null}
                                {resumeMailSummary ? (
                                    <HoverRevealText
                                        text={resumeMailSummary}
                                        className="mt-1 text-xs text-[#1E3BFA] dark:text-[#D6D8DD]"
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
                                className="text-xs text-[#33353D] dark:text-[#D6D8DD]"
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
                                        className="mt-1 text-xs text-[#1E3BFA] dark:text-[#7D8BFF]"
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
                            <Badge className={cn("max-w-full rounded-[3px] border", prototypeStatusBadgeClass(displayStatus))}>
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
                                    className="mt-1 text-[11px] leading-4 text-[#86888F] dark:text-[#B0B2B8]"
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
                            <span className={cn("font-medium tabular-nums", matchPercentToneClass(resolveCandidateSummaryMatchPercent(candidate)))}>
                                {formatPercent(resolveCandidateSummaryMatchPercent(candidate))}
                            </span>
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
                            <HoverRevealText text={candidate.city || "-"} className="text-xs text-[#33353D] dark:text-[#D6D8DD]"/>
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
                            <HoverRevealText text={candidate.expected_city || "-"} className="text-xs text-[#33353D] dark:text-[#D6D8DD]"/>
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
                            <HoverRevealText text={labelForCandidateSource(candidate.source)} className="text-xs text-[#33353D] dark:text-[#D6D8DD]"/>
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

type CandidatePrototypeTableRowProps = {
    candidate: CandidateSummary;
    isSelected: boolean;
    isChecked: boolean;
    rowStart: number;
    rowHeight: number;
    setSelectedCandidateId: React.Dispatch<React.SetStateAction<number | null>>;
    toggleCandidateSelection: (candidateId: number, nextChecked?: boolean) => void;
    onPrimaryAction: (candidate: CandidateSummary) => void;
    canExecuteProcess: boolean;
    canMoveToTalentPool: boolean;
    organizationLabel?: string | null;
    resumeMailSummary?: string | null;
    language: string;
    gridTemplateColumns: string;
};

function getCandidatePrototypeListGridTemplate() {
    const actionColumnWidth = 112;
    return {
        minWidth: 1040,
        columns: [
            "40px",
            "minmax(210px,1.75fr)",
            "minmax(150px,1.2fr)",
            "minmax(116px,0.85fr)",
            "minmax(116px,0.9fr)",
            "minmax(72px,0.55fr)",
            "minmax(88px,0.65fr)",
            "minmax(136px,1fr)",
            `${actionColumnWidth}px`,
        ].join(" "),
    };
}

function candidatePrototypeStatusClass(status: string) {
    if (status === "screening_rejected" || status === "department_review_rejected" || INTERVIEW_REJECTED_STATUS_SET.has(status)) {
        return "bg-[rgba(245,63,63,0.08)] text-[#F53F3F]";
    }
    if (["screening_passed", "interview_passed", "pending_offer", "offer_sent", "hired"].includes(status)) {
        return "bg-[rgba(12,201,145,0.10)] text-[#0A9C71]";
    }
    if (status === "screening_running" || INTERVIEW_PIPELINE_STATUS_SET.has(status) || status === "department_review_pending") {
        return "bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]";
    }
    if (["new_imported", "pending_screening", "screening_failed"].includes(status)) {
        return "bg-[rgba(255,171,36,0.12)] text-[#D48806]";
    }
    return "bg-[rgba(176,178,184,0.12)] text-[#5E5F66]";
}

function candidatePrototypePrimaryActionLabel(candidate: CandidateSummary, isZh: boolean, canExecuteProcess: boolean, canMoveToTalentPool: boolean) {
    const status = resolveCandidateDisplayStatus(candidate);
    const isRejected = status === "screening_rejected" || status === "department_review_rejected" || INTERVIEW_REJECTED_STATUS_SET.has(status);
    if (isRejected && canMoveToTalentPool) {
        return isZh ? "入人才库" : "Talent Pool";
    }
    if (!canExecuteProcess) {
        return isZh ? "查看详情" : "View Details";
    }
    if (status === "screening_running") return isZh ? "查看进度" : "View Progress";
    if (INTERVIEW_PIPELINE_STATUS_SET.has(status)) return isZh ? "面试题" : "Questions";
    if (isRejected) return isZh ? "查看详情" : "View Details";
    if (!["new_imported", "matching", "unmatched", "pending_screening", "screening_failed"].includes(status)) {
        return isZh ? "查看详情" : "View Details";
    }
    if (candidate.latest_score_id || candidate.latest_total_score != null) return isZh ? "重新初筛" : "Re-screen";
    return isZh ? "开始初筛" : "Start Screening";
}

const CandidatePrototypeTableRow = React.memo(function CandidatePrototypeTableRow({
    candidate,
    isSelected,
    isChecked,
    rowStart,
    rowHeight,
    setSelectedCandidateId,
    toggleCandidateSelection,
    onPrimaryAction,
    canExecuteProcess,
    canMoveToTalentPool,
    organizationLabel,
    resumeMailSummary,
    language,
    gridTemplateColumns,
}: CandidatePrototypeTableRowProps) {
    const isZh = language !== "en-US";
    const displayStatus = resolveCandidateDisplayStatus(candidate);
    const matchPercent = resolveCandidateSummaryMatchPercent(candidate);
    const matchColor = matchPercent == null ? "#B0B2B8" : matchPercent >= 70 ? "#0CC991" : matchPercent >= 40 ? "#FFAB24" : "#F53F3F";
    const initials = (candidate.name || (isZh ? "候" : "C")).trim().slice(0, 1).toUpperCase();
    const avatarColors = ["#1E3BFA", "#2E9CFF", "#0CC991", "#FFAB24", "#7B61FF", "#F53F3F"];
    const avatarColor = avatarColors[Math.abs(candidate.id) % avatarColors.length];
    const profileMeta = [
        candidate.current_company,
        candidate.city,
        candidate.expected_city ? `${isZh ? "期望" : "Expect"} ${candidate.expected_city}` : "",
        candidate.phone || candidate.email,
        organizationLabel,
    ].filter(Boolean).join(" · ") || "-";
    const profileDetails = [
        profileMeta,
        candidate.email && candidate.email !== candidate.phone ? candidate.email : "",
        candidate.tags?.length ? `${isZh ? "标签" : "Tags"}: ${candidate.tags.join("、")}` : "",
        candidate.ai_potential_position ? `${isZh ? "转岗建议" : "Potential"}: ${candidate.ai_potential_position}` : "",
        candidate.display_status_reason || "",
        candidate.source_detail || "",
        resumeMailSummary || "",
    ].filter(Boolean).join(" · ");
    const appliedPosition = candidate.position_title || candidate.screened_position_title || candidate.ai_match_position_title || (isZh ? "未分配岗位" : "Unassigned");

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
                "grid cursor-pointer items-center border-b border-[#F2F3F5] bg-white text-[12px] text-[#0F1014] transition-colors hover:bg-[#F8F8F9]",
                isSelected && "bg-[rgba(30,59,250,0.04)]",
            )}
            onClick={() => setSelectedCandidateId(candidate.id)}
        >
            <div role="cell" className="flex items-center justify-center" onClick={(event) => event.stopPropagation()}>
                <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(event) => toggleCandidateSelection(candidate.id, event.target.checked)}
                    aria-label={isZh ? `选择候选人 ${candidate.name}` : `Select ${candidate.name}`}
                    className="h-3.5 w-3.5 rounded-[3px] border-[#D6D8DD] accent-[#1E3BFA] focus:ring-[#1E3BFA]"
                />
            </div>
            <div role="cell" className="flex min-w-0 items-center gap-2.5 px-2.5">
                <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white"
                    style={{backgroundColor: avatarColor}}
                >
                    {initials}
                </span>
                <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                    <button
                        type="button"
                        className="block min-w-0 max-w-full truncate text-left text-[13px] font-medium text-[#0F23D9] hover:text-[#1E3BFA]"
                        title={candidate.age ? `${candidate.name} · ${candidate.age}${isZh ? "岁" : ""}` : candidate.name}
                        onClick={(event) => {
                            event.stopPropagation();
                            setSelectedCandidateId(candidate.id);
                        }}
                    >
                        {candidate.name}{candidate.age ? <span className="ml-1 font-normal text-[#86888F]">{candidate.age}{isZh ? "岁" : ""}</span> : null}
                    </button>
                    {resumeMailSummary ? <span className="shrink-0 rounded-[3px] bg-[rgba(30,59,250,0.07)] px-1.5 py-0.5 text-[10px] text-[#1E3BFA]">{isZh ? "已发送" : "Sent"}</span> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-[#B0B2B8]" title={profileDetails}>{profileMeta}</span>
                </span>
            </div>
            <div role="cell" className="truncate px-2.5" title={appliedPosition}>{appliedPosition}</div>
            <div role="cell" className="flex items-center gap-1.5 px-2.5">
                <span className="h-[5px] w-11 overflow-hidden rounded-full bg-[#F2F3F5]">
                    <span className="block h-full rounded-full" style={{width: `${matchPercent ?? 0}%`, backgroundColor: matchColor}}/>
                </span>
                <span className="tabular-nums" style={{color: matchColor}}>{matchPercent == null ? "—" : `${Math.round(matchPercent)}%`}</span>
            </div>
            <div role="cell" className="px-2.5">
                <span title={candidate.display_status_reason || undefined} className={cn("inline-flex h-[22px] max-w-full items-center truncate rounded-[4px] px-2", candidatePrototypeStatusClass(displayStatus))}>
                    {labelForCandidateStatus(displayStatus)}
                </span>
            </div>
            <div role="cell" className="truncate px-2.5">{candidate.education || "-"}</div>
            <div role="cell" className="truncate px-2.5">{candidate.years_of_experience || "-"}</div>
            <div role="cell" className="truncate px-2.5 tabular-nums text-[#86888F]">{formatDateTime(candidate.updated_at || candidate.created_at)}</div>
            <div role="cell" className="flex min-w-0 items-center gap-3 px-2.5" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="shrink-0 text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => onPrimaryAction(candidate)}>
                    {candidatePrototypePrimaryActionLabel(candidate, isZh, canExecuteProcess, canMoveToTalentPool)}
                </button>
            </div>
        </div>
    );
});

type CandidateApplicantCardProps = {
    candidate: CandidateSummary;
    isSelected: boolean;
    isChecked: boolean;
    rowIndex: number;
    rowStart: number;
    measureElement: (node: Element | null) => void;
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
    rowIndex,
    rowStart,
    measureElement,
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
    const originalFileName = String(candidate.source_detail || "").trim();
    const candidateNameText = String(candidate.name || "").trim();
    const normalizeFileComparableText = (value: string) => value
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[\s_\-—–()[\]【】{}·.]+/g, "")
        .toLowerCase();
    const originalFileStem = originalFileName.replace(/\.[^.]+$/, "");
    const nameLooksLikeOriginalFile = Boolean(
        originalFileName
        && candidateNameText
        && normalizeFileComparableText(candidateNameText) === normalizeFileComparableText(originalFileStem),
    );
    const displayCandidateName = nameLooksLikeOriginalFile
        ? (isZh ? "未解析候选人" : "Unparsed Candidate")
        : (candidateNameText || (isZh ? "未命名候选人" : "Unnamed Candidate"));
    // 学历/经验由中间栏（educationSummaryText/experienceSummaryText）展示，这里只保留身份与城市，避免同卡重复
    const profileText = [
        candidate.age ? `${candidate.age}${tr.ageSuffix}` : "",
        candidate.city,
        candidate.expected_city ? `${isZh ? "期望" : "Expect"} ${candidate.expected_city}` : "",
    ].filter(Boolean).join(" · ");
    const locationHintText = [
        candidate.city ? `${isZh ? "城市" : "City"}：${candidate.city}` : "",
        candidate.expected_city ? `${isZh ? "期望" : "Expect"}：${candidate.expected_city}` : "",
    ].filter(Boolean).join(" · ");
    const hasStructuredProfile = Boolean(
        candidate.latest_parse_result_id
        || candidate.phone
        || candidate.email
        || candidate.education
        || candidate.current_company
        || candidate.age
        || candidate.years_of_experience,
    );
    const profileHintText = hasStructuredProfile
        ? (profileText || contactText)
        : [isZh ? "基础信息待解析" : "Profile pending", locationHintText].filter(Boolean).join(" · ");
    const positionLabel = candidate.position_title || candidate.screened_position_title || tr.unassignedPosition;
    const positionSourceLabel = candidate.position_id
        ? (isZh ? "已关联" : "Assigned")
        : (isZh ? "点击指定" : "Set position");
    const aiPositionLabel = candidate.ai_match_position_title || "";
    const showOriginalFile = Boolean(originalFileName && (nameLooksLikeOriginalFile || !hasStructuredProfile));
    const fitLabel = (() => {
        if (displayStatus === "screening_running") {
            return isZh ? "初筛中" : "Screening";
        }
        if (displayStatus === "pending_screening") {
            return isZh ? "待初筛" : "To Screen";
        }
        if (displayStatus === "screening_rejected" || INTERVIEW_REJECTED_STATUS_SET.has(displayStatus)) {
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
        "rounded border px-1.5 py-0.5 text-[11px] font-medium leading-4",
        displayStatus === "screening_running"
            ? "border-[#F2F3F5] bg-[#F7F8FA] text-[#86888F] dark:border-[#202226] dark:bg-[#16181B]/40 dark:text-[#B0B2B8]"
            : displayStatus === "pending_screening"
                ? "border-[#F2F3F5] bg-[#F7F8FA] text-[#86888F] dark:border-[#202226] dark:bg-[#16181B]/40 dark:text-[#B0B2B8]"
                : displayStatus === "screening_rejected" || INTERVIEW_REJECTED_STATUS_SET.has(displayStatus)
                    ? "border-[rgba(245,63,63,0.22)] bg-[rgba(245,63,63,0.06)] text-[#F53F3F]"
                    : matchPercent != null && matchPercent >= 60
                        ? "border-[rgba(12,201,145,0.24)] bg-[rgba(12,201,145,0.07)] text-[#0A9C71]"
                        : "border-[rgba(255,171,36,0.26)] bg-[rgba(255,171,36,0.08)] text-[#D48806]",
    );
    const topTags = (candidate.tags || []).slice(0, 5);

    const openDetail = React.useCallback(() => {
        setSelectedCandidateId(candidate.id);
    }, [candidate.id, setSelectedCandidateId]);
    const onToggleCheck = React.useCallback((checked: boolean) => {
        toggleCandidateSelection(candidate.id, checked);
    }, [candidate.id, toggleCandidateSelection]);

    const statusReasonText = candidate.display_status_reason
        ? sanitizeCandidateFacingErrorText(candidate.display_status_reason, {
            context: resolveCandidateFacingErrorContext(candidate.active_screening_task_type, {
                autoRetry: candidate.active_screening_auto_retry_scheduled,
            }),
            language,
        })
        : "";
    const sourceTimeText = [
        labelForCandidateSource(candidate.source),
        candidate.updated_at ? formatDateTime(candidate.updated_at) : "",
    ].filter(Boolean).join("  |  ");
    const educationSummaryText = [
        candidate.education,
        candidate.city,
        candidate.expected_city ? `${isZh ? "期望" : "Expect"} ${candidate.expected_city}` : "",
    ].filter(Boolean).join(" · ") || (isZh ? "基础信息待完善" : "Profile pending");
    const experienceSummaryText = [
        candidate.current_company || positionLabel,
        candidate.years_of_experience,
    ].filter(Boolean).join(" · ") || positionLabel;
    // 底部提示条只承载卡片其他区域没有的信息：状态原因、转岗建议。无内容时整条隐藏，避免逐卡重复套话。
    const potentialTransferText = candidate.ai_potential_position
        ? `${isZh ? "建议转岗" : "Suggested transfer"}：${candidate.ai_potential_position}`
        : "";
    const fitBannerText = [statusReasonText, potentialTransferText].filter(Boolean).join(" · ");
    const showPassAction = displayStatus !== "screening_passed";
    const showRejectAction = displayStatus !== "screening_rejected";
    const fitBannerClassName = cn(
        "mt-3 flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs leading-5",
        displayStatus === "screening_rejected" || INTERVIEW_REJECTED_STATUS_SET.has(displayStatus)
            ? "border-[rgba(245,63,63,0.22)] bg-[rgba(245,63,63,0.05)] text-[#F53F3F]"
            : matchPercent != null && matchPercent >= 60
                ? "border-[rgba(12,201,145,0.24)] bg-[rgba(12,201,145,0.06)] text-[#0A9C71]"
                : "border-[rgba(255,171,36,0.26)] bg-[rgba(255,171,36,0.07)] text-[#D48806]",
    );

    return (
        <div
            role="listitem"
            data-candidate-id={candidate.id}
            data-index={rowIndex}
            ref={measureElement}
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${rowStart}px)`,
            }}
            className="pb-3"
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
                    "w-full min-w-0 rounded-lg border border-[#EBEEF5] bg-white px-3 py-3 text-left shadow-[0_1px_2px_rgba(16,32,63,0.03)] transition dark:border-[#202226] dark:bg-[#0E1114]",
                    "hover:border-[#D6D8DD] hover:bg-[#fbfcfe] dark:hover:border-[#33353D] dark:hover:bg-[#16181B]/70",
                    isSelected && "border-[#1E3BFA] bg-[rgba(30,59,250,0.03)] shadow-[inset_3px_0_0_#1E3BFA] dark:bg-[#16181B]",
                )}
            >
                <div className="grid min-w-0 grid-cols-[22px_minmax(0,1fr)] gap-2.5 xl:grid-cols-[22px_minmax(118px,.8fr)_minmax(170px,1.08fr)_minmax(165px,.9fr)_minmax(220px,1fr)] 2xl:grid-cols-[22px_minmax(152px,.85fr)_minmax(260px,1.25fr)_minmax(215px,.95fr)_minmax(240px,1fr)] xl:gap-3 2xl:gap-4">
                    <div className="pt-1" onClick={(event) => event.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(event) => onToggleCheck(event.target.checked)}
                            aria-label={tr.selectCandidate(displayCandidateName)}
                            className="h-3.5 w-3.5 rounded border-[#D6D8DD] accent-[#1E3BFA]"
                        />
                    </div>

                    <div className="col-start-2 flex min-w-0 gap-2 overflow-hidden xl:col-start-auto 2xl:gap-2.5">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0CC991]"/>
                        <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-[15px] font-semibold leading-5 text-[#0E1114] dark:text-white">
                                    {displayCandidateName}
                                </span>
                                {resumeMailSummary ? (
                                    <Badge className="shrink-0 rounded-[3px] border border-[rgba(46,156,255,0.24)] bg-[rgba(46,156,255,0.07)] px-1.5 py-0 text-[11px] text-[#2E9CFF]">
                                        {tr.resumeSent}
                                    </Badge>
                                ) : null}
                            </div>
                            <p className="mt-1 line-clamp-1 text-xs leading-5 text-[#86888F] dark:text-[#B0B2B8]">
                                {profileHintText}
                            </p>
                            <p className="line-clamp-1 text-xs leading-5 text-[#B0B2B8] dark:text-[#86888F]">
                                {contactText}
                            </p>
                            <p className="mt-3 line-clamp-1 text-xs leading-5 text-[#86888F] dark:text-[#B0B2B8]">
                                {sourceTimeText}
                            </p>
                        </div>
                    </div>

                    <div className="col-start-2 min-w-0 overflow-hidden space-y-2 border-t border-[#F2F3F5] pt-3 xl:col-start-auto xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0 2xl:pl-4 dark:border-[#202226]">
                        <p className="flex min-w-0 items-center gap-2 text-xs leading-5 text-[#0E1114]">
                            <GraduationCap className="h-3.5 w-3.5 shrink-0 text-[#86888F]"/>
                            <span className="truncate">{educationSummaryText}</span>
                        </p>
                        <p className="flex min-w-0 items-center gap-2 text-xs leading-5 text-[#0E1114]">
                            <Briefcase className="h-3.5 w-3.5 shrink-0 text-[#86888F]"/>
                            <span className="truncate">{experienceSummaryText}</span>
                        </p>
                        <p className="flex min-w-0 items-center gap-2 text-xs leading-5 text-[#86888F]">
                            <Bot className="h-3.5 w-3.5 shrink-0 text-[#86888F]"/>
                            <span className="truncate">
                                {aiPositionLabel ? `${isZh ? "AI 推荐" : "AI"}：${aiPositionLabel}` : positionSourceLabel}
                            </span>
                        </p>
                        {showOriginalFile ? (
                            <p className="line-clamp-1 text-xs leading-5 text-[#B0B2B8] dark:text-[#86888F]">
                                {isZh ? "原始文件" : "Original file"}：{originalFileName}
                            </p>
                        ) : null}
                        <div className="flex min-w-0 flex-wrap gap-1 pt-0.5 2xl:gap-1.5">
                            {topTags.slice(0, 4).map((tag) => (
                                <span key={tag} className="max-w-full truncate rounded-md border border-[#E6E7EB] bg-[#F7F8FA] px-1.5 py-0.5 text-[11px] leading-4 text-[#33353D] dark:border-[#202226] dark:bg-[#16181B] dark:text-[#D6D8DD] 2xl:px-2 2xl:py-1">
                                    {tag}
                                </span>
                            ))}
                            <span className={fitClassName}>{fitLabel}</span>
                        </div>
                    </div>

                    <div className="col-start-2 min-w-0 overflow-hidden space-y-2 border-t border-[#F2F3F5] pt-3 text-xs leading-5 xl:col-start-auto xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0 2xl:pl-4 dark:border-[#202226]">
                        <div className="grid grid-cols-[60px_minmax(0,1fr)] gap-x-2 gap-y-1 2xl:grid-cols-[72px_minmax(0,1fr)] 2xl:gap-x-3">
                            <span className="text-[#B0B2B8]">{isZh ? "应聘岗位" : "Applied"}</span>
                            <span className="truncate font-semibold text-[#0E1114]">{positionLabel}</span>
                            <span className="text-[#B0B2B8]">{isZh ? "渠道" : "Source"}</span>
                            <span className="truncate text-[#86888F]">{labelForCandidateSource(candidate.source)}</span>
                            <span className="text-[#B0B2B8]">{isZh ? "投递时间" : "Submitted"}</span>
                            <span className="truncate text-[#86888F]">{candidate.updated_at ? formatDateTime(candidate.updated_at) : "-"}</span>
                            <span className="text-[#B0B2B8]">{isZh ? "业务筛选" : "Workflow"}</span>
                            <span className="truncate text-[#86888F]">{labelForCandidateStatus(displayStatus)}</span>
                        </div>
                    </div>

                    <div className="col-start-2 min-w-0 overflow-visible border-t border-[#F2F3F5] pt-3 xl:col-start-auto xl:border-t-0 xl:pl-2 xl:pt-0 2xl:pl-3 dark:border-[#202226]">
                        <div className="ml-auto flex w-fit max-w-full flex-col items-stretch space-y-2 2xl:space-y-3">
                            <div className="flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md bg-[#F7F8FA] px-2 text-xs font-semibold text-[#0E1114] dark:bg-[#16181B] 2xl:px-3">
                                <span>{isZh ? "AI 匹配度" : "AI Match"}</span>
                                <span className={cn("text-[15px] tabular-nums", matchPercentToneClass(matchPercent))}>{matchPercent != null ? formatPercent(matchPercent) : "--"}</span>
                            </div>
                            <p className="text-left text-xs font-medium text-[#86888F]">{isZh ? "候选人处理" : "Candidate actions"}</p>
                            <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-visible" onClick={(event) => event.stopPropagation()}>
                                {showPassAction ? (
                                    <Button size="sm" className="h-8 w-auto shrink-0 justify-center rounded-[6px] border-[#0CC991] bg-[#0CC991] px-3 text-xs leading-5 text-white shadow-none hover:border-[#0A9C71] hover:bg-[#0A9C71]" onClick={() => onDisposition(candidate.id, "pass")}>
                                        <span className="whitespace-nowrap">{tr.quickDispositionPass}</span>
                                    </Button>
                                ) : null}
                                <Button size="sm" variant="outline" className="h-8 w-auto shrink-0 justify-center rounded-[6px] border-[#E6E7EB] bg-white px-3 text-xs leading-5 text-[#33353D] shadow-none hover:border-[#1E3BFA] hover:bg-[#F7F8FA] hover:text-[#1E3BFA]" onClick={() => onDisposition(candidate.id, "talent_pool")}>
                                    <span className="whitespace-nowrap">{tr.quickDispositionTalentPool}</span>
                                </Button>
                                {showRejectAction ? (
                                    <Button size="sm" variant="outline" className="h-8 w-auto shrink-0 justify-center rounded-[6px] border-[rgba(245,63,63,0.30)] bg-white px-3 text-xs leading-5 text-[#F53F3F] shadow-none hover:border-[#F53F3F] hover:bg-[rgba(245,63,63,0.06)] hover:text-[#F53F3F]" onClick={() => onDisposition(candidate.id, "reject")}>
                                        <span className="whitespace-nowrap">{tr.quickDispositionReject}</span>
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>

                {fitBannerText ? (
                    <div className={fitBannerClassName}>
                        <span className="min-w-0 truncate" title={fitBannerText}>{fitBannerText}</span>
                    </div>
                ) : null}
            </div>
        </div>
    );
}, (prev, next) => (
    prev.isSelected === next.isSelected
    && prev.isChecked === next.isChecked
    && prev.rowIndex === next.rowIndex
    && prev.rowStart === next.rowStart
    && prev.candidate.status === next.candidate.status
    && prev.candidate.display_status === next.candidate.display_status
    && prev.candidate.display_status_reason === next.candidate.display_status_reason
    && prev.candidate.match_percent === next.candidate.match_percent
    && prev.candidate.updated_at === next.candidate.updated_at
    && prev.candidate.name === next.candidate.name
    && prev.candidate.phone === next.candidate.phone
    && prev.candidate.email === next.candidate.email
    && prev.candidate.source_detail === next.candidate.source_detail
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
    && prev.candidate.latest_parse_result_id === next.candidate.latest_parse_result_id
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
        <div className="rounded-[8px] border border-[#EBEEF5] bg-[#F7F8FA] p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
                <p className="text-[14px] font-semibold text-[#0E1114]">{group.label}</p>
                <Badge variant="outline" className="h-[22px] rounded-[4px] border-[#E6E7EB] bg-white px-2 text-[11px] font-normal text-[#86888F]">{group.items.length}</Badge>
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
                                        "w-full rounded-[8px] border px-4 py-4 text-[#0E1114] shadow-none transition",
                                        selectedCandidateId === candidate.id
                                            ? "border-[#1E3BFA] bg-[rgba(30,59,250,0.05)] shadow-[inset_3px_0_0_#1E3BFA]"
                                            : "border-[#E6E7EB] bg-white hover:border-[#B0B2B8]",
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
                                                    <Badge className="rounded-[4px] border border-[rgba(30,59,250,0.16)] bg-[rgba(30,59,250,0.06)] text-[#1E3BFA]">
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
                                            className="h-3.5 w-3.5 rounded-[3px] border-[#D6D8DD] accent-[#1E3BFA] focus:ring-[#1E3BFA]"
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="rounded-[8px] border border-dashed border-[#D6D8DD] bg-white px-4 py-6 text-center text-[13px] text-[#86888F]">
                    {tr.noCandidatesInStatus}
                </p>
            )}
        </div>
    );
});

type CandidatePipelineStageChildSummary = CandidatePipelineStageChildConfig & {
    label: string;
    count: number;
    active: boolean;
    resolvedStatusValues: string[];
};

type CandidatePipelineStageSummary = Omit<CandidatePipelineStageConfig, "children"> & {
    label: string;
    hint: string;
    count: number;
    active: boolean;
    allActive: boolean;
    resolvedStatusValues: string[];
    children?: CandidatePipelineStageChildSummary[];
};

function resolvePipelineStatusValues(stage: {statusValue?: string | null; statusValues?: string[]}) {
    return stage.statusValues || (stage.statusValue ? [stage.statusValue] : []);
}

function pipelineStatusValuesEqual(left: string[], right: string[]) {
    return left.length === right.length && left.every((value) => right.includes(value));
}

function CandidatePipelineBar({
    stages,
    onSelect,
    onSelectChild,
    loading,
    allLabel,
    rightAction,
}: {
    stages: CandidatePipelineStageSummary[];
    onSelect: (stage: CandidatePipelineStageSummary) => void;
    onSelectChild: (stage: CandidatePipelineStageSummary, child: CandidatePipelineStageChildSummary) => void;
    loading?: boolean;
    allLabel: string;
    rightAction?: React.ReactNode;
}) {
    const [openStageKey, setOpenStageKey] = React.useState<string | null>(null);
    const closeTimerRef = React.useRef<number | null>(null);
    const openedByHoverRef = React.useRef(false);

    const cancelClose = React.useCallback(() => {
        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    }, []);
    const openStageMenu = React.useCallback((stageKey: string) => {
        cancelClose();
        openedByHoverRef.current = true;
        setOpenStageKey(stageKey);
    }, [cancelClose]);
    const scheduleClose = React.useCallback((stageKey: string) => {
        cancelClose();
        closeTimerRef.current = window.setTimeout(() => {
            setOpenStageKey((current) => current === stageKey ? null : current);
            closeTimerRef.current = null;
        }, 220);
    }, [cancelClose]);

    React.useEffect(() => () => cancelClose(), [cancelClose]);

    return (
        <div className="mb-4 flex min-w-0 items-center justify-between gap-6 bg-white">
            <div className="flex min-w-0 items-center gap-7 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {stages.map((stage) => {
                    const hasChildMenu = stage.key !== "all" && stage.key !== "talent_pool";
                    const hasDistinctStageAllOption = !stage.children?.some((child) => pipelineStatusValuesEqual(child.resolvedStatusValues, stage.resolvedStatusValues));
                    return (
                        <div
                            key={stage.key}
                            className="relative flex shrink-0 items-center"
                            onPointerEnter={() => {
                                if (hasChildMenu) openStageMenu(stage.key);
                            }}
                            onPointerMove={() => {
                                if (hasChildMenu && openStageKey !== stage.key) openStageMenu(stage.key);
                            }}
                            onPointerLeave={() => {
                                if (hasChildMenu) scheduleClose(stage.key);
                            }}
                        >
                            <button
                                type="button"
                                aria-pressed={stage.active}
                                onClick={() => onSelect(stage)}
                                className={cn(
                                    "relative flex h-9 items-center gap-1.5 px-0.5 text-[15px] transition-colors",
                                    stage.active ? "font-semibold text-[#0E1114]" : "font-normal text-[#33353D] hover:text-[#0F23D9]",
                                )}
                            >
                                <span>{stage.label}</span>
                                <span className="text-[12px] font-normal tabular-nums text-[#B0B2B8]">
                                    {loading ? <span className="inline-block h-3 w-5 animate-pulse rounded bg-[#E6E7EB]"/> : stage.count.toLocaleString()}
                                </span>
                                {stage.active ? <span className="absolute bottom-0 left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-[2px] bg-[#1E3BFA]"/> : null}
                            </button>
                            {hasChildMenu ? (
                                <Popover
                                    open={openStageKey === stage.key}
                                    onOpenChange={(open) => {
                                        cancelClose();
                                        setOpenStageKey((current) => open
                                            ? stage.key
                                            : current === stage.key ? null : current);
                                    }}
                                >
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            aria-label={`${stage.label} ${allLabel}`}
                                            onPointerDown={() => {
                                                openedByHoverRef.current = false;
                                            }}
                                            onKeyDown={(event) => {
                                                if (["Enter", " ", "ArrowDown"].includes(event.key)) {
                                                    openedByHoverRef.current = false;
                                                }
                                            }}
                                            className="ml-0.5 flex h-6 w-5 items-center justify-center rounded-[4px] text-[#86888F] hover:bg-[#F7F8FA] hover:text-[#1E3BFA]"
                                        >
                                            <ChevronDown className="h-3 w-3"/>
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                        align="start"
                                        className="w-48 rounded-[6px] border-[#EBEEF5] bg-white p-1 shadow-[0_8px_24px_rgba(14,17,20,0.12)]"
                                        onOpenAutoFocus={(event) => {
                                            if (openedByHoverRef.current) event.preventDefault();
                                        }}
                                        onPointerEnter={cancelClose}
                                        onPointerLeave={() => scheduleClose(stage.key)}
                                    >
                                        {hasDistinctStageAllOption ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onSelect(stage);
                                                    setOpenStageKey(null);
                                                }}
                                                className={cn("flex h-9 w-full items-center justify-between rounded-[4px] px-3 text-[12px] hover:bg-[#F8F8F9]", stage.allActive ? "bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]" : "text-[#33353D]")}
                                            >
                                                <span>{allLabel}</span><span className="tabular-nums">{stage.count.toLocaleString()}</span>
                                            </button>
                                        ) : null}
                                        {stage.children?.map((child) => (
                                            <button
                                                key={child.key}
                                                type="button"
                                                onClick={() => {
                                                    onSelectChild(stage, child);
                                                    setOpenStageKey(null);
                                                }}
                                                className={cn("flex h-9 w-full items-center justify-between rounded-[4px] px-3 text-[12px] hover:bg-[#F8F8F9]", child.active ? "bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]" : "text-[#33353D]")}
                                            >
                                                <span>{child.label}</span><span className="tabular-nums">{child.count.toLocaleString()}</span>
                                            </button>
                                        ))}
                                    </PopoverContent>
                                </Popover>
                            ) : null}
                        </div>
                    );
                })}
            </div>
            {rightAction ? <div className="flex shrink-0 items-center">{rightAction}</div> : null}
        </div>
    );
}

function CandidatePositionScopeSidebar({
    positions,
    loading,
    activePositionId,
    allPositionCandidateCount,
    onSelectPosition,
    tr,
    isZh,
}: {
    positions: PositionSummary[];
    loading: boolean;
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
    const showInitialLoading = loading && positions.length === 0;

    return (
        <aside className="h-full min-h-0 bg-white py-5 pl-2">
            <div className="flex h-full min-h-0 flex-col bg-white">
                <div className="min-w-0 px-4 pb-3">
                    <p className="truncate whitespace-nowrap text-[15px] font-semibold leading-5 text-[#0E1114]">
                        {isZh ? "招聘中职位" : "Open Positions"}
                    </p>
                    <SearchField
                        value={query}
                        onChange={setQuery}
                        placeholder={isZh ? "搜索职位" : "Search positions"}
                        inputClassName="mt-3 h-8 rounded-[4px] border-[#E6E7EB] bg-white pl-8 pr-2.5 text-[12px] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-1 focus-visible:ring-[#1E3BFA]"
                        iconClassName="left-2.5 h-[13px] w-[13px] text-[#B0B2B8]"
                    />
                </div>
                <div className="min-w-0 px-2">
                    <button
                        type="button"
                        onClick={() => onSelectPosition("")}
                        className={cn(
                            "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-[6px] px-2.5 text-left text-[13px] leading-5 transition",
                            !activePositionId
                                ? "bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]"
                                : "text-[#33353D] hover:bg-[#F8F8F9]",
                        )}
                    >
                        <span className="min-w-0 truncate whitespace-nowrap">{isZh ? "全部职位" : "All Positions"}</span>
                        <span className={cn("text-[11px] tabular-nums", !activePositionId ? "text-[#1E3BFA]" : "text-[#B0B2B8]")}>
                            {showInitialLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : allPositionCandidateCount}
                        </span>
                    </button>
                </div>
                <div className={cn("min-h-0 flex-1 overflow-y-auto px-2", POSITION_SCOPE_SCROLLBAR_CLASS)}>
                    {showInitialLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 6 }).map((_, index) => (
                                <div
                                    key={index}
                                    className="rounded-[6px] px-2.5 py-2"
                                >
                                    <div className="h-3.5 w-28 animate-pulse rounded bg-[#E6E7EB]"/>
                                </div>
                            ))}
                        </div>
                    ) : filteredPositions.length ? filteredPositions.map((position) => {
                        const positionId = String(position.id);
                        const active = activePositionId === positionId;
                        return (
                            <button
                                key={position.id}
                                type="button"
                                onClick={() => onSelectPosition(positionId)}
                                className={cn(
                                    "flex h-9 w-full min-w-0 items-center justify-between gap-3 rounded-[6px] px-2.5 text-left text-[13px] leading-5 transition",
                                    active
                                        ? "bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]"
                                        : "text-[#33353D] hover:bg-[#F8F8F9]",
                                )}
                            >
                                <span className="min-w-0 truncate">{position.title}</span>
                                <span className={cn("shrink-0 text-[11px] tabular-nums", active ? "text-[#1E3BFA]" : "text-[#B0B2B8]")}>{position.candidate_count || 0}</span>
                            </button>
                        );
                    }) : (
                        <div className="px-3 py-8 text-center text-[12px] text-[#86888F]">
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
        <div className="mt-3 min-w-0 overflow-hidden rounded-[8px] border border-[#E6E7EB]/80 bg-[#F7F8FA] px-4 py-4 dark:border-[#202226] dark:bg-[#16181B]/60">
            <pre className="min-w-0 whitespace-pre-wrap break-all text-xs leading-6 text-[#33353D] dark:text-[#D6D8DD]">
                {expanded ? content : preview}
            </pre>
            {hasMore ? (
                <button
                    type="button"
                    className="mt-2 text-xs text-[#B0B2B8] transition hover:text-[#33353D] dark:hover:text-[#D6D8DD]"
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
    onDownload?: () => void;
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
        <div className="overflow-hidden rounded-[8px] border border-[#E6E7EB]/80 bg-white/85 dark:border-[#202226] dark:bg-[#0E1114]/70">
            <div className="flex items-center justify-between gap-3 border-b border-[#E6E7EB]/80 px-4 py-3 dark:border-[#202226]">
                <div className="min-w-0">
                    <p className="font-medium text-[#0E1114] dark:text-[#F7F8FA]">{question.round_name}</p>
                    {question.created_at ? (
                        <p className="mt-0.5 text-xs text-[#86888F] dark:text-[#B0B2B8]">
                            {tr.generatedAt(question.created_at)}
                        </p>
                    ) : null}
                </div>
                <Badge className="h-6 shrink-0 rounded-[3px] border border-[rgba(12,201,145,0.28)] bg-[rgba(12,201,145,0.08)] px-2 text-[12px] text-[#0A9C71]">
                    {tr.generated}
                </Badge>
            </div>

            <div className="grid grid-cols-2 gap-px border-b border-[#E6E7EB]/80 bg-[#E6E7EB]/80 dark:border-[#202226] dark:bg-[#202226]">
                <div className="bg-white px-4 py-2.5 dark:bg-[#0E1114]">
                    <p className="text-xs text-[#86888F] dark:text-[#B0B2B8]">{tr.moduleCount}</p>
                    <p className="mt-0.5 text-sm font-medium text-[#0E1114] dark:text-[#F7F8FA]">
                        {modules.length > 0 ? `${modules.length}${tr.modulesSuffix}` : tr.parsing}
                    </p>
                </div>
                <div className="bg-white px-4 py-2.5 dark:bg-[#0E1114]">
                    <p className="text-xs text-[#86888F] dark:text-[#B0B2B8]">{tr.estimatedQuestions}</p>
                    <p className="mt-0.5 text-sm font-medium text-[#0E1114] dark:text-[#F7F8FA]">
                        {questionCount != null ? `${questionCount}${tr.questionSuffix}` : "-"}
                    </p>
                </div>
            </div>

            {modules.length > 0 ? (
                <div className="space-y-1.5 border-b border-[#E6E7EB]/80 px-4 py-3 dark:border-[#202226]">
                    <p className="text-xs font-medium uppercase tracking-wide text-[#86888F] dark:text-[#B0B2B8]">{tr.moduleOutline}</p>
                    {modules.slice(0, 5).map((moduleName, index) => (
                        <div key={`${moduleName}-${index}`} className="flex items-center gap-2 text-sm text-[#33353D] dark:text-[#D6D8DD]">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#F2F3F5] text-[10px] text-[#86888F] dark:bg-[#202226]">
                                {index + 1}
                            </span>
                            <span className="truncate">{moduleName}</span>
                        </div>
                    ))}
                    {modules.length > 5 ? (
                        <p className="text-xs text-[#B0B2B8] dark:text-[#86888F]">{tr.extraModules(modules.length - 5)}</p>
                    ) : null}
                </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                {onDownload ? (
                    <Button size="sm" className={CANDIDATE_DETAIL_PRIMARY_BUTTON_CLASS} onClick={onDownload}>
                        <Download className="h-4 w-4"/>
                        {tr.downloadHtml}
                    </Button>
                ) : null}
                <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} onClick={onPreview}>
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
    candidateName,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    markdown: string;
    raw?: string | null;
    modelLabel?: string | null;
    generatedAt?: string | null;
    candidateName?: string | null;
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
            <DialogContent aria-describedby={undefined} className="flex h-[min(88vh,900px)] max-h-[88vh] flex-col overflow-hidden rounded-[8px] border-[#EBEEF5] bg-white p-0 shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[900px]">
                <DialogHeader className="border-b border-[#F2F3F5] px-6 pb-3.5 pt-[18px]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <DialogTitle>{tr.fullAiOutput}</DialogTitle>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#86888F]">
                                {modelLabel ? <span>{tr.modelLabel}: {modelLabel}</span> : null}
                                {generatedAt ? <span>{tr.timeLabel}: {formatLongDateTime(generatedAt)}</span> : null}
                                {candidateName ? <span>{language !== "en-US" ? "候选人" : "Candidate"}: {candidateName}</span> : null}
                            </div>
                        </div>
                        <Button size="sm" variant="outline" className="h-[30px] rounded-[6px] border-[#E6E7EB] bg-white text-[12px] text-[#33353D] shadow-none hover:border-[#1E3BFA] hover:bg-[#F7F8FA] hover:text-[#1E3BFA]" onClick={() => void copyContent()} disabled={!(markdown || raw)?.trim()}>
                            {copied ? <Check className="h-4 w-4"/> : <Copy className="h-4 w-4"/>}
                            {copied ? tr.copied : tr.copyAll}
                        </Button>
                    </div>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 [scrollbar-gutter:stable]">
                    <div className="space-y-4">
                        <div className="rounded-[8px] border border-[#EBEEF5] bg-white px-5 py-5">
                            <div className="prose max-w-none text-[13px] leading-7 prose-headings:mb-3 prose-headings:mt-5 prose-headings:font-semibold prose-headings:text-[#0E1114] prose-p:my-3 prose-p:text-[#33353D] prose-strong:text-[#0E1114] prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:text-[#33353D] prose-code:text-[#33353D] prose-pre:rounded-[8px] prose-pre:border prose-pre:border-[#EBEEF5] prose-pre:bg-[#F7F8FA] prose-pre:p-4 prose-pre:text-[#33353D]">
                                <ReactMarkdown>{markdown}</ReactMarkdown>
                            </div>
                        </div>
                        {raw && raw.trim() && raw.trim() !== markdown.trim() ? (
                            <details className="rounded-[8px] border border-[#EBEEF5] bg-[#F7F8FA] px-5 py-4">
                                <summary className="cursor-pointer text-[13px] font-medium text-[#0E1114]">
                                    {tr.viewStructuredRaw}
                                </summary>
                                <pre className="mt-4 whitespace-pre-wrap break-all rounded-[6px] border border-[#E6E7EB] bg-white px-4 py-4 text-[12px] leading-6 text-[#33353D]">
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
            className="overflow-hidden rounded-[6px] border border-[#EBEEF5] bg-white text-[12px] shadow-[0_8px_24px_rgba(14,17,20,0.12)]"
        >
            <div className="max-h-64 overflow-y-auto py-1">
                {options.map((option) => (
                    <label
                        key={option.value}
                        className={cn(
                            "flex cursor-pointer items-center gap-2 overflow-hidden px-3 py-2 text-[#33353D] transition",
                            selected.includes(option.value) ? "bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]" : "hover:bg-[#F8F8F9]"
                        )}
                    >
                        <input
                            type="checkbox"
                            checked={selected.includes(option.value)}
                            onChange={() => toggleValue(option.value)}
                            className="h-3.5 w-3.5 shrink-0 rounded-[3px] border-[#D6D8DD] accent-[#1E3BFA] focus:ring-[#1E3BFA]"
                        />
                        <span className="block min-w-0 flex-1 truncate" title={option.label}>
                            {option.label}
                        </span>
                    </label>
                ))}
            </div>
            <div className="flex justify-end border-t border-[#F2F3F5] bg-[#F7F8FA] px-3 py-2">
                <button
                    type="button"
                    className="rounded-[6px] bg-[#1E3BFA] px-4 py-1.5 text-[12px] font-medium text-white transition hover:bg-[#0F23D9]"
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
                className="flex h-8 min-w-[94px] max-w-[220px] items-center justify-between gap-1 rounded-[4px] border border-transparent bg-white px-2 py-1 text-[12px] text-[#33353D] transition hover:border-[#E6E7EB] hover:bg-[#F8F8F9]"
            >
                <span className={cn(
                    "block w-full truncate",
                    selected.length === 0 ? "text-[#33353D]" : "text-[#0F23D9]"
                )}>
                    {displayText}
                </span>
                <ChevronDown className={cn("h-3 w-3 shrink-0 text-[#86888F]", open && "rotate-180")} />
            </button>
            {open && ReactDOM.createPortal(menuContent, document.body)}
        </>
    );
}

function CandidateFilterBar({
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
    sourceOptions,
    positions,
    statusSelectionLabel,
    statusSelectionIsPipelinePreset,
}: {
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
    sourceOptions: string[];
    positions: PositionSummary[];
    statusSelectionLabel: string;
    statusSelectionIsPipelinePreset: boolean;
}) {
    const {language} = useI18n();
    const tr = React.useMemo(() => getCandidatesLocale(language), [language]);
    const isZh = language !== "en-US";

    const hasActiveFilters = React.useMemo(() => (
        candidateQuery.trim().length > 0
        || candidatePositionFilter.length > 0
        || (candidateStatusFilter.length > 0 && !statusSelectionIsPipelinePreset)
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
        statusSelectionIsPipelinePreset,
    ]);

    const activeFilterChips = React.useMemo(() => {
        const chips: Array<{key: string; label: string; onRemove: () => void}> = [];
        if (candidatePositionFilter.length > 0) {
            const positionNames = candidatePositionFilter.map((positionId) => (
                positions.find((position) => String(position.id) === positionId)?.title || positionId
            ));
            chips.push({
                key: "position",
                label: `${tr.position}：${positionNames.join("、")}`,
                onRemove: () => setCandidatePositionFilter([]),
            });
        }
        if (candidateStatusFilter.length > 0 && !statusSelectionIsPipelinePreset) {
            const statusNames = candidateStatusFilter.map((status) => candidateStatusLabels[status] || status);
            chips.push({
                key: "status",
                label: `${isZh ? "子状态" : "Sub-status"}：${statusNames.join("、")}`,
                onRemove: () => setCandidateStatusFilter([]),
            });
        }
        if (candidateMatchFilter !== "all") {
            const matchLabel = ({
                "80+": tr.above80,
                "60+": tr.above60,
                "40+": tr.above40,
            } as Record<string, string>)[candidateMatchFilter] || candidateMatchFilter;
            chips.push({
                key: "match",
                label: `${tr.matchPercent}：${matchLabel}`,
                onRemove: () => setCandidateMatchFilter("all"),
            });
        }
        if (candidateSourceFilter.length > 0) {
            chips.push({
                key: "source",
                label: `${tr.source}：${candidateSourceFilter.join("、")}`,
                onRemove: () => setCandidateSourceFilter([]),
            });
        }
        if (candidateTimeFilter !== "all") {
            const timeLabel = ({
                today: tr.today,
                "7d": tr.last7Days,
                "30d": tr.last30Days,
            } as Record<string, string>)[candidateTimeFilter] || candidateTimeFilter;
            chips.push({
                key: "time",
                label: `${tr.timeFilter}：${timeLabel}`,
                onRemove: () => setCandidateTimeFilter("all"),
            });
        }
        if (candidateQuery.trim()) {
            chips.push({
                key: "keyword",
                label: `${tr.keywordChipPrefix}${candidateQuery.trim()}`,
                onRemove: () => setCandidateQuery(""),
            });
        }
        return chips;
    }, [
        candidateMatchFilter,
        candidatePositionFilter,
        candidateQuery,
        candidateSourceFilter,
        candidateStatusFilter,
        candidateTimeFilter,
        isZh,
        positions,
        setCandidateMatchFilter,
        setCandidatePositionFilter,
        setCandidateQuery,
        setCandidateSourceFilter,
        setCandidateStatusFilter,
        setCandidateTimeFilter,
        statusSelectionIsPipelinePreset,
        tr,
    ]);

    const resetFilters = React.useCallback(() => {
        setCandidateQuery("");
        setCandidatePositionFilter([]);
        if (!statusSelectionIsPipelinePreset) setCandidateStatusFilter([]);
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
        statusSelectionIsPipelinePreset,
    ]);

    const filterSelectClassName = "h-8 min-w-[94px] rounded-[4px] border-transparent bg-white px-2 py-1 pr-7 text-[12px] text-[#33353D] shadow-none hover:border-[#E6E7EB] hover:bg-[#F8F8F9] focus-visible:border-[#1E3BFA] focus-visible:ring-1 focus-visible:ring-[#1E3BFA]";

    return (
        <div className="mb-3 bg-white">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-6">
                    <MultiSelect
                        options={Object.entries(candidateStatusLabels).map(([value, label]) => ({value, label}))}
                        selected={candidateStatusFilter}
                        onChange={setCandidateStatusFilter}
                        placeholder={isZh ? "状态" : "Status"}
                        selectedLabel={() => statusSelectionLabel}
                    />
                    <NativeSelect value={candidateMatchFilter} onChange={(event) => setCandidateMatchFilter(event.target.value)} className={cn(filterSelectClassName, "w-[108px]")}>
                        <option value="all">{isZh ? "匹配度" : "Match"}</option>
                        <option value="80+">{tr.above80}</option>
                        <option value="60+">{tr.above60}</option>
                        <option value="40+">{tr.above40}</option>
                    </NativeSelect>
                    <MultiSelect
                        options={sourceOptions.map((s) => ({value: s, label: s}))}
                        selected={candidateSourceFilter}
                        onChange={setCandidateSourceFilter}
                        placeholder={isZh ? "来源" : "Source"}
                        selectedLabel={tr.selectedLabel}
                    />
                    <NativeSelect value={candidateTimeFilter} onChange={(event) => setCandidateTimeFilter(event.target.value)} className={cn(filterSelectClassName, "w-[96px]")}>
                        <option value="all">{isZh ? "时间" : "Time"}</option>
                        <option value="today">{tr.today}</option>
                        <option value="7d">{tr.last7Days}</option>
                        <option value="30d">{tr.last30Days}</option>
                    </NativeSelect>
                    <button type="button" onClick={resetFilters} disabled={!hasActiveFilters} className="h-8 px-2 text-[12px] text-[#0F23D9] hover:text-[#1E3BFA] disabled:text-[#B0B2B8]">
                        {isZh ? "重置" : "Reset"}
                    </button>
                </div>
                <SearchField
                    value={candidateQuery}
                    onChange={setCandidateQuery}
                    placeholder={isZh ? "搜索候选人、手机号、邮箱、公司" : tr.searchPlaceholder}
                    inputClassName="h-8 w-[340px] rounded-[4px] border-[#E6E7EB] bg-white text-[12px] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-1 focus-visible:ring-[#1E3BFA]"
                />
            </div>
            {activeFilterChips.length > 0 ? (
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 border-t border-[#F2F3F5] pt-2">
                    {activeFilterChips.map((chip) => (
                        <button
                            key={chip.key}
                            type="button"
                            onClick={chip.onRemove}
                            aria-label={isZh ? `移除筛选：${chip.label}` : `Remove filter: ${chip.label}`}
                            title={isZh ? "点击移除此筛选" : "Click to remove this filter"}
                            className="inline-flex h-7 max-w-[260px] items-center gap-1.5 rounded-[4px] bg-[#F7F8FA] px-2 text-[11px] text-[#5E5F66] transition hover:bg-[#F2F3F5] hover:text-[#0F23D9]"
                        >
                            <span className="truncate">{chip.label}</span>
                            <X className="h-3 w-3 shrink-0 text-[#B0B2B8]"/>
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

type CandidatesPageProps = {
    pageActive: boolean;
    permissions: CandidatePagePermissions;
    panelClass?: string;
    candidateViewMode: CandidateViewMode;
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
    positionsLoading: boolean;
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
    candidateMatchSortLoading: boolean;
    allCandidatesCount: number;
    allPositionCandidateCount: number;
    candidateTotal: number;
    candidatePageIndex: number;
    candidatePageSize: number;
    candidatePageSizeOptions: number[];
    candidatePipelineStatusCounts?: Record<string, number>;
    candidatePipelineTotal?: number;
    candidatePipelineStatsLoading?: boolean;
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
    resolveResumeFileDownloadPath: (file: ResumeFile) => string;
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
    onUploadResume?: () => void;
    onRefreshCandidateDetail?: (candidateId: number) => Promise<void>;
    autoOpenInterviewScheduleCandidateId?: number | null;
    onAutoOpenInterviewScheduleHandled?: (candidateId: number) => void;
    batchUpdateStatus: (candidateIds: number[], status: string, reason: string) => Promise<void>;
    duplicateCandidates: Array<{id: number; candidate_code: string; name: string; phone: string | null; email: string | null; status: string}>;
    interviewSchedules: InterviewSchedule[];
    createInterviewSchedule: (payload: {
        candidate_id: number;
        subject?: string;
        round_name?: string;
        round_index?: number;
        interview_method?: string;
        interviewer_user_code?: string;
        interviewer_name?: string;
        scheduled_at?: string;
        duration_minutes?: number;
        location?: string;
        meeting_room?: string;
        video_tool?: string;
        meeting_link?: string;
        contact_phone?: string;
        notes?: string;
        visible_sections?: string[];
        availability_slot_id?: number;
        department_review_assignment_id?: number;
    }) => Promise<unknown>;
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
    pageActive,
    permissions,
    panelClass = defaultPanelClass,
    candidateViewMode,
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
    positionsLoading,
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
    candidateMatchSortLoading,
    allCandidatesCount,
    allPositionCandidateCount,
    candidateTotal,
    candidatePageIndex,
    candidatePageSize,
    candidatePageSizeOptions,
    candidatePipelineStatusCounts,
    candidatePipelineTotal,
    candidatePipelineStatsLoading,
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
    resolveResumeFileDownloadPath,
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
    onUploadResume,
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
    const [candidatePositionScopeWidth, setCandidatePositionScopeWidth] = React.useState(CANDIDATE_POSITION_SCOPE_DEFAULT_WIDTH);
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
    const [scheduleDatePickerOpen, setScheduleDatePickerOpen] = React.useState(false);
    const defaultRoundName = tr.roundNameDefault;
    const [scheduleForm, setScheduleForm] = React.useState({
        subject: "",
        round_name: defaultRoundName,
        round_index: "1",
        interview_method: "onsite" as InterviewMethod,
        interviewer_user_code: "",
        interviewer_name: "",
        scheduled_at: "",
        duration_minutes: "60",
        availability_slot_id: "",
        department_review_assignment_id: "",
        location: "",
        meeting_room: "",
        video_tool: "腾讯会议",
        meeting_link: "",
        contact_phone: "",
        notes: "",
        visible_sections: [...DEFAULT_INTERVIEW_VISIBLE_SECTIONS],
    });
    const [scheduleFormErrors, setScheduleFormErrors] = React.useState<Partial<Record<CandidateScheduleFormErrorKey, string>>>({});
    const [scheduleAvailabilitySlots, setScheduleAvailabilitySlots] = React.useState<InterviewAvailabilitySlot[]>([]);
    const [scheduleAvailabilityLoading, setScheduleAvailabilityLoading] = React.useState(false);
    const [scheduleSubmitting, setScheduleSubmitting] = React.useState(false);
    const scheduleRequiredText = isZh ? "必填" : "Required";
    const scheduleRequiredErrorClass = "border-[#F53F3F] bg-[rgba(245,63,63,0.04)] focus:border-[#F53F3F] dark:border-[#F53F3F] dark:bg-[rgba(245,63,63,0.06)] dark:focus:border-[#F53F3F]";
    const clearScheduleFormError = React.useCallback((field: CandidateScheduleFormErrorKey) => {
        setScheduleFormErrors((current) => {
            if (!current[field]) return current;
            const next = {...current};
            delete next[field];
            return next;
        });
    }, []);
    const renderScheduleFormError = (field: CandidateScheduleFormErrorKey) => (
        scheduleFormErrors[field] ? <p className="mt-1 text-xs leading-4 text-[#F53F3F]">{scheduleFormErrors[field]}</p> : null
    );
    const scheduleDateOptions = React.useMemo(() => buildDateOptions(35), []);
    const scheduleToday = todayDateValue();
    const scheduleDateTimeParts = React.useMemo(() => localDateTimeParts(scheduleForm.scheduled_at), [scheduleForm.scheduled_at]);
    const scheduleDatePart = scheduleDateTimeParts.date;
    const scheduleStartTimePart = scheduleDateTimeParts.time;
    const scheduleStartMinutes = timeToMinutes(scheduleStartTimePart);
    const rawScheduleDurationMinutes = Number(scheduleForm.duration_minutes || 0);
    const scheduleDurationMinutes = Number.isFinite(rawScheduleDurationMinutes)
        ? Math.max(0, rawScheduleDurationMinutes)
        : 0;
    const scheduleEndMinutes = scheduleStartMinutes == null
        ? null
        : Math.min(TIME_OPTION_END_MINUTES, scheduleStartMinutes + scheduleDurationMinutes);
    const scheduleEndTimePart = scheduleStartMinutes == null || scheduleEndMinutes == null || scheduleEndMinutes <= scheduleStartMinutes
        ? ""
        : formatTimeValue(scheduleEndMinutes);
    const effectiveScheduleDurationMinutes = scheduleStartMinutes == null
        ? scheduleDurationMinutes
        : Math.max(0, (timeToMinutes(scheduleEndTimePart) ?? scheduleStartMinutes) - scheduleStartMinutes);
    const scheduleStartTimeOptions = scheduleStartTimePart && !INTERVIEW_START_TIME_OPTIONS.includes(scheduleStartTimePart)
        ? [...INTERVIEW_START_TIME_OPTIONS, scheduleStartTimePart].sort((a, b) => (timeToMinutes(a) || 0) - (timeToMinutes(b) || 0))
        : INTERVIEW_START_TIME_OPTIONS;
    const scheduleEndTimeOptions = React.useMemo(() => (
        INTERVIEW_END_TIME_OPTIONS.filter((time) => {
            const minutes = timeToMinutes(time);
            return scheduleStartMinutes == null || minutes == null ? true : minutes > scheduleStartMinutes;
        })
    ), [scheduleStartMinutes]);
    const scheduleEndTimeSelectOptions = scheduleEndTimePart && !scheduleEndTimeOptions.includes(scheduleEndTimePart)
        ? [...scheduleEndTimeOptions, scheduleEndTimePart].sort((a, b) => (timeToMinutes(a) || 0) - (timeToMinutes(b) || 0))
        : scheduleEndTimeOptions;
    const [offerFormOpen, setOfferFormOpen] = React.useState(false);
    const [offerForm, setOfferForm] = React.useState({offer_title: "", salary: "", department: "", entry_date: "", offer_content: "", notes: ""});
    const [offerSubmitting, setOfferSubmitting] = React.useState(false);
    const [followUpFormOpen, setFollowUpFormOpen] = React.useState(false);
    const [followUpContent, setFollowUpContent] = React.useState("");
    const [followUpType, setFollowUpType] = React.useState("note");
    const [followUpSubmitting, setFollowUpSubmitting] = React.useState(false);
    const [nestedDeleteTarget, setNestedDeleteTarget] = React.useState<CandidateNestedDeleteTarget | null>(null);
    const [nestedDeleteSubmitting, setNestedDeleteSubmitting] = React.useState(false);
    const candidateDetailToolbarScrollRef = React.useRef<HTMLDivElement | null>(null);
    const candidateDetailToolbarRailRef = React.useRef<HTMLDivElement | null>(null);
    const candidateDetailToolbarSyncSourceRef = React.useRef<"viewport" | "rail" | null>(null);
    const [candidateDetailToolbarRailWidth, setCandidateDetailToolbarRailWidth] = React.useState(0);
    const [candidateDetailToolbarHasOverflow, setCandidateDetailToolbarHasOverflow] = React.useState(false);
    const candidatePositionScopeCollapsed = candidatePositionScopeWidth <= CANDIDATE_POSITION_SCOPE_MIN_WIDTH + 1;
    const candidatePositionScopeGridStyle = React.useMemo(() => ({
        "--candidate-position-scope-width": `${candidatePositionScopeWidth}px`,
    }) as React.CSSProperties, [candidatePositionScopeWidth]);

    const handleCandidatePositionScopeResizeStart = useColumnResizeDrag({
        currentWidth: candidatePositionScopeWidth,
        maxWidth: CANDIDATE_POSITION_SCOPE_MAX_WIDTH,
        minWidth: CANDIDATE_POSITION_SCOPE_MIN_WIDTH,
        setWidth: setCandidatePositionScopeWidth,
    });

    const handleCandidatePositionScopeResizeKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
        const normalizeWidth = (width: number) => Math.max(
            CANDIDATE_POSITION_SCOPE_MIN_WIDTH,
            Math.min(CANDIDATE_POSITION_SCOPE_MAX_WIDTH, width),
        );

        if (event.key === "ArrowLeft") {
            event.preventDefault();
            setCandidatePositionScopeWidth((width) => normalizeWidth(width - 24));
            return;
        }

        if (event.key === "ArrowRight") {
            event.preventDefault();
            setCandidatePositionScopeWidth((width) => normalizeWidth(width + 24));
            return;
        }

        if (event.key === "Home") {
            event.preventDefault();
            setCandidatePositionScopeWidth(CANDIDATE_POSITION_SCOPE_MIN_WIDTH);
            return;
        }

        if (event.key === "End") {
            event.preventDefault();
            setCandidatePositionScopeWidth(CANDIDATE_POSITION_SCOPE_MAX_WIDTH);
        }
    }, []);
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
    const rowVirtualizerRef = React.useRef(rowVirtualizer);
    React.useEffect(() => {
        rowVirtualizerRef.current = rowVirtualizer;
    }, [rowVirtualizer]);

    React.useLayoutEffect(() => {
        const frameId = window.requestAnimationFrame(() => {
            if (candidateViewMode === "list") {
                rowVirtualizerRef.current.scrollToOffset(0);
                candidateListViewportEl?.scrollTo({ top: 0, behavior: "auto" });
                return;
            }
            candidateBoardViewportEl?.scrollTo({ top: 0, behavior: "auto" });
        });
        return () => window.cancelAnimationFrame(frameId);
    }, [candidateBoardViewportEl, candidateListViewportEl, candidatePageIndex, candidatePageSize, candidateViewMode]);

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
    const candidatePrototypeListGridLayout = React.useMemo(
        () => getCandidatePrototypeListGridTemplate(),
        [],
    );

    const selectedCandidateIdSet = React.useMemo(() => new Set(selectedCandidateIds), [selectedCandidateIds]);
    const visibleCandidateIds = React.useMemo(() => visibleCandidates.map((candidate) => candidate.id), [visibleCandidates]);
    const batchScreeningActionsAllowed = React.useMemo(() => {
        if (!selectedCandidateIds.length) return false;
        const selectedCandidatesOnPage = visibleCandidates.filter((candidate) => selectedCandidateIdSet.has(candidate.id));
        return selectedCandidatesOnPage.length === selectedCandidateIds.length
            && selectedCandidatesOnPage.every((candidate) => !BATCH_SCREENING_PROTECTED_STATUS_SET.has(resolveCandidateDisplayStatus(candidate)));
    }, [selectedCandidateIdSet, selectedCandidateIds.length, visibleCandidates]);
    const selectedVisibleCandidateCount = React.useMemo(() => (
        visibleCandidateIds.reduce((count, candidateId) => count + (selectedCandidateIdSet.has(candidateId) ? 1 : 0), 0)
    ), [selectedCandidateIdSet, visibleCandidateIds]);
    const allVisibleCandidatesSelected = React.useMemo(() => (
        visibleCandidateIds.length > 0 && visibleCandidateIds.every((candidateId) => selectedCandidateIdSet.has(candidateId))
    ), [selectedCandidateIdSet, visibleCandidateIds]);
    const someVisibleCandidatesSelected = selectedVisibleCandidateCount > 0 && !allVisibleCandidatesSelected;
    const visibleSelectAllBatchCheckboxRef = React.useRef<HTMLInputElement | null>(null);
    const visibleSelectAllTableCheckboxRef = React.useRef<HTMLInputElement | null>(null);
    React.useEffect(() => {
        [visibleSelectAllBatchCheckboxRef.current, visibleSelectAllTableCheckboxRef.current].forEach((checkbox) => {
            if (checkbox) checkbox.indeterminate = someVisibleCandidatesSelected;
        });
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
    const activePositionTotal = React.useMemo(() => {
        if (!activeQuickPosition) {
            return allPositionCandidateCount;
        }
        const position = positions.find((item) => String(item.id) === activeQuickPosition);
        return Number(position?.candidate_count || 0);
    }, [activeQuickPosition, allPositionCandidateCount, positions]);
    const candidatePipelineStages = React.useMemo<CandidatePipelineStageSummary[]>(() => {
        const scopedStatusCounts = candidatePipelineStatusCounts || null;
        const scopedTotal = typeof candidatePipelineTotal === "number" ? candidatePipelineTotal : null;
        return CANDIDATE_PIPELINE_STAGES.map((stage) => {
            const stageStatusValues = resolvePipelineStatusValues(stage);
            const stageCount = stageStatusValues.length
                ? stageStatusValues.reduce((sum, value) => sum + (scopedStatusCounts ? Number(scopedStatusCounts[value] || 0) : 0), 0)
                : (scopedTotal ?? activePositionTotal);
            const children = stage.children?.map((child) => {
                const childStatusValues = resolvePipelineStatusValues(child);
                return {
                    ...child,
                    label: isZh ? child.labelZh : child.labelEn,
                    count: childStatusValues.reduce((sum, value) => sum + (scopedStatusCounts ? Number(scopedStatusCounts[value] || 0) : 0), 0),
                    active: childStatusValues.length > 0
                        && candidateStatusFilter.length === childStatusValues.length
                        && childStatusValues.every((value) => candidateStatusFilter.includes(value)),
                    resolvedStatusValues: childStatusValues,
                };
            });
            const stageActive = stageStatusValues.length
                ? candidateStatusFilter.length === stageStatusValues.length && stageStatusValues.every((value) => candidateStatusFilter.includes(value))
                : candidateStatusFilter.length === 0;
            const active = stageActive || Boolean(children?.some((child) => child.active));
            return {
                ...stage,
                label: isZh ? stage.labelZh : stage.labelEn,
                hint: isZh ? stage.hintZh : stage.hintEn,
                count: stageCount,
                active,
                allActive: stageActive,
                resolvedStatusValues: stageStatusValues,
                children,
            };
        });
    }, [activePositionTotal, candidatePipelineStatusCounts, candidatePipelineTotal, candidateStatusFilter, isZh]);
    const candidateStatusSelectionLabel = React.useMemo(() => {
        const activeChild = candidatePipelineStages
            .flatMap((stage) => stage.children || [])
            .find((child) => child.active);
        if (activeChild) return activeChild.label;

        const activeStage = candidatePipelineStages.find((stage) => stage.allActive && stage.key !== "all");
        if (activeStage?.children?.length) {
            return isZh ? "全部子状态" : "All sub-statuses";
        }
        if (activeStage) return activeStage.label;
        return isZh ? `子状态 ${candidateStatusFilter.length}` : `${candidateStatusFilter.length} sub-statuses`;
    }, [candidatePipelineStages, candidateStatusFilter.length, isZh]);
    const candidateStatusSelectionIsPipelinePreset = React.useMemo(() => (
        candidateStatusFilter.length === 0
        || candidatePipelineStages.some((stage) => (
            stage.allActive || Boolean(stage.children?.some((child) => child.active))
        ))
    ), [candidatePipelineStages, candidateStatusFilter.length]);
    const selectCandidatePipelineStage = React.useCallback((stage: CandidatePipelineStageSummary) => {
        setCandidateStatusFilter(stage.resolvedStatusValues);
    }, [setCandidateStatusFilter]);
    const selectCandidatePipelineChild = React.useCallback((_stage: CandidatePipelineStageSummary, child: CandidatePipelineStageChildSummary) => {
        setCandidateStatusFilter(child.resolvedStatusValues);
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

    const [candidateDetailPrimaryTab, setCandidateDetailPrimaryTab] = React.useState<CandidateDetailPrimaryTabKey>("profile");
    const [candidateDetailPanel, setCandidateDetailPanel] = React.useState<CandidateDetailPanelKey>("resume");
    const [candidateResumeView, setCandidateResumeView] = React.useState<CandidateResumeViewKey>("standard");
    const [selectedResumeFileId, setSelectedResumeFileId] = React.useState<number | null>(null);
    const [candidateResumeMoreOpen, setCandidateResumeMoreOpen] = React.useState(false);
    const [candidateHeaderMoreOpen, setCandidateHeaderMoreOpen] = React.useState(false);
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
    const [candidateNoteDraft, setCandidateNoteDraft] = React.useState("");
    const [candidateDetailSideRailTab, setCandidateDetailSideRailTab] = React.useState<"note" | "followups">("note");
    const [departmentReviewVisibleSections, setDepartmentReviewVisibleSections] = React.useState<string[]>([
        "original_resume",
        "standard_resume",
        "screening_result",
    ]);
    const candidateDetailMainScrollRef = React.useRef<HTMLElement | null>(null);
    const candidateDetailOpenTargetRef = React.useRef<{candidateId: number; panel: CandidateDetailPanelKey} | null>(null);

    const openCandidateDetailPanel = React.useCallback((panel: CandidateDetailPanelKey) => {
        setCandidateDetailPanel(panel);
        if (panel === "resume") {
            setCandidateDetailPrimaryTab("resume");
        } else if (["assessment", "screening", "review"].includes(panel)) {
            setCandidateDetailPrimaryTab("ai");
        } else {
            setCandidateDetailPrimaryTab("prep");
        }
        window.requestAnimationFrame(() => {
            candidateDetailMainScrollRef.current?.scrollTo({top: 0, behavior: "auto"});
        });
    }, []);

    const selectCandidateDetailPrimaryTab = React.useCallback((tab: CandidateDetailPrimaryTabKey) => {
        setCandidateDetailPrimaryTab(tab);
        if (tab === "resume") setCandidateDetailPanel("resume");
        if (tab === "ai") setCandidateDetailPanel("assessment");
        if (tab === "prep") setCandidateDetailPanel(permissions.viewInterview ? "interview" : "offer");
        window.requestAnimationFrame(() => {
            candidateDetailMainScrollRef.current?.scrollTo({top: 0, behavior: "auto"});
        });
    }, [permissions.viewInterview]);

    const openCandidateFromPrimaryAction = React.useCallback((candidateId: number, panel: CandidateDetailPanelKey) => {
        if (selectedCandidateId === candidateId) {
            candidateDetailOpenTargetRef.current = null;
            openCandidateDetailPanel(panel);
            return;
        }
        candidateDetailOpenTargetRef.current = {candidateId, panel};
        setSelectedCandidateId(candidateId);
    }, [openCandidateDetailPanel, selectedCandidateId, setSelectedCandidateId]);

    const switchCandidateResumeView = React.useCallback((view: CandidateResumeViewKey) => {
        openCandidateDetailPanel("resume");
        setCandidateResumeView(view);
        setCandidateResumeMoreOpen(false);
        window.requestAnimationFrame(() => {
            candidateDetailMainScrollRef.current?.scrollTo({
                top: 0,
                behavior: "auto",
            });
        });
    }, [openCandidateDetailPanel]);
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
    React.useEffect(() => {
        if (!scheduleFormOpen) {
            setScheduleDatePickerOpen(false);
        }
    }, [scheduleFormOpen]);
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
            const currentDuration = Number(current.duration_minutes || 60);
            const duration = start && end && Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
                ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000))
                : Number.isFinite(currentDuration) ? currentDuration : 60;
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
        setScheduleFormErrors((current) => {
            if (!current.scheduled_date && !current.scheduled_start_time && !current.scheduled_end_time) return current;
            const next = {...current};
            delete next.scheduled_date;
            delete next.scheduled_start_time;
            delete next.scheduled_end_time;
            return next;
        });
    }, [scheduleAvailabilitySlots]);
    const highestInterviewRoundIndex = React.useMemo(() => {
        return interviewSchedules.reduce((maxRoundIndex, schedule) => {
            const explicitRoundIndex = Number(schedule.round_index || 0);
            const roundIndex = Number.isFinite(explicitRoundIndex) && explicitRoundIndex > 0
                ? explicitRoundIndex
                : interviewRoundIndexForName(String(schedule.round_name || ""), 1);
            return Math.max(maxRoundIndex, roundIndex);
        }, 0);
    }, [interviewSchedules]);
    const buildNextInterviewRoundName = React.useCallback((roundIndex: number) => {
        return interviewRoundNameForIndex(roundIndex);
    }, []);
    const openInterviewScheduleForm = React.useCallback(() => {
        if (!permissions.manageInterview) {
            return;
        }
        const nextRoundIndex = Math.max(1, highestInterviewRoundIndex + 1);
        const nextRoundName = buildNextInterviewRoundName(nextRoundIndex);
        openCandidateDetailPanel("interview");
        setScheduleDatePickerOpen(false);
        setScheduleForm({
            subject: defaultInterviewSubject(candidateDetail?.candidate.name),
            round_name: nextRoundName,
            round_index: String(interviewRoundIndexForName(nextRoundName, nextRoundIndex)),
            interview_method: "onsite",
            interviewer_user_code: "",
            interviewer_name: "",
            scheduled_at: "",
            duration_minutes: "60",
            availability_slot_id: "",
            department_review_assignment_id: latestPassedDepartmentReviewAssignmentId ? String(latestPassedDepartmentReviewAssignmentId) : "",
            location: "",
            meeting_room: "",
            video_tool: "腾讯会议",
            meeting_link: "",
            contact_phone: String(candidateDetail?.candidate.phone || "").trim(),
            notes: "",
            visible_sections: [...DEFAULT_INTERVIEW_VISIBLE_SECTIONS],
        });
        setScheduleFormErrors({});
        setScheduleAvailabilitySlots([]);
        setScheduleFormOpen(true);
    }, [buildNextInterviewRoundName, candidateDetail?.candidate.name, candidateDetail?.candidate.phone, highestInterviewRoundIndex, latestPassedDepartmentReviewAssignmentId, openCandidateDetailPanel, permissions.manageInterview]);
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
            toast.error(isZh ? "请选择评审人" : "Please select reviewers");
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
            openCandidateDetailPanel("review");
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
        openCandidateDetailPanel,
        selectedDepartmentReviewers,
    ]);

    const handleCandidateDetailMainScroll = React.useCallback((event: React.UIEvent<HTMLElement>) => {
        const nextScrolled = event.currentTarget.scrollTop > 132;
        setCandidateDetailMainScrolled((current) => current === nextScrolled ? current : nextScrolled);
    }, []);
    const isDepartmentReviewDecisionMode = Boolean(
        permissions.actReview
        &&
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
        const content = candidateNoteDraft.trim();
        if (!candidateId || !content || candidateDetailNoteSubmitting) {
            return;
        }
        setCandidateDetailNoteSubmitting(true);
        try {
            await createFollowUp(candidateId, content, "note");
            setCandidateNoteDraft("");
            setCandidateDetailSideRailTab("followups");
            openCandidateDetailPanel("background");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : (isZh ? "保存备注失败" : "Failed to save note"));
        } finally {
            setCandidateDetailNoteSubmitting(false);
        }
    }, [
        candidateDetail?.candidate.id,
        candidateDetailNoteSubmitting,
        candidateNoteDraft,
        createFollowUp,
        isZh,
        openCandidateDetailPanel,
    ]);
    const manualCandidateStatusOptions = React.useMemo(
        () => Object.entries(candidateStatusLabels).filter(([value]) => !DERIVED_CANDIDATE_DISPLAY_STATUS_VALUES.has(value)),
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
        const requestedTarget = candidateDetailOpenTargetRef.current;
        if (requestedTarget?.candidateId === selectedCandidateId) {
            openCandidateDetailPanel(requestedTarget.panel);
            window.requestAnimationFrame(() => {
                if (candidateDetailOpenTargetRef.current === requestedTarget) {
                    candidateDetailOpenTargetRef.current = null;
                }
            });
        } else if (!requestedTarget || selectedCandidateId !== null) {
            candidateDetailOpenTargetRef.current = null;
            setCandidateDetailPrimaryTab("profile");
            setCandidateDetailPanel("resume");
        }
        setCandidateResumeView("standard");
        setSelectedResumeFileId(null);
        setCandidateResumeMoreOpen(false);
        setCandidateHeaderMoreOpen(false);
        setCandidateAiOutputDialogOpen(false);
        setCandidateDetailMainScrolled(false);
        setCandidateDetailSideRailTab("note");
        setPotentialReasonExpanded(false);
        const frameId = window.requestAnimationFrame(() => {
            candidateDetailMainScrollRef.current?.scrollTo({top: 0, behavior: "auto"});
        });
        return () => window.cancelAnimationFrame(frameId);
    }, [openCandidateDetailPanel, selectedCandidateId]);

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
    const currentResumeFile = React.useMemo(() => {
        if (!resumeFiles.length) {
            return null;
        }
        const latestResumeFileId = candidateDetail?.candidate.latest_resume_file_id;
        return (latestResumeFileId ? resumeFiles.find((file) => file.id === latestResumeFileId) : null) ?? resumeFiles[0];
    }, [candidateDetail?.candidate.latest_resume_file_id, resumeFiles]);
    const primaryResumeFile = React.useMemo(() => {
        if (selectedResumeFileId == null) {
            return currentResumeFile;
        }
        return resumeFiles.find((file) => file.id === selectedResumeFileId) ?? currentResumeFile;
    }, [currentResumeFile, resumeFiles, selectedResumeFileId]);
    const resumeActionFile = candidateResumeView === "original" ? primaryResumeFile : currentResumeFile;
    const [inlineResumePreviewBlob, setInlineResumePreviewBlob] = React.useState<Blob | null>(null);
    const [inlineResumePreviewUrl, setInlineResumePreviewUrl] = React.useState<string | null>(null);
    const [inlineResumePreviewFallback, setInlineResumePreviewFallback] = React.useState(false);
    const [inlineResumePreviewLoading, setInlineResumePreviewLoading] = React.useState(false);
    const [inlineResumePreviewError, setInlineResumePreviewError] = React.useState<string | null>(null);
    const [inlineResumeFrameReady, setInlineResumeFrameReady] = React.useState(false);
    const inlineResumeFrameReadyTimerRef = React.useRef<number | null>(null);
    const latestInterviewQuestion = candidateDetail?.interview_questions[0] ?? null;
    const sortedInterviewSchedules = React.useMemo(() => (
        [...interviewSchedules].sort((left, right) => {
            const leftTime = parseInterviewScheduleDate(left.scheduled_at)?.getTime() ?? -Infinity;
            const rightTime = parseInterviewScheduleDate(right.scheduled_at)?.getTime() ?? -Infinity;
            if (leftTime !== rightTime) return rightTime - leftTime;
            return Number(right.id || 0) - Number(left.id || 0);
        })
    ), [interviewSchedules]);
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
        [candidateDetail?.score, latestResumeScoreLog, tr],
    );
    const candidateAiOutputAvailable = Boolean(
        candidateAiOutputPayload.markdown.trim()
        || candidateAiOutputPayload.raw.trim(),
    );
    const candidateAiModelLabel = latestResumeScoreLog
        ? `${labelForProvider(latestResumeScoreLog.model_provider)} / ${latestResumeScoreLog.model_name || tr.unrecorded}`
        : null;
    const candidateAiGeneratedAt = latestResumeScoreLog?.created_at
        || candidateDetail?.score?.updated_at
        || candidateDetail?.score?.created_at
        || null;
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
            ...INTERVIEW_PIPELINE_STATUS_VALUES,
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
        openCandidateDetailPanel("screening");
        if (candidateDetailHasScreeningAttempt) {
            await triggerFreshScreening();
            return;
        }
        await triggerScreening();
    }, [
        candidateDetail?.candidate.id,
        candidateDetailHasScreeningAttempt,
        candidateDetailScreeningLive,
        openCandidateDetailPanel,
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

        authenticatedFetch(resolveResumeFileDownloadPath(primaryResumeFile), {
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
    }, [candidateDetailPanel, candidateResumePreviewRefreshKey, candidateResumeView, isZh, primaryResumeFile, resolveResumeFileDownloadPath]);
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
    const printCandidateResume = React.useCallback(async (file: ResumeFile | null = primaryResumeFile) => {
        if (!file) {
            toast.error(isZh ? "暂无可打印的简历" : "No resume is available to print");
            return;
        }
        const canPrintInlinePreview = primaryResumeFile?.id === file.id && Boolean(inlineResumePreviewUrl);
        if (!canPrintInlinePreview || !inlineResumePreviewUrl) {
            await openResumeFile(file, false);
            return;
        }
        const printWindow = window.open(inlineResumePreviewUrl, "_blank");
        if (!printWindow) {
            toast.error(isZh ? "浏览器阻止了打印窗口，请允许弹窗后重试" : "The print window was blocked. Allow pop-ups and try again.");
            return;
        }
        printWindow.opener = null;
        const triggerPrint = () => {
            window.setTimeout(() => {
                try {
                    printWindow.focus();
                    printWindow.print();
                } catch {
                    // The opened resume remains available for the browser's own print action.
                }
            }, 300);
        };
        if (printWindow.document.readyState === "complete") {
            triggerPrint();
        } else {
            printWindow.addEventListener("load", triggerPrint, {once: true});
        }
    }, [inlineResumePreviewUrl, isZh, openResumeFile, primaryResumeFile]);
    const candidateDetailPrimaryTabs = React.useMemo<Array<{key: CandidateDetailPrimaryTabKey; label: string}>>(() => ([
        {key: "profile", label: isZh ? "档案" : "Profile"},
        {key: "resume", label: isZh ? "简历" : "Resume"},
        {key: "ai", label: isZh ? "AI 评估" : "AI Evaluation"},
        {key: "prep", label: isZh ? "面试准备" : "Interview Prep"},
    ]), [isZh]);
    const candidateDetailBusinessTabs = React.useMemo<Array<{key: CandidateDetailPanelKey; label: string; count?: number | null; disabled?: boolean}>>(() => {
        const tabs: Array<{key: CandidateDetailPanelKey; label: string; count?: number | null; disabled?: boolean}> = [
            {key: "resume", label: isZh ? "简历" : "Resume"},
            {key: "assessment", label: isZh ? "测评" : "Assessment", count: candidateDetail?.score ? 1 : null},
            {key: "screening", label: isZh ? "筛选" : "Screening", count: candidateProcessActivity.length || null},
        ];
        if (permissions.viewReview) tabs.push({key: "review", label: isZh ? "评审" : "Review", count: departmentReviews.length || null});
        if (permissions.viewSkill) tabs.push({key: "exam", label: isZh ? "考试" : "Exam", disabled: true});
        if (permissions.viewInterview) tabs.push({key: "interview", label: isZh ? "面试" : "Interview", count: interviewSchedules.length || candidateDetail?.interview_questions.length || null});
        tabs.push(
            {key: "offer", label: "Offer", count: offers.length || null},
            {key: "background", label: isZh ? "背调" : "Background", count: followUps.length || null},
        );
        return tabs;
    }, [candidateDetail?.interview_questions.length, candidateDetail?.score, candidateProcessActivity.length, departmentReviews.length, followUps.length, interviewSchedules.length, isZh, offers.length, permissions.viewInterview, permissions.viewReview, permissions.viewSkill]);
    const visibleCandidateDetailBusinessTabs = React.useMemo(() => {
        if (candidateDetailPrimaryTab === "ai") {
            return candidateDetailBusinessTabs.filter((tab) => ["assessment", "screening", "review"].includes(tab.key));
        }
        if (candidateDetailPrimaryTab === "prep") {
            return candidateDetailBusinessTabs.filter((tab) => ["exam", "interview", "offer", "background"].includes(tab.key));
        }
        return [];
    }, [candidateDetailBusinessTabs, candidateDetailPrimaryTab]);
    const candidateDetailFlowSteps = React.useMemo(() => ([
        {status: "pending_screening", label: isZh ? "简历初筛" : "Resume Screen"},
        {status: "department_review_pending", label: isZh ? "部门评审" : "Dept Review"},
        {status: "pending_interview", label: isZh ? "面试" : "Interview"},
        {status: "pending_offer", label: "Offer"},
        {status: "hired", label: isZh ? "入职" : "Hired"},
    ]), [isZh]);
    const normalizedCandidateDetailFlowStatus = React.useMemo(() => {
        if (candidateDetailDisplayStatus === "screening_passed") return "department_review_pending";
        if (candidateDetailDisplayStatus === "screening_rejected") return "pending_screening";
        if (candidateDetailDisplayStatus === "department_review_passed") return "pending_interview";
        if (candidateDetailDisplayStatus === "department_review_rejected") return "department_review_pending";
        if (["interview_passed", "pending_offer", "offer_sent"].includes(candidateDetailDisplayStatus)) return "pending_offer";
        if (INTERVIEW_PIPELINE_STATUS_SET.has(candidateDetailDisplayStatus) || INTERVIEW_REJECTED_STATUS_SET.has(candidateDetailDisplayStatus)) {
            return "pending_interview";
        }
        return candidateDetailDisplayStatus;
    }, [candidateDetailDisplayStatus]);
    const candidateDetailFlowIndex = candidateDetailFlowSteps.findIndex((step) => step.status === normalizedCandidateDetailFlowStatus);
    const parsedResumeBasicInfo = candidateDetail?.parse_result?.basic_info ?? null;
    const parsedResumeEducationRecords = structuredRecords(candidateDetail?.parse_result?.education_experiences);
    const parsedResumeWorkRecords = structuredRecords(candidateDetail?.parse_result?.work_experiences);
    const parsedResumeEducation = parsedResumeEducationRecords[0] ?? null;
    const parsedResumeWork = parsedResumeWorkRecords[0] ?? null;
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
    const confirmNestedDelete = React.useCallback(async () => {
        if (!nestedDeleteTarget || nestedDeleteSubmitting) {
            return;
        }
        setNestedDeleteSubmitting(true);
        try {
            if (nestedDeleteTarget.kind === "offer") {
                await deleteOffer(nestedDeleteTarget.id);
            } else if (nestedDeleteTarget.kind === "follow_up") {
                await deleteFollowUp(nestedDeleteTarget.id);
            } else {
                await deleteInterviewSchedule(nestedDeleteTarget.id);
            }
            setNestedDeleteTarget(null);
        } finally {
            setNestedDeleteSubmitting(false);
        }
    }, [deleteFollowUp, deleteInterviewSchedule, deleteOffer, nestedDeleteSubmitting, nestedDeleteTarget]);
    const candidateDialogClassName = "overflow-hidden rounded-[8px] border-[#EBEEF5] bg-white p-0 text-[#0E1114] shadow-[0_8px_24px_rgba(14,17,20,0.16)]";
    const candidateDialogHeaderClassName = "border-b border-[#F2F3F5] px-6 pb-3.5 pt-[18px]";
    const candidateDialogBodyClassName = "space-y-4 px-6 py-5";
    const candidateDialogFooterClassName = "-mx-6 -mb-5 mt-5 flex min-h-16 items-center justify-end gap-3 border-t border-[#F2F3F5] px-6";
    const candidateDialogSecondaryButtonClassName = "h-[34px] rounded-[6px] border-[#E6E7EB] bg-white px-[18px] text-[13px] text-[#33353D] shadow-none hover:border-[#1E3BFA] hover:bg-[#F7F8FA] hover:text-[#1E3BFA]";
    const candidateDialogPrimaryButtonClassName = "h-[34px] rounded-[6px] bg-[#1E3BFA] px-[18px] text-[13px] text-white shadow-none hover:bg-[#0F23D9] disabled:bg-[#1E3BFA] disabled:text-white disabled:opacity-50";
    const candidateBatchActionButtonClassName = "h-7 shrink-0 whitespace-nowrap rounded-[4px] border-[#E6E7EB] bg-white px-2.5 text-[12px] font-normal text-[#33353D] shadow-none hover:border-[#1E3BFA] hover:bg-[#F7F8FA] hover:text-[#1E3BFA] focus-visible:ring-1 focus-visible:ring-[#1E3BFA]";

    return (
        <>
            <div className="h-full min-h-0 overflow-hidden bg-white">
                <div
                    className="grid h-full min-h-0 grid-cols-1 gap-0 overflow-hidden bg-white xl:grid-cols-[var(--candidate-position-scope-width)_minmax(0,1fr)]"
                    style={candidatePositionScopeGridStyle}
                >
                    <div className="relative hidden min-h-0 overflow-visible border-r border-dashed border-[#EBEEF5] xl:block">
                        <div
                            className={cn(
                                "h-full min-w-0 overflow-hidden transition-opacity duration-150",
                                candidatePositionScopeCollapsed && "pointer-events-none opacity-0",
                            )}
                            aria-hidden={candidatePositionScopeCollapsed}
                        >
                            <CandidatePositionScopeSidebar
                                positions={positions}
                                loading={positionsLoading}
                                activePositionId={activeQuickPosition}
                                allPositionCandidateCount={allPositionCandidateCount}
                                onSelectPosition={(positionId) => setCandidatePositionFilter(positionId ? [positionId] : [])}
                                tr={tr}
                                isZh={isZh}
                            />
                        </div>
                        <button
                            type="button"
                            aria-label={isZh ? "拖拽调整招聘中职位栏宽度" : "Resize open positions panel"}
                            title={isZh ? "左右拖拽调整宽度，双击恢复默认宽度" : "Drag horizontally to resize; double click to reset"}
                            onPointerDown={handleCandidatePositionScopeResizeStart}
                            onKeyDown={handleCandidatePositionScopeResizeKeyDown}
                            onDoubleClick={() => setCandidatePositionScopeWidth(CANDIDATE_POSITION_SCOPE_DEFAULT_WIDTH)}
                            className={cn(
                                "group absolute -right-1 top-0 z-20 flex h-full w-2 cursor-col-resize touch-none items-center justify-center outline-none transition focus-visible:ring-1 focus-visible:ring-[#1E3BFA]",
                                "hover:bg-[rgba(30,59,250,0.04)]",
                                candidatePositionScopeCollapsed && "bg-white/80",
                            )}
                        >
                            <span
                                className={cn(
                                    "block h-full w-px bg-transparent transition",
                                    candidatePositionScopeCollapsed
                                        ? "bg-[#1E3BFA]"
                                        : "group-hover:bg-[#1E3BFA]",
                                )}
                            />
                        </button>
                    </div>
                <Card className="h-full !gap-0 overflow-hidden rounded-none border-0 bg-white !py-0 shadow-none">
                    <CardHeader className="gap-0 px-8 pb-0 pt-5">
                        <CandidatePipelineBar
                            stages={candidatePipelineStages}
                            onSelect={selectCandidatePipelineStage}
                            onSelectChild={selectCandidatePipelineChild}
                            loading={candidatePipelineStatsLoading}
                            allLabel={isZh ? "全部" : "All"}
                            rightAction={permissions.manageCandidate && onUploadResume ? (
                                <Button
                                    type="button"
                                    onClick={onUploadResume}
                                    className="h-9 rounded-[6px] bg-[#1E3BFA] px-[18px] text-[14px] font-normal text-white shadow-none hover:bg-[#0F23D9] hover:text-white"
                                >
                                    {isZh ? "上传简历" : "Upload Resume"}
                                </Button>
                            ) : null}
                        />
                        <CandidateFilterBar
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
                            sourceOptions={sourceOptions}
                            positions={positions}
                            statusSelectionLabel={candidateStatusSelectionLabel}
                            statusSelectionIsPipelinePreset={candidateStatusSelectionIsPipelinePreset}
                        />
                        <div
                            className={cn(
                                "mt-0 flex items-center gap-2",
                                selectedCandidateIds.length > 0
                                    ? "overflow-hidden rounded-[6px] bg-[#F7F8FA] px-2 py-2"
                                    : "mb-1 h-10 flex-wrap justify-between rounded-[6px] bg-[#F7F8FA] px-3.5",
                            )}
                        >
                            {selectedCandidateIds.length > 0 ? (
                                <>
                                    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                        <label
                                            className={cn(
                                                "inline-flex h-7 shrink-0 items-center gap-2 rounded-[4px] border border-[#E6E7EB] bg-white px-2.5 text-[#33353D] shadow-none transition hover:border-[#1E3BFA] hover:text-[#1E3BFA]",
                                                visibleCandidateIds.length ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                                            )}
                                        >
                                            <input
                                                ref={visibleSelectAllBatchCheckboxRef}
                                                type="checkbox"
                                                className="h-3.5 w-3.5 rounded-[3px] border-[#D6D8DD] accent-[#1E3BFA] focus:ring-[#1E3BFA]"
                                                checked={allVisibleCandidatesSelected}
                                                disabled={!visibleCandidateIds.length}
                                                aria-checked={someVisibleCandidatesSelected ? "mixed" : allVisibleCandidatesSelected}
                                                aria-label={allVisibleCandidatesSelected ? tr.unselectVisibleCandidates : tr.selectVisibleCandidates}
                                                onChange={toggleVisibleCandidateSelection}
                                            />
                                            <span className="text-[12px] font-normal">
                                                {allVisibleCandidatesSelected ? tr.unselectVisibleCandidates : tr.selectVisibleCandidates}
                                            </span>
                                        </label>
                                        <span className="inline-flex h-7 shrink-0 items-center rounded-[4px] border border-[#1E3BFA] bg-[rgba(30,59,250,0.05)] px-2.5 text-[12px] font-medium text-[#1E3BFA]">
                                            {tr.selectedCandidates(selectedCandidateIds.length)}
                                        </span>
                                        <button
                                            type="button"
                                            className="shrink-0 text-[12px] text-[#0F23D9] hover:text-[#1E3BFA]"
                                            onClick={() => setSelectedCandidateIds([])}
                                        >
                                            {tr.clearSelection}
                                        </button>
                                        {permissions.executeProcess ? <>
                                        {permissions.manageCandidate ? <>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className={cn(candidateBatchActionButtonClassName, "text-[#0A9C71] hover:border-[#0CC991] hover:bg-[rgba(12,201,145,0.06)] hover:text-[#0A9C71]")}
                                            onClick={() => void runQuickDisposition("pass")}
                                            disabled={batchStatusSubmitting || !batchScreeningActionsAllowed}
                                            title={!batchScreeningActionsAllowed ? (isZh ? "仅可批量处理当前页且尚未进入部门评审、面试或 Offer 的候选人" : "Only current-page candidates before review, interview, or offer can be processed") : undefined}
                                        >
                                            <Check className="h-3.5 w-3.5"/>
                                            {tr.quickDispositionPass}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className={cn(candidateBatchActionButtonClassName, "text-[#F53F3F] hover:border-[#F53F3F] hover:bg-[rgba(245,63,63,0.06)] hover:text-[#F53F3F]")}
                                            onClick={() => void runQuickDisposition("reject")}
                                            disabled={batchStatusSubmitting || !batchScreeningActionsAllowed}
                                            title={!batchScreeningActionsAllowed ? (isZh ? "仅可批量处理当前页且尚未进入部门评审、面试或 Offer 的候选人" : "Only current-page candidates before review, interview, or offer can be processed") : undefined}
                                        >
                                            <Trash2 className="h-3.5 w-3.5"/>
                                            {tr.quickDispositionReject}
                                        </Button>
                                        </> : null}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className={candidateBatchActionButtonClassName}
                                            onClick={() => void triggerScreening(selectedCandidateIds)}
                                            disabled={!batchScreeningActionsAllowed || isBatchScreeningCancelling || (screeningSubmitting && !isBatchScreeningRunning) || (!isBatchScreeningRunning && !selectedCandidateIds.length)}
                                        >
                                            {isBatchScreeningCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : isBatchScreeningRunning ? <Square className="h-3.5 w-3.5"/> : screeningSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Sparkles className="h-3.5 w-3.5"/>}
                                            {isBatchScreeningCancelling ? tr.stopping : isBatchScreeningRunning ? tr.stopBatchScreening : screeningSubmitting ? tr.queueing : tr.queueBatch}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className={candidateBatchActionButtonClassName}
                                            onClick={() => void triggerFreshScreening(selectedCandidateIds)}
                                            disabled={screeningSubmitting || !batchScreeningActionsAllowed}
                                        >
                                            <RotateCcw className="h-3.5 w-3.5"/>
                                            {tr.requeueFreshScreening}
                                        </Button>
                                        </> : null}
                                        {permissions.manageCandidate && permissions.viewTalentPool ? <Button
                                            size="sm"
                                            variant="outline"
                                            className={candidateBatchActionButtonClassName}
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
                                        </Button> : null}
                                        {permissions.manageCandidate ? <Button
                                            size="sm"
                                            variant="outline"
                                            className={candidateBatchActionButtonClassName}
                                            onClick={() => setExportDialogOpen(true)}
                                            disabled={exporting}
                                        >
                                            <Download className="h-3.5 w-3.5"/>
                                            {exporting ? tr.exporting : tr.exportCandidates}
                                        </Button> : null}
                                        {permissions.sendMail ? <Button
                                            size="sm"
                                            variant="outline"
                                            className={candidateBatchActionButtonClassName}
                                            onClick={() => openResumeMailDialog(selectedCandidateIds)}
                                        >
                                            <Mail className="h-3.5 w-3.5"/>
                                            {tr.sendResumesBatch}
                                        </Button> : null}
                                        {permissions.manageCandidate ? <>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className={candidateBatchActionButtonClassName}
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
                                            className={candidateBatchActionButtonClassName}
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
                                            className={cn(candidateBatchActionButtonClassName, "text-[#F53F3F] hover:border-[#F53F3F] hover:bg-[rgba(245,63,63,0.06)] hover:text-[#F53F3F]")}
                                            onClick={() => requestBatchDelete(selectedCandidateIds)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5"/>
                                            {tr.batchDelete}
                                        </Button>
                                        </> : null}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden text-[12px] text-[#33353D]">
                                        <span className="shrink-0">
                                            {isZh ? "当前结果" : "Results"} <b className="font-semibold tabular-nums text-[#0E1114]">{candidateTotal}</b> {isZh ? "人" : ""}
                                        </span>
                                        <span className="truncate text-[#86888F]">
                                            {isZh
                                                ? `待初筛 ${candidatePipelineStages.find((stage) => stage.key === "resume_screening")?.count || 0} · 待面试 ${(candidatePipelineStages.find((stage) => stage.key === "first_interview")?.count || 0) + (candidatePipelineStages.find((stage) => stage.key === "second_interview")?.count || 0)} · 人才库 ${candidatePipelineStages.find((stage) => stage.key === "talent_pool")?.count || 0}`
                                                : `${visibleCandidateIds.length} visible`}
                                        </span>
                                        <div className="ml-auto flex shrink-0 items-center gap-3">
                                            {[
                                                permissions.executeProcess ? tr.queueBatch : null,
                                                permissions.executeProcess ? tr.requeueFreshScreening : null,
                                                permissions.sendMail ? tr.sendResumesBatch : null,
                                                permissions.manageCandidate ? tr.batchBindPosition : null,
                                                permissions.manageCandidate ? tr.batchUpdateStatus : null,
                                                permissions.manageCandidate ? tr.exportCandidates : null,
                                            ].filter((label): label is string => Boolean(label)).map((label) => (
                                                <span key={label} className="text-[#B0B2B8]">{label}</span>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="relative flex min-h-0 flex-1 flex-col px-0 pb-1 pt-0">
                        {candidateMatchSortLoading ? (
                            <div className="mb-2 flex items-center gap-2 rounded-[6px] border border-[rgba(255,171,36,0.30)] bg-[rgba(255,171,36,0.08)] px-2.5 py-2 text-sm text-[#D48806]">
                                <Loader2 className="h-4 w-4 animate-spin"/>
                                <span>{tr.sortingByMatchPercent}</span>
                            </div>
                        ) : null}
                        {candidatesLoading || !candidatesInitialLoaded ? (
                            <LoadingCard label={tr.loadingCandidateList}/>
                        ) : candidateViewMode === "list" ? (
                                <div className="min-h-0 flex flex-1 flex-col overflow-hidden bg-white">
                                    <div
                                        ref={mergedCandidateListScrollRef}
                                        className={cn("relative min-h-0 flex-1 overflow-auto", SMOOTH_VERTICAL_SCROLLBAR_CLASS)}
                                    >
                                        <div className="w-full" style={{minWidth: candidatePrototypeListGridLayout.minWidth}}>
                                            <div
                                                role="row"
                                                className="sticky top-0 z-10 grid h-10 items-center border-b border-[#F2F3F5] bg-white text-[12px] text-[#86888F]"
                                                style={{gridTemplateColumns: candidatePrototypeListGridLayout.columns}}
                                            >
                                                <div role="columnheader" className="flex items-center justify-center">
                                                    <input
                                                        ref={visibleSelectAllTableCheckboxRef}
                                                        type="checkbox"
                                                        checked={allVisibleCandidatesSelected}
                                                        aria-checked={someVisibleCandidatesSelected ? "mixed" : allVisibleCandidatesSelected}
                                                        onChange={toggleVisibleCandidateSelection}
                                                        className="h-3.5 w-3.5 rounded-[3px] border-[#D6D8DD] accent-[#1E3BFA] focus:ring-[#1E3BFA]"
                                                    />
                                                </div>
                                                <div role="columnheader" className="px-2.5">{isZh ? "候选人" : "Candidate"}</div>
                                                <div role="columnheader" className="px-2.5">{isZh ? "应聘岗位" : "Applied Position"}</div>
                                                <div role="columnheader" className="overflow-hidden px-0">{renderCandidateListHeaderCell("match", isZh ? "AI 匹配度" : "AI Match")}</div>
                                                <div role="columnheader" className="px-2.5">{isZh ? "状态" : "Status"}</div>
                                                <div role="columnheader" className="px-2.5">{isZh ? "学历" : "Education"}</div>
                                                <div role="columnheader" className="px-2.5">{isZh ? "工作年限" : "Experience"}</div>
                                                <div role="columnheader" className="px-2.5">{isZh ? "投递时间" : "Submitted"}</div>
                                                <div role="columnheader" className="px-2.5">{isZh ? "操作" : "Actions"}</div>
                                            </div>
                                            <div
                                                role="rowgroup"
                                                aria-rowcount={visibleCandidates.length}
                                                className="relative"
                                                style={{height: Math.max(rowVirtualizer.getTotalSize(), visibleCandidates.length === 0 ? 280 : 0)}}
                                            >
                                                {virtualItems.map((virtualRow) => {
                                                    const candidate = visibleCandidates[virtualRow.index];
                                                    return (
                                                        <CandidatePrototypeTableRow
                                                            key={candidate.id}
                                                            candidate={candidate}
                                                            isSelected={selectedCandidateId === candidate.id}
                                                            isChecked={selectedCandidateIdSet.has(candidate.id)}
                                                            rowStart={virtualRow.start}
                                                            rowHeight={CANDIDATE_LIST_ESTIMATED_ROW_HEIGHT}
                                                            setSelectedCandidateId={setSelectedCandidateId}
                                                            toggleCandidateSelection={toggleCandidateSelection}
                                                            onPrimaryAction={(item) => {
                                                                const status = resolveCandidateDisplayStatus(item);
                                                                if ((status === "screening_rejected" || status === "department_review_rejected" || INTERVIEW_REJECTED_STATUS_SET.has(status)) && permissions.manageCandidate && permissions.viewTalentPool) {
                                                                    void runCandidateDisposition([item.id], "talent_pool");
                                                                    return;
                                                                }
                                                                if (!permissions.executeProcess) {
                                                                    openCandidateFromPrimaryAction(item.id, "resume");
                                                                    return;
                                                                }
                                                                if (status === "screening_rejected" || status === "department_review_rejected" || INTERVIEW_REJECTED_STATUS_SET.has(status)) {
                                                                    openCandidateFromPrimaryAction(item.id, "resume");
                                                                    return;
                                                                }
                                                                if (status === "screening_running") {
                                                                    openCandidateFromPrimaryAction(item.id, "screening");
                                                                    return;
                                                                }
                                                                if (INTERVIEW_PIPELINE_STATUS_SET.has(status)) {
                                                                    openCandidateFromPrimaryAction(item.id, "interview");
                                                                    return;
                                                                }
                                                                if (["new_imported", "matching", "unmatched", "pending_screening", "screening_failed"].includes(status)) {
                                                                    void triggerFreshScreening([item.id]);
                                                                    return;
                                                                }
                                                                if (status === "department_review_pending" || status === "department_review_passed") {
                                                                    openCandidateFromPrimaryAction(item.id, "review");
                                                                } else if (["interview_passed", "pending_offer", "offer_sent", "hired"].includes(status)) {
                                                                    openCandidateFromPrimaryAction(item.id, "offer");
                                                                } else if (status === "screening_passed") {
                                                                    openCandidateFromPrimaryAction(item.id, "assessment");
                                                                } else {
                                                                    openCandidateFromPrimaryAction(item.id, "resume");
                                                                }
                                                            }}
                                                            canExecuteProcess={permissions.executeProcess}
                                                            canMoveToTalentPool={permissions.manageCandidate && permissions.viewTalentPool}
                                                            organizationLabel={showOrganizationColumn ? getOrganizationLabel(candidate.org_code) : null}
                                                            resumeMailSummary={getVisibleCandidateResumeMailSummary(candidate.id)}
                                                            language={language}
                                                            gridTemplateColumns={candidatePrototypeListGridLayout.columns}
                                                        />
                                                    );
                                                })}
                                                {visibleCandidates.length === 0 ? (
                                                    <div
                                                        className="absolute left-0 top-0 flex h-[280px] items-center justify-center px-6 py-10"
                                                        style={{width: candidateListViewportEl?.clientWidth || "100%"}}
                                                    >
                                                        <div className="max-w-[360px] text-center">
                                                            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-[8px] bg-[#F2F3F5] text-[#86888F]">
                                                                <Users className="h-5 w-5"/>
                                                            </span>
                                                            <p className="mt-3 text-[14px] font-medium text-[#0E1114]">{tr.noCandidatesMatched}</p>
                                                            <p className="mt-1 text-[12px] leading-5 text-[#86888F]">{tr.noCandidatesMatchedDesc}</p>
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="shrink-0 border-t border-[#F2F3F5] px-0 py-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] leading-5 text-[#86888F]">
                                            <span className="pl-4">
                                                {tr.candidatePageRange(candidatePageStart, candidatePageEnd, candidateTotal)}
                                            </span>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <NativeSelect
                                                    value={String(candidatePageSize)}
                                                    title={tr.rowsPerPage}
                                                    onChange={(event) => setCandidatePageSize(Number(event.target.value))}
                                                    className="h-7 w-[96px] shrink-0 rounded-[4px] border-[#E6E7EB] bg-white pr-7 text-[12px] shadow-none"
                                                >
                                                    {candidatePageSizeOptions.map((option) => (
                                                        <option key={option} value={option}>{option}{tr.rowsPerPage}</option>
                                                    ))}
                                                </NativeSelect>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className={cn(CANDIDATE_PAGINATION_BUTTON_CLASS, "px-2")}
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
                                                        className={pageIndex === candidatePageIndex ? CANDIDATE_PAGINATION_ACTIVE_CLASS : cn(CANDIDATE_PAGINATION_BUTTON_CLASS, "min-w-7 px-1.5")}
                                                        disabled={candidatesLoading}
                                                        onClick={() => setCandidatePageIndex(pageIndex)}
                                                    >
                                                        {pageIndex + 1}
                                                    </Button>
                                                ))}
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className={cn(CANDIDATE_PAGINATION_BUTTON_CLASS, "px-2")}
                                                    disabled={candidatePageIndex >= candidateTotalPages - 1 || candidatesLoading}
                                                    onClick={() => setCandidatePageIndex(candidatePageIndex + 1)}
                                                >
                                                    {tr.nextPage}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                        ) : (
                            <div className="min-h-0 flex flex-1 flex-col">
                                <div
                                    ref={setCandidateBoardViewportEl}
                                    className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden", SMOOTH_VERTICAL_SCROLLBAR_CLASS)}
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
                                <div className="mt-2 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#F2F3F5] pt-3 text-[12px] leading-5 text-[#86888F]">
                                    <span>{tr.candidatePageRange(candidatePageStart, candidatePageEnd, candidateTotal)}</span>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <NativeSelect
                                            value={String(candidatePageSize)}
                                            title={tr.rowsPerPage}
                                            onChange={(event) => setCandidatePageSize(Number(event.target.value))}
                                            className="h-7 w-[96px] shrink-0 rounded-[4px] border-[#E6E7EB] bg-white pr-7 text-[12px] shadow-none"
                                        >
                                            {candidatePageSizeOptions.map((option) => (
                                                <option key={option} value={option}>{option}{tr.rowsPerPage}</option>
                                            ))}
                                        </NativeSelect>
                                        <Button size="sm" variant="outline" className={cn(CANDIDATE_PAGINATION_BUTTON_CLASS, "px-2")} disabled={candidatePageIndex <= 0 || candidatesLoading} onClick={() => setCandidatePageIndex(candidatePageIndex - 1)}>
                                            {tr.previousPage}
                                        </Button>
                                        {candidatePaginationPages.map((pageIndex) => (
                                            <Button key={pageIndex} size="sm" variant={pageIndex === candidatePageIndex ? "default" : "outline"} className={pageIndex === candidatePageIndex ? CANDIDATE_PAGINATION_ACTIVE_CLASS : cn(CANDIDATE_PAGINATION_BUTTON_CLASS, "min-w-7 px-1.5")} disabled={candidatesLoading} onClick={() => setCandidatePageIndex(pageIndex)}>
                                                {pageIndex + 1}
                                            </Button>
                                        ))}
                                        <Button size="sm" variant="outline" className={cn(CANDIDATE_PAGINATION_BUTTON_CLASS, "px-2")} disabled={candidatePageIndex >= candidateTotalPages - 1 || candidatesLoading} onClick={() => setCandidatePageIndex(candidatePageIndex + 1)}>
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
                    modal={false}
                    open={pageActive && selectedCandidateId !== null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setSelectedCandidateId(null);
                        }
                    }}
                >
                    <DialogContent
                        aria-describedby={undefined}
                        onEscapeKeyDown={(event) => event.preventDefault()}
                        className="candidate-detail-drawer left-auto right-0 top-0 h-screen max-h-screen translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 border-l border-[#EBEEF5] bg-white p-0 text-[#0E1114] shadow-[-8px_0_24px_rgba(14,17,20,0.12)] sm:rounded-none"
                        style={{
                            width: "min(840px, 100vw)",
                            maxWidth: "min(840px, 100vw)",
                        }}
                        showCloseButton={false}
                    >
                        <DialogTitle className="sr-only">
                            {candidateDetail?.candidate.name
                                ? `${candidateDetail.candidate.name} · ${isZh ? "候选人详情" : "Candidate Details"}`
                                : (isZh ? "候选人详情" : "Candidate Details")}
                        </DialogTitle>
                    {candidateDetailLoading ? (
                        <div className="flex h-full items-center justify-center bg-white dark:bg-[#0E1114]">
                            <LoadingPanel label={tr.loadingCandidateDetail}/>
                        </div>
                    ) : candidateDetail ? (
                        <div className="flex h-full min-h-0 bg-white">
                            <section
                                ref={candidateDetailMainScrollRef}
                                onScroll={handleCandidateDetailMainScroll}
                                className={cn("relative min-h-0 min-w-0 flex-1 overflow-y-auto bg-white dark:bg-[#0E1114]", SMOOTH_VERTICAL_SCROLLBAR_CLASS)}
                            >
                                <div className="hidden" aria-hidden="true">
                                    <div className={cn(
                                        "border-b border-[#F2F3F5] bg-white/95 px-7 py-3 shadow-[0_4px_12px_rgba(14,17,20,0.06)] backdrop-blur transition duration-200",
                                        candidateDetailMainScrolled ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0",
                                    )}>
                                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                    <span className="truncate text-[18px] font-semibold leading-6 text-[#0E1114] dark:text-[#F7F8FA]">{candidateDetail.candidate.name}</span>
                                                    <span className="truncate text-[13px] text-[#86888F] dark:text-[#B0B2B8]">{candidateDetail.candidate.candidate_code || "-"}</span>
                                                    <span className="text-[13px] text-[#B0B2B8] dark:text-[#33353D]">|</span>
                                                    <span className="text-[13px] text-[#33353D] dark:text-[#D6D8DD]">{candidateDetail.candidate.age ? `${candidateDetail.candidate.age}${isZh ? "岁" : ""}` : "--"}</span>
                                                    <span className="text-[13px] text-[#B0B2B8] dark:text-[#33353D]">|</span>
                                                    <span className="truncate text-[13px] text-[#33353D] dark:text-[#D6D8DD]">
                                                        {candidateDetail.candidate.education || readStructuredText(parsedResumeEducation, ["degree", "education", "学历"]) || "-"}
                                                    </span>
                                                </div>
                                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[#86888F] dark:text-[#B0B2B8]">
                                                    <span className="truncate">
                                                        {candidateDetail.candidate.position_title || candidateDetail.candidate.screened_position_title || candidateDetail.candidate.ai_match_position_title || tr.unassignedPosition}
                                                    </span>
                                                    <span className="truncate">{candidateDetail.candidate.phone || candidateDetail.candidate.email || tr.noContact}</span>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                                                <Badge className={cn("h-6 rounded-[3px] border px-2 text-[12px]", prototypeStatusBadgeClass(candidateDetailDisplayStatus))}>
                                                    {labelForCandidateStatus(candidateDetailDisplayStatus)}
                                                </Badge>
                                                <Badge variant="outline" className="h-6 rounded-[3px] border-[rgba(12,201,145,0.28)] bg-[rgba(12,201,145,0.08)] px-2 text-[12px] text-[#0A9C71]">
                                                    {tr.matchBadge} {formatPercent(candidateScoreDisplayValues.matchPercent ?? resolveCandidateSummaryMatchPercent(candidateDetail.candidate))}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="sticky top-0 z-30 border-b border-[#F2F3F5] bg-white px-7 pb-0 pt-5 dark:border-[#202226] dark:bg-[#0E1114]">
                                    <div className="flex min-w-0 flex-nowrap items-start gap-2 pb-4">
                                        <div className="flex w-[292px] min-w-0 flex-none items-center gap-3.5 overflow-hidden">
                                            <CandidateDetailAvatar name={candidateDetail.candidate.name}/>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                    <h3 className="min-w-0 flex-1 truncate text-[18px] font-semibold leading-6 text-[#0E1114] dark:text-[#F7F8FA]" title={candidateDetail.candidate.name}>
                                                        {candidateDetail.candidate.name}
                                                    </h3>
                                                    <Badge className={cn("h-[22px] shrink-0 rounded-[4px] border-0 px-2 text-[12px]", prototypeStatusBadgeClass(candidateDetailDisplayStatus))}>
                                                        {labelForCandidateStatus(candidateDetailDisplayStatus)}
                                                    </Badge>
                                                    <Badge className="h-[22px] shrink-0 rounded-[4px] border-0 bg-[rgba(30,59,250,0.08)] px-2 text-[12px] text-[#1E3BFA] hover:bg-[rgba(30,59,250,0.08)]">
                                                        {tr.matchBadge} {formatPercent(candidateScoreDisplayValues.matchPercent ?? resolveCandidateSummaryMatchPercent(candidateDetail.candidate))}
                                                    </Badge>
                                                </div>
                                                <p className="mt-1 line-clamp-2 text-[12px] leading-[18px] text-[#86888F] dark:text-[#B0B2B8]">
                                                    {[
                                                        candidateDetail.candidate.position_title || candidateDetail.candidate.screened_position_title || candidateDetail.candidate.ai_match_position_title || tr.unassignedPosition,
                                                        candidateDetail.candidate.years_of_experience,
                                                        candidateDetail.candidate.education || readStructuredText(parsedResumeEducation, ["degree", "education", "学历"]),
                                                        candidateDetail.candidate.city || candidateDetail.candidate.expected_city,
                                                        candidateDetail.candidate.phone,
                                                        candidateDetail.candidate.email,
                                                    ].filter(Boolean).join(" · ") || "-"}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="ml-auto flex shrink-0 flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                                            {permissions.executeProcess ? (
                                                <Button
                                                    size="sm"
                                                    className="h-8 shrink-0 whitespace-nowrap rounded-[6px] border border-[#1E3BFA] bg-[#1E3BFA] px-3 text-[12px] text-white shadow-none hover:border-[#0F23D9] hover:bg-[#0F23D9]"
                                                    disabled={screeningSubmitting || candidateDetailScreeningLive}
                                                    onClick={() => void handleCandidateDetailScreeningAction()}
                                                >
                                                    {screeningSubmitting || candidateDetailScreeningLive ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : null}
                                                    {candidateDetailHasScreeningAttempt ? (isZh ? "重新初筛" : "Re-screen") : (isZh ? "开始初筛" : "Screen")}
                                                </Button>
                                            ) : null}
                                            {permissions.viewInterview ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 shrink-0 whitespace-nowrap rounded-[6px] border-[#1E3BFA] bg-white px-3 text-[12px] text-[#1E3BFA] shadow-none hover:bg-[rgba(30,59,250,0.05)] hover:text-[#1E3BFA]"
                                                    onClick={() => openCandidateDetailPanel("interview")}
                                                >
                                                    {tr.interviewQuestions}
                                                </Button>
                                            ) : null}
                                            {permissions.sendMail ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 shrink-0 whitespace-nowrap rounded-[6px] border-[#E6E7EB] bg-white px-3 text-[12px] text-[#33353D] shadow-none hover:border-[#1E3BFA] hover:bg-[#F7F8FA] hover:text-[#1E3BFA]"
                                                    onClick={() => openResumeMailDialog([candidateDetail.candidate.id])}
                                                >
                                                    {isZh ? "发送简历" : "Send Resume"}
                                                </Button>
                                            ) : null}
                                            {permissions.manageReview ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 shrink-0 whitespace-nowrap rounded-[6px] border-[#E6E7EB] bg-white px-3 text-[12px] text-[#33353D] shadow-none hover:border-[#1E3BFA] hover:bg-[#F7F8FA] hover:text-[#1E3BFA]"
                                                    disabled={!createDepartmentReview}
                                                    onClick={openDepartmentReviewDialog}
                                                >
                                                    {isZh ? "提交评审" : "Submit Review"}
                                                </Button>
                                            ) : null}
                                            <Popover open={candidateHeaderMoreOpen} onOpenChange={setCandidateHeaderMoreOpen}>
                                                <PopoverTrigger asChild>
                                                    <button
                                                        type="button"
                                                        aria-label={isZh ? "更多候选人操作" : "More candidate actions"}
                                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] text-[#86888F] transition hover:bg-[#F2F3F5] hover:text-[#0E1114]"
                                                    >
                                                        <MoreHorizontal className="h-4 w-4"/>
                                                    </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="z-[10020] w-44 rounded-[6px] border-[#E6E7EB] bg-white p-1 shadow-[0_8px_24px_rgba(14,17,20,0.12)]" align="end">
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-2 rounded-[4px] px-3 py-2 text-left text-[12px] text-[#33353D] hover:bg-[#F2F3F5] disabled:cursor-not-allowed disabled:text-[#B0B2B8]"
                                                        disabled={!onRefreshCandidateDetail || candidateDetailRefreshing}
                                                        onClick={() => {
                                                            setCandidateHeaderMoreOpen(false);
                                                            void refreshCurrentCandidateDetail();
                                                        }}
                                                    >
                                                        <RotateCcw className={cn("h-3.5 w-3.5", candidateDetailRefreshing && "animate-spin")}/>
                                                        {tr.refresh}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-2 rounded-[4px] px-3 py-2 text-left text-[12px] text-[#33353D] hover:bg-[#F2F3F5] disabled:cursor-not-allowed disabled:text-[#B0B2B8]"
                                                        disabled={!currentResumeFile}
                                                        onClick={() => {
                                                            setCandidateHeaderMoreOpen(false);
                                                            void printCandidateResume(currentResumeFile);
                                                        }}
                                                    >
                                                        <Printer className="h-3.5 w-3.5"/>
                                                        {isZh ? "打印简历" : "Print Resume"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-2 rounded-[4px] px-3 py-2 text-left text-[12px] text-[#33353D] hover:bg-[#F2F3F5] disabled:cursor-not-allowed disabled:text-[#B0B2B8]"
                                                        disabled={!currentResumeFile}
                                                        onClick={() => {
                                                            setCandidateHeaderMoreOpen(false);
                                                            if (currentResumeFile) void openResumeFile(currentResumeFile, false);
                                                        }}
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5"/>
                                                        {isZh ? "新窗口打开简历" : "Open Resume"}
                                                    </button>
                                                </PopoverContent>
                                            </Popover>
                                            <button
                                                type="button"
                                                aria-label={isZh ? "关闭候选人详情" : "Close candidate details"}
                                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] text-[#86888F] transition hover:bg-[#F2F3F5] hover:text-[#0E1114]"
                                                onClick={() => setSelectedCandidateId(null)}
                                            >
                                                <X className="h-4 w-4"/>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex min-w-0 items-center gap-7 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                        {candidateDetailPrimaryTabs.map((tab) => (
                                            <button
                                                key={tab.key}
                                                type="button"
                                                className={cn(
                                                    "relative shrink-0 px-0.5 py-2.5 text-[14px] transition hover:text-[#0F23D9]",
                                                    candidateDetailPrimaryTab === tab.key ? "font-semibold text-[#0E1114]" : "font-normal text-[#33353D]",
                                                )}
                                                onClick={() => selectCandidateDetailPrimaryTab(tab.key)}
                                            >
                                                {tab.label}
                                                {candidateDetailPrimaryTab === tab.key ? <span className="absolute bottom-0 left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-[2px] bg-[#1E3BFA]"/> : null}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="hidden" aria-hidden="true">
                                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#86888F] dark:text-[#B0B2B8]">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="max-w-[360px] truncate rounded-[3px] border border-[#E6E7EB] bg-[#F7F8FA] px-3 py-1.5 text-[#33353D]">
                                                {candidateDetail.candidate.position_title || candidateDetail.candidate.screened_position_title || tr.unassignedPosition}
                                            </span>
                                            <span className="truncate rounded-[3px] bg-[#F2F3F5] px-3 py-1.5 text-[#86888F]">
                                                {labelForCandidateSource(candidateDetail.candidate.source)}
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
                                                <h3 data-no-zoom className="truncate text-[22px] font-semibold leading-8 text-[#0E1114] dark:text-[#F7F8FA]">
                                                    {candidateDetail.candidate.name}
                                                </h3>
                                                <span className="text-[14px] text-[#86888F] dark:text-[#B0B2B8]">{candidateDetail.candidate.candidate_code}</span>
                                                <span className="text-[14px] text-[#86888F] dark:text-[#33353D]">|</span>
                                                <span className="text-[14px] text-[#33353D] dark:text-[#D6D8DD]">{candidateDetail.candidate.age ? `${candidateDetail.candidate.age}${isZh ? "岁" : ""}` : "--"}</span>
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                                                <CandidateMetaItem icon={GraduationCap}>{candidateDetail.candidate.education || readStructuredText(parsedResumeEducation, ["degree", "education", "学历"]) || "-"}</CandidateMetaItem>
                                                <CandidateMetaItem icon={Briefcase}>{candidateDetail.candidate.years_of_experience || candidateDetailIdentityMeta || "-"}</CandidateMetaItem>
                                                <CandidateMetaItem icon={Phone}>{candidateDetail.candidate.phone || "-"}</CandidateMetaItem>
                                                <CandidateMetaItem icon={AtSign}>{candidateDetail.candidate.email || tr.noContact}</CandidateMetaItem>
                                            </div>
                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                <Badge className={cn("h-6 rounded-[3px] border px-2 text-[12px]", prototypeStatusBadgeClass(candidateDetailDisplayStatus))}>
                                                    {labelForCandidateStatus(candidateDetailDisplayStatus)}
                                                </Badge>
                                                <Badge variant="outline" className="h-6 rounded-[3px] border-[rgba(12,201,145,0.28)] bg-[rgba(12,201,145,0.08)] px-2 text-[12px] text-[#0A9C71]">
                                                    {tr.matchBadge} {formatPercent(candidateScoreDisplayValues.matchPercent ?? resolveCandidateSummaryMatchPercent(candidateDetail.candidate))}
                                                </Badge>
                                                <Badge variant="outline" className={CANDIDATE_DETAIL_TAG_CLASS}>
                                                    {candidateDetail.candidate.position_title || candidateDetail.candidate.ai_match_position_title || tr.unassignedPosition}
                                                </Badge>
                                                {selectedCandidateResumeMailSummary ? (
                                                    <Badge variant="outline" className="h-6 rounded-[3px] border-[rgba(30,59,250,0.18)] bg-[rgba(30,59,250,0.06)] px-2 text-[12px] text-[#0F23D9]">
                                                        {selectedCandidateResumeMailSummary}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                            {candidateDetailPositionInsightVisible ? (
                                                <div className="mt-3 grid gap-2 text-[12px] text-[#33353D] dark:text-[#D6D8DD] lg:grid-cols-2">
                                                    <div className="min-w-0 rounded-[4px] border border-[rgba(30,59,250,0.16)] bg-[rgba(30,59,250,0.06)] px-3 py-2">
                                                        <div className="mb-1 flex items-center gap-1.5 font-medium text-[#0F23D9] dark:text-[#7D8BFF]">
                                                            <Sparkles className="h-3.5 w-3.5"/>
                                                            {isZh ? "AI 推荐" : "AI Recommendation"}
                                                        </div>
                                                        <p className="truncate text-[#33353D] dark:text-[#F7F8FA]">
                                                            {candidateDetailAiMatchPositionTitle || candidateDetailScreenedPositionTitle || tr.unassignedPosition}
                                                        </p>
                                                        {candidateDetailAiMatchReason ? (
                                                            <p className="mt-1 line-clamp-2 text-[#86888F] dark:text-[#B0B2B8]">
                                                                {sanitizeCandidateFacingErrorText(candidateDetailAiMatchReason, {
                                                                    context: resolveCandidateFacingErrorContext("ai_position_match"),
                                                                    language,
                                                                })}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    <div className="min-w-0 rounded-[4px] border border-[rgba(30,59,250,0.16)] bg-[rgba(30,59,250,0.06)] px-3 py-2">
                                                        <div className="mb-1 flex items-center gap-1.5 font-medium text-[#0F23D9] dark:text-[#7D8BFF]">
                                                            <ArrowRightLeft className="h-3.5 w-3.5"/>
                                                            {isZh ? "转岗建议" : "Transfer Suggestion"}
                                                        </div>
                                                        <p className="truncate text-[#33353D] dark:text-[#F7F8FA]">
                                                            {candidateDetailAiPotentialPosition || (isZh ? "暂无转岗建议" : "No suggestion")}
                                                        </p>
                                                        {candidateDetailAiPotentialReason ? (
                                                            <p className="mt-1 line-clamp-2 text-[#86888F] dark:text-[#B0B2B8]">
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
                                                <p className="mt-2 text-[12px] text-[#B0B2B8] dark:text-[#86888F]">
                                                    {tr.originalStatus} {labelForCandidateStatus(candidateDetail.candidate.status)}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div data-no-zoom className="flex min-w-0 items-center gap-6 overflow-x-auto border-t border-[#F2F3F5] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                        {candidateDetailBusinessTabs.map((tab) => (
                                            <button
                                                key={tab.key}
                                                type="button"
                                                disabled={tab.disabled}
                                                className={cn(
                                                    "relative h-12 shrink-0 text-[14px] text-[#33353D] transition hover:text-[#0F23D9]",
                                                    candidateDetailPanel === tab.key && "font-semibold text-[#0E1114]",
                                                    tab.disabled && "text-[#B0B2B8]",
                                                )}
                                                onClick={() => {
                                                    if (!tab.disabled) setCandidateDetailPanel(tab.key);
                                                }}
                                            >
                                                {tab.label}
                                                <span className="ml-1 text-[12px] text-[#B0B2B8]">{tab.count || 0}</span>
                                                {candidateDetailPanel === tab.key ? <span className="absolute bottom-0 left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-[#1E3BFA]"/> : null}
                                            </button>
                                        ))}
                                    </div>

                                    {candidateDetailPanel === "resume" ? (
                                        <>
                                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F2F3F5] py-3 dark:border-[#202226]">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant={candidateResumeView === "original" ? "default" : "outline"}
                                                        className={candidateResumeView === "original" ? CANDIDATE_DETAIL_PRIMARY_BUTTON_CLASS : CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS}
                                                        onClick={() => switchCandidateResumeView("original")}
                                                    >
                                                        {isZh ? "原始简历" : "Original"}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant={candidateResumeView === "standard" ? "default" : "outline"}
                                                        className={candidateResumeView === "standard" ? CANDIDATE_DETAIL_PRIMARY_BUTTON_CLASS : CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS}
                                                        onClick={() => switchCandidateResumeView("standard")}
                                                    >
                                                        {isZh ? "标准简历" : "Standard"}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant={candidateResumeView === "history" ? "default" : "outline"}
                                                        className={candidateResumeView === "history" ? CANDIDATE_DETAIL_PRIMARY_BUTTON_CLASS : CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS}
                                                        onClick={() => switchCandidateResumeView("history")}
                                                    >
                                                        {isZh ? "历史简历" : "History"}
                                                    </Button>
                                                </div>
                                                <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-[13px] text-[#86888F] dark:text-[#B0B2B8]">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className={CANDIDATE_DETAIL_GHOST_BUTTON_CLASS}
                                                        onClick={() => void refreshCurrentCandidateDetail()}
                                                        disabled={!onRefreshCandidateDetail || candidateDetailRefreshing}
                                                    >
                                                        <RotateCcw className={cn("h-3.5 w-3.5", candidateDetailRefreshing && "animate-spin")}/>
                                                        {tr.refresh}
                                                    </Button>
                                                    {primaryResumeFile ? (
                                                        <>
                                                            <Button size="sm" variant="ghost" className={CANDIDATE_DETAIL_GHOST_BUTTON_CLASS} onClick={() => void openResumeFile(primaryResumeFile, true)}>
                                                                <Download className="h-3.5 w-3.5"/>
                                                                {tr.downloadResume}
                                                            </Button>
                                                        </>
                                                    ) : null}
                                                    <Button size="sm" variant="ghost" className={CANDIDATE_DETAIL_GHOST_BUTTON_CLASS} onClick={() => void printCandidateResume()}>
                                                        <Printer className="h-3.5 w-3.5"/>
                                                        {isZh ? "打印" : "Print"}
                                                    </Button>
                                                    <Popover open={candidateResumeMoreOpen} onOpenChange={setCandidateResumeMoreOpen}>
                                                        <PopoverTrigger asChild>
                                                            <Button size="sm" variant="ghost" className={CANDIDATE_DETAIL_GHOST_BUTTON_CLASS}>
                                                                <MoreHorizontal className="h-3.5 w-3.5"/>
                                                                {isZh ? "更多" : "More"}
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-44 border-[#E6E7EB] bg-white p-1 dark:border-[#202226] dark:bg-[#0E1114]" align="end">
                                                            <button
                                                                type="button"
                                                                className="flex w-full items-center rounded-[4px] px-3 py-2 text-left text-[13px] text-[#33353D] hover:bg-[#F2F3F5] dark:text-[#D6D8DD] dark:hover:bg-[#16181B]"
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
                                                                className="flex w-full items-center rounded-[4px] px-3 py-2 text-left text-[13px] text-[#33353D] hover:bg-[#F2F3F5] dark:text-[#D6D8DD] dark:hover:bg-[#16181B]"
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
                                                                className="flex w-full items-center rounded-[4px] px-3 py-2 text-left text-[13px] text-[#33353D] hover:bg-[#F2F3F5] disabled:cursor-not-allowed disabled:text-[#B0B2B8] dark:text-[#D6D8DD] dark:hover:bg-[#16181B] dark:disabled:text-[#33353D]"
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
                                                        className="h-8 rounded-[3px] border-[#E6E7EB] text-[13px] dark:border-[#33353D] dark:bg-[#16181B] dark:text-[#F7F8FA]"
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
                                        </>
                                    ) : null}
                                </div>

                                <div className="bg-white dark:bg-[#0E1114]">
                                    <div className="min-w-0 space-y-6 px-7 py-6 text-[12px]">
                                    {visibleCandidateDetailBusinessTabs.length ? (
                                        <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-[8px] border border-[#E6E7EB] bg-[#F7F8FA] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                            {visibleCandidateDetailBusinessTabs.map((tab) => (
                                                <button
                                                    key={tab.key}
                                                    type="button"
                                                    disabled={tab.disabled}
                                                    className={cn(
                                                        "flex h-7 shrink-0 items-center gap-1 rounded-[6px] px-3 text-[12px] transition",
                                                        candidateDetailPanel === tab.key
                                                            ? "bg-white font-medium text-[#1E3BFA] shadow-[0_1px_4px_rgba(14,17,20,0.08)]"
                                                            : "text-[#86888F] hover:bg-white hover:text-[#33353D]",
                                                        tab.disabled && "cursor-not-allowed opacity-50",
                                                    )}
                                                    onClick={() => {
                                                        if (!tab.disabled) openCandidateDetailPanel(tab.key);
                                                    }}
                                                >
                                                    {tab.label}
                                                    {tab.count ? <span className="text-[11px] text-[#B0B2B8]">{tab.count}</span> : null}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}

                                    {candidateDetailPrimaryTab === "profile" ? (
                                        <div className="space-y-6">
                                            {isDepartmentReviewDecisionMode ? (
                                                <div className="rounded-[8px] border border-[rgba(30,59,250,0.20)] bg-[rgba(30,59,250,0.05)] p-4">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="min-w-0">
                                                            <p className="text-[13px] font-semibold text-[#0E1114]">{isZh ? "待处理部门评审" : "Department review pending"}</p>
                                                            <p className="mt-1 text-[12px] leading-5 text-[#86888F]">
                                                                {departmentReviewDecisionContext?.reviewerName
                                                                    ? (isZh ? `当前评审人：${departmentReviewDecisionContext.reviewerName}` : `Reviewer: ${departmentReviewDecisionContext.reviewerName}`)
                                                                    : (isZh ? "请核对可见资料后提交评审结论" : "Review the visible material and submit a decision")}
                                                            </p>
                                                        </div>
                                                        <div className="flex shrink-0 gap-2">
                                                            <Button size="sm" variant="outline" className="h-8 rounded-[6px] border-[rgba(245,63,63,0.35)] bg-white px-3 text-[12px] text-[#F53F3F] shadow-none hover:bg-[rgba(245,63,63,0.06)]" disabled={Boolean(departmentReviewDecisionSubmitting)} onClick={() => void submitCandidateDetailDepartmentReviewDecision("rejected")}>
                                                                {departmentReviewDecisionSubmitting === "rejected" ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : null}
                                                                {isZh ? "淘汰" : "Reject"}
                                                            </Button>
                                                            <Button size="sm" className="h-8 rounded-[6px] bg-[#0CC991] px-3 text-[12px] text-white shadow-none hover:bg-[#0A9C71]" disabled={Boolean(departmentReviewDecisionSubmitting)} onClick={() => void submitCandidateDetailDepartmentReviewDecision("passed")}>
                                                                {departmentReviewDecisionSubmitting === "passed" ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : null}
                                                                {isZh ? "通过" : "Pass"}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <Textarea
                                                        value={departmentReviewDecisionComment}
                                                        onChange={(event) => setDepartmentReviewDecisionComment(event.target.value)}
                                                        rows={3}
                                                        maxLength={1000}
                                                        className="mt-3 resize-none rounded-[4px] border-[#E6E7EB] bg-white text-[12px] shadow-none"
                                                        placeholder={isZh ? "填写评审意见（选填）" : "Review comment (optional)"}
                                                    />
                                                </div>
                                            ) : null}

                                            <section className="space-y-3">
                                                <h4 className="text-[14px] font-semibold text-[#0E1114]">{isZh ? "基础信息" : "Basic Information"}</h4>
                                                <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                                                    {[
                                                        [isZh ? "姓名" : "Name", candidateDetail.candidate.name],
                                                        [isZh ? "手机号" : "Phone", candidateDetail.candidate.phone || "-"],
                                                        [isZh ? "邮箱" : "Email", candidateDetail.candidate.email || "-"],
                                                        [isZh ? "当前公司" : "Company", candidateDetail.candidate.current_company || readStructuredText(parsedResumeWork, ["company", "company_name", "公司"]) || "-"],
                                                        [isZh ? "工作年限" : "Experience", candidateDetail.candidate.years_of_experience || "-"],
                                                        [isZh ? "学历" : "Education", candidateDetail.candidate.education || readStructuredText(parsedResumeEducation, ["degree", "education", "学历"]) || "-"],
                                                        [isZh ? "年龄" : "Age", candidateDetail.candidate.age || "-"],
                                                        [isZh ? "所在城市" : "City", candidateDetail.candidate.city || "-"],
                                                        [isZh ? "期望城市" : "Expected City", candidateDetail.candidate.expected_city || "-"],
                                                        [isZh ? "候选人编号" : "Candidate ID", candidateDetail.candidate.candidate_code || "-"],
                                                        [isZh ? "简历来源" : "Source", [labelForCandidateSource(candidateDetail.candidate.source), candidateDetail.candidate.source_detail].filter(Boolean).join(" · ") || "-"],
                                                        [isZh ? "最近更新" : "Updated", formatLongDateTime(candidateDetail.candidate.updated_at || candidateDetail.candidate.created_at)],
                                                        [isZh ? "负责人" : "Owner", candidateDetail.candidate.owner_id || "-"],
                                                        [isZh ? "发送记录" : "Mail History", selectedCandidateResumeMailSummary || (isZh ? "未发送" : "Not sent")],
                                                        [isZh ? "当前岗位" : "Position", candidateDetail.candidate.position_title || candidateDetail.candidate.screened_position_title || candidateDetail.candidate.ai_match_position_title || tr.unassignedPosition],
                                                    ].map(([label, value]) => (
                                                        <div key={String(label)} className="min-w-0 space-y-1">
                                                            <p className="text-[12px] text-[#B0B2B8]">{label}</p>
                                                            <p className="break-words text-[12px] leading-5 text-[#0F1014]">{value}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                                {candidateDetailHasRuntimeOverride ? (
                                                    <p className="mt-3 text-[11px] text-[#B0B2B8]">
                                                        {tr.originalStatus} {labelForCandidateStatus(candidateDetail.candidate.status)}
                                                    </p>
                                                ) : null}
                                            </section>

                                            {candidateDetailPositionInsightVisible ? (
                                                <section className="space-y-3">
                                                    <h4 className="text-[14px] font-semibold text-[#0E1114]">{isZh ? "AI 岗位识别" : "AI Position Insight"}</h4>
                                                    <div className="grid gap-3 sm:grid-cols-2">
                                                        <div className="rounded-[8px] bg-[#F7F8FA] p-4">
                                                            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1E3BFA]"><Sparkles className="h-3.5 w-3.5"/>{isZh ? "推荐岗位" : "Recommended"}</div>
                                                            <p className="mt-2 text-[12px] font-medium text-[#0F1014]">{candidateDetailAiMatchPositionTitle || candidateDetailScreenedPositionTitle || tr.unassignedPosition}</p>
                                                            {candidateDetailAiMatchReason ? <p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-[#86888F]">{sanitizeCandidateFacingErrorText(candidateDetailAiMatchReason, {context: resolveCandidateFacingErrorContext("ai_position_match"), language})}</p> : null}
                                                        </div>
                                                        <div className="rounded-[8px] bg-[#F7F8FA] p-4">
                                                            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1E3BFA]"><ArrowRightLeft className="h-3.5 w-3.5"/>{isZh ? "转岗建议" : "Transfer Suggestion"}</div>
                                                            <p className="mt-2 text-[12px] font-medium text-[#0F1014]">{candidateDetailAiPotentialPosition || "-"}</p>
                                                            {candidateDetailAiPotentialReason ? <p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-[#86888F]">{sanitizeCandidateFacingErrorText(candidateDetailAiPotentialReason, {context: resolveCandidateFacingErrorContext("ai_position_match"), language})}</p> : null}
                                                        </div>
                                                    </div>
                                                </section>
                                            ) : null}

                                            <section className="space-y-3">
                                                <h4 className="text-[14px] font-semibold text-[#0E1114]">{isZh ? "标签与备注" : "Tags & Notes"}</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {(candidateDetail.candidate.tags.length ? candidateDetail.candidate.tags : parsedResumeSkills).map((tag) => (
                                                        <span key={tag} className="inline-flex h-[22px] items-center rounded-[4px] bg-[rgba(30,59,250,0.08)] px-2 text-[12px] text-[#1E3BFA]">{tag}</span>
                                                    ))}
                                                    {!candidateDetail.candidate.tags.length && !parsedResumeSkills.length ? <span className="text-[12px] text-[#B0B2B8]">-</span> : null}
                                                </div>
                                                <div className="rounded-[6px] bg-[#F7F8FA] px-3.5 py-3 text-[12px] leading-5 text-[#33353D]">
                                                    {candidateDetail.candidate.notes || candidateDetail.candidate.note_summary || (isZh ? "暂无备注" : "No notes")}
                                                </div>
                                            </section>

                                            <section className="space-y-3">
                                                <h4 className="text-[14px] font-semibold text-[#0E1114]">{isZh ? "状态流转" : "Status Timeline"}</h4>
                                                {candidateDetail.status_history.length ? (
                                                    <div>
                                                        {candidateDetail.status_history.map((history, index) => (
                                                            <div key={history.id} className="flex gap-3.5">
                                                                <div className="flex w-2 shrink-0 flex-col items-center pt-1.5">
                                                                    <span className={cn("h-2 w-2 rounded-full", index === 0 ? "bg-[#0CC991]" : index === 1 ? "bg-[#2E9CFF]" : "bg-[#B0B2B8]")}/>
                                                                    {index < candidateDetail.status_history.length - 1 ? <span className="w-px flex-1 bg-[#F2F3F5]"/> : null}
                                                                </div>
                                                                <div className={cn("min-w-0 flex-1", index < candidateDetail.status_history.length - 1 && "pb-4")}>
                                                                    <p className="text-[12px] text-[#0F1014]">{labelForCandidateStatus(history.from_status || "")} → {labelForCandidateStatus(history.to_status)}</p>
                                                                    <p className="mt-0.5 break-words text-[11px] leading-4 text-[#B0B2B8]">{[history.reason || tr.noReasonProvided, formatDateTime(history.created_at), history.changed_by || history.source].filter(Boolean).join(" · ")}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : <EmptyState title={tr.noStatusHistory} description={tr.noStatusHistoryDesc}/>}
                                            </section>

                                            <section className="space-y-3 border-t border-[#F2F3F5] pt-5">
                                                <div className="flex items-center justify-between gap-3">
                                                    <h4 className="text-[14px] font-semibold text-[#0E1114]">{isZh ? "流程与候选人操作" : "Workflow Actions"}</h4>
                                                    <span className="text-[11px] text-[#B0B2B8]">{labelForCandidateStatus(candidateDetailDisplayStatus)}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {permissions.manageCandidate ? (
                                                        <>
                                                            <Button size="sm" variant="outline" className="h-8 rounded-[6px] border-[rgba(12,201,145,0.32)] bg-white px-3 text-[12px] text-[#0A9C71] shadow-none hover:bg-[rgba(12,201,145,0.06)]" disabled={candidateDetail.candidate.status === "screening_passed"} onClick={() => setPendingStatus("screening_passed")}>{isZh ? "通过" : "Pass"}</Button>
                                                            <Button size="sm" variant="outline" className="h-8 rounded-[6px] border-[rgba(255,171,36,0.35)] bg-white px-3 text-[12px] text-[#D48806] shadow-none hover:bg-[rgba(255,171,36,0.06)]" disabled={candidateDetail.candidate.status === "pending_screening"} onClick={() => setPendingStatus("pending_screening")}>{isZh ? "待定" : "Hold"}</Button>
                                                            <Button size="sm" variant="outline" className="h-8 rounded-[6px] border-[rgba(245,63,63,0.30)] bg-white px-3 text-[12px] text-[#F53F3F] shadow-none hover:bg-[rgba(245,63,63,0.06)]" disabled={candidateDetail.candidate.status === "screening_rejected"} onClick={() => setPendingStatus("screening_rejected")}>{isZh ? "淘汰" : "Reject"}</Button>
                                                            <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} onClick={openCandidatePositionDialog}>{isZh ? "转移岗位" : "Transfer"}</Button>
                                                            {permissions.viewTalentPool ? <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} disabled={candidateDetail.candidate.status === "talent_pool"} onClick={() => setPendingStatus("talent_pool")}>{isZh ? "储备至人才库" : "Talent Pool"}</Button> : null}
                                                            <Button size="sm" variant="outline" className="h-8 rounded-[6px] border-[rgba(245,63,63,0.30)] bg-white px-3 text-[12px] text-[#F53F3F] shadow-none hover:bg-[rgba(245,63,63,0.06)]" onClick={() => requestDeleteCandidate(candidateDetail.candidate)}>{isZh ? "删除候选人" : "Delete"}</Button>
                                                        </>
                                                    ) : <span className="text-[12px] text-[#B0B2B8]">{isZh ? "当前账号仅可查看候选人资料" : "Read-only access"}</span>}
                                                </div>
                                            </section>

                                            <section className="space-y-3 border-t border-[#F2F3F5] pt-5">
                                                <div className="flex items-center justify-between gap-3">
                                                    <h4 className="text-[14px] font-semibold text-[#0E1114]">{isZh ? "备注与跟进" : "Notes & Follow-ups"}</h4>
                                                    {followUps.length ? <button type="button" className="text-[12px] text-[#1E3BFA]" onClick={() => openCandidateDetailPanel("background")}>{isZh ? `查看全部 ${followUps.length} 条` : `View all ${followUps.length}`}</button> : null}
                                                </div>
                                                {permissions.manageCandidate ? (
                                                    <Textarea
                                                        value={candidateNoteDraft}
                                                        onChange={(event) => setCandidateNoteDraft(event.target.value)}
                                                        rows={3}
                                                        maxLength={1000}
                                                        className="resize-none rounded-[4px] border-[#E6E7EB] text-[12px] shadow-none"
                                                        placeholder={isZh ? "添加候选人备注，保存后进入跟进记录" : "Add a candidate note"}
                                                    />
                                                ) : null}
                                                <div className="flex items-center justify-between text-[11px] text-[#B0B2B8]">
                                                    <span>{followUps[0] ? `${followUps[0].created_by || "-"} · ${formatDateTime(followUps[0].created_at)}` : (isZh ? "暂无跟进记录" : "No follow-ups")}</span>
                                                    {permissions.manageCandidate ? <Button size="sm" className="h-7 rounded-[4px] bg-[#1E3BFA] px-3 text-[12px] text-white shadow-none hover:bg-[#0F23D9]" disabled={candidateDetailNoteSubmitting || !candidateNoteDraft.trim()} onClick={() => void saveCandidateDetailNote()}>
                                                        {candidateDetailNoteSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : null}
                                                        {isZh ? "保存备注" : "Save Note"}
                                                    </Button> : null}
                                                </div>
                                            </section>
                                        </div>
                                    ) : null}

                                    {candidateDetailPrimaryTab === "resume" ? (
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="inline-flex items-center rounded-[8px] border border-[#E6E7EB] p-0.5">
                                                {([
                                                    ["standard", isZh ? "标准简历" : "Standard"],
                                                    ["original", isZh ? "原始简历" : "Original"],
                                                    ["history", isZh ? "历史版本" : "History"],
                                                ] as Array<[CandidateResumeViewKey, string]>).map(([view, label]) => (
                                                    <button
                                                        key={view}
                                                        type="button"
                                                        className={cn("flex h-7 items-center rounded-[6px] px-3.5 text-[12px] transition", candidateResumeView === view ? "bg-[#1E3BFA] font-medium text-white" : "text-[#33353D] hover:bg-[#F7F8FA]")}
                                                        onClick={() => switchCandidateResumeView(view)}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} disabled={!resumeActionFile} onClick={() => resumeActionFile && void openResumeFile(resumeActionFile, true)}><Download className="h-3.5 w-3.5"/>{tr.downloadResume}</Button>
                                                <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} disabled={!resumeActionFile} onClick={() => resumeActionFile && void openResumeFile(resumeActionFile, false)}><ExternalLink className="h-3.5 w-3.5"/>{isZh ? "新窗口" : "New Window"}</Button>
                                            </div>
                                        </div>
                                    ) : null}

                                    {candidateDetailPrimaryTab === "resume" && candidateDetailPanel === "resume" ? (
                                        <>
	                                            {duplicateCandidates.length > 0 && (
	                                                <details className="rounded-[8px] border border-[rgba(255,171,36,0.32)] bg-[rgba(255,171,36,0.08)] px-4 py-3">
                                                    <summary className="cursor-pointer text-sm font-medium text-[#D48806]">
                                                        {tr.duplicateWarning}（{duplicateCandidates.length}）
                                                    </summary>
                                                    <p className="mt-1 text-xs text-[#D48806]">{tr.duplicateWarningDesc(duplicateCandidates.length)}</p>
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {duplicateCandidates.map((dup) => (
                                                            <Button
                                                                key={dup.id}
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-6 rounded-[3px] border-[rgba(255,171,36,0.32)] bg-white px-2 text-[12px] text-[#D48806] shadow-none hover:bg-[rgba(255,171,36,0.10)]"
                                                                onClick={() => setSelectedCandidateId(dup.id)}
                                                            >
                                                                {dup.name} ({dup.candidate_code})
                                                            </Button>
                                                        ))}
                                                    </div>
		                                                </details>
		                                            )}

                                            {candidateResumeView === "original" ? (
                                            <div className="overflow-hidden rounded-[8px] border border-[#EBEEF5] bg-[#FAFAFB] dark:border-[#202226] dark:bg-[#0E1114]">
                                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E7EB] bg-white px-4 py-3 dark:border-[#202226] dark:bg-[#0E1114]">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-[14px] font-medium text-[#0E1114] dark:text-[#F7F8FA]">
                                                            {primaryResumeFile ? primaryResumeFile.original_name : tr.noResumeFile}
                                                        </p>
                                                        <p className="mt-0.5 text-[12px] text-[#86888F] dark:text-[#B0B2B8]">
                                                            {primaryResumeFile
                                                                ? tr.resumeFileDesc(primaryResumeFile.file_ext || "-", primaryResumeFile.file_size || 0, primaryResumeFile.parse_status)
                                                                : tr.resumeFileEmptyDesc}
                                                        </p>
                                                    </div>
                                                    {primaryResumeFile ? (
                                                        <div className="flex items-center gap-2">
                                                            <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} onClick={() => void openResumeFile(primaryResumeFile, false)}>
                                                                <ExternalLink className="h-3.5 w-3.5"/>
                                                                {isZh ? "新窗口打开" : "Open"}
                                                            </Button>
                                                            <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} onClick={() => void openResumeFile(primaryResumeFile, true)}>
                                                                <Download className="h-3.5 w-3.5"/>
                                                                {tr.downloadResume}
                                                            </Button>
                                                        </div>
                                                    ) : null}
                                                </div>
                                                <div className="relative h-[520px] min-h-[520px] overflow-hidden bg-white">
                                                    {inlineResumePreviewLoading || ((inlineResumePreviewBlob || inlineResumePreviewUrl) && !inlineResumeFrameReady) ? (
                                                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white text-[#86888F]">
                                                            <Loader2 className="h-8 w-8 animate-spin text-[#0E1114]"/>
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
                                            <div className="bg-white dark:bg-[#0E1114]">
                                                <div className="hidden">
                                                    <CandidateDetailAvatar name={candidateDetail.candidate.name}/>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-4">
                                                            <h4 className="text-[20px] font-semibold text-[#0E1114] dark:text-[#F7F8FA]">{candidateDetail.candidate.name}</h4>
                                                            <span className="text-[14px] text-[#86888F] dark:text-[#B0B2B8]">{candidateDetail.candidate.age ? `${candidateDetail.candidate.age}${isZh ? "岁" : ""}` : "--"}</span>
                                                            <span className="text-[14px] text-[#86888F] dark:text-[#B0B2B8]">{candidateDetail.candidate.education || readStructuredText(parsedResumeEducation, ["degree", "education", "学历"]) || "-"}</span>
                                                        </div>
                                                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                                                            <CandidateMetaItem icon={GraduationCap}>{candidateDetail.candidate.education || readStructuredText(parsedResumeEducation, ["school", "school_name", "university", "学校"]) || "-"}</CandidateMetaItem>
                                                            <CandidateMetaItem icon={Briefcase}>{candidateDetail.candidate.current_company || readStructuredText(parsedResumeWork, ["company", "company_name", "公司"]) || "-"}</CandidateMetaItem>
                                                            <CandidateMetaItem icon={MapPin}>{candidateDetail.candidate.city || candidateDetail.candidate.expected_city || readStructuredText(parsedResumeBasicInfo, ["city", "current_city", "location", "城市"]) || "-"}</CandidateMetaItem>
                                                            <CandidateMetaItem icon={FileText}>{primaryResumeFile?.parse_status || "-"}</CandidateMetaItem>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-5">
                                                    <ResumeSection title={isZh ? "个人信息" : "Personal Info"}>
                                                        <div className="grid gap-y-2.5 text-[12px] text-[#33353D] dark:text-[#D6D8DD] sm:grid-cols-2">
                                                            <div><span className="inline-block w-14 text-[#B0B2B8] dark:text-[#86888F]">{isZh ? "姓名" : "Name"}</span>{candidateDetail.candidate.name}</div>
                                                            <div><span className="inline-block w-14 text-[#B0B2B8] dark:text-[#86888F]">{isZh ? "年龄" : "Age"}</span>{candidateDetail.candidate.age || "-"}</div>
                                                            <div><span className="inline-block w-14 text-[#B0B2B8] dark:text-[#86888F]">{isZh ? "手机" : "Phone"}</span>{candidateDetail.candidate.phone || "-"}</div>
                                                            <div><span className="inline-block w-14 text-[#B0B2B8] dark:text-[#86888F]">{isZh ? "邮箱" : "Email"}</span>{candidateDetail.candidate.email || "-"}</div>
                                                        </div>
                                                    </ResumeSection>

                                                    <ResumeSection title={isZh ? "求职意向" : "Job Intention"}>
                                                        <div className="grid gap-y-2.5 text-[12px] text-[#33353D] dark:text-[#D6D8DD] sm:grid-cols-2">
                                                            <div><span className="inline-block w-14 text-[#B0B2B8] dark:text-[#86888F]">{isZh ? "应聘职位" : "Position"}</span>{candidateDetail.candidate.position_title || candidateDetail.candidate.ai_match_position_title || tr.unassignedPosition}</div>
                                                            <div><span className="inline-block w-14 text-[#B0B2B8] dark:text-[#86888F]">{isZh ? "期望城市" : "Expected City"}</span>{candidateDetail.candidate.expected_city || candidateDetail.candidate.city || "-"}</div>
                                                        </div>
                                                    </ResumeSection>

                                                    <ResumeSection title={isZh ? "教育经历" : "Education"}>
                                                        {parsedResumeEducationRecords.length ? (
                                                            <div className="space-y-3">
                                                                {parsedResumeEducationRecords.map((education, index) => {
                                                                    const start = readStructuredText(education, ["start_date", "start", "开始时间"]);
                                                                    const end = readStructuredText(education, ["end_date", "end", "结束时间"]);
                                                                    const timeRange = readStructuredText(education, ["time_range", "时间"]) || [start, end].filter(Boolean).join(" – ");
                                                                    return (
                                                                        <div key={`education-${index}`} className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[12px] text-[#33353D] dark:text-[#D6D8DD]", index > 0 && "border-t border-dashed border-[#F2F3F5] pt-3")}>
                                                                            <span className="font-medium text-[#0E1114] dark:text-[#F7F8FA]">{readStructuredText(education, ["school", "school_name", "university", "学校"]) || "-"}</span>
                                                                            <span>{readStructuredText(education, ["major", "专业"]) || "-"}</span>
                                                                            <span>{readStructuredText(education, ["degree", "education", "学历"]) || candidateDetail.candidate.education || "-"}</span>
                                                                            {timeRange ? <span className="text-[#B0B2B8] dark:text-[#86888F]">{timeRange}</span> : null}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : <p className="text-[12px] text-[#B0B2B8]">-</p>}
                                                    </ResumeSection>

                                                    <ResumeSection title={isZh ? "工作经历" : "Work Experience"}>
                                                        {parsedResumeWorkRecords.length ? (
                                                            <div className="space-y-3">
                                                                {parsedResumeWorkRecords.map((work, index) => {
                                                                    const start = readStructuredText(work, ["start_date", "start", "开始时间"]);
                                                                    const end = readStructuredText(work, ["end_date", "end", "结束时间"]);
                                                                    const timeRange = readStructuredText(work, ["time_range", "时间"]) || [start, end].filter(Boolean).join(" – ");
                                                                    const description = readStructuredText(work, ["description", "职责", "work_content", "summary"]);
                                                                    return (
                                                                        <div key={`work-${index}`} className={cn("space-y-1.5 text-[12px] leading-[1.8] text-[#33353D] dark:text-[#D6D8DD]", index > 0 && "border-t border-dashed border-[#F2F3F5] pt-3")}>
                                                                            <p className="font-medium text-[#0E1114] dark:text-[#F7F8FA]">{readStructuredText(work, ["company", "company_name", "公司"]) || "-"}</p>
                                                                            <p>{[readStructuredText(work, ["position", "job_title", "title", "职位"]), timeRange].filter(Boolean).join(" · ") || "-"}</p>
                                                                            {description ? <p className="whitespace-pre-wrap text-[#606266] dark:text-[#D6D8DD]">{description}</p> : null}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-1.5 text-[12px] leading-[1.8] text-[#33353D]">
                                                                <p className="font-medium text-[#0E1114]">{candidateDetail.candidate.current_company || "-"}</p>
                                                                <p>{candidateDetail.candidate.years_of_experience || "-"}</p>
                                                            </div>
                                                        )}
                                                    </ResumeSection>

                                                    {parsedResumeSkills.length ? (
                                                        <ResumeSection title={isZh ? "技能标签" : "Skills"}>
                                                            <div className="flex flex-wrap gap-2">
                                                                {parsedResumeSkills.map((skill) => (
                                                                    <span key={skill} className="inline-flex h-6 items-center rounded-[4px] bg-[#F2F3F5] px-2.5 text-[12px] text-[#33353D] dark:bg-[#16181B] dark:text-[#D6D8DD]">{skill}</span>
                                                                ))}
                                                            </div>
                                                        </ResumeSection>
                                                    ) : null}
                                                </div>
                                            </div>

                                            {permissions.manageCandidate ? <details className="rounded-[8px] border border-[#E6E7EB] bg-white p-4">
                                                <summary className="cursor-pointer text-[13px] font-medium text-[#33353D]">{isZh ? "编辑档案字段" : "Edit Profile Fields"}</summary>
                                                <div className="mt-4 space-y-4">
	                                            <Field label={tr.baseInfo}>
                                                <div className="grid gap-3 md:grid-cols-2">
	                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={candidateEditor.name} onChange={(event) => setCandidateEditor((current) => ({...current, name: event.target.value}))} placeholder={tr.namePlaceholder}/>
	                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={candidateEditor.phone} onChange={(event) => setCandidateEditor((current) => ({...current, phone: event.target.value}))} placeholder={tr.phonePlaceholder}/>
	                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={candidateEditor.email} onChange={(event) => setCandidateEditor((current) => ({...current, email: event.target.value}))} placeholder={tr.emailPlaceholder}/>
	                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={candidateEditor.currentCompany} onChange={(event) => setCandidateEditor((current) => ({...current, currentCompany: event.target.value}))} placeholder={tr.companyPlaceholder}/>
	                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={candidateEditor.yearsOfExperience} onChange={(event) => setCandidateEditor((current) => ({...current, yearsOfExperience: event.target.value}))} placeholder={tr.experiencePlaceholder}/>
	                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={candidateEditor.education} onChange={(event) => setCandidateEditor((current) => ({...current, education: event.target.value}))} placeholder={tr.educationPlaceholder}/>
	                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={candidateEditor.age} onChange={(event) => setCandidateEditor((current) => ({...current, age: event.target.value}))} placeholder={tr.agePlaceholder}/>
	                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={candidateEditor.city} onChange={(event) => setCandidateEditor((current) => ({...current, city: event.target.value}))} placeholder={tr.cityPlaceholder}/>
	                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={candidateEditor.expectedCity} onChange={(event) => setCandidateEditor((current) => ({...current, expectedCity: event.target.value}))} placeholder={tr.expectedCityPlaceholder}/>
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
	                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={candidateEditor.ownerId} onChange={(event) => setCandidateEditor((current) => ({...current, ownerId: event.target.value}))} placeholder={tr.ownerPlaceholder}/>
                                                </Field>
                                            </div>

	                                            <Field label={tr.tagsAndNotes}>
                                                <div className="space-y-3">
	                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={candidateEditor.tagsText} onChange={(event) => setCandidateEditor((current) => ({...current, tagsText: event.target.value}))} placeholder={tr.tagsPlaceholder}/>
                                                    <Textarea
                                                        className={CANDIDATE_DETAIL_TEXTAREA_CLASS}
                                                        value={candidateEditor.notes}
                                                        onChange={(event) => setCandidateEditor((current) => ({...current, notes: event.target.value}))}
                                                        rows={4}
                                                        placeholder={tr.notesPlaceholder}
                                                    />
                                                    <Button className={CANDIDATE_DETAIL_PRIMARY_BUTTON_CLASS} onClick={() => void saveCandidate()}>
                                                        <Save className="h-4 w-4"/>
                                                        {tr.saveCandidateInfo}
                                                    </Button>
                                                </div>
	                                            </Field>
                                                </div>
                                            </details> : null}

                                            <div className="rounded-[8px] border border-[#E6E7EB] bg-white px-4 py-4 dark:border-[#202226] dark:bg-[#0E1114]">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-medium text-[#0E1114] dark:text-[#F7F8FA]">
                                                            {currentResumeFile ? currentResumeFile.original_name : tr.noResumeFile}
                                                        </p>
                                                        <p className="mt-1 text-xs text-[#86888F] dark:text-[#B0B2B8]">
                                                            {currentResumeFile
                                                                ? tr.resumeFileDesc(currentResumeFile.file_ext || "-", currentResumeFile.file_size || 0, currentResumeFile.parse_status)
                                                                : tr.resumeFileEmptyDesc}
                                                        </p>
                                                    </div>
                                                    {currentResumeFile ? (
                                                        <div className="flex flex-wrap gap-2">
                                                            <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} onClick={() => void openResumeFile(currentResumeFile, true)}>{tr.downloadResume}</Button>
                                                            {permissions.manageCandidate ? <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-8 rounded-[6px] border-[rgba(245,63,63,0.30)] bg-white px-3 text-[12px] text-[#F53F3F] shadow-none hover:border-[#F53F3F] hover:bg-[rgba(245,63,63,0.06)] hover:text-[#F53F3F] dark:bg-[#0E1114]"
                                                                onClick={() => requestDeleteResumeFile(currentResumeFile)}
                                                            >
                                                                <Trash2 className="h-4 w-4"/>
                                                                {tr.deleteResume}
                                                            </Button> : null}
                                                        </div>
                                                    ) : null}
                                                </div>
                                                {currentResumeFile?.parse_error ? (
                                                    <div className="mt-3 rounded-[6px] border border-[rgba(245,63,63,0.28)] bg-[rgba(245,63,63,0.07)] px-4 py-3 text-base text-[#F53F3F]">
                                                        {tr.parseErrorLine(currentResumeFile.parse_error)}
                                                    </div>
                                                ) : null}
                                            </div>
                                            </>
                                            ) : null}

                                            {candidateResumeView === "history" ? (
                                                <div className="bg-white dark:bg-[#0E1114]">
                                                    {resumeFiles.length ? (
                                                        <div className="space-y-3">
                                                            {resumeFiles.map((file) => {
                                                                const active = currentResumeFile?.id === file.id;
                                                                return (
                                                                    <div
                                                                        key={file.id}
                                                                        className={cn(
                                                                            "flex flex-wrap items-center justify-between gap-3 rounded-[4px] border px-4 py-3",
                                                                            active ? "border-[#1E3BFA] bg-[rgba(30,59,250,0.03)] dark:border-[#86888F] dark:bg-[#16181B]" : "border-[#EBEEF5] bg-white dark:border-[#202226] dark:bg-[#0E1114]",
                                                                        )}
                                                                    >
                                                                        <div className="min-w-0">
                                                                            <div className="flex min-w-0 items-center gap-2">
                                                                                <p className="truncate text-[13px] font-medium text-[#0E1114] dark:text-[#F7F8FA]">{file.original_name}</p>
                                                                                {active ? <span className="inline-flex h-5 shrink-0 items-center rounded-[4px] bg-[rgba(30,59,250,0.08)] px-2 text-[11px] text-[#1E3BFA]">{isZh ? "当前使用" : "Current"}</span> : null}
                                                                            </div>
                                                                            <p className="mt-1 text-[12px] text-[#86888F] dark:text-[#B0B2B8]">
                                                                                {tr.resumeFileDesc(file.file_ext || "-", file.file_size || 0, file.parse_status)}
                                                                            </p>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <Button
                                                                                size="sm"
                                                                                variant={active ? "default" : "outline"}
                                                                                className={active ? CANDIDATE_DETAIL_PRIMARY_BUTTON_CLASS : CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS}
                                                                                onClick={() => {
                                                                                    setSelectedResumeFileId(file.id);
                                                                                    setCandidateResumeView("original");
                                                                                }}
                                                                            >
                                                                                {isZh ? "查看原始简历" : "View Original"}
                                                                            </Button>
                                                                            <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} onClick={() => void openResumeFile(file, true)}>
                                                                                <Download className="h-3.5 w-3.5"/>
                                                                                {tr.downloadResume}
                                                                            </Button>
                                                                            {permissions.manageCandidate ? (
                                                                                <Button
                                                                                    size="sm"
                                                                                    variant="outline"
                                                                                    className="h-8 rounded-[6px] border-[rgba(245,63,63,0.30)] bg-white px-3 text-[12px] text-[#F53F3F] shadow-none hover:border-[#F53F3F] hover:bg-[rgba(245,63,63,0.06)] hover:text-[#F53F3F] dark:bg-[#0E1114]"
                                                                                    onClick={() => requestDeleteResumeFile(file)}
                                                                                >
                                                                                    <Trash2 className="h-3.5 w-3.5"/>
                                                                                    {tr.deleteResume}
                                                                                </Button>
                                                                            ) : null}
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

                                    {candidateDetailPrimaryTab === "ai" && candidateDetailPanel === "screening" ? (
                                        <>

                                            <Field label={tr.statusFlow}>
                                                <div className="space-y-3">
                                                    {permissions.manageCandidate ? <>
                                                    <div className="flex flex-wrap gap-2">
                                                        {manualCandidateStatusOptions.map(([value, label]) => {
                                                            const isCurrent = candidateDetail.candidate.status === value;
                                                            const isSubmitting = statusFlowSubmitting === value;
                                                            return (
                                                                <Button
                                                                    key={value}
                                                                    size="sm"
                                                                    variant={isCurrent ? "default" : "outline"}
                                                                    className={isCurrent ? CANDIDATE_DETAIL_PRIMARY_BUTTON_CLASS : CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS}
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
                                                        className={CANDIDATE_DETAIL_TEXTAREA_CLASS}
                                                        value={statusUpdateReason}
                                                        onChange={(event) => setStatusUpdateReason(event.target.value)}
                                                        rows={3}
                                                        placeholder={tr.statusReasonPlaceholder}
                                                    />
                                                    </> : null}
                                                    <div className="space-y-3">
                                                        {candidateDetail.status_history.length ? candidateDetail.status_history.map((history) => (
                                                            <div key={history.id} className="rounded-[8px] border border-[#E6E7EB]/80 px-4 py-4 dark:border-[#202226]">
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <p className="text-sm font-medium text-[#0E1114] dark:text-[#F7F8FA]">
                                                                        {labelForCandidateStatus(history.from_status || "")} → {labelForCandidateStatus(history.to_status)}
                                                                    </p>
                                                                    <p className="text-xs text-[#86888F] dark:text-[#B0B2B8]">{formatDateTime(history.created_at)}</p>
                                                                </div>
                                                                <p className="mt-2 text-sm text-[#33353D] dark:text-[#D6D8DD]">{history.reason || tr.noReasonProvided}</p>
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
                                                <p className="mt-3 break-words text-xs leading-6 text-[#86888F] dark:text-[#B0B2B8]">
                                                    {tr.screeningMemoryHint(effectiveScreeningSkillSourceLabel)}
                                                </p>
                                                <p className="mt-2 break-words text-xs leading-6 text-[#86888F] dark:text-[#B0B2B8]">
                                                    {tr.screeningSkillPreview(formatSkillNames(effectiveScreeningSkillIds, skillMap, language))}
                                                </p>
                                            </Field>

                                            {permissions.viewAssistant ? <Field label={tr.aiAssistant}>
                                                <div className="rounded-md border border-[#E6E7EB] bg-[#F7F8FA] px-4 py-4 dark:border-[#202226] dark:bg-[#16181B]/60">
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-medium text-[#0E1114] dark:text-[#F7F8FA]">{tr.assistantPackedTitle}</p>
                                                            <p className="mt-1 break-words text-xs leading-6 text-[#86888F] dark:text-[#B0B2B8]">
                                                                {candidateAssistantActivity.length
                                                                    ? tr.assistantPackedDescWithCount(candidateAssistantActivity.length)
                                                                    : tr.assistantPackedDescEmpty}
                                                            </p>
                                                        </div>
                                                        <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} onClick={() => openAssistantMode("drawer")}>
                                                            <Bot className="h-4 w-4"/>
                                                            {tr.openAiAssistant}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </Field> : null}

                                            {permissions.viewLog ? <Field label={tr.aiExecutionLogs}>
                                                <div className="space-y-3">
                                                    {candidateProcessActivity.length ? (
                                                        <>
                                                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#E6E7EB] bg-[#F7F8FA] px-4 py-4 dark:border-[#202226] dark:bg-[#16181B]/60">
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-medium text-[#0E1114] dark:text-[#F7F8FA]">
                                                                        {tr.recordedLogs(candidateProcessActivity.length)}
                                                                    </p>
                                                                    <p className="mt-1 break-words text-xs text-[#86888F] dark:text-[#B0B2B8]">
                                                                        {tr.logsCollapsedHint}
                                                                    </p>
                                                                </div>
                                                                <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} onClick={() => setCandidateProcessLogsExpanded((current) => !current)}>
                                                                    {candidateProcessLogsExpanded ? tr.collapseLogs : tr.expandLogs}
                                                                </Button>
                                                            </div>
                                                            {candidateProcessLogsExpanded ? candidateProcessActivity.map((log) => {
                                                                const logSkillSnapshots = resolveLogSkillSnapshots(log, skillMap);
                                                                return (
                                                                    <div key={log.id} className="rounded-md border border-[#E6E7EB] px-4 py-4 dark:border-[#202226]">
                                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                                            <div className="min-w-0 flex-1">
                                                                                <p className="text-sm font-medium text-[#0E1114] dark:text-[#F7F8FA]">{labelForTaskType(log.task_type)}</p>
                                                                                <p className="mt-1 break-words text-xs text-[#86888F] dark:text-[#B0B2B8]">{labelForProvider(log.model_provider)} · {log.model_name || "-"} · {formatLongDateTime(log.created_at)}</p>
                                                                            </div>
                                                                            <Badge className={cn("rounded-[3px] border", prototypeStatusBadgeClass(log.status))}>
                                                                                {labelForTaskExecutionStatus(log.status)}
                                                                            </Badge>
                                                                        </div>
                                                                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                                                                            <InfoTile label={tr.screeningSkills} value={formatSkillSnapshotNames(logSkillSnapshots, language)}/>
                                                                            <InfoTile label={tr.memorySource} value={labelForMemorySource(log.memory_source)}/>
                                                                        </div>
                                                                        {log.error_message ? (
                                                                            <p className="mt-3 break-all text-sm text-[#F53F3F]">
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
                                                                            <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} onClick={() => openTaskLogDetail(log.id)}>{tr.viewFullLog}</Button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }) : null}
                                                        </>
                                                    ) : (
                                                        <EmptyState title={tr.noAiLogs} description={tr.noAiLogsDesc}/>
                                                    )}
                                                </div>
                                            </Field> : null}
                                        </>
                                    ) : null}

                                    {candidateDetailPrimaryTab === "ai" && candidateDetailPanel === "review" ? (
                                        <div className="space-y-3">
                                            <div className="rounded-md border border-[#E6E7EB] bg-white px-4 py-4 dark:border-[#202226] dark:bg-[#0E1114]">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-semibold text-[#0E1114] dark:text-[#F7F8FA]">{isZh ? "部门评审" : "Department Review"}</p>
                                                        <p className="mt-1 text-xs text-[#86888F] dark:text-[#B0B2B8]">
                                                            {isZh ? "把候选人提交给用人部门，评审结果会回写到当前流程。" : "Send the candidate to hiring reviewers and keep the result in this workflow."}
                                                        </p>
                                                    </div>
                                                    <Button size="sm" className={CANDIDATE_DETAIL_PRIMARY_BUTTON_CLASS} onClick={openDepartmentReviewDialog} disabled={!permissions.manageReview || !createDepartmentReview}>
                                                        <Users className="h-4 w-4"/>
                                                        {isZh ? "提交部门评审" : "Submit Review"}
                                                    </Button>
                                                </div>
                                            </div>
                                            {departmentReviews.length ? departmentReviews.map((review) => (
                                                <div key={review.id} className="rounded-md border border-[#E6E7EB] bg-white px-4 py-4 dark:border-[#202226] dark:bg-[#0E1114]">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline" className={cn(CANDIDATE_DETAIL_STATUS_TAG_CLASS, prototypeStatusBadgeClass(review.status))}>
                                                                {review.status === "passed"
                                                                    ? (isZh ? "评审通过" : "Passed")
                                                                    : review.status === "rejected"
                                                                        ? (isZh ? "评审淘汰" : "Rejected")
                                                                        : (isZh ? "评审中" : "Pending")}
                                                            </Badge>
                                                            <span className="text-sm text-[#86888F] dark:text-[#B0B2B8]">{formatDateTime(review.created_at)}</span>
                                                        </div>
                                                        <span className="text-sm text-[#86888F] dark:text-[#B0B2B8]">{isZh ? "发起人" : "Created by"}：{review.created_by || "-"}</span>
                                                    </div>
                                                    {review.message ? <p className="mt-3 rounded-md bg-[#F7F8FA] px-3 py-2 text-sm text-[#33353D] dark:bg-[#16181B] dark:text-[#D6D8DD]">{review.message}</p> : null}
                                                    <div className="mt-3 divide-y divide-[#F2F3F5]">
                                                        {review.assignments.map((assignment) => (
                                                            <div key={assignment.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                                                                <div>
                                                                    <p className="text-sm font-medium text-[#0E1114] dark:text-[#F7F8FA]">{assignment.reviewer_name || assignment.reviewer_user_code}</p>
                                                                    <p className="mt-1 text-xs text-[#86888F] dark:text-[#B0B2B8]">{assignment.reviewer_user_code}</p>
                                                                    {assignment.comment ? <p className="mt-2 text-sm text-[#33353D] dark:text-[#D6D8DD]">{assignment.comment}</p> : null}
                                                                </div>
                                                                <div className="text-right">
                                                                    <Badge className={cn(
                                                                        CANDIDATE_DETAIL_STATUS_TAG_CLASS,
                                                                        prototypeStatusBadgeClass(assignment.status || "pending"),
                                                                    )}>
                                                                        {assignment.status === "passed"
                                                                            ? (isZh ? "通过" : "Passed")
                                                                            : assignment.status === "rejected"
                                                                                ? (isZh ? "淘汰" : "Rejected")
                                                                                : assignment.status === "deferred"
                                                                                    ? (isZh ? "暂缓" : "Deferred")
                                                                                    : (isZh ? "待评审" : "Pending")}
                                                                    </Badge>
                                                                    <p className="mt-1 text-xs text-[#86888F] dark:text-[#B0B2B8]">{formatDateTime(assignment.decision_at)}</p>
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

                                    {candidateDetailPrimaryTab === "prep" && candidateDetailPanel === "offer" ? (
                                        <>
                                            <div className="rounded-[8px] border border-[#E6E7EB]/80 bg-white/85 px-4 py-4 dark:border-[#202226] dark:bg-[#0E1114]/70">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="text-sm font-medium text-[#0E1114] dark:text-[#F7F8FA]">{tr.offers}</p>
                                                    {permissions.manageCandidate ? <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} onClick={() => { setOfferForm({offer_title: "", salary: "", department: "", entry_date: "", offer_content: "", notes: ""}); setOfferFormOpen(!offerFormOpen); }}>
                                                        <Plus className="h-4 w-4"/>
                                                        {tr.addOffer}
                                                    </Button> : null}
                                                </div>
                                                {permissions.manageCandidate && offerFormOpen && candidateDetail && (
                                                    <div className="mt-3 space-y-2 rounded-[8px] border border-[#E6E7EB]/70 bg-[#F7F8FA]/50 p-3 dark:border-[#202226] dark:bg-[#16181B]/50">
                                                        <div className="grid gap-2 md:grid-cols-2">
                                                            <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={offerForm.offer_title} onChange={(e) => setOfferForm((f) => ({...f, offer_title: e.target.value}))} placeholder={tr.offerTitle}/>
                                                            <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={offerForm.salary} onChange={(e) => setOfferForm((f) => ({...f, salary: e.target.value}))} placeholder={tr.offerSalary}/>
                                                            <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={offerForm.department} onChange={(e) => setOfferForm((f) => ({...f, department: e.target.value}))} placeholder={tr.offerDepartment}/>
                                                            <Input className={CANDIDATE_DETAIL_INPUT_CLASS} type="date" value={offerForm.entry_date} onChange={(e) => setOfferForm((f) => ({...f, entry_date: e.target.value}))} placeholder={tr.offerEntryDate}/>
                                                        </div>
                                                        <Textarea className={CANDIDATE_DETAIL_TEXTAREA_CLASS} value={offerForm.offer_content} onChange={(e) => setOfferForm((f) => ({...f, offer_content: e.target.value}))} rows={3} placeholder={tr.offerContent}/>
                                                        <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={offerForm.notes} onChange={(e) => setOfferForm((f) => ({...f, notes: e.target.value}))} placeholder={tr.offerNotes}/>
                                                        <div className="flex justify-end gap-2">
                                                            <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} onClick={() => setOfferFormOpen(false)}>{tr.batchBindPositionCancel}</Button>
                                                            <Button size="sm" className={CANDIDATE_DETAIL_PRIMARY_BUTTON_CLASS} disabled={offerSubmitting} onClick={async () => {
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
                                                            <div key={offer.id} className="rounded-[8px] border border-[#E6E7EB]/70 px-3 py-2 dark:border-[#202226]">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <p className="text-sm font-medium text-[#0E1114] dark:text-[#F7F8FA]">{offer.offer_title || "-"}</p>
                                                                            <Badge
                                                                                variant="outline"
                                                                                className={cn(
                                                                                    CANDIDATE_DETAIL_STATUS_TAG_CLASS,
                                                                                    offer.status === "accepted" && "border-[rgba(12,201,145,0.28)] bg-[rgba(12,201,145,0.08)] text-[#0A9C71]",
                                                                                    (offer.status === "rejected" || offer.status === "cancelled") && "border-[rgba(245,63,63,0.26)] bg-[rgba(245,63,63,0.08)] text-[#F53F3F]",
                                                                                    offer.status === "sent" && "border-[rgba(46,156,255,0.26)] bg-[rgba(46,156,255,0.08)] text-[#2E9CFF]",
                                                                                )}
                                                                            >
                                                                                {statusLabels[offer.status] || offer.status}
                                                                            </Badge>
                                                                        </div>
                                                                        {offer.salary && <p className="mt-0.5 text-xs text-[#86888F] dark:text-[#B0B2B8]">{offer.salary}</p>}
                                                                        {offer.department && <p className="mt-0.5 text-xs text-[#86888F] dark:text-[#B0B2B8]">{offer.department}</p>}
                                                                        {offer.entry_date && <p className="mt-0.5 text-xs text-[#86888F] dark:text-[#B0B2B8]">{offer.entry_date}</p>}
                                                                        {offer.offer_content && <p className="mt-1 text-xs text-[#33353D] dark:text-[#D6D8DD] whitespace-pre-wrap">{offer.offer_content}</p>}
                                                                    </div>
                                                                    {permissions.manageCandidate ? <div className="flex items-center gap-1">
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
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="h-7 w-7 rounded-[4px] p-0 text-[#F53F3F] hover:bg-[rgba(245,63,63,0.08)] hover:text-[#F53F3F]"
                                                                            aria-label={tr.confirmDeleteOffer}
                                                                            onClick={() => setNestedDeleteTarget({kind: "offer", id: offer.id, title: offer.offer_title || (isZh ? "当前 Offer" : "Current offer")})}
                                                                        >
                                                                            <Trash2 className="h-3.5 w-3.5"/>
                                                                        </Button>
                                                                    </div> : null}
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

                                    {candidateDetailPrimaryTab === "prep" && candidateDetailPanel === "background" ? (
                                        <>
                                            <div className="rounded-md border border-[#E6E7EB] bg-white px-4 py-4 dark:border-[#202226] dark:bg-[#0E1114]">
                                                <p className="text-base font-medium text-[#0E1114] dark:text-[#F7F8FA]">{isZh ? "背调信息" : "Background Check"}</p>
                                                <p className="mt-1 text-sm leading-6 text-[#86888F] dark:text-[#B0B2B8]">
                                                    {isZh ? "当前系统还没有独立背调数据模型，先把跟进记录放在这里承接；后续新增背调供应商、授权、报告状态时可以直接扩展本页。" : "No dedicated background-check data model is available yet. Follow-up notes are shown here for now and can be extended with providers, authorizations, and report status later."}
                                                </p>
                                            </div>
                                            <div className="rounded-[8px] border border-[#E6E7EB]/80 bg-white/85 px-4 py-4 dark:border-[#202226] dark:bg-[#0E1114]/70">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="text-sm font-medium text-[#0E1114] dark:text-[#F7F8FA]">{tr.followUps}</p>
                                                    {permissions.manageCandidate ? <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} onClick={() => { setFollowUpContent(""); setFollowUpType("note"); setFollowUpFormOpen(!followUpFormOpen); }}>
                                                        <Plus className="h-4 w-4"/>
                                                        {tr.addFollowUp}
                                                    </Button> : null}
                                                </div>
                                                {permissions.manageCandidate && followUpFormOpen && candidateDetail && (
                                                    <div className="mt-3 space-y-2 rounded-[8px] border border-[#E6E7EB]/70 bg-[#F7F8FA]/50 p-3 dark:border-[#202226] dark:bg-[#16181B]/50">
                                                        <Textarea className={CANDIDATE_DETAIL_TEXTAREA_CLASS} value={followUpContent} onChange={(e) => setFollowUpContent(e.target.value)} rows={3} placeholder={tr.followUpContentPlaceholder}/>
                                                        <div className="flex items-center gap-2">
                                                            <NativeSelect value={followUpType} onChange={(e) => setFollowUpType(e.target.value)} className="h-8 text-xs">
                                                                <option value="note">{tr.followUpTypeNote}</option>
                                                                <option value="call">{tr.followUpTypeCall}</option>
                                                                <option value="email">{tr.followUpTypeEmail}</option>
                                                                <option value="interview">{tr.followUpTypeInterview}</option>
                                                                <option value="other">{tr.followUpTypeOther}</option>
                                                            </NativeSelect>
                                                            <div className="flex-1"/>
                                                            <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} onClick={() => setFollowUpFormOpen(false)}>{tr.batchBindPositionCancel}</Button>
                                                            <Button size="sm" className={CANDIDATE_DETAIL_PRIMARY_BUTTON_CLASS} disabled={followUpSubmitting || !followUpContent.trim()} onClick={async () => {
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
                                                            <div key={fu.id} className="rounded-[8px] border border-[#E6E7EB]/70 px-3 py-2 dark:border-[#202226]">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <Badge variant="outline" className={CANDIDATE_DETAIL_TAG_CLASS}>{typeLabels[fu.follow_up_type] || fu.follow_up_type}</Badge>
                                                                            {fu.created_at && <span className="text-xs text-[#B0B2B8] dark:text-[#86888F]">{formatDateTime(fu.created_at)}</span>}
                                                                        </div>
                                                                        <p className="mt-1 text-sm text-[#33353D] dark:text-[#D6D8DD] whitespace-pre-wrap">{fu.content}</p>
                                                                    </div>
                                                                    {permissions.manageCandidate ? <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-7 w-7 rounded-[4px] p-0 text-[#F53F3F] hover:bg-[rgba(245,63,63,0.08)] hover:text-[#F53F3F]"
                                                                        aria-label={tr.confirmDeleteFollowUp}
                                                                        onClick={() => setNestedDeleteTarget({kind: "follow_up", id: fu.id, title: fu.content.slice(0, 30) || (isZh ? "当前跟进记录" : "Current follow-up")})}
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5"/>
                                                                    </Button> : null}
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

                                    {candidateDetailPrimaryTab === "ai" && candidateDetailPanel === "assessment" ? (
                                        <>
                                            <div className="min-w-0 space-y-6">
                                                <section className="rounded-[8px] bg-[#F7F8FA] px-5 py-[18px] dark:bg-[#16181B]">
                                                    <div className="flex items-center gap-5">
                                                        <div className="flex w-[94px] shrink-0 flex-col items-center border-r border-[#E6E7EB] pr-5 dark:border-[#33353D]">
                                                            <p className="text-[32px] font-semibold leading-9 tabular-nums text-[#0CC991]">
                                                                {candidateScoreDisplayValues.totalScore !== null
                                                                    ? formatScoreValue(candidateScoreDisplayValues.totalScore, null)
                                                                    : "-"}
                                                            </p>
                                                            <p className="mt-1 text-[11px] text-[#86888F] dark:text-[#B0B2B8]">
                                                                {isZh ? "总分" : "Total"}{candidateScoreDisplayValues.totalScoreScale ? ` / ${candidateScoreDisplayValues.totalScoreScale}` : ""}
                                                            </p>
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <p className="text-[13px] font-semibold text-[#0E1114] dark:text-[#F7F8FA]">
                                                                    {isZh ? "AI 建议" : "AI recommendation"}：{labelForCandidateStatus(candidateScoreDecisionValues.suggestedStatus) || "-"}
                                                                </p>
                                                                <div className="flex shrink-0 items-center gap-2">
                                                                    {candidateDetail.score?.score_validation_passed === false ? (
                                                                        <Badge variant="outline" className="h-[22px] rounded-[4px] border-[rgba(255,171,36,0.32)] bg-[rgba(255,171,36,0.10)] px-2 text-[11px] text-[#D48806]">
                                                                            {tr.scoreValidationWarnings}
                                                                        </Badge>
                                                                    ) : null}
                                                                    <Badge variant="outline" className="h-[22px] rounded-[4px] border-[rgba(30,59,250,0.20)] bg-[rgba(30,59,250,0.06)] px-2 text-[11px] text-[#0F23D9]">
                                                                        {tr.matchBadge} {candidateScoreDisplayValues.matchPercent !== null ? formatPercent(candidateScoreDisplayValues.matchPercent) : "-"}
                                                                    </Badge>
                                                                </div>
                                                            </div>
                                                            <p className="mt-1 break-words text-[12px] leading-5 text-[#33353D] dark:text-[#D6D8DD]">
                                                                {candidateScoreDecisionValues.recommendation || "-"}
                                                            </p>
                                                            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[#B0B2B8] dark:text-[#86888F]">
                                                                {candidateAiModelLabel ? <span>{tr.modelLabel}：{candidateAiModelLabel}</span> : null}
                                                                {candidateAiGeneratedAt ? <span>· {formatLongDateTime(candidateAiGeneratedAt)}</span> : null}
                                                                {candidateAiOutputAvailable ? (
                                                                    <button type="button" className="text-[#1E3BFA] hover:text-[#0F23D9]" onClick={() => setCandidateAiOutputDialogOpen(true)}>
                                                                        {tr.viewFullAiOutput}
                                                                    </button>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </section>

                                                {Array.isArray(candidateDetail.score?.validation_warnings) && candidateDetail.score.validation_warnings.length > 0 ? (
                                                    <details className="rounded-[8px] border border-[rgba(255,171,36,0.30)] bg-[rgba(255,171,36,0.08)] px-3 py-2 text-[12px] text-[#D48806]">
                                                        <summary className="cursor-pointer font-medium">{tr.viewScoreWarnings}</summary>
                                                        <ul className="mt-2 space-y-1">
                                                            {candidateDetail.score.validation_warnings.map((item, index) => (
                                                                <li key={`score-warning-${index}`} className="break-words leading-6">{index + 1}. {item}</li>
                                                            ))}
                                                        </ul>
                                                    </details>
                                                ) : null}

                                                <div className="grid gap-4 text-[12px] text-[#33353D] dark:text-[#D6D8DD] sm:grid-cols-2">
                                                    <section className="space-y-2.5 rounded-[8px] border border-[#EBEEF5] p-4 dark:border-[#33353D]">
                                                        <p className="text-[13px] font-semibold text-[#0CC991]">{tr.strengths}</p>
                                                        {readScoreTextArray(candidateDetail.score?.advantages).length > 0 ? (
                                                            <ul className="space-y-1 leading-[22px]">
                                                                {readScoreTextArray(candidateDetail.score?.advantages).map((item, index) => (
                                                                    <li key={`advantage-${index}`} className="break-words">· {item}</li>
                                                                ))}
                                                            </ul>
                                                        ) : <p className="leading-[22px]">-</p>}
                                                    </section>
                                                    <section className="space-y-2.5 rounded-[8px] border border-[#EBEEF5] p-4 dark:border-[#33353D]">
                                                        <p className="text-[13px] font-semibold text-[#D48806]">{tr.risks}</p>
                                                        {readScoreTextArray(candidateDetail.score?.concerns).length > 0 ? (
                                                            <ul className="space-y-1 leading-[22px]">
                                                                {readScoreTextArray(candidateDetail.score?.concerns).map((item, index) => (
                                                                    <li key={`concern-${index}`} className="break-words">· {item}</li>
                                                                ))}
                                                            </ul>
                                                        ) : <p className="leading-[22px]">-</p>}
                                                    </section>
                                                </div>

                                                <CandidateRadarChart
                                                    dimensions={readScoreDimensions(candidateDetail.score?.dimensions)}
                                                    radarScores={candidateDetail.score?.radar_scores}
                                                    isZh={isZh}
                                                    uiText={{
                                                        scoreDetails: isZh ? "综合能力概览" : "Capability overview",
                                                        coreSkills: isZh ? "核心能力" : "Core skills",
                                                        otherSkills: isZh ? "其他维度" : "Other dimensions",
                                                        noData: isZh ? "暂无综合能力数据" : "No capability data",
                                                        benchmark: isZh ? "岗位基准线" : "Role benchmark",
                                                    }}
                                                />

                                                <section className="space-y-3">
                                                    <p className="text-[14px] font-semibold text-[#0E1114] dark:text-[#F7F8FA]">{isZh ? "各维度得分" : "Dimension scores"}</p>
                                                    {readScoreDimensions(candidateDetail.score?.dimensions).length > 0 ? (
                                                        <ul className="space-y-2.5">
                                                            {readScoreDimensions(candidateDetail.score?.dimensions).map((item, index) => {
                                                                const label = readScoreText(item.label) || "-";
                                                                const scoreValue = readScoreNumberStrict(item.score);
                                                                const maxScore = readScoreNumberStrict(item.max_score);
                                                                const evidences = readDimensionEvidenceList(item.evidence);
                                                                const reason = readScoreText(item.reason);
                                                                const isInferred = item.is_inferred === true;
                                                                const percent = scoreValue !== null && maxScore !== null && maxScore > 0
                                                                    ? Math.max(0, Math.min(100, Math.round((scoreValue / maxScore) * 100)))
                                                                    : null;
                                                                return (
                                                                    <li key={`dimension-${index}`} className="rounded-[8px] border border-[#EBEEF5] px-3.5 py-3 dark:border-[#33353D]">
                                                                        <div className="flex items-center justify-between gap-3">
                                                                            <p className="min-w-0 text-[13px] font-medium text-[#0E1114] dark:text-[#F7F8FA]">
                                                                                {label}
                                                                                {isInferred ? <span className="ml-1 text-[11px] text-[#B0B2B8] dark:text-[#86888F]">{tr.inferredDimension}</span> : null}
                                                                            </p>
                                                                            <p className="shrink-0 text-[13px] font-semibold tabular-nums text-[#33353D] dark:text-[#E6E7EB]">
                                                                                {scoreValue !== null ? scoreValue : "-"} / {maxScore !== null ? maxScore : "-"}
                                                                            </p>
                                                                        </div>
                                                                        {percent !== null ? (
                                                                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-[3px] bg-[#F2F3F5] dark:bg-[#33353D]">
                                                                                <div
                                                                                    className={cn("h-full rounded-[3px]", percent >= 80 ? "bg-[#0CC991]" : percent >= 60 ? "bg-[#1E3BFA]" : percent >= 40 ? "bg-[#FFAB24]" : "bg-[#F53F3F]")}
                                                                                    style={{width: `${percent}%`}}
                                                                                />
                                                                            </div>
                                                                        ) : null}
                                                                        <div className="mt-2 space-y-1 text-[11px] leading-[19px]">
                                                                            <p className="break-words text-[#33353D] dark:text-[#D6D8DD]"><span className="text-[#86888F]">{tr.dimensionReason}：</span>{reason || "-"}</p>
                                                                            <p className="break-words text-[#B0B2B8] dark:text-[#86888F]"><span className="text-[#86888F]">{tr.evidence}：</span>{evidences.length ? evidences.join("；") : "-"}</p>
                                                                        </div>
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                    ) : <p className="text-[12px] leading-6 text-[#B0B2B8]">-</p>}
                                                </section>
                                            </div>

                                            {permissions.manageCandidate ? <>
                                            <div className="grid gap-4 md:grid-cols-2">
                                                <Field label={tr.manualOverrideScore}>
                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={candidateEditor.manualOverrideScore} onChange={(event) => setCandidateEditor((current) => ({...current, manualOverrideScore: event.target.value}))} placeholder={tr.overrideScorePlaceholder}/>
                                                </Field>
                                                <Field label={tr.overrideReason}>
                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={candidateEditor.manualOverrideReason} onChange={(event) => setCandidateEditor((current) => ({...current, manualOverrideReason: event.target.value}))} placeholder={tr.overrideReasonPlaceholder}/>
                                                </Field>
                                            </div>

                                            <Field label={tr.hrFeedback}>
                                                <div className="space-y-3">
                                                    <div className="flex flex-wrap gap-2">
                                                        {[
                                                            {value: "agree", label: tr.hrFeedbackAgree, activeClass: "border-[rgba(12,201,145,0.30)] bg-[rgba(12,201,145,0.08)] text-[#0A9C71]"},
                                                            {value: "disagree", label: tr.hrFeedbackDisagree, activeClass: "border-[rgba(245,63,63,0.28)] bg-[rgba(245,63,63,0.08)] text-[#F53F3F]"},
                                                            {value: "neutral", label: tr.hrFeedbackNeutral, activeClass: "border-[#D6D8DD] bg-[#F2F3F5] text-[#33353D] dark:border-[#5E5F66] dark:bg-[#202226] dark:text-[#E6E7EB]"},
                                                        ].map((opt) => {
                                                            const isActive = candidateEditor.hrFeedback === opt.value;
                                                            return (
                                                                <Button
                                                                    key={opt.value}
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className={cn(CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS, isActive && opt.activeClass)}
                                                                    onClick={() => setCandidateEditor((current) => ({...current, hrFeedback: isActive ? "" : opt.value}))}
                                                                >
                                                                    {opt.label}
                                                                </Button>
                                                            );
                                                        })}
                                                    </div>
                                                    {candidateEditor.hrFeedback && (
                                                        <Input
                                                            className={CANDIDATE_DETAIL_INPUT_CLASS}
                                                            value={candidateEditor.hrFeedbackReason}
                                                            onChange={(event) => setCandidateEditor((current) => ({...current, hrFeedbackReason: event.target.value}))}
                                                            placeholder={tr.hrFeedbackReasonPlaceholder}
                                                        />
                                                    )}
                                                </div>
                                            </Field>

                                            <Button className={CANDIDATE_DETAIL_PRIMARY_BUTTON_CLASS} onClick={() => void saveCandidate()} disabled={candidateSaving}>
                                                <Save className="h-4 w-4"/>
                                                {candidateSaving ? tr.savingCandidate : tr.saveCandidateInfo}
                                            </Button>
                                            </> : null}

                                        </>
                                    ) : null}

                                    {candidateDetailPrimaryTab === "prep" && candidateDetailPanel === "exam" ? (
                                        <div className="rounded-md border border-dashed border-[#E6E7EB] bg-white px-4 py-10 dark:border-[#202226] dark:bg-[#0E1114]">
                                            <EmptyState
                                                title={isZh ? "暂无考试记录" : "No Exam Records"}
                                                description={isZh ? "考试模块先按竞品结构预留，后续接入笔试、测评考试或第三方测评后可直接落在这里。" : "The exam section is reserved for written tests, assessment exams, or third-party assessments."}
                                            />
                                        </div>
                                    ) : null}

                                    {candidateDetailPrimaryTab === "prep" && candidateDetailPanel === "interview" ? (
                                        <div className="space-y-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <h4 className="text-[14px] font-semibold text-[#0E1114]">{latestInterviewQuestion ? (isZh ? "面试题（已生成）" : "Interview Questions") : (isZh ? "面试题" : "Interview Questions")}</h4>
                                                    <p className="mt-1 text-[11px] leading-5 text-[#B0B2B8]">
                                                        {latestInterviewQuestion
                                                            ? (isZh ? `共 ${candidateDetail.interview_questions.length} 个版本 · 基于当前简历与初筛评估方案生成` : `${candidateDetail.interview_questions.length} version(s) generated from the current resume and screening plan`)
                                                            : (isZh ? "可基于当前简历、岗位和评估方案生成面试题" : "Generate questions from the current resume, position, and evaluation plan")}
                                                    </p>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    {permissions.manageInterview && permissions.executeProcess ? (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 rounded-[6px] border-[#1E3BFA] bg-white px-3.5 text-[12px] text-[#1E3BFA] shadow-none hover:bg-[rgba(30,59,250,0.05)] hover:text-[#1E3BFA]"
                                                            onClick={() => void generateInterviewQuestions()}
                                                            disabled={isCurrentInterviewTaskCancelling}
                                                        >
                                                            {isCurrentInterviewTaskCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <RotateCcw className="h-3.5 w-3.5"/>}
                                                            {isCurrentInterviewTaskCancelling ? tr.stopping : currentCandidateInterviewTaskId ? tr.stopGeneration : latestInterviewQuestion ? (isZh ? "重新生成" : "Regenerate") : (isZh ? "生成面试题" : "Generate")}
                                                        </Button>
                                                    ) : null}
                                                    {latestInterviewQuestion && permissions.executeProcess ? (
                                                        <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} onClick={() => void downloadInterviewQuestion(latestInterviewQuestion.id)}>
                                                            <Download className="h-3.5 w-3.5"/>
                                                            {tr.downloadHtml}
                                                        </Button>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <div className="rounded-[8px] border border-[#E6E7EB]/80 bg-white/85 px-4 py-4 dark:border-[#202226] dark:bg-[#0E1114]/70 space-y-3">
                                                <div className="grid gap-3">
                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={interviewRoundName} onChange={(event) => setInterviewRoundName(event.target.value)} placeholder={tr.roundPlaceholder} disabled={!permissions.manageInterview || !permissions.executeProcess}/>
                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={joinTags(effectiveInterviewSkillIds.map((id) => skillMap.get(id)?.name || ""))} readOnly placeholder={tr.currentSkillsPlaceholder}/>
                                                </div>
                                                <p className="text-xs text-[#86888F] dark:text-[#B0B2B8]">{tr.defaultInterviewSource(preferredInterviewSkillSourceLabel)}</p>
                                                <Textarea
                                                    className={CANDIDATE_DETAIL_TEXTAREA_CLASS}
                                                    value={interviewCustomRequirements}
                                                    onChange={(event) => setInterviewCustomRequirements(event.target.value)}
                                                    disabled={!permissions.manageInterview || !permissions.executeProcess}
                                                    rows={3}
                                                    placeholder={tr.interviewRequirementsPlaceholder}
                                                />
                                                <p className="text-xs leading-6 text-[#86888F] dark:text-[#B0B2B8]">
                                                    {tr.actualSkills(formatSkillNames(effectiveInterviewSkillIds, skillMap, language))}
                                                </p>
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <p className="text-xs text-[#86888F] dark:text-[#B0B2B8]">{tr.actualSource(effectiveInterviewSkillSourceLabel)}</p>
                                                    {interviewSkillSelectionDirty ? (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className={CANDIDATE_DETAIL_GHOST_BUTTON_CLASS}
                                                            disabled={!permissions.bindSkill}
                                                            onClick={() => {
                                                                setSelectedInterviewSkillIds([]);
                                                                setInterviewSkillSelectionDirty(false);
                                                            }}
                                                        >
                                                            {tr.restoreDefaultSkills}
                                                        </Button>
                                                    ) : null}
                                                </div>
                                                <p className="text-xs leading-6 text-[#86888F] dark:text-[#B0B2B8]">
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
                                                                "rounded-[4px] border px-3 py-2 text-xs transition",
                                                                effectiveInterviewSkillIds.includes(skill.id)
                                                                    ? "border-[#1E3BFA] bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]"
                                                                    : "border-[#E6E7EB] bg-white text-[#33353D] hover:border-[#1E3BFA] hover:text-[#1E3BFA]",
                                                            )}
                                                            disabled={!permissions.bindSkill}
                                                            onClick={() => toggleInterviewSkillSelection(skill.id)}
                                                        >
                                                            {skill.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="rounded-[8px] border border-[#E6E7EB]/80 bg-white/85 px-4 py-4 dark:border-[#202226] dark:bg-[#0E1114]/70">
                                                {latestInterviewQuestion ? (
                                                    <InterviewQuestionCard
                                                        question={latestInterviewQuestion}
                                                        onDownload={permissions.executeProcess ? () => void downloadInterviewQuestion(latestInterviewQuestion.id) : undefined}
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

                                            <div className="rounded-[8px] border border-[#E6E7EB]/80 bg-white/85 px-4 py-4 dark:border-[#202226] dark:bg-[#0E1114]/70">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="text-sm font-medium text-[#0E1114] dark:text-[#F7F8FA]">{tr.interviewSchedules}</p>
                                                    {permissions.manageInterview ? <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} onClick={() => {
                                                        if (scheduleFormOpen) {
                                                            setScheduleFormErrors({});
                                                            setScheduleDatePickerOpen(false);
                                                            setScheduleFormOpen(false);
                                                            return;
                                                        }
                                                        openInterviewScheduleForm();
                                                    }}>
                                                        <Plus className="h-4 w-4"/>
                                                        {tr.addSchedule}
                                                    </Button> : null}
                                                </div>
                                                {scheduleFormOpen && candidateDetail && (
                                                    <div className="mt-3 space-y-2 rounded-[8px] border border-[#E6E7EB]/70 bg-[#F7F8FA]/50 p-3 dark:border-[#202226] dark:bg-[#16181B]/50">
                                                        <div className="grid gap-2 md:grid-cols-2">
                                                            <label className="space-y-1 md:col-span-2">
                                                                <span className="text-xs text-[#86888F] dark:text-[#B0B2B8]"><span className="mr-0.5 text-[#F53F3F]">*</span>{isZh ? "面试主题" : "Interview subject"}</span>
                                                                <Input
                                                                    value={scheduleForm.subject}
                                                                    onChange={(e) => {
                                                                        clearScheduleFormError("subject");
                                                                        setScheduleForm((f) => ({...f, subject: e.target.value}));
                                                                    }}
                                                                    placeholder={isZh ? "面试主题" : "Interview subject"}
                                                                    className={cn(CANDIDATE_DETAIL_INPUT_CLASS, scheduleFormErrors.subject && scheduleRequiredErrorClass)}
                                                                />
                                                                {renderScheduleFormError("subject")}
                                                            </label>
                                                            <label className="space-y-1 md:col-span-2">
                                                                <span className="text-xs text-[#86888F] dark:text-[#B0B2B8]"><span className="mr-0.5 text-[#F53F3F]">*</span>{isZh ? "面试轮次" : "Round"}</span>
                                                                <NativeSelect
                                                                    value={scheduleForm.round_name}
                                                                    onChange={(event) => {
                                                                        clearScheduleFormError("round_name");
                                                                        const roundName = event.target.value;
                                                                        setScheduleForm((current) => ({
                                                                            ...current,
                                                                            round_name: roundName,
                                                                            round_index: String(interviewRoundIndexForName(roundName, Number(current.round_index || 4))),
                                                                        }));
                                                                    }}
                                                                    className={cn("h-10", scheduleFormErrors.round_name && scheduleRequiredErrorClass)}
                                                                >
                                                                    {INTERVIEW_ROUND_OPTIONS.map((option) => (
                                                                        <option key={option.value} value={option.value}>
                                                                            {isZh ? option.labelZh : option.labelEn}
                                                                        </option>
                                                                    ))}
                                                                </NativeSelect>
                                                                {renderScheduleFormError("round_name")}
                                                            </label>
                                                            <div className="space-y-1 md:col-span-2">
                                                                <span className="text-xs text-[#86888F] dark:text-[#B0B2B8]"><span className="mr-0.5 text-[#F53F3F]">*</span>{isZh ? "面试方式" : "Interview method"}</span>
                                                                <div className={cn("grid grid-cols-3 gap-1.5 rounded-[6px]", scheduleFormErrors.interview_method && "border border-[#F53F3F] bg-[rgba(245,63,63,0.04)] p-1")}>
                                                                    {INTERVIEW_METHOD_OPTIONS.map((option) => {
                                                                        const active = scheduleForm.interview_method === option.value;
                                                                        const Icon = option.value === "onsite" ? Briefcase : option.value === "video" ? Video : Phone;
                                                                        return (
                                                                            <button
                                                                                key={option.value}
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    clearScheduleFormError("interview_method");
                                                                                    setScheduleForm((current) => ({...current, interview_method: option.value}));
                                                                                }}
                                                                                className={cn(
                                                                                    "flex h-10 items-center justify-center gap-1 rounded-md border px-2 text-xs transition",
                                                                                    active
                                                                                        ? "border-[#1E3BFA] bg-white font-medium text-[#0E1114] dark:border-[#86888F] dark:bg-[#202226] dark:text-[#F7F8FA]"
                                                                                        : "border-[#E6E7EB] bg-white text-[#86888F] hover:text-[#33353D] dark:border-[#33353D] dark:bg-[#0E1114] dark:text-[#D6D8DD]",
                                                                                )}
                                                                            >
                                                                                <Icon className="h-3.5 w-3.5"/>
                                                                                <span className="truncate">{isZh ? option.labelZh : option.labelEn}</span>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                                {renderScheduleFormError("interview_method")}
                                                            </div>
                                                            <label className="space-y-1">
                                                                <span className="text-xs text-[#86888F] dark:text-[#B0B2B8]"><span className="mr-0.5 text-[#F53F3F]">*</span>{isZh ? "面试官" : "Interviewer"}</span>
                                                                <NativeSelect
                                                                    value={scheduleForm.interviewer_user_code}
                                                                    onChange={(event) => {
                                                                        clearScheduleFormError("interviewer_user_code");
                                                                        const userCode = event.target.value;
                                                                        const reviewer = interviewerByCode.get(userCode);
                                                                        setScheduleForm((current) => ({
                                                                            ...current,
                                                                            interviewer_user_code: userCode,
                                                                            interviewer_name: reviewer?.name || reviewer?.display_name || userCode,
                                                                            availability_slot_id: "",
                                                                        }));
                                                                    }}
                                                                    className={cn("h-10", scheduleFormErrors.interviewer_user_code && scheduleRequiredErrorClass)}
                                                                >
                                                                    <option value="">{interviewerLoading ? (isZh ? "正在加载面试官..." : "Loading interviewers...") : (isZh ? "选择面试官" : "Select interviewer")}</option>
                                                                    {interviewerOptions.map((reviewer) => (
                                                                        <option key={reviewer.user_code} value={reviewer.user_code}>
                                                                            {reviewer.name || reviewer.display_name || reviewer.user_code} · {reviewer.user_code}
                                                                        </option>
                                                                    ))}
                                                                </NativeSelect>
                                                                {renderScheduleFormError("interviewer_user_code")}
                                                            </label>
                                                            <label className="space-y-1">
                                                                <span className="text-xs text-[#86888F] dark:text-[#B0B2B8]">{isZh ? "可面试时间" : "Available time"}</span>
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
                                                            </label>
                                                            <div className="relative space-y-1 md:col-span-2">
                                                                <span className="text-xs text-[#86888F] dark:text-[#B0B2B8]"><span className="mr-0.5 text-[#F53F3F]">*</span>{isZh ? "日期时间" : "Date and time"}</span>
                                                                <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-[minmax(0,1fr)_132px_auto_152px]">
                                                                    <div className="min-w-0">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setScheduleDatePickerOpen((open) => !open)}
                                                                            className={cn(
                                                                                "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-[#E6E7EB] bg-white px-3 text-left text-sm outline-none transition hover:border-[#D6D8DD] focus:border-[#1E3BFA] dark:border-[#33353D] dark:bg-[#0E1114] dark:hover:border-[#5E5F66] dark:focus:border-[#86888F]",
                                                                                scheduleDatePart ? "text-[#33353D] dark:text-[#F7F8FA]" : "text-[#B0B2B8] dark:text-[#86888F]",
                                                                                scheduleFormErrors.scheduled_date && scheduleRequiredErrorClass,
                                                                            )}
                                                                        >
                                                                            <span className="min-w-0 truncate">{formatDateDisplay(scheduleDatePart, isZh)}</span>
                                                                            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[#D6D8DD] dark:text-[#86888F]"/>
                                                                        </button>
                                                                        {renderScheduleFormError("scheduled_date")}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <ScheduleTimeSelect
                                                                            value={scheduleStartTimePart}
                                                                            options={scheduleStartTimeOptions}
                                                                            placeholder={isZh ? "开始时间" : "Start"}
                                                                            buttonClassName={scheduleFormErrors.scheduled_start_time ? scheduleRequiredErrorClass : undefined}
                                                                            onChange={(nextTime) => {
                                                                                clearScheduleFormError("scheduled_date");
                                                                                clearScheduleFormError("scheduled_start_time");
                                                                                const nextDate = scheduleDatePart || scheduleToday;
                                                                                const nextStartMinutes = timeToMinutes(nextTime);
                                                                                setScheduleForm((current) => {
                                                                                    const currentDuration = Number(current.duration_minutes || 60);
                                                                                    const desiredDuration = Number.isFinite(currentDuration) ? Math.max(15, currentDuration) : 60;
                                                                                    const nextDuration = nextStartMinutes == null
                                                                                        ? desiredDuration
                                                                                        : Math.max(1, Math.min(TIME_OPTION_END_MINUTES, nextStartMinutes + desiredDuration) - nextStartMinutes);
                                                                                    return {
                                                                                        ...current,
                                                                                        scheduled_at: combineLocalDateTime(nextDate, nextTime),
                                                                                        duration_minutes: String(nextDuration),
                                                                                        availability_slot_id: "",
                                                                                    };
                                                                                });
                                                                            }}
                                                                        />
                                                                        {renderScheduleFormError("scheduled_start_time")}
                                                                    </div>
                                                                    <span className="hidden pt-2 text-sm text-[#D6D8DD] dark:text-[#33353D] md:block">~</span>
                                                                    <div className="min-w-0">
                                                                        <ScheduleTimeSelect
                                                                            value={scheduleEndTimePart}
                                                                            disabled={!scheduleStartTimePart}
                                                                            options={scheduleEndTimeSelectOptions}
                                                                            placeholder={isZh ? "结束时间" : "End"}
                                                                            buttonClassName={scheduleFormErrors.scheduled_end_time ? scheduleRequiredErrorClass : undefined}
                                                                            formatOption={(time) => {
                                                                                const endMinutes = timeToMinutes(time);
                                                                                const duration = scheduleStartMinutes == null || endMinutes == null ? 0 : endMinutes - scheduleStartMinutes;
                                                                                return duration > 0 ? `${time}（${formatDurationText(duration, isZh)}）` : time;
                                                                            }}
                                                                            onChange={(nextTime) => {
                                                                                clearScheduleFormError("scheduled_end_time");
                                                                                const endMinutes = timeToMinutes(nextTime);
                                                                                const startMinutes = timeToMinutes(scheduleStartTimePart);
                                                                                if (endMinutes == null || startMinutes == null || endMinutes <= startMinutes) {
                                                                                    return;
                                                                                }
                                                                                setScheduleForm((current) => ({
                                                                                    ...current,
                                                                                    duration_minutes: String(endMinutes - startMinutes),
                                                                                    availability_slot_id: "",
                                                                                }));
                                                                            }}
                                                                        />
                                                                        {renderScheduleFormError("scheduled_end_time")}
                                                                    </div>
                                                                </div>
                                                                {scheduleDatePickerOpen ? (
                                                                    <div className="absolute left-0 top-[66px] z-30 w-[360px] rounded-[8px] border border-[#E6E7EB] bg-white p-3 shadow-xl dark:border-[#33353D] dark:bg-[#0E1114]">
                                                                        <div className="mb-2 flex items-center justify-between">
                                                                            <span className="text-xs font-medium text-[#86888F] dark:text-[#B0B2B8]">{isZh ? "选择面试日期" : "Select date"}</span>
                                                                            <button
                                                                                type="button"
                                                                                className="text-xs text-[#0E1114] dark:text-[#F7F8FA]"
                                                                                onClick={() => {
                                                                                    clearScheduleFormError("scheduled_date");
                                                                                    clearScheduleFormError("scheduled_start_time");
                                                                                    clearScheduleFormError("scheduled_end_time");
                                                                                    const nextTime = scheduleStartTimePart || "09:00";
                                                                                    setScheduleForm((current) => ({
                                                                                        ...current,
                                                                                        scheduled_at: combineLocalDateTime(scheduleToday, nextTime),
                                                                                        duration_minutes: current.duration_minutes || "60",
                                                                                        availability_slot_id: "",
                                                                                    }));
                                                                                    setScheduleDatePickerOpen(false);
                                                                                }}
                                                                            >
                                                                                {isZh ? "今天" : "Today"}
                                                                            </button>
                                                                        </div>
                                                                        <div className="grid grid-cols-7 gap-1">
                                                                            {scheduleDateOptions.map((date) => {
                                                                                const parsed = parseLocalDateValue(date);
                                                                                const active = date === scheduleDatePart;
                                                                                const isToday = date === scheduleToday;
                                                                                return (
                                                                                    <button
                                                                                        key={date}
                                                                                        type="button"
                                                                                        onClick={() => {
                                                                                            clearScheduleFormError("scheduled_date");
                                                                                            clearScheduleFormError("scheduled_start_time");
                                                                                            clearScheduleFormError("scheduled_end_time");
                                                                                            const nextTime = scheduleStartTimePart || "09:00";
                                                                                            setScheduleForm((current) => ({
                                                                                                ...current,
                                                                                                scheduled_at: combineLocalDateTime(date, nextTime),
                                                                                                duration_minutes: current.duration_minutes || "60",
                                                                                                availability_slot_id: "",
                                                                                            }));
                                                                                            setScheduleDatePickerOpen(false);
                                                                                        }}
                                                                                        className={cn(
                                                                                            "flex h-10 flex-col items-center justify-center rounded-[6px] text-xs transition",
                                                                                            active
                                                                                                ? "bg-[#1E3BFA] text-white shadow-sm dark:bg-[#F2F3F5] dark:text-[#0E1114]"
                                                                                                : isToday
                                                                                                    ? "bg-[#F7F8FA] text-[#0E1114] ring-1 ring-[#E6E7EB] dark:bg-[#202226] dark:text-[#F7F8FA] dark:ring-[#33353D]"
                                                                                                    : "text-[#33353D] hover:bg-[#F7F8FA] hover:text-[#0E1114] dark:text-[#D6D8DD] dark:hover:bg-[#16181B] dark:hover:text-[#F7F8FA]",
                                                                                        )}
                                                                                    >
                                                                                        <span>{parsed ? parsed.getDate() : date.slice(-2)}</span>
                                                                                        <span className={cn("mt-0.5 text-[10px]", active ? "text-white/80" : isToday ? "text-[#B0B2B8]" : "text-[#D6D8DD]")}>
                                                                                            {parsed ? new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {weekday: "short"}).format(parsed) : ""}
                                                                                        </span>
                                                                                    </button>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                ) : null}
                                                                <p className="text-[11px] text-[#B0B2B8] dark:text-[#86888F]">
                                                                    {scheduleStartTimePart
                                                                        ? (isZh ? `当前时长 ${formatDurationText(effectiveScheduleDurationMinutes, isZh)}` : `Duration ${formatDurationText(effectiveScheduleDurationMinutes, isZh)}`)
                                                                        : (isZh ? "先选日期和开始时间，再选择结束时间。" : "Select date and start time, then end time.")}
                                                                </p>
                                                            </div>
                                                            {scheduleForm.interview_method === "onsite" ? (
                                                                <>
                                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={scheduleForm.location} onChange={(e) => setScheduleForm((f) => ({...f, location: e.target.value}))} placeholder={isZh ? "面试地点" : "Interview location"}/>
                                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={scheduleForm.meeting_room} onChange={(e) => setScheduleForm((f) => ({...f, meeting_room: e.target.value}))} placeholder={isZh ? "会议室" : "Meeting room"}/>
                                                                </>
                                                            ) : null}
                                                            {scheduleForm.interview_method === "video" ? (
                                                                <>
                                                                    <NativeSelect value={scheduleForm.video_tool} onChange={(e) => setScheduleForm((f) => ({...f, video_tool: e.target.value}))} className="h-10">
                                                                        {INTERVIEW_VIDEO_TOOL_OPTIONS.map((tool) => (
                                                                            <option key={tool} value={tool}>{tool}</option>
                                                                        ))}
                                                                    </NativeSelect>
                                                                    <Input className={CANDIDATE_DETAIL_INPUT_CLASS} value={scheduleForm.meeting_link} onChange={(e) => setScheduleForm((f) => ({...f, meeting_link: e.target.value}))} placeholder={isZh ? "会议链接/会议号" : "Meeting link / ID"}/>
                                                                </>
                                                            ) : null}
                                                            {scheduleForm.interview_method === "phone" ? (
                                                                <Input className={cn(CANDIDATE_DETAIL_INPUT_CLASS, "md:col-span-2")} value={scheduleForm.contact_phone} onChange={(e) => setScheduleForm((f) => ({...f, contact_phone: e.target.value}))} placeholder={isZh ? "联系电话" : "Contact phone"}/>
                                                            ) : null}
                                                            <div className="md:col-span-2 grid gap-2 sm:grid-cols-2">
                                                                {INTERVIEW_VISIBLE_SECTION_OPTIONS.map((option) => (
                                                                    <label key={option.value} className="flex items-center gap-2 rounded-md border border-[#E6E7EB] bg-white px-3 py-2 text-sm text-[#33353D] dark:border-[#202226] dark:bg-[#0E1114] dark:text-[#D6D8DD]">
                                                                        <input
                                                                            type="checkbox"
                                                                            className="accent-[#1E3BFA]"
                                                                            checked={scheduleForm.visible_sections.includes(option.value)}
                                                                            onChange={() => setScheduleForm((current) => ({
                                                                                ...current,
                                                                                visible_sections: current.visible_sections.includes(option.value)
                                                                                    ? current.visible_sections.filter((item) => item !== option.value)
                                                                                    : [...current.visible_sections, option.value],
                                                                            }))}
                                                                        />
                                                                        <span>{isZh ? option.labelZh : option.labelEn}</span>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        {scheduleForm.interviewer_user_code && !scheduleAvailabilityLoading && scheduleAvailabilitySlots.length === 0 ? (
                                                            <p className="text-xs text-[#D48806]">
                                                                {isZh ? "该面试官近 14 天暂无可面试时间，可以手动填写时间；保存时系统仍会校验冲突。" : "No available slots in the next 14 days. You can fill the time manually; conflicts are still checked."}
                                                            </p>
                                                        ) : null}
                                                        <Textarea className={CANDIDATE_DETAIL_TEXTAREA_CLASS} value={scheduleForm.notes} onChange={(e) => setScheduleForm((f) => ({...f, notes: e.target.value}))} rows={2} placeholder={tr.scheduleNotes}/>
                                                        <div className="flex justify-end gap-2">
                                                            <Button size="sm" variant="outline" className={CANDIDATE_DETAIL_OUTLINE_BUTTON_CLASS} onClick={() => {
                                                                setScheduleFormErrors({});
                                                                setScheduleDatePickerOpen(false);
                                                                setScheduleFormOpen(false);
                                                            }}>{tr.batchBindPositionCancel}</Button>
                                                            <Button size="sm" className={CANDIDATE_DETAIL_PRIMARY_BUTTON_CLASS} disabled={scheduleSubmitting} onClick={async () => {
                                                                const nextErrors: Partial<Record<CandidateScheduleFormErrorKey, string>> = {};
                                                                if (!scheduleForm.subject.trim()) {
                                                                    nextErrors.subject = scheduleRequiredText;
                                                                }
                                                                if (!scheduleForm.round_name.trim()) {
                                                                    nextErrors.round_name = scheduleRequiredText;
                                                                }
                                                                if (!scheduleForm.interview_method) {
                                                                    nextErrors.interview_method = scheduleRequiredText;
                                                                }
                                                                if (!scheduleForm.interviewer_user_code.trim()) {
                                                                    nextErrors.interviewer_user_code = scheduleRequiredText;
                                                                }
                                                                if (!scheduleDatePart) {
                                                                    nextErrors.scheduled_date = scheduleRequiredText;
                                                                }
                                                                if (!scheduleStartTimePart) {
                                                                    nextErrors.scheduled_start_time = scheduleRequiredText;
                                                                }
                                                                if (!scheduleEndTimePart || effectiveScheduleDurationMinutes <= 0) {
                                                                    nextErrors.scheduled_end_time = scheduleRequiredText;
                                                                }
                                                                if (Object.keys(nextErrors).length > 0) {
                                                                    setScheduleFormErrors(nextErrors);
                                                                    return;
                                                                }
                                                                setScheduleFormErrors({});
                                                                setScheduleSubmitting(true);
                                                                try {
                                                                    await createInterviewSchedule({
                                                                        candidate_id: candidateDetail.candidate.id,
                                                                        subject: scheduleForm.subject.trim() || undefined,
                                                                        round_name: scheduleForm.round_name || undefined,
                                                                        round_index: scheduleForm.round_index ? Number(scheduleForm.round_index) : undefined,
                                                                        interview_method: scheduleForm.interview_method,
                                                                        interviewer_user_code: scheduleForm.interviewer_user_code || undefined,
                                                                        interviewer_name: scheduleForm.interviewer_name || undefined,
                                                                        scheduled_at: scheduleForm.scheduled_at ? new Date(scheduleForm.scheduled_at).toISOString() : undefined,
                                                                        duration_minutes: scheduleForm.duration_minutes ? Number(scheduleForm.duration_minutes) : undefined,
                                                                        availability_slot_id: scheduleForm.availability_slot_id ? Number(scheduleForm.availability_slot_id) : undefined,
                                                                        department_review_assignment_id: scheduleForm.department_review_assignment_id ? Number(scheduleForm.department_review_assignment_id) : undefined,
                                                                        location: scheduleForm.location || undefined,
                                                                        meeting_room: scheduleForm.meeting_room || undefined,
                                                                        video_tool: scheduleForm.video_tool || undefined,
                                                                        meeting_link: scheduleForm.meeting_link || undefined,
                                                                        contact_phone: scheduleForm.contact_phone || undefined,
                                                                        notes: scheduleForm.notes || undefined,
                                                                        visible_sections: scheduleForm.visible_sections,
                                                                    });
                                                                    setScheduleDatePickerOpen(false);
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
                                                <div className="mt-5">
                                                    {sortedInterviewSchedules.length > 0 ? (
                                                        <div className="relative pl-7">
                                                            {sortedInterviewSchedules.map((schedule, index) => {
                                                                const MethodIcon = interviewMethodIcon(schedule.interview_method);
                                                                const isLast = index === sortedInterviewSchedules.length - 1;
                                                                const meetingLink = String(schedule.meeting_link || "").trim();
                                                                const meetingHref = /^https?:\/\//i.test(meetingLink) ? meetingLink : "";
                                                                const method = String(schedule.interview_method || "onsite").trim().toLowerCase();
                                                                const locationText = method === "video"
                                                                    ? (schedule.location || "--")
                                                                    : method === "phone"
                                                                        ? (schedule.contact_phone || "--")
                                                                        : (schedule.location || "--");
                                                                return (
                                                                    <div key={schedule.id} className="relative pb-7">
                                                                        {!isLast ? <span className="absolute -left-[19px] top-5 bottom-0 w-px bg-[rgba(30,59,250,0.22)]"/> : null}
                                                                        <span className="absolute -left-[26px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#1E3BFA] ring-4 ring-[rgba(30,59,250,0.08)]">
                                                                            <span className="h-1.5 w-1.5 rounded-full bg-white"/>
                                                                        </span>
                                                                        <p className="mb-2 text-[15px] font-semibold text-[#0E1114] dark:text-[#F7F8FA]">
                                                                            {schedule.round_name || (isZh ? "面试" : "Interview")}
                                                                        </p>
                                                                        <div className="overflow-hidden rounded-[6px] border border-[#E6E7EB] bg-white dark:border-[#202226] dark:bg-[#0E1114]">
                                                                            <div className="bg-[#F7F8FA] px-4 py-3 dark:bg-[#16181B]/60">
                                                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                                                    <div className="min-w-0">
                                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                                            <p className="text-[16px] font-semibold text-[#0E1114] dark:text-[#F7F8FA]">
                                                                                                {formatInterviewDateWithWeekday(schedule.scheduled_at, isZh)} - {formatInterviewTimeRange(schedule)}
                                                                                            </p>
                                                                                            <Badge variant="outline" className="h-6 gap-1 rounded-[3px] border-[#E6E7EB] bg-white px-2 text-[12px] text-[#33353D] dark:border-[#33353D] dark:bg-[#0E1114] dark:text-[#D6D8DD]">
                                                                                                <MethodIcon className="h-3.5 w-3.5"/>
                                                                                                {interviewMethodLabel(schedule.interview_method, isZh)}
                                                                                            </Badge>
                                                                                            {schedule.subject ? (
                                                                                                <span className="max-w-[320px] truncate text-[12px] text-[#B0B2B8] dark:text-[#86888F]">{schedule.subject}</span>
                                                                                            ) : null}
                                                                                        </div>
                                                                                        <div className="mt-3 grid gap-x-10 gap-y-2 text-[13px] text-[#33353D] dark:text-[#D6D8DD] md:grid-cols-2">
                                                                                            <div><span className="mr-2 text-[#B0B2B8] dark:text-[#86888F]">{isZh ? "安排人" : "Creator"}</span>{schedule.created_by || "--"}</div>
                                                                                            <div><span className="mr-2 text-[#B0B2B8] dark:text-[#86888F]">{isZh ? "面试地点" : "Location"}</span>{locationText}</div>
                                                                                            <div><span className="mr-2 text-[#B0B2B8] dark:text-[#86888F]">{isZh ? "安排时间" : "Created"}</span>{formatInterviewDateTime(schedule.created_at, isZh)}</div>
                                                                                            {method === "video" ? (
                                                                                                <div className="min-w-0">
                                                                                                    <span className="mr-2 text-[#B0B2B8] dark:text-[#86888F]">{isZh ? "视频工具" : "Video tool"}</span>
                                                                                                    <span>{schedule.video_tool || "--"}</span>
                                                                                                    {meetingLink ? (
                                                                                                        <>
                                                                                                            <span className="mx-1.5 text-[#D6D8DD]">|</span>
                                                                                                            {meetingHref ? (
                                                                                                                <a className="font-medium text-[#0F23D9] hover:underline" href={meetingHref} target="_blank" rel="noreferrer">{isZh ? "查看链接" : "Open link"}</a>
                                                                                                            ) : (
                                                                                                                <span className="break-all text-[#0F23D9]">{meetingLink}</span>
                                                                                                            )}
                                                                                                        </>
                                                                                                    ) : null}
                                                                                                </div>
                                                                                            ) : null}
                                                                                            {method === "phone" ? (
                                                                                                <div><span className="mr-2 text-[#B0B2B8] dark:text-[#86888F]">{isZh ? "联系电话" : "Phone"}</span>{schedule.contact_phone || "--"}</div>
                                                                                            ) : null}
                                                                                            {method === "onsite" && schedule.meeting_room ? (
                                                                                                <div><span className="mr-2 text-[#B0B2B8] dark:text-[#86888F]">{isZh ? "会议室" : "Room"}</span>{schedule.meeting_room}</div>
                                                                                            ) : null}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="flex shrink-0 items-center gap-2">
                                                                                        <Badge variant="outline" className={cn("h-7 rounded-[3px] px-2.5 text-[12px]", interviewScheduleStatusClass(schedule))}>
                                                                                            {interviewScheduleStatusLabel(schedule, isZh)}
                                                                                        </Badge>
                                                                                        {permissions.manageInterview ? <Button
                                                                                            size="sm"
                                                                                            variant="outline"
                                                                                            className="h-8 rounded-[4px] border-[#E6E7EB] bg-white px-2.5 text-[12px] text-[#F53F3F] shadow-none hover:border-[#F53F3F] hover:bg-[rgba(245,63,63,0.06)] hover:text-[#F53F3F]"
                                                                                            onClick={() => setNestedDeleteTarget({kind: "interview", id: schedule.id, title: schedule.subject || schedule.round_name || (isZh ? "当前面试安排" : "Current interview")})}
                                                                                        >
                                                                                            <Trash2 className="h-3.5 w-3.5"/>
                                                                                            {isZh ? "删除" : "Delete"}
                                                                                        </Button> : null}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                                                                <div className="min-w-0 text-[14px] text-[#33353D] dark:text-[#D6D8DD]">
                                                                                    <span className="font-medium text-[#0E1114] dark:text-[#F7F8FA]">{schedule.interviewer_name || schedule.interviewer_user_code || "--"}</span>
                                                                                    {schedule.interviewer_user_code && schedule.interviewer_name ? <span className="ml-1 text-[#B0B2B8]">({schedule.interviewer_user_code})</span> : null}
                                                                                </div>
                                                                                {schedule.notes ? <p className="min-w-0 flex-1 truncate text-right text-[13px] text-[#B0B2B8] dark:text-[#86888F]">{schedule.notes}</p> : null}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <EmptyState title={tr.noSchedules} description={tr.noSchedulesDesc}/>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}
                                    </div>
                                </div>
                            </section>
                            <aside className="!hidden" aria-hidden="true">
                                <div className="space-y-3">
                                    {isDepartmentReviewDecisionMode ? (
                                        <>
                                            <div className="rounded-[6px] bg-white px-5 py-5 dark:border dark:border-[#202226] dark:bg-[#0E1114]">
                                                <div className="flex items-center justify-between">
                                                    {candidateDetailFlowSteps.map((step, index) => {
                                                        const isActive = index === candidateDetailFlowIndex;
                                                        const isDone = index < candidateDetailFlowIndex;
                                                        return (
                                                            <React.Fragment key={step.status}>
                                                                <span className={cn(
                                                                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                                                                    isActive || isDone ? "bg-[#1E3BFA] text-white dark:bg-[#F2F3F5] dark:text-[#0E1114]" : "bg-[#D6D8DD] text-white dark:bg-[#33353D] dark:text-[#D6D8DD]",
                                                                )}>
                                                                    {index + 1}
                                                                </span>
                                                                {index < candidateDetailFlowSteps.length - 1 ? (
                                                                    <span className={cn("h-px flex-1 border-t border-dashed", index < candidateDetailFlowIndex ? "border-[#1E3BFA] dark:border-[#F2F3F5]" : "border-[#D6D8DD] dark:border-[#33353D]")}/>
                                                                ) : null}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </div>
                                                <div className="mt-3">
                                                    <p className="text-[15px] font-medium text-[#0E1114] dark:text-[#F7F8FA]">
                                                        {isZh ? "部门评审" : "Department Review"}
                                                    </p>
                                                    <p className="mt-1 text-[13px] text-[#86888F] dark:text-[#B0B2B8]">
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
                                            <div className="rounded-[6px] bg-white px-5 py-4 dark:border dark:border-[#202226] dark:bg-[#0E1114]">
                                                <div className="flex items-center gap-5 border-b border-[#F2F3F5] dark:border-[#202226]">
                                                    <div className="relative flex h-9 items-center text-[15px] font-semibold text-[#0E1114] dark:text-[#F7F8FA]">
                                                        {isZh ? "备注" : "Notes"}
                                                        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#1E3BFA] dark:bg-[#F2F3F5]"/>
                                                    </div>
                                                </div>
                                                <Textarea
                                                    value={departmentReviewDecisionComment}
                                                    onChange={(event) => setDepartmentReviewDecisionComment(event.target.value)}
                                                    rows={6}
                                                    maxLength={1000}
                                                    className="mt-4 resize-none rounded-[4px] border-[#E6E7EB] text-[14px] dark:border-[#33353D] dark:bg-[#16181B] dark:text-[#F7F8FA] dark:placeholder:text-[#86888F]"
                                                    placeholder={isZh ? "填写评审意见，点击通过或淘汰时会一并提交" : "Add review comments. They will be submitted with Pass or Reject."}
                                                />
                                                <div className="mt-3 flex items-center justify-end text-[13px] text-[#86888F] dark:text-[#B0B2B8]">
                                                    <span>{departmentReviewDecisionComment.length}/1000</span>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                    <div className="rounded-[6px] bg-white px-5 py-5 dark:border dark:border-[#202226] dark:bg-[#0E1114]">
                                        <div className="flex items-center justify-between">
                                            {candidateDetailFlowSteps.map((step, index) => {
                                                const isActive = index === candidateDetailFlowIndex;
                                                const isDone = index < candidateDetailFlowIndex;
                                                return (
                                                    <React.Fragment key={step.status}>
                                                        <span className={cn(
                                                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                                                            isActive || isDone ? "bg-[#1E3BFA] text-white dark:bg-[#F2F3F5] dark:text-[#0E1114]" : "bg-[#D6D8DD] text-white dark:bg-[#33353D] dark:text-[#D6D8DD]",
                                                        )}>
                                                            {index + 1}
                                                        </span>
                                                        {index < candidateDetailFlowSteps.length - 1 ? (
                                                            <span className={cn("h-px flex-1 border-t border-dashed", index < candidateDetailFlowIndex ? "border-[#1E3BFA] dark:border-[#F2F3F5]" : "border-[#D6D8DD] dark:border-[#33353D]")}/>
                                                        ) : null}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </div>
                                        <div className="mt-3">
                                            <p className="text-[15px] font-medium text-[#0E1114] dark:text-[#F7F8FA]">
                                                {candidateDetailFlowSteps[candidateDetailFlowIndex]?.label || labelForCandidateStatus(candidateDetailDisplayStatus)}
                                            </p>
                                            <p className="mt-1 text-[13px] text-[#86888F] dark:text-[#B0B2B8]">
                                                {labelForCandidateStatus(candidateDetailDisplayStatus)}
                                            </p>
                                        </div>
                                        <div className="mt-5 grid gap-2">
                                            {permissions.executeProcess ? (
                                            <RailActionButton
                                                tone="primary"
                                                onClick={() => void handleCandidateDetailScreeningAction()}
                                                disabled={screeningSubmitting || candidateDetailScreeningLive}
                                            >
                                                {screeningSubmitting || candidateDetailScreeningLive ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <Sparkles className="mr-1 h-4 w-4"/>}
                                                {candidateDetailScreeningActionLabel}
                                            </RailActionButton>
                                            ) : null}
                                            {permissions.manageCandidate ? <>
                                            <RailActionButton tone="success" onClick={() => setPendingStatus("screening_passed")}>
                                                {isZh ? "通过" : "Pass"}
                                            </RailActionButton>
                                            <RailActionButton tone="warning" onClick={() => setPendingStatus("pending_screening")}>
                                                {isZh ? "待定" : "Pending"}
                                            </RailActionButton>
                                            <RailActionButton tone="danger" onClick={() => setPendingStatus("screening_rejected")}>
                                                {isZh ? "淘汰" : "Reject"}
                                            </RailActionButton>
                                            </> : null}
                                        </div>
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            {permissions.manageReview ? (
                                                <RailActionButton
                                                    onClick={openDepartmentReviewDialog}
                                                    disabled={!createDepartmentReview}
                                                >
                                                    {isZh ? "提交部门评审" : "Submit Review"}
                                                </RailActionButton>
                                            ) : null}
                                            {permissions.manageCandidate ? <RailActionButton onClick={openCandidatePositionDialog}>
                                                {isZh ? "转移" : "Transfer"}
                                            </RailActionButton> : null}
                                            <RailActionButton disabled>
                                                {isZh ? "笔试待接入" : "Assessment Pending"}
                                            </RailActionButton>
                                            {permissions.sendMail ? <RailActionButton onClick={() => openResumeMailDialog([candidateDetail.candidate.id])}>
                                                {isZh ? "邀请更新简历" : "Update Resume"}
                                            </RailActionButton> : null}
                                            {permissions.manageCandidate ? <RailActionButton onClick={openCandidatePositionDialog}>
                                                {isZh ? "推荐到职位" : "Recommend"}
                                            </RailActionButton> : null}
                                            {permissions.sendMail ? <RailActionButton onClick={() => openResumeMailDialog([candidateDetail.candidate.id])}>
                                                {isZh ? "转发简历" : "Forward Resume"}
                                            </RailActionButton> : null}
                                            {permissions.manageCandidate && permissions.viewTalentPool ? <RailActionButton onClick={() => setPendingStatus("talent_pool")}>
                                                {isZh ? "储备至人才库" : "Talent Pool"}
                                            </RailActionButton> : null}
                                            <RailActionButton disabled>
                                                {isZh ? "加入黑名单" : "Blacklist"}
                                            </RailActionButton>
                                            {permissions.manageCandidate ? <RailActionButton tone="danger" onClick={() => requestDeleteCandidate(candidateDetail.candidate)}>
                                                {isZh ? "删除" : "Delete"}
                                            </RailActionButton> : null}
                                            <RailActionButton disabled>
                                                {isZh ? "加入人才地图" : "Talent Map"}
                                            </RailActionButton>
                                            {permissions.manageInterview && permissions.executeProcess ? <RailActionButton onClick={() => void generateInterviewQuestions()} disabled={isCurrentInterviewTaskCancelling}>
                                                {isCurrentInterviewTaskCancelling ? tr.stopping : currentCandidateInterviewTaskId ? tr.stopGeneration : tr.interviewQuestions}
                                            </RailActionButton> : null}
                                        </div>
                                    </div>
                                    {shouldShowCurrentScreeningTask ? (
                                        <div className="rounded-[6px] bg-white px-5 py-4 dark:border dark:border-[#202226] dark:bg-[#0E1114]">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-[15px] font-semibold text-[#0E1114] dark:text-[#F7F8FA]">{tr.currentScreeningTask}</p>
                                                {currentScreeningTaskStatus ? (
                                                    <Badge className={cn("rounded-[3px] border", prototypeStatusBadgeClass(currentScreeningTaskStatus))}>
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
                                                return <p className="mt-2 text-[13px] leading-6 text-[#86888F] dark:text-[#B0B2B8]">{primary}</p>;
                                            })()}
                                        </div>
                                    ) : null}
                                    <div className="rounded-[6px] bg-white px-5 py-4 dark:border dark:border-[#202226] dark:bg-[#0E1114]">
                                        <div className="flex items-center gap-5 border-b border-[#F2F3F5] dark:border-[#202226]">
                                            <button
                                                type="button"
                                                onClick={() => setCandidateDetailSideRailTab("note")}
                                                className={cn(
                                                    "relative h-9 text-[15px] transition",
                                                    candidateDetailSideRailTab === "note"
                                                        ? "font-semibold text-[#0E1114] dark:text-[#F7F8FA]"
                                                        : "text-[#33353D] hover:text-[#0E1114] dark:text-[#B0B2B8] dark:hover:text-[#E6E7EB]",
                                                )}
                                            >
                                                {isZh ? "备注" : "Notes"}
                                                {candidateDetailSideRailTab === "note" ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#1E3BFA] dark:bg-[#F2F3F5]"/> : null}
                                            </button>
                                            <button
                                                type="button"
                                                className={cn(
                                                    "relative h-9 text-[15px] transition",
                                                    candidateDetailSideRailTab === "followups"
                                                        ? "font-semibold text-[#0E1114] dark:text-[#F7F8FA]"
                                                        : "text-[#33353D] hover:text-[#0E1114] dark:text-[#B0B2B8] dark:hover:text-[#E6E7EB]",
                                                )}
                                                onClick={() => {
                                                    setCandidateDetailSideRailTab("followups");
                                                    openCandidateDetailPanel("background");
                                                }}
                                            >
                                                {isZh ? "我的跟进" : "Follow-ups"}
                                                {candidateDetailSideRailTab === "followups" ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#1E3BFA] dark:bg-[#F2F3F5]"/> : null}
                                            </button>
                                        </div>
                                        {candidateDetailSideRailTab === "note" ? (
                                            <>
                                                <Textarea
                                                    value={candidateNoteDraft}
                                                    onChange={(event) => setCandidateNoteDraft(event.target.value)}
                                                    rows={5}
                                                    maxLength={1000}
                                                    className="mt-4 resize-none rounded-[4px] border-[#E6E7EB] text-[14px] dark:border-[#33353D] dark:bg-[#16181B] dark:text-[#F7F8FA] dark:placeholder:text-[#86888F]"
                                                    placeholder={isZh ? "填写候选人备注，保存后会进入跟进记录" : "Add a candidate note. It will be saved to follow-ups."}
                                                />
                                                <div className="mt-3 flex items-center justify-between gap-2 text-[13px] text-[#86888F] dark:text-[#B0B2B8]">
                                                    <span>@ {isZh ? "同事" : "Colleague"}</span>
                                                    <span>{candidateNoteDraft.length}/1000</span>
                                                    <Button
                                                        size="sm"
                                                        className="h-7 rounded-[4px] bg-[#1E3BFA] px-3 text-[13px] text-white hover:bg-[#0F23D9]"
                                                        onClick={() => void saveCandidateDetailNote()}
                                                        disabled={candidateDetailNoteSubmitting || !candidateNoteDraft.trim()}
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
                                                            <div key={followUp.id} className="rounded-[6px] border border-[#F2F3F5] bg-[#F7F8FA] px-3 py-2 dark:border-[#202226] dark:bg-[#16181B]">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-[12px] font-medium text-[#0E1114] dark:text-[#F7F8FA]">
                                                                        {typeLabels[followUp.follow_up_type] || followUp.follow_up_type}
                                                                    </span>
                                                                    {followUp.created_at ? <span className="shrink-0 text-[12px] text-[#B0B2B8] dark:text-[#86888F]">{formatDateTime(followUp.created_at)}</span> : null}
                                                                </div>
                                                                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] leading-5 text-[#33353D] dark:text-[#D6D8DD]">{followUp.content}</p>
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="rounded-[6px] border border-dashed border-[#E6E7EB] px-3 py-5 text-center text-[13px] text-[#B0B2B8] dark:border-[#202226] dark:text-[#86888F]">
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
                        <div className="flex h-full min-h-0 items-center justify-center bg-white px-8 py-10">
                            <div className="max-w-[420px] text-center">
                                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-[8px] bg-[#F2F3F5] text-[#86888F]">
                                    <Users className="h-5 w-5"/>
                                </span>
                                <h3 className="mt-4 text-[16px] font-semibold text-[#0E1114]">
                                    {isZh ? "候选人详情加载失败" : "Candidate details unavailable"}
                                </h3>
                                <p className="mt-2 text-[13px] leading-6 text-[#86888F]">
                                    {isZh ? "当前候选人可能已被删除、超出权限范围，或详情请求暂时失败。" : "The candidate may have been removed, be outside your access scope, or failed to load."}
                                </p>
                                <div className="mt-5 flex items-center justify-center gap-3">
                                    <Button
                                        variant="outline"
                                        className="h-[34px] rounded-[6px] border-[#E6E7EB] bg-white px-[18px] text-[13px] text-[#33353D] shadow-none hover:border-[#1E3BFA] hover:bg-[#F7F8FA] hover:text-[#1E3BFA]"
                                        onClick={() => setSelectedCandidateId(null)}
                                    >
                                        {tr.cancel}
                                    </Button>
                                    {selectedCandidateId && onRefreshCandidateDetail ? (
                                        <Button
                                            className="h-[34px] rounded-[6px] bg-[#1E3BFA] px-[18px] text-[13px] text-white shadow-none hover:bg-[#0F23D9]"
                                            onClick={() => void onRefreshCandidateDetail(selectedCandidateId)}
                                        >
                                            <RotateCcw className="h-4 w-4"/>
                                            {tr.refresh}
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    )}
                    </DialogContent>
                </Dialog>
                </div>
            <Dialog open={departmentReviewDialogOpen} onOpenChange={setDepartmentReviewDialogOpen}>
                <DialogContent aria-describedby={undefined} className={cn(candidateDialogClassName, "sm:max-w-[640px]")}>
                    <DialogHeader className={candidateDialogHeaderClassName}>
                        <DialogTitle>{isZh ? "提交部门评审" : "Submit Department Review"}</DialogTitle>
                    </DialogHeader>
                    <div className={candidateDialogBodyClassName}>
                        <div className="rounded-[6px] bg-[#F7F8FA] px-4 py-3">
                            <p className="text-[13px] font-medium text-[#0E1114]">
                                {candidateDetail?.candidate.name || (isZh ? "当前候选人" : "Current candidate")}
                            </p>
                            <p className="mt-1 text-[11px] text-[#86888F]">
                                {candidateDetail?.candidate.position_title || candidateDetail?.candidate.screened_position_title || (isZh ? "未分配岗位" : "Unassigned")}
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-[12px] font-medium text-[#33353D]">{isZh ? "评审人" : "Reviewers"}</p>
                            <Popover modal open={departmentReviewReviewerPickerOpen} onOpenChange={setDepartmentReviewReviewerPickerOpen}>
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        className="flex min-h-[34px] w-full items-center justify-between rounded-[4px] border border-[#E6E7EB] bg-white px-3 py-2 text-left text-[12px] text-[#33353D] transition hover:border-[#1E3BFA]"
                                    >
                                        <span className={cn("truncate", selectedDepartmentReviewers.length ? "text-[#0E1114] dark:text-[#F7F8FA]" : "text-[#B0B2B8] dark:text-[#86888F]")}>
                                            {selectedDepartmentReviewers.length
                                                ? (isZh ? `已选择 ${selectedDepartmentReviewers.length} 位评审人` : `${selectedDepartmentReviewers.length} reviewers selected`)
                                                : (isZh ? "请选择用人部门评审人" : "Select hiring reviewers")}
                                        </span>
                                        <ChevronDown className="h-4 w-4 shrink-0 text-[#B0B2B8] dark:text-[#86888F]"/>
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="z-[10050] w-[var(--radix-popover-trigger-width)] rounded-[6px] border-[#EBEEF5] bg-white p-0 shadow-[0_8px_24px_rgba(14,17,20,0.12)]">
                                    <div className="border-b border-[#F2F3F5] p-2">
                                        <div className="relative">
                                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B0B2B8]"/>
                                            <Input
                                                value={departmentReviewReviewerQuery}
                                                onChange={(event) => setDepartmentReviewReviewerQuery(event.target.value)}
                                                className="h-8 rounded-[4px] border-[#E6E7EB] pl-8 text-[12px] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-1 focus-visible:ring-[#1E3BFA]"
                                                placeholder={isZh ? "搜索姓名或账号" : "Search name or account"}
                                            />
                                        </div>
                                    </div>
                                    <div className={cn("max-h-64 overflow-y-auto p-1", SMOOTH_VERTICAL_SCROLLBAR_CLASS)}>
                                        {departmentReviewReviewerLoading ? (
                                            <div className="flex items-center justify-center px-3 py-6 text-sm text-[#86888F] dark:text-[#B0B2B8]">
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
                                                            "flex w-full items-center gap-3 rounded-[4px] px-3 py-2 text-left text-[12px] transition",
                                                            selected ? "bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]" : "text-[#33353D] hover:bg-[#F8F8F9]",
                                                        )}
                                                    >
                                                        <span className={cn(
                                                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                                            selected ? "border-[#1E3BFA] bg-[#1E3BFA] text-white" : "border-[#D6D8DD] bg-white",
                                                        )}>
                                                            {selected ? <Check className="h-3 w-3"/> : null}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate font-medium">{displayName}</span>
                                                            <span className="block truncate text-xs text-[#B0B2B8] dark:text-[#86888F]">{reviewer.user_code} · {reviewer.primary_org_code || "-"}</span>
                                                        </span>
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            <div className="px-3 py-6 text-center text-sm text-[#86888F] dark:text-[#B0B2B8]">
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
                                                className="rounded-[4px] border border-[#E6E7EB] bg-[#F8F8F9] px-2 py-1 text-[12px] text-[#0E1114]"
                                                title={isZh ? "点击移除" : "Click to remove"}
                                            >
                                                {reviewer?.name || reviewer?.display_name || userCode}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : null}
                            <p className="text-[11px] text-[#B0B2B8]">
                                {isZh ? "只显示已分配“用人部门评审”角色，或具备部门评审处理权限的账号。" : "Only users with reviewer permission are shown."}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <p className="text-[12px] font-medium text-[#33353D]">{isZh ? "可见内容" : "Visible content"}</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {[
                                    ["original_resume", isZh ? "原始简历" : "Original resume"],
                                    ["standard_resume", isZh ? "标准简历" : "Standard resume"],
                                    ["screening_result", isZh ? "初筛结果" : "Screening result"],
                                    ["assessment_result", isZh ? "测评结果" : "Assessment result"],
                                    ["interview_feedback", isZh ? "面试评价" : "Interview feedback"],
                                    ["attachments", isZh ? "附加资料" : "Attachments"],
                                ].map(([value, label]) => (
                                    <label key={value} className={cn("flex cursor-pointer items-center gap-2 rounded-[6px] border px-3 py-2 text-[12px]", departmentReviewVisibleSections.includes(value) ? "border-[#1E3BFA] bg-[rgba(30,59,250,0.03)] text-[#0E1114]" : "border-[#EBEEF5] bg-white text-[#33353D]")}>
                                        <input
                                            type="checkbox"
                                            className="accent-[#1E3BFA]"
                                            checked={departmentReviewVisibleSections.includes(value)}
                                            onChange={() => toggleDepartmentReviewSection(value)}
                                        />
                                        <span>{label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-[12px] font-medium text-[#33353D]">{isZh ? "评审说明" : "Review note"}</p>
                            <Textarea
                                value={departmentReviewMessage}
                                onChange={(event) => setDepartmentReviewMessage(event.target.value)}
                                rows={3}
                                className="rounded-[4px] border-[#E6E7EB] text-[12px] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-1 focus-visible:ring-[#1E3BFA]"
                                placeholder={isZh ? "例如：请重点评估硬件测试经验、项目复杂度和可面试方向" : "e.g. Please focus on relevant experience and interview direction"}
                            />
                        </div>
                        <div className={candidateDialogFooterClassName}>
                            <Button variant="outline" className={candidateDialogSecondaryButtonClassName} onClick={() => setDepartmentReviewDialogOpen(false)}>
                                {tr.batchBindPositionCancel}
                            </Button>
                            <Button className={candidateDialogPrimaryButtonClassName} disabled={departmentReviewSubmitting || selectedDepartmentReviewers.length === 0} onClick={() => void submitDepartmentReview()}>
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
                modelLabel={candidateAiModelLabel}
                generatedAt={candidateAiGeneratedAt}
                candidateName={candidateDetail?.candidate.name}
            />
            <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
                <DialogContent aria-describedby={undefined} className={cn(candidateDialogClassName, "sm:max-w-[560px]")}>
                    <DialogHeader className={candidateDialogHeaderClassName}>
                        <DialogTitle>{isZh ? "导出候选人" : "Export Candidates"}</DialogTitle>
                    </DialogHeader>
                    <div className={candidateDialogBodyClassName}>
                        <div className="rounded-[6px] bg-[#F7F8FA] px-4 py-3 text-[12px] text-[#33353D]">
                            {isZh ? `将导出 ${selectedCandidateIds.length} 位候选人，可自定义字段，并选择是否打包原始简历。` : `Export ${selectedCandidateIds.length} candidates with custom fields and optional resume files.`}
                        </div>
                        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#33353D]">
                            <input
                                type="checkbox"
                                checked={exportIncludeResumes}
                                onChange={(event) => setExportIncludeResumes(event.target.checked)}
                            />
                            <span>{isZh ? "同时导出原始简历文件" : "Include original resume files"}</span>
                        </label>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-[12px] font-medium text-[#33353D]">{isZh ? "导出字段" : "Export Fields"}</p>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-[26px] rounded-[4px] border-[#E6E7EB] bg-white px-2.5 text-[12px] text-[#33353D] shadow-none hover:border-[#1E3BFA] hover:text-[#1E3BFA]"
                                    onClick={() => setExportFieldKeys(defaultExportFieldKeys)}
                                >
                                    {isZh ? "恢复默认字段" : "Reset Defaults"}
                                </Button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {exportFieldOptions.map((field) => {
                                    const checked = exportFieldKeys.includes(field.key);
                                    return (
                                        <label key={`export-field-${field.key}`} className={cn("flex cursor-pointer items-center gap-2 rounded-[6px] border px-3 py-2 text-[12px]", checked ? "border-[#1E3BFA] bg-[rgba(30,59,250,0.03)] text-[#0E1114]" : "border-[#EBEEF5] bg-white text-[#33353D]")}>
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
                        <div className={candidateDialogFooterClassName}>
                            <Button variant="outline" className={candidateDialogSecondaryButtonClassName} onClick={() => setExportDialogOpen(false)}>
                                {tr.batchBindPositionCancel}
                            </Button>
                            <Button
                                className={candidateDialogPrimaryButtonClassName}
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
                <DialogContent aria-describedby={undefined} className={cn(candidateDialogClassName, "sm:max-w-[460px]")}>
                    <DialogHeader className={candidateDialogHeaderClassName}>
                        <DialogTitle>{tr.batchBindPositionTitle}</DialogTitle>
                    </DialogHeader>
                    <div className={candidateDialogBodyClassName}>
                        <NativeSelect className="h-[34px] rounded-[4px] border-[#E6E7EB] bg-white text-[12px] shadow-none focus-visible:border-[#1E3BFA] focus-visible:ring-1 focus-visible:ring-[#1E3BFA]" value={batchBindPositionId} onChange={(event) => setBatchBindPositionId(event.target.value)}>
                            <option value="">{tr.unassignedPosition}</option>
                            {positions.map((p) => (
                                <option key={p.id} value={String(p.id)}>{p.title}</option>
                            ))}
                        </NativeSelect>
                        <div className={candidateDialogFooterClassName}>
                            <Button variant="outline" className={candidateDialogSecondaryButtonClassName} onClick={() => setBatchBindDialogOpen(false)}>
                                {tr.batchBindPositionCancel}
                            </Button>
                            <Button
                                className={candidateDialogPrimaryButtonClassName}
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
                <DialogContent aria-describedby={undefined} className={cn(candidateDialogClassName, "sm:max-w-[480px]")}>
                    <DialogHeader className={candidateDialogHeaderClassName}>
                        <DialogTitle>{tr.batchUpdateStatusTitle}</DialogTitle>
                    </DialogHeader>
                    <div className={candidateDialogBodyClassName}>
                        <div className="space-y-1.5">
                            <p className="text-[12px] font-medium text-[#33353D]">{tr.batchUpdateStatusLabel}</p>
                            <NativeSelect className="h-[34px] rounded-[4px] border-[#E6E7EB] bg-white text-[12px] shadow-none focus-visible:border-[#1E3BFA] focus-visible:ring-1 focus-visible:ring-[#1E3BFA]" value={batchStatusValue} onChange={(event) => setBatchStatusValue(event.target.value)}>
                                <option value="" disabled>{tr.batchUpdateStatusSelectPlaceholder}</option>
                                {manualCandidateStatusOptions.map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </NativeSelect>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-[12px] font-medium text-[#33353D]">{tr.batchUpdateStatusReason}</p>
                            <Textarea
                                value={batchStatusReason}
                                onChange={(event) => setBatchStatusReason(event.target.value)}
                                rows={3}
                                className="rounded-[4px] border-[#E6E7EB] text-[12px] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-1 focus-visible:ring-[#1E3BFA]"
                                placeholder={tr.batchUpdateStatusReasonPlaceholder}
                            />
                        </div>
                        <div className={candidateDialogFooterClassName}>
                            <Button variant="outline" className={candidateDialogSecondaryButtonClassName} onClick={() => setBatchStatusDialogOpen(false)}>
                                {tr.batchBindPositionCancel}
                            </Button>
                            <Button
                                className={candidateDialogPrimaryButtonClassName}
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
                open={Boolean(nestedDeleteTarget)}
                onOpenChange={(open) => {
                    if (!open && !nestedDeleteSubmitting) {
                        setNestedDeleteTarget(null);
                    }
                }}
            >
                <DialogContent aria-describedby={undefined} className={cn(candidateDialogClassName, "sm:max-w-[420px]")}>
                    <DialogHeader className={candidateDialogHeaderClassName}>
                        <DialogTitle>
                            {nestedDeleteTarget?.kind === "offer"
                                ? (isZh ? "删除 Offer" : "Delete offer")
                                : nestedDeleteTarget?.kind === "follow_up"
                                    ? (isZh ? "删除跟进记录" : "Delete follow-up")
                                    : (isZh ? "删除面试安排" : "Delete interview")}
                        </DialogTitle>
                    </DialogHeader>
                    <div className={candidateDialogBodyClassName}>
                        <div className="rounded-[6px] border border-[rgba(245,63,63,0.18)] bg-[rgba(245,63,63,0.05)] px-4 py-3">
                            <p className="text-[13px] leading-5 text-[#33353D]">
                                {nestedDeleteTarget?.kind === "offer"
                                    ? tr.confirmDeleteOffer
                                    : nestedDeleteTarget?.kind === "follow_up"
                                        ? tr.confirmDeleteFollowUp
                                        : tr.confirmDeleteSchedule}
                            </p>
                            {nestedDeleteTarget?.title ? (
                                <p className="mt-1 truncate text-[12px] text-[#86888F]">{nestedDeleteTarget.title}</p>
                            ) : null}
                        </div>
                        <div className={candidateDialogFooterClassName}>
                            <Button
                                variant="outline"
                                className={candidateDialogSecondaryButtonClassName}
                                disabled={nestedDeleteSubmitting}
                                onClick={() => setNestedDeleteTarget(null)}
                            >
                                {tr.cancel}
                            </Button>
                            <Button
                                className="h-[34px] rounded-[6px] bg-[#F53F3F] px-[18px] text-[13px] text-white shadow-none hover:bg-[#D9363E] disabled:bg-[#F53F3F] disabled:text-white disabled:opacity-50"
                                disabled={nestedDeleteSubmitting}
                                onClick={() => void confirmNestedDelete()}
                            >
                                {nestedDeleteSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4"/>}
                                {isZh ? "确认删除" : "Delete"}
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
                <DialogContent aria-describedby={undefined} className={cn(candidateDialogClassName, "sm:max-w-[420px]")}>
                    <DialogHeader className={candidateDialogHeaderClassName}>
                        <DialogTitle>
                            {pendingStatusOption ? tr.confirmStatusChange(pendingStatusOption[1]) : tr.statusFlow}
                        </DialogTitle>
                    </DialogHeader>
                    <div className={candidateDialogBodyClassName}>
                        <p className="text-[13px] text-[#33353D]">
                            {candidateDetail
                                ? tr.currentStatusLine(labelForCandidateStatus(resolveCandidateDisplayStatus(candidateDetail.candidate)))
                                : null}
                        </p>
                        {statusUpdateReason.trim() ? (
                            <div className="rounded-[6px] border border-[#EBEEF5] bg-[#F7F8FA] px-3 py-2 text-[12px] text-[#33353D]">
                                {statusUpdateReason.trim()}
                            </div>
                        ) : null}
                        <div className={candidateDialogFooterClassName}>
                            <Button
                                size="sm"
                                variant="outline"
                                className={candidateDialogSecondaryButtonClassName}
                                onClick={() => setPendingStatus(null)}
                                disabled={Boolean(statusFlowSubmitting)}
                            >
                                {tr.cancel}
                            </Button>
                            <Button
                                size="sm"
                                className={candidateDialogPrimaryButtonClassName}
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
