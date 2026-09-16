const cache = new Map<string, { url: string; revision: string }>();

export function objectUrlRevision(
  id: string,
  parts: Array<string | number | undefined>,
): string {
  return `${id}:${parts.map((part) => String(part ?? "")).join(":")}`;
}

export function getCachedObjectUrl(revision: string): string | undefined {
  for (const entry of cache.values()) {
    if (entry.revision === revision) return entry.url;
  }
  return undefined;
}

export function rememberObjectUrl(
  id: string,
  revision: string,
  blob: Blob,
): string {
  const existing = cache.get(id);
  if (existing?.revision === revision) return existing.url;
  if (existing) URL.revokeObjectURL(existing.url);
  const url = URL.createObjectURL(blob);
  cache.set(id, { url, revision });
  return url;
}
