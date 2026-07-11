import "server-only";

import { z } from "zod";

const KIE_API_BASE_URL = "https://api.kie.ai";
const MAX_RESPONSE_BYTES = 1_000_000;
const bearerPattern = /^Bearer ([A-Za-z0-9._~+/=-]{16,512})$/;

export class ProxyRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function getNoStoreHeaders(): HeadersInit {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    Pragma: "no-cache",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
  };
}

export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: getNoStoreHeaders() });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ProxyRequestError) {
    return jsonResponse(
      { ok: false, error: { code: error.code, message: error.message } },
      error.status,
    );
  }

  if (error instanceof z.ZodError) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "请求参数无效。" },
      },
      400,
    );
  }

  return jsonResponse(
    {
      ok: false,
      error: { code: "UPSTREAM_UNAVAILABLE", message: "Kie 服务暂时不可用。" },
    },
    502,
  );
}

export function authorizeProxyRequest(request: Request): string {
  validateOrigin(request);

  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "application/json") {
    throw new ProxyRequestError(
      "CONTENT_TYPE_INVALID",
      415,
      "请求必须使用 application/json。",
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = bearerPattern.exec(authorization);
  if (!match) {
    throw new ProxyRequestError("KEY_INVALID", 401, "Kie API Key 无效或缺失。");
  }
  return match[1];
}

export async function fetchKieJson(
  path: string,
  apiKey: string,
  init?: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number },
): Promise<unknown> {
  if (!path.startsWith("/api/")) {
    throw new ProxyRequestError("ENDPOINT_BLOCKED", 400, "上游端点无效。");
  }

  const response = await fetch(`${KIE_API_BASE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(init?.timeoutMs ?? 20_000),
  });

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) {
    throw new ProxyRequestError(
      "UPSTREAM_RESPONSE_TOO_LARGE",
      502,
      "Kie 返回的数据超过安全限制。",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ProxyRequestError(
      "UPSTREAM_RESPONSE_INVALID",
      502,
      "Kie 返回了无法识别的数据。",
    );
  }

  if (!response.ok) {
    const status = response.status === 401 ? 401 : response.status === 429 ? 429 : 502;
    const code = response.status === 401 ? "KEY_INVALID" : response.status === 429 ? "UPSTREAM_RATE_LIMITED" : "UPSTREAM_FAILED";
    throw new ProxyRequestError(code, status, safeUpstreamMessage(status));
  }

  return payload;
}

function validateOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const configuredOrigin = process.env.APP_ORIGIN?.trim();
  const vercelOrigin = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined;
  const allowedOrigins = new Set(
    process.env.NODE_ENV === "development"
      ? ["http://localhost:3000", "http://127.0.0.1:3000", configuredOrigin]
      : [configuredOrigin, vercelOrigin],
  );
  allowedOrigins.delete(undefined);

  if (!origin || origin === "null" || !allowedOrigins.has(origin)) {
    throw new ProxyRequestError("ORIGIN_REJECTED", 403, "请求来源不受信任。");
  }
}

function safeUpstreamMessage(status: number): string {
  if (status === 401) return "Kie API Key 无效。";
  if (status === 429) return "Kie 请求过于频繁，请稍后重试。";
  return "Kie 请求失败。";
}
