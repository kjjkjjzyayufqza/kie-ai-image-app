import { z } from "zod";

import { downloadBlob, openExternalUrl } from "@/lib/browser-actions";
import { loadAssetBytes } from "@/lib/asset-blob-store";
import type { GenerationRequest, KieTaskResult, ReferenceUpload } from "@/lib/domain";
import { t } from "@/i18n/runtime";
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

const catalogSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    models: z.array(z.unknown()),
    costs: z.record(z.string(), z.record(z.string(), z.number())),
    source: z.enum(["live", "fallback"]),
  }),
});

export class KieClientError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function filenameFromAssetUrl(url: string): string {
  try {
    const base = new URL(url).pathname.split("/").pop();
    if (base && /\.(png|jpe?g|webp|gif)$/i.test(base)) {
      return base.slice(0, 120);
    }
  } catch {
    // ignore parse failures
  }
  return `kie-image-${Date.now()}.png`;
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

export async function fetchKieImageCatalog(apiKey: string) {
  const response = await postKie("/api/kie/models", apiKey, {}, 25_000);
  return catalogSchema.parse(response).data;
}

export async function fetchKieImageBytes(
  apiKey: string,
  url: string,
): Promise<{ bytes: Uint8Array; mimeType?: string }> {
  let response: Response;
  try {
    response = await fetch("/api/kie/download-file", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new KieClientError("NETWORK_ERROR", t("errors.networkUnknown"));
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new KieClientError(
      payload?.error?.code ?? "DOWNLOAD_FAILED",
      payload?.error?.message ?? t("errors.downloadFailed"),
    );
  }

  const mimeType = response.headers.get("content-type") ?? undefined;
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType: mimeType?.split(";", 1)[0],
  };
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

/**
 * Streams the image through the same-origin proxy so the browser can save it
 * with Content-Disposition. Falls back to a temporary Kie download URL when
 * the streaming endpoint fails.
 */
export async function downloadStoredAsset(
  assetId: string,
  filename: string,
): Promise<boolean> {
  const stored = await loadAssetBytes(assetId);
  if (!stored) return false;
  downloadBlob(
    new Blob([Uint8Array.from(stored.bytes)], { type: stored.mimeType }),
    filename,
  );
  return true;
}

export async function downloadKieAsset(
  apiKey: string,
  url: string,
  filename?: string,
): Promise<void> {
  const resolvedName = filename ?? filenameFromAssetUrl(url);
  let response: Response;
  try {
    response = await fetch("/api/kie/download-file", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, filename: resolvedName }),
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new KieClientError("NETWORK_ERROR", t("errors.networkUnknown"));
  }

  if (response.ok) {
    downloadBlob(await response.blob(), resolvedName);
    return;
  }

  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;

  // Fallback: resolve a temporary link and open it when streaming fails.
  try {
    openExternalUrl(await fetchKieDownloadUrl(apiKey, url));
    return;
  } catch {
    throw new KieClientError(
      payload?.error?.code ?? "DOWNLOAD_FAILED",
      payload?.error?.message ?? t("errors.downloadFailed"),
    );
  }
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
    throw new KieClientError("UPLOAD_FAILED", t("errors.uploadFailed"));
  }

  if (!response.ok) {
    throw new KieClientError(
      response.status === 401 ? "KEY_INVALID" : "UPLOAD_FAILED",
      response.status === 401 ? t("errors.keyInvalid") : t("errors.uploadFailed"),
    );
  }

  const parsed = uploadResponseSchema.parse(await response.json());
  const temporaryUrl = parsed.data.downloadUrl ?? parsed.data.fileUrl;
  if (!parsed.success || !temporaryUrl || !isRenderableKieUrl(temporaryUrl)) {
    throw new KieClientError(
      "UPLOAD_RESPONSE_INVALID",
      t("errors.unverifiedReferenceUrl"),
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
    throw new KieClientError("NETWORK_ERROR", t("errors.networkUnknown"));
  }

  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;
  if (!response.ok) {
    throw new KieClientError(
      payload?.error?.code ?? "REQUEST_FAILED",
      payload?.error?.message ?? t("errors.requestFailed"),
    );
  }
  return payload;
}

async function validateImageFile(file: File): Promise<string> {
  const maxBytes = 30 * 1024 * 1024;
  if (file.size <= 0 || file.size > maxBytes) {
    throw new KieClientError("UPLOAD_SIZE_INVALID", t("errors.uploadSizeInvalid"));
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mime = detectImageMime(header);
  if (!mime || file.type !== mime) {
    throw new KieClientError(
      "UPLOAD_TYPE_INVALID",
      t("errors.uploadTypeInvalid"),
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
