import { z } from "zod";

import {
  isDownloadableHttpsUrl,
  isRenderableKieUrl,
} from "@/lib/kie-urls";
import {
  authorizeProxyRequest,
  errorResponse,
  fetchKieJson,
  jsonResponse,
  ProxyRequestError,
  readJsonBody,
} from "@/lib/server/kie-proxy";
import { runWithRequestMessages, t } from "@/lib/server/request-messages";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const requestSchema = z.object({ url: z.string().max(2_048) }).strict();
const responseSchema = z.object({
  code: z.number(),
  data: z.union([z.string(), z.object({ url: z.string() }).passthrough()]),
});

function extractDownloadUrl(data: z.infer<typeof responseSchema>["data"]): string {
  if (typeof data === "string") return data;
  return data.url;
}

export async function POST(request: Request) {
  return runWithRequestMessages(request, async () => {
    try {
      const apiKey = authorizeProxyRequest(request);
      const { url } = requestSchema.parse(await readJsonBody(request));
      if (!isRenderableKieUrl(url)) {
        throw new ProxyRequestError(
          "RESULT_URL_BLOCKED",
          422,
          t("errors.downloadUrlNotAllowed"),
        );
      }

      const upstream = responseSchema.parse(
        await fetchKieJson("/api/v1/common/download-url", apiKey, {
          method: "POST",
          body: { url },
        }),
      );
      const downloadUrl = extractDownloadUrl(upstream.data);
      // Signed temp links live on R2/S3 hosts outside the render allowlist.
      if (upstream.code !== 200 || !isDownloadableHttpsUrl(downloadUrl)) {
        throw new ProxyRequestError(
          "DOWNLOAD_URL_INVALID",
          502,
          t("errors.downloadUrlInvalid"),
        );
      }
      return jsonResponse({ ok: true, data: { url: downloadUrl } });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
