import { useEffect, useRef } from "react";

import { authenticatedFetch } from "@/lib/auth";

export type TaskSSEEvent = {
  type: "task_progress" | "task_completed" | "candidate_updated" | "batch_summary" | "reconnect";
  task_id?: number;
  status?: string;
  related_candidate_id?: number;
  candidate_id?: number;
  task_type?: string;
  auto_requeue_scheduled?: boolean;
  // AI 岗位匹配增量推送
  ai_match_reason?: string | null;
  ai_match_position_id?: number | null;
  ai_match_position_title?: string | null;
  ai_potential_position?: string | null;
  ai_potential_reason?: string | null;
  batch_id?: string;
};

export type TaskSSEHandlers = {
  onTaskProgress?: (event: TaskSSEEvent) => void;
  onTaskCompleted?: (event: TaskSSEEvent) => void;
  onCandidateUpdated?: (event: TaskSSEEvent) => void;
  onBatchSummary?: (event: TaskSSEEvent) => void;
  onReconnect?: () => void;
};

export function useTaskSSE(
  enabled: boolean,
  handlers: TaskSSEHandlers,
  baseUrl: string = "/api/recruitment",
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    let abortController: AbortController | null = null;
    let reconnectTimer: number | null = null;
    let reconnectDelay = 2000;
    let destroyed = false;
    let isFirstConnection = true;

    async function connect() {
      if (destroyed) return;
      abortController = new AbortController();
      const wasFirstConnection = isFirstConnection;
      try {
        const response = await authenticatedFetch(`${baseUrl}/task-events`, {
          headers: { Accept: "text/event-stream" },
          signal: abortController.signal,
        });
        if (!response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        reconnectDelay = 2000;
        isFirstConnection = false;
        while (!destroyed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep = buffer.indexOf("\n\n");
          while (sep !== -1) {
            const rawEvent = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            sep = buffer.indexOf("\n\n");
            const dataLine = rawEvent.split("\n").find((l) => l.startsWith("data: "));
            if (dataLine) {
              try {
                const data: TaskSSEEvent = JSON.parse(dataLine.slice(6));
                const h = handlersRef.current;
                if (data.type === "task_progress") h.onTaskProgress?.(data);
                else if (data.type === "task_completed") h.onTaskCompleted?.(data);
                else if (data.type === "candidate_updated") h.onCandidateUpdated?.(data);
                else if (data.type === "batch_summary") h.onBatchSummary?.(data);
              } catch {
                // ignore malformed events
              }
            }
          }
        }
      } catch {
        // ignore fetch errors (network, abort, etc.)
      }
      if (!destroyed) {
        if (!wasFirstConnection) {
          handlersRef.current.onReconnect?.();
        }
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 30_000);
      }
    }

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      abortController?.abort();
    };
  }, [enabled, baseUrl]);
}
