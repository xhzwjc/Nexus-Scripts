"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import {
    Bot,
    Check,
    ChevronDown,
    ChevronUp,
    Copy,
    Download,
    ExternalLink,
    LayoutGrid,
    List,
    Loader2,
    Mail,
    NotebookText,
    RotateCcw,
    Save,
    SlidersHorizontal,
    Sparkles,
    Square,
    Trash2,
} from "lucide-react";

import {
    joinTags,
    type AITaskLog,
    type CandidateDetail,
    type CandidateScoreDimension,
    type CandidateSummary,
    type PositionSummary,
    type RecruitmentSkill,
    type ResumeFile,
} from "@/lib/recruitment-api";
import {getCurrentLanguage, useI18n} from "@/lib/i18n";
import {cn} from "@/lib/utils";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
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
    parseStructuredLogOutput,
    resolveCandidateDisplayStatus,
    resolveLogSkillSnapshots,
    statusBadgeClass,
} from "../utils";

type CandidateBoardGroup = {
    status: string;
    label: string;
    items: CandidateSummary[];
};

type CandidateListDisplayColumnWidths = Record<CandidateListColumnKey, number>;

type VirtualCandidateRowMetric = {
    candidateId: number;
    start: number;
    size: number;
};

type CandidateInterviewQuestion = CandidateDetail["interview_questions"][number];

const CANDIDATE_LIST_ESTIMATED_ROW_HEIGHT = 84;
const CANDIDATE_LIST_OVERSCAN = 6;
const SCORE_SUGGESTED_STATUS_VALUES = new Set(["screening_passed", "talent_pool", "screening_rejected"]);

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
        listView: isZh ? "列表" : "List",
        boardView: isZh ? "看板" : "Board",
        collapseFilters: isZh ? "收起筛选" : "Collapse Filters",
        search: isZh ? "搜索" : "Search",
        searchPlaceholder: isZh ? "搜索候选人、手机号、邮箱、公司" : "Search candidates, phone, email, or company",
        position: isZh ? "岗位" : "Position",
        allPositions: isZh ? "全部岗位" : "All Positions",
        status: isZh ? "状态" : "Status",
        allStatuses: isZh ? "全部状态" : "All Statuses",
        matchPercent: isZh ? "匹配度" : "Match",
        allMatchPercent: isZh ? "全部匹配度" : "All Match Scores",
        above80: isZh ? "80% 以上" : "80%+",
        above60: isZh ? "60% 以上" : "60%+",
        above40: isZh ? "40% 以上" : "40%+",
        source: isZh ? "来源" : "Source",
        allSources: isZh ? "全部来源" : "All Sources",
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
        loadingCandidateList: isZh ? "正在加载候选人列表" : "Loading candidate list",
        loadingCandidateDetail: isZh ? "正在加载候选人详情" : "Loading candidate details",
        selectedCandidates: (count: number) => (isZh ? `已选中 ${count} 位候选人` : `${count} candidates selected`),
        clearSelection: isZh ? "清空选择" : "Clear Selection",
        stopBatchScreening: isZh ? "停止批量初筛" : "Stop Batch Screening",
        queueBatch: isZh ? "批量入队" : "Queue Batch",
        sendResumesBatch: isZh ? "批量发送简历" : "Send Resumes in Batch",
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
        stopScreening: isZh ? "停止初筛" : "Stop Screening",
        viewResume: isZh ? "查看简历" : "View Resume",
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
        tagsAndNotes: isZh ? "标签与备注" : "Tags & Notes",
        tagsPlaceholder: isZh ? "标签，使用英文逗号分隔" : "Tags, separated by commas",
        notesPlaceholder: isZh ? "例如：沟通不错，但对设备联调经验需要进一步核实" : "Example: strong communication, but device integration experience needs follow-up",
        saveCandidateInfo: isZh ? "保存候选人信息" : "Save Candidate Info",
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
        screeningMemory: isZh ? "初筛工作记忆" : "Screening Memory",
        memorySource: isZh ? "记忆来源" : "Memory Source",
        lastScreeningTime: isZh ? "最近初筛时间" : "Last Screening Time",
        screeningSkills: isZh ? "初筛 Skills" : "Screening Skills",
        interviewSkills: isZh ? "面试题 Skills" : "Interview Skills",
        noScreeningMemory: isZh ? "暂无初筛工作记忆" : "No Screening Memory",
        noScreeningMemoryDesc: isZh ? "完成一次初筛后，这里会显示本次初筛使用的 Skills、来源和时间，便于后续生成面试题时复用。" : "After a screening run, the used skills, source, and time will appear here for reuse in interview generation.",
        screeningMemoryHint: (source: string) => (isZh ? `点击“开始初筛”时，会按“岗位绑定 Skills > 初筛工作记忆”继续执行；若均未配置，则本次不会传 Skills。当前预计来源：${source}。` : `When you click "Start Screening", the system uses "position-bound skills > screening memory". If neither exists, no skills are passed. Current expected source: ${source}.`),
        screeningSkillPreview: (skillsText: string) => (isZh ? `当前预计使用：${skillsText}` : `Expected skills: ${skillsText}`),
        manualOverrideScore: isZh ? "人工修正分数" : "Manual Override Score",
        overrideScorePlaceholder: isZh ? "例如 88" : "e.g. 88",
        overrideReason: isZh ? "修正原因" : "Override Reason",
        overrideReasonPlaceholder: isZh ? "为什么要修正这次 AI 评分" : "Why this AI score needs adjustment",
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
        viewOriginal: isZh ? "查看原件" : "View Original",
        downloadResume: isZh ? "下载简历" : "Download Resume",
        deleteResume: isZh ? "删除简历" : "Delete Resume",
        parseErrorLine: (message: string) => (isZh ? `解析异常：${message}` : `Parse error: ${message}`),
        roundPlaceholder: isZh ? "轮次，例如 初试 / 复试" : "Round, e.g. Round 1 / Final",
        currentSkillsPlaceholder: isZh ? "当前使用的 Skills" : "Current Skills",
        interviewRequirementsPlaceholder: isZh ? "补充要求，例如：偏向 IoT 设备联调、自动化稳定性、跨部门协作追问" : "Extra requirements, e.g. IoT device integration, automation stability, or cross-team collaboration follow-ups",
        actualSkills: (skillsText: string) => (isZh ? `当前实际 Skills：${skillsText}` : `Actual skills: ${skillsText}`),
        restoreDefaultSkills: isZh ? "恢复默认 Skills" : "Restore Default Skills",
        interviewSkillHintDefault: isZh ? "未手动选择时，生成面试题会按“岗位绑定 Skills > 面试题工作记忆”执行；若均未配置，则本次不会传 Skills。" : "Without manual selection, interview generation uses \"position-bound skills > interview memory\". If neither exists, no skills are passed.",
        interviewSkillHintManual: isZh ? "当前已手动选择 Skills，本次会以手动选择为准。" : "Manual skill selection is active and will be used for this run.",
        noInterviewQuestions: isZh ? "暂无面试题" : "No Interview Questions",
        noInterviewQuestionsDesc: isZh ? "点击上方按钮后，系统会结合岗位 JD、候选人简历和 Skills 生成定制化题目。" : "After you click the button above, the system will generate tailored questions from the JD, resume, and skills.",
        candidateWorkspace: isZh ? "候选人工作区" : "Candidate Workspace",
        candidateWorkspaceDesc: isZh ? "未选中候选人时，先在这里查看当前筛选结果的概览、最近更新对象和推荐入口。" : "When no candidate is selected, use this area to review the current result set, recent updates, and recommended next actions.",
        recentCandidates: isZh ? "最近更新候选人" : "Recently Updated Candidates",
        noCandidates: isZh ? "暂无候选人" : "No Candidates",
        noCandidatesDesc: isZh ? "当前筛选结果为空，调整筛选条件或先上传简历后再继续处理。" : "The current result set is empty. Adjust filters or upload resumes first.",
        recommendedActions: isZh ? "推荐操作" : "Recommended Actions",
        continueFiltering: isZh ? "继续筛选列表" : "Continue Filtering",
        continueFilteringDesc: isZh ? "保持当前筛选条件，在左侧列表中选择一位候选人后，右侧会切换到完整档案工作区。" : "Keep the current filters, choose a candidate on the left, and the full workspace will open on the right.",
        batchHandleResults: isZh ? "批量处理当前结果" : "Batch Handle Results",
        batchHandleResultsDesc: isZh ? "可以先在左侧勾选需要处理的候选人，再执行批量初筛或批量发送简历。" : "Select candidates on the left first, then run batch screening or send resumes in batch.",
        unrecorded: isZh ? "未记录" : "Unrecorded",
    };
}

function findVirtualRowStartIndex(metrics: VirtualCandidateRowMetric[], scrollTop: number) {
    let low = 0;
    let high = metrics.length - 1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const row = metrics[mid];

        if (row.start + row.size < scrollTop) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return Math.max(0, Math.min(metrics.length - 1, low));
}

function OutputSnippet({content}: { content: string }) {
    const tr = React.useMemo(() => getCandidatesLocale(), []);
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

function InterviewQuestionCard({
    question,
    onDownload,
    onPreview,
}: {
    question: CandidateInterviewQuestion;
    onDownload: () => void;
    onPreview: () => void;
}) {
    const tr = React.useMemo(() => getCandidatesLocale(), []);
    const modules = React.useMemo(() => {
        if (!question.html_content) return [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(question.html_content, "text/html");
        const headings = Array.from(doc.querySelectorAll("h2, h3"));
        return headings
            .map((heading) => heading.textContent?.trim() || "")
            .filter(Boolean)
            .slice(0, 6);
    }, [question.html_content]);

    const questionCount = React.useMemo(() => {
        if (!question.html_content) return null;
        const parser = new DOMParser();
        const doc = parser.parseFromString(question.html_content, "text/html");
        const listCount = doc.querySelectorAll("li").length;
        return listCount || null;
    }, [question.html_content]);

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

function buildCandidateScoreFallbackMarkdown(score?: CandidateDetail["score"] | null) {
    const tr = getCandidatesLocale();
    if (!score) {
        return tr.noAiScoreOutput;
    }
    const displayValues = resolveScoreDisplayValues(score as Record<string, unknown>);
    const recommendation = readScoreText(score.recommendation) || "-";
    const suggestedStatus = readSuggestedStatus(score.suggested_status);
    const advantages = readScoreTextArray(score.advantages);
    const concerns = readScoreTextArray(score.concerns);
    const dimensionLines = readScoreDimensions((score as Record<string, unknown>).dimensions)
        .map(buildDimensionMarkdownLine)
        .filter(Boolean);
    const sections = [
        tr.aiScreeningResultHeading,
        tr.totalScoreLine(displayValues.totalScore !== null ? formatScoreValue(displayValues.totalScore, displayValues.totalScoreScale) : "-"),
        tr.matchLine(displayValues.matchPercent !== null ? formatPercent(displayValues.matchPercent) : "-"),
        tr.suggestedStatusLine(labelForCandidateStatus(suggestedStatus) || "-"),
        "",
        tr.aiRecommendationHeading,
        recommendation,
        "",
        ...(dimensionLines.length > 0
            ? [
                tr.dimensionScoresHeading,
                ...dimensionLines,
                "",
            ]
            : []),
        tr.advantagesHeading,
        ...(advantages.length > 0 ? advantages.map((item, index) => `${index + 1}. ${item}`) : ["-"]),
        "",
        tr.concernsHeading,
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

function buildDimensionMarkdownLine(item: CandidateScoreDimension) {
    const tr = getCandidatesLocale();
    const label = readScoreText(item.label) || readScoreText(item.key) || "";
    if (!label) {
        return "";
    }
    const reason = readScoreText(item.reason) || "";
    const evidence = readDimensionEvidence(item.evidence);
    const extra = [reason, evidence ? `${tr.evidenceLabel}: ${evidence}` : ""].filter(Boolean).join(tr.delimiter);
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

function buildStructuredAiOutputMarkdown(payload: Record<string, unknown>) {
    const tr = getCandidatesLocale();
    const displayValues = resolveScoreDisplayValues(payload);
    const decisionValues = deriveScoreDecisionValues(payload);
    const recommendation = decisionValues.recommendation;
    const suggestedStatus = decisionValues.suggestedStatus;
    const advantages = readScoreTextArray(payload.advantages);
    const concerns = readScoreTextArray(payload.concerns);
    const dimensionLines = readScoreDimensions(payload.dimensions)
        .map(buildDimensionMarkdownLine)
        .filter(Boolean);

    return [
        tr.aiScreeningResultHeading,
        tr.totalScoreLine(displayValues.totalScore !== null ? formatScoreValue(displayValues.totalScore, displayValues.totalScoreScale) : "-"),
        tr.matchLine(displayValues.matchPercent !== null ? `${displayValues.matchPercent}%` : "-"),
        tr.suggestedStatusLine(labelForCandidateStatus(suggestedStatus) || "-"),
        "",
        tr.aiRecommendationHeading,
        recommendation || "-",
        "",
        ...(dimensionLines.length > 0 ? [tr.dimensionScoresHeading, ...dimensionLines, ""] : []),
        tr.advantagesHeading,
        ...(advantages.length > 0 ? advantages.map((item, index) => `${index + 1}. ${item}`) : ["-"]),
        "",
        tr.concernsHeading,
        ...(concerns.length > 0 ? concerns.map((item, index) => `${index + 1}. ${item}`) : ["-"]),
    ].join("\n");
}

function resolveCandidateAiOutputPayload(
    log?: AITaskLog | null,
    score?: CandidateDetail["score"] | null,
) {
    const parsed = parseStructuredLogOutput(log?.output_snapshot);
    let markdown = "";
    let raw = "";
    const scoreRecord = score && typeof score === "object" ? score as Record<string, unknown> : null;

    if (score) {
        markdown = buildCandidateScoreFallbackMarkdown(score);
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
            markdown = buildStructuredAiOutputMarkdown(scorePayload);
        }
        raw = formatStructuredValue(parsed, log?.output_summary || "");
    } else if (typeof parsed === "string" && parsed.trim()) {
        if (!markdown) {
            markdown = parsed.trim();
        }
        raw = parsed.trim();
    }

    if (!markdown) {
        markdown = buildCandidateScoreFallbackMarkdown(score);
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
    const tr = React.useMemo(() => getCandidatesLocale(), []);
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
            await navigator.clipboard.writeText(content);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
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
    candidatePositionFilter: string;
    setCandidatePositionFilter: React.Dispatch<React.SetStateAction<string>>;
    candidateStatusFilter: string;
    setCandidateStatusFilter: React.Dispatch<React.SetStateAction<string>>;
    candidateMatchFilter: string;
    setCandidateMatchFilter: React.Dispatch<React.SetStateAction<string>>;
    candidateSourceFilter: string;
    setCandidateSourceFilter: React.Dispatch<React.SetStateAction<string>>;
    candidateTimeFilter: string;
    setCandidateTimeFilter: React.Dispatch<React.SetStateAction<string>>;
    positions: PositionSummary[];
    sourceOptions: string[];
    visibleCandidateCount: number;
    onCollapse: () => void;
}) {
    const {language} = useI18n();
    const tr = React.useMemo(() => getCandidatesLocale(language), [language]);
    const summaryChips = React.useMemo(() => (
        candidateFilterSummary
            .split("·")
            .map((item) => item.trim())
            .filter(Boolean)
    ), [candidateFilterSummary]);

    const hasActiveFilters = React.useMemo(() => (
        candidateQuery.trim().length > 0
        || candidatePositionFilter !== "all"
        || candidateStatusFilter !== "all"
        || candidateMatchFilter !== "all"
        || candidateSourceFilter !== "all"
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
        setCandidatePositionFilter("all");
        setCandidateStatusFilter("all");
        setCandidateMatchFilter("all");
        setCandidateSourceFilter("all");
        setCandidateTimeFilter("all");
    }, [
        setCandidateMatchFilter,
        setCandidatePositionFilter,
        setCandidateQuery,
        setCandidateSourceFilter,
        setCandidateStatusFilter,
        setCandidateTimeFilter,
    ]);

    const isChipActive = React.useCallback((chip: string) => (
        chip.startsWith(tr.keywordChipPrefix)
        || (!chip.startsWith(tr.allPrefix) && chip !== tr.noKeyword)
    ), [tr]);

    const fieldLabelClassName = "mb-1 block text-[10px] font-medium tracking-wide text-slate-500 dark:text-slate-400";

    return (
        <Card className={cn(defaultPanelClass, "gap-0 py-0")}>
            <CardContent className="px-4 py-2.5 sm:px-5">
                <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                            <SlidersHorizontal className="h-3.5 w-3.5"/>
                        </div>
                        <span className="shrink-0 text-sm font-medium text-slate-900 dark:text-slate-100">{tr.filters}</span>
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                            {summaryChips.map((chip) => (
                                <span
                                    key={chip}
                                    className={cn(
                                        "inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] transition",
                                        isChipActive(chip)
                                            ? "border-slate-400 bg-slate-100/95 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                                            : "border-slate-200/80 bg-white/80 text-slate-500 dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-400",
                                    )}
                                >
                                    <span className="truncate">{chip}</span>
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                        <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
                            <Button size="sm" variant={candidateViewMode === "list" ? "default" : "ghost"} onClick={() => setCandidateViewMode("list")}>
                                <List className="h-4 w-4"/>
                                {tr.listView}
                            </Button>
                            <Button size="sm" variant={candidateViewMode === "board" ? "default" : "ghost"} onClick={() => setCandidateViewMode("board")}>
                                <LayoutGrid className="h-4 w-4"/>
                                {tr.boardView}
                            </Button>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onCollapse}
                            className="h-8 rounded-full border-slate-200/80 bg-white/90 px-3 dark:border-slate-800 dark:bg-slate-950/90"
                            title={tr.collapseFilters}
                        >
                            <ChevronUp className="h-4 w-4"/>
                            {tr.collapseFilters}
                        </Button>
                    </div>
                </div>

                <div className="mt-2 border-t border-slate-200/80 pt-2 dark:border-slate-800">
                    <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1.45fr)_repeat(5,minmax(0,0.88fr))]">
                        <div className="space-y-1">
                            <label className={fieldLabelClassName}>{tr.search}</label>
                            <SearchField value={candidateQuery} onChange={setCandidateQuery} placeholder={tr.searchPlaceholder}/>
                        </div>
                        <div className="space-y-1">
                            <label className={fieldLabelClassName}>{tr.position}</label>
                            <NativeSelect value={candidatePositionFilter} onChange={(event) => setCandidatePositionFilter(event.target.value)}>
                                <option value="all">{tr.allPositions}</option>
                                {positions.map((position) => (
                                    <option key={position.id} value={position.id}>
                                        {position.title}
                                    </option>
                                ))}
                            </NativeSelect>
                        </div>
                        <div className="space-y-1">
                            <label className={fieldLabelClassName}>{tr.status}</label>
                            <NativeSelect value={candidateStatusFilter} onChange={(event) => setCandidateStatusFilter(event.target.value)}>
                                <option value="all">{tr.allStatuses}</option>
                                {Object.entries(candidateStatusLabels).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </NativeSelect>
                        </div>
                        <div className="space-y-1">
                            <label className={fieldLabelClassName}>{tr.matchPercent}</label>
                            <NativeSelect value={candidateMatchFilter} onChange={(event) => setCandidateMatchFilter(event.target.value)}>
                                <option value="all">{tr.allMatchPercent}</option>
                                <option value="80+">{tr.above80}</option>
                                <option value="60+">{tr.above60}</option>
                                <option value="40+">{tr.above40}</option>
                            </NativeSelect>
                        </div>
                        <div className="space-y-1">
                            <label className={fieldLabelClassName}>{tr.source}</label>
                            <NativeSelect value={candidateSourceFilter} onChange={(event) => setCandidateSourceFilter(event.target.value)}>
                                <option value="all">{tr.allSources}</option>
                                {sourceOptions.map((source) => (
                                    <option key={source} value={source}>
                                        {source}
                                    </option>
                                ))}
                            </NativeSelect>
                        </div>
                        <div className="space-y-1">
                            <label className={fieldLabelClassName}>{tr.timeFilter}</label>
                            <NativeSelect value={candidateTimeFilter} onChange={(event) => setCandidateTimeFilter(event.target.value)}>
                                <option value="all">{tr.allTime}</option>
                                <option value="today">{tr.today}</option>
                                <option value="7d">{tr.last7Days}</option>
                                <option value="30d">{tr.last30Days}</option>
                            </NativeSelect>
                        </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-2 dark:border-slate-800">
                        <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
                            <span>{tr.matchedCandidates(visibleCandidateCount)}</span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto px-0 py-0 text-xs text-slate-500 hover:bg-transparent hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                onClick={resetFilters}
                                disabled={!hasActiveFilters}
                            >
                                <RotateCcw className="h-3.5 w-3.5"/>
                                {tr.reset}
                            </Button>
                        </div>
                    </div>
                </div>
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
    candidatePositionFilter: string;
    setCandidatePositionFilter: React.Dispatch<React.SetStateAction<string>>;
    candidateStatusFilter: string;
    setCandidateStatusFilter: React.Dispatch<React.SetStateAction<string>>;
    candidateMatchFilter: string;
    setCandidateMatchFilter: React.Dispatch<React.SetStateAction<string>>;
    candidateSourceFilter: string;
    setCandidateSourceFilter: React.Dispatch<React.SetStateAction<string>>;
    candidateTimeFilter: string;
    setCandidateTimeFilter: React.Dispatch<React.SetStateAction<string>>;
    positions: PositionSummary[];
    sourceOptions: string[];
    visibleCandidates: CandidateSummary[];
    selectedCandidateIds: number[];
    setSelectedCandidateIds: React.Dispatch<React.SetStateAction<number[]>>;
    triggerScreening: (candidateIds?: number[]) => Promise<void>;
    isBatchScreeningCancelling: boolean;
    screeningSubmitting: boolean;
    isBatchScreeningRunning: boolean;
    openResumeMailDialog: (candidateIds?: number[]) => void;
    candidatesLoading: boolean;
    candidateListScrollRef: (node: HTMLDivElement | null) => void;
    candidateListHorizontalRailRef: (node: HTMLDivElement | null) => void;
    renderCandidateListHeaderCell: (key: CandidateListColumnKey, label: string) => React.ReactNode;
    selectedCandidateId: number | null;
    setSelectedCandidateId: React.Dispatch<React.SetStateAction<number | null>>;
    toggleCandidateSelection: (candidateId: number, nextChecked?: boolean) => void;
    candidateListDisplayColumnWidths: CandidateListDisplayColumnWidths;
    getCandidateResumeMailSummary: (candidateId: number) => string | null;
    groupedCandidates: CandidateBoardGroup[];
    candidateDetailLoading: boolean;
    candidateDetail: CandidateDetail | null;
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
    isBatchScreeningCancelling,
    screeningSubmitting,
    isBatchScreeningRunning,
    openResumeMailDialog,
    candidatesLoading,
    candidateListScrollRef,
    candidateListHorizontalRailRef,
    renderCandidateListHeaderCell,
    selectedCandidateId,
    setSelectedCandidateId,
    toggleCandidateSelection,
    candidateListDisplayColumnWidths,
    getCandidateResumeMailSummary,
    groupedCandidates,
    candidateDetailLoading,
    candidateDetail,
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
}: CandidatesPageProps) {
    const {language} = useI18n();
    const tr = React.useMemo(() => getCandidatesLocale(language), [language]);
    const [candidateListViewportEl, setCandidateListViewportEl] = React.useState<HTMLDivElement | null>(null);
    const [candidateListScrollTop, setCandidateListScrollTop] = React.useState(0);
    const [candidateListViewportHeight, setCandidateListViewportHeight] = React.useState(0);
    const [candidateListMeasuredRowHeights, setCandidateListMeasuredRowHeights] = React.useState<Record<number, number>>({});
    const [candidateListCompactMode, setCandidateListCompactMode] = React.useState(false);
    const [candidateFilterBarExpanded, setCandidateFilterBarExpanded] = React.useState(false);
    const [candidateAiOutputDialogOpen, setCandidateAiOutputDialogOpen] = React.useState(false);
    const candidateListMetricsFrameRef = React.useRef<number | null>(null);
    const candidateListRowObserversRef = React.useRef<Map<number, ResizeObserver>>(new Map());
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

        const observer = new ResizeObserver(() => syncCompactMode());
        observer.observe(candidateListViewportEl);
        return () => observer.disconnect();
    }, [candidateListViewportEl]);

    const mergedCandidateListScrollRef = React.useCallback((node: HTMLDivElement | null) => {
        setCandidateListViewportEl(node);
        candidateListScrollRef(node);
    }, [candidateListScrollRef]);

    React.useEffect(() => {
        if (candidateViewMode !== "list" || !candidateListViewportEl) {
            setCandidateListScrollTop(0);
            setCandidateListViewportHeight(0);
            return;
        }

        const updateMetrics = () => {
            setCandidateListScrollTop(candidateListViewportEl.scrollTop);
            setCandidateListViewportHeight(candidateListViewportEl.clientHeight);
        };

        const scheduleMetricsUpdate = () => {
            if (candidateListMetricsFrameRef.current != null) {
                return;
            }
            candidateListMetricsFrameRef.current = window.requestAnimationFrame(() => {
                candidateListMetricsFrameRef.current = null;
                updateMetrics();
            });
        };

        updateMetrics();
        candidateListViewportEl.addEventListener("scroll", scheduleMetricsUpdate, {passive: true});

        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", scheduleMetricsUpdate);
            return () => {
                candidateListViewportEl.removeEventListener("scroll", scheduleMetricsUpdate);
                window.removeEventListener("resize", scheduleMetricsUpdate);
                if (candidateListMetricsFrameRef.current != null) {
                    window.cancelAnimationFrame(candidateListMetricsFrameRef.current);
                    candidateListMetricsFrameRef.current = null;
                }
            };
        }

        const observer = new ResizeObserver(() => scheduleMetricsUpdate());
        observer.observe(candidateListViewportEl);

        return () => {
            candidateListViewportEl.removeEventListener("scroll", scheduleMetricsUpdate);
            observer.disconnect();
            if (candidateListMetricsFrameRef.current != null) {
                window.cancelAnimationFrame(candidateListMetricsFrameRef.current);
                candidateListMetricsFrameRef.current = null;
            }
        };
    }, [candidateViewMode, candidateListViewportEl]);

    const candidateListVisibleColumns = React.useMemo<CandidateListColumnKey[]>(
        () => ["candidate", "position", "status", "match", "source", "updated"],
        [],
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

    React.useEffect(() => {
        setCandidateListMeasuredRowHeights({});
    }, [candidateViewMode, candidateListEffectiveTableWidth, visibleCandidates]);

    React.useEffect(() => {
        const rowObservers = candidateListRowObserversRef.current;
        return () => {
            rowObservers.forEach((observer) => observer.disconnect());
            rowObservers.clear();
        };
    }, []);

    const candidateListVirtualMetrics = React.useMemo(() => {
        let totalHeight = 0;
        const metrics: VirtualCandidateRowMetric[] = visibleCandidates.map((candidate) => {
            const size = candidateListMeasuredRowHeights[candidate.id] || CANDIDATE_LIST_ESTIMATED_ROW_HEIGHT;
            const metric = {
                candidateId: candidate.id,
                start: totalHeight,
                size,
            };
            totalHeight += size;
            return metric;
        });

        if (!metrics.length) {
            return {
                totalHeight: 0,
                topSpacerHeight: 0,
                bottomSpacerHeight: 0,
                startIndex: 0,
                endIndex: -1,
            };
        }

        const viewportHeight = candidateListViewportHeight || Math.min(metrics.length, 10) * CANDIDATE_LIST_ESTIMATED_ROW_HEIGHT;
        const visibleStartIndex = findVirtualRowStartIndex(metrics, Math.max(0, candidateListScrollTop));
        let visibleEndIndex = visibleStartIndex;
        const visibleBottom = candidateListScrollTop + viewportHeight;

        while (visibleEndIndex < metrics.length - 1 && metrics[visibleEndIndex].start + metrics[visibleEndIndex].size < visibleBottom) {
            visibleEndIndex += 1;
        }

        const startIndex = Math.max(0, visibleStartIndex - CANDIDATE_LIST_OVERSCAN);
        const endIndex = Math.min(metrics.length - 1, visibleEndIndex + CANDIDATE_LIST_OVERSCAN);
        const startMetric = metrics[startIndex];
        const endMetric = metrics[endIndex];
        const topSpacerHeight = startMetric?.start || 0;
        const bottomSpacerHeight = Math.max(0, totalHeight - (endMetric.start + endMetric.size));

        return {
            totalHeight,
            topSpacerHeight,
            bottomSpacerHeight,
            startIndex,
            endIndex,
        };
    }, [candidateListMeasuredRowHeights, candidateListScrollTop, candidateListViewportHeight, visibleCandidates]);

    const visibleCandidateWindow = React.useMemo(() => {
        if (candidateListVirtualMetrics.endIndex < candidateListVirtualMetrics.startIndex) {
            return [];
        }
        return visibleCandidates.slice(candidateListVirtualMetrics.startIndex, candidateListVirtualMetrics.endIndex + 1);
    }, [candidateListVirtualMetrics.endIndex, candidateListVirtualMetrics.startIndex, visibleCandidates]);

    const createCandidateRowMeasureRef = React.useCallback((candidateId: number) => {
        return (node: HTMLTableRowElement | null) => {
            const existingObserver = candidateListRowObserversRef.current.get(candidateId);
            if (existingObserver) {
                existingObserver.disconnect();
                candidateListRowObserversRef.current.delete(candidateId);
            }

            if (!node) {
                return;
            }

            const measureRow = () => {
                const nextHeight = Math.ceil(node.getBoundingClientRect().height);
                setCandidateListMeasuredRowHeights((current) => (
                    current[candidateId] === nextHeight
                        ? current
                        : {
                            ...current,
                            [candidateId]: nextHeight,
                        }
                ));
            };

            measureRow();

            if (typeof ResizeObserver === "undefined") {
                return;
            }

            const observer = new ResizeObserver(() => measureRow());
            observer.observe(node);
            candidateListRowObserversRef.current.set(candidateId, observer);
        };
    }, []);

    const [candidateDetailPanel, setCandidateDetailPanel] = React.useState<"profile" | "ai" | "interview">("profile");

    React.useEffect(() => {
        setCandidateDetailPanel("profile");
        setCandidateAiOutputDialogOpen(false);
    }, [selectedCandidateId]);

    React.useEffect(() => {
        updateCandidateDetailToolbarMetrics();

        const node = candidateDetailToolbarScrollRef.current;
        if (!node || typeof ResizeObserver === "undefined") {
            return;
        }

        const observer = new ResizeObserver(() => updateCandidateDetailToolbarMetrics());
        observer.observe(node);
        if (node.firstElementChild instanceof HTMLElement) {
            observer.observe(node.firstElementChild);
        }

        return () => observer.disconnect();
    }, [candidateDetail, candidateDetailPanel, updateCandidateDetailToolbarMetrics]);

    const candidateOverviewStats = React.useMemo(() => {
        const pendingScreeningCount = visibleCandidates.filter((candidate) => resolveCandidateDisplayStatus(candidate) === "pending_screening").length;
        const pendingInterviewCount = visibleCandidates.filter((candidate) => resolveCandidateDisplayStatus(candidate) === "pending_interview").length;
        const talentPoolCount = visibleCandidates.filter((candidate) => resolveCandidateDisplayStatus(candidate) === "talent_pool").length;
        const sentResumeCount = visibleCandidates.filter((candidate) => Boolean(getCandidateResumeMailSummary(candidate.id))).length;

        return [
            {label: tr.currentResults, value: `${visibleCandidates.length}${tr.peopleSuffix}`},
            {label: tr.pendingScreening, value: `${pendingScreeningCount}${tr.peopleSuffix}`},
            {label: tr.pendingInterview, value: `${pendingInterviewCount}${tr.peopleSuffix}`},
            {label: tr.talentPoolAndSent, value: `${talentPoolCount} / ${sentResumeCount}`},
        ];
    }, [getCandidateResumeMailSummary, tr, visibleCandidates]);

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
    const candidateDetailHeadlineMeta = candidateDetail
        ? [
            candidateDetail.candidate.position_title,
            candidateDetail.candidate.years_of_experience,
            candidateDetail.candidate.education,
            candidateDetail.candidate.phone || candidateDetail.candidate.email,
        ].filter(Boolean).join(" · ")
        : "";
    const candidateDetailIdentityMeta = candidateDetail?.candidate.current_company || "";
    const primaryResumeFile = candidateDetail?.resume_files[0] ?? null;
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
        () => resolveCandidateAiOutputPayload(latestResumeScoreLog, candidateDetail?.score),
        [candidateDetail?.score, latestResumeScoreLog],
    );
    const candidateAiOutputAvailable = Boolean(
        candidateAiOutputPayload.markdown.trim()
        || candidateAiOutputPayload.raw.trim(),
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

    return (
        <>
            <div
                className={cn(
                    "grid h-full min-h-0 overflow-hidden",
                    candidateFilterBarExpanded
                        ? "grid-rows-[auto_minmax(0,1fr)] gap-4 2xl:gap-6"
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

                <div className="grid min-h-0 items-stretch gap-4 overflow-hidden 2xl:gap-6 xl:grid-cols-[minmax(300px,0.44fr)_minmax(0,0.56fr)] 2xl:grid-cols-[minmax(320px,0.44fr)_minmax(0,0.56fr)]">
                <Card className={cn(panelClass, "min-h-0 !gap-0 overflow-hidden !py-0")}>
                    <CardHeader className="px-4 pt-2 pb-0 sm:px-5">
                        <div className="flex items-center justify-between gap-3">
                            <CardTitle className="text-[15px] leading-none">{tr.candidateList}</CardTitle>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="rounded-full">{visibleCandidates.length}{tr.peopleSuffix}</Badge>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 rounded-md px-2.5 text-xs"
                                    onClick={() => setCandidateFilterBarExpanded((current) => !current)}
                                >
                                    <SlidersHorizontal className="h-4 w-4"/>
                                    {candidateFilterBarExpanded ? tr.collapseFilters : tr.filters}
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="flex min-h-0 flex-1 flex-col px-4 pt-1 pb-2.5 sm:px-5">
                        <div className="mb-0.5 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {tr.selectedCandidates(selectedCandidateIds.length)}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" className="h-7 rounded-md px-2.5 text-xs" onClick={() => setSelectedCandidateIds([])} disabled={!selectedCandidateIds.length}>
                                    {tr.clearSelection}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 rounded-md px-2.5 text-xs"
                                    onClick={() => void triggerScreening(selectedCandidateIds)}
                                    disabled={isBatchScreeningCancelling || (screeningSubmitting && !isBatchScreeningRunning) || (!isBatchScreeningRunning && !selectedCandidateIds.length)}
                                >
                                    {isBatchScreeningCancelling ? <Loader2 className="h-4 w-4 animate-spin"/> : isBatchScreeningRunning ? <Square className="h-4 w-4"/> : screeningSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}
                                    {isBatchScreeningCancelling ? tr.stopping : isBatchScreeningRunning ? tr.stopBatchScreening : screeningSubmitting ? tr.queueing : tr.queueBatch}
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 rounded-md px-2.5 text-xs" onClick={() => openResumeMailDialog(selectedCandidateIds)} disabled={!selectedCandidateIds.length}>
                                    <Mail className="h-4 w-4"/>
                                    {tr.sendResumesBatch}
                                </Button>
                            </div>
                        </div>
                        {candidatesLoading ? (
                            <LoadingCard label={tr.loadingCandidateList}/>
                        ) : candidateViewMode === "list" ? (
                            <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
                                <div
                                    ref={mergedCandidateListScrollRef}
                                    className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable] [scrollbar-width:auto] [scrollbar-color:rgba(148,163,184,0.9)_transparent] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:bg-clip-content hover:[&::-webkit-scrollbar-thumb]:bg-slate-400 dark:[scrollbar-color:rgba(71,85,105,0.95)_transparent] dark:[&::-webkit-scrollbar-thumb]:bg-slate-700 dark:hover:[&::-webkit-scrollbar-thumb]:bg-slate-600"
                                >
                                    <table style={{width: candidateListEffectiveTableWidth, minWidth: candidateListEffectiveTableWidth}} className="caption-bottom table-fixed text-sm">
                                        <thead className="[&_tr]:border-b">
                                            <tr className="border-b bg-white/95 transition-colors dark:bg-slate-950/95">
                                                <th className="text-foreground sticky top-0 z-10 h-10 w-14 bg-inherit px-2 text-left align-middle font-medium whitespace-nowrap">
                                                    <input
                                                        type="checkbox"
                                                        checked={visibleCandidates.length > 0 && visibleCandidates.every((candidate) => selectedCandidateIds.includes(candidate.id))}
                                                        onChange={(event) => setSelectedCandidateIds(event.target.checked ? visibleCandidates.map((candidate) => candidate.id) : [])}
                                                        aria-label={tr.selectAllCandidates}
                                                    />
                                                </th>
                                                {candidateListVisibleColumns.map((columnKey) => {
                                                    const label = columnKey === "candidate"
                                                        ? tr.candidate
                                                        : columnKey === "position"
                                                            ? tr.position
                                                            : columnKey === "status"
                                                                ? tr.status
                                                                : columnKey === "match"
                                                                    ? tr.matchPercent
                                                                    : columnKey === "source"
                                                                        ? tr.source
                                                                        : tr.timeLabel;

                                                    if (!candidateListCompactMode) {
                                                        return renderCandidateListHeaderCell(columnKey, label);
                                                    }

                                                    return (
                                                        <th
                                                            key={columnKey}
                                                            style={{
                                                                width: candidateListEffectiveColumnWidths[columnKey],
                                                                minWidth: candidateListEffectiveColumnWidths[columnKey],
                                                                maxWidth: candidateListEffectiveColumnWidths[columnKey],
                                                            }}
                                                            className="text-foreground sticky top-0 z-10 h-10 bg-inherit px-2 text-left align-middle text-xs font-medium whitespace-nowrap"
                                                        >
                                                            {label}
                                                        </th>
                                                    );
                                                })}
                                            </tr>
                                        </thead>
                                        <tbody className="[&_tr:last-child]:border-0">
                                            {visibleCandidates.length ? (
                                                <>
                                                    {candidateListVirtualMetrics.topSpacerHeight > 0 ? (
                                                        <tr aria-hidden="true" className="border-0">
                                                            <td
                                                                colSpan={candidateListVisibleColumns.length + 1}
                                                                className="h-0 p-0"
                                                                style={{height: candidateListVirtualMetrics.topSpacerHeight, border: 0}}
                                                            />
                                                        </tr>
                                                    ) : null}
                                                    {visibleCandidateWindow.map((candidate) => (
                                                <tr
                                                    key={candidate.id}
                                                    ref={createCandidateRowMeasureRef(candidate.id)}
                                                    className={cn("cursor-pointer", selectedCandidateId === candidate.id && "bg-slate-100 dark:bg-slate-900")}
                                                    onClick={() => setSelectedCandidateId(candidate.id)}
                                                >
                                                    <td className="p-2 align-middle whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedCandidateIds.includes(candidate.id)}
                                                            onChange={(event) => toggleCandidateSelection(candidate.id, event.target.checked)}
                                                            aria-label={tr.selectCandidate(candidate.name)}
                                                        />
                                                    </td>
                                                    <td
                                                        style={{
                                                            width: candidateListEffectiveColumnWidths.candidate,
                                                            minWidth: candidateListEffectiveColumnWidths.candidate,
                                                            maxWidth: candidateListEffectiveColumnWidths.candidate,
                                                        }}
                                                        className="p-2 align-middle"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <HoverRevealText text={candidate.name} className="font-medium text-slate-900 dark:text-slate-100"/>
                                                                {getCandidateResumeMailSummary(candidate.id) ? (
                                                                        <Badge className="rounded-full border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                                                                        {tr.resumeSent}
                                                                    </Badge>
                                                                ) : null}
                                                            </div>
                                                            <HoverRevealText
                                                                text={candidate.phone || candidate.email || tr.noContact}
                                                                className="text-xs text-slate-500 dark:text-slate-400"
                                                            />
                                                            {getCandidateResumeMailSummary(candidate.id) ? (
                                                                <HoverRevealText
                                                                    text={getCandidateResumeMailSummary(candidate.id) || ""}
                                                                    className="mt-1 text-xs text-sky-600 dark:text-slate-300"
                                                                    tooltipClassName="max-w-sm"
                                                                />
                                                            ) : null}
                                                        </div>
                                                    </td>
                                                    <td
                                                        style={{
                                                            width: candidateListEffectiveColumnWidths.position,
                                                            minWidth: candidateListEffectiveColumnWidths.position,
                                                            maxWidth: candidateListEffectiveColumnWidths.position,
                                                        }}
                                                        className="p-2 align-middle"
                                                    >
                                                        <HoverRevealText text={candidate.position_title || tr.unassignedPosition}/>
                                                    </td>
                                                    <td
                                                        style={{
                                                            width: candidateListEffectiveColumnWidths.status,
                                                            minWidth: candidateListEffectiveColumnWidths.status,
                                                            maxWidth: candidateListEffectiveColumnWidths.status,
                                                        }}
                                                        className="p-2 align-middle whitespace-nowrap"
                                                    >
                                                        <Badge className={cn("rounded-full border", statusBadgeClass("candidate", resolveCandidateDisplayStatus(candidate)))}>
                                                            {labelForCandidateStatus(resolveCandidateDisplayStatus(candidate))}
                                                        </Badge>
                                                        {candidate.display_status_reason ? (
                                                            <HoverRevealText
                                                                text={candidate.display_status_reason}
                                                                className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400"
                                                                tooltipClassName="max-w-sm"
                                                            />
                                                        ) : null}
                                                    </td>
                                                    <td
                                                        style={{
                                                            width: candidateListEffectiveColumnWidths.match,
                                                            minWidth: candidateListEffectiveColumnWidths.match,
                                                            maxWidth: candidateListEffectiveColumnWidths.match,
                                                        }}
                                                        className="p-2 align-middle whitespace-nowrap"
                                                    >
                                                        {formatPercent(resolveCandidateSummaryMatchPercent(candidate))}
                                                    </td>
                                                    <td
                                                        style={{
                                                            width: candidateListEffectiveColumnWidths.source,
                                                            minWidth: candidateListEffectiveColumnWidths.source,
                                                            maxWidth: candidateListEffectiveColumnWidths.source,
                                                        }}
                                                        className="p-2 align-middle"
                                                    >
                                                        <HoverRevealText text={candidate.source || "-"} className="text-xs text-slate-600 dark:text-slate-300"/>
                                                    </td>
                                                    <td
                                                        style={{
                                                            width: candidateListEffectiveColumnWidths.updated,
                                                            minWidth: candidateListEffectiveColumnWidths.updated,
                                                            maxWidth: candidateListEffectiveColumnWidths.updated,
                                                        }}
                                                        className="p-2 align-middle"
                                                    >
                                                        <HoverRevealText text={formatDateTime(candidate.updated_at)}/>
                                                    </td>
                                                </tr>
                                                    ))}
                                                    {candidateListVirtualMetrics.bottomSpacerHeight > 0 ? (
                                                        <tr aria-hidden="true" className="border-0">
                                                            <td
                                                                colSpan={candidateListVisibleColumns.length + 1}
                                                                className="h-0 p-0"
                                                                style={{height: candidateListVirtualMetrics.bottomSpacerHeight, border: 0}}
                                                            />
                                                        </tr>
                                                    ) : null}
                                                </>
                                            ) : (
                                                <tr>
                                                    <td colSpan={candidateListVisibleColumns.length + 1} className="p-2 align-middle">
                                                        <EmptyState title={tr.noCandidatesMatched} description={tr.noCandidatesMatchedDesc}/>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="shrink-0 border-t border-slate-200/80 pt-2 dark:border-slate-800">
                                    <div
                                        ref={candidateListHorizontalRailRef}
                                        className="overflow-x-auto overflow-y-hidden [scrollbar-width:auto] [scrollbar-color:rgba(148,163,184,0.95)_transparent] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border [&::-webkit-scrollbar-thumb]:border-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[scrollbar-color:rgba(71,85,105,0.98)_transparent] dark:[&::-webkit-scrollbar-track]:bg-slate-900/80 dark:[&::-webkit-scrollbar-thumb]:border-slate-900 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700"
                                    >
                                        <div style={{width: candidateListEffectiveTableWidth, height: 1}}/>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
                                <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                                    {groupedCandidates.map((group) => (
                                        <div key={group.status} className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                            <div className="mb-4 flex items-center justify-between gap-2">
                                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{group.label}</p>
                                                <Badge variant="outline" className="rounded-full">{group.items.length}</Badge>
                                            </div>
                                            <div className="space-y-3">
                                                {group.items.length ? group.items.map((candidate) => (
                                                    <div
                                                        key={candidate.id}
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
                                                                    {getCandidateResumeMailSummary(candidate.id) ? (
                                                                        <Badge className="rounded-full border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                                                                            {tr.resumeSent}
                                                                        </Badge>
                                                                    ) : null}
                                                                </div>
                                                                <p className="mt-1 line-clamp-2 break-words text-xs leading-5 opacity-80">
                                                                    {candidate.position_title || tr.unassignedPosition}
                                                                </p>
                                                                {getCandidateResumeMailSummary(candidate.id) ? (
                                                                    <p className="mt-2 text-[11px] opacity-80">{getCandidateResumeMailSummary(candidate.id)}</p>
                                                                ) : null}
                                                                <div className="mt-3 flex items-center justify-between text-xs opacity-80">
                                                                    <span>{tr.matchBadge} {formatPercent(resolveCandidateSummaryMatchPercent(candidate))}</span>
                                                                    <span>{formatDateTime(candidate.updated_at)}</span>
                                                                </div>
                                                            </button>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedCandidateIds.includes(candidate.id)}
                                                                onChange={(event) => toggleCandidateSelection(candidate.id, event.target.checked)}
                                                                aria-label={tr.selectCandidate(candidate.name)}
                                                            />
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                                        {tr.noCandidatesInStatus}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className={cn(panelClass, "min-h-0 min-w-0 gap-0 overflow-hidden py-0")}>
                    {candidateDetailLoading ? <LoadingPanel label={tr.loadingCandidateDetail}/> : candidateDetail ? (
                        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
                            <div className="border-b border-slate-200/80 px-4 py-2 dark:border-slate-800">
                                <div className="space-y-1">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1 space-y-1">
                                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                                <Badge className={cn("rounded-full border", statusBadgeClass("candidate", candidateDetailDisplayStatus))}>
                                                    {labelForCandidateStatus(candidateDetailDisplayStatus)}
                                                </Badge>
                                                {candidateDetailHasRuntimeOverride ? (
                                                    <Badge variant="outline" className="rounded-full">
                                                        {tr.originalStatus} {labelForCandidateStatus(candidateDetail.candidate.status)}
                                                    </Badge>
                                                ) : null}
                                                <Badge variant="outline" className="rounded-full">
                                                    {tr.matchBadge} {formatPercent(candidateScoreDisplayValues.matchPercent ?? resolveCandidateSummaryMatchPercent(candidateDetail.candidate))}
                                                </Badge>
                                                <Badge variant="outline" className="rounded-full">
                                                    {tr.sentBadge} {selectedCandidateResumeMailCountLabel}
                                                </Badge>
                                                <span>{candidateDetail.candidate.candidate_code}</span>
                                                {selectedCandidateResumeMailSummary ? (
                                                    <Badge className="rounded-full border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                                                        {selectedCandidateResumeMailSummary}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                                                <h3 className="break-words text-[1.12rem] font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-[1.2rem]">
                                                    {candidateDetail.candidate.name}
                                                </h3>
                                                {candidateDetailHeadlineMeta ? (
                                                    <p className="text-sm text-slate-500 dark:text-slate-400">{candidateDetailHeadlineMeta}</p>
                                                ) : null}
                                            </div>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                                                {candidateDetailIdentityMeta ? <span>{candidateDetailIdentityMeta}</span> : null}
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
                                            <Button size="sm" variant={candidateDetailPanel === "profile" ? "default" : "ghost"} onClick={() => setCandidateDetailPanel("profile")}>
                                                {tr.profileTab}
                                            </Button>
                                            <Button size="sm" variant={candidateDetailPanel === "ai" ? "default" : "ghost"} onClick={() => setCandidateDetailPanel("ai")}>
                                                {tr.aiAssessmentTab}
                                            </Button>
                                            <Button size="sm" variant={candidateDetailPanel === "interview" ? "default" : "ghost"} onClick={() => setCandidateDetailPanel("interview")}>
                                                {tr.interviewPrepTab}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="border-b border-slate-200/80 px-4 py-2 dark:border-slate-800">
                                <div className="min-w-0">
                                    <div
                                        ref={candidateDetailToolbarScrollRef}
                                        onScroll={handleCandidateDetailToolbarScroll}
                                        onWheel={handleCandidateDetailToolbarWheel}
                                        className="min-w-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                                    >
                                        <div className="flex w-max items-center gap-2 pr-1">
                                            <Button
                                                className="shrink-0"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => void triggerScreening()}
                                                disabled={isSelectedCandidateScreeningCancelling || (screeningSubmitting && !selectedCandidateScreeningTaskId)}
                                            >
                                                {isSelectedCandidateScreeningCancelling ? <Loader2 className="h-4 w-4 animate-spin"/> : selectedCandidateScreeningTaskId ? <Square className="h-4 w-4"/> : screeningSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}
                                                {isSelectedCandidateScreeningCancelling ? tr.stopping : selectedCandidateScreeningTaskId ? tr.stopScreening : screeningSubmitting ? tr.queueing : tr.startScreening}
                                            </Button>
                                            {primaryResumeFile ? (
                                                <Button className="shrink-0" size="sm" variant="outline" onClick={() => void openResumeFile(primaryResumeFile)}>
                                                    <ExternalLink className="h-4 w-4"/>
                                                    {tr.viewResume}
                                                </Button>
                                            ) : null}
                                            <Button className="shrink-0" size="sm" variant="outline" onClick={() => openResumeMailDialog([candidateDetail.candidate.id])}>
                                                <Mail className="h-4 w-4"/>
                                                {tr.sendResume}
                                            </Button>
                                            <Button
                                                className="shrink-0"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => void generateInterviewQuestions()}
                                                disabled={isCurrentInterviewTaskCancelling}
                                            >
                                                {currentCandidateInterviewTaskId ? <Square className="h-4 w-4"/> : <NotebookText className="h-4 w-4"/>}
                                                {isCurrentInterviewTaskCancelling ? tr.stopping : currentCandidateInterviewTaskId ? tr.stopGeneration : tr.interviewQuestions}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="shrink-0 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-200 dark:hover:bg-rose-950/40"
                                                onClick={() => requestDeleteCandidate(candidateDetail.candidate)}
                                            >
                                                <Trash2 className="h-4 w-4"/>
                                                {tr.deleteCandidate}
                                            </Button>
                                        </div>
                                    </div>
                                    {shouldShowCurrentScreeningTask ? (
                                        <div className="mt-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{tr.currentScreeningTask}</p>
                                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                        {currentScreeningTaskLog?.output_summary || currentScreeningTaskLog?.error_message || candidateDetail?.candidate.display_status_reason || tr.taskRunning}
                                                    </p>
                                                    {candidateDetail?.candidate.display_status_reason ? (
                                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                            {candidateDetail.candidate.display_status_reason}
                                                        </p>
                                                    ) : null}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {currentScreeningTaskType ? (
                                                        <Badge variant="outline" className="rounded-full">
                                                            {labelForTaskType(currentScreeningTaskType)}
                                                        </Badge>
                                                    ) : null}
                                                    <Badge variant="outline" className="rounded-full">
                                                        {labelForScreeningTaskStage(currentScreeningTaskStage)}
                                                    </Badge>
                                                    {currentScreeningTaskStatus ? (
                                                        <Badge className={cn("rounded-full border", statusBadgeClass("task", currentScreeningTaskStatus))}>
                                                            {labelForTaskExecutionStatus(currentScreeningTaskStatus)}
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}
                                    {candidateDetailToolbarHasOverflow ? (
                                        <div className="mt-1">
                                            <div
                                                ref={candidateDetailToolbarRailRef}
                                                onScroll={handleCandidateDetailToolbarRailScroll}
                                                className="overflow-x-auto overflow-y-hidden [scrollbar-width:auto] [scrollbar-color:rgba(148,163,184,0.95)_transparent] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border [&::-webkit-scrollbar-thumb]:border-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[scrollbar-color:rgba(71,85,105,0.98)_transparent] dark:[&::-webkit-scrollbar-track]:bg-slate-900/80 dark:[&::-webkit-scrollbar-thumb]:border-slate-900 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700"
                                            >
                                                <div style={{width: candidateDetailToolbarRailWidth, height: 1}}/>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 p-4">
                                <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/50">
                                    <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                                        <div className="min-w-0 space-y-4 px-4 py-4">
                                    {candidateDetailPanel === "profile" ? (
                                        <>
                                            <Field label={tr.baseInfo}>
                                                <div className="grid gap-3 md:grid-cols-2">
                                                    <Input value={candidateEditor.name} onChange={(event) => setCandidateEditor((current) => ({...current, name: event.target.value}))} placeholder={tr.namePlaceholder}/>
                                                    <Input value={candidateEditor.phone} onChange={(event) => setCandidateEditor((current) => ({...current, phone: event.target.value}))} placeholder={tr.phonePlaceholder}/>
                                                    <Input value={candidateEditor.email} onChange={(event) => setCandidateEditor((current) => ({...current, email: event.target.value}))} placeholder={tr.emailPlaceholder}/>
                                                    <Input value={candidateEditor.currentCompany} onChange={(event) => setCandidateEditor((current) => ({...current, currentCompany: event.target.value}))} placeholder={tr.companyPlaceholder}/>
                                                    <Input value={candidateEditor.yearsOfExperience} onChange={(event) => setCandidateEditor((current) => ({...current, yearsOfExperience: event.target.value}))} placeholder={tr.experiencePlaceholder}/>
                                                    <Input value={candidateEditor.education} onChange={(event) => setCandidateEditor((current) => ({...current, education: event.target.value}))} placeholder={tr.educationPlaceholder}/>
                                                </div>
                                            </Field>

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

                                            <Field label={tr.statusFlow}>
                                                <div className="space-y-3">
                                                    <div className="flex flex-wrap gap-2">
                                                        {Object.entries(candidateStatusLabels).map(([value, label]) => {
                                                            const isCurrent = candidateDetail.candidate.status === value;
                                                            return (
                                                                <Popover
                                                                    key={value}
                                                                    open={pendingStatus === value}
                                                                    onOpenChange={(open) => {
                                                                        if (!open) setPendingStatus(null);
                                                                    }}
                                                                >
                                                                    <PopoverTrigger asChild>
                                                                        <Button
                                                                            size="sm"
                                                                            variant={isCurrent ? "default" : "outline"}
                                                                            onClick={() => {
                                                                                if (!isCurrent) setPendingStatus(value);
                                                                            }}
                                                                        >
                                                                            {label}
                                                                        </Button>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent className="w-56 p-3" side="bottom" align="start">
                                                                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                                            {tr.confirmStatusChange(label)}
                                                                        </p>
                                                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                                            {tr.currentStatusLine(labelForCandidateStatus(resolveCandidateDisplayStatus(candidateDetail.candidate)))}
                                                                        </p>
                                                                        <div className="mt-3 flex gap-2">
                                                                            <Button size="sm" className="flex-1" onClick={() => void updateCandidateStatus(value)}>
                                                                                {tr.confirm}
                                                                            </Button>
                                                                            <Button size="sm" variant="outline" className="flex-1" onClick={() => setPendingStatus(null)}>
                                                                                {tr.cancel}
                                                                            </Button>
                                                                        </div>
                                                                    </PopoverContent>
                                                                </Popover>
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
                                        </>
                                    ) : null}

                                    {candidateDetailPanel === "ai" ? (
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
                                                            <p className="font-medium text-slate-900 dark:text-slate-100">{tr.dimensionScores}</p>
                                                            {readScoreDimensions(candidateDetail.score?.dimensions).length > 0 ? (
                                                                <ul className="space-y-2">
                                                                    {readScoreDimensions(candidateDetail.score?.dimensions).map((item, index) => {
                                                                        const label = readScoreText(item.label) || "-";
                                                                        const scoreValue = readScoreNumberStrict(item.score);
                                                                        const maxScore = readScoreNumberStrict(item.max_score);
                                                                        const evidences = readDimensionEvidenceList(item.evidence);
                                                                        return (
                                                                            <li key={`dimension-${index}`} className="rounded-xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                                                                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                                                    {label}：{scoreValue !== null ? scoreValue : "-"} / {maxScore !== null ? maxScore : "-"}
                                                                                </p>
                                                                                <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
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

                                            <Field label={tr.screeningMemory}>
                                                {candidateDetail.workflow_memory ? (
                                                    <div className="grid gap-3 md:grid-cols-2">
                                                        <InfoTile label={tr.memorySource} value={labelForMemorySource(candidateDetail.workflow_memory.screening_memory_source)}/>
                                                        <InfoTile label={tr.lastScreeningTime} value={formatLongDateTime(candidateDetail.workflow_memory.last_screened_at)}/>
                                                        <InfoTile label={tr.screeningSkills} value={formatSkillNames(candidateDetail.workflow_memory.screening_skill_ids, skillMap)}/>
                                                        <InfoTile label={tr.interviewSkills} value={formatSkillNames(candidateDetail.workflow_memory.interview_skill_ids, skillMap)}/>
                                                    </div>
                                                ) : (
                                                    <EmptyState title={tr.noScreeningMemory} description={tr.noScreeningMemoryDesc}/>
                                                )}
                                                <p className="mt-3 break-words text-xs leading-6 text-slate-500 dark:text-slate-400">
                                                    {tr.screeningMemoryHint(effectiveScreeningSkillSourceLabel)}
                                                </p>
                                                <p className="mt-2 break-words text-xs leading-6 text-slate-500 dark:text-slate-400">
                                                    {tr.screeningSkillPreview(formatSkillNames(effectiveScreeningSkillIds, skillMap))}
                                                </p>
                                            </Field>

                                            <div className="grid gap-4 md:grid-cols-2">
                                                <Field label={tr.manualOverrideScore}>
                                                    <Input value={candidateEditor.manualOverrideScore} onChange={(event) => setCandidateEditor((current) => ({...current, manualOverrideScore: event.target.value}))} placeholder={tr.overrideScorePlaceholder}/>
                                                </Field>
                                                <Field label={tr.overrideReason}>
                                                    <Input value={candidateEditor.manualOverrideReason} onChange={(event) => setCandidateEditor((current) => ({...current, manualOverrideReason: event.target.value}))} placeholder={tr.overrideReasonPlaceholder}/>
                                                </Field>
                                            </div>

                                            <Field label={tr.aiAssistant}>
                                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{tr.assistantPackedTitle}</p>
                                                            <p className="mt-1 break-words text-sm leading-6 text-slate-500 dark:text-slate-400">
                                                                {candidateAssistantActivity.length
                                                                    ? tr.assistantPackedDescWithCount(candidateAssistantActivity.length)
                                                                    : tr.assistantPackedDescEmpty}
                                                            </p>
                                                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{tr.defaultInterviewSource(preferredInterviewSkillSourceLabel)}</p>
                                                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{tr.actualSource(effectiveInterviewSkillSourceLabel)}</p>
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
                                                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
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
                                                                    <div key={log.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                                            <div className="min-w-0 flex-1">
                                                                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{labelForTaskType(log.task_type)}</p>
                                                                                <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">{labelForProvider(log.model_provider)} · {log.model_name || "-"} · {formatLongDateTime(log.created_at)}</p>
                                                                            </div>
                                                                            <Badge className={cn("rounded-full border", statusBadgeClass("task", log.status))}>
                                                                                {labelForTaskExecutionStatus(log.status)}
                                                                            </Badge>
                                                                        </div>
                                                                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                                                                            <InfoTile label="Skills" value={formatSkillSnapshotNames(logSkillSnapshots)}/>
                                                                            <InfoTile label={tr.memorySource} value={labelForMemorySource(log.memory_source)}/>
                                                                        </div>
                                                                        {log.error_message ? <p className="mt-3 break-all text-sm text-rose-600">{log.error_message}</p> : null}
                                                                        <OutputSnippet content={formatStructuredValue(log.output_snapshot, log.output_summary || tr.runningAwaitModel)}/>
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

                                    {candidateDetailPanel === "interview" ? (
                                        <div className="space-y-4">
                                            <div className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
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
                                                            <Button size="sm" variant="outline" onClick={() => void openResumeFile(primaryResumeFile)}>{tr.viewOriginal}</Button>
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
                                                    <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                                                        {tr.parseErrorLine(primaryResumeFile.parse_error)}
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
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
                                                    {tr.actualSkills(formatSkillNames(effectiveInterviewSkillIds, skillMap))}
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
                                        </div>
                                    ) : null}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex h-full min-h-0 flex-1 flex-col">
                            <div className="border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
                                <div className="space-y-1.5">
                                    <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{tr.candidateWorkspace}</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">{tr.candidateWorkspaceDesc}</p>
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
                                            {recentVisibleCandidates.length ? recentVisibleCandidates.map((candidate) => (
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
                </Card>
                </div>
            </div>
            <CandidateAiOutputDialog
                open={candidateAiOutputDialogOpen}
                onOpenChange={setCandidateAiOutputDialogOpen}
                markdown={candidateAiOutputPayload.markdown}
                raw={candidateAiOutputPayload.raw}
                modelLabel={latestResumeScoreLog ? `${labelForProvider(latestResumeScoreLog.model_provider)} / ${latestResumeScoreLog.model_name || tr.unrecorded}` : null}
                generatedAt={latestResumeScoreLog?.created_at || candidateDetail?.score?.updated_at || candidateDetail?.score?.created_at}
            />
        </>
    );
}
