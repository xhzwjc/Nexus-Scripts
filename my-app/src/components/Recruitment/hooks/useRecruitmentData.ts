"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { getStoredScriptHubSession } from "@/lib/auth";
import {
    recruitmentApi,
    type AITaskLog,
    type CandidateDetail,
    type CandidateSummary,
    type ChatContext,
    type DashboardData,
    type JDVersion,
    type PositionDetail,
    type PositionSummary,
    type RecruitmentLLMConfig,
    type RecruitmentMailRecipient,
    type RecruitmentMailSenderConfig,
    type RecruitmentMetadata,
    type RecruitmentResumeMailDispatch,
    type RecruitmentSkill,
} from "@/lib/recruitment-api";

import { buildQuery, formatActionError } from "../utils";

/* ─── 请求去重标记 ─── */
const inflightKeys = new Set<string>();

async function dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (inflightKeys.has(key)) {
        return undefined as unknown as T;
    }
    inflightKeys.add(key);
    try {
        return await fn();
    } finally {
        inflightKeys.delete(key);
    }
}

/**
 * useRecruitmentData
 *
 * 统一管理所有招聘数据加载、刷新逻辑。
 * - 内置请求去重（问题 #15）
 * - 分优先级 bootstrap（问题 #4）
 */

export interface RecruitmentDataState {
    /* 权限 */
    sessionUser: ReturnType<typeof getStoredScriptHubSession> extends infer U
        ? U extends { user: infer V } ? V : null
        : null;
    canManageRecruitment: boolean;

    /* 数据 */
    metadata: RecruitmentMetadata | null;
    dashboard: DashboardData | null;
    positions: PositionSummary[];
    positionDetail: PositionDetail | null;
    candidates: CandidateSummary[];
    candidateDetail: CandidateDetail | null;
    skills: RecruitmentSkill[];
    aiLogs: AITaskLog[];
    selectedLogDetail: AITaskLog | null;
    chatContext: ChatContext;
    llmConfigs: RecruitmentLLMConfig[];
    mailSenderConfigs: RecruitmentMailSenderConfig[];
    mailRecipients: RecruitmentMailRecipient[];
    resumeMailDispatches: RecruitmentResumeMailDispatch[];

    /* 加载状态 */
    bootstrapping: boolean;
    positionsLoading: boolean;
    positionDetailLoading: boolean;
    candidatesLoading: boolean;
    candidateDetailLoading: boolean;
    logsLoading: boolean;
    logDetailLoading: boolean;
    skillsLoading: boolean;
    modelsLoading: boolean;
    mailSettingsLoading: boolean;
    coreRefreshing: boolean;

    /* 派生 Maps */
    positionMap: Map<number, PositionSummary>;
    candidateMap: Map<number, CandidateSummary>;
    skillMap: Map<number, RecruitmentSkill>;
    enabledSkills: RecruitmentSkill[];
    mailSenderMap: Map<number, RecruitmentMailSenderConfig>;
    mailRecipientMap: Map<number, RecruitmentMailRecipient>;
}

export interface RecruitmentDataActions {
    loadMetadata: () => Promise<RecruitmentMetadata>;
    loadDashboard: () => Promise<DashboardData>;
    loadPositions: (query?: string, status?: string) => Promise<PositionSummary[]>;
    loadPositionDetail: (positionId: number) => Promise<PositionDetail | null>;
    loadCandidates: (params?: { query?: string; status?: string; positionId?: string }) => Promise<CandidateSummary[]>;
    loadCandidateDetail: (candidateId: number, options?: { silent?: boolean }) => Promise<CandidateDetail | null>;
    loadLogs: (params?: { taskType?: string; status?: string }, options?: { silent?: boolean }) => Promise<AITaskLog[]>;
    loadLogDetail: (taskId: number, options?: { silent?: boolean }) => Promise<void>;
    loadSkills: () => Promise<RecruitmentSkill[]>;
    loadLLMConfigs: () => Promise<RecruitmentLLMConfig[]>;
    loadChatContext: () => Promise<ChatContext>;
    loadMailSettings: () => Promise<{ senders: RecruitmentMailSenderConfig[]; recipients: RecruitmentMailRecipient[]; dispatches: RecruitmentResumeMailDispatch[] }>;
    refreshCoreData: () => Promise<void>;
    refreshCoreDataWithFeedback: () => Promise<void>;
    refreshLLMConfigsWithFeedback: () => Promise<void>;
    refreshMailSettingsWithFeedback: () => Promise<void>;
    refreshLogsWithFeedback: () => Promise<void>;
    setPositionDetail: React.Dispatch<React.SetStateAction<PositionDetail | null>>;
    setCandidateDetail: React.Dispatch<React.SetStateAction<CandidateDetail | null>>;
    setSelectedLogDetail: React.Dispatch<React.SetStateAction<AITaskLog | null>>;
    setChatContext: React.Dispatch<React.SetStateAction<ChatContext>>;
    setAiLogs: React.Dispatch<React.SetStateAction<AITaskLog[]>>;
    mergeAiTaskLog: (log: AITaskLog) => void;
}

export function useRecruitmentData(): RecruitmentDataState & RecruitmentDataActions {
    const sessionUser = useMemo(() => getStoredScriptHubSession()?.user ?? null, []);
    const canManageRecruitment = Boolean(
        sessionUser?.permissions["ai-recruitment-manage"]
        || sessionUser?.permissions["rbac-manage"],
    );

    const [bootstrapping, setBootstrapping] = useState(true);
    const [metadata, setMetadata] = useState<RecruitmentMetadata | null>(null);
    const [dashboard, setDashboard] = useState<DashboardData | null>(null);
    const [positions, setPositions] = useState<PositionSummary[]>([]);
    const [positionDetail, setPositionDetail] = useState<PositionDetail | null>(null);
    const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
    const [candidateDetail, setCandidateDetail] = useState<CandidateDetail | null>(null);
    const [skills, setSkills] = useState<RecruitmentSkill[]>([]);
    const [aiLogs, setAiLogs] = useState<AITaskLog[]>([]);
    const [selectedLogDetail, setSelectedLogDetail] = useState<AITaskLog | null>(null);
    const [chatContext, setChatContext] = useState<ChatContext>({
        position_id: null,
        position_title: null,
        skill_ids: [],
        skills: [],
    });
    const [llmConfigs, setLlmConfigs] = useState<RecruitmentLLMConfig[]>([]);
    const [mailSenderConfigs, setMailSenderConfigs] = useState<RecruitmentMailSenderConfig[]>([]);
    const [mailRecipients, setMailRecipients] = useState<RecruitmentMailRecipient[]>([]);
    const [resumeMailDispatches, setResumeMailDispatches] = useState<RecruitmentResumeMailDispatch[]>([]);

    const [positionsLoading, setPositionsLoading] = useState(false);
    const [positionDetailLoading, setPositionDetailLoading] = useState(false);
    const [candidatesLoading, setCandidatesLoading] = useState(false);
    const [candidateDetailLoading, setCandidateDetailLoading] = useState(false);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logDetailLoading, setLogDetailLoading] = useState(false);
    const [skillsLoading, setSkillsLoading] = useState(false);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [mailSettingsLoading, setMailSettingsLoading] = useState(false);
    const [coreRefreshing, setCoreRefreshing] = useState(false);

    /* ─── 派生 Maps ─── */
    const positionMap = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
    const candidateMap = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
    const skillMap = useMemo(() => new Map(skills.map((s) => [s.id, s])), [skills]);
    const enabledSkills = useMemo(() => skills.filter((s) => s.is_enabled !== false), [skills]);
    const mailSenderMap = useMemo(() => new Map(mailSenderConfigs.map((s) => [s.id, s])), [mailSenderConfigs]);
    const mailRecipientMap = useMemo(() => new Map(mailRecipients.map((r) => [r.id, r])), [mailRecipients]);

    /* ─── 加载函数 ─── */
    const loadMetadata = useCallback(async () => {
        return dedup("metadata", async () => {
            const data = await recruitmentApi<RecruitmentMetadata>("/metadata");
            setMetadata(data);
            return data;
        });
    }, []);

    const loadDashboard = useCallback(async () => {
        return dedup("dashboard", async () => {
            const data = await recruitmentApi<DashboardData>("/dashboard");
            setDashboard(data);
            return data;
        });
    }, []);

    const loadPositions = useCallback(async (query?: string, status?: string) => {
        return dedup("positions", async () => {
            setPositionsLoading(true);
            try {
                const data = await recruitmentApi<PositionSummary[]>(
                    `/positions${buildQuery({ query, status })}`,
                );
                setPositions(data);
                return data;
            } catch (error) {
                toast.error(`加载岗位失败：${error instanceof Error ? error.message : "未知错误"}`);
                throw error;
            } finally {
                setPositionsLoading(false);
            }
        });
    }, []);

    const loadPositionDetail = useCallback(async (positionId: number) => {
        setPositionDetailLoading(true);
        try {
            const data = await recruitmentApi<PositionDetail>(`/positions/${positionId}`);
            setPositionDetail(data);
            return data;
        } catch (error) {
            toast.error(`加载岗位详情失败：${error instanceof Error ? error.message : "未知错误"}`);
            return null;
        } finally {
            setPositionDetailLoading(false);
        }
    }, []);

    const loadCandidates = useCallback(async (params?: { query?: string; status?: string; positionId?: string }) => {
        return dedup("candidates", async () => {
            setCandidatesLoading(true);
            try {
                const data = await recruitmentApi<CandidateSummary[]>(
                    `/candidates${buildQuery({
                        query: params?.query,
                        status: params?.status,
                        position_id: params?.positionId === "all" ? null : params?.positionId,
                    })}`,
                );
                setCandidates(data);
                return data;
            } catch (error) {
                toast.error(`加载候选人失败：${error instanceof Error ? error.message : "未知错误"}`);
                throw error;
            } finally {
                setCandidatesLoading(false);
            }
        });
    }, []);

    const loadCandidateDetail = useCallback(async (candidateId: number, options?: { silent?: boolean }) => {
        if (!options?.silent) {
            setCandidateDetailLoading(true);
        }
        try {
            const data = await recruitmentApi<CandidateDetail>(`/candidates/${candidateId}`);
            setCandidateDetail(data);
            return data;
        } catch (error) {
            if (!options?.silent) {
                toast.error(`加载候选人详情失败：${error instanceof Error ? error.message : "未知错误"}`);
            }
            return null;
        } finally {
            if (!options?.silent) {
                setCandidateDetailLoading(false);
            }
        }
    }, []);

    const loadLogs = useCallback(async (params?: { taskType?: string; status?: string }, options?: { silent?: boolean }) => {
        return dedup("logs", async () => {
            if (!options?.silent) {
                setLogsLoading(true);
            }
            try {
                const data = await recruitmentApi<AITaskLog[]>(
                    `/ai-task-logs${buildQuery({ task_type: params?.taskType, status: params?.status })}`,
                );
                setAiLogs(data);
                return data;
            } catch (error) {
                if (!options?.silent) {
                    toast.error(`加载 AI 任务失败：${error instanceof Error ? error.message : "未知错误"}`);
                }
                throw error;
            } finally {
                if (!options?.silent) {
                    setLogsLoading(false);
                }
            }
        });
    }, []);

    const loadLogDetail = useCallback(async (taskId: number, options?: { silent?: boolean }) => {
        if (!options?.silent) {
            setLogDetailLoading(true);
        }
        try {
            const data = await recruitmentApi<AITaskLog>(`/ai-task-logs/${taskId}`);
            setSelectedLogDetail(data);
        } catch (error) {
            if (!options?.silent) {
                toast.error(`加载任务详情失败：${error instanceof Error ? error.message : "未知错误"}`);
            }
        } finally {
            if (!options?.silent) {
                setLogDetailLoading(false);
            }
        }
    }, []);

    const loadSkills = useCallback(async () => {
        return dedup("skills", async () => {
            setSkillsLoading(true);
            try {
                const data = await recruitmentApi<RecruitmentSkill[]>("/skills");
                setSkills(data);
                return data;
            } catch (error) {
                toast.error(`加载 Skills 失败：${error instanceof Error ? error.message : "未知错误"}`);
                throw error;
            } finally {
                setSkillsLoading(false);
            }
        });
    }, []);

    const loadLLMConfigs = useCallback(async () => {
        if (!canManageRecruitment) {
            return [];
        }
        return dedup("llm-configs", async () => {
            setModelsLoading(true);
            try {
                const data = await recruitmentApi<RecruitmentLLMConfig[]>("/llm-configs");
                setLlmConfigs(data);
                return data;
            } catch (error) {
                toast.error(`加载模型配置失败：${error instanceof Error ? error.message : "未知错误"}`);
                throw error;
            } finally {
                setModelsLoading(false);
            }
        });
    }, [canManageRecruitment]);

    const loadChatContext = useCallback(async () => {
        const data = await recruitmentApi<ChatContext>("/chat/context");
        setChatContext(data);
        return data;
    }, []);

    const loadMailSettings = useCallback(async () => {
        return dedup("mail-settings", async () => {
            setMailSettingsLoading(true);
            try {
                const [senders, recipients, dispatches] = await Promise.all([
                    recruitmentApi<RecruitmentMailSenderConfig[]>("/mail-senders"),
                    recruitmentApi<RecruitmentMailRecipient[]>("/mail-recipients"),
                    recruitmentApi<RecruitmentResumeMailDispatch[]>("/resume-mail-dispatches"),
                ]);
                setMailSenderConfigs(senders);
                setMailRecipients(recipients);
                setResumeMailDispatches(dispatches);
                return { senders, recipients, dispatches };
            } catch (error) {
                toast.error(`加载邮件配置失败：${error instanceof Error ? error.message : "未知错误"}`);
                throw error;
            } finally {
                setMailSettingsLoading(false);
            }
        });
    }, []);

    /* ─── 刷新 ─── */
    const refreshCoreData = useCallback(async () => {
        await Promise.all([loadDashboard(), loadPositions(), loadCandidates(), loadLogs(), loadMailSettings()]);
    }, [loadDashboard, loadPositions, loadCandidates, loadLogs, loadMailSettings]);

    const refreshCoreDataWithFeedback = useCallback(async () => {
        if (coreRefreshing) return;
        setCoreRefreshing(true);
        try {
            await refreshCoreData();
            toast.success("工作台数据已刷新");
        } catch (error) {
            toast.error(`刷新工作台失败：${formatActionError(error)}`);
        } finally {
            setCoreRefreshing(false);
        }
    }, [coreRefreshing, refreshCoreData]);

    const refreshLLMConfigsWithFeedback = useCallback(async () => {
        if (modelsLoading) return;
        try {
            await loadLLMConfigs();
            toast.success("模型配置已刷新");
        } catch {
            // loadLLMConfigs already reports the error toast
        }
    }, [modelsLoading, loadLLMConfigs]);

    const refreshMailSettingsWithFeedback = useCallback(async () => {
        if (mailSettingsLoading) return;
        try {
            await loadMailSettings();
            toast.success("邮件配置已刷新");
        } catch {
            // loadMailSettings already reports the error toast
        }
    }, [mailSettingsLoading, loadMailSettings]);

    const refreshLogsWithFeedback = useCallback(async () => {
        if (logsLoading) return;
        try {
            await loadLogs();
            toast.success("任务日志已刷新");
        } catch {
            // loadLogs already reports the error toast
        }
    }, [logsLoading, loadLogs]);

    /* ─── 合并单条日志 ─── */
    const mergeAiTaskLog = useCallback((log: AITaskLog) => {
        setAiLogs((current) => {
            const index = current.findIndex((item) => item.id === log.id);
            if (index === -1) {
                return [log, ...current];
            }
            const next = [...current];
            next[index] = log;
            return next;
        });
    }, []);

    /* ─── Bootstrap（分优先级） ─── */
    useEffect(() => {
        let cancelled = false;
        async function bootstrap() {
            setBootstrapping(true);
            try {
                // 优先加载核心数据
                await Promise.all([
                    loadMetadata(),
                    loadDashboard(),
                    loadPositions(),
                    loadCandidates(),
                    loadLogs(),
                    loadSkills(),
                    loadMailSettings(),
                    loadChatContext(),
                    canManageRecruitment ? loadLLMConfigs() : Promise.resolve(),
                ]);
            } finally {
                if (!cancelled) {
                    setBootstrapping(false);
                }
            }
        }
        void bootstrap();
        return () => { cancelled = true; };
    }, [canManageRecruitment, loadMetadata, loadDashboard, loadPositions, loadCandidates, loadLogs, loadSkills, loadMailSettings, loadChatContext, loadLLMConfigs]);

    return {
        sessionUser, canManageRecruitment,
        metadata, dashboard, positions, positionDetail, candidates, candidateDetail,
        skills, aiLogs, selectedLogDetail, chatContext, llmConfigs,
        mailSenderConfigs, mailRecipients, resumeMailDispatches,
        bootstrapping, positionsLoading, positionDetailLoading, candidatesLoading,
        candidateDetailLoading, logsLoading, logDetailLoading, skillsLoading,
        modelsLoading, mailSettingsLoading, coreRefreshing,
        positionMap, candidateMap, skillMap, enabledSkills, mailSenderMap, mailRecipientMap,
        loadMetadata, loadDashboard, loadPositions, loadPositionDetail,
        loadCandidates, loadCandidateDetail, loadLogs, loadLogDetail,
        loadSkills, loadLLMConfigs, loadChatContext, loadMailSettings,
        refreshCoreData, refreshCoreDataWithFeedback,
        refreshLLMConfigsWithFeedback, refreshMailSettingsWithFeedback, refreshLogsWithFeedback,
        setPositionDetail, setCandidateDetail, setSelectedLogDetail, setChatContext, setAiLogs,
        mergeAiTaskLog,
    };
}
