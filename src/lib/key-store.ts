const KIE_KEY_STORAGE_KEY = "kie-ai-workspace.api-key.v1";
const KEY_CHANGE_EVENT = "kie-key-change";

export function getKieApiKey(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(KIE_KEY_STORAGE_KEY)?.trim() ?? "";
}

export function setKieApiKey(apiKey: string): void {
  const normalizedKey = apiKey.trim();
  if (normalizedKey) {
    window.localStorage.setItem(KIE_KEY_STORAGE_KEY, normalizedKey);
  } else {
    window.localStorage.removeItem(KIE_KEY_STORAGE_KEY);
  }
  window.dispatchEvent(new Event(KEY_CHANGE_EVENT));
}

export function subscribeToKieKey(callback: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === KIE_KEY_STORAGE_KEY) callback();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(KEY_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(KEY_CHANGE_EVENT, callback);
  };
}

export async function fingerprintApiKey(apiKey: string): Promise<string> {
  if (!apiKey) return "";
  const bytes = new TextEncoder().encode(apiKey);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function maskApiKey(apiKey: string): string {
  if (!apiKey) return "未配置";
  const suffix = apiKey.slice(-4);
  return `••••••••${suffix}`;
}
