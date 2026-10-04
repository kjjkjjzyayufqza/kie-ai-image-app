import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ingestRemoteAsset, repairUnstoredAssets } from "@/lib/asset-ingest";
import {
  loadAssetBytes,
  storedChunkToBytes,
  storeAssetBytes,
} from "@/lib/asset-blob-store";
import { db } from "@/lib/db";
import {
  compressIntoChunks,
  decompressChunks,
  detectImageMime,
} from "@/lib/lossless-chunks";

function pngBytes(payloadSize = 8): Uint8Array {
  const bytes = new Uint8Array(8 + payloadSize);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let state = 0x12345678;
  for (let index = 0; index < payloadSize; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[8 + index] = state & 0xff;
  }
  return bytes;
}

describe("lossless chunk compression", () => {
  it("reconstitutes the original bytes after compress, chunk, and decompress", async () => {
    const original = pngBytes(180_000);
    const packed = await compressIntoChunks(original, 64 * 1024);

    expect(packed.codec).toBe("gzip");
    expect(packed.chunks.length).toBeGreaterThan(1);
    packed.chunks.forEach((chunk, chunkIndex) => {
      expect(chunk.byteLength).toBeGreaterThan(0);
      expect(chunkIndex).toBeGreaterThanOrEqual(0);
    });
    expect(detectImageMime(original)).toBe("image/png");

    const restored = await decompressChunks(packed);
    expect(Array.from(restored)).toEqual(Array.from(original));
  });

  it("does not re-encode the image as a lossy JPEG or WebP", async () => {
    const original = pngBytes(4096);
    const packed = await compressIntoChunks(original, 1024);
    const concatenated = packed.chunks.reduce((total, chunk) => {
      const next = new Uint8Array(total.byteLength + chunk.byteLength);
      next.set(total);
      next.set(chunk, total.byteLength);
      return next;
    }, new Uint8Array());

    expect(concatenated[0]).toBe(0x1f);
    expect(concatenated[1]).toBe(0x8b);
    expect(detectImageMime(original)).toBe("image/png");
  });
});

describe("asset blob store", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("stores gzip chunks in IndexedDB and loads the original bytes", async () => {
    const original = pngBytes(90_000);
    await db.assets.put({
      id: "asset-1",
      localTaskId: "task-1",
      roomId: "room-1",
      outputOrdinal: 0,
      url: "https://tempfile.redpandaai.co/generated.png",
      isRenderable: true,
      availability: "unchecked",
      favorite: false,
      tags: [],
      collectionIds: [],
      createdAt: Date.now(),
    });

    const stored = await storeAssetBytes("asset-1", original, "image/png", 16 * 1024);
    expect(stored.chunkCount).toBeGreaterThan(1);

    const chunks = await db.assetChunks.where("assetId").equals("asset-1").toArray();
    expect(chunks.length).toBe(stored.chunkCount);
    expect(chunks.every((chunk) => typeof chunk.chunkIndex === "number")).toBe(
      true,
    );
    expect(chunks.every((chunk) => chunk.codec === "gzip")).toBe(true);

    const loaded = await loadAssetBytes("asset-1");
    expect(loaded).toBeDefined();
    expect(Array.from(loaded!.bytes)).toEqual(Array.from(original));
    expect(loaded!.mimeType).toBe("image/png");
  });

  it("ingests a success result URL into local storage immediately", async () => {
    const original = pngBytes(2048);
    await db.assets.put({
      id: "asset-ingest",
      localTaskId: "task-ingest",
      roomId: "room-1",
      outputOrdinal: 0,
      url: "https://tempfile.redpandaai.co/generated.png",
      isRenderable: true,
      availability: "unchecked",
      favorite: false,
      tags: [],
      collectionIds: [],
      createdAt: Date.now(),
      persistStatus: "pending",
    });

    await ingestRemoteAsset(
      (await db.assets.get("asset-ingest"))!,
      async () => ({ bytes: original, mimeType: "image/png" }),
    );

    const loaded = await loadAssetBytes("asset-ingest");
    expect(Array.from(loaded!.bytes)).toEqual(Array.from(original));
    expect((await db.assets.get("asset-ingest"))?.persistStatus).toBe("stored");
  });

  it("reads array buffers, byte views, and blobs as image bytes", async () => {
    const original = pngBytes(32);
    const viewBuffer = new Uint8Array(original.byteLength + 8);
    viewBuffer.set(original, 4);
    const view = viewBuffer.subarray(4, 4 + original.byteLength);

    expect(Array.from(await storedChunkToBytes(original.buffer))).toEqual(
      Array.from(original),
    );
    expect(Array.from(await storedChunkToBytes(view))).toEqual(
      Array.from(original),
    );
    const blobBytes = new ArrayBuffer(original.byteLength);
    new Uint8Array(blobBytes).set(original);
    expect(
      Array.from(await storedChunkToBytes(new Blob([blobBytes]))),
    ).toEqual(Array.from(original));
  });

  it("repairs a pending asset and leaves a recent failure alone", async () => {
    const original = pngBytes(64);
    const base = {
      localTaskId: "task-repair",
      roomId: "room-1",
      outputOrdinal: 0,
      url: "https://tempfile.redpandaai.co/generated.png",
      isRenderable: true,
      availability: "unchecked" as const,
      favorite: false,
      tags: [],
      collectionIds: [],
      createdAt: Date.now(),
    };
    await db.assets.bulkPut([
      { ...base, id: "asset-pending", persistStatus: "pending" as const },
      {
        ...base,
        id: "asset-failed",
        outputOrdinal: 1,
        persistStatus: "failed" as const,
        persistError: "download failed",
        lastCheckedAt: Date.now(),
      },
    ]);

    let fetches = 0;
    await repairUnstoredAssets(async () => {
      fetches += 1;
      return { bytes: original, mimeType: "image/png" };
    });

    expect(fetches).toBe(1);
    expect((await db.assets.get("asset-pending"))?.persistStatus).toBe("stored");
    expect(Array.from((await loadAssetBytes("asset-pending"))!.bytes)).toEqual(
      Array.from(original),
    );
    expect((await db.assets.get("asset-failed"))?.persistStatus).toBe("failed");
  });
});
