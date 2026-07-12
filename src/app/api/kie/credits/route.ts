import { z } from "zod";

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

const creditsResponseSchema = z.object({
  code: z.number(),
  data: z.number().nonnegative(),
});
const requestSchema = z.object({}).strict();

export async function POST(request: Request) {
  return runWithRequestMessages(request, async () => {
    const startedAt = performance.now();
    try {
      const apiKey = authorizeProxyRequest(request);
      requestSchema.parse(await readJsonBody(request));
      const upstream = creditsResponseSchema.parse(
        await fetchKieJson("/api/v1/chat/credit", apiKey),
      );
      if (upstream.code !== 200) {
        throw new ProxyRequestError(
          "CREDITS_FAILED",
          502,
          t("errors.creditsFailed"),
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
  });
}
