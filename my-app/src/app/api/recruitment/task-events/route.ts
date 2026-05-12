import { NextRequest } from "next/server";

import { getBackendBaseUrl } from "@/lib/server/backendBaseUrl";
import { requireScriptHubPermission } from "@/lib/server/scriptHubSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // 权限检查
  const auth = requireScriptHubPermission(request, "recruitment-log-view");
  if ("response" in auth) {
    return auth.response;
  }

  const backendBaseUrl = getBackendBaseUrl();
  const backendUrl = `${backendBaseUrl}/recruitment/task-events`;

  // 获取原始请求的 headers
  const authorization = request.headers.get("authorization");

  // 直接透传 SSE 流，不做任何处理
  const backendResponse = await fetch(backendUrl, {
    headers: {
      Authorization: authorization || "",
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
    // 不设置 signal，让 SSE 保持长连接
    // 客户端断开时会自动终止
  });

  if (!backendResponse.ok) {
    return new Response("Backend SSE unavailable", { status: 502 });
  }

  // 透明的流式代理：直接返回后端的响应体
  return new Response(backendResponse.body, {
    status: backendResponse.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
