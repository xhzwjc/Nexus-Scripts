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
    path === "candidates/upload-resumes",
  ].some(Boolean);

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(isLongRunningRequest ? 900000 : 180000),
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = Buffer.from(await request.arrayBuffer());
  }

  try {
    const response = await fetch(targetUrl, init);
    const raw = await response.arrayBuffer();
    const responseHeaders = new Headers();
    for (const headerName of [
      "content-type",
      "content-disposition",
      "cache-control",
      "content-length",
    ]) {
      const value = response.headers.get(headerName);
      if (value) {
        responseHeaders.set(headerName, value);
      }
    }
    if (!responseHeaders.has("content-type")) {
      responseHeaders.set("content-type", "application/json; charset=utf-8");
    }
    return new NextResponse(raw, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Recruitment backend unavailable",
      },
      { status: 503 },
    );
  }
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
