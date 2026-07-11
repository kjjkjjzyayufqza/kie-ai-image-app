import { z } from "zod";

import {
  authorizeProxyRequest,
  errorResponse,
  fetchKieJson,
  jsonResponse,
  ProxyRequestError,
} from "@/lib/server/kie-proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const creditsResponseSchema = z.object({
  code: z.number(),
  data: z.number().nonnegative(),
});

export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    const apiKey = authorizeProxyRequest(request);
    const upstream = creditsResponseSchema.parse(
      await fetchKieJson("/api/v1/chat/credit", apiKey),
    );
    if (upstream.code !== 200) {
      throw new ProxyRequestError(
        "CREDITS_FAILED",
        502,
        "无法读取 Kie credits。",
      );
    }
    return jsonResponse({
      ok: true,
      data: {
        credits: upstream.data,
        latencyMs: Math.round(performance.now() - startedAt),
        checkedAt: Date.now(),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
