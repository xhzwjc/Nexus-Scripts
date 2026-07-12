"use client";

import React from "react";
import {createPortal} from "react-dom";
import {
    Briefcase,
    CalendarCheck,
    CalendarClock,
    Check,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Download,
    ExternalLink,
    FileText,
    GraduationCap,
    Info,
    Loader2,
    Mail,
    MapPin,
    PencilLine,
    Phone,
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
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
const PDF_RENDER_FIRST_PAGE_TIMEOUT_MS = 10000;
const TIME_OPTION_STEP_MINUTES = 15;
const TIME_OPTION_START_MINUTES = 7 * 60;
const TIME_OPTION_END_MINUTES = 23 * 60 + 59;
const AVAILABILITY_CALENDAR_START_MINUTES = 7 * 60;
const AVAILABILITY_CALENDAR_END_MINUTES = 20 * 60;
const AVAILABILITY_CALENDAR_STEP_MINUTES = 30;
const AVAILABILITY_DEFAULT_SLOT_MINUTES = AVAILABILITY_CALENDAR_STEP_MINUTES;
const AVAILABILITY_HOUR_HEIGHT = 56;
const AVAILABILITY_CALENDAR_HOURS = Array.from(
    {length: (AVAILABILITY_CALENDAR_END_MINUTES - AVAILABILITY_CALENDAR_START_MINUTES) / 60 + 1},
    (_, index) => AVAILABILITY_CALENDAR_START_MINUTES + index * 60,
);
const AVAILABILITY_CALENDAR_CELL_STARTS = Array.from(
    {length: (AVAILABILITY_CALENDAR_END_MINUTES - AVAILABILITY_CALENDAR_START_MINUTES) / AVAILABILITY_CALENDAR_STEP_MINUTES},
    (_, index) => AVAILABILITY_CALENDAR_START_MINUTES + index * AVAILABILITY_CALENDAR_STEP_MINUTES,
);
const AVAILABILITY_CALENDAR_HEIGHT = ((AVAILABILITY_CALENDAR_END_MINUTES - AVAILABILITY_CALENDAR_START_MINUTES) / 60) * AVAILABILITY_HOUR_HEIGHT;

type AvailabilitySlotStatus = "available" | "unavailable";

type AvailabilityDraftSlot = {
    key: string;
    start_at: string;
    end_at: string;
    status: AvailabilitySlotStatus;
    notes?: string;
};

type AvailabilityDragSelection = {
    dateKey: string;
    day: Date;
    anchorMinutes: number;
    currentMinutes: number;
    mode: AvailabilitySlotStatus;
};

type AvailabilitySaveNotice = {
    type: "success" | "error";
    message: string;
};

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

type ScheduleFormState = {
    subject: string;
    round_name: string;
    round_index: string;
    interview_method: InterviewMethod;
    interviewer_user_code: string;
    interviewer_name: string;
    availability_slot_id: string;
    scheduled_at: string;
    duration_minutes: string;
    location: string;
    meeting_room: string;
    video_tool: string;
    meeting_link: string;
    contact_phone: string;
    notes: string;
    visible_sections: string[];
};

type ScheduleFormErrorKey =
    | "subject"
    | "round_name"
    | "interview_method"
    | "interviewer_user_code"
    | "scheduled_date"
    | "scheduled_start_time"
    | "scheduled_end_time";

type InterviewSchedulePayload = {
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
};

type InterviewWorkbenchPageProps = {
    tasks: InterviewTask[];
    calendarTasks?: InterviewTask[];
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
    onSubmitResult: (
        scheduleId: number,
        resultStatus: InterviewResult,
        comment: string,
        options?: {next_round_name?: string | null},
    ) => Promise<void>;
    onCreateSchedule?: (payload: InterviewSchedulePayload & {
        candidate_id: number;
        department_review_assignment_id?: number;
    }) => Promise<unknown>;
    onUpdateSchedule?: (scheduleId: number, payload: InterviewSchedulePayload) => Promise<unknown>;
    onSaveAvailability: (slots: Array<{start_at: string; end_at: string; status?: AvailabilitySlotStatus; notes?: string}>) => Promise<void>;
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

function createDraftSlotKey() {
    const cryptoSource = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
    return cryptoSource && "randomUUID" in cryptoSource ? cryptoSource.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function startOfAvailabilityWeek(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    const day = next.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    next.setDate(next.getDate() + diff);
    return next;
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function getAvailabilityWeekDays(weekStart: Date) {
    return Array.from({length: 7}, (_, index) => addDays(weekStart, index));
}

function dateAtMinutes(day: Date, minutes: number) {
    const next = new Date(day);
    next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return next;
}

function clampAvailabilityMinutes(minutes: number) {
    return Math.max(AVAILABILITY_CALENDAR_START_MINUTES, Math.min(minutes, AVAILABILITY_CALENDAR_END_MINUTES));
}

function snapAvailabilityMinutes(minutes: number, mode: "floor" | "round") {
    const stepped = mode === "floor"
        ? Math.floor(minutes / AVAILABILITY_CALENDAR_STEP_MINUTES) * AVAILABILITY_CALENDAR_STEP_MINUTES
        : Math.round(minutes / AVAILABILITY_CALENDAR_STEP_MINUTES) * AVAILABILITY_CALENDAR_STEP_MINUTES;
    return clampAvailabilityMinutes(stepped);
}

function availabilityMinutesFromPointer(clientY: number, element: HTMLElement, mode: "floor" | "round") {
    const rect = element.getBoundingClientRect();
    if (!rect.height) return AVAILABILITY_CALENDAR_START_MINUTES;
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const rawMinutes = AVAILABILITY_CALENDAR_START_MINUTES + ratio * (AVAILABILITY_CALENDAR_END_MINUTES - AVAILABILITY_CALENDAR_START_MINUTES);
    return snapAvailabilityMinutes(rawMinutes, mode);
}

function rangeTouchesOrOverlaps(startA: number, endA: number, startB: number, endB: number) {
    return startA <= endB && startB <= endA;
}

function availabilityRangeFromSelection(anchorMinutes: number, currentMinutes: number) {
    const anchor = clampAvailabilityMinutes(anchorMinutes);
    const current = clampAvailabilityMinutes(currentMinutes);
    const start = Math.min(anchor, current);
    const end = Math.max(anchor, current);
    if (start === end) {
        return {
            startMinutes: Math.max(AVAILABILITY_CALENDAR_START_MINUTES, Math.min(start, AVAILABILITY_CALENDAR_END_MINUTES - AVAILABILITY_DEFAULT_SLOT_MINUTES)),
            endMinutes: Math.min(start + AVAILABILITY_DEFAULT_SLOT_MINUTES, AVAILABILITY_CALENDAR_END_MINUTES),
        };
    }
    return {
        startMinutes: start,
        endMinutes: Math.max(start + AVAILABILITY_CALENDAR_STEP_MINUTES, end),
    };
}

function normalizeAvailabilityDraftStatus(status?: string | null): AvailabilitySlotStatus {
    return status === "unavailable" ? "unavailable" : "available";
}

function createDraftSlotFromRange(
    day: Date,
    startMinutes: number,
    endMinutes: number,
    status: AvailabilitySlotStatus,
    notes = "",
): AvailabilityDraftSlot {
    const start = dateAtMinutes(day, startMinutes);
    const end = dateAtMinutes(day, endMinutes);
    return {
        key: createDraftSlotKey(),
        start_at: toLocalInputValue(start.toISOString()),
        end_at: toLocalInputValue(end.toISOString()),
        status,
        notes,
    };
}

function parseLocalInputDate(value?: string | null) {
    const normalized = String(value || "").trim();
    if (!normalized) return null;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
}

function minutesOfDate(date: Date) {
    return date.getHours() * 60 + date.getMinutes();
}

function sameLocalDate(left: Date, right: Date) {
    return formatLocalDateValue(left) === formatLocalDateValue(right);
}

function rangeOverlaps(startA: number, endA: number, startB: number, endB: number) {
    return startA < endB && startB < endA;
}

function buildAvailabilityDraftSlots(slots: InterviewAvailabilitySlot[]) {
    return slots
        .map((slot) => ({slot, status: normalizeAvailabilityDraftStatus(slot.status)}))
        .filter((item) => item.slot.status === "available" || item.slot.status === "unavailable")
        .map(({slot, status}) => ({
            key: String(slot.id),
            start_at: toLocalInputValue(slot.start_at),
            end_at: toLocalInputValue(slot.end_at),
            status,
            notes: slot.notes || "",
        }));
}

function serializeAvailabilityDraftSlots(slots: AvailabilityDraftSlot[]) {
    return slots
        .map((slot) => ({
            start_at: String(slot.start_at || "").slice(0, 16),
            end_at: String(slot.end_at || "").slice(0, 16),
            status: normalizeAvailabilityDraftStatus(slot.status),
            notes: String(slot.notes || "").trim(),
        }))
        .filter((slot) => slot.start_at || slot.end_at || slot.notes)
        .sort((left, right) => `${left.start_at}|${left.end_at}|${left.status}|${left.notes}`.localeCompare(`${right.start_at}|${right.end_at}|${right.status}|${right.notes}`))
        .map((slot) => `${slot.start_at}|${slot.end_at}|${slot.status}|${slot.notes}`)
        .join("\n");
}

function draftSlotRange(slot: AvailabilityDraftSlot) {
    const start = parseLocalInputDate(slot.start_at);
    const end = parseLocalInputDate(slot.end_at);
    if (!start || !end || end <= start || !sameLocalDate(start, end)) return null;
    return {
        dateKey: formatLocalDateValue(start),
        startMinutes: minutesOfDate(start),
        endMinutes: minutesOfDate(end),
    };
}

function availabilitySlotRange(slot: InterviewAvailabilitySlot) {
    const start = slot.start_at ? new Date(slot.start_at) : null;
    const end = slot.end_at ? new Date(slot.end_at) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || !sameLocalDate(start, end)) {
        return null;
    }
    return {
        dateKey: formatLocalDateValue(start),
        startMinutes: minutesOfDate(start),
        endMinutes: minutesOfDate(end),
    };
}

function formatCalendarDateLabel(date: Date, isZh: boolean) {
    const monthDay = new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {month: "2-digit", day: "2-digit"}).format(date);
    const weekday = new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {weekday: "short"}).format(date);
    return `${monthDay} ${weekday}`;
}

function formatCalendarBlockRange(startMinutes: number, endMinutes: number) {
    return `${formatTimeValue(startMinutes)}-${formatTimeValue(endMinutes)}`;
}

function calendarBlockHeight(startMinutes: number, endMinutes: number) {
    const durationMinutes = endMinutes - startMinutes;
    const rawHeight = (durationMinutes / 60) * AVAILABILITY_HOUR_HEIGHT - 4;
    return Math.max(durationMinutes <= AVAILABILITY_CALENDAR_STEP_MINUTES ? 24 : 32, rawHeight);
}

function TruncatedTooltipText({
    text,
    children,
    className,
    tooltipClassName,
}: {
    text?: string | null;
    children?: React.ReactNode;
    className?: string;
    tooltipClassName?: string;
}) {
    const content = String(text || "").trim();
    const triggerRef = React.useRef<HTMLSpanElement | null>(null);
    const [enabled, setEnabled] = React.useState(false);

    const updateEnabled = React.useCallback(() => {
        const node = triggerRef.current;
        setEnabled(Boolean(node && (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)));
    }, []);

    if (!content) {
        return <span className={cn("block min-w-0 truncate", className)}>{children}</span>;
    }

    return (
        <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
                <span
                    ref={triggerRef}
                    className={cn("block min-w-0 truncate", className)}
                    onPointerEnter={updateEnabled}
                    onFocus={updateEnabled}
                >
                    {children ?? content}
                </span>
            </TooltipTrigger>
            {enabled ? (
                <TooltipContent
                    side="top"
                    sideOffset={6}
                    className={cn(
                        "max-w-[360px] whitespace-normal break-words rounded-md bg-slate-950 px-2.5 py-1.5 text-xs font-medium leading-4 text-white shadow-lg dark:bg-slate-950 dark:text-white",
                        tooltipClassName,
                    )}
                >
                    {content}
                </TooltipContent>
            ) : null}
        </Tooltip>
    );
}

function TimeSelect({
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
                    "flex h-[34px] w-full items-center justify-between rounded border border-[#E6E7EB] bg-white px-2.5 text-left text-xs outline-none transition hover:border-[#1E3BFA] focus:border-[#1E3BFA]",
                    value ? "text-[#0E1114]" : "text-[#B0B2B8]",
                    disabled ? "cursor-not-allowed bg-[#FAFAFB] text-[#B0B2B8] hover:border-[#E6E7EB]" : "",
                    buttonClassName,
                )}
            >
                <TruncatedTooltipText text={value || placeholder}>{value || placeholder}</TruncatedTooltipText>
                <Clock3 className="h-3.5 w-3.5 shrink-0 text-[#B0B2B8]"/>
            </button>
            {open && !disabled ? (
                <div className="absolute left-0 top-[calc(100%+4px)] z-30 max-h-56 w-full overflow-y-auto rounded-md border border-[#EBEEF5] bg-white py-1 shadow-[0_8px_24px_rgba(14,17,20,0.12)]">
                    {options.map((time) => {
                        const optionContent = formatOption ? formatOption(time) : time;
                        const optionText = typeof optionContent === "string" ? optionContent : time;
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
                                    "flex h-8 w-full min-w-0 items-center px-3 text-left text-xs transition",
                                    time === value
                                        ? "bg-[rgba(30,59,250,0.06)] text-[#1E3BFA]"
                                        : "text-[#33353D] hover:bg-[#F7F8FA]",
                                )}
                            >
                                <TruncatedTooltipText text={optionText}>{optionContent}</TruncatedTooltipText>
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

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

function isFinalInterviewRound(roundName?: string | null, roundIndex?: number | null) {
    const normalizedName = String(roundName || "").trim();
    const normalizedIndex = Number(roundIndex || 0);
    if (normalizedName.includes("终")) return true;
    if (normalizedName.includes("加")) return false;
    return normalizedIndex >= 4;
}

function defaultScheduleSubject(candidateName?: string | null) {
    const name = String(candidateName || "").trim();
    return name ? `${name}的面试` : "候选人的面试";
}

function normalizeScheduleInterviewMethod(value?: string | null): InterviewMethod {
    return value === "video" || value === "phone" ? value : "onsite";
}

function createScheduleForm(roundIndex = 1, candidateName?: string | null, candidatePhone?: string | null): ScheduleFormState {
    const roundName = interviewRoundNameForIndex(roundIndex);
    return {
        subject: defaultScheduleSubject(candidateName),
        round_name: roundName,
        round_index: String(interviewRoundIndexForName(roundName, roundIndex)),
        interview_method: "onsite",
        interviewer_user_code: "",
        interviewer_name: "",
        availability_slot_id: "",
        scheduled_at: "",
        duration_minutes: "60",
        location: "",
        meeting_room: "",
        video_tool: "腾讯会议",
        meeting_link: "",
        contact_phone: String(candidatePhone || "").trim(),
        notes: "",
        visible_sections: [...DEFAULT_INTERVIEW_VISIBLE_SECTIONS],
    };
}

function createScheduleFormFromTask(task: InterviewTask): ScheduleFormState {
    const schedule = task.schedule;
    if (!schedule) {
        const nextRoundIndex = Math.max(1, Number(task.next_round_index || 1));
        const fallback = createScheduleForm(nextRoundIndex, task.candidate.name, task.candidate.phone);
        const nextRoundName = String(task.next_round_name || "").trim();
        return nextRoundName
            ? {
                ...fallback,
                round_name: nextRoundName,
                round_index: String(interviewRoundIndexForName(nextRoundName, nextRoundIndex)),
            }
            : fallback;
    }
    const roundName = schedule.round_name || interviewRoundNameForIndex(Number(schedule.round_index || 1));
    const fallback = createScheduleForm(Number(schedule.round_index || 1), task.candidate.name, task.candidate.phone);
    return {
        ...fallback,
        subject: String(schedule.subject || "").trim() || fallback.subject,
        round_name: roundName,
        round_index: String(schedule.round_index || interviewRoundIndexForName(roundName, Number(schedule.round_index || 1))),
        interview_method: normalizeScheduleInterviewMethod(schedule.interview_method),
        interviewer_user_code: String(schedule.interviewer_user_code || ""),
        interviewer_name: String(schedule.interviewer_name || ""),
        availability_slot_id: schedule.availability_slot_id ? String(schedule.availability_slot_id) : "",
        scheduled_at: toLocalInputValue(schedule.scheduled_at),
        duration_minutes: String(schedule.duration_minutes || fallback.duration_minutes),
        location: String(schedule.location || ""),
        meeting_room: String(schedule.meeting_room || ""),
        video_tool: String(schedule.video_tool || "") || fallback.video_tool,
        meeting_link: String(schedule.meeting_link || ""),
        contact_phone: String(schedule.contact_phone || task.candidate.phone || "").trim(),
        notes: String(schedule.notes || ""),
        visible_sections: Array.isArray(schedule.visible_sections)
            ? schedule.visible_sections
            : [...DEFAULT_INTERVIEW_VISIBLE_SECTIONS],
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
            return "border-[rgba(255,171,36,0.35)] bg-[rgba(255,171,36,0.10)] text-[#D48806]";
        case "scheduled":
            return "border-[rgba(30,59,250,0.22)] bg-[rgba(30,59,250,0.07)] text-[#1E3BFA]";
        case "confirmed":
            return "border-[rgba(12,201,145,0.28)] bg-[rgba(12,201,145,0.10)] text-[#0A9C71]";
        case "completed":
            return "border-[rgba(12,201,145,0.28)] bg-[rgba(12,201,145,0.10)] text-[#0A9C71]";
        case "cancelled":
            return "border-[#E6E7EB] bg-[#F2F3F5] text-[#86888F]";
        case "no_show":
            return "border-[rgba(255,171,36,0.35)] bg-[rgba(255,171,36,0.10)] text-[#D48806]";
        case "in_progress":
            return "border-[rgba(30,59,250,0.25)] bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]";
        default:
            return "border-[rgba(255,171,36,0.35)] bg-[rgba(255,171,36,0.10)] text-[#D48806]";
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
    const name = String(file?.original_name || "").toLowerCase();
    const mime = String(file?.mime_type || blob?.type || "").toLowerCase();
    return ext.includes("pdf") || name.endsWith(".pdf") || mime.includes("pdf");
}

async function isPdfBlob(blob: Blob) {
    const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    return String.fromCharCode(...header) === "%PDF-";
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
                    "flex justify-center bg-white py-5",
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
        <div className="h-full overflow-auto bg-white [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.82)_transparent] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[scrollbar-color:rgba(71,85,105,0.9)_transparent] dark:[&::-webkit-scrollbar-thumb]:bg-slate-700">
            <div ref={hostRef} aria-label={fileName} className="mx-auto min-h-full w-full bg-white px-4 py-6"/>
        </div>
    );
}

export function InterviewWorkbenchPage({
    tasks,
    calendarTasks = [],
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
    onUpdateSchedule,
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
    const [resumePreviewFallback, setResumePreviewFallback] = React.useState(false);
    const [resumePreviewDetectedPdf, setResumePreviewDetectedPdf] = React.useState(false);
    const [resumePreviewLoading, setResumePreviewLoading] = React.useState(false);
    const [resumePreviewReady, setResumePreviewReady] = React.useState(false);
    const [resumePreviewError, setResumePreviewError] = React.useState<string | null>(null);
    const [scheduleTask, setScheduleTask] = React.useState<InterviewTask | null>(null);
    const [scheduleEditingId, setScheduleEditingId] = React.useState<number | null>(null);
    const [scheduleForm, setScheduleForm] = React.useState<ScheduleFormState>(() => createScheduleForm());
    const [scheduleFormErrors, setScheduleFormErrors] = React.useState<Partial<Record<ScheduleFormErrorKey, string>>>({});
    const [scheduleSubmitError, setScheduleSubmitError] = React.useState<string | null>(null);
    const [scheduleDatePickerOpen, setScheduleDatePickerOpen] = React.useState(false);
    const [scheduleSlotsOpen, setScheduleSlotsOpen] = React.useState(false);
    const [interviewerOptions, setInterviewerOptions] = React.useState<DepartmentReviewReviewerOption[]>([]);
    const [interviewerLoading, setInterviewerLoading] = React.useState(false);
    const [scheduleSlots, setScheduleSlots] = React.useState<InterviewAvailabilitySlot[]>([]);
    const [scheduleSlotsLoading, setScheduleSlotsLoading] = React.useState(false);
    const [scheduleSaving, setScheduleSaving] = React.useState(false);
    const [commentBySchedule, setCommentBySchedule] = React.useState<Record<number, string>>({});
    const [submittingKey, setSubmittingKey] = React.useState<string | null>(null);
    const [draftSlots, setDraftSlots] = React.useState<AvailabilityDraftSlot[]>([]);
    const [availabilityDialogOpen, setAvailabilityDialogOpen] = React.useState(false);
    const [availabilityWeekStart, setAvailabilityWeekStart] = React.useState(() => startOfAvailabilityWeek(new Date()));
    const [availabilityEditMode, setAvailabilityEditMode] = React.useState<AvailabilitySlotStatus>("available");
    const [availabilityCloseConfirmOpen, setAvailabilityCloseConfirmOpen] = React.useState(false);
    const [availabilityDragSelection, setAvailabilityDragSelection] = React.useState<AvailabilityDragSelection | null>(null);
    const [availabilitySaveNotice, setAvailabilitySaveNotice] = React.useState<AvailabilitySaveNotice | null>(null);
    const availabilityDragSelectionRef = React.useRef<AvailabilityDragSelection | null>(null);
    const availabilityCloseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const normalizedCurrentUserCode = React.useMemo(() => String(currentUserCode || "").trim(), [currentUserCode]);
    const showAvailabilityEditor = canSubmitInterviewResults;
    const scheduleRequiredText = isZh ? "必填" : "Required";
    const scheduleRequiredErrorClass = "border-rose-500 bg-rose-50/30 focus:border-rose-500 dark:border-rose-500 dark:bg-rose-950/10 dark:focus:border-rose-500";
    const clearScheduleFormError = React.useCallback((field: ScheduleFormErrorKey) => {
        setScheduleFormErrors((current) => {
            if (!current[field]) return current;
            const next = {...current};
            delete next[field];
            return next;
        });
    }, []);
    const renderScheduleFormError = (field: ScheduleFormErrorKey) => (
        scheduleFormErrors[field] ? <p className="mt-1 text-xs leading-4 text-rose-500">{scheduleFormErrors[field]}</p> : null
    );

    React.useEffect(() => {
        setDraftSlots(buildAvailabilityDraftSlots(availabilitySlots));
    }, [availabilitySlots]);

    React.useEffect(() => {
        availabilityDragSelectionRef.current = availabilityDragSelection;
    }, [availabilityDragSelection]);

    React.useEffect(() => () => {
        if (availabilityCloseTimerRef.current) {
            clearTimeout(availabilityCloseTimerRef.current);
        }
    }, []);

    React.useEffect(() => {
        if (!selectedTask) return;
        const currentTask = tasks.find((task) => (
            selectedTask.schedule?.id
                ? task.schedule?.id === selectedTask.schedule.id
                : !task.schedule && task.candidate.id === selectedTask.candidate.id
        ));
        if (!currentTask) {
            setSelectedTask(null);
            setSelectedCandidateDetail(null);
            setSelectedCandidateDetailError(null);
            setSelectedResumeFileId(null);
            return;
        }
        if (currentTask !== selectedTask) {
            setSelectedTask(currentTask);
        }
    }, [selectedTask, tasks]);

    const availabilityBaselineKey = React.useMemo(() => (
        serializeAvailabilityDraftSlots(buildAvailabilityDraftSlots(availabilitySlots))
    ), [availabilitySlots]);
    const availabilityDraftKey = React.useMemo(() => serializeAvailabilityDraftSlots(draftSlots), [draftSlots]);
    const availabilityDirty = availabilityBaselineKey !== availabilityDraftKey;
    const availabilityWeekDays = React.useMemo(() => getAvailabilityWeekDays(availabilityWeekStart), [availabilityWeekStart]);
    const availabilityMinWeekStart = React.useMemo(() => startOfAvailabilityWeek(new Date()), []);
    const availabilityMaxWeekStart = React.useMemo(() => addDays(availabilityMinWeekStart, 7), [availabilityMinWeekStart]);
    const bookedSlots = React.useMemo(() => availabilitySlots.filter((slot) => slot.status === "booked"), [availabilitySlots]);
    const availableDraftSlots = React.useMemo(() => draftSlots.filter((slot) => slot.status === "available"), [draftSlots]);

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

    const availabilityWeekLabel = React.useMemo(() => {
        const weekEnd = addDays(availabilityWeekStart, 6);
        return `${formatCalendarDateLabel(availabilityWeekStart, isZh)} - ${formatCalendarDateLabel(weekEnd, isZh)}`;
    }, [availabilityWeekStart, isZh]);

    const currentWeekDraftCount = React.useMemo(() => {
        const dayKeys = new Set(availabilityWeekDays.map(formatLocalDateValue));
        return draftSlots.filter((slot) => {
            const range = draftSlotRange(slot);
            return range ? dayKeys.has(range.dateKey) : false;
        }).length;
    }, [availabilityWeekDays, draftSlots]);

    const currentWeekAvailableDraftCount = React.useMemo(() => {
        const dayKeys = new Set(availabilityWeekDays.map(formatLocalDateValue));
        return availableDraftSlots.filter((slot) => {
            const range = draftSlotRange(slot);
            return range ? dayKeys.has(range.dateKey) : false;
        }).length;
    }, [availabilityWeekDays, availableDraftSlots]);

    const currentWeekUnavailableDraftCount = currentWeekDraftCount - currentWeekAvailableDraftCount;
    const currentWeekBookedCount = React.useMemo(() => {
        const dayKeys = new Set(availabilityWeekDays.map(formatLocalDateValue));
        return bookedSlots.filter((slot) => {
            const range = availabilitySlotRange(slot);
            return range ? dayKeys.has(range.dateKey) : false;
        }).length;
    }, [availabilityWeekDays, bookedSlots]);

    const mainCalendarWeekDays = React.useMemo(() => getAvailabilityWeekDays(startOfAvailabilityWeek(new Date())), []);
    const mainCalendarDayKeys = React.useMemo(() => new Set(mainCalendarWeekDays.map(formatLocalDateValue)), [mainCalendarWeekDays]);
    const mainCalendarTasks = React.useMemo(() => (
        calendarTasks
            .filter((task) => {
                const value = task.schedule?.scheduled_at;
                if (!value) return false;
                const date = new Date(value);
                return !Number.isNaN(date.getTime()) && mainCalendarDayKeys.has(formatLocalDateValue(date));
            })
            .sort((left, right) => new Date(left.schedule?.scheduled_at || "").getTime() - new Date(right.schedule?.scheduled_at || "").getTime())
    ), [calendarTasks, mainCalendarDayKeys]);

    const resetAvailabilityDrafts = React.useCallback(() => {
        setDraftSlots(buildAvailabilityDraftSlots(availabilitySlots));
    }, [availabilitySlots]);

    const requestCloseAvailabilityDialog = React.useCallback(() => {
        if (availabilityDirty) {
            setAvailabilityCloseConfirmOpen(true);
            return;
        }
        setAvailabilityCloseConfirmOpen(false);
        setAvailabilityDialogOpen(false);
    }, [availabilityDirty]);

    const openAvailabilityDialog = React.useCallback(() => {
        if (availabilityCloseTimerRef.current) {
            clearTimeout(availabilityCloseTimerRef.current);
            availabilityCloseTimerRef.current = null;
        }
        setAvailabilityWeekStart(startOfAvailabilityWeek(new Date()));
        setAvailabilityEditMode("available");
        setAvailabilityCloseConfirmOpen(false);
        setAvailabilitySaveNotice(null);
        setAvailabilityDialogOpen(true);
    }, []);

    const handleAvailabilityDialogOpenChange = React.useCallback((open: boolean) => {
        if (open) {
            openAvailabilityDialog();
            return;
        }
        requestCloseAvailabilityDialog();
    }, [openAvailabilityDialog, requestCloseAvailabilityDialog]);

    const discardAvailabilityDraftChanges = React.useCallback(() => {
        resetAvailabilityDrafts();
        setAvailabilityCloseConfirmOpen(false);
        setAvailabilitySaveNotice(null);
        setAvailabilityDialogOpen(false);
    }, [resetAvailabilityDrafts]);

    const removeAvailabilitySlot = React.useCallback((slotKey: string) => {
        setDraftSlots((current) => current.filter((slot) => slot.key !== slotKey));
        setAvailabilityCloseConfirmOpen(false);
    }, []);

    const commitAvailabilityRange = React.useCallback((day: Date, startMinutes: number, endMinutes: number, status: AvailabilitySlotStatus) => {
        const rangeStart = Math.max(
            AVAILABILITY_CALENDAR_START_MINUTES,
            Math.min(startMinutes, AVAILABILITY_CALENDAR_END_MINUTES - AVAILABILITY_CALENDAR_STEP_MINUTES),
        );
        const rangeEnd = Math.max(
            rangeStart + AVAILABILITY_CALENDAR_STEP_MINUTES,
            Math.min(endMinutes, AVAILABILITY_CALENDAR_END_MINUTES),
        );
        const dateKey = formatLocalDateValue(day);

        if (dateAtMinutes(day, rangeStart) < new Date()) {
            setAvailabilitySaveNotice({type: "error", message: isZh ? "不能添加过去的时间段" : "Cannot add a past time range."});
            return;
        }

        const bookedConflict = bookedSlots.some((slot) => {
            const range = availabilitySlotRange(slot);
            return range
                ? range.dateKey === dateKey && rangeOverlaps(range.startMinutes, range.endMinutes, rangeStart, rangeEnd)
                : false;
        });

        if (bookedConflict) {
            setAvailabilitySaveNotice({type: "error", message: isZh ? "该时间段已被占用" : "This time range is booked."});
            return;
        }

        const oppositeStatus = status === "available" ? "unavailable" : "available";
        const oppositeConflict = draftSlots.some((slot) => {
            if (slot.status !== oppositeStatus) return false;
            const slotRange = draftSlotRange(slot);
            return slotRange && slotRange.dateKey === dateKey
                ? rangeOverlaps(slotRange.startMinutes, slotRange.endMinutes, rangeStart, rangeEnd)
                : false;
        });

        if (oppositeConflict) {
            setAvailabilitySaveNotice({
                type: "error",
                message: isZh ? "可面试时间和不可面试时间不能重叠" : "Available and unavailable time cannot overlap.",
            });
            return;
        }

        setAvailabilitySaveNotice(null);
        setDraftSlots((current) => {
            let mergedStart = rangeStart;
            let mergedEnd = rangeEnd;
            let mergedNotes = "";
            const remaining: AvailabilityDraftSlot[] = [];

            current.forEach((slot) => {
                const slotRange = draftSlotRange(slot);
                if (
                    slot.status === status
                    && slotRange
                    && slotRange.dateKey === dateKey
                    && rangeTouchesOrOverlaps(slotRange.startMinutes, slotRange.endMinutes, mergedStart, mergedEnd)
                ) {
                    mergedStart = Math.min(mergedStart, slotRange.startMinutes);
                    mergedEnd = Math.max(mergedEnd, slotRange.endMinutes);
                    if (!mergedNotes && slot.notes?.trim()) {
                        mergedNotes = slot.notes.trim();
                    }
                    return;
                }
                remaining.push(slot);
            });

            return [
                ...remaining,
                createDraftSlotFromRange(day, mergedStart, mergedEnd, status, mergedNotes),
            ].sort((left, right) => {
                const leftDate = parseLocalInputDate(left.start_at);
                const rightDate = parseLocalInputDate(right.start_at);
                return (leftDate?.getTime() || 0) - (rightDate?.getTime() || 0);
            });
        });
        setAvailabilityCloseConfirmOpen(false);
    }, [bookedSlots, draftSlots, isZh]);

    const startAvailabilityDrag = React.useCallback((day: Date, minutes: number) => {
        const startMinutes = Math.max(
            AVAILABILITY_CALENDAR_START_MINUTES,
            Math.min(minutes, AVAILABILITY_CALENDAR_END_MINUTES - AVAILABILITY_CALENDAR_STEP_MINUTES),
        );
        const selection = {
            dateKey: formatLocalDateValue(day),
            day,
            anchorMinutes: startMinutes,
            currentMinutes: startMinutes,
            mode: availabilityEditMode,
        };
        availabilityDragSelectionRef.current = selection;
        setAvailabilityDragSelection(selection);
        setAvailabilityCloseConfirmOpen(false);
    }, [availabilityEditMode]);

    const updateAvailabilityDrag = React.useCallback((day: Date, minutes: number) => {
        const active = availabilityDragSelectionRef.current;
        const dateKey = formatLocalDateValue(day);
        if (!active || active.dateKey !== dateKey) return;
        const nextSelection = {
            ...active,
            currentMinutes: clampAvailabilityMinutes(minutes),
        };
        availabilityDragSelectionRef.current = nextSelection;
        setAvailabilityDragSelection(nextSelection);
    }, []);

    const finishAvailabilityDrag = React.useCallback(() => {
        const active = availabilityDragSelectionRef.current;
        if (!active) return;
        const selectedRange = availabilityRangeFromSelection(active.anchorMinutes, active.currentMinutes);
        availabilityDragSelectionRef.current = null;
        setAvailabilityDragSelection(null);
        commitAvailabilityRange(active.day, selectedRange.startMinutes, selectedRange.endMinutes, active.mode);
    }, [commitAvailabilityRange]);

    React.useEffect(() => {
        if (!availabilityDragSelection) return;
        const handlePointerUp = () => finishAvailabilityDrag();
        const handlePointerCancel = () => {
            availabilityDragSelectionRef.current = null;
            setAvailabilityDragSelection(null);
        };
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerCancel);
        return () => {
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerCancel);
        };
    }, [availabilityDragSelection, finishAvailabilityDrag]);

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

        const detailParams = selectedTask.schedule?.id
            ? `?${new URLSearchParams({schedule_id: String(selectedTask.schedule.id)}).toString()}`
            : "";
        const detailPath = `/interviews/candidates/${selectedTask.candidate.id}${detailParams}`;
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
    }, [selectedTask]);

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
        setResumePreviewFallback(false);
        setResumePreviewDetectedPdf(false);
        setResumePreviewLoading(false);
        setResumePreviewReady(false);
        setResumePreviewError(null);

        if (!selectedTask || !selectedResumeFile) {
            return () => undefined;
        }

        setResumePreviewLoading(true);
        const downloadParams = selectedTask.schedule?.id
            ? `?${new URLSearchParams({schedule_id: String(selectedTask.schedule.id)}).toString()}`
            : "";
        const downloadPath = `/api/recruitment/interviews/resume-files/${selectedResumeFile.id}/download${downloadParams}`;
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
            .then(async (blob) => {
                if (abortController.signal.aborted) return;
                const detectedPdf = isPdfResume(selectedResumeFile, blob) || await isPdfBlob(blob).catch(() => false);
                if (abortController.signal.aborted) return;
                objectUrl = URL.createObjectURL(blob);
                setResumePreviewBlob(blob);
                setResumePreviewUrl(objectUrl);
                setResumePreviewFallback(false);
                setResumePreviewDetectedPdf(detectedPdf);
                setResumePreviewLoading(false);
                setResumePreviewError(null);
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
    }, [selectedResumeFile, selectedTask]);

    const openTaskDetail = React.useCallback((task: InterviewTask) => {
        setScheduleTask(null);
        setScheduleEditingId(null);
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

    const canEditTaskSchedule = React.useCallback((task: InterviewTask) => {
        const status = task.schedule?.status;
        return Boolean(
            canManageInterview
            && onUpdateSchedule
            && task.schedule
            && (!status || ["scheduled", "confirmed", "in_progress"].includes(status)),
        );
    }, [canManageInterview, onUpdateSchedule]);

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
        const roundName = String(task.schedule.round_name || "").trim();
        const roundIndex = Number(task.schedule.round_index || (roundName ? interviewRoundIndexForName(roundName, 1) : 1) || 1);
        if (result === "next_round" && isFinalInterviewRound(roundName, roundIndex)) {
            return;
        }
        const nextRoundName = result === "next_round" ? interviewRoundNameForIndex(roundIndex + 1) : undefined;
        setSubmittingKey(key);
        try {
            await onSubmitResult(scheduleId, result, commentBySchedule[scheduleId] || "", {next_round_name: nextRoundName});
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
        setScheduleTask(task);
        setScheduleEditingId(null);
        setSelectedTask(null);
        setScheduleForm(task.schedule
            ? createScheduleForm(Math.max(1, Number(task.schedule.round_index || 0) + 1), task.candidate.name, task.candidate.phone)
            : createScheduleFormFromTask(task));
        setScheduleFormErrors({});
        setScheduleSubmitError(null);
        setScheduleDatePickerOpen(false);
        setScheduleSlotsOpen(false);
        setScheduleSlots([]);
        void loadInterviewers(task.candidate.org_code);
    }, [loadInterviewers]);

    const openEditScheduleDrawer = React.useCallback((task: InterviewTask) => {
        if (!task.schedule || !canEditTaskSchedule(task)) return;
        setScheduleTask(task);
        setScheduleEditingId(task.schedule.id);
        setSelectedTask(null);
        setScheduleForm(createScheduleFormFromTask(task));
        setScheduleFormErrors({});
        setScheduleSubmitError(null);
        setScheduleDatePickerOpen(false);
        setScheduleSlotsOpen(false);
        setScheduleSlots([]);
        void loadInterviewers(task.candidate.org_code);
    }, [canEditTaskSchedule, loadInterviewers]);

    const closeScheduleDrawer = React.useCallback(() => {
        setScheduleTask(null);
        setScheduleEditingId(null);
        setScheduleFormErrors({});
        setScheduleSubmitError(null);
        setScheduleDatePickerOpen(false);
        setScheduleSlotsOpen(false);
    }, []);

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
        setScheduleFormErrors((current) => {
            if (!current.scheduled_date && !current.scheduled_start_time && !current.scheduled_end_time) return current;
            const next = {...current};
            delete next.scheduled_date;
            delete next.scheduled_start_time;
            delete next.scheduled_end_time;
            return next;
        });
        setScheduleDatePickerOpen(false);
        setScheduleSlotsOpen(false);
    }, [scheduleSlots]);

    const selectedInterviewer = React.useMemo(() => (
        interviewerOptions.find((item) => item.user_code === scheduleForm.interviewer_user_code)
    ), [interviewerOptions, scheduleForm.interviewer_user_code]);

    React.useEffect(() => {
        if (!scheduleTask) return;
        void loadScheduleSlots(scheduleForm.interviewer_user_code);
    }, [loadScheduleSlots, scheduleForm.interviewer_user_code, scheduleTask]);

    const saveAvailability = async () => {
        const normalized: Array<{start_at: string; end_at: string; status: AvailabilitySlotStatus; notes?: string}> = [];
        const ranges: Array<{dateKey: string; startMinutes: number; endMinutes: number; status: AvailabilitySlotStatus}> = [];
        setAvailabilitySaveNotice(null);

        for (const slot of draftSlots) {
            if (!slot.start_at && !slot.end_at && !slot.notes?.trim()) {
                continue;
            }
            const status = normalizeAvailabilityDraftStatus(slot.status);
            const start = parseLocalInputDate(slot.start_at);
            const end = parseLocalInputDate(slot.end_at);
            if (!start || !end) {
                setAvailabilitySaveNotice({type: "error", message: isZh ? "请补全时间段的开始和结束时间" : "Complete start and end time."});
                return;
            }
            if (end <= start) {
                setAvailabilitySaveNotice({type: "error", message: isZh ? "结束时间必须晚于开始时间" : "End time must be later than start time."});
                return;
            }
            if (!sameLocalDate(start, end)) {
                setAvailabilitySaveNotice({type: "error", message: isZh ? "单个时间段需要在同一天内" : "Each time slot must stay within one day."});
                return;
            }
            const range = {
                dateKey: formatLocalDateValue(start),
                startMinutes: minutesOfDate(start),
                endMinutes: minutesOfDate(end),
                status,
            };
            if (ranges.some((item) => item.dateKey === range.dateKey && rangeOverlaps(item.startMinutes, item.endMinutes, range.startMinutes, range.endMinutes))) {
                setAvailabilitySaveNotice({type: "error", message: isZh ? "时间段不能相互重叠" : "Time slots cannot overlap."});
                return;
            }
            if (bookedSlots.some((item) => {
                const bookedRange = availabilitySlotRange(item);
                return bookedRange
                    ? bookedRange.dateKey === range.dateKey && rangeOverlaps(bookedRange.startMinutes, bookedRange.endMinutes, range.startMinutes, range.endMinutes)
                    : false;
            })) {
                setAvailabilitySaveNotice({type: "error", message: isZh ? "时间段不能覆盖已占用时间" : "Time slots cannot overlap booked interviews."});
                return;
            }
            ranges.push(range);
            normalized.push({
                start_at: start.toISOString(),
                end_at: end.toISOString(),
                status,
                notes: slot.notes?.trim() || undefined,
            });
        }
        try {
            await onSaveAvailability(normalized);
            setAvailabilityCloseConfirmOpen(false);
            setAvailabilitySaveNotice({type: "success", message: isZh ? "面试时间已保存" : "Interview time saved"});
            if (availabilityCloseTimerRef.current) {
                clearTimeout(availabilityCloseTimerRef.current);
            }
            availabilityCloseTimerRef.current = setTimeout(() => {
                setAvailabilityDialogOpen(false);
                setAvailabilitySaveNotice(null);
                availabilityCloseTimerRef.current = null;
            }, 650);
        } catch (error) {
            setAvailabilitySaveNotice({type: "error", message: isZh ? `保存面试时间失败：${formatActionError(error)}` : `Failed to save interview time: ${formatActionError(error)}`});
        }
    };

    const submitSchedule = async () => {
        if (!scheduleTask) return;
        const editingScheduleId = scheduleEditingId;
        if (editingScheduleId ? !onUpdateSchedule : !onCreateSchedule) return;
        const nextErrors: Partial<Record<ScheduleFormErrorKey, string>> = {};
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
        if (!scheduleEndTimePart || Number(scheduleForm.duration_minutes || 0) <= 0) {
            nextErrors.scheduled_end_time = scheduleRequiredText;
        }
        if (Object.keys(nextErrors).length > 0) {
            setScheduleFormErrors(nextErrors);
            setScheduleSubmitError(null);
            return;
        }
        setScheduleFormErrors({});
        setScheduleSubmitError(null);
        setScheduleSaving(true);
        try {
            const payload: InterviewSchedulePayload = {
                subject: scheduleForm.subject.trim(),
                round_name: scheduleForm.round_name || undefined,
                round_index: scheduleForm.round_index ? Number(scheduleForm.round_index) : undefined,
                interview_method: scheduleForm.interview_method,
                interviewer_user_code: scheduleForm.interviewer_user_code,
                interviewer_name: scheduleForm.interviewer_name || (selectedInterviewer ? reviewerLabel(selectedInterviewer) : undefined),
                scheduled_at: scheduleForm.scheduled_at ? new Date(scheduleForm.scheduled_at).toISOString() : undefined,
                duration_minutes: scheduleForm.duration_minutes ? Number(scheduleForm.duration_minutes) : undefined,
                availability_slot_id: scheduleForm.availability_slot_id ? Number(scheduleForm.availability_slot_id) : undefined,
                location: scheduleForm.location.trim() || undefined,
                meeting_room: scheduleForm.meeting_room.trim() || undefined,
                video_tool: scheduleForm.video_tool.trim() || undefined,
                meeting_link: scheduleForm.meeting_link.trim() || undefined,
                contact_phone: scheduleForm.contact_phone.trim() || undefined,
                notes: scheduleForm.notes.trim() || undefined,
                visible_sections: scheduleForm.visible_sections,
            };
            if (editingScheduleId) {
                await onUpdateSchedule!(editingScheduleId, payload);
            } else {
                await onCreateSchedule!({
                    candidate_id: scheduleTask.candidate.id,
                    ...payload,
                    department_review_assignment_id: scheduleTask.schedule?.department_review_assignment_id || undefined,
                });
            }
            closeScheduleDrawer();
            await onRefresh();
        } catch (error) {
            setScheduleSubmitError(editingScheduleId
                ? (isZh ? `保存面试失败：${formatActionError(error)}` : `Failed to update interview: ${formatActionError(error)}`)
                : (isZh ? `安排面试失败：${formatActionError(error)}` : `Failed to schedule interview: ${formatActionError(error)}`));
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
        const canEnterNextRound = !isFinalInterviewRound(
            schedule.round_name,
            Number(schedule.round_index || (schedule.round_name ? interviewRoundIndexForName(schedule.round_name, 1) : 1)),
        );
        return (
            <div className={cn(compact ? "grid grid-cols-2 gap-2" : "flex flex-wrap items-center gap-2.5")}>
                {([
                    ["passed", isZh ? "通过" : "Pass", "border-[rgba(12,201,145,0.4)] text-[#0CC991] hover:bg-[rgba(12,201,145,0.06)]"],
                    ["next_round", isZh ? "下一轮" : "Next", "border-[#E6E7EB] text-[#33353D] hover:border-[#1E3BFA] hover:text-[#1E3BFA]"],
                    ["hold", isZh ? "暂缓" : "Hold", "border-[rgba(255,171,36,0.5)] text-[#D48806] hover:bg-[rgba(255,171,36,0.06)]"],
                    ["no_show", isZh ? "未到场" : "No show", "border-[#E6E7EB] text-[#86888F] hover:bg-[#F7F8FA]"],
                    ["rejected", isZh ? "淘汰" : "Reject", "border-[rgba(245,63,63,0.4)] text-[#F53F3F] hover:bg-[rgba(245,63,63,0.05)]"],
                ] as const).filter(([result]) => result !== "next_round" || canEnterNextRound).map(([result, label, className]) => {
                    const loadingKey = submittingKey === `${schedule.id}:${result}`;
                    return (
                        <Button
                            key={result}
                            variant="outline"
                            size="sm"
                            disabled={Boolean(submittingKey) || !canSubmitResult}
                            className={cn(
                                "h-7 rounded-md bg-white px-3.5 text-xs shadow-none disabled:cursor-not-allowed disabled:opacity-45",
                                compact && "h-[34px] w-full rounded-lg px-2 text-[13px]",
                                compact && result === "rejected" && "col-span-2",
                                className,
                            )}
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
    const selectedResumeIsPdf = resumePreviewDetectedPdf || isPdfResume(selectedResumeFile, resumePreviewBlob);
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

    const renderAvailabilityDayColumn = (day: Date) => {
        const dayKey = formatLocalDateValue(day);
        const draftBlocks = draftSlots
            .map((slot) => ({slot, range: draftSlotRange(slot)}))
            .filter((item): item is {slot: AvailabilityDraftSlot; range: NonNullable<ReturnType<typeof draftSlotRange>>} => Boolean(item.range && item.range.dateKey === dayKey));
        const bookedBlocks = bookedSlots
            .map((slot) => ({slot, range: availabilitySlotRange(slot)}))
            .filter((item): item is {slot: InterviewAvailabilitySlot; range: NonNullable<ReturnType<typeof availabilitySlotRange>>} => Boolean(item.range && item.range.dateKey === dayKey));
        const activeDragRange = availabilityDragSelection?.dateKey === dayKey
            ? availabilityRangeFromSelection(availabilityDragSelection.anchorMinutes, availabilityDragSelection.currentMinutes)
            : null;
        const activeDragMode = availabilityDragSelection?.mode || availabilityEditMode;
        const activeDragCompact = activeDragRange
            ? activeDragRange.endMinutes - activeDragRange.startMinutes <= AVAILABILITY_CALENDAR_STEP_MINUTES
            : false;

        return (
            <div
                key={dayKey}
                className="relative cursor-crosshair select-none border-l border-[#F2F3F5] bg-white"
                style={{height: AVAILABILITY_CALENDAR_HEIGHT}}
                onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    const target = event.target instanceof HTMLElement ? event.target : null;
                    if (target?.closest("[data-availability-delete]")) return;
                    const minutes = availabilityMinutesFromPointer(event.clientY, event.currentTarget, "floor");
                    if (dateAtMinutes(day, Math.min(minutes, AVAILABILITY_CALENDAR_END_MINUTES - AVAILABILITY_CALENDAR_STEP_MINUTES)) < new Date()) {
                        setAvailabilitySaveNotice({type: "error", message: isZh ? "不能添加过去的时间段" : "Cannot add a past time range."});
                        return;
                    }
                    event.preventDefault();
                    startAvailabilityDrag(day, minutes);
                }}
                onPointerMove={(event) => {
                    const active = availabilityDragSelectionRef.current;
                    if (!active || active.dateKey !== dayKey) return;
                    if (event.pointerType === "mouse" && event.buttons !== 1) return;
                    updateAvailabilityDrag(day, availabilityMinutesFromPointer(event.clientY, event.currentTarget, "round"));
                }}
                onPointerUp={(event) => {
                    const active = availabilityDragSelectionRef.current;
                    if (!active || active.dateKey !== dayKey) return;
                    event.preventDefault();
                    finishAvailabilityDrag();
                }}
            >
                {AVAILABILITY_CALENDAR_CELL_STARTS.map((minutes) => {
                    const pastCell = dateAtMinutes(day, minutes) < new Date();
                    return (
                        <div
                            key={`${dayKey}-${minutes}`}
                            aria-label={`${formatCalendarDateLabel(day, isZh)} ${formatTimeValue(minutes)}`}
                            className={cn(
                                "absolute left-0 w-full border-t border-[#F2F3F5] text-left transition focus:outline-none",
                                pastCell
                                    ? "cursor-not-allowed bg-[#FAFAFB]"
                                    : availabilityEditMode === "available"
                                        ? "hover:bg-[rgba(12,201,145,0.06)] focus:bg-[rgba(12,201,145,0.10)]"
                                        : "hover:bg-[#F7F8FA] focus:bg-[#F2F3F5]",
                            )}
                            style={{
                                top: ((minutes - AVAILABILITY_CALENDAR_START_MINUTES) / 60) * AVAILABILITY_HOUR_HEIGHT,
                                height: (AVAILABILITY_CALENDAR_STEP_MINUTES / 60) * AVAILABILITY_HOUR_HEIGHT,
                            }}
                        />
                    );
                })}
                {activeDragRange ? (
                    <div
                        className={cn(
                            "pointer-events-none absolute left-1.5 right-1.5 z-10 rounded-md border border-dashed px-2 text-xs",
                            activeDragMode === "available"
                                ? "border-[rgba(12,201,145,0.5)] bg-[rgba(12,201,145,0.12)] text-[#0A9C71]"
                                : "border-[#B0B2B8] bg-[#F2F3F5] text-[#86888F]",
                            activeDragCompact ? "py-1" : "py-1.5",
                        )}
                        style={{
                            top: ((activeDragRange.startMinutes - AVAILABILITY_CALENDAR_START_MINUTES) / 60) * AVAILABILITY_HOUR_HEIGHT + 2,
                            height: calendarBlockHeight(activeDragRange.startMinutes, activeDragRange.endMinutes),
                        }}
                    >
                        <p className="truncate font-semibold">{formatCalendarBlockRange(activeDragRange.startMinutes, activeDragRange.endMinutes)}</p>
                    </div>
                ) : null}
                {bookedBlocks.map(({slot, range}) => {
                    const blockStart = Math.max(range.startMinutes, AVAILABILITY_CALENDAR_START_MINUTES);
                    const blockEnd = Math.min(range.endMinutes, AVAILABILITY_CALENDAR_END_MINUTES);
                    const compactBlock = range.endMinutes - range.startMinutes <= AVAILABILITY_CALENDAR_STEP_MINUTES;
                    if (blockEnd <= blockStart) return null;
                    return (
                        <div
                            key={`booked-${slot.id}`}
                            className={cn(
                                "absolute left-1.5 right-1.5 z-20 overflow-hidden rounded-md border border-[rgba(30,59,250,0.22)] bg-[rgba(30,59,250,0.10)] px-2 text-xs text-[#1E3BFA]",
                                compactBlock ? "py-1" : "py-1.5",
                            )}
                            style={{
                                top: ((blockStart - AVAILABILITY_CALENDAR_START_MINUTES) / 60) * AVAILABILITY_HOUR_HEIGHT + 2,
                                height: calendarBlockHeight(blockStart, blockEnd),
                            }}
                        >
                            <p className="truncate font-medium">{formatCalendarBlockRange(range.startMinutes, range.endMinutes)}</p>
                            {!compactBlock ? (
                                <p className="mt-0.5 truncate text-[11px] text-[#0F23D9]">{isZh ? "已占用" : "Booked"}</p>
                            ) : null}
                        </div>
                    );
                })}
                {draftBlocks.map(({slot, range}) => {
                    const blockStart = Math.max(range.startMinutes, AVAILABILITY_CALENDAR_START_MINUTES);
                    const blockEnd = Math.min(range.endMinutes, AVAILABILITY_CALENDAR_END_MINUTES);
                    const compactBlock = range.endMinutes - range.startMinutes <= AVAILABILITY_CALENDAR_STEP_MINUTES;
                    const isAvailableBlock = slot.status === "available";
                    const editableBlock = slot.status === availabilityEditMode;
                    if (blockEnd <= blockStart) return null;
                    return (
                        <div
                            key={slot.key}
                            className={cn(
                                "absolute left-1.5 right-1.5 z-30 overflow-hidden rounded-md border px-2 text-xs shadow-sm",
                                isAvailableBlock
                                    ? "border-[rgba(12,201,145,0.32)] bg-[rgba(12,201,145,0.12)] text-[#0A9C71]"
                                    : "border-[#E6E7EB] bg-[#F2F3F5] text-[#86888F]",
                                compactBlock ? "py-1" : "py-1.5",
                            )}
                            style={{
                                top: ((blockStart - AVAILABILITY_CALENDAR_START_MINUTES) / 60) * AVAILABILITY_HOUR_HEIGHT + 2,
                                height: calendarBlockHeight(blockStart, blockEnd),
                            }}
                        >
                            <div className={cn("h-full", editableBlock ? "pr-5" : "")}>
                                <div className="min-w-0">
                                    <p className="truncate font-semibold">{formatCalendarBlockRange(range.startMinutes, range.endMinutes)}</p>
                                    {!compactBlock ? (
                                        <p
                                            className={cn(
                                                "mt-0.5 truncate text-[11px]",
                                                isAvailableBlock ? "text-[#0A9C71]" : "text-[#86888F]",
                                            )}
                                        >
                                            {slot.notes || (isAvailableBlock ? (isZh ? "可面试" : "Available") : (isZh ? "不可面试" : "Unavailable"))}
                                        </p>
                                    ) : null}
                                </div>
                                {editableBlock ? (
                                    <button
                                        type="button"
                                        data-availability-delete="true"
                                        className={cn(
                                            "absolute right-1.5 rounded hover:bg-white hover:text-[#F53F3F]",
                                            isAvailableBlock ? "text-[#0CC991]" : "text-[#86888F]",
                                            compactBlock ? "top-[2px] p-0" : "top-1 p-0.5",
                                        )}
                                        onPointerDown={(event) => event.stopPropagation()}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            removeAvailabilitySlot(slot.key);
                                        }}
                                        aria-label={isAvailableBlock ? (isZh ? "删除可面试时间" : "Remove availability") : (isZh ? "删除不可面试时间" : "Remove unavailable time")}
                                    >
                                        <Trash2 className={cn(compactBlock ? "h-3 w-3" : "h-3.5 w-3.5")}/>
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="flex h-full min-h-0 flex-col overflow-auto bg-white px-8 pb-12 pt-5 font-sans text-[#0E1114]">
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#1E3BFA] text-white">
                        <UserRound className="h-[15px] w-[15px]" strokeWidth={1.9}/>
                    </div>
                    <div className="flex min-w-0 items-center gap-7">
                        {tabs.map((tab) => {
                            const active = activeFilter === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => setActiveFilter(tab.key)}
                                    className="relative inline-flex h-10 items-center gap-1.5 px-0.5 text-left"
                                >
                                    <span className={cn("text-base transition-colors", active ? "font-semibold text-[#0E1114]" : "font-normal text-[#86888F] hover:text-[#33353D]")}>{tab.label}</span>
                                    <span className="text-xs tabular-nums text-[#B0B2B8]">{tab.count}</span>
                                    {active ? <span className="absolute bottom-0 left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-sm bg-[#1E3BFA]"/> : null}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {showAvailabilityEditor ? (
                        <Button
                            variant="outline"
                            className="h-9 rounded-md border-[#1E3BFA] bg-white px-4 text-sm font-normal text-[#1E3BFA] shadow-none hover:bg-[rgba(30,59,250,0.04)] hover:text-[#1E3BFA]"
                            onClick={openAvailabilityDialog}
                        >
                            <CalendarClock className="h-3.5 w-3.5"/>
                            {isZh ? "设置可面试时间" : "Set availability"}
                        </Button>
                    ) : null}
                    <Button
                        variant="outline"
                        className="h-9 rounded-md border-[#E6E7EB] bg-white px-4 text-sm font-normal text-[#33353D] shadow-none hover:bg-[#F7F8FA] hover:text-[#0E1114]"
                        onClick={() => void onRefresh()}
                    >
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <RefreshCw className="h-3.5 w-3.5"/>}
                        {isZh ? "刷新" : "Refresh"}
                    </Button>
                </div>
            </div>

            <div className="mb-4 flex h-[38px] shrink-0 items-center gap-2 rounded bg-[#F7F8FA] px-3.5 text-xs text-[#33353D]">
                <Info className="h-3.5 w-3.5 shrink-0 text-[#1E3BFA]" strokeWidth={1.9}/>
                <span>{showAvailabilityEditor
                    ? (isZh ? "先查看左侧候选人资料，再提交本轮结论。招聘人事排期时会看到你的可面试时间段。" : "Review the candidate profile before submitting the conclusion. HR can see your availability when scheduling.")
                    : (isZh ? "查看候选人资料并维护面试安排，面试结论由指定面试官提交。" : "Review candidate profiles and maintain interview schedules. Assigned interviewers submit conclusions.")}</span>
            </div>

            <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                    <select
                        value={positionFilter}
                        onChange={(event) => setPositionFilter(event.target.value)}
                        className="h-8 min-w-[92px] cursor-pointer border-0 bg-white px-0 text-xs text-[#33353D] outline-none"
                    >
                        <option value="all">{isZh ? "全部岗位" : "All positions"}</option>
                        {positionOptions.map((position) => <option key={position} value={position}>{position}</option>)}
                    </select>
                    <select
                        value={resultFilter}
                        onChange={(event) => setResultFilter(event.target.value)}
                        className="h-8 min-w-[92px] cursor-pointer border-0 bg-white px-0 text-xs text-[#33353D] outline-none"
                    >
                        <option value="all">{isZh ? "全部结果" : "All results"}</option>
                        <option value="passed">{isZh ? "已通过" : "Passed"}</option>
                        <option value="next_round">{isZh ? "下一轮" : "Next round"}</option>
                        <option value="hold">{isZh ? "暂缓" : "Hold"}</option>
                        <option value="rejected">{isZh ? "已淘汰" : "Rejected"}</option>
                        <option value="no_show">{isZh ? "未到场" : "No show"}</option>
                    </select>
                    <button type="button" onClick={clearFilters} className="text-xs text-[#0F23D9] hover:text-[#1E3BFA]">{isZh ? "清空筛选" : "Clear filters"}</button>
                </div>
                <div className="flex h-8 w-[340px] items-center gap-2 rounded border border-[#E6E7EB] bg-white px-3 focus-within:border-[#1E3BFA]">
                    <Search className="h-[13px] w-[13px] shrink-0 text-[#B0B2B8]"/>
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={isZh ? "搜索候选人、岗位、联系方式" : "Search candidate, position, contact"}
                        className="h-7 min-w-0 border-0 bg-transparent px-0 text-xs text-[#33353D] shadow-none placeholder:text-[#B0B2B8] focus-visible:ring-0"
                    />
                    {query ? <button type="button" onClick={() => setQuery("")} className="text-[#B0B2B8] hover:text-[#33353D]"><X className="h-3.5 w-3.5"/></button> : null}
                </div>
            </div>

            <div className={cn("grid min-h-0 flex-1 items-start gap-5", showAvailabilityEditor ? "grid-cols-[minmax(0,1fr)_400px]" : "grid-cols-1")}>
                <section className="flex min-w-0 flex-col gap-3.5">
                    {loading ? (
                        <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-[#EBEEF5] text-sm text-[#86888F]">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#1E3BFA]"/>{isZh ? "正在加载面试任务" : "Loading interviews"}
                        </div>
                    ) : visibleTasks.length === 0 ? (
                        <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-lg border border-[#EBEEF5] text-center">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F7F8FA]"><CalendarCheck className="h-5 w-5 text-[#1E3BFA]"/></div>
                            <div>
                                <p className="text-sm font-medium text-[#0E1114]">{isZh ? "暂无面试任务" : "No interview tasks"}</p>
                                <p className="mt-1 text-xs text-[#B0B2B8]">{isZh ? "当前筛选条件下没有需要处理的面试" : "No interviews match the current filters."}</p>
                            </div>
                            {(positionFilter !== "all" || resultFilter !== "all" || query) ? (
                                <Button variant="outline" className="h-8 rounded-md border-[#E6E7EB] bg-white text-xs text-[#33353D] shadow-none" onClick={clearFilters}>{isZh ? "清空筛选，查看全部" : "Clear filters"}</Button>
                            ) : null}
                        </div>
                    ) : visibleTasks.map((task) => {
                        const schedule = task.schedule;
                        const candidate = task.candidate;
                        const positionTitle = candidateTitle(task, isZh);
                        const canSubmitResult = canSubmitTaskResult(task);
                        const lockMessage = canSubmitResult ? "" : resultLockMessage(task);
                        const interviewerName = schedule?.interviewer_name || schedule?.interviewer_user_code || (isZh ? "未指定面试官" : "No interviewer");
                        const commentValue = canSubmitResult ? (commentBySchedule[schedule?.id || 0] || "") : (schedule?.result_comment || "");
                        const avatarColors = ["#1E3BFA", "#0CC991", "#FFAB24", "#F53F3F"];
                        const avatarColor = avatarColors[Math.abs(Number(candidate.id || 0)) % avatarColors.length];
                        const methodLabel = schedule?.interview_method === "video"
                            ? (isZh ? "视频面试" : "Video")
                            : schedule?.interview_method === "phone"
                                ? (isZh ? "电话面试" : "Phone")
                                : (isZh ? "现场面试" : "Onsite");
                        const methodDetail = schedule?.meeting_room || schedule?.location || schedule?.video_tool || "";
                        const scheduledAtLabel = schedule?.scheduled_at
                            ? formatDateTime(schedule.scheduled_at)
                            : (isZh ? "时间待定" : "Time TBD");
                        return (
                            <article
                                key={schedule?.id ? `schedule-${schedule.id}` : `candidate-${candidate.id}`}
                                className="flex min-w-0 flex-col gap-3.5 rounded-lg border border-[#EBEEF5] bg-white px-5 py-[18px] transition-shadow hover:shadow-[0_4px_12px_rgba(14,17,20,0.06)]"
                            >
                                <div className="flex min-w-0 items-start justify-between gap-5">
                                    <button type="button" onClick={() => openTaskDetail(task)} className="flex min-w-0 items-center gap-3 text-left">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-medium text-white" style={{backgroundColor: avatarColor}}>
                                            {(candidate.name || "?").trim().charAt(0) || "?"}
                                        </span>
                                        <span className="flex min-w-0 flex-col gap-[3px]">
                                            <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                                                <span className="truncate text-[15px] font-semibold text-[#0E1114]">{candidate.name || (isZh ? "未命名候选人" : "Unnamed")}</span>
                                                <span className="truncate text-xs text-[#86888F]">{positionTitle}</span>
                                                <Badge variant="outline" className={cn("h-[22px] rounded px-2 text-xs font-normal shadow-none", scheduleBadgeClass(schedule?.status || "needs_scheduling"))}>{labelForScheduleStatus(schedule?.status || "needs_scheduling", isZh)}</Badge>
                                            </span>
                                            <span className="truncate text-xs text-[#86888F]">
                                                {schedule?.round_name || (isZh ? "待安排面试" : "Interview to schedule")} · {isZh ? "面试官" : "Interviewer"}：{interviewerName} · {scheduledAtLabel} · {methodLabel}{methodDetail ? ` · ${methodDetail}` : ""}
                                            </span>
                                        </span>
                                    </button>
                                    <div className="flex shrink-0 items-center gap-2.5">
                                        <Button variant="outline" className="h-[30px] rounded-md border-[#1E3BFA] bg-white px-3.5 text-xs font-normal text-[#1E3BFA] shadow-none hover:bg-[rgba(30,59,250,0.04)] hover:text-[#1E3BFA]" onClick={() => openTaskDetail(task)}>
                                            {canSubmitResult ? (isZh ? "面试评价" : "Evaluate") : (isZh ? "查看" : "View")}
                                        </Button>
                                        {canEditTaskSchedule(task) ? (
                                            <button type="button" className="text-xs text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => openEditScheduleDrawer(task)}>{isZh ? "编辑面试" : "Edit interview"}</button>
                                        ) : null}
                                    </div>
                                </div>
                                {schedule?.notes ? <p className="line-clamp-2 pl-12 text-xs leading-5 text-[#86888F]">{schedule.notes}</p> : null}
                                {!schedule ? (
                                    <div className="flex items-center justify-between gap-4 rounded-md bg-[#F7F8FA] px-3.5 py-3">
                                        <span className="text-xs text-[#33353D]">{isZh ? "该候选人已进入面试阶段，尚未安排面试官和时间。" : "This candidate is ready for interview but has not been scheduled yet."}</span>
                                        {canManageInterview ? <Button className="h-7 shrink-0 rounded-md bg-[#1E3BFA] px-3.5 text-xs text-white shadow-none hover:bg-[#0F23D9]" onClick={() => openScheduleDrawer(task)}>{isZh ? "安排面试" : "Schedule interview"}</Button> : null}
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2.5 border-t border-[#F2F3F5] pt-3">
                                        <Textarea
                                            value={commentValue}
                                            onChange={(event) => setCommentBySchedule((current) => ({...current, [schedule.id]: event.target.value}))}
                                            disabled={!canSubmitResult}
                                            placeholder={lockMessage || (isZh ? "填写面试结论、风险点或下一轮建议" : "Add conclusion, risks, or next-round suggestions")}
                                            className="min-h-14 resize-none rounded-md border-[#E6E7EB] bg-white px-3 py-2.5 text-xs text-[#33353D] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-0 disabled:cursor-default disabled:bg-[#FAFAFB] disabled:opacity-100"
                                        />
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            {lockMessage ? <p className="text-xs text-[#B0B2B8]">{lockMessage}</p> : <span/>}
                                            {renderResultActions(task)}
                                        </div>
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </section>

                {showAvailabilityEditor ? (
                    <aside className="flex min-w-0 flex-col gap-4">
                        <section className="rounded-lg border border-[#EBEEF5] bg-white px-5 py-[18px]">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-[#0E1114]">{isZh ? "我的可面试时间" : "My availability"}</p>
                                <Button variant="outline" className="h-7 rounded-md border-[#1E3BFA] bg-white px-3 text-xs font-normal text-[#1E3BFA] shadow-none hover:bg-[rgba(30,59,250,0.04)] hover:text-[#1E3BFA]" onClick={openAvailabilityDialog}>{isZh ? "设置" : "Set"}</Button>
                            </div>
                            <p className="mt-1.5 text-[11px] text-[#B0B2B8]">{isZh ? "招聘人事排期时会看到这些时间段" : "HR sees these slots when scheduling."}</p>
                            <div className="mt-4 grid grid-cols-3 gap-3">
                                <div className="flex flex-col items-center gap-0.5 rounded-md bg-[#F7F8FA] py-3"><span className="text-xl font-semibold tabular-nums text-[#0CC991]">{availableDraftSlots.length}</span><span className="text-[11px] text-[#86888F]">{isZh ? "可面试" : "Available"}</span></div>
                                <div className="flex flex-col items-center gap-0.5 rounded-md bg-[#F7F8FA] py-3"><span className="text-xl font-semibold tabular-nums text-[#0E1114]">{currentWeekAvailableDraftCount}</span><span className="text-[11px] text-[#86888F]">{isZh ? "本周" : "This week"}</span></div>
                                <div className="flex flex-col items-center gap-0.5 rounded-md bg-[#F7F8FA] py-3"><span className="text-xl font-semibold tabular-nums text-[#86888F]">{bookedSlots.length}</span><span className="text-[11px] text-[#86888F]">{isZh ? "已占用" : "Booked"}</span></div>
                            </div>
                        </section>

                        <section className="rounded-lg border border-[#EBEEF5] bg-white px-5 py-[18px]">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-[#0E1114]">{isZh ? "面试日历" : "Interview calendar"}</p>
                                {availabilityLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1E3BFA]"/> : null}
                            </div>
                            <div className="mt-3.5 grid grid-cols-7 gap-1 text-center">
                                {mainCalendarWeekDays.map((day) => <span key={`weekday-${formatLocalDateValue(day)}`} className="text-[11px] text-[#B0B2B8]">{new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {weekday: "short"}).format(day)}</span>)}
                                {mainCalendarWeekDays.map((day) => {
                                    const dayKey = formatLocalDateValue(day);
                                    const isToday = dayKey === todayDateValue();
                                    const hasAvailable = availableDraftSlots.some((slot) => draftSlotRange(slot)?.dateKey === dayKey);
                                    const hasUnavailable = draftSlots.some((slot) => slot.status === "unavailable" && draftSlotRange(slot)?.dateKey === dayKey);
                                    const hasBooked = bookedSlots.some((slot) => availabilitySlotRange(slot)?.dateKey === dayKey);
                                    return (
                                        <div key={dayKey} className="flex h-10 flex-col items-center justify-center gap-0.5">
                                            <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-[13px]", isToday ? "bg-[#1E3BFA] text-white" : day.getDay() === 0 || day.getDay() === 6 ? "text-[#B0B2B8]" : "text-[#33353D]")}>{isToday ? (isZh ? "今" : day.getDate()) : day.getDate()}</span>
                                            <span className="flex h-1 items-center gap-0.5">{hasAvailable ? <i className="h-1 w-1 rounded-full bg-[#0CC991]"/> : null}{hasUnavailable ? <i className="h-1 w-1 rounded-full bg-[#B0B2B8]"/> : null}{hasBooked ? <i className="h-1 w-1 rounded-full bg-[#1E3BFA]"/> : null}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-3.5 flex flex-col gap-2">
                                {mainCalendarTasks.length ? mainCalendarTasks.slice(0, 4).map((task, index) => {
                                    const schedule = task.schedule!;
                                    const scheduledAt = new Date(schedule.scheduled_at || "");
                                    const endAt = new Date(scheduledAt.getTime() + Number(schedule.duration_minutes || 60) * 60000);
                                    const timeFormatter = new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {hour: "2-digit", minute: "2-digit", hour12: false});
                                    const methodLabel = schedule.interview_method === "video" ? (isZh ? "视频面试" : "Video") : schedule.interview_method === "phone" ? (isZh ? "电话面试" : "Phone") : (isZh ? "现场面试" : "Onsite");
                                    return (
                                        <button key={schedule.id} type="button" onClick={() => openTaskDetail(task)} className={cn("flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left", index % 2 === 0 ? "bg-[rgba(12,201,145,0.06)]" : "bg-[rgba(30,59,250,0.05)]")}>
                                            <span className={cn("h-[26px] w-[3px] shrink-0 rounded-sm", index % 2 === 0 ? "bg-[#0CC991]" : "bg-[#1E3BFA]")}/>
                                            <span className="min-w-0">
                                                <span className="block truncate text-xs text-[#0E1114]">{timeFormatter.format(scheduledAt)} - {timeFormatter.format(endAt)} · {task.candidate.name} · {candidateTitle(task, isZh)}</span>
                                                <span className="mt-0.5 block truncate text-[11px] text-[#86888F]">{schedule.round_name || "-"} · {methodLabel} · {schedule.meeting_room || schedule.location || schedule.video_tool || "-"}</span>
                                            </span>
                                        </button>
                                    );
                                }) : <p className="rounded-md bg-[#F7F8FA] px-3 py-5 text-center text-xs text-[#B0B2B8]">{isZh ? "本周暂无已安排面试" : "No interviews scheduled this week"}</p>}
                            </div>
                            <div className="mt-3.5 flex items-center gap-3.5 text-[11px] text-[#86888F]">
                                <span className="inline-flex items-center gap-1.5"><i className="h-[9px] w-[9px] rounded-sm bg-[rgba(12,201,145,0.25)]"/>{isZh ? "可面试" : "Available"}</span>
                                <span className="inline-flex items-center gap-1.5"><i className="h-[9px] w-[9px] rounded-sm bg-[#F2F3F5]"/>{isZh ? "不可面试" : "Unavailable"}</span>
                                <span className="inline-flex items-center gap-1.5"><i className="h-[9px] w-[9px] rounded-sm bg-[rgba(30,59,250,0.2)]"/>{isZh ? "已占用" : "Booked"}</span>
                            </div>
                        </section>
                    </aside>
                ) : null}
            </div>

            <Dialog open={availabilityDialogOpen} onOpenChange={handleAvailabilityDialogOpenChange}>
                <DialogContent className="flex h-[88vh] max-h-[88vh] flex-col overflow-hidden rounded-[10px] border-[#EBEEF5] bg-white p-0 text-[#0E1114] shadow-[0_12px_40px_rgba(14,17,20,0.2)] sm:max-w-[1120px]">
                    <DialogHeader className="shrink-0 border-b border-[#F2F3F5] px-6 py-[18px] pr-12">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <DialogTitle className="flex items-center gap-2 text-base font-semibold text-[#0E1114]">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]"><CalendarClock className="h-4 w-4"/></span>
                                    {isZh ? "设置面试时间" : "Set interview time"}
                                </DialogTitle>
                                <DialogDescription className="mt-1 pl-9 text-xs text-[#86888F]">
                                    {isZh ? "招聘人事排期时会查看这些时间段" : "HR uses these slots when scheduling interviews."}
                                </DialogDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                {availabilityDirty ? (
                                    <Badge variant="outline" className="h-6 rounded border-[rgba(255,171,36,0.35)] bg-[rgba(255,171,36,0.08)] text-xs font-normal text-[#D48806]">
                                        {isZh ? "未保存" : "Unsaved"}
                                    </Badge>
                                ) : null}
                                {availabilityLoading ? <Loader2 className="h-4 w-4 animate-spin text-[#1E3BFA]"/> : null}
                            </div>
                        </div>
                    </DialogHeader>

                    {availabilitySaveNotice ? (
                        <div
                            className={cn(
                                "mx-6 mt-4 flex items-center gap-2 rounded-md border px-4 py-2.5 text-xs",
                                availabilitySaveNotice.type === "success"
                                    ? "border-[rgba(12,201,145,0.28)] bg-[rgba(12,201,145,0.08)] text-[#0A9C71]"
                                    : "border-[rgba(245,63,63,0.28)] bg-[rgba(245,63,63,0.06)] text-[#F53F3F]",
                            )}
                        >
                            {availabilitySaveNotice.type === "success" ? <Check className="h-4 w-4 shrink-0"/> : <X className="h-4 w-4 shrink-0"/>}
                            <span>{availabilitySaveNotice.message}</span>
                        </div>
                    ) : null}

                    {availabilityCloseConfirmOpen ? (
                        <div className="mx-6 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[rgba(255,171,36,0.35)] bg-[rgba(255,171,36,0.08)] px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-xs font-medium text-[#D48806]">{isZh ? "面试时间尚未保存" : "Interview time changes are not saved"}</p>
                                <p className="mt-0.5 text-[11px] text-[#86888F]">{isZh ? "关闭后本次修改不会生效。" : "Closing will discard the current edits."}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <Button variant="outline" size="sm" className="h-7 rounded-md border-[#E6E7EB] bg-white text-xs text-[#33353D] shadow-none hover:bg-[#F7F8FA]" onClick={() => setAvailabilityCloseConfirmOpen(false)}>
                                    {isZh ? "继续编辑" : "Keep editing"}
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 rounded-md border-[rgba(245,63,63,0.35)] bg-white text-xs text-[#F53F3F] shadow-none hover:bg-[rgba(245,63,63,0.05)]" onClick={discardAvailabilityDraftChanges}>
                                    {isZh ? "放弃更改" : "Discard"}
                                </Button>
                            </div>
                        </div>
                    ) : null}

                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-5 pt-4">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="inline-flex rounded-full border border-[#E6E7EB] bg-white p-1">
                                {([
                                    ["available", isZh ? "可面试时间" : "Available time"],
                                    ["unavailable", isZh ? "不可面试时间" : "Unavailable time"],
                                ] as Array<[AvailabilitySlotStatus, string]>).map(([mode, label]) => {
                                    const active = availabilityEditMode === mode;
                                    return (
                                        <button
                                            key={mode}
                                            type="button"
                                            className={cn(
                                                "h-8 min-w-[128px] rounded-full px-4 text-xs transition",
                                                active
                                                    ? "bg-[#1E3BFA] font-medium text-white"
                                                    : "text-[#86888F] hover:bg-[#F7F8FA] hover:text-[#33353D]",
                                            )}
                                            onClick={() => {
                                                setAvailabilityEditMode(mode);
                                                setAvailabilitySaveNotice(null);
                                            }}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-xs text-[#86888F]">
                                {isZh ? "在下方周历中拖拽选择时间段；灰色为不可面试，蓝色为已有面试占用" : "Drag on the calendar to select time; gray is unavailable and blue is booked."}
                            </p>
                        </div>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-8 rounded-md border-[#E6E7EB] bg-white p-0 text-[#33353D] shadow-none hover:bg-[#F7F8FA]"
                                    disabled={availabilityWeekStart.getTime() <= availabilityMinWeekStart.getTime()}
                                    onClick={() => setAvailabilityWeekStart((current) => addDays(current, -7))}
                                    aria-label={isZh ? "上一周" : "Previous week"}
                                >
                                    <ChevronLeft className="h-4 w-4"/>
                                </Button>
                                <div className="min-w-[220px] text-sm font-medium text-[#33353D]">{availabilityWeekLabel}</div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-8 rounded-md border-[#E6E7EB] bg-white p-0 text-[#33353D] shadow-none hover:bg-[#F7F8FA]"
                                    disabled={availabilityWeekStart.getTime() >= availabilityMaxWeekStart.getTime()}
                                    onClick={() => setAvailabilityWeekStart((current) => addDays(current, 7))}
                                    aria-label={isZh ? "下一周" : "Next week"}
                                >
                                    <ChevronRight className="h-4 w-4"/>
                                </Button>
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[#EBEEF5] bg-white">
                            <div className="min-w-[920px]">
                                <div
                                    className="sticky top-0 z-40 grid border-b border-[#F2F3F5] bg-white"
                                    style={{gridTemplateColumns: "56px repeat(7, minmax(120px, 1fr))"}}
                                >
                                    <div className="border-r border-[#F2F3F5] bg-[#FAFAFB]"/>
                                    {availabilityWeekDays.map((day) => {
                                        const dayKey = formatLocalDateValue(day);
                                        const today = dayKey === scheduleToday;
                                        return (
                                            <div key={dayKey} className={cn("border-l border-[#F2F3F5] px-3 py-3 text-xs", today ? "bg-[rgba(30,59,250,0.05)] text-[#1E3BFA]" : "bg-white text-[#33353D]")}>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="truncate font-medium">{today ? (isZh ? "今天" : "Today") : formatCalendarDateLabel(day, isZh)}</span>
                                                    <span className="text-[11px] text-[#B0B2B8]">
                                                        {draftSlots.filter((slot) => draftSlotRange(slot)?.dateKey === dayKey).length}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div
                                    className="grid"
                                    style={{gridTemplateColumns: "56px repeat(7, minmax(120px, 1fr))"}}
                                >
                                    <div className="relative border-r border-[#F2F3F5] bg-[#FAFAFB]" style={{height: AVAILABILITY_CALENDAR_HEIGHT}}>
                                        {AVAILABILITY_CALENDAR_HOURS.map((minutes) => (
                                            <div
                                                key={minutes}
                                                className="absolute right-2 text-[11px] text-[#B0B2B8]"
                                                style={{
                                                    top: minutes === AVAILABILITY_CALENDAR_START_MINUTES
                                                        ? 2
                                                        : ((minutes - AVAILABILITY_CALENDAR_START_MINUTES) / 60) * AVAILABILITY_HOUR_HEIGHT - 7,
                                                }}
                                            >
                                                {formatTimeValue(minutes)}
                                            </div>
                                        ))}
                                    </div>
                                    {availabilityWeekDays.map((day) => renderAvailabilityDayColumn(day))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#F2F3F5] px-6 py-4">
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#86888F]">
                            <button type="button" className="mr-1 text-xs text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => {
                                const weekKeys = new Set(availabilityWeekDays.map(formatLocalDateValue));
                                setDraftSlots((current) => current.filter((slot) => {
                                    const range = draftSlotRange(slot);
                                    return !range || !weekKeys.has(range.dateKey);
                                }));
                                setAvailabilitySaveNotice(null);
                            }}>{isZh ? "清空本周已选" : "Clear selected week"}</button>
                            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[rgba(12,201,145,0.25)]"/>{isZh ? "可面试" : "Available"}</span>
                            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#F2F3F5] ring-1 ring-[#E6E7EB]"/>{isZh ? "不可面试" : "Unavailable"}</span>
                            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[rgba(30,59,250,0.2)]"/>{isZh ? "已占用" : "Booked"}</span>
                            <span>{isZh
                                ? `共 ${currentWeekAvailableDraftCount} 段可面试 · ${currentWeekUnavailableDraftCount} 段不可面试 · ${currentWeekBookedCount} 段已占用`
                                : `${currentWeekAvailableDraftCount} available · ${currentWeekUnavailableDraftCount} unavailable · ${currentWeekBookedCount} booked`}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" className="h-9 rounded-md border-[#E6E7EB] bg-white px-4 text-sm font-normal text-[#33353D] shadow-none hover:bg-[#F7F8FA]" onClick={requestCloseAvailabilityDialog}>
                                {isZh ? "取消" : "Cancel"}
                            </Button>
                            <Button className="h-9 rounded-md bg-[#1E3BFA] px-4 text-sm text-white shadow-none hover:bg-[#0F23D9]" disabled={availabilitySaving || availabilitySaveNotice?.type === "success"} onClick={() => void saveAvailability()}>
                                {availabilitySaving ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                {isZh ? "保存" : "Save"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {selectedTask && typeof document !== "undefined" ? createPortal(
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(14,17,20,0.45)] px-4 py-5" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) closeTaskDetail();
                }}>
                    <div className="flex h-[92vh] w-full max-w-[1360px] flex-col overflow-hidden rounded-[10px] bg-white shadow-[0_12px_40px_rgba(14,17,20,0.2)]">
                            <div className="shrink-0 border-b border-[#F2F3F5] bg-white px-6 py-[18px]">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex min-w-0 items-center gap-3.5">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1E3BFA] text-[15px] font-medium text-white">
                                            {(selectedDetailCandidate?.name || selectedTask.candidate.name || "?").trim().charAt(0) || "?"}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2.5">
                                                <h3 className="truncate text-[17px] font-semibold text-[#0E1114]">
                                                    {selectedDetailCandidate?.name || selectedTask.candidate.name || (isZh ? "未命名候选人" : "Unnamed")}
                                                </h3>
                                                <span className="text-xs text-[#86888F]">{selectedDetailCandidate?.candidate_code || selectedTask.candidate.candidate_code}</span>
                                                <Badge variant="outline" className={cn("h-[22px] rounded px-2 text-xs font-normal", scheduleBadgeClass(selectedTask.schedule?.status || "needs_scheduling"))}>
                                                    {labelForScheduleStatus(selectedTask.schedule?.status || "needs_scheduling", isZh)}
                                                </Badge>
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#86888F]">
                                                <span className="inline-flex items-center gap-1.5"><Briefcase className="h-[13px] w-[13px] text-[#B0B2B8]"/>{candidateTitle(selectedTask, isZh)}</span>
                                                <span className="inline-flex items-center gap-1.5"><GraduationCap className="h-[13px] w-[13px] text-[#B0B2B8]"/>{selectedDetailCandidate?.education || readStructuredText(selectedEducation, ["degree", "education", "学历"]) || "-"}</span>
                                                <span className="inline-flex items-center gap-1.5"><Phone className="h-[13px] w-[13px] text-[#B0B2B8]"/>{selectedDetailCandidate?.phone || readStructuredText(selectedBasicInfo, ["phone", "mobile", "电话"]) || "-"}</span>
                                                <span className="inline-flex items-center gap-1.5"><Mail className="h-[13px] w-[13px] text-[#B0B2B8]"/>{selectedDetailCandidate?.email || readStructuredText(selectedBasicInfo, ["email", "mail", "邮箱"]) || "-"}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button type="button" className="p-1 text-[#86888F] hover:text-[#0E1114]" onClick={closeTaskDetail}>
                                        <X className="h-[18px] w-[18px]"/>
                                    </button>
                                </div>
                            </div>

                            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_420px]">
                            <section className="min-w-0 overflow-auto border-r border-[#F2F3F5] bg-white">
                            <div className="space-y-3.5 px-6 py-5">
                                {selectedCandidateDetailError ? (
                                    <div className="rounded-md border border-[rgba(255,171,36,0.35)] bg-[rgba(255,171,36,0.08)] px-4 py-3 text-xs text-[#D48806]">
                                        {isZh ? `候选人详情加载失败：${selectedCandidateDetailError}` : `Failed to load candidate detail: ${selectedCandidateDetailError}`}
                                    </div>
                                ) : null}

                                <div className="grid gap-3 md:grid-cols-2">
                                    <section className="rounded-[10px] bg-[#F7F8FA] p-4">
                                        <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#0E1114]">
                                            <Sparkles className="h-3.5 w-3.5 text-[#1E3BFA]"/>
                                            {isZh ? "候选人亮点" : "Candidate highlights"}
                                        </div>
                                        {selectedCandidateDetailLoading && !selectedCandidateDetail ? (
                                            <p className="text-xs text-[#33353D]">{isZh ? "正在加载候选人资料..." : "Loading profile..."}</p>
                                        ) : selectedHighlights.length ? (
                                            <ul className="space-y-1 text-xs leading-[1.9] text-[#33353D]">
                                                {selectedHighlights.map((item, index) => (
                                                    <li key={`${index}-${item}`} className="line-clamp-2">• {item}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-xs leading-[1.9] text-[#33353D]">{isZh ? "暂无结构化亮点，面试时可结合原始简历判断。" : "No structured highlights yet."}</p>
                                        )}
                                    </section>
                                    <section className="rounded-[10px] border border-[#F2F3F5] bg-[#FAFAFB] p-4">
                                        <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#0E1114]">
                                            <UserRound className="h-3.5 w-3.5 text-[#86888F]"/>
                                            {isZh ? "基础资料" : "Profile"}
                                        </div>
                                        <div className="grid gap-x-3 gap-y-1.5 text-xs text-[#33353D] sm:grid-cols-2">
                                            <span>{isZh ? "年龄" : "Age"}：{selectedDetailCandidate?.age || readStructuredText(selectedBasicInfo, ["age", "年龄"]) || "-"}</span>
                                            <span>{isZh ? "城市" : "City"}：{selectedDetailCandidate?.city || selectedDetailCandidate?.expected_city || readStructuredText(selectedBasicInfo, ["city", "location", "城市"]) || "-"}</span>
                                            <span>{isZh ? "经验" : "Experience"}：{selectedDetailCandidate?.years_of_experience || readStructuredText(selectedBasicInfo, ["years_of_experience", "experience", "工作年限"]) || "-"}</span>
                                            <span>{isZh ? "公司" : "Company"}：{selectedDetailCandidate?.current_company || readStructuredText(selectedWork, ["company", "company_name", "公司"]) || "-"}</span>
                                        </div>
                                        {selectedSkills.length ? (
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {selectedSkills.slice(0, 5).map((skill) => <span key={skill} className="rounded bg-[#F2F3F5] px-2 py-1 text-[11px] text-[#86888F]">{skill}</span>)}
                                            </div>
                                        ) : null}
                                        {selectedConcerns.length ? (
                                            <div className="mt-2 rounded-md bg-[rgba(255,171,36,0.08)] px-2.5 py-2 text-[11px] leading-[1.6] text-[#D48806]">
                                                {selectedConcerns.map((item, index) => <p key={`${index}-${item}`}>• {item}</p>)}
                                            </div>
                                        ) : null}
                                    </section>
                                </div>

                                <section className="overflow-hidden rounded-[10px] border border-[#EBEEF5] bg-white">
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F2F3F5] px-4 py-3">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            <FileText className="h-3.5 w-3.5 text-[#1E3BFA]"/>
                                            <p className="text-[13px] font-semibold text-[#0E1114]">{isZh ? "简历" : "Resume"}</p>
                                            <Badge variant="outline" className="h-[22px] rounded border-0 bg-transparent px-1 text-[11px] font-normal text-[#86888F]">
                                                {selectedResumeFile ? selectedResumeFile.parse_status : (isZh ? "暂无文件" : "No file")}
                                            </Badge>
                                        </div>
                                        <div className="flex min-w-0 flex-1 justify-end gap-2">
                                            {selectedResumeFiles.length ? (
                                                <select
                                                    value={selectedResumeFile ? String(selectedResumeFile.id) : ""}
                                                    onChange={(event) => setSelectedResumeFileId(Number(event.target.value))}
                                                    className="h-7 max-w-[300px] rounded-md border border-[#E6E7EB] bg-white px-2.5 text-xs text-[#33353D] outline-none focus:border-[#1E3BFA]"
                                                >
                                                    {selectedResumeFiles.map((file) => (
                                                        <option key={file.id} value={file.id}>{file.original_name}</option>
                                                    ))}
                                                </select>
                                            ) : null}
                                            {resumePreviewUrl && selectedResumeFile ? (
                                                <>
                                                    <Button variant="outline" size="sm" className="h-7 rounded-md border-[#E6E7EB] bg-white px-2.5 text-xs font-normal text-[#33353D] shadow-none hover:bg-[#F7F8FA]" onClick={() => window.open(resumePreviewUrl, "_blank", "noopener,noreferrer")}>
                                                        <ExternalLink className="h-3.5 w-3.5"/>
                                                        {isZh ? "新窗口" : "Open"}
                                                    </Button>
                                                    <Button variant="outline" size="sm" className="h-7 rounded-md border-[#E6E7EB] bg-white px-2.5 text-xs font-normal text-[#33353D] shadow-none hover:bg-[#F7F8FA]" asChild>
                                                        <a href={resumePreviewUrl} download={selectedResumeFile.original_name}>
                                                            <Download className="h-3.5 w-3.5"/>
                                                            {isZh ? "下载" : "Download"}
                                                        </a>
                                                    </Button>
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="relative h-[420px] min-h-[420px] overflow-hidden bg-[#FAFAFB]">
                                        {resumePreviewLoading || ((resumePreviewBlob || resumePreviewUrl) && !resumePreviewReady) ? (
                                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/95 text-[#86888F]">
                                                <Loader2 className="h-7 w-7 animate-spin text-[#1E3BFA]"/>
                                                <span className="text-xs">{isZh ? "正在加载原始简历..." : "Loading resume..."}</span>
                                            </div>
                                        ) : null}
                                        {resumePreviewBlob && selectedResumeIsPdf && !resumePreviewFallback ? (
                                            <div className={cn("absolute inset-0 bg-white transition-opacity duration-150", resumePreviewReady ? "opacity-100" : "opacity-0")}>
                                                <InterviewResumePdfPreview
                                                    blob={resumePreviewBlob}
                                                    fileName={selectedResumeFile?.original_name || "Resume"}
                                                    isZh={isZh}
                                                    onReady={() => setResumePreviewReady(true)}
                                                    onError={(message) => {
                                                        setResumePreviewFallback(true);
                                                        setResumePreviewReady(false);
                                                        setResumePreviewError(message);
                                                    }}
                                                />
                                            </div>
                                        ) : resumePreviewUrl ? (
                                            <iframe
                                                src={`${resumePreviewUrl}#toolbar=0&navpanes=0&view=FitH&scrollbar=0`}
                                                className={cn(
                                                    "absolute -left-7 -top-1 h-[calc(100%+8px)] w-[calc(100%+56px)] border-0 bg-white transition-opacity duration-150",
                                                    resumePreviewReady ? "opacity-100" : "opacity-0",
                                                )}
                                                style={{colorScheme: "light", backgroundColor: "#fff"}}
                                                title={selectedResumeFile?.original_name || "Resume"}
                                                onLoad={() => setResumePreviewReady(true)}
                                            />
                                        ) : !resumePreviewLoading ? (
                                            <div className="flex h-full items-center justify-center px-6 text-center">
                                                <div>
                                                    <FileText className="mx-auto h-10 w-10 text-[#B0B2B8]"/>
                                                    <p className="mt-3 text-[13px] font-medium text-[#33353D]">{selectedResumeFile ? (isZh ? "简历暂无法内嵌显示" : "Resume preview unavailable") : (isZh ? "暂无简历文件" : "No resume file")}</p>
                                                    <p className="mt-1 text-[11px] text-[#B0B2B8]">
                                                        {resumePreviewError || (selectedResumeFile ? (isZh ? `${selectedResumeFile.file_ext || "文件"} ${formatBytes(selectedResumeFile.file_size)}` : "Use download to view the file.") : (isZh ? "该候选人没有可预览的简历文件。" : "No resume file attached."))}
                                                    </p>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                </section>
                            </div>
                        </section>

                        <aside className="flex min-h-0 flex-col bg-[#FAFAFB]">
                            <div className="shrink-0 border-b border-[#F2F3F5] bg-white px-[22px] py-4">
                                <p className="text-[15px] font-semibold text-[#0E1114]">{isZh ? "面试评价" : "Interview evaluation"}</p>
                                <p className="mt-[3px] text-[11px] text-[#86888F]">{isZh ? "先查看左侧候选人资料，再提交本轮结论。" : "Review the candidate profile, then submit this round."}</p>
                            </div>
                            <div className="min-h-0 flex-1 space-y-4 overflow-auto px-[22px] py-[18px]">
                                <div className="rounded-[10px] border border-[#EBEEF5] bg-white p-4">
                                    <div className="grid gap-3 text-xs">
                                        <div>
                                            <p className="text-[11px] text-[#B0B2B8]">{isZh ? "流程状态" : "Status"}</p>
                                            <p className="mt-0.5 text-[13px] font-medium text-[#0E1114]">{labelForScheduleStatus(selectedTask.schedule?.status || "needs_scheduling", isZh)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[11px] text-[#B0B2B8]">{isZh ? "面试轮次" : "Round"}</p>
                                            <p className="mt-0.5 text-[13px] font-medium text-[#0E1114]">{selectedTask.schedule?.round_name || (isZh ? "待安排" : "TBD")}</p>
                                        </div>
                                        <div>
                                            <p className="text-[11px] text-[#B0B2B8]">{isZh ? "面试官" : "Interviewer"}</p>
                                            <p className="mt-0.5 text-[13px] font-medium text-[#0E1114]">{selectedTask.schedule?.interviewer_name || selectedTask.schedule?.interviewer_user_code || "-"}</p>
                                        </div>
                                        <div className="space-y-2 border-t border-[#F2F3F5] pt-3 text-xs text-[#33353D]">
                                            <p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-[#B0B2B8]"/>{selectedTask.schedule?.scheduled_at ? formatDateTime(selectedTask.schedule.scheduled_at) : (isZh ? "时间待定" : "Time TBD")}</p>
                                            <p className="flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5 text-[#B0B2B8]"/>{selectedTask.schedule?.duration_minutes ? `${selectedTask.schedule.duration_minutes} ${isZh ? "分钟" : "minutes"}` : "-"}</p>
                                            <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-[#B0B2B8]"/>{selectedTask.schedule?.location || selectedTask.schedule?.meeting_room || (isZh ? "地点待定" : "Location TBD")}</p>
                                            <p className="flex items-center gap-2 break-all"><Video className="h-3.5 w-3.5 shrink-0 text-[#B0B2B8]"/>{selectedTask.schedule?.meeting_link || selectedTask.schedule?.video_tool || (isZh ? "会议链接待定" : "Meeting link TBD")}</p>
                                        </div>
                                        {selectedTask.schedule?.notes ? <p className="rounded-md bg-[#F7F8FA] px-3 py-2 text-xs leading-5 text-[#86888F]">{selectedTask.schedule.notes}</p> : null}
                                        {canEditTaskSchedule(selectedTask) ? (
                                            <Button
                                                className="mt-1 h-[34px] w-full rounded-lg bg-[#1E3BFA] text-[13px] text-white shadow-none hover:bg-[#0F23D9]"
                                                onClick={() => openEditScheduleDrawer(selectedTask)}
                                            >
                                                <PencilLine className="h-4 w-4"/>
                                                {isZh ? "编辑面试" : "Edit interview"}
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>

                                {selectedTask.schedule ? (
                                    <div className="rounded-[10px] border border-[#EBEEF5] bg-white p-4">
                                        <div className="mb-2.5 flex items-center justify-between">
                                            <p className="text-[13px] font-semibold text-[#0E1114]">{isZh ? "本轮结论" : "Conclusion"}</p>
                                            <Badge variant="outline" className={cn("h-[22px] rounded px-2 text-xs font-normal", scheduleBadgeClass(selectedTask.schedule.status))}>
                                                {labelForScheduleStatus(selectedTask.schedule.status, isZh)}
                                            </Badge>
                                        </div>
                                        <Textarea
                                            value={canSubmitTaskResult(selectedTask) ? (commentBySchedule[selectedTask.schedule.id] || "") : (selectedTask.schedule.result_comment || "")}
                                            onChange={(event) => setCommentBySchedule((current) => ({...current, [selectedTask.schedule!.id]: event.target.value}))}
                                            disabled={!canSubmitTaskResult(selectedTask)}
                                            placeholder={resultLockMessage(selectedTask) || (isZh ? "填写面试结论、风险点或下一轮建议" : "Add interview feedback")}
                                            className="min-h-[120px] resize-none rounded-md border-[#E6E7EB] bg-white px-3 py-2.5 text-xs leading-[1.7] text-[#33353D] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-0 disabled:bg-[#FAFAFB] disabled:opacity-100"
                                        />
                                        {resultLockMessage(selectedTask) ? <p className="mt-2 text-[11px] text-[#86888F]">{resultLockMessage(selectedTask)}</p> : null}
                                        <p className="mb-2 mt-3 text-xs text-[#86888F]">{isZh ? "提交结论" : "Submit conclusion"}</p>
                                        {renderResultActions(selectedTask, true)}
                                    </div>
                                ) : canManageInterview ? (
                                    <div className="rounded-[10px] border border-[#EBEEF5] bg-white p-4">
                                        <p className="text-[13px] font-medium text-[#0E1114]">{isZh ? "待安排面试" : "Needs scheduling"}</p>
                                        <p className="mt-1 text-xs leading-5 text-[#86888F]">{isZh ? "为候选人选择面试官和面试时间后，面试官会在这里看到完整资料。" : "Schedule interviewer and time first."}</p>
                                        <Button className="mt-3 h-[34px] w-full rounded-lg bg-[#1E3BFA] text-[13px] text-white shadow-none hover:bg-[#0F23D9]" onClick={() => openScheduleDrawer(selectedTask)}>
                                            {isZh ? "安排面试" : "Schedule"}
                                            <ChevronRight className="h-4 w-4"/>
                                        </Button>
                                    </div>
                                ) : null}
                            </div>
                        </aside>
                        </div>
                    </div>
                </div>,
                document.body,
            ) : null}

            {scheduleTask && typeof document !== "undefined" ? createPortal(
                <div className="fixed inset-0 z-[95] flex justify-end bg-[rgba(14,17,20,0.45)]" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) closeScheduleDrawer();
                }}>
                    <aside className="flex h-full w-full max-w-[640px] flex-col overflow-hidden bg-white shadow-[-8px_0_24px_rgba(14,17,20,0.12)]">
                        <div className="shrink-0 border-b border-[#F2F3F5] bg-white px-6 pb-3.5 pt-[18px]">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-base font-semibold text-[#0E1114]">
                                        {scheduleEditingId ? (isZh ? "编辑面试" : "Edit interview") : (isZh ? "安排面试" : "Schedule interview")}
                                    </p>
                                    <p className="mt-1 text-xs text-[#86888F]">{scheduleTask.candidate.name} · {candidateTitle(scheduleTask, isZh)}</p>
                                </div>
                                <button type="button" className="pt-0.5 text-[#86888F] hover:text-[#0E1114]" onClick={closeScheduleDrawer}>
                                    <X className="h-4 w-4"/>
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 space-y-4 overflow-auto px-6 py-5">
                            <section className="rounded-lg border border-[#EBEEF5] p-4">
                                <p className="mb-3.5 text-[13px] font-semibold text-[#0E1114]">{isZh ? "面试信息" : "Interview info"}</p>
                                <div className="grid gap-3.5 sm:grid-cols-2">
                                    <label className="space-y-1.5 sm:col-span-2">
                                        <span className="text-xs text-[#33353D]"><span className="mr-0.5 text-[#F53F3F]">*</span>{isZh ? "面试主题" : "Subject"}</span>
                                        <Input
                                            value={scheduleForm.subject}
                                            onChange={(event) => {
                                                clearScheduleFormError("subject");
                                                setScheduleForm((current) => ({...current, subject: event.target.value}));
                                            }}
                                            className={cn("h-[34px] rounded border-[#E6E7EB] bg-white px-3 text-xs text-[#0E1114] shadow-none focus-visible:border-[#1E3BFA] focus-visible:ring-0", scheduleFormErrors.subject && scheduleRequiredErrorClass)}
                                        />
                                        {renderScheduleFormError("subject")}
                                    </label>
                                    <div className="space-y-2 sm:col-span-2">
                                        <span className="text-xs text-[#33353D]"><span className="mr-0.5 text-[#F53F3F]">*</span>{isZh ? "面试轮次" : "Round"}</span>
                                        <div className={cn("flex flex-wrap gap-2", scheduleFormErrors.round_name && "rounded border border-[#F53F3F] bg-[rgba(245,63,63,0.04)] p-1")}>
                                            {INTERVIEW_ROUND_OPTIONS.map((option) => {
                                                const active = scheduleForm.round_name === option.value;
                                                return (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        className={cn("h-7 rounded-md border px-3.5 text-xs transition", active ? "border-[#1E3BFA] bg-[rgba(30,59,250,0.05)] text-[#1E3BFA]" : "border-[#E6E7EB] bg-white text-[#33353D] hover:border-[#1E3BFA] hover:text-[#1E3BFA]")}
                                                        onClick={() => {
                                                            clearScheduleFormError("round_name");
                                                            setScheduleForm((current) => ({...current, round_name: option.value, round_index: String(option.roundIndex)}));
                                                        }}
                                                    >{isZh ? option.labelZh : option.labelEn}</button>
                                                );
                                            })}
                                        </div>
                                        {renderScheduleFormError("round_name")}
                                    </div>
                                    <div className="space-y-2 sm:col-span-2">
                                        <span className="text-xs text-[#33353D]"><span className="mr-0.5 text-[#F53F3F]">*</span>{isZh ? "面试方式" : "Method"}</span>
                                        <div className={cn("grid grid-cols-3 gap-2 rounded-md", scheduleFormErrors.interview_method && "border border-[#F53F3F] bg-[rgba(245,63,63,0.04)] p-1")}>
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
                                                            "flex h-[34px] items-center justify-center gap-1.5 rounded-md border px-2 text-xs transition",
                                                            active
                                                                ? "border-[#1E3BFA] bg-[rgba(30,59,250,0.05)] font-medium text-[#1E3BFA]"
                                                                : "border-[#E6E7EB] bg-white text-[#33353D] hover:border-[#1E3BFA] hover:text-[#1E3BFA]",
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
                                    <label className="space-y-2 sm:col-span-2">
                                        <span className="text-xs text-[#33353D]"><span className="mr-0.5 text-[#F53F3F]">*</span>{isZh ? "面试官" : "Interviewer"}</span>
                                        <select
                                            value={scheduleForm.interviewer_user_code}
                                            onChange={(event) => {
                                                clearScheduleFormError("interviewer_user_code");
                                                const reviewer = interviewerOptions.find((item) => item.user_code === event.target.value);
                                                setScheduleForm((current) => ({
                                                    ...current,
                                                    interviewer_user_code: event.target.value,
                                                    interviewer_name: reviewer ? reviewerLabel(reviewer) : "",
                                                    availability_slot_id: "",
                                                    scheduled_at: "",
                                                }));
                                                setScheduleSlotsOpen(false);
                                            }}
                                            className={cn("h-[34px] w-full rounded border border-[#E6E7EB] bg-white px-3 text-xs text-[#0E1114] outline-none focus:border-[#1E3BFA]", scheduleFormErrors.interviewer_user_code && scheduleRequiredErrorClass)}
                                        >
                                            <option value="">{interviewerLoading ? (isZh ? "正在加载面试官..." : "Loading...") : (isZh ? "选择面试官" : "Select interviewer")}</option>
                                            {interviewerOptions.map((reviewer) => (
                                                <option key={reviewer.user_code} value={reviewer.user_code}>
                                                    {reviewerLabel(reviewer)} · {reviewer.user_code}
                                                </option>
                                            ))}
                                        </select>
                                        {renderScheduleFormError("interviewer_user_code")}
                                    </label>
                                </div>
                            </section>

                            <section className="rounded-lg border border-[#EBEEF5] p-4">
                                <p className="mb-3.5 text-[13px] font-semibold text-[#0E1114]">{isZh ? "时间安排" : "Schedule time"}</p>
                                <div className="grid gap-3.5 sm:grid-cols-2">
                                    <label className="relative space-y-2 sm:col-span-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-xs text-[#33353D]"><span className="mr-0.5 text-[#F53F3F]">*</span>{isZh ? "日期时间" : "Date and time"}</span>
                                            <div className="flex shrink-0 items-center gap-1.5">
                                                {scheduleSlotsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1E3BFA]"/> : null}
                                                <button
                                                    type="button"
                                                    disabled={!scheduleForm.interviewer_user_code}
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        setScheduleSlotsOpen((open) => !open);
                                                    }}
                                                    className={cn(
                                                        "text-xs font-normal text-[#0F23D9] underline-offset-2 hover:text-[#1E3BFA] hover:underline disabled:cursor-not-allowed disabled:text-[#B0B2B8] disabled:no-underline",
                                                    )}
                                                >
                                                    {scheduleSlotsOpen ? (isZh ? "收起面试官日程" : "Hide interviewer calendar") : (isZh ? "查看面试官日程" : "View interviewer calendar")}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[minmax(0,1fr)_132px_auto_152px] items-start gap-2">
                                            <div className="min-w-0">
                                                <button
                                                    type="button"
                                                    onClick={() => setScheduleDatePickerOpen((open) => !open)}
                                                    className={cn(
                                                        "flex h-[34px] min-w-0 items-center justify-between rounded border bg-white px-3 text-left text-xs outline-none transition hover:border-[#1E3BFA]",
                                                        scheduleDatePart ? "border-[#E6E7EB] text-[#0E1114]" : "border-[#E6E7EB] text-[#B0B2B8]",
                                                        scheduleFormErrors.scheduled_date && scheduleRequiredErrorClass,
                                                    )}
                                                >
                                                    <TruncatedTooltipText text={formatDateDisplay(scheduleDatePart, isZh)}>
                                                        {formatDateDisplay(scheduleDatePart, isZh)}
                                                    </TruncatedTooltipText>
                                                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[#B0B2B8]"/>
                                                </button>
                                                {renderScheduleFormError("scheduled_date")}
                                            </div>
                                            <div className="min-w-0">
                                                <TimeSelect
                                                    value={scheduleStartTimePart}
                                                    options={scheduleStartTimeOptions}
                                                    placeholder={isZh ? "开始" : "Start"}
                                                    buttonClassName={scheduleFormErrors.scheduled_start_time ? scheduleRequiredErrorClass : undefined}
                                                    onChange={(nextTime) => {
                                                        clearScheduleFormError("scheduled_date");
                                                        clearScheduleFormError("scheduled_start_time");
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
                                                {renderScheduleFormError("scheduled_start_time")}
                                            </div>
                                            <span className="pt-2 text-xs text-[#B0B2B8]">~</span>
                                            <div className="min-w-0">
                                                <TimeSelect
                                                    value={scheduleEndTimePart}
                                                    disabled={!scheduleStartTimePart}
                                                    options={scheduleEndTimeSelectOptions}
                                                    placeholder={isZh ? "结束" : "End"}
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
                                        {scheduleSlotsOpen ? (
                                            <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-[#EBEEF5] bg-[#FAFAFB] p-1.5">
                                                {scheduleForm.interviewer_user_code && scheduleSlots.length > 0 ? scheduleSlots.map((slot) => {
                                                    const active = scheduleForm.availability_slot_id === String(slot.id);
                                                    const slotLabel = formatRange(slot.start_at, slot.end_at);
                                                    return (
                                                        <button
                                                            key={slot.id}
                                                            type="button"
                                                            onClick={() => applyScheduleSlot(String(slot.id))}
                                                            className={cn(
                                                                "flex h-8 w-full min-w-0 items-center rounded-md px-2.5 text-left text-xs transition",
                                                                active
                                                                    ? "bg-[#1E3BFA] text-white"
                                                                    : "text-[#33353D] hover:bg-white hover:text-[#1E3BFA]",
                                                            )}
                                                        >
                                                            <TruncatedTooltipText text={slotLabel}>{slotLabel}</TruncatedTooltipText>
                                                        </button>
                                                    );
                                                }) : (
                                                    <p className="px-2.5 py-3 text-center text-xs text-[#86888F]">
                                                        {scheduleSlotsLoading
                                                            ? (isZh ? "正在加载面试官日程..." : "Loading interviewer calendar...")
                                                            : scheduleForm.interviewer_user_code
                                                                ? (isZh ? "该面试官暂无可选时间，可手动填写时间。" : "No available slots. You can set time manually.")
                                                                : (isZh ? "先选择面试官，再查看日程。" : "Select interviewer first.")}
                                                    </p>
                                                )}
                                            </div>
                                        ) : null}
                                        {scheduleDatePickerOpen ? (
                                            <div className="absolute left-0 top-[64px] z-20 w-[360px] rounded-lg border border-[#EBEEF5] bg-white p-3 shadow-[0_8px_24px_rgba(14,17,20,0.12)]">
                                                <div className="mb-2 flex items-center justify-between">
                                                    <span className="text-xs font-medium text-[#33353D]">{isZh ? "选择面试日期" : "Select date"}</span>
                                                    <button
                                                        type="button"
                                                        className="text-xs text-[#0F23D9] hover:text-[#1E3BFA]"
                                                        onClick={() => {
                                                            clearScheduleFormError("scheduled_date");
                                                            clearScheduleFormError("scheduled_start_time");
                                                            clearScheduleFormError("scheduled_end_time");
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
                                                                    clearScheduleFormError("scheduled_date");
                                                                    clearScheduleFormError("scheduled_start_time");
                                                                    clearScheduleFormError("scheduled_end_time");
                                                                    const nextTime = scheduleStartTimePart || "09:00";
                                                                    setScheduleForm((current) => ({
                                                                        ...current,
                                                                        scheduled_at: combineLocalDateTime(date, nextTime),
                                                                        availability_slot_id: "",
                                                                    }));
                                                                    setScheduleDatePickerOpen(false);
                                                                }}
                                                                className={cn(
                                                                    "flex h-10 flex-col items-center justify-center rounded-md text-xs transition",
                                                                    active
                                                                        ? "bg-[#1E3BFA] text-white"
                                                                        : isToday
                                                                            ? "bg-[rgba(30,59,250,0.06)] text-[#1E3BFA] ring-1 ring-[rgba(30,59,250,0.2)]"
                                                                            : "text-[#33353D] hover:bg-[#F7F8FA] hover:text-[#1E3BFA]",
                                                                )}
                                                            >
                                                                <span>{parsed ? parsed.getDate() : date.slice(-2)}</span>
                                                                <span className={cn("mt-0.5 text-[10px]", active ? "text-white/80" : isToday ? "text-[#1E3BFA]" : "text-[#B0B2B8]")}>
                                                                    {parsed ? new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {weekday: "short"}).format(parsed) : ""}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : null}
                                        <p className="text-[11px] text-[#B0B2B8]">
                                            {scheduleStartTimePart ? (isZh ? `当前时长 ${formatDurationText(effectiveScheduleDurationMinutes, isZh)}` : `Duration ${formatDurationText(effectiveScheduleDurationMinutes, isZh)}`) : (isZh ? "先选日期和开始时间，再选择结束时间。" : "Select date and start time, then end time.")}
                                        </p>
                                    </label>
                                    {scheduleForm.interview_method === "onsite" ? (
                                        <>
                                            <label className="space-y-1.5">
                                                <span className="text-xs text-[#33353D]">{isZh ? "面试地点" : "Location"}</span>
                                                <Input value={scheduleForm.location} onChange={(event) => setScheduleForm((current) => ({...current, location: event.target.value}))} placeholder={isZh ? "请输入详细地址" : "Address"} className="h-[34px] rounded border-[#E6E7EB] bg-white px-3 text-xs text-[#0E1114] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-0"/>
                                            </label>
                                            <label className="space-y-1.5">
                                                <span className="text-xs text-[#33353D]">{isZh ? "会议室" : "Room"}</span>
                                                <Input value={scheduleForm.meeting_room} onChange={(event) => setScheduleForm((current) => ({...current, meeting_room: event.target.value}))} placeholder={isZh ? "请选择或填写会议室" : "Room"} className="h-[34px] rounded border-[#E6E7EB] bg-white px-3 text-xs text-[#0E1114] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-0"/>
                                            </label>
                                        </>
                                    ) : null}
                                    {scheduleForm.interview_method === "video" ? (
                                        <>
                                            <label className="space-y-1.5">
                                                <span className="text-xs text-[#33353D]">{isZh ? "视频工具" : "Video tool"}</span>
                                                <select
                                                    value={scheduleForm.video_tool}
                                                    onChange={(event) => setScheduleForm((current) => ({...current, video_tool: event.target.value}))}
                                                    className="h-[34px] w-full rounded border border-[#E6E7EB] bg-white px-3 text-xs text-[#0E1114] outline-none focus:border-[#1E3BFA]"
                                                >
                                                    {INTERVIEW_VIDEO_TOOL_OPTIONS.map((tool) => (
                                                        <option key={tool} value={tool}>{tool}</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="space-y-1.5">
                                                <span className="text-xs text-[#33353D]">{isZh ? "会议链接/会议号" : "Meeting link / ID"}</span>
                                                <Input value={scheduleForm.meeting_link} onChange={(event) => setScheduleForm((current) => ({...current, meeting_link: event.target.value}))} placeholder={isZh ? "请输入会议链接或会议号" : "Meeting link or ID"} className="h-[34px] rounded border-[#E6E7EB] bg-white px-3 text-xs text-[#0E1114] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-0"/>
                                            </label>
                                        </>
                                    ) : null}
                                    {scheduleForm.interview_method === "phone" ? (
                                        <label className="space-y-1.5 sm:col-span-2">
                                            <span className="text-xs text-[#33353D]">{isZh ? "联系电话" : "Contact phone"}</span>
                                            <Input value={scheduleForm.contact_phone} onChange={(event) => setScheduleForm((current) => ({...current, contact_phone: event.target.value}))} placeholder={isZh ? "请输入联系电话" : "Phone"} className="h-[34px] rounded border-[#E6E7EB] bg-white px-3 text-xs text-[#0E1114] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-0"/>
                                        </label>
                                    ) : null}
                                    <div className="space-y-2 sm:col-span-2">
                                        <span className="text-xs text-[#33353D]">{isZh ? "可见内容" : "Visible content"}</span>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {INTERVIEW_VISIBLE_SECTION_OPTIONS.map((option) => (
                                                <label key={option.value} className="flex items-center gap-2 rounded-md border border-[#E6E7EB] bg-white px-3 py-2 text-xs text-[#33353D]">
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
                                    <label className="space-y-1.5 sm:col-span-2">
                                        <span className="text-xs text-[#33353D]">{isZh ? "备注" : "Notes"}</span>
                                        <Textarea value={scheduleForm.notes} onChange={(event) => setScheduleForm((current) => ({...current, notes: event.target.value}))} className="min-h-[74px] resize-none rounded border-[#E6E7EB] bg-white px-3 py-2.5 text-xs text-[#0E1114] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-0"/>
                                    </label>
                                </div>
                            </section>
                        </div>
                        <div className="shrink-0 border-t border-[#F2F3F5] bg-white px-6 py-3">
                            {scheduleSubmitError ? (
                                <div role="alert" aria-live="assertive" className="mb-3 flex items-start gap-2 rounded-md border border-[rgba(245,63,63,0.28)] bg-[rgba(245,63,63,0.06)] px-3 py-2.5 text-xs leading-5 text-[#C53030]">
                                    <Info className="mt-0.5 h-4 w-4 shrink-0"/>
                                    <span className="min-w-0 break-words">{scheduleSubmitError}</span>
                                </div>
                            ) : null}
                            <div className="flex items-center justify-end gap-2">
                                <Button variant="outline" className="h-9 rounded-md border-[#E6E7EB] bg-white px-4 text-sm font-normal text-[#33353D] shadow-none hover:bg-[#F7F8FA]" onClick={closeScheduleDrawer}>{isZh ? "取消" : "Cancel"}</Button>
                                <Button className="h-9 rounded-md bg-[#1E3BFA] px-4 text-sm text-white shadow-none hover:bg-[#0F23D9]" disabled={scheduleSaving} onClick={() => void submitSchedule()}>
                                    {scheduleSaving ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                    {scheduleEditingId ? (isZh ? "保存修改" : "Save changes") : (isZh ? "确认安排" : "Schedule")}
                                </Button>
                            </div>
                        </div>
                    </aside>
                </div>,
                document.body,
            ) : null}
        </div>
    );
}
