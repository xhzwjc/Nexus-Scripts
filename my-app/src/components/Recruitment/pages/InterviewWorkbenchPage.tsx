"use client";

import React from "react";
import {
    Briefcase,
    CalendarCheck,
    CalendarClock,
    Check,
    ChevronRight,
    Clock3,
    Download,
    ExternalLink,
    FileText,
    GraduationCap,
    Loader2,
    Mail,
    MapPin,
    Phone,
    Plus,
    RefreshCw,
    Search,
    Sparkles,
    Trash2,
    UserRound,
    Video,
    X,
} from "lucide-react";

import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {
    recruitmentApi,
    type CandidateDetail,
    type DepartmentReviewReviewerOption,
    type InterviewAvailabilitySlot,
    type InterviewTask,
    type ResumeFile,
} from "@/lib/recruitment-api";
import {authenticatedFetch} from "@/lib/auth";
import {toast} from "@/lib/toast";
import {cn} from "@/lib/utils";
import {useI18n} from "@/lib/i18n";
import {formatActionError, formatDateTime} from "../utils";

type InterviewFilter = "todo" | "today" | "completed" | "cancelled";
type InterviewResult = "passed" | "next_round" | "hold" | "rejected" | "no_show";
type PdfJsModule = typeof import("pdfjs-dist");
type PdfLoadingTask = ReturnType<PdfJsModule["getDocument"]>;
const TIME_OPTION_STEP_MINUTES = 15;
const TIME_OPTION_START_MINUTES = 7 * 60;
const TIME_OPTION_END_MINUTES = 23 * 60 + 59;

type AvailabilityDraftSlot = {
    key: string;
    start_at: string;
    end_at: string;
    notes?: string;
};

type ScheduleFormState = {
    round_name: string;
    round_index: string;
    interviewer_user_code: string;
    interviewer_name: string;
    availability_slot_id: string;
    scheduled_at: string;
    duration_minutes: string;
    location: string;
    meeting_link: string;
    notes: string;
};

type InterviewWorkbenchPageProps = {
    tasks: InterviewTask[];
    counts: {todo: number; today: number; completed: number; cancelled: number};
    loading: boolean;
    activeFilter: InterviewFilter;
    setActiveFilter: (filter: InterviewFilter) => void;
    currentUserCode?: string | null;
    canManageInterview?: boolean;
    canSubmitInterviewResults?: boolean;
    availabilitySlots: InterviewAvailabilitySlot[];
    availabilityLoading: boolean;
    availabilitySaving: boolean;
    onRefresh: () => Promise<void>;
    onSubmitResult: (scheduleId: number, resultStatus: InterviewResult, comment: string) => Promise<void>;
    onCreateSchedule?: (payload: {
        candidate_id: number;
        round_name?: string;
        round_index?: number;
        interviewer_user_code?: string;
        interviewer_name?: string;
        scheduled_at?: string;
        duration_minutes?: number;
        location?: string;
        meeting_link?: string;
        notes?: string;
        availability_slot_id?: number;
        department_review_assignment_id?: number;
    }) => Promise<unknown>;
    onSaveAvailability: (slots: Array<{start_at: string; end_at: string; notes?: string}>) => Promise<void>;
};

function toLocalInputValue(value?: string | null) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
    const pad = (num: number) => String(num).padStart(2, "0");
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
    ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeInputDate(value: string) {
    return value ? new Date(value).toISOString() : "";
}

function formatLocalDateValue(date: Date) {
    const pad = (num: number) => String(num).padStart(2, "0");
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
    return isZh ? `${value} ${weekday}` : `${value} ${weekday}`;
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

function formatTimeValue(minutes: number) {
    const normalized = Math.max(0, minutes);
    const hours = Math.floor(normalized / 60);
    const rest = normalized % 60;
    return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
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

function TimeSelect({
    value,
    options,
    placeholder,
    disabled,
    onChange,
    formatOption,
    className,
}: {
    value: string;
    options: string[];
    placeholder: string;
    disabled?: boolean;
    onChange: (value: string) => void;
    formatOption?: (value: string) => React.ReactNode;
    className?: string;
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
                    "flex h-9 w-full items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-2.5 text-left text-sm outline-none transition hover:border-blue-200 focus:border-[#3B5BDB]",
                    value ? "text-slate-800" : "text-slate-400",
                    disabled ? "cursor-not-allowed text-slate-300 hover:border-gray-100" : "",
                )}
            >
                <span>{value || placeholder}</span>
                <Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-300"/>
            </button>
            {open && !disabled ? (
                <div className="absolute left-0 top-[calc(100%+4px)] z-30 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-100 bg-white py-1 shadow-xl">
                    {options.map((time) => (
                        <button
                            key={time}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                                onChange(time);
                                setOpen(false);
                            }}
                            className={cn(
                                "flex h-8 w-full items-center px-3 text-left text-sm transition",
                                time === value ? "bg-blue-50 text-[#3B5BDB]" : "text-slate-700 hover:bg-gray-50",
                            )}
                        >
                            {formatOption ? formatOption(time) : time}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function createDraftSlot(): AvailabilityDraftSlot {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return {
        key: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        start_at: toLocalInputValue(start.toISOString()),
        end_at: toLocalInputValue(end.toISOString()),
    };
}

function createScheduleForm(roundIndex = 1): ScheduleFormState {
    return {
        round_name: roundIndex <= 1 ? "初试" : `第 ${roundIndex} 轮面试`,
        round_index: String(roundIndex),
        interviewer_user_code: "",
        interviewer_name: "",
        availability_slot_id: "",
        scheduled_at: "",
        duration_minutes: "60",
        location: "",
        meeting_link: "",
        notes: "",
    };
}

function formatRange(start?: string | null, end?: string | null) {
    if (!start && !end) return "-";
    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;
    const dateFormatter = new Intl.DateTimeFormat("zh-CN", {month: "2-digit", day: "2-digit", weekday: "short"});
    const timeFormatter = new Intl.DateTimeFormat("zh-CN", {hour: "2-digit", minute: "2-digit", hour12: false});
    if (startDate && !Number.isNaN(startDate.getTime()) && endDate && !Number.isNaN(endDate.getTime())) {
        const sameDay = startDate.toDateString() === endDate.toDateString();
        return sameDay
            ? `${dateFormatter.format(startDate)} ${timeFormatter.format(startDate)}-${timeFormatter.format(endDate)}`
            : `${dateFormatter.format(startDate)} ${timeFormatter.format(startDate)} - ${dateFormatter.format(endDate)} ${timeFormatter.format(endDate)}`;
    }
    return formatDateTime(start || end || "") || "-";
}

function candidateTitle(task: InterviewTask, isZh: boolean) {
    return task.position?.title || task.candidate.position_title || (isZh ? "未分配岗位" : "Unassigned");
}

function labelForScheduleStatus(status?: string | null, isZh = true) {
    switch (status) {
        case "needs_scheduling":
            return isZh ? "待安排" : "Needs scheduling";
        case "scheduled":
            return isZh ? "待面试" : "Scheduled";
        case "confirmed":
            return isZh ? "已确认" : "Confirmed";
        case "in_progress":
            return isZh ? "进行中" : "In progress";
        case "completed":
            return isZh ? "已完成" : "Completed";
        case "cancelled":
            return isZh ? "已取消" : "Cancelled";
        case "no_show":
            return isZh ? "未到场" : "No show";
        default:
            return status || (isZh ? "未定" : "Unset");
    }
}

function scheduleBadgeClass(status?: string | null) {
    switch (status) {
        case "needs_scheduling":
            return "border-blue-200 bg-blue-50 text-blue-700";
        case "completed":
            return "border-emerald-200 bg-emerald-50 text-emerald-700";
        case "cancelled":
            return "border-slate-200 bg-slate-50 text-slate-500";
        case "no_show":
            return "border-amber-200 bg-amber-50 text-amber-700";
        case "in_progress":
            return "border-blue-200 bg-blue-50 text-blue-700";
        default:
            return "border-amber-200 bg-amber-50 text-amber-700";
    }
}

function reviewerLabel(reviewer: DepartmentReviewReviewerOption) {
    return reviewer.display_name || reviewer.name || reviewer.user_code;
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

function firstStructuredRecord(value: unknown): Record<string, unknown> | null {
    if (!Array.isArray(value)) {
        return null;
    }
    const item = value.find((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
    return item ? item as Record<string, unknown> : null;
}

function formatBytes(value?: number | null) {
    if (!value || value <= 0) return "";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function isPdfResume(file?: ResumeFile | null, blob?: Blob | null) {
    const ext = String(file?.file_ext || "").toLowerCase();
    const mime = String(file?.mime_type || blob?.type || "").toLowerCase();
    return ext.includes("pdf") || mime.includes("pdf");
}

function InterviewResumePdfPreview({
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
            const pageHostWidth = Math.max(320, Math.min(hostWidth - 8, 820));
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
                    "flex justify-center bg-white py-5",
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
            <div ref={hostRef} aria-label={fileName} className="mx-auto min-h-full w-full bg-white px-4 py-5"/>
        </div>
    );
}

export function InterviewWorkbenchPage({
    tasks,
    counts,
    loading,
    activeFilter,
    setActiveFilter,
    currentUserCode,
    canManageInterview = false,
    canSubmitInterviewResults = true,
    availabilitySlots,
    availabilityLoading,
    availabilitySaving,
    onRefresh,
    onSubmitResult,
    onCreateSchedule,
    onSaveAvailability,
}: InterviewWorkbenchPageProps) {
    const {language} = useI18n();
    const isZh = language !== "en-US";
    const [query, setQuery] = React.useState("");
    const [positionFilter, setPositionFilter] = React.useState("all");
    const [resultFilter, setResultFilter] = React.useState("all");
    const [selectedTask, setSelectedTask] = React.useState<InterviewTask | null>(null);
    const [selectedCandidateDetail, setSelectedCandidateDetail] = React.useState<CandidateDetail | null>(null);
    const [selectedCandidateDetailLoading, setSelectedCandidateDetailLoading] = React.useState(false);
    const [selectedCandidateDetailError, setSelectedCandidateDetailError] = React.useState<string | null>(null);
    const [selectedResumeFileId, setSelectedResumeFileId] = React.useState<number | null>(null);
    const [resumePreviewBlob, setResumePreviewBlob] = React.useState<Blob | null>(null);
    const [resumePreviewUrl, setResumePreviewUrl] = React.useState<string | null>(null);
    const [resumePreviewLoading, setResumePreviewLoading] = React.useState(false);
    const [resumePreviewReady, setResumePreviewReady] = React.useState(false);
    const [resumePreviewError, setResumePreviewError] = React.useState<string | null>(null);
    const [scheduleTask, setScheduleTask] = React.useState<InterviewTask | null>(null);
    const [scheduleForm, setScheduleForm] = React.useState<ScheduleFormState>(() => createScheduleForm());
    const [scheduleDatePickerOpen, setScheduleDatePickerOpen] = React.useState(false);
    const [interviewerOptions, setInterviewerOptions] = React.useState<DepartmentReviewReviewerOption[]>([]);
    const [interviewerLoading, setInterviewerLoading] = React.useState(false);
    const [scheduleSlots, setScheduleSlots] = React.useState<InterviewAvailabilitySlot[]>([]);
    const [scheduleSlotsLoading, setScheduleSlotsLoading] = React.useState(false);
    const [scheduleSaving, setScheduleSaving] = React.useState(false);
    const [commentBySchedule, setCommentBySchedule] = React.useState<Record<number, string>>({});
    const [submittingKey, setSubmittingKey] = React.useState<string | null>(null);
    const [draftSlots, setDraftSlots] = React.useState<AvailabilityDraftSlot[]>([]);
    const normalizedCurrentUserCode = React.useMemo(() => String(currentUserCode || "").trim(), [currentUserCode]);
    const showAvailabilityEditor = canSubmitInterviewResults && !canManageInterview;

    React.useEffect(() => {
        const editable = availabilitySlots
            .filter((slot) => slot.status === "available")
            .map((slot) => ({
                key: String(slot.id),
                start_at: toLocalInputValue(slot.start_at),
                end_at: toLocalInputValue(slot.end_at),
                notes: slot.notes || "",
            }));
        setDraftSlots(editable.length ? editable : [createDraftSlot()]);
    }, [availabilitySlots]);

    const tabs = React.useMemo(() => [
        {key: "todo" as const, label: isZh ? "待面试" : "To interview", count: counts.todo},
        {key: "today" as const, label: isZh ? "今日面试" : "Today", count: counts.today},
        {key: "completed" as const, label: isZh ? "已完成" : "Completed", count: counts.completed},
        {key: "cancelled" as const, label: isZh ? "已取消" : "Cancelled", count: counts.cancelled},
    ], [counts.cancelled, counts.completed, counts.today, counts.todo, isZh]);

    const positionOptions = React.useMemo(() => {
        const values = Array.from(new Set(tasks.map((task) => candidateTitle(task, isZh)).filter(Boolean)));
        return values;
    }, [isZh, tasks]);

    const visibleTasks = React.useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return tasks.filter((task) => {
            const schedule = task.schedule;
            const candidate = task.candidate;
            const positionTitle = candidateTitle(task, isZh);
            if (positionFilter !== "all" && positionTitle !== positionFilter) return false;
            if (resultFilter !== "all" && (schedule?.result_status || "none") !== resultFilter) return false;
            if (!normalizedQuery) return true;
            return [
                candidate.name,
                candidate.phone,
                candidate.email,
                candidate.candidate_code,
                positionTitle,
                schedule?.round_name,
                schedule?.interviewer_name,
                schedule?.interviewer_user_code,
            ].some((item) => String(item || "").toLowerCase().includes(normalizedQuery));
        });
    }, [isZh, positionFilter, query, resultFilter, tasks]);

    const bookedSlots = availabilitySlots.filter((slot) => slot.status === "booked");

    React.useEffect(() => {
        if (!selectedTask) {
            setSelectedCandidateDetail(null);
            setSelectedCandidateDetailLoading(false);
            setSelectedCandidateDetailError(null);
            setSelectedResumeFileId(null);
            return;
        }

        const abortController = new AbortController();
        setSelectedCandidateDetail(null);
        setSelectedCandidateDetailLoading(true);
        setSelectedCandidateDetailError(null);
        setSelectedResumeFileId(null);

        const detailPath = canManageInterview
            ? `/candidates/${selectedTask.candidate.id}`
            : `/interviews/candidates/${selectedTask.candidate.id}`;
        void recruitmentApi<CandidateDetail>(detailPath, {
            signal: abortController.signal,
        })
            .then((detail) => {
                if (abortController.signal.aborted) return;
                setSelectedCandidateDetail(detail);
            })
            .catch((error) => {
                if (abortController.signal.aborted) return;
                setSelectedCandidateDetailError(formatActionError(error));
            })
            .finally(() => {
                if (!abortController.signal.aborted) {
                    setSelectedCandidateDetailLoading(false);
                }
            });

        return () => abortController.abort();
    }, [canManageInterview, selectedTask]);

    const selectedResumeFiles = React.useMemo(() => (
        selectedCandidateDetail?.resume_files || []
    ), [selectedCandidateDetail?.resume_files]);

    React.useEffect(() => {
        if (!selectedTask || !selectedResumeFiles.length) {
            setSelectedResumeFileId(null);
            return;
        }

        setSelectedResumeFileId((current) => {
            if (current != null && selectedResumeFiles.some((file) => file.id === current)) {
                return current;
            }
            const latestId = selectedCandidateDetail?.candidate.latest_resume_file_id || selectedTask.candidate.latest_resume_file_id;
            const latestFile = latestId ? selectedResumeFiles.find((file) => file.id === latestId) : null;
            return (latestFile || selectedResumeFiles[0]).id;
        });
    }, [selectedCandidateDetail?.candidate.latest_resume_file_id, selectedResumeFiles, selectedTask]);

    const selectedResumeFile = React.useMemo(() => {
        if (!selectedResumeFiles.length) return null;
        if (selectedResumeFileId == null) return selectedResumeFiles[0];
        return selectedResumeFiles.find((file) => file.id === selectedResumeFileId) || selectedResumeFiles[0];
    }, [selectedResumeFileId, selectedResumeFiles]);

    React.useEffect(() => {
        let objectUrl: string | null = null;
        const abortController = new AbortController();

        setResumePreviewBlob(null);
        setResumePreviewUrl(null);
        setResumePreviewLoading(false);
        setResumePreviewReady(false);
        setResumePreviewError(null);

        if (!selectedTask || !selectedResumeFile) {
            return () => undefined;
        }

        setResumePreviewLoading(true);
        const downloadPath = canManageInterview
            ? `/api/recruitment/resume-files/${selectedResumeFile.id}/download`
            : `/api/recruitment/interviews/resume-files/${selectedResumeFile.id}/download`;
        void authenticatedFetch(downloadPath, {
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
                if (abortController.signal.aborted) return;
                objectUrl = URL.createObjectURL(blob);
                setResumePreviewBlob(blob);
                setResumePreviewUrl(objectUrl);
                setResumePreviewLoading(false);
            })
            .catch((error) => {
                if (abortController.signal.aborted) return;
                setResumePreviewBlob(null);
                setResumePreviewUrl(null);
                setResumePreviewLoading(false);
                setResumePreviewReady(false);
                setResumePreviewError(formatActionError(error));
            });

        return () => {
            abortController.abort();
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [canManageInterview, selectedResumeFile, selectedTask]);

    const openTaskDetail = React.useCallback((task: InterviewTask) => {
        setScheduleTask(null);
        setSelectedTask(task);
    }, []);

    const closeTaskDetail = React.useCallback(() => {
        setSelectedTask(null);
    }, []);

    const canSubmitTaskResult = React.useCallback((task: InterviewTask) => {
        const schedule = task.schedule;
        if (!schedule) return false;
        const assignedUserCode = String(schedule.interviewer_user_code || "").trim();
        if (!canSubmitInterviewResults || schedule.status === "completed" || schedule.status === "cancelled" || schedule.status === "no_show") {
            return false;
        }
        return !assignedUserCode || assignedUserCode === normalizedCurrentUserCode;
    }, [canSubmitInterviewResults, normalizedCurrentUserCode]);

    const resultLockMessage = React.useCallback((task: InterviewTask) => {
        const schedule = task.schedule;
        if (!schedule) return isZh ? "等待招聘人事安排面试时间" : "Waiting for HR to schedule";
        const assignedUserCode = String(schedule.interviewer_user_code || "").trim();
        const interviewerName = schedule.interviewer_name || assignedUserCode;
        if (schedule.status === "completed" || schedule.status === "no_show") {
            return isZh ? "面试结果已提交" : "Interview result submitted";
        }
        if (schedule.status === "cancelled") {
            return isZh ? "该面试已取消" : "This interview is cancelled.";
        }
        if (!canSubmitInterviewResults) {
            return isZh ? "仅面试官可提交面试结果" : "Only interviewers can submit results.";
        }
        if (assignedUserCode && assignedUserCode !== normalizedCurrentUserCode) {
            return isZh ? `等待 ${interviewerName || "面试官"} 提交结果` : `Waiting for ${interviewerName || "interviewer"} to submit`;
        }
        return "";
    }, [canSubmitInterviewResults, isZh, normalizedCurrentUserCode]);

    const submitResult = async (task: InterviewTask, result: InterviewResult) => {
        if (!task.schedule || !canSubmitTaskResult(task)) return;
        const scheduleId = task.schedule.id;
        const key = `${scheduleId}:${result}`;
        setSubmittingKey(key);
        try {
            await onSubmitResult(scheduleId, result, commentBySchedule[scheduleId] || "");
            setCommentBySchedule((current) => ({...current, [scheduleId]: ""}));
        } catch (error) {
            toast.error(isZh ? `提交面试结果失败：${formatActionError(error)}` : `Failed to submit interview result: ${formatActionError(error)}`);
        } finally {
            setSubmittingKey(null);
        }
    };

    const loadInterviewers = React.useCallback(async (orgCode?: string | null) => {
        const params = new URLSearchParams({limit: "200"});
        if (orgCode) params.set("org_code", orgCode);
        setInterviewerLoading(true);
        try {
            const data = await recruitmentApi<DepartmentReviewReviewerOption[]>(`/interviews/interviewers?${params.toString()}`);
            setInterviewerOptions(data || []);
        } catch (error) {
            setInterviewerOptions([]);
            toast.error(isZh ? `加载面试官失败：${formatActionError(error)}` : `Failed to load interviewers: ${formatActionError(error)}`);
        } finally {
            setInterviewerLoading(false);
        }
    }, [isZh]);

    const loadScheduleSlots = React.useCallback(async (userCode: string) => {
        const normalized = userCode.trim();
        if (!normalized) {
            setScheduleSlots([]);
            return;
        }
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
        const params = new URLSearchParams({
            user_codes: normalized,
            start_at: start.toISOString(),
            end_at: end.toISOString(),
        });
        setScheduleSlotsLoading(true);
        try {
            const data = await recruitmentApi<{items: InterviewAvailabilitySlot[]}>(`/interview-availability?${params.toString()}`);
            setScheduleSlots((data?.items || []).filter((slot) => slot.status === "available"));
        } catch (error) {
            setScheduleSlots([]);
            toast.error(isZh ? `加载面试官可用时间失败：${formatActionError(error)}` : `Failed to load availability: ${formatActionError(error)}`);
        } finally {
            setScheduleSlotsLoading(false);
        }
    }, [isZh]);

    const openScheduleDrawer = React.useCallback((task: InterviewTask) => {
        const nextRoundIndex = Math.max(1, Number(task.schedule?.round_index || 0) + (task.schedule ? 1 : 0));
        setScheduleTask(task);
        setSelectedTask(null);
        setScheduleForm(createScheduleForm(nextRoundIndex));
        setScheduleDatePickerOpen(false);
        setScheduleSlots([]);
        void loadInterviewers(task.candidate.org_code);
    }, [loadInterviewers]);

    const applyScheduleSlot = React.useCallback((slotId: string) => {
        const slot = scheduleSlots.find((item) => String(item.id) === slotId);
        setScheduleForm((current) => {
            if (!slot) return {...current, availability_slot_id: slotId};
            const start = slot.start_at ? new Date(slot.start_at) : null;
            const end = slot.end_at ? new Date(slot.end_at) : null;
            const duration = start && end && Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
                ? Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000))
                : Number(current.duration_minutes || 60);
            return {
                ...current,
                availability_slot_id: slotId,
                scheduled_at: toLocalInputValue(slot.start_at),
                duration_minutes: String(duration),
            };
        });
        setScheduleDatePickerOpen(false);
    }, [scheduleSlots]);

    const selectedInterviewer = React.useMemo(() => (
        interviewerOptions.find((item) => item.user_code === scheduleForm.interviewer_user_code)
    ), [interviewerOptions, scheduleForm.interviewer_user_code]);

    React.useEffect(() => {
        if (!scheduleTask) return;
        void loadScheduleSlots(scheduleForm.interviewer_user_code);
    }, [loadScheduleSlots, scheduleForm.interviewer_user_code, scheduleTask]);

    const saveAvailability = async () => {
        const normalized = draftSlots
            .map((slot) => ({
                start_at: normalizeInputDate(slot.start_at),
                end_at: normalizeInputDate(slot.end_at),
                notes: slot.notes?.trim() || undefined,
            }))
            .filter((slot) => slot.start_at && slot.end_at);
        await onSaveAvailability(normalized);
    };

    const submitSchedule = async () => {
        if (!scheduleTask || !onCreateSchedule) return;
        if (!scheduleForm.interviewer_user_code || !scheduleForm.scheduled_at || Number(scheduleForm.duration_minutes || 0) <= 0) {
            toast.error(isZh ? "请选择面试官、时间和面试时长" : "Select interviewer, time, and duration.");
            return;
        }
        setScheduleSaving(true);
        try {
            await onCreateSchedule({
                candidate_id: scheduleTask.candidate.id,
                round_name: scheduleForm.round_name || undefined,
                round_index: scheduleForm.round_index ? Number(scheduleForm.round_index) : undefined,
                interviewer_user_code: scheduleForm.interviewer_user_code,
                interviewer_name: scheduleForm.interviewer_name || (selectedInterviewer ? reviewerLabel(selectedInterviewer) : undefined),
                scheduled_at: scheduleForm.scheduled_at ? new Date(scheduleForm.scheduled_at).toISOString() : undefined,
                duration_minutes: scheduleForm.duration_minutes ? Number(scheduleForm.duration_minutes) : undefined,
                availability_slot_id: scheduleForm.availability_slot_id ? Number(scheduleForm.availability_slot_id) : undefined,
                location: scheduleForm.location.trim() || undefined,
                meeting_link: scheduleForm.meeting_link.trim() || undefined,
                notes: scheduleForm.notes.trim() || undefined,
                department_review_assignment_id: scheduleTask.schedule?.department_review_assignment_id || undefined,
            });
            setScheduleTask(null);
            await onRefresh();
        } catch (error) {
            toast.error(isZh ? `安排面试失败：${formatActionError(error)}` : `Failed to schedule interview: ${formatActionError(error)}`);
        } finally {
            setScheduleSaving(false);
        }
    };

    const clearFilters = () => {
        setPositionFilter("all");
        setResultFilter("all");
        setQuery("");
    };

    const renderResultActions = (task: InterviewTask, compact = false) => {
        const schedule = task.schedule;
        if (!schedule) return null;
        const canSubmitResult = canSubmitTaskResult(task);
        return (
            <div className={cn("flex flex-wrap justify-end gap-1.5", compact && "justify-start")}>
                {([
                    ["passed", isZh ? "通过" : "Pass", "border-emerald-200 text-emerald-700 hover:bg-emerald-50"],
                    ["next_round", isZh ? "下一轮" : "Next", "border-blue-200 text-blue-700 hover:bg-blue-50"],
                    ["hold", isZh ? "暂缓" : "Hold", "border-amber-200 text-amber-700 hover:bg-amber-50"],
                    ["no_show", isZh ? "未到场" : "No show", "border-slate-200 text-slate-600 hover:bg-slate-50"],
                    ["rejected", isZh ? "淘汰" : "Reject", "border-rose-200 text-rose-700 hover:bg-rose-50"],
                ] as const).map(([result, label, className]) => {
                    const loadingKey = submittingKey === `${schedule.id}:${result}`;
                    return (
                        <Button
                            key={result}
                            variant="outline"
                            size="sm"
                            disabled={Boolean(submittingKey) || !canSubmitResult}
                            className={cn("h-7 rounded-md px-2 text-xs", className)}
                            onClick={() => void submitResult(task, result)}
                        >
                            {loadingKey ? <Loader2 className="h-3 w-3 animate-spin"/> : null}
                            {label}
                        </Button>
                    );
                })}
            </div>
        );
    };

    const selectedDetailCandidate = selectedCandidateDetail?.candidate || selectedTask?.candidate || null;
    const selectedParseResult = selectedCandidateDetail?.parse_result || null;
    const selectedScore = selectedCandidateDetail?.score || null;
    const selectedBasicInfo = selectedParseResult?.basic_info || null;
    const selectedEducation = firstStructuredRecord(selectedParseResult?.education_experiences);
    const selectedWork = firstStructuredRecord(selectedParseResult?.work_experiences);
    const selectedSkills = Array.isArray(selectedParseResult?.skills)
        ? selectedParseResult.skills
            .map((item) => (typeof item === "string" || typeof item === "number" ? String(item).trim() : readStructuredText(item, ["name", "skill", "技能"])))
            .filter((item): item is string => Boolean(item))
        : [];
    const selectedHighlights = [
        ...(Array.isArray(selectedScore?.advantages) ? selectedScore.advantages : []),
        selectedScore?.recommendation || null,
        selectedParseResult?.summary || null,
    ].filter((item): item is string => Boolean(String(item || "").trim())).slice(0, 3);
    const selectedConcerns = Array.isArray(selectedScore?.concerns) ? selectedScore.concerns.filter(Boolean).slice(0, 2) : [];
    const selectedResumeIsPdf = isPdfResume(selectedResumeFile, resumePreviewBlob);
    const selectedResumeRawText = selectedParseResult?.raw_text || "";
    const scheduleDateOptions = React.useMemo(() => buildDateOptions(35), []);
    const scheduleToday = todayDateValue();
    const scheduleDateTime = localDateTimeParts(scheduleForm.scheduled_at);
    const scheduleDatePart = scheduleDateTime.date;
    const scheduleStartTimePart = scheduleDateTime.time;
    const scheduleStartMinutes = timeToMinutes(scheduleStartTimePart);
    const scheduleDurationMinutes = Math.max(15, Number(scheduleForm.duration_minutes || 60));
    const scheduleEndMinutes = scheduleStartMinutes == null
        ? null
        : Math.min(TIME_OPTION_END_MINUTES, scheduleStartMinutes + scheduleDurationMinutes);
    const scheduleEndTimePart = scheduleStartMinutes == null || scheduleEndMinutes == null || scheduleEndMinutes <= scheduleStartMinutes
        ? ""
        : formatTimeValue(scheduleEndMinutes);
    const effectiveScheduleDurationMinutes = scheduleStartMinutes == null || scheduleEndMinutes == null
        ? scheduleDurationMinutes
        : Math.max(0, scheduleEndMinutes - scheduleStartMinutes);
    const scheduleEndTimeOptions = INTERVIEW_END_TIME_OPTIONS.filter((time) => {
        const minutes = timeToMinutes(time);
        return scheduleStartMinutes == null || (minutes != null && minutes > scheduleStartMinutes);
    });
    const scheduleStartTimeOptions = scheduleStartTimePart && !INTERVIEW_START_TIME_OPTIONS.includes(scheduleStartTimePart)
        ? [...INTERVIEW_START_TIME_OPTIONS, scheduleStartTimePart].sort((a, b) => (timeToMinutes(a) || 0) - (timeToMinutes(b) || 0))
        : INTERVIEW_START_TIME_OPTIONS;
    const scheduleEndTimeSelectOptions = scheduleEndTimePart && !scheduleEndTimeOptions.includes(scheduleEndTimePart)
        ? [...scheduleEndTimeOptions, scheduleEndTimePart].sort((a, b) => (timeToMinutes(a) || 0) - (timeToMinutes(b) || 0))
        : scheduleEndTimeOptions;

    return (
        <div className="flex h-full min-h-0 flex-col bg-gray-50 px-5 py-4 text-slate-800">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-gray-100">
                    {tabs.map((tab) => {
                        const active = activeFilter === tab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveFilter(tab.key)}
                                className={cn(
                                    "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm transition",
                                    active ? "bg-slate-950 text-white shadow-sm" : "text-slate-500 hover:bg-gray-50 hover:text-slate-800",
                                )}
                            >
                                {active && tab.key === "todo" ? <CalendarCheck className="h-4 w-4"/> : null}
                                <span>{tab.label}</span>
                                <span className={cn("rounded-full px-1.5 py-0.5 text-xs", active ? "bg-white/15 text-white" : "bg-gray-100 text-slate-400")}>
                                    {tab.count}
                                </span>
                            </button>
                        );
                    })}
                </div>
                <div className="flex min-w-[320px] items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm">
                    <Search className="h-4 w-4 text-slate-300"/>
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={isZh ? "搜索候选人、岗位、联系方式" : "Search candidate, position, contact"}
                        className="h-6 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                    />
                    {query ? (
                        <button type="button" onClick={() => setQuery("")} className="text-slate-300 hover:text-slate-500">
                            <X className="h-4 w-4"/>
                        </button>
                    ) : null}
                </div>
            </div>

            <div className={cn("grid min-h-0 flex-1 gap-4", showAvailabilityEditor ? "grid-cols-[minmax(0,1fr)_360px]" : "grid-cols-1")}>
                <section className="flex min-h-0 flex-col rounded-xl border border-gray-100 bg-white shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                value={positionFilter}
                                onChange={(event) => setPositionFilter(event.target.value)}
                                className="h-8 rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-xs text-slate-600 outline-none hover:border-gray-300"
                            >
                                <option value="all">{isZh ? "全部岗位" : "All positions"}</option>
                                {positionOptions.map((position) => (
                                    <option key={position} value={position}>{position}</option>
                                ))}
                            </select>
                            <select
                                value={resultFilter}
                                onChange={(event) => setResultFilter(event.target.value)}
                                className="h-8 rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-xs text-slate-600 outline-none hover:border-gray-300"
                            >
                                <option value="all">{isZh ? "全部结果" : "All results"}</option>
                                <option value="passed">{isZh ? "已通过" : "Passed"}</option>
                                <option value="next_round">{isZh ? "下一轮" : "Next round"}</option>
                                <option value="hold">{isZh ? "暂缓" : "Hold"}</option>
                                <option value="rejected">{isZh ? "已淘汰" : "Rejected"}</option>
                                <option value="no_show">{isZh ? "未到场" : "No show"}</option>
                            </select>
                            {(positionFilter !== "all" || resultFilter !== "all" || query) ? (
                                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-[#3B5BDB]" onClick={clearFilters}>
                                    {isZh ? "清空筛选" : "Clear"}
                                </Button>
                            ) : null}
                            <span className="text-xs text-slate-400">
                                {isZh ? `显示 ${visibleTasks.length} / ${tasks.length}` : `${visibleTasks.length} / ${tasks.length}`}
                            </span>
                        </div>
                        <Button variant="outline" size="sm" className="h-8 rounded-lg px-2.5 text-xs" onClick={() => void onRefresh()}>
                            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <RefreshCw className="h-3.5 w-3.5"/>}
                            {isZh ? "刷新" : "Refresh"}
                        </Button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto">
                        {loading ? (
                            <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-slate-400">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                                {isZh ? "正在加载面试任务" : "Loading interviews"}
                            </div>
                        ) : visibleTasks.length === 0 ? (
                            <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 text-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                                    <Check className="h-5 w-5 text-[#3B5BDB]"/>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-800">{isZh ? "暂无面试任务" : "No interview tasks"}</p>
                                    <p className="mt-1 text-xs text-slate-400">{isZh ? "当前筛选条件下没有需要处理的面试" : "No interviews match the current filters."}</p>
                                </div>
                                {(positionFilter !== "all" || resultFilter !== "all" || query) ? (
                                    <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs text-[#3B5BDB]" onClick={clearFilters}>
                                        {isZh ? "清空筛选，查看全部" : "Clear filters"}
                                    </Button>
                                ) : null}
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {visibleTasks.map((task) => {
                                    const schedule = task.schedule;
                                    const candidate = task.candidate;
                                    const positionTitle = candidateTitle(task, isZh);
                                    const canSubmitResult = canSubmitTaskResult(task);
                                    const lockMessage = canSubmitResult ? "" : resultLockMessage(task);
                                    const interviewerName = schedule?.interviewer_name || schedule?.interviewer_user_code || (isZh ? "未指定面试官" : "No interviewer");
                                    const commentValue = canSubmitResult
                                        ? (commentBySchedule[schedule?.id || 0] || "")
                                        : (schedule?.result_comment || "");
                                    return (
                                        <article key={schedule?.id ? `schedule-${schedule.id}` : `candidate-${candidate.id}`} className="px-4 py-3 transition hover:bg-gray-50/70">
                                            <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-4">
                                                <button type="button" onClick={() => openTaskDetail(task)} className="min-w-0 text-left">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-base font-semibold text-slate-950">{candidate.name || (isZh ? "未命名候选人" : "Unnamed")}</span>
                                                        <span className="text-xs text-slate-400">{candidate.age ? `${candidate.age}${isZh ? "岁" : ""}` : null}</span>
                                                        <span className="text-xs text-slate-400">{candidate.education || "-"}</span>
                                                        <Badge variant="outline" className={cn("h-6 rounded-md", scheduleBadgeClass(schedule?.status || "needs_scheduling"))}>
                                                            {labelForScheduleStatus(schedule?.status || "needs_scheduling", isZh)}
                                                        </Badge>
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                                                        <span>{positionTitle}</span>
                                                        <span className="text-slate-300">|</span>
                                                        <span>{schedule?.round_name || (isZh ? "待安排面试" : "Interview to schedule")}</span>
                                                        <span className="text-slate-300">|</span>
                                                        <span>{isZh ? "面试官" : "Interviewer"}：{interviewerName}</span>
                                                        <span className="text-slate-300">|</span>
                                                        <Clock3 className="h-3.5 w-3.5 text-slate-300"/>
                                                        <span>{formatDateTime(schedule?.scheduled_at) || (isZh ? "时间待定" : "Time TBD")}</span>
                                                    </div>
                                                    {schedule?.notes ? (
                                                        <p className="mt-2 line-clamp-2 text-xs text-slate-500">{schedule.notes}</p>
                                                    ) : null}
                                                </button>
                                                <div className="space-y-2">
                                                    {!schedule ? (
                                                        <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-3 text-right">
                                                            <p className="text-left text-xs leading-5 text-blue-700">
                                                                {isZh ? "该候选人已进入面试阶段，尚未安排面试官和时间。" : "This candidate is ready for interview but has not been scheduled yet."}
                                                            </p>
                                                            {canManageInterview ? (
                                                                <Button
                                                                    size="sm"
                                                                    className="mt-3 h-8 rounded-md bg-[#3B5BDB] px-3 text-xs text-white hover:bg-[#2f49bd]"
                                                                    onClick={() => openScheduleDrawer(task)}
                                                                >
                                                                    {isZh ? "安排面试" : "Schedule interview"}
                                                                </Button>
                                                            ) : null}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <Textarea
                                                                value={commentValue}
                                                                onChange={(event) => setCommentBySchedule((current) => ({...current, [schedule.id]: event.target.value}))}
                                                                disabled={!canSubmitResult}
                                                                placeholder={lockMessage || (isZh ? "填写面试结论、风险点或下一轮建议" : "Add conclusion, risks, or next-round suggestions")}
                                                                className={cn(
                                                                    "min-h-[62px] resize-none rounded-lg border-gray-100 bg-gray-50 text-xs shadow-none",
                                                                    !canSubmitResult && "cursor-default text-slate-500 opacity-100",
                                                                )}
                                                            />
                                                            {lockMessage ? <p className="text-right text-xs text-slate-400">{lockMessage}</p> : null}
                                                            {renderResultActions(task)}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>

                {showAvailabilityEditor ? (
                    <aside className="flex min-h-0 flex-col gap-4 overflow-auto">
                        <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">{isZh ? "我的可面试时间" : "My availability"}</p>
                                    <p className="mt-1 text-xs text-slate-400">{isZh ? "招聘人事排期时会优先选择这些时间段" : "HR can schedule interviews in these slots."}</p>
                                </div>
                                <Button variant="outline" size="sm" className="h-8 rounded-lg px-2.5 text-xs" onClick={() => setDraftSlots((current) => [...current, createDraftSlot()])}>
                                    <Plus className="h-3.5 w-3.5"/>
                                    {isZh ? "添加" : "Add"}
                                </Button>
                            </div>
                            <div className="mt-4 space-y-2">
                                {draftSlots.map((slot, index) => (
                                    <div key={slot.key} className="rounded-lg border border-gray-100 bg-gray-50 p-2">
                                        <div className="mb-1.5 flex items-center justify-between">
                                            <span className="text-xs font-medium text-slate-600">{formatRange(normalizeInputDate(slot.start_at), normalizeInputDate(slot.end_at))}</span>
                                            <button
                                                type="button"
                                                className="rounded-md p-1 text-slate-300 hover:bg-white hover:text-rose-500"
                                                onClick={() => setDraftSlots((current) => current.length > 1 ? current.filter((item) => item.key !== slot.key) : current)}
                                                aria-label={isZh ? `删除第 ${index + 1} 个时间段` : `Remove slot ${index + 1}`}
                                            >
                                                <Trash2 className="h-3.5 w-3.5"/>
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            <label className="space-y-1">
                                                <span className="text-[11px] text-slate-400">{isZh ? "开始" : "Start"}</span>
                                                <Input
                                                    type="datetime-local"
                                                    value={slot.start_at}
                                                    onChange={(event) => setDraftSlots((current) => current.map((item) => item.key === slot.key ? {...item, start_at: event.target.value} : item))}
                                                    className="h-8 rounded-md border-gray-100 bg-white text-xs"
                                                />
                                            </label>
                                            <label className="space-y-1">
                                                <span className="text-[11px] text-slate-400">{isZh ? "结束" : "End"}</span>
                                                <Input
                                                    type="datetime-local"
                                                    value={slot.end_at}
                                                    onChange={(event) => setDraftSlots((current) => current.map((item) => item.key === slot.key ? {...item, end_at: event.target.value} : item))}
                                                    className="h-8 rounded-md border-gray-100 bg-white text-xs"
                                                />
                                            </label>
                                        </div>
                                        <Input
                                            value={slot.notes || ""}
                                            onChange={(event) => setDraftSlots((current) => current.map((item) => item.key === slot.key ? {...item, notes: event.target.value} : item))}
                                            placeholder={isZh ? "备注，例如：远程优先" : "Notes, e.g. remote preferred"}
                                            className="mt-1.5 h-8 rounded-md border-gray-100 bg-white text-xs"
                                        />
                                    </div>
                                ))}
                            </div>
                            <Button className="mt-3 h-9 w-full rounded-lg bg-[#3B5BDB] text-sm text-white hover:bg-[#2f49bd]" disabled={availabilitySaving} onClick={() => void saveAvailability()}>
                                {availabilitySaving ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                {isZh ? "保存可面试时间" : "Save availability"}
                            </Button>
                        </section>

                        <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-slate-900">{isZh ? "已占用时间" : "Booked slots"}</p>
                                {availabilityLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300"/> : null}
                            </div>
                            <div className="mt-3 space-y-2">
                                {bookedSlots.length ? bookedSlots.map((slot) => (
                                    <div key={slot.id} className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
                                        <p className="text-xs font-medium text-slate-700">{formatRange(slot.start_at, slot.end_at)}</p>
                                        <p className="mt-1 text-xs text-blue-600">{isZh ? "已安排面试" : "Interview scheduled"}</p>
                                    </div>
                                )) : (
                                    <p className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-slate-400">
                                        {isZh ? "暂无已占用时间" : "No booked slots"}
                                    </p>
                                )}
                            </div>
                        </section>
                    </aside>
                ) : null}
            </div>

            {selectedTask ? (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/25 px-4 py-5" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) closeTaskDetail();
                }}>
                    <div className="grid h-[88vh] w-full max-w-[1440px] grid-cols-[minmax(0,1fr)_360px] overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <section className="min-w-0 overflow-auto bg-white">
                            <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-6 py-4 backdrop-blur">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex min-w-0 gap-4">
                                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-50 text-2xl font-semibold text-[#3B5BDB]">
                                            {(selectedDetailCandidate?.name || selectedTask.candidate.name || "?").trim().charAt(0) || "?"}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="truncate text-xl font-semibold text-slate-950">
                                                    {selectedDetailCandidate?.name || selectedTask.candidate.name || (isZh ? "未命名候选人" : "Unnamed")}
                                                </h3>
                                                <span className="text-sm text-slate-400">{selectedDetailCandidate?.candidate_code || selectedTask.candidate.candidate_code}</span>
                                                <Badge variant="outline" className={cn("h-6 rounded-md", scheduleBadgeClass(selectedTask.schedule?.status || "needs_scheduling"))}>
                                                    {labelForScheduleStatus(selectedTask.schedule?.status || "needs_scheduling", isZh)}
                                                </Badge>
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                                                <span className="inline-flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5 text-slate-300"/>{candidateTitle(selectedTask, isZh)}</span>
                                                <span className="inline-flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5 text-slate-300"/>{selectedDetailCandidate?.education || readStructuredText(selectedEducation, ["degree", "education", "学历"]) || "-"}</span>
                                                <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-300"/>{selectedDetailCandidate?.phone || readStructuredText(selectedBasicInfo, ["phone", "mobile", "电话"]) || "-"}</span>
                                                <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-300"/>{selectedDetailCandidate?.email || readStructuredText(selectedBasicInfo, ["email", "mail", "邮箱"]) || "-"}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button type="button" className="rounded-full p-2 text-slate-400 hover:bg-gray-50 hover:text-slate-700" onClick={closeTaskDetail}>
                                        <X className="h-5 w-5"/>
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4 px-6 py-5">
                                {selectedCandidateDetailError ? (
                                    <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                                        {isZh ? `候选人详情加载失败：${selectedCandidateDetailError}` : `Failed to load candidate detail: ${selectedCandidateDetailError}`}
                                    </div>
                                ) : null}

                                <div className="grid gap-3 md:grid-cols-2">
                                    <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-900">
                                            <Sparkles className="h-4 w-4 text-[#3B5BDB]"/>
                                            {isZh ? "候选人亮点" : "Candidate highlights"}
                                        </div>
                                        {selectedCandidateDetailLoading && !selectedCandidateDetail ? (
                                            <p className="text-sm text-blue-600">{isZh ? "正在加载候选人资料..." : "Loading profile..."}</p>
                                        ) : selectedHighlights.length ? (
                                            <ul className="space-y-1.5 text-sm leading-6 text-blue-800">
                                                {selectedHighlights.map((item, index) => (
                                                    <li key={`${index}-${item}`} className="line-clamp-2">• {item}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-sm text-blue-700">{isZh ? "暂无结构化亮点，面试时可结合原始简历判断。" : "No structured highlights yet."}</p>
                                        )}
                                    </section>
                                    <section className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                                            <UserRound className="h-4 w-4 text-slate-400"/>
                                            {isZh ? "基础资料" : "Profile"}
                                        </div>
                                        <div className="grid gap-x-4 gap-y-2 text-sm text-slate-600 sm:grid-cols-2">
                                            <span>{isZh ? "年龄" : "Age"}：{selectedDetailCandidate?.age || readStructuredText(selectedBasicInfo, ["age", "年龄"]) || "-"}</span>
                                            <span>{isZh ? "城市" : "City"}：{selectedDetailCandidate?.city || selectedDetailCandidate?.expected_city || readStructuredText(selectedBasicInfo, ["city", "location", "城市"]) || "-"}</span>
                                            <span>{isZh ? "经验" : "Experience"}：{selectedDetailCandidate?.years_of_experience || readStructuredText(selectedBasicInfo, ["years_of_experience", "experience", "工作年限"]) || "-"}</span>
                                            <span>{isZh ? "公司" : "Company"}：{selectedDetailCandidate?.current_company || readStructuredText(selectedWork, ["company", "company_name", "公司"]) || "-"}</span>
                                        </div>
                                        {selectedConcerns.length ? (
                                            <div className="mt-3 rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs leading-5 text-amber-700">
                                                {selectedConcerns.map((item, index) => <p key={`${index}-${item}`}>• {item}</p>)}
                                            </div>
                                        ) : null}
                                    </section>
                                </div>

                                <section className="rounded-xl border border-gray-100 bg-white">
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <FileText className="h-4 w-4 text-[#3B5BDB]"/>
                                            <p className="text-sm font-semibold text-slate-900">{isZh ? "简历" : "Resume"}</p>
                                            <Badge variant="outline" className="h-6 rounded-md border-gray-200 bg-gray-50 text-slate-500">
                                                {selectedResumeFile ? selectedResumeFile.parse_status : (isZh ? "暂无文件" : "No file")}
                                            </Badge>
                                        </div>
                                        <div className="flex min-w-0 flex-1 justify-end gap-2">
                                            {selectedResumeFiles.length ? (
                                                <select
                                                    value={selectedResumeFile ? String(selectedResumeFile.id) : ""}
                                                    onChange={(event) => setSelectedResumeFileId(Number(event.target.value))}
                                                    className="h-8 max-w-[360px] rounded-lg border border-gray-100 bg-gray-50 px-2.5 text-xs text-slate-700 outline-none focus:border-[#3B5BDB]"
                                                >
                                                    {selectedResumeFiles.map((file) => (
                                                        <option key={file.id} value={file.id}>{file.original_name}</option>
                                                    ))}
                                                </select>
                                            ) : null}
                                            {resumePreviewUrl && selectedResumeFile ? (
                                                <>
                                                    <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => window.open(resumePreviewUrl, "_blank", "noopener,noreferrer")}>
                                                        <ExternalLink className="h-3.5 w-3.5"/>
                                                        {isZh ? "新窗口" : "Open"}
                                                    </Button>
                                                    <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" asChild>
                                                        <a href={resumePreviewUrl} download={selectedResumeFile.original_name}>
                                                            <Download className="h-3.5 w-3.5"/>
                                                            {isZh ? "下载" : "Download"}
                                                        </a>
                                                    </Button>
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="relative h-[min(62vh,760px)] min-h-[520px] overflow-hidden bg-white">
                                        {resumePreviewLoading || (resumePreviewBlob && selectedResumeIsPdf && !resumePreviewReady && !resumePreviewError) ? (
                                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/95 text-slate-500">
                                                <Loader2 className="h-7 w-7 animate-spin text-[#3B5BDB]"/>
                                                <span className="text-sm">{isZh ? "正在加载原始简历..." : "Loading resume..."}</span>
                                            </div>
                                        ) : null}
                                        {resumePreviewBlob && selectedResumeIsPdf && !resumePreviewError ? (
                                            <div className={cn("absolute inset-0 bg-white transition-opacity duration-150", resumePreviewReady ? "opacity-100" : "opacity-0")}>
                                                <InterviewResumePdfPreview
                                                    blob={resumePreviewBlob}
                                                    fileName={selectedResumeFile?.original_name || "Resume"}
                                                    isZh={isZh}
                                                    onReady={() => setResumePreviewReady(true)}
                                                    onError={(message) => {
                                                        setResumePreviewReady(false);
                                                        setResumePreviewError(message);
                                                    }}
                                                />
                                            </div>
                                        ) : selectedResumeRawText ? (
                                            <div className="h-full overflow-auto bg-white px-8 py-6">
                                                <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-slate-700">{selectedResumeRawText}</pre>
                                            </div>
                                        ) : !resumePreviewLoading ? (
                                            <div className="flex h-full items-center justify-center px-6 text-center">
                                                <div>
                                                    <FileText className="mx-auto h-10 w-10 text-slate-200"/>
                                                    <p className="mt-3 text-sm font-medium text-slate-700">{selectedResumeFile ? (isZh ? "简历暂无法内嵌显示" : "Resume preview unavailable") : (isZh ? "暂无简历文件" : "No resume file")}</p>
                                                    <p className="mt-1 text-xs text-slate-400">
                                                        {resumePreviewError || (selectedResumeFile ? (isZh ? `${selectedResumeFile.file_ext || "文件"} ${formatBytes(selectedResumeFile.file_size)}` : "Use download to view the file.") : (isZh ? "该候选人没有可预览的简历文件。" : "No resume file attached."))}
                                                    </p>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                </section>
                            </div>
                        </section>

                        <aside className="flex min-h-0 flex-col border-l border-gray-100 bg-gray-50">
                            <div className="border-b border-gray-100 bg-white px-5 py-4">
                                <p className="text-base font-semibold text-slate-950">{isZh ? "面试评价" : "Interview evaluation"}</p>
                                <p className="mt-1 text-xs text-slate-400">{isZh ? "先查看左侧候选人资料，再提交本轮结论。" : "Review the candidate profile, then submit this round."}</p>
                            </div>
                            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
                                <div className="rounded-xl border border-gray-100 bg-white p-4">
                                    <div className="grid gap-3 text-sm">
                                        <div>
                                            <p className="text-xs text-slate-400">{isZh ? "流程状态" : "Status"}</p>
                                            <p className="mt-1 font-medium text-slate-900">{labelForScheduleStatus(selectedTask.schedule?.status || "needs_scheduling", isZh)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-400">{isZh ? "面试轮次" : "Round"}</p>
                                            <p className="mt-1 font-medium text-slate-900">{selectedTask.schedule?.round_name || (isZh ? "待安排" : "TBD")}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-400">{isZh ? "面试官" : "Interviewer"}</p>
                                            <p className="mt-1 font-medium text-slate-900">{selectedTask.schedule?.interviewer_name || selectedTask.schedule?.interviewer_user_code || "-"}</p>
                                        </div>
                                        <div className="space-y-2 border-t border-gray-100 pt-3 text-slate-600">
                                            <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-300"/>{formatDateTime(selectedTask.schedule?.scheduled_at) || (isZh ? "时间待定" : "Time TBD")}</p>
                                            <p className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-slate-300"/>{selectedTask.schedule?.duration_minutes ? `${selectedTask.schedule.duration_minutes} 分钟` : "-"}</p>
                                            <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-300"/>{selectedTask.schedule?.location || (isZh ? "地点待定" : "Location TBD")}</p>
                                            <p className="flex items-center gap-2 break-all"><Video className="h-4 w-4 shrink-0 text-slate-300"/>{selectedTask.schedule?.meeting_link || (isZh ? "会议链接待定" : "Meeting link TBD")}</p>
                                        </div>
                                        {selectedTask.schedule?.notes ? <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-slate-500">{selectedTask.schedule.notes}</p> : null}
                                    </div>
                                </div>

                                {selectedTask.schedule ? (
                                    <div className="mt-4 rounded-xl border border-gray-100 bg-white p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <p className="text-sm font-semibold text-slate-900">{isZh ? "本轮结论" : "Conclusion"}</p>
                                            <Badge variant="outline" className={cn("h-6 rounded-md", scheduleBadgeClass(selectedTask.schedule.status))}>
                                                {labelForScheduleStatus(selectedTask.schedule.status, isZh)}
                                            </Badge>
                                        </div>
                                        <Textarea
                                            value={canSubmitTaskResult(selectedTask) ? (commentBySchedule[selectedTask.schedule.id] || "") : (selectedTask.schedule.result_comment || "")}
                                            onChange={(event) => setCommentBySchedule((current) => ({...current, [selectedTask.schedule!.id]: event.target.value}))}
                                            disabled={!canSubmitTaskResult(selectedTask)}
                                            placeholder={resultLockMessage(selectedTask) || (isZh ? "填写面试结论、风险点或下一轮建议" : "Add interview feedback")}
                                            className="min-h-[160px] resize-none rounded-lg border-gray-100 bg-gray-50 text-sm shadow-none"
                                        />
                                        {resultLockMessage(selectedTask) ? <p className="mt-2 text-xs text-slate-400">{resultLockMessage(selectedTask)}</p> : null}
                                        <div className="mt-3">{renderResultActions(selectedTask, true)}</div>
                                    </div>
                                ) : canManageInterview ? (
                                    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/80 p-4">
                                        <p className="text-sm font-medium text-blue-900">{isZh ? "待安排面试" : "Needs scheduling"}</p>
                                        <p className="mt-1 text-xs leading-5 text-blue-700">{isZh ? "为候选人选择面试官和可面试时间后，面试官会在这里看到完整资料。" : "Schedule interviewer and time first."}</p>
                                        <Button className="mt-3 w-full rounded-lg bg-[#3B5BDB] text-white hover:bg-[#2f49bd]" onClick={() => openScheduleDrawer(selectedTask)}>
                                            {isZh ? "安排面试" : "Schedule"}
                                            <ChevronRight className="h-4 w-4"/>
                                        </Button>
                                    </div>
                                ) : null}
                            </div>
                        </aside>
                    </div>
                </div>
            ) : null}

            {scheduleTask ? (
                <div className="fixed inset-0 z-[95] flex justify-end bg-slate-950/25" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setScheduleTask(null);
                }}>
                    <aside className="h-full w-full max-w-[520px] overflow-auto bg-white shadow-2xl">
                        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-5 py-4 backdrop-blur">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-lg font-semibold text-slate-950">{isZh ? "安排面试" : "Schedule interview"}</p>
                                    <p className="mt-1 text-sm text-slate-500">{scheduleTask.candidate.name} · {candidateTitle(scheduleTask, isZh)}</p>
                                </div>
                                <button type="button" className="rounded-full p-2 text-slate-400 hover:bg-gray-50 hover:text-slate-700" onClick={() => setScheduleTask(null)}>
                                    <X className="h-5 w-5"/>
                                </button>
                            </div>
                        </div>
                        <div className="space-y-4 px-5 py-4">
                            <section className="rounded-xl border border-gray-100 p-4">
                                <p className="mb-3 text-sm font-semibold text-slate-900">{isZh ? "面试信息" : "Interview info"}</p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="space-y-1">
                                        <span className="text-xs text-slate-400">{isZh ? "轮次名称" : "Round"}</span>
                                        <Input value={scheduleForm.round_name} onChange={(event) => setScheduleForm((current) => ({...current, round_name: event.target.value}))} className="h-9 rounded-lg border-gray-100 bg-gray-50"/>
                                    </label>
                                    <label className="space-y-1">
                                        <span className="text-xs text-slate-400">{isZh ? "第几轮" : "Round index"}</span>
                                        <Input type="number" min={1} value={scheduleForm.round_index} onChange={(event) => setScheduleForm((current) => ({...current, round_index: event.target.value}))} className="h-9 rounded-lg border-gray-100 bg-gray-50"/>
                                    </label>
                                    <label className="space-y-1 sm:col-span-2">
                                        <span className="text-xs text-slate-400">{isZh ? "面试官" : "Interviewer"}</span>
                                        <select
                                            value={scheduleForm.interviewer_user_code}
                                            onChange={(event) => {
                                                const reviewer = interviewerOptions.find((item) => item.user_code === event.target.value);
                                                setScheduleForm((current) => ({
                                                    ...current,
                                                    interviewer_user_code: event.target.value,
                                                    interviewer_name: reviewer ? reviewerLabel(reviewer) : "",
                                                    availability_slot_id: "",
                                                    scheduled_at: "",
                                                }));
                                            }}
                                            className="h-9 w-full rounded-lg border border-gray-100 bg-gray-50 px-3 text-sm text-slate-700 outline-none focus:border-[#3B5BDB]"
                                        >
                                            <option value="">{interviewerLoading ? (isZh ? "正在加载面试官..." : "Loading...") : (isZh ? "选择面试官" : "Select interviewer")}</option>
                                            {interviewerOptions.map((reviewer) => (
                                                <option key={reviewer.user_code} value={reviewer.user_code}>
                                                    {reviewerLabel(reviewer)} · {reviewer.user_code}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                            </section>

                            <section className="rounded-xl border border-gray-100 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <p className="text-sm font-semibold text-slate-900">{isZh ? "选择时间" : "Select time"}</p>
                                    {scheduleSlotsLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-300"/> : null}
                                </div>
                                <div className="space-y-2">
                                    {scheduleForm.interviewer_user_code && scheduleSlots.length > 0 ? scheduleSlots.map((slot) => {
                                        const active = scheduleForm.availability_slot_id === String(slot.id);
                                        return (
                                            <button
                                                key={slot.id}
                                                type="button"
                                                onClick={() => applyScheduleSlot(String(slot.id))}
                                                className={cn(
                                                    "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition",
                                                    active ? "border-[#3B5BDB] bg-blue-50 text-blue-800" : "border-gray-100 bg-gray-50 text-slate-600 hover:border-blue-200",
                                                )}
                                            >
                                                <span>{formatRange(slot.start_at, slot.end_at)}</span>
                                                <span className="text-xs text-slate-400">{slot.notes || (isZh ? "可面试" : "Available")}</span>
                                            </button>
                                        );
                                    }) : (
                                        <p className="rounded-lg border border-dashed border-gray-200 px-3 py-5 text-center text-xs text-slate-400">
                                            {scheduleForm.interviewer_user_code
                                                ? (isZh ? "该面试官暂无可选时间，可手动填写时间。" : "No available slots. You can set time manually.")
                                                : (isZh ? "先选择面试官，再选择可面试时间。" : "Select interviewer first.")}
                                        </p>
                                    )}
                                </div>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    <label className="relative space-y-1 sm:col-span-2">
                                        <span className="text-xs text-slate-400">{isZh ? "日期时间" : "Date and time"}</span>
                                        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(96px,0.8fr)_auto_minmax(96px,0.8fr)] items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setScheduleDatePickerOpen((open) => !open)}
                                                className={cn(
                                                    "flex h-9 min-w-0 items-center justify-between rounded-lg border bg-gray-50 px-3 text-left text-sm outline-none transition hover:border-blue-200",
                                                    scheduleDatePart ? "border-gray-100 text-slate-800" : "border-gray-100 text-slate-400",
                                                )}
                                            >
                                                <span className="truncate">{formatDateDisplay(scheduleDatePart, isZh)}</span>
                                                <CalendarClock className="h-3.5 w-3.5 shrink-0 text-slate-300"/>
                                            </button>
                                            <TimeSelect
                                                value={scheduleStartTimePart}
                                                options={scheduleStartTimeOptions}
                                                placeholder={isZh ? "开始" : "Start"}
                                                onChange={(nextTime) => {
                                                    const nextDate = scheduleDatePart || scheduleToday;
                                                    const nextStartMinutes = timeToMinutes(nextTime);
                                                    setScheduleForm((current) => {
                                                        const desiredDuration = Math.max(15, Number(current.duration_minutes || 60));
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
                                            <span className="text-sm text-slate-300">~</span>
                                            <TimeSelect
                                                value={scheduleEndTimePart}
                                                disabled={!scheduleStartTimePart}
                                                options={scheduleEndTimeSelectOptions}
                                                placeholder={isZh ? "结束" : "End"}
                                                formatOption={(time) => {
                                                    const endMinutes = timeToMinutes(time);
                                                    const duration = scheduleStartMinutes == null || endMinutes == null ? 0 : endMinutes - scheduleStartMinutes;
                                                    return duration > 0 ? `${time}（${formatDurationText(duration, isZh)}）` : time;
                                                }}
                                                onChange={(nextTime) => {
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
                                        </div>
                                        {scheduleDatePickerOpen ? (
                                            <div className="absolute left-0 top-[64px] z-20 w-[360px] rounded-xl border border-gray-100 bg-white p-3 shadow-xl">
                                                <div className="mb-2 flex items-center justify-between">
                                                    <span className="text-xs font-medium text-slate-500">{isZh ? "选择面试日期" : "Select date"}</span>
                                                    <button
                                                        type="button"
                                                        className="text-xs text-[#3B5BDB]"
                                                        onClick={() => {
                                                            const nextTime = scheduleStartTimePart || "09:00";
                                                            setScheduleForm((current) => ({
                                                                ...current,
                                                                scheduled_at: combineLocalDateTime(scheduleToday, nextTime),
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
                                                                    const nextTime = scheduleStartTimePart || "09:00";
                                                                    setScheduleForm((current) => ({
                                                                        ...current,
                                                                        scheduled_at: combineLocalDateTime(date, nextTime),
                                                                        availability_slot_id: "",
                                                                    }));
                                                                    setScheduleDatePickerOpen(false);
                                                                }}
                                                                className={cn(
                                                                    "flex h-10 flex-col items-center justify-center rounded-lg text-xs transition",
                                                                    active ? "bg-[#3B5BDB] text-white shadow-sm" : isToday ? "bg-blue-50 text-[#3B5BDB] ring-1 ring-blue-100" : "text-slate-600 hover:bg-blue-50 hover:text-[#3B5BDB]",
                                                                )}
                                                            >
                                                                <span>{parsed ? parsed.getDate() : date.slice(-2)}</span>
                                                                <span className={cn("mt-0.5 text-[10px]", active ? "text-white/80" : isToday ? "text-blue-400" : "text-slate-300")}>
                                                                    {parsed ? new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {weekday: "short"}).format(parsed) : ""}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : null}
                                        <p className="text-[11px] text-slate-400">
                                            {scheduleStartTimePart ? (isZh ? `当前时长 ${formatDurationText(effectiveScheduleDurationMinutes, isZh)}` : `Duration ${formatDurationText(effectiveScheduleDurationMinutes, isZh)}`) : (isZh ? "先选日期和开始时间，再选择结束时间。" : "Select date and start time, then end time.")}
                                        </p>
                                    </label>
                                    <label className="space-y-1">
                                        <span className="text-xs text-slate-400">{isZh ? "地点" : "Location"}</span>
                                        <Input value={scheduleForm.location} onChange={(event) => setScheduleForm((current) => ({...current, location: event.target.value}))} placeholder={isZh ? "会议室 / 线上" : "Room / remote"} className="h-9 rounded-lg border-gray-100 bg-gray-50"/>
                                    </label>
                                    <label className="space-y-1">
                                        <span className="text-xs text-slate-400">{isZh ? "会议链接" : "Meeting link"}</span>
                                        <Input value={scheduleForm.meeting_link} onChange={(event) => setScheduleForm((current) => ({...current, meeting_link: event.target.value}))} placeholder="https://" className="h-9 rounded-lg border-gray-100 bg-gray-50"/>
                                    </label>
                                    <label className="space-y-1 sm:col-span-2">
                                        <span className="text-xs text-slate-400">{isZh ? "备注" : "Notes"}</span>
                                        <Textarea value={scheduleForm.notes} onChange={(event) => setScheduleForm((current) => ({...current, notes: event.target.value}))} className="min-h-[74px] resize-none rounded-lg border-gray-100 bg-gray-50"/>
                                    </label>
                                </div>
                            </section>
                        </div>
                        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-gray-100 bg-white/95 px-5 py-4 backdrop-blur">
                            <Button variant="outline" className="rounded-lg" onClick={() => setScheduleTask(null)}>{isZh ? "取消" : "Cancel"}</Button>
                            <Button className="rounded-lg bg-[#3B5BDB] text-white hover:bg-[#2f49bd]" disabled={scheduleSaving} onClick={() => void submitSchedule()}>
                                {scheduleSaving ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                {isZh ? "确认安排" : "Schedule"}
                            </Button>
                        </div>
                    </aside>
                </div>
            ) : null}
        </div>
    );
}
