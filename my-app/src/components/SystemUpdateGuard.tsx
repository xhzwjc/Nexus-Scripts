"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { VersionUpdateModal } from "@/components/VersionUpdateModal";
import {
  LOADED_SYSTEM_BUILD_INFO,
  parseSystemBuildInfo,
  type SystemBuildInfo,
} from "@/lib/system-version";

const CHECK_INTERVAL_MS = 60_000;
const CHECK_THROTTLE_MS = 10_000;
const DEFERRED_BUILD_KEY = "nexus.system-update.deferred-build";
const UPDATE_CHANNEL_NAME = "nexus.system-update";

type UpdateMode = "hidden" | "dialog" | "reminder";

function readDeferredBuild(): string {
  try {
    return window.localStorage.getItem(DEFERRED_BUILD_KEY) || "";
  } catch {
    return "";
  }
}

function writeDeferredBuild(buildId: string) {
  try {
    window.localStorage.setItem(DEFERRED_BUILD_KEY, buildId);
  } catch {
    // The reminder still works in the current tab when storage is unavailable.
  }
}

function clearDeferredBuild() {
  try {
    window.localStorage.removeItem(DEFERRED_BUILD_KEY);
  } catch {
    // Storage is optional for cross-tab coordination.
  }
}

export function SystemUpdateGuard() {
  const [latestBuild, setLatestBuild] = useState<SystemBuildInfo | null>(null);
  const [mode, setMode] = useState<UpdateMode>("hidden");
  const [refreshing, setRefreshing] = useState(false);
  const checkingRef = useRef(false);
  const lastCheckedAtRef = useRef(0);
  const latestBuildIdRef = useRef("");
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const applyLatestBuild = useCallback((nextBuild: SystemBuildInfo, broadcast: boolean) => {
    if (nextBuild.buildId === LOADED_SYSTEM_BUILD_INFO.buildId) {
      return;
    }

    const isNewDetection = latestBuildIdRef.current !== nextBuild.buildId;
    latestBuildIdRef.current = nextBuild.buildId;
    setLatestBuild(nextBuild);

    if (isNewDetection) {
      const deferredBuild = readDeferredBuild();
      setMode(deferredBuild === nextBuild.buildId ? "reminder" : "dialog");
    }

    if (broadcast && isNewDetection) {
      broadcastChannelRef.current?.postMessage({ type: "outdated", build: nextBuild });
    }
  }, []);

  const checkForUpdate = useCallback(async (force = false) => {
    if (
      process.env.NODE_ENV !== "production"
      || LOADED_SYSTEM_BUILD_INFO.buildId === "dev"
      || LOADED_SYSTEM_BUILD_INFO.buildId === "build-unknown"
    ) {
      return;
    }
    if (!force && document.visibilityState !== "visible") {
      return;
    }

    const now = Date.now();
    if (
      checkingRef.current
      || (!force && now - lastCheckedAtRef.current < CHECK_THROTTLE_MS)
    ) {
      return;
    }

    checkingRef.current = true;
    lastCheckedAtRef.current = now;
    try {
      const response = await fetch("/api/system/version", {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "If-None-Match": `"${LOADED_SYSTEM_BUILD_INFO.buildId}"`,
        },
      });
      if (response.status === 304) {
        return;
      }
      if (!response.ok) {
        return;
      }

      const nextBuild = parseSystemBuildInfo(await response.json());
      if (nextBuild) {
        applyLatestBuild(nextBuild, true);
      }
    } catch {
      // A failed version check must never interrupt the user's current work.
    } finally {
      checkingRef.current = false;
    }
  }, [applyLatestBuild]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      return;
    }

    const channel = new BroadcastChannel(UPDATE_CHANNEL_NAME);
    broadcastChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (!event.data || typeof event.data !== "object") {
        return;
      }
      const message = event.data as Record<string, unknown>;
      if (message.type === "deferred" && message.buildId === latestBuildIdRef.current) {
        setMode("reminder");
        return;
      }
      if (message.type !== "outdated") {
        return;
      }
      const nextBuild = parseSystemBuildInfo(message.build);
      if (nextBuild) {
        applyLatestBuild(nextBuild, false);
      }
    };

    return () => {
      channel.close();
      if (broadcastChannelRef.current === channel) {
        broadcastChannelRef.current = null;
      }
    };
  }, [applyLatestBuild]);

  useEffect(() => {
    if (readDeferredBuild() === LOADED_SYSTEM_BUILD_INFO.buildId) {
      clearDeferredBuild();
    }

    void checkForUpdate(true);
    const intervalId = window.setInterval(() => {
      void checkForUpdate();
    }, CHECK_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkForUpdate();
      }
    };
    const handleWindowActive = () => {
      void checkForUpdate();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowActive);
    window.addEventListener("online", handleWindowActive);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowActive);
      window.removeEventListener("online", handleWindowActive);
    };
  }, [checkForUpdate]);

  if (!latestBuild) {
    return null;
  }

  const refresh = () => {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    clearDeferredBuild();
    window.setTimeout(() => window.location.reload(), 160);
  };

  const defer = () => {
    if (refreshing) {
      return;
    }
    writeDeferredBuild(latestBuild.buildId);
    broadcastChannelRef.current?.postMessage({ type: "deferred", buildId: latestBuild.buildId });
    setMode("reminder");
  };

  return (
    <VersionUpdateModal
      open={mode === "dialog"}
      reminderVisible={mode === "reminder"}
      refreshing={refreshing}
      currentBuild={LOADED_SYSTEM_BUILD_INFO}
      latestBuild={latestBuild}
      onRefresh={refresh}
      onLater={defer}
    />
  );
}
