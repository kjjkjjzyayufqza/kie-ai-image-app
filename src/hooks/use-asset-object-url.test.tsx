import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/asset-blob-store", () => ({
  loadAssetBytes: vi.fn(),
}));

import { useAssetObjectUrl } from "@/hooks/use-asset-object-url";
import { loadAssetBytes, type StoredAssetBytes } from "@/lib/asset-blob-store";
import type { Asset } from "@/lib/domain";

const loadAssetBytesMock = vi.mocked(loadAssetBytes);

function asset(id: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    localTaskId: "task-1",
    roomId: "room-1",
    outputOrdinal: 0,
    url: "https://tempfile.redpandaai.co/generated.png",
    isRenderable: true,
    availability: "available",
    favorite: false,
    tags: [],
    collectionIds: [],
    createdAt: 1,
    persistStatus: "stored",
    chunkCount: 1,
    ...overrides,
  };
}

function storedBytes(): StoredAssetBytes {
  return {
    bytes: new Uint8Array([1, 2, 3, 4]),
    mimeType: "image/png",
    originalByteLength: 4,
    chunkCount: 1,
    codec: "gzip",
  };
}

describe("useAssetObjectUrl", () => {
  it("keeps a stored image pending until bytes load, and ignores asset identity changes", async () => {
    let resolveLoad: (value: StoredAssetBytes) => void = () => undefined;
    loadAssetBytesMock.mockImplementation(
      () =>
        new Promise<StoredAssetBytes>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const first = asset("asset-pending-read");
    const { result, rerender } = renderHook(
      ({ value }: { value: Asset }) => useAssetObjectUrl(value),
      { initialProps: { value: first } },
    );

    expect(result.current.pending).toBe(true);
    expect(result.current.src).toBeUndefined();

    rerender({ value: { ...first, availability: "available" } });
    expect(loadAssetBytesMock).toHaveBeenCalledTimes(1);

    resolveLoad(storedBytes());
    await waitFor(() => expect(result.current.local).toBe(true));
    expect(result.current.pending).toBe(false);
    expect(result.current.src).toMatch(/^blob:/);
  });

  it("falls back to the original URL when the local copy cannot be read", async () => {
    loadAssetBytesMock.mockRejectedValue(new Error("Stored image chunks are incomplete."));
    const value = asset("asset-fallback", { persistStatus: "stored" });
    const { result } = renderHook(() => useAssetObjectUrl(value));

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.local).toBe(false);
    expect(result.current.src).toBe(value.url);
  });
});
