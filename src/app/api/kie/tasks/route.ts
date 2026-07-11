import { z } from "zod";

import { generationRequestSchema, toKieCreatePayload } from "@/lib/model-registry";
import {
  authorizeProxyRequest,
  errorResponse,
  fetchKieJson,
  jsonResponse,
  ProxyRequestError,
} from "@/lib/server/kie-proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const createResponseSchema = z.object({
  code: z.number(),
  msg: z.string().optional(),
  data: z.object({ taskId: z.string().min(1).max(256) }),
});

export async function POST(request: Request) {
  try {
    const apiKey = authorizeProxyRequest(request);
    const input = generationRequestSchema.parse(await request.json());
    const upstream = createResponseSchema.parse(
      await fetchKieJson("/api/v1/jobs/createTask", apiKey, {
        method: "POST",
        body: toKieCreatePayload(input),
        timeoutMs: 30_000,
      }),
    );

    if (upstream.code !== 200) {
      throw new ProxyRequestError("TASK_CREATE_FAILED", 502, "Kie 未能创建任务。");
    }

    return jsonResponse({ ok: true, data: { taskId: upstream.data.taskId } });
  } catch (error) {
    return errorResponse(error);
  }
}
