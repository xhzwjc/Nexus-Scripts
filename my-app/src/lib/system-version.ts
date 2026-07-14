export type SystemBuildInfo = {
  schemaVersion: number;
  version: string;
  buildId: string;
  buildNumber: string;
  commitSha: string;
  builtAt: string;
};

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function parseSystemBuildInfo(payload: unknown): SystemBuildInfo | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as Record<string, unknown>;
  const buildId = readString(data.buildId);
  const version = readString(data.version);
  if (!buildId || !version) {
    return null;
  }

  return {
    schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    version,
    buildId,
    buildNumber: readString(data.buildNumber, "unknown"),
    commitSha: readString(data.commitSha),
    builtAt: readString(data.builtAt),
  };
}

export const LOADED_SYSTEM_BUILD_INFO: SystemBuildInfo = {
  schemaVersion: 1,
  version: process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0",
  buildId: process.env.NEXT_PUBLIC_BUILD_ID || "dev",
  buildNumber: process.env.NEXT_PUBLIC_BUILD_NUMBER || "dev",
  commitSha: process.env.NEXT_PUBLIC_BUILD_COMMIT || "",
  builtAt: process.env.NEXT_PUBLIC_BUILD_TIME || "",
};

function compactBuildLabel(buildNumber: string): string {
  if (/^\d{14}$/.test(buildNumber)) {
    return `${buildNumber.slice(4, 8)}.${buildNumber.slice(8, 12)}`;
  }
  if (/^\d+$/.test(buildNumber)) {
    return `#${buildNumber}`;
  }
  const normalized = buildNumber.replace(/[^0-9A-Za-z._-]/g, "");
  return normalized.length > 10 ? normalized.slice(-10) : normalized;
}

export function formatSystemVersionPair(
  current: SystemBuildInfo,
  latest: SystemBuildInfo,
): { current: string; latest: string } {
  if (current.version !== latest.version) {
    return {
      current: `v${current.version}`,
      latest: `v${latest.version}`,
    };
  }

  return {
    current: `v${current.version} · ${compactBuildLabel(current.buildNumber)}`,
    latest: `v${latest.version} · ${compactBuildLabel(latest.buildNumber)}`,
  };
}
