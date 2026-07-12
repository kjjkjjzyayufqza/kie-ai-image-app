import { z } from "zod";

import { t } from "@/lib/server/request-messages";

const KIE_API_BASE_URL = "https://api.kie.ai";
const MAX_REQUEST_BYTES = 256_000;
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
        error: { code: "VALIDATION_FAILED", message: t("errors.validationFailed") },
      },
      400,
    );
  }

  return jsonResponse(
    {
      ok: false,
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: t("errors.upstreamUnavailable"),
      },
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
      t("errors.contentTypeJson"),
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = bearerPattern.exec(authorization);
  if (!match) {
    throw new ProxyRequestError(
      "KEY_INVALID",
      401,
      t("errors.keyInvalidOrMissing"),
    );
  }
  return match[1]!;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new ProxyRequestError(
        "CONTENT_LENGTH_INVALID",
        400,
        t("errors.contentLengthInvalid"),
      );
    }
    if (parsedLength > MAX_REQUEST_BYTES) throw requestTooLargeError();
  }

  if (!request.body) {
    throw new ProxyRequestError("JSON_INVALID", 400, t("errors.jsonInvalid"));
  }

  const bytes = await readLimitedBody(request.body, MAX_REQUEST_BYTES, () =>
    requestTooLargeError(),
  );
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ProxyRequestError("JSON_INVALID", 400, t("errors.jsonInvalid"));
  }
}

export async function fetchKieJson(
  path: string,
  apiKey: string,
  init?: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number },
): Promise<unknown> {
  if (!path.startsWith("/api/")) {
    throw new ProxyRequestError(
      "ENDPOINT_BLOCKED",
      400,
      t("errors.endpointBlocked"),
    );
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

  const bytes = response.body
    ? await readLimitedBody(response.body, MAX_RESPONSE_BYTES, () =>
        new ProxyRequestError(
          "UPSTREAM_RESPONSE_TOO_LARGE",
          502,
          t("errors.responseTooLarge"),
        ),
      )
    : new Uint8Array();

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ProxyRequestError(
      "UPSTREAM_RESPONSE_INVALID",
      502,
      t("errors.responseUnrecognized"),
    );
  }

  if (!response.ok) {
    const status =
      response.status === 401 ? 401 : response.status === 429 ? 429 : 502;
    const code =
      response.status === 401
        ? "KEY_INVALID"
        : response.status === 429
          ? "UPSTREAM_RATE_LIMITED"
          : "UPSTREAM_FAILED";
    throw new ProxyRequestError(code, status, safeUpstreamMessage(status));
  }

  return payload;
}

function validateOrigin(request: Request): void {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    throw new ProxyRequestError(
      "ORIGIN_REJECTED",
      403,
      t("errors.originRejected"),
    );
  }

  const origin = request.headers.get("origin");
  const configuredOrigin = process.env.APP_ORIGIN?.trim();
  const vercelOrigin = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined;
  const allowedOrigins = new Set(
    process.env.NODE_ENV === "development"
      ? [
          "http://localhost:3000",
          "http://127.0.0.1:3000",
          "http://localhost:3100",
          "http://127.0.0.1:3100",
          configuredOrigin,
        ]
      : [configuredOrigin, vercelOrigin],
  );
  allowedOrigins.delete(undefined);

  if (!origin || origin === "null" || !allowedOrigins.has(origin)) {
    throw new ProxyRequestError(
      "ORIGIN_REJECTED",
      403,
      t("errors.originRejected"),
    );
  }
}

async function readLimitedBody(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  createError: () => ProxyRequestError,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw createError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function requestTooLargeError(): ProxyRequestError {
  return new ProxyRequestError(
    "REQUEST_TOO_LARGE",
    413,
    t("errors.requestTooLarge"),
  );
}

function safeUpstreamMessage(status: number): string {
  if (status === 401) return t("errors.keyInvalid");
  if (status === 429) return t("errors.rateLimited");
  return t("errors.kieRequestFailed");
}
