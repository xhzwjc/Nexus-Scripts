export type AuditNoticePresentation = {
    show: boolean;
    isInvalid: boolean;
    title: "无效原因摘要" | "执行提示";
    containerClassName: string;
    showSchemaReason: boolean;
    showInvalidReasons: boolean;
};

const INVALID_NOTICE_CONTAINER_CLASS_NAME = "space-y-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100";
const HINT_NOTICE_CONTAINER_CLASS_NAME = "space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200";

export function resolveAuditNoticePresentation(input: {
    screeningResultState?: string | null;
    screeningResultValid?: boolean | null;
    invalidResultReasons?: string[];
    invalidResultSummary?: string | null;
    modelSchemaViolationReason?: string | null;
}): AuditNoticePresentation {
    const invalidResultReasons = (input.invalidResultReasons || []).filter(Boolean);
    const invalidResultSummary = String(input.invalidResultSummary || "").trim();
    const modelSchemaViolationReason = String(input.modelSchemaViolationReason || "").trim();
    const isInvalid = input.screeningResultState === "invalid"
        || input.screeningResultValid === false
        || invalidResultReasons.length > 0;

    if (isInvalid) {
        return {
            show: Boolean(invalidResultSummary || invalidResultReasons.length || modelSchemaViolationReason),
            isInvalid: true,
            title: "无效原因摘要",
            containerClassName: INVALID_NOTICE_CONTAINER_CLASS_NAME,
            showSchemaReason: Boolean(modelSchemaViolationReason),
            showInvalidReasons: invalidResultReasons.length > 0,
        };
    }

    return {
        show: Boolean(invalidResultSummary),
        isInvalid: false,
        title: "执行提示",
        containerClassName: HINT_NOTICE_CONTAINER_CLASS_NAME,
        showSchemaReason: false,
        showInvalidReasons: false,
    };
}
