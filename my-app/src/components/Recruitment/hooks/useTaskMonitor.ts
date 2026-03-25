"use client";

import { useCallback, useEffect, useRef } from "react";

import { recruitmentApi, type AITaskLog } from "@/lib/recruitment-api";

import { isTerminalTaskStatus } from "../utils";

/**
 * useTaskMonitor
 *
 * 封装任务轮询监控逻辑：
 * - 可见性感知：页面不可见时暂停轮询（问题 #3）
 * - 指数退避：初始间隔 1.2s → 最大 5s
 * - 组件卸载自动清理
 */

export interface TaskMonitorCallbacks {
    onUpdate?: (log: AITaskLog) => void;
    onFinish?: (log: AITaskLog) => Promise<void> | void;
}

export function useTaskMonitor(deps: {
    mergeAiTaskLog: (log: AITaskLog) => void;
    setSelectedLogDetail: React.Dispatch<React.SetStateAction<AITaskLog | null>>;
    selectedLogIdRef: React.MutableRefObject<number | null>;
}) {
    const { mergeAiTaskLog, setSelectedLogDetail, selectedLogIdRef } = deps;
    const mountedRef = useRef(true);
    const taskTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
    const visibleRef = useRef(true);

    /* ─── 可见性监听 ─── */
    useEffect(() => {
        mountedRef.current = true;
        const handleVisibility = () => {
            visibleRef.current = document.visibilityState === "visible";
        };
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            mountedRef.current = false;
            document.removeEventListener("visibilitychange", handleVisibility);
            // 清理所有定时器
            taskTimersRef.current.forEach((timerId) => clearTimeout(timerId));
            taskTimersRef.current.clear();
        };
    }, []);

    /* ─── 停止单个任务监控 ─── */
    const stopTaskMonitor = useCallback((taskId: number) => {
        const timerId = taskTimersRef.current.get(taskId);
        if (timerId) {
            clearTimeout(timerId);
            taskTimersRef.current.delete(taskId);
        }
    }, []);

    /* ─── 启动任务监控（指数退避） ─── */
    const startTaskMonitor = useCallback((
        taskId: number,
        { onUpdate, onFinish }: TaskMonitorCallbacks,
    ) => {
        stopTaskMonitor(taskId);
        let polling = false;
        let currentInterval = 1200; // 初始 1.2s
        const maxInterval = 5000;   // 最大 5s
        const backoffFactor = 1.3;

        const poll = async () => {
            if (polling || !mountedRef.current) return;
            // 页面不可见时跳过本次，但保持定时器
            if (!visibleRef.current) {
                schedulePoll();
                return;
            }
            polling = true;
            try {
                const log = await recruitmentApi<AITaskLog>(`/ai-task-logs/${taskId}`);
                if (!mountedRef.current) return;
                mergeAiTaskLog(log);
                if (selectedLogIdRef.current === taskId) {
                    setSelectedLogDetail(log);
                }
                onUpdate?.(log);
                if (isTerminalTaskStatus(log.status)) {
                    stopTaskMonitor(taskId);
                    await onFinish?.(log);
                    return;
                }
            } catch {
                // Ignore transient polling errors and retry
            } finally {
                polling = false;
            }
            // 指数退避
            currentInterval = Math.min(maxInterval, currentInterval * backoffFactor);
            schedulePoll();
        };

        const schedulePoll = () => {
            if (!mountedRef.current) return;
            const timerId = setTimeout(() => {
                void poll();
            }, currentInterval);
            taskTimersRef.current.set(taskId, timerId);
        };

        // 首次立即执行
        void poll();
    }, [stopTaskMonitor, mergeAiTaskLog, setSelectedLogDetail, selectedLogIdRef]);

    /* ─── 取消任务 ─── */
    const cancelTaskGeneration = useCallback(async (
        taskId: number,
        taskLabel: string,
        cancellingTaskIds: number[],
        setCancellingTaskIds: React.Dispatch<React.SetStateAction<number[]>>,
        options?: { silent?: boolean },
    ) => {
        if (cancellingTaskIds.includes(taskId)) return null;
        setCancellingTaskIds((current) => (current.includes(taskId) ? current : [...current, taskId]));
        try {
            const log = await recruitmentApi<AITaskLog>(`/ai-task-logs/${taskId}/cancel`, {
                method: "POST",
            });
            mergeAiTaskLog(log);
            if (selectedLogIdRef.current === taskId) {
                setSelectedLogDetail(log);
            }
            if (!options?.silent) {
                const statusText = log.status === "cancelled" ? `${taskLabel}已停止` : `${taskLabel}停止请求已发送`;
                // 使用 toast 替代内联 import
                const { toast } = await import("sonner");
                toast.success(statusText);
            }
            return log;
        } catch (error) {
            setCancellingTaskIds((current) => current.filter((item) => item !== taskId));
            throw error;
        }
    }, [mergeAiTaskLog, setSelectedLogDetail, selectedLogIdRef]);

    return {
        startTaskMonitor,
        stopTaskMonitor,
        cancelTaskGeneration,
    };
}
