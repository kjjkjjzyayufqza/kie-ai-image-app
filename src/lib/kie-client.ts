import { z } from "zod";

import type { GenerationRequest, KieTaskResult, ReferenceUpload } from "@/lib/domain";
import { isRenderableKieUrl } from "@/lib/kie-urls";

const uploadResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    downloadUrl: z.string().url().optional(),
    fileUrl: z.string().url().optional(),
    fileSize: z.number().nonnegative(),
    mimeType: z.string(),
    expiresAt: z.string().datetime().optional(),
  }),
});

const taskCreateSchema = z.object({
  ok: z.literal(true),
  data: z.object({ taskId: z.string() }),
});

const taskStatusSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    remoteTaskId: z.string(),
    state: z.enum(["waiting", "queuing", "generating", "success", "fail"]),
    resultUrls: z.array(
      z.object({ url: z.string().url(), isRenderable: z.boolean() }),
    ),
    failCode: z.string().optional(),
    failMessage: z.string().optional(),
    creditsConsumed: z.number().optional(),
    completedAt: z.number().optional(),
  }),
});

const creditsSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    credits: z.number(),
    latencyMs: z.number(),
    checkedAt: z.number(),
  }),
});

const downloadSchema = z.object({
  ok: z.literal(true),
  data: z.object({ url: z.string().url() }),
});

export class KieClientError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export async function createKieTask(
  apiKey: string,
  input: GenerationRequest,
): Promise<string> {
  const response = await postKie("/api/kie/tasks", apiKey, input, 35_000);
  return taskCreateSchema.parse(response).data.taskId;
}

export async function queryKieTask(
  apiKey: string,
  taskId: string,
): Promise<KieTaskResult> {
  const response = await postKie(
    "/api/kie/task-status",
    apiKey,
    { taskId },
    25_000,
  );
  return taskStatusSchema.parse(response).data;
}

export async function fetchKieCredits(apiKey: string) {
  const response = await postKie("/api/kie/credits", apiKey, {}, 25_000);
  return creditsSchema.parse(response).data;
}

export async function fetchKieDownloadUrl(
  apiKey: string,
  url: string,
): Promise<string> {
  const response = await postKie(
    "/api/kie/download-url",
    apiKey,
    { url },
    25_000,
  );
  return downloadSchema.parse(response).data.url;
}

export async function uploadReferenceImage(
  apiKey: string,
  keyFingerprint: string,
  file: File,
): Promise<ReferenceUpload> {
  const detectedMime = await validateImageFile(file);
  const extension = mimeExtension(detectedMime);
  const randomRemoteName = `${crypto.randomUUID()}.${extension}`;
  const formData = new FormData();
  formData.append("file", file, randomRemoteName);
  formData.append("uploadPath", `images/kie-workspace/${crypto.randomUUID()}`);
  formData.append("fileName", randomRemoteName);

  let response: Response;
  try {
    response = await fetch(
      "https://kieai.redpandaai.co/api/file-stream-upload",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(120_000),
      },
    );
  } catch {
    throw new KieClientError("UPLOAD_FAILED", "参考图上传失败。");
  }

  if (!response.ok) {
    throw new KieClientError(
      response.status === 401 ? "KEY_INVALID" : "UPLOAD_FAILED",
      response.status === 401 ? "Kie API Key 无效。" : "参考图上传失败。",
    );
  }

  const parsed = uploadResponseSchema.parse(await response.json());
  const temporaryUrl = parsed.data.downloadUrl ?? parsed.data.fileUrl;
  if (!parsed.success || !temporaryUrl || !isRenderableKieUrl(temporaryUrl)) {
    throw new KieClientError(
      "UPLOAD_RESPONSE_INVALID",
      "Kie 返回了未验证的参考图 URL。",
    );
  }

  const now = Date.now();
  const expiresAt = parsed.data.expiresAt
    ? Date.parse(parsed.data.expiresAt)
    : now + 24 * 60 * 60 * 1_000;
  return {
    id: crypto.randomUUID(),
    keyFingerprint,
    displayName: file.name,
    mimeType: parsed.data.mimeType,
    size: parsed.data.fileSize,
    temporaryUrl,
    status: "ready",
    expiresAt,
    createdAt: now,
  };
}

async function postKie(
  path: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new KieClientError("NETWORK_ERROR", "网络请求失败，任务状态可能未知。");
  }

  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;
  if (!response.ok) {
    throw new KieClientError(
      payload?.error?.code ?? "REQUEST_FAILED",
      payload?.error?.message ?? "请求失败。",
    );
  }
  return payload;
}

async function validateImageFile(file: File): Promise<string> {
  const maxBytes = 30 * 1024 * 1024;
  if (file.size <= 0 || file.size > maxBytes) {
    throw new KieClientError("UPLOAD_SIZE_INVALID", "单张参考图必须小于 30 MB。");
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mime = detectImageMime(header);
  if (!mime || file.type !== mime) {
    throw new KieClientError(
      "UPLOAD_TYPE_INVALID",
      "仅支持内容有效的 JPEG、PNG 或 WEBP 图片。",
    );
  }
  return mime;
}

function detectImageMime(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return undefined;
}

function mimeExtension(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}
