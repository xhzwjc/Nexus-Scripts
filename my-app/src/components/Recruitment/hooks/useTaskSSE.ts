import { useEffect, useRef } from "react";

export type TaskSSEEvent = {
  type: "task_progress" | "task_completed" | "candidate_updated" | "batch_summary";
  task_id?: number;
  status?: string;
  related_candidate_id?: number;
  candidate_id?: number;
  task_type?: string;
};

export type TaskSSEHandlers = {
  onTaskProgress?: (event: TaskSSEEvent) => void;
  onTaskCompleted?: (event: TaskSSEEvent) => void;
  onCandidateUpdated?: (event: TaskSSEEvent) => void;
  onBatchSummary?: (event: TaskSSEEvent) => void;
};

export function useTaskSSE(
  enabled: boolean,
  handlers: TaskSSEHandlers,
  baseUrl: string = "/recruitment",
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    let es: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let reconnectDelay = 2000;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      es = new EventSource(`${baseUrl}/task-events`, { withCredentials: true });

      es.onmessage = (event) => {
        reconnectDelay = 2000;
        try {
          const data: TaskSSEEvent = JSON.parse(event.data);
          const h = handlersRef.current;
          if (data.type === "task_progress") h.onTaskProgress?.(data);
          else if (data.type === "task_completed") h.onTaskCompleted?.(data);
          else if (data.type === "candidate_updated") h.onCandidateUpdated?.(data);
          else if (data.type === "batch_summary") h.onBatchSummary?.(data);
        } catch {
          // ignore malformed events
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!destroyed) {
          reconnectTimer = window.setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 1.5, 30_000);
        }
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [enabled, baseUrl]);
}
