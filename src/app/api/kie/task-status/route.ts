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

const requestSchema = z.object({
  taskId: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/),
});

const taskStateSchema = z.enum([
  "waiting",
  "queuing",
  "generating",
  "success",
  "fail",
]);

const responseSchema = z.object({
  data: z.object({
    taskId: z.string(),
    state: taskStateSchema,
    resultJson: z.string().optional().nullable(),
    failCode: z.string().optional().nullable(),
    failMsg: z.string().optional().nullable(),
    creditsConsumed: z.number().nonnegative().optional().nullable(),
    completeTime: z.number().optional().nullable(),
  }),
});

const resultSchema = z.object({ resultUrls: z.array(z.string()).max(16) });

export async function POST(request: Request) {
  try {
    const apiKey = authorizeProxyRequest(request);
    const { taskId } = requestSchema.parse(await request.json());
    const upstream = responseSchema.parse(
      await fetchKieJson(
        `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        apiKey,
      ),
    );
    if (upstream.data.taskId !== taskId) {
      throw new ProxyRequestError(
        "TASK_ID_MISMATCH",
        502,
        "Kie 返回了不匹配的任务记录。",
      );
    }
    const resultUrls = parseResultUrls(upstream.data.resultJson);

    return jsonResponse({
      ok: true,
      data: {
        remoteTaskId: upstream.data.taskId,
        state: upstream.data.state,
        resultUrls: resultUrls.map((url) => ({
          url,
          isRenderable: isRenderableKieUrl(url),
        })),
        failCode: upstream.data.failCode || undefined,
        failMessage: upstream.data.failMsg || undefined,
        creditsConsumed: upstream.data.creditsConsumed ?? undefined,
        completedAt: upstream.data.completeTime ?? undefined,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function parseResultUrls(resultJson?: string | null): string[] {
  if (!resultJson) return [];
  try {
    const parsed = resultSchema.parse(JSON.parse(resultJson));
    return parsed.resultUrls.filter(isSafeHttpsUrl);
  } catch {
    throw new ProxyRequestError(
      "RESULT_INVALID",
      502,
      "Kie 返回的结果 URL 无法识别。",
    );
  }
}
