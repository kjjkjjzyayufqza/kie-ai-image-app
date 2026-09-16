import {
  parseDocsLlmsCatalog,
  parseKieCatalog,
  fallbackImageCatalog,
  type ImageCatalog,
} from "@/lib/image-catalog";
import { fetchKieJson } from "@/lib/server/kie-proxy";

const KIE_CATALOG_GET_PATHS = [
  "/api/v1/models",
  "/api/v1/jobs/models",
  "/api/v1/common/models",
  "/api/v1/model/list",
];

const KIE_CATALOG_POST_PATHS = [
  "/api/v1/models",
  "/api/v1/jobs/models",
  "/api/v1/common/models",
];

const DOCS_LLMS_URL = "https://docs.kie.ai/llms.txt";

export async function loadImageCatalog(apiKey: string): Promise<ImageCatalog> {
  const live = await fetchLiveKieCatalog(apiKey);
  if (live) return live;

  const fromDocs = await fetchDocsCatalog();
  if (fromDocs) return fromDocs;

  return fallbackImageCatalog();
}

async function fetchLiveKieCatalog(
  apiKey: string,
): Promise<ImageCatalog | undefined> {
  for (const path of KIE_CATALOG_GET_PATHS) {
    const parsed = await tryKiePath(apiKey, path, "GET");
    if (parsed) return parsed;
  }
  for (const path of KIE_CATALOG_POST_PATHS) {
    const parsed = await tryKiePath(apiKey, path, "POST");
    if (parsed) return parsed;
  }
  return undefined;
}

async function tryKiePath(
  apiKey: string,
  path: string,
  method: "GET" | "POST",
): Promise<ImageCatalog | undefined> {
  try {
    const payload = await fetchKieJson(path, apiKey, {
      method,
      body: method === "POST" ? {} : undefined,
      timeoutMs: 12_000,
    });
    return parseKieCatalog(payload);
  } catch {
    return undefined;
  }
}

async function fetchDocsCatalog(): Promise<ImageCatalog | undefined> {
  try {
    const response = await fetch(DOCS_LLMS_URL, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return undefined;
    const markdown = await response.text();
    if (markdown.length > 2_000_000) return undefined;
    return parseDocsLlmsCatalog(markdown);
  } catch {
    return undefined;
  }
}
