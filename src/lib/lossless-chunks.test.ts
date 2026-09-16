import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ingestRemoteAsset } from "@/lib/asset-ingest";
import { loadAssetBytes, storeAssetBytes } from "@/lib/asset-blob-store";
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
});
