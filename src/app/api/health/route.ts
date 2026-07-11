import { getNoStoreHeaders } from "@/lib/server/kie-proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return Response.json(
    { ok: true, service: "kie-ai-image-app", time: Date.now() },
    { headers: getNoStoreHeaders() },
  );
}
