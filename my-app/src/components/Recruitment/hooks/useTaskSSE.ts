import { useEffect, useRef } from "react";

import { authenticatedFetch } from "@/lib/auth";
import type { CandidateSummary } from "@/lib/recruitment-api";

type ListenerEntry = {
  getHandlers: () => TaskSSEHandlers;
};

type SharedSSEConnection = {
  listeners: Map<symbol, ListenerEntry>;
  abortController: AbortController | null;
  reconnectTimer: number | null;
  closeTimer: number | null;
  reconnectDelay: number;
  isConnecting: boolean;
  hasConnectedOnce: boolean;
};

const sharedSSEConnections = new Map<string, SharedSSEConnection>();
const SSE_CLOSE_GRACE_MS = 250;
let clientBuildVersionPromise: Promise<string | null> | null = null;

function readBuildVersion(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const version = (payload as Record<string, unknown>).version;
  return typeof version === "string" && version.trim() ? version.trim() : null;
}

function getClientBuildVersion(): Promise<string | null> {
  if (!clientBuildVersionPromise) {
    clientBuildVersionPromise = fetch("/build-info.json", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        return readBuildVersion(await response.json());
      })
      .catch(() => null);
  }
  return clientBuildVersionPromise;
}

function getSharedConnection(baseUrl: string): SharedSSEConnection {
  let connection = sharedSSEConnections.get(baseUrl);
  if (!connection) {
    connection = {
      listeners: new Map(),
      abortController: null,
      reconnectTimer: null,
      closeTimer: null,
      reconnectDelay: 2000,
      isConnecting: false,
      hasConnectedOnce: false,
    };
    sharedSSEConnections.set(baseUrl, connection);
  }
  return connection;
}

function dispatchSharedEvent(
  connection: SharedSSEConnection,
  dispatcher: (handlers: TaskSSEHandlers) => void,
) {
  connection.listeners.forEach(({ getHandlers }) => {
    dispatcher(getHandlers());
  });
}

async function ensureSharedConnection(baseUrl: string, connection: SharedSSEConnection) {
  if (connection.isConnecting || connection.abortController || connection.listeners.size === 0) {
    return;
  }

  connection.isConnecting = true;
  const abortController = new AbortController();
  connection.abortController = abortController;
  const wasReconnected = connection.hasConnectedOnce;
  const clientVersionPromise = getClientBuildVersion();

  try {
    const response = await authenticatedFetch(`${baseUrl}/task-events`, {
      headers: { Accept: "text/event-stream" },
      signal: abortController.signal,
    });
    if (!response.body) {
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    connection.reconnectDelay = 2000;
    connection.hasConnectedOnce = true;

    if (wasReconnected) {
      dispatchSharedEvent(connection, (handlers) => handlers.onReconnect?.());
    }

    while (connection.listeners.size > 0) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.indexOf("\n\n");
      while (sep !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        sep = buffer.indexOf("\n\n");
        const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data: "));
        if (!dataLine) {
          continue;
        }
        try {
          const data: TaskSSEEvent = JSON.parse(dataLine.slice(6));
          if (data.type === "hello") {
            const serverVersion = typeof data.version === "string" ? data.version.trim() : "";
            if (serverVersion) {
              void clientVersionPromise.then((clientVersion) => {
                if (clientVersion && clientVersion !== serverVersion) {
                  dispatchSharedEvent(connection, (handlers) => handlers.onVersionMismatch?.());
                }
              });
            }
            continue;
          }
          dispatchSharedEvent(connection, (handlers) => {
            if (data.type === "task_progress") handlers.onTaskProgress?.(data);
            else if (data.type === "task_completed") handlers.onTaskCompleted?.(data);
            else if (data.type === "candidate_updated") handlers.onCandidateUpdated?.(data);
            else if (data.type === "batch_summary") handlers.onBatchSummary?.(data);
          });
        } catch {
          // ignore malformed events
        }
      }
    }
  } catch {
    // ignore fetch errors (network, abort, etc.)
  } finally {
    connection.isConnecting = false;
    connection.abortController = null;
    if (connection.listeners.size === 0) {
      if (connection.reconnectTimer) {
        window.clearTimeout(connection.reconnectTimer);
        connection.reconnectTimer = null;
      }
      return;
    }
    connection.reconnectTimer = window.setTimeout(() => {
      connection.reconnectTimer = null;
      void ensureSharedConnection(baseUrl, connection);
    }, connection.reconnectDelay);
    connection.reconnectDelay = Math.min(connection.reconnectDelay * 1.5, 30_000);
  }
}

export type TaskSSEEvent = {
  type: "hello" | "task_progress" | "task_completed" | "candidate_updated" | "batch_summary" | "reconnect";
  version?: string;
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
  screening_enqueue_failed?: boolean;
  error_message?: string | null;
  batch_id?: string;
  candidate_snapshot?: Partial<CandidateSummary> | null;
};

export type TaskSSEHandlers = {
  onTaskProgress?: (event: TaskSSEEvent) => void;
  onTaskCompleted?: (event: TaskSSEEvent) => void;
  onCandidateUpdated?: (event: TaskSSEEvent) => void;
  onBatchSummary?: (event: TaskSSEEvent) => void;
  onReconnect?: () => void;
  onVersionMismatch?: () => void;
};

export function useTaskSSE(
  enabled: boolean,
  handlers: TaskSSEHandlers,
  baseUrl: string = "/api/recruitment",
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const listenerIdRef = useRef<symbol | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const connection = getSharedConnection(baseUrl);
    const listenerId = Symbol("task-sse-listener");
    listenerIdRef.current = listenerId;

    if (connection.closeTimer) {
      window.clearTimeout(connection.closeTimer);
      connection.closeTimer = null;
    }
    if (connection.reconnectTimer) {
      window.clearTimeout(connection.reconnectTimer);
      connection.reconnectTimer = null;
    }

    connection.listeners.set(listenerId, {
      getHandlers: () => handlersRef.current,
    });
    void ensureSharedConnection(baseUrl, connection);

    return () => {
      const sharedConnection = getSharedConnection(baseUrl);
      if (listenerIdRef.current) {
        sharedConnection.listeners.delete(listenerIdRef.current);
      }
      listenerIdRef.current = null;
      if (sharedConnection.listeners.size > 0) {
        return;
      }
      sharedConnection.closeTimer = window.setTimeout(() => {
        if (sharedConnection.listeners.size > 0) {
          return;
        }
        if (sharedConnection.reconnectTimer) {
          window.clearTimeout(sharedConnection.reconnectTimer);
          sharedConnection.reconnectTimer = null;
        }
        sharedConnection.abortController?.abort();
        sharedConnection.abortController = null;
        sharedConnection.isConnecting = false;
        sharedConnection.closeTimer = null;
        sharedSSEConnections.delete(baseUrl);
      }, SSE_CLOSE_GRACE_MS);
    };
  }, [enabled, baseUrl]);
}
