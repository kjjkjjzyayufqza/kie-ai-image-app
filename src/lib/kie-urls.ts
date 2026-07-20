const DEFAULT_KIE_ASSET_HOSTS = [
  "tempfile.aiquickdraw.com",
  "tempfile.redpandaai.co",
  "kieai.redpandaai.co",
  "static.aiquickdraw.com",
];

export function getAllowedKieAssetHosts(): Set<string> {
  const configuredHosts =
    process.env.NEXT_PUBLIC_KIE_ASSET_HOSTS?.split(",")
      .map(normalizeKieAssetHost)
      .filter((host): host is string => Boolean(host)) ?? [];
  return new Set([...DEFAULT_KIE_ASSET_HOSTS, ...configuredHosts]);
}

export function normalizeKieAssetHost(value: string): string | undefined {
  const hostname = value.trim().toLowerCase();
  if (
    hostname.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      hostname,
    ) ||
    isIpAddress(hostname)
  ) {
    return undefined;
  }
  return hostname;
}

export function isSafeHttpsUrl(value: string): boolean {
  if (value.length > 2_048) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.hostname !== "localhost" &&
      !isIpAddress(url.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Temporary Kie download links are often signed R2/S3 URLs with long query
 * strings and hosts outside the render allowlist. Accept any non-local HTTPS
 * URL that is safe enough to open or stream as a download.
 */
export function isDownloadableHttpsUrl(value: string): boolean {
  if (value.length > 8_192) return false;

  try {
    const url = new URL(value);
    const portOk = url.port === "" || url.port === "443";
    return (
      url.protocol === "https:" &&
      portOk &&
      url.username === "" &&
      url.password === "" &&
      url.hostname !== "localhost" &&
      !isIpAddress(url.hostname)
    );
  } catch {
    return false;
  }
}

export function isRenderableKieUrl(value: string): boolean {
  if (!isSafeHttpsUrl(value)) return false;
  return getAllowedKieAssetHosts().has(new URL(value).hostname.toLowerCase());
}

function isIpAddress(hostname: string): boolean {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return true;
  return hostname.includes(":");
}
