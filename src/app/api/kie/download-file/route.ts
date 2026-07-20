import { z } from "zod";

import {
  isDownloadableHttpsUrl,
  isRenderableKieUrl,
} from "@/lib/kie-urls";
import {
  authorizeProxyRequest,
  errorResponse,
  fetchKieJson,
  getNoStoreHeaders,
  ProxyRequestError,
  readJsonBody,
} from "@/lib/server/kie-proxy";
import { runWithRequestMessages, t } from "@/lib/server/request-messages";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024;

const requestSchema = z
  .object({
    url: z.string().max(2_048),
    filename: z.string().max(180).optional(),
  })
  .strict();

const kieDownloadSchema = z.object({
  code: z.number(),
  data: z.union([z.string(), z.object({ url: z.string() }).passthrough()]),
});

export async function POST(request: Request) {
  return runWithRequestMessages(request, async () => {
    try {
      const apiKey = authorizeProxyRequest(request);
      const body = requestSchema.parse(await readJsonBody(request));
      if (!isRenderableKieUrl(body.url)) {
        throw new ProxyRequestError(
          "RESULT_URL_BLOCKED",
          422,
          t("errors.downloadUrlNotAllowed"),
        );
      }

      const fileUrl = await resolveFileUrl(apiKey, body.url);
      const upstream = await fetch(fileUrl, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(90_000),
      });

      if (!upstream.ok || !upstream.body) {
        throw new ProxyRequestError(
          "DOWNLOAD_FETCH_FAILED",
          502,
          t("errors.downloadFetchFailed"),
        );
      }

      const contentType =
        sanitizeContentType(upstream.headers.get("content-type")) ??
        "application/octet-stream";
      const filename = sanitizeFilename(
        body.filename ??
          filenameFromUrl(body.url) ??
          filenameFromContentType(contentType),
      );

      const headers = new Headers(getNoStoreHeaders());
      headers.set("Content-Type", contentType);
      headers.set(
        "Content-Disposition",
        `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      const contentLength = upstream.headers.get("content-length");
      if (contentLength && /^\d+$/.test(contentLength)) {
        const length = Number(contentLength);
        if (length > MAX_DOWNLOAD_BYTES) {
          throw new ProxyRequestError(
            "DOWNLOAD_TOO_LARGE",
            502,
            t("errors.downloadTooLarge"),
          );
        }
        headers.set("Content-Length", contentLength);
      }

      return new Response(limitStream(upstream.body, MAX_DOWNLOAD_BYTES), {
        status: 200,
        headers,
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}

async function resolveFileUrl(apiKey: string, sourceUrl: string): Promise<string> {
  try {
    const upstream = kieDownloadSchema.parse(
      await fetchKieJson("/api/v1/common/download-url", apiKey, {
        method: "POST",
        body: { url: sourceUrl },
        timeoutMs: 25_000,
      }),
    );
    const resolved =
      typeof upstream.data === "string" ? upstream.data : upstream.data.url;
    if (upstream.code === 200 && isDownloadableHttpsUrl(resolved)) {
      return resolved;
    }
  } catch {
    // Fall back to the original allowlisted result URL when the temp-link API fails.
  }

  if (isRenderableKieUrl(sourceUrl)) {
    return sourceUrl;
  }

  throw new ProxyRequestError(
    "DOWNLOAD_URL_INVALID",
    502,
    t("errors.downloadUrlInvalid"),
  );
}

function limitStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): ReadableStream<Uint8Array> {
  let total = 0;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const reader = stream.getReader();
      const pump = async (): Promise<void> => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              return;
            }
            total += value.byteLength;
            if (total > maxBytes) {
              await reader.cancel().catch(() => undefined);
              controller.error(
                new ProxyRequestError(
                  "DOWNLOAD_TOO_LARGE",
                  502,
                  t("errors.downloadTooLarge"),
                ),
              );
              return;
            }
            controller.enqueue(value);
          }
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      };
      void pump();
    },
    cancel() {
      void stream.cancel().catch(() => undefined);
    },
  });
}

function sanitizeContentType(value: string | null): string | undefined {
  if (!value) return undefined;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  if (
    !mediaType ||
    mediaType.length > 100 ||
    !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mediaType)
  ) {
    return undefined;
  }
  return mediaType;
}

function sanitizeFilename(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "kie-image.png";
}

function filenameFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split("/").pop();
    if (!base || !base.includes(".")) return undefined;
    return sanitizeFilename(decodeURIComponent(base));
  } catch {
    return undefined;
  }
}

function filenameFromContentType(contentType: string): string {
  if (contentType === "image/jpeg") return "kie-image.jpg";
  if (contentType === "image/webp") return "kie-image.webp";
  if (contentType === "image/gif") return "kie-image.gif";
  return "kie-image.png";
}
