export type CandidatePipelineStageKey =
    | "all"
    | "pending_screening"
    | "screening_running"
    | "screening_passed"
    | "pending_interview"
    | "talent_pool"
    | "screening_rejected";

export type CandidatePipelineStageConfig = {
    key: CandidatePipelineStageKey;
    statusValue: string | null;
    labelZh: string;
    labelEn: string;
    hintZh: string;
    hintEn: string;
};

export const CANDIDATE_PIPELINE_STAGES: CandidatePipelineStageConfig[] = [
    {
        key: "all",
        statusValue: null,
        labelZh: "全部",
        labelEn: "All",
        hintZh: "当前招聘范围",
        hintEn: "Current scope",
    },
    {
        key: "pending_screening",
        statusValue: "pending_screening",
        labelZh: "待初筛",
        labelEn: "To Screen",
        hintZh: "需要启动 AI 初筛",
        hintEn: "Ready for AI screening",
    },
    {
        key: "screening_running",
        statusValue: "screening_running",
        labelZh: "初筛中",
        labelEn: "Screening",
        hintZh: "AI 正在处理",
        hintEn: "AI in progress",
    },
    {
        key: "screening_passed",
        statusValue: "screening_passed",
        labelZh: "初筛通过",
        labelEn: "Passed",
        hintZh: "可推进面试",
        hintEn: "Move to interview",
    },
    {
        key: "pending_interview",
        statusValue: "pending_interview",
        labelZh: "待面试",
        labelEn: "Interview",
        hintZh: "需要安排面试",
        hintEn: "Needs scheduling",
    },
    {
        key: "talent_pool",
        statusValue: "talent_pool",
        labelZh: "人才库",
        labelEn: "Talent Pool",
        hintZh: "暂存可复用人才",
        hintEn: "Reusable candidates",
    },
    {
        key: "screening_rejected",
        statusValue: "screening_rejected",
        labelZh: "已淘汰",
        labelEn: "Rejected",
        hintZh: "保留原因与记录",
        hintEn: "Reason retained",
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
