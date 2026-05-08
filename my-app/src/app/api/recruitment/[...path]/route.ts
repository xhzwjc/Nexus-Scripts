import { NextRequest, NextResponse } from "next/server";

import { getBackendBaseUrl } from "@/lib/server/backendBaseUrl";
import { requireScriptHubPermission } from "@/lib/server/scriptHubSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resolveRecruitmentPermission(path: string, method: string) {
  const normalizedMethod = method.toUpperCase();

  if (path === "llm-configs" || path.startsWith("llm-configs/")) {
    return normalizedMethod === "GET" || normalizedMethod === "HEAD"
      ? "recruitment-llm-config-view"
      : "recruitment-llm-config-manage";
  }

  if (path === "ai-task-logs" || path.startsWith("ai-task-logs/")) {
    return "recruitment-log-view";
  }

  if (path === "resume-mail-dispatches/send") {
    return "recruitment-mail-send";
  }

  if (path === "resource-governance" || path.startsWith("resource-governance/")) {
    return "resource-sharing-manage";
  }

  if (path === "mail-senders" || path.startsWith("mail-senders/")) {
    return normalizedMethod === "GET" || normalizedMethod === "HEAD"
      ? "recruitment-mail-view"
      : "recruitment-mail-sender-manage";
  }

  if (
    path === "mail-recipients"
    || path.startsWith("mail-recipients/")
    || path === "mail-auto-config"
  ) {
    return normalizedMethod === "GET" || normalizedMethod === "HEAD"
      ? "recruitment-mail-view"
      : "recruitment-mail-config-manage";
  }

  if (path === "skills" || path.startsWith("skills/")) {
    return normalizedMethod === "GET" || normalizedMethod === "HEAD"
      ? "recruitment-skill-view"
      : "recruitment-skill-manage";
  }

  if (normalizedMethod !== "GET" && normalizedMethod !== "HEAD") {
    if (path.startsWith("positions")) {
      return "recruitment-position-manage";
    }
    if (path.startsWith("candidates")) {
      return "recruitment-candidate-manage";
    }
  }

  return "recruitment-dashboard-view";
}

async function proxyRecruitmentRequest(
  request: NextRequest,
  params: { path: string[] },
) {
  const path = params.path.join("/");
  const auth = requireScriptHubPermission(request, resolveRecruitmentPermission(path, request.method));
  if ("response" in auth) {
    return auth.response;
  }

  const backendBaseUrl = getBackendBaseUrl();
  const requestUrl = new URL(request.url);
  const targetUrl = `${backendBaseUrl}/recruitment/${path}${requestUrl.search}`;

  const headers = new Headers();
  const authorization = request.headers.get("authorization");
  const accept = request.headers.get("accept");
  const contentType = request.headers.get("content-type");

  if (authorization) {
    headers.set("Authorization", authorization);
  }
  if (accept) {
    headers.set("Accept", accept);
  }
  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  const isLongRunningRequest = [
    path === "chat",
    path.endsWith("/screen"),
    path.endsWith("/interview-questions"),
    path.endsWith("/generate-jd"),
    path.endsWith("/generate-content"),
    path.endsWith("/generate-jd/stream"),
    path === "candidates/upload-resumes",
  ].some(Boolean);

  const isSSEStream = path === "task-events";

  // 当客户端断开连接时（如热更新），也取消对后端的请求，避免后端连接被挂起
  const clientSignal = request.signal;
  const timeoutSignal = isSSEStream ? undefined : AbortSignal.timeout(isLongRunningRequest ? 900000 : 180000);
  const proxySignal = clientSignal && timeoutSignal
    ? (typeof AbortSignal.any === "function"
        ? AbortSignal.any([clientSignal, timeoutSignal])
        : timeoutSignal)
    : clientSignal || timeoutSignal;

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
    signal: proxySignal,
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = Buffer.from(await request.arrayBuffer());
  }

  const isSafeToRetry = ["GET", "HEAD"].includes(request.method);
  const maxRetries = isSafeToRetry ? 3 : 0;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
    }
    try {
      const response = await fetch(targetUrl, init);
      const isSSE = (response.headers.get("content-type") || "").includes("text/event-stream");
      const responseHeaders = new Headers();
      for (const headerName of [
        "content-type",
        "content-disposition",
        "cache-control",
        "content-length",
        "x-accel-buffering",
      ]) {
        const value = response.headers.get(headerName);
        if (value) {
          responseHeaders.set(headerName, value);
        }
      }
      if (!responseHeaders.has("content-type")) {
        responseHeaders.set("content-type", "application/json; charset=utf-8");
      }
      if (isSSE && response.body) {
        return new NextResponse(response.body, {
          status: response.status,
          headers: responseHeaders,
        });
      }
      const raw = await response.arrayBuffer();
      return new NextResponse(raw, {
        status: response.status,
        headers: responseHeaders,
      });
    } catch (error) {
      lastError = error;
      // Only retry on network-level failures (connection refused, etc.)
      // Do NOT retry if we got an HTTP response with error status
      if (!isSafeToRetry) break;
    }
  }

  return NextResponse.json(
    {
      error: lastError instanceof Error ? lastError.message : "Recruitment backend unavailable",
    },
    { status: 503 },
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const params = await context.params;
  return proxyRecruitmentRequest(request, params);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const params = await context.params;
  return proxyRecruitmentRequest(request, params);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const params = await context.params;
  return proxyRecruitmentRequest(request, params);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const params = await context.params;
  return proxyRecruitmentRequest(request, params);
}
