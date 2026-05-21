import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getBackendBaseUrl } from "@/lib/server/backendBaseUrl";
import { requireScriptHubAnyPermission } from "@/lib/server/scriptHubSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readVersionFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const version = (payload as Record<string, unknown>).version;
  return typeof version === "string" && version.trim() ? version.trim() : null;
}

async function getFrontendBuildVersion(): Promise<string> {
  try {
    const raw = await readFile(join(process.cwd(), "public", "build-info.json"), "utf8");
    const version = readVersionFromPayload(JSON.parse(raw));
    if (version) {
      return version;
    }
  } catch {
    // Fall back to the deployment environment when the public file is unavailable.
  }
  return (process.env.NEXT_PUBLIC_BUILD_VERSION || process.env.BUILD_VERSION || "dev").trim() || "dev";
}

function isHelloEvent(rawEvent: string): boolean {
  const dataLine = rawEvent
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .find((line) => line.startsWith("data: "));
  if (!dataLine) {
    return false;
  }
  try {
    const payload = JSON.parse(dataLine.slice(6)) as unknown;
    return Boolean(payload && typeof payload === "object" && (payload as Record<string, unknown>).type === "hello");
  } catch {
    return false;
  }
}

function createVersionedSSEStream(source: ReadableStream<Uint8Array>, version: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "hello", version })}\n\n`));
      reader = source.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          let separatorIndex = buffer.indexOf("\n\n");
          while (separatorIndex !== -1) {
            const rawEvent = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);
            if (!isHelloEvent(rawEvent)) {
              controller.enqueue(encoder.encode(`${rawEvent}\n\n`));
            }
            separatorIndex = buffer.indexOf("\n\n");
          }
        }

        const tail = decoder.decode();
        if (tail) {
          buffer += tail;
        }
        if (buffer && !isHelloEvent(buffer)) {
          controller.enqueue(encoder.encode(buffer));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
        reader = null;
      }
    },
    cancel(reason) {
      void reader?.cancel(reason);
    },
  });
}

export async function GET(request: NextRequest) {
  // 权限检查
  const auth = requireScriptHubAnyPermission(request, ["recruitment-process-execute", "recruitment-log-view"]);
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

  if (!backendResponse.body) {
    return new Response("Backend SSE unavailable", { status: 502 });
  }

  const version = await getFrontendBuildVersion();
  const stream = createVersionedSSEStream(backendResponse.body, version);

  return new Response(stream, {
    status: backendResponse.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
