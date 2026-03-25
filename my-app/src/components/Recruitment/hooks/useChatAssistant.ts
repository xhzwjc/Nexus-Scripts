"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
    recruitmentApi,
    type AITaskLog,
    type ChatContext,
    type ChatResponse,
    type RecruitmentSkill,
} from "@/lib/recruitment-api";

import type { AssistantDisplayMode, ChatMessage } from "../types";
import { parseStructuredLogOutput, resolveLogSkillSnapshots } from "../utils";

const STORAGE_KEY = "recruitment-chat-messages";
const MAX_PERSISTED_MESSAGES = 50;

function loadPersistedMessages(): ChatMessage[] {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch {
        // ignore
    }
    return [];
}

function persistMessages(messages: ChatMessage[]) {
    try {
        const toPersist = messages.slice(-MAX_PERSISTED_MESSAGES).map((m) => ({
            ...m,
            pending: false,
            taskId: null,
        }));
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
    } catch {
        // ignore storage full
    }
}

const DEFAULT_INTRO_MESSAGE: ChatMessage = {
    id: "intro",
    role: "assistant",
    content: "我是 AI 招聘工作台助手。你可以直接让我生成 JD、查看岗位候选人、重新初筛某位候选人并追加硬性条件，或者说明这次对话实际使用了哪些 Skills。",
    createdAt: new Date().toISOString(),
};

function extractChatReplyFromLog(log: AITaskLog) {
    const parsed = parseStructuredLogOutput(log.output_snapshot);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const reply = (parsed as Record<string, unknown>).reply;
        if (typeof reply === "string" && reply.trim()) {
            return reply.trim();
        }
    }
    if (typeof parsed === "string" && parsed.trim()) {
        return parsed.trim();
    }
    if (log.status === "cancelled") {
        return "已停止生成。";
    }
    if (log.status === "failed") {
        return `发送失败：${log.error_message || "未知错误"}`;
    }
    return log.output_summary || "已完成";
}

/**
 * useChatAssistant
 *
 * 封装聊天状态、发送逻辑、上下文管理：
 * - 聊天记录持久化到 sessionStorage（问题 #7）
 * - 支持文件附件上传
 * - 简化为 page + fullscreen 两种模式（问题 #12）
 */

export interface ChatAssistantDeps {
    chatContext: ChatContext;
    setChatContext: React.Dispatch<React.SetStateAction<ChatContext>>;
    skillMap: Map<number, RecruitmentSkill>;
    startTaskMonitor: (
        taskId: number,
        callbacks: {
            onUpdate?: (log: AITaskLog) => void;
            onFinish?: (log: AITaskLog) => Promise<void> | void;
        },
    ) => void;
    stopTaskMonitor: (taskId: number) => void;
    cancelTaskGeneration: (
        taskId: number,
        taskLabel: string,
        cancellingTaskIds: number[],
        setCancellingTaskIds: React.Dispatch<React.SetStateAction<number[]>>,
        options?: { silent?: boolean },
    ) => Promise<AITaskLog | null>;
    mergeAiTaskLog: (log: AITaskLog) => void;
    loadLogs: (params?: { taskType?: string; status?: string }, options?: { silent?: boolean }) => Promise<AITaskLog[]>;
    loadDashboard: () => Promise<unknown>;
}

export function useChatAssistant(deps: ChatAssistantDeps) {
    const {
        chatContext, setChatContext, skillMap,
        startTaskMonitor, stopTaskMonitor, cancelTaskGeneration,
        mergeAiTaskLog, loadLogs, loadDashboard,
    } = deps;

    /* ─── 状态 ─── */
    const persisted = loadPersistedMessages();
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>(
        persisted.length > 0 ? persisted : [DEFAULT_INTRO_MESSAGE],
    );
    const [chatInput, setChatInput] = useState("");
    const [chatSending, setChatSending] = useState(false);
    const [activeChatTaskId, setActiveChatTaskId] = useState<number | null>(null);
    const [activeChatMessageId, setActiveChatMessageId] = useState<string | null>(null);
    const [cancellingTaskIds, setCancellingTaskIds] = useState<number[]>([]);
    const [assistantDisplayMode, setAssistantDisplayMode] = useState<AssistantDisplayMode>("page");
    const [assistantOpen, setAssistantOpen] = useState(false);
    const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

    const assistantScrollAnchorRef = useRef<HTMLDivElement | null>(null);
    const assistantScrollAreaRef = useRef<HTMLDivElement | null>(null);
    const assistantInputRef = useRef<HTMLTextAreaElement | null>(null);
    const mountedRef = useRef(true);

    /* ─── 持久化 ─── */
    useEffect(() => {
        persistMessages(chatMessages);
    }, [chatMessages]);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    /* ─── 自动滚动到底部 ─── */
    useEffect(() => {
        const viewport = assistantScrollAreaRef.current;
        if (!viewport || !assistantScrollAnchorRef.current) return;
        const frameId = window.requestAnimationFrame(() => {
            viewport.scrollTo({
                top: viewport.scrollHeight,
                behavior: chatSending ? "auto" : "smooth",
            });
        });
        return () => window.cancelAnimationFrame(frameId);
    }, [assistantDisplayMode, assistantOpen, chatMessages, chatSending]);

    /* ─── 焦点管理 ─── */
    const focusAssistantInput = useCallback((moveCursorToEnd = false) => {
        const input = assistantInputRef.current;
        if (!input) return;
        input.focus({ preventScroll: true });
        if (moveCursorToEnd) {
            const length = input.value.length;
            input.setSelectionRange(length, length);
        }
    }, []);

    const queueAssistantInputFocus = useCallback((moveCursorToEnd = false) => {
        window.requestAnimationFrame(() => focusAssistantInput(moveCursorToEnd));
    }, [focusAssistantInput]);

    /* ─── 消息更新 ─── */
    const updateChatMessage = useCallback((messageId: string, updater: (msg: ChatMessage) => ChatMessage) => {
        setChatMessages((current) => current.map((msg) => (
            msg.id === messageId ? updater(msg) : msg
        )));
    }, []);

    /* ─── 附件管理 ─── */
    const addAttachedFiles = useCallback((files: FileList | File[]) => {
        const newFiles = Array.from(files);
        setAttachedFiles((current) => [...current, ...newFiles]);
    }, []);

    const removeAttachedFile = useCallback((index: number) => {
        setAttachedFiles((current) => current.filter((_, i) => i !== index));
    }, []);

    const clearAttachedFiles = useCallback(() => {
        setAttachedFiles([]);
    }, []);

    /* ─── 发送消息（支持附件） ─── */
    const sendChatMessage = useCallback(async () => {
        if (activeChatTaskId) {
            if (cancellingTaskIds.includes(activeChatTaskId)) return;
            try {
                if (activeChatMessageId) {
                    updateChatMessage(activeChatMessageId, (msg) => ({
                        ...msg, content: "正在停止生成...",
                    }));
                }
                const log = await cancelTaskGeneration(
                    activeChatTaskId, "AI 助手",
                    cancellingTaskIds, setCancellingTaskIds,
                );
                if (log?.status === "cancelled") {
                    stopTaskMonitor(activeChatTaskId);
                    if (activeChatMessageId) {
                        updateChatMessage(activeChatMessageId, (msg) => ({
                            ...msg,
                            content: "已停止生成。",
                            pending: false,
                            taskId: null,
                            logId: log.id,
                        }));
                    }
                    setActiveChatTaskId((c) => (c === activeChatTaskId ? null : c));
                    setActiveChatMessageId((c) => (c === activeChatMessageId ? null : c));
                }
            } catch (error) {
                toast.error(`停止助手生成失败：${error instanceof Error ? error.message : "未知错误"}`);
            }
            return;
        }
        if (chatSending) return;
        const message = chatInput.trim();
        if (!message && attachedFiles.length === 0) return;

        const userMessageId = `u-${Date.now()}`;
        const fileNames = attachedFiles.map((f) => f.name);
        const userContent = fileNames.length > 0
            ? `${message}\n\n📎 附件：${fileNames.join("、")}`
            : message;

        setChatMessages((current) => [
            ...current,
            { id: userMessageId, role: "user", content: userContent, createdAt: new Date().toISOString() },
        ]);
        setChatInput("");
        setChatSending(true);

        let startedAsyncTask = false;
        try {
            // 如果有附件，使用 FormData
            let response: ChatResponse;
            if (attachedFiles.length > 0) {
                const formData = new FormData();
                formData.append("message", message);
                formData.append("context", JSON.stringify({
                    position_id: chatContext.position_id,
                    candidate_id: chatContext.candidate_id,
                    skill_ids: chatContext.skill_ids,
                }));
                attachedFiles.forEach((file) => formData.append("files", file));
                response = await recruitmentApi<ChatResponse>("/chat/start", {
                    method: "POST",
                    body: formData,
                });
            } else {
                response = await recruitmentApi<ChatResponse>("/chat/start", {
                    method: "POST",
                    body: JSON.stringify({
                        message,
                        context: {
                            position_id: chatContext.position_id,
                            candidate_id: chatContext.candidate_id,
                            skill_ids: chatContext.skill_ids,
                        },
                    }),
                });
            }

            clearAttachedFiles();
            setChatContext(response.context);

            if (!response.pending || !response.task_id) {
                setChatMessages((current) => [
                    ...current,
                    {
                        id: `a-${Date.now()}`,
                        role: "assistant",
                        content: response.reply,
                        createdAt: new Date().toISOString(),
                        actions: response.actions,
                        logId: response.log_id ?? undefined,
                        memorySource: response.memory_source,
                        modelProvider: response.model_provider,
                        modelName: response.model_name,
                        usedSkillIds: response.used_skill_ids,
                        usedSkills: response.used_skills,
                        usedFallback: response.used_fallback,
                        fallbackError: response.fallback_error,
                    },
                ]);
                if (response.used_fallback) {
                    toast.error(`本次 AI 调用已回退到兜底结果：${response.fallback_error || "未返回具体原因"}`);
                }
                await Promise.all([loadLogs(undefined, { silent: true }), loadDashboard()]);
                return;
            }

            // 异步任务
            const pendingMessageId = `a-${Date.now()}`;
            startedAsyncTask = true;
            setActiveChatTaskId(response.task_id);
            setActiveChatMessageId(pendingMessageId);
            setChatMessages((current) => [
                ...current,
                {
                    id: pendingMessageId,
                    role: "assistant",
                    content: "助手正在思考...",
                    createdAt: new Date().toISOString(),
                    pending: true,
                    taskId: response.task_id,
                    logId: response.log_id ?? undefined,
                    memorySource: response.memory_source,
                    modelProvider: response.model_provider,
                    modelName: response.model_name,
                },
            ]);
            await loadLogs(undefined, { silent: true });
            startTaskMonitor(response.task_id, {
                onUpdate: (log) => {
                    if (log.status === "cancelling") {
                        updateChatMessage(pendingMessageId, (msg) => ({
                            ...msg, content: "正在停止生成...",
                        }));
                    }
                },
                onFinish: async (log) => {
                    if (!mountedRef.current) return;
                    const usedSkills = resolveLogSkillSnapshots(log, skillMap);
                    const reply = extractChatReplyFromLog(log);
                    updateChatMessage(pendingMessageId, (msg) => ({
                        ...msg,
                        content: reply,
                        pending: false,
                        taskId: null,
                        logId: log.id,
                        memorySource: log.memory_source,
                        modelProvider: log.model_provider,
                        modelName: log.model_name,
                        usedSkillIds: log.related_skill_ids,
                        usedSkills,
                        usedFallback: log.status === "fallback",
                        fallbackError: log.error_message,
                    }));
                    setActiveChatTaskId((c) => (c === response.task_id ? null : c));
                    setActiveChatMessageId((c) => (c === pendingMessageId ? null : c));
                    await Promise.all([loadLogs(undefined, { silent: true }), loadDashboard()]);
                    if (log.status === "fallback") {
                        toast.error(`本次 AI 调用已回退到兜底结果：${log.error_message || "未返回具体原因"}`);
                    } else if (log.status === "failed") {
                        toast.error(`发送失败：${log.error_message || "未知错误"}`);
                    } else if (log.status === "cancelled") {
                        toast.success("已停止助手生成");
                    }
                },
            });
        } catch (error) {
            clearAttachedFiles();
            setChatMessages((current) => [
                ...current,
                {
                    id: `e-${Date.now()}`,
                    role: "assistant",
                    content: `发送失败：${error instanceof Error ? error.message : "未知错误"}`,
                    createdAt: new Date().toISOString(),
                },
            ]);
        } finally {
            if (!startedAsyncTask) {
                setChatSending(false);
            }
        }
    }, [
        activeChatTaskId, activeChatMessageId, cancellingTaskIds,
        chatSending, chatInput, chatContext, attachedFiles,
        updateChatMessage, cancelTaskGeneration, stopTaskMonitor,
        startTaskMonitor, loadLogs, loadDashboard, skillMap,
        setChatContext, clearAttachedFiles,
    ]);

    /* ─── 上下文保存 ─── */
    const saveChatContext = useCallback(async (
        nextPositionId: number | null,
        nextSkillIds: number[],
        nextCandidateId: number | null = null,
        options?: { quiet?: boolean },
    ) => {
        try {
            const response = await recruitmentApi<ChatContext>("/chat/context", {
                method: "POST",
                body: JSON.stringify({
                    position_id: nextPositionId,
                    candidate_id: nextCandidateId,
                    skill_ids: nextSkillIds,
                }),
            });
            setChatContext(response);
            if (!options?.quiet) {
                toast.success("AI 助手上下文已更新");
            }
        } catch (error) {
            if (!options?.quiet) {
                toast.error(`更新助手上下文失败：${error instanceof Error ? error.message : "未知错误"}`);
            }
        }
    }, [setChatContext]);

    /* ─── Skill 切换 ─── */
    const toggleSkillInAssistant = useCallback((skillId: number) => {
        const nextSkillIds = chatContext.skill_ids.includes(skillId)
            ? chatContext.skill_ids.filter((item) => item !== skillId)
            : [...chatContext.skill_ids, skillId];
        void saveChatContext(chatContext.position_id || null, nextSkillIds, chatContext.candidate_id || null);
        queueAssistantInputFocus();
    }, [chatContext, saveChatContext, queueAssistantInputFocus]);

    /* ─── 模式切换 ─── */
    const openAssistantMode = useCallback((mode: AssistantDisplayMode) => {
        if (mode === "page") {
            setAssistantOpen(false);
            setAssistantDisplayMode("page");
            return;
        }
        setAssistantDisplayMode(mode);
        setAssistantOpen(true);
    }, []);

    /* ─── 清空聊天 ─── */
    const clearChatMessages = useCallback(() => {
        setChatMessages([DEFAULT_INTRO_MESSAGE]);
        clearAttachedFiles();
    }, [clearAttachedFiles]);

    /* ─── 预填 ─── */
    const applyAssistantPrompt = useCallback((prompt: string) => {
        setChatInput(prompt);
        queueAssistantInputFocus(true);
    }, [queueAssistantInputFocus]);

    return {
        chatMessages, setChatMessages,
        chatInput, setChatInput,
        chatSending,
        activeChatTaskId, activeChatMessageId,
        cancellingTaskIds, setCancellingTaskIds,
        assistantDisplayMode, setAssistantDisplayMode,
        assistantOpen, setAssistantOpen,
        attachedFiles, addAttachedFiles, removeAttachedFile, clearAttachedFiles,
        assistantScrollAnchorRef, assistantScrollAreaRef, assistantInputRef,
        sendChatMessage, saveChatContext, toggleSkillInAssistant,
        openAssistantMode, clearChatMessages, applyAssistantPrompt,
        focusAssistantInput, queueAssistantInputFocus,
        updateChatMessage,
    };
}
