import { z } from "zod";

import { generationRequestSchema, toKieCreatePayload } from "@/lib/model-registry";
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

const createResponseSchema = z.object({
  code: z.number(),
  msg: z.string().optional(),
  data: z.object({ taskId: z.string().min(1).max(256) }),
});

export async function POST(request: Request) {
  return runWithRequestMessages(request, async () => {
    try {
      const apiKey = authorizeProxyRequest(request);
      const input = generationRequestSchema.parse(await readJsonBody(request));
      const upstream = createResponseSchema.parse(
        await fetchKieJson("/api/v1/jobs/createTask", apiKey, {
          method: "POST",
          body: toKieCreatePayload(input),
          timeoutMs: 30_000,
        }),
      );

      if (upstream.code !== 200) {
        throw new ProxyRequestError(
          "TASK_CREATE_FAILED",
          502,
          t("errors.taskCreateFailed"),
        );
      }

      return jsonResponse({ ok: true, data: { taskId: upstream.data.taskId } });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
