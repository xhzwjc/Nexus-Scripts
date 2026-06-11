export type CandidatePipelineStageKey =
    | "all"
    | "resume_screening"
    | "department_review"
    | "first_interview"
    | "second_interview"
    | "offer"
    | "hired"
    | "talent_pool";

export type CandidatePipelineStageChildConfig = {
    key: string;
    statusValue?: string | null;
    statusValues?: string[];
    labelZh: string;
    labelEn: string;
};

export type CandidatePipelineStageConfig = {
    key: CandidatePipelineStageKey;
    statusValue: string | null;
    statusValues?: string[];
    labelZh: string;
    labelEn: string;
    hintZh: string;
    hintEn: string;
    children?: CandidatePipelineStageChildConfig[];
};

export const INTERVIEW_FIRST_STAGE_STATUS_VALUES = [
    "interview_first_pending",
    "interview_first_active",
    "interview_first_rejected",
] as const;

export const INTERVIEW_SECOND_STAGE_STATUS_VALUES = [
    "interview_second_pending",
    "interview_second_active",
    "interview_second_rejected",
] as const;

export const INTERVIEW_TODO_STATUS_VALUES = [
    "interview_first_pending",
    "interview_first_active",
    "interview_second_pending",
    "interview_second_active",
] as const;

export const INTERVIEW_REJECTED_STATUS_VALUES = [
    "interview_rejected",
    "interview_first_rejected",
    "interview_second_rejected",
] as const;

export const INTERVIEW_PIPELINE_STATUS_VALUES = [
    ...INTERVIEW_FIRST_STAGE_STATUS_VALUES,
    ...INTERVIEW_SECOND_STAGE_STATUS_VALUES,
] as const;

export const CANDIDATE_PIPELINE_STAGES: CandidatePipelineStageConfig[] = [
    {
        key: "all",
        statusValue: null,
        labelZh: "全部简历",
        labelEn: "All",
        hintZh: "当前招聘范围",
        hintEn: "Current scope",
    },
    {
        key: "resume_screening",
        statusValue: "pending_screening",
        statusValues: ["new_imported", "pending_screening", "screening_running", "screening_failed", "screening_rejected"],
        labelZh: "简历初筛",
        labelEn: "Screening",
        hintZh: "未处理",
        hintEn: "Unhandled",
        children: [
            {
                key: "resume_screening_unhandled",
                statusValues: ["new_imported", "pending_screening", "screening_failed"],
                labelZh: "未处理",
                labelEn: "Unhandled",
            },
            {
                key: "resume_screening_running",
                statusValue: "screening_running",
                labelZh: "进行中",
                labelEn: "In progress",
            },
            {
                key: "resume_screening_rejected",
                statusValue: "screening_rejected",
                labelZh: "本轮淘汰",
                labelEn: "Rejected",
            },
        ],
    },
    {
        key: "department_review",
        statusValue: "screening_passed",
        statusValues: ["screening_passed", "department_review_pending", "department_review_rejected"],
        labelZh: "用人部门筛选",
        labelEn: "Dept Review",
        hintZh: "未处理",
        hintEn: "Unhandled",
        children: [
            {
                key: "department_review_unhandled",
                statusValue: "screening_passed",
                labelZh: "未处理",
                labelEn: "Unhandled",
            },
            {
                key: "department_review_running",
                statusValue: "department_review_pending",
                labelZh: "进行中",
                labelEn: "In progress",
            },
            {
                key: "department_review_rejected",
                statusValue: "department_review_rejected",
                labelZh: "本轮淘汰",
                labelEn: "Rejected",
            },
        ],
    },
    {
        key: "first_interview",
        statusValue: "interview_first_pending",
        statusValues: [...INTERVIEW_FIRST_STAGE_STATUS_VALUES],
        labelZh: "初试",
        labelEn: "First Interview",
        hintZh: "未处理",
        hintEn: "Unhandled",
        children: [
            {
                key: "first_interview_unhandled",
                statusValue: "interview_first_pending",
                labelZh: "未处理",
                labelEn: "Unhandled",
            },
            {
                key: "first_interview_active",
                statusValue: "interview_first_active",
                labelZh: "进行中",
                labelEn: "In progress",
            },
            {
                key: "first_interview_rejected",
                statusValue: "interview_first_rejected",
                labelZh: "本轮淘汰",
                labelEn: "Rejected",
            },
        ],
    },
    {
        key: "second_interview",
        statusValue: "interview_second_pending",
        statusValues: [...INTERVIEW_SECOND_STAGE_STATUS_VALUES],
        labelZh: "复试",
        labelEn: "Second Interview",
        hintZh: "未处理",
        hintEn: "Unhandled",
        children: [
            {
                key: "second_interview_unhandled",
                statusValue: "interview_second_pending",
                labelZh: "未处理",
                labelEn: "Unhandled",
            },
            {
                key: "second_interview_active",
                statusValue: "interview_second_active",
                labelZh: "进行中",
                labelEn: "In progress",
            },
            {
                key: "second_interview_rejected",
                statusValue: "interview_second_rejected",
                labelZh: "本轮淘汰",
                labelEn: "Rejected",
            },
        ],
    },
    {
        key: "offer",
        statusValue: "pending_offer",
        statusValues: ["interview_passed", "pending_offer", "offer_sent"],
        labelZh: "Offer 环节",
        labelEn: "Offer",
        hintZh: "待发 Offer",
        hintEn: "To send",
        children: [
            {
                key: "offer_unhandled",
                statusValues: ["interview_passed", "pending_offer"],
                labelZh: "待发 Offer",
                labelEn: "To send",
            },
            {
                key: "offer_sent",
                statusValue: "offer_sent",
                labelZh: "已发 Offer",
                labelEn: "Sent",
            },
        ],
    },
    {
        key: "hired",
        statusValue: "hired",
        labelZh: "结束",
        labelEn: "Closed",
        hintZh: "已入职",
        hintEn: "Hired",
        children: [
            {
                key: "hired_done",
                statusValue: "hired",
                labelZh: "已入职",
                labelEn: "Hired",
            },
        ],
    },
    {
        key: "talent_pool",
        statusValue: "talent_pool",
        labelZh: "人才库",
        labelEn: "Talent Pool",
        hintZh: "暂存可复用人才",
        hintEn: "Reusable candidates",
    },
];

export const RECRUITMENT_EXPANSION_MODULES = [
    {
        key: "recruitment_requests",
        labelZh: "招聘需求",
        labelEn: "Requests",
        phase: "phase2",
    },
    {
        key: "interview_calendar",
        labelZh: "面试日程",
        labelEn: "Interview Calendar",
        phase: "phase2",
    },
    {
        key: "offer_management",
        labelZh: "Offer 管理",
        labelEn: "Offer Management",
        phase: "phase2",
    },
    {
        key: "recruitment_reports",
        labelZh: "招聘报表",
        labelEn: "Reports",
        phase: "phase3",
    },
];
