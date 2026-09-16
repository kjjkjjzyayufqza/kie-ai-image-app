import { z } from "zod";

import {
  authorizeProxyRequest,
  errorResponse,
  jsonResponse,
  readJsonBody,
} from "@/lib/server/kie-proxy";
import { loadImageCatalog } from "@/lib/server/load-image-catalog";
import { runWithRequestMessages } from "@/lib/server/request-messages";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const requestSchema = z.object({}).strict();

export async function POST(request: Request) {
  return runWithRequestMessages(request, async () => {
    try {
      const apiKey = authorizeProxyRequest(request);
      requestSchema.parse(await readJsonBody(request));
      const catalog = await loadImageCatalog(apiKey);
      return jsonResponse({
        ok: true,
        data: {
          models: catalog.models,
          costs: catalog.costs,
          source: catalog.source,
        },
      });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
