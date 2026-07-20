import { afterEach, describe, expect, it } from "vitest";

import {
  getAllowedKieAssetHosts,
  isDownloadableHttpsUrl,
  isRenderableKieUrl,
  isSafeHttpsUrl,
  normalizeKieAssetHost,
} from "@/lib/kie-urls";

describe("Kie URL policy", () => {
  const originalHosts = process.env.NEXT_PUBLIC_KIE_ASSET_HOSTS;

  afterEach(() => {
    if (originalHosts === undefined) {
      delete process.env.NEXT_PUBLIC_KIE_ASSET_HOSTS;
    } else {
      process.env.NEXT_PUBLIC_KIE_ASSET_HOSTS = originalHosts;
    }
  });

  it("rejects private, credentialed, non-HTTPS, and port-bearing URLs", () => {
    expect(isSafeHttpsUrl("http://tempfile.redpandaai.co/image.png")).toBe(false);
    expect(isSafeHttpsUrl("https://user:pass@example.com/image.png")).toBe(false);
    expect(isSafeHttpsUrl("https://127.0.0.1/image.png")).toBe(false);
    expect(isSafeHttpsUrl("https://example.com:8443/image.png")).toBe(false);
  });

  it("ignores malformed configured hosts instead of injecting them into policy", () => {
    process.env.NEXT_PUBLIC_KIE_ASSET_HOSTS =
      "cdn.example.com, evil.example; script-src * ,127.0.0.1";

    expect(getAllowedKieAssetHosts()).toContain("cdn.example.com");
    expect(getAllowedKieAssetHosts()).not.toContain("evil.example; script-src *");
    expect(normalizeKieAssetHost("https://cdn.example.com")).toBeUndefined();
  });

  it("renders only URLs on the exact asset allowlist", () => {
    expect(
      isRenderableKieUrl("https://tempfile.redpandaai.co/image.png"),
    ).toBe(true);
    expect(
      isRenderableKieUrl("https://tempfile.redpandaai.co.attacker.example/image.png"),
    ).toBe(false);
  });

  it("allows signed temporary download hosts that are not renderable", () => {
    const signed =
      "https://cdn.example.r2.cloudflarestorage.com/v/image.png?X-Amz-Signature=abc";
    expect(isRenderableKieUrl(signed)).toBe(false);
    expect(isDownloadableHttpsUrl(signed)).toBe(true);
    expect(isDownloadableHttpsUrl("http://cdn.example.com/file.png")).toBe(false);
  });
});
