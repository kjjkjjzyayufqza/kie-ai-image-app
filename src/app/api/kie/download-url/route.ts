import { z } from "zod";

import { isRenderableKieUrl, isSafeHttpsUrl } from "@/lib/kie-urls";
import {
  authorizeProxyRequest,
  errorResponse,
  fetchKieJson,
  jsonResponse,
  ProxyRequestError,
} from "@/lib/server/kie-proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const requestSchema = z.object({ url: z.string().max(2_048) });
const responseSchema = z.object({ code: z.number(), data: z.string() });

export async function POST(request: Request) {
  try {
    const apiKey = authorizeProxyRequest(request);
    const { url } = requestSchema.parse(await request.json());
    if (!isRenderableKieUrl(url)) {
      throw new ProxyRequestError(
        "RESULT_URL_BLOCKED",
        422,
        "该图片 URL 不在已验证的 Kie 域名中。",
      );
    }

    const upstream = responseSchema.parse(
      await fetchKieJson("/api/v1/common/download-url", apiKey, {
        method: "POST",
        body: { url },
      }),
    );
    if (upstream.code !== 200 || !isSafeHttpsUrl(upstream.data)) {
      throw new ProxyRequestError(
        "DOWNLOAD_URL_INVALID",
        502,
        "Kie 未返回有效下载链接。",
      );
    }
    return jsonResponse({ ok: true, data: { url: upstream.data } });
  } catch (error) {
    return errorResponse(error);
  }
}
