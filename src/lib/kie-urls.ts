const DEFAULT_KIE_ASSET_HOSTS = [
  "tempfile.aiquickdraw.com",
  "tempfile.redpandaai.co",
  "kieai.redpandaai.co",
  "static.aiquickdraw.com",
];

export function getAllowedKieAssetHosts(): Set<string> {
  const configuredHosts =
    process.env.NEXT_PUBLIC_KIE_ASSET_HOSTS?.split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean) ?? [];
  return new Set([...DEFAULT_KIE_ASSET_HOSTS, ...configuredHosts]);
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

export function isRenderableKieUrl(value: string): boolean {
  if (!isSafeHttpsUrl(value)) return false;
  return getAllowedKieAssetHosts().has(new URL(value).hostname.toLowerCase());
}

function isIpAddress(hostname: string): boolean {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return true;
  return hostname.includes(":");
}
