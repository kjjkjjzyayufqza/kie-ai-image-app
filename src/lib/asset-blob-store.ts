import { db } from "@/lib/db";
import type { AssetChunkRecord } from "@/lib/domain";
import {
  DEFAULT_CHUNK_SIZE,
  LOSSLESS_CODEC,
  compressIntoChunks,
  decompressChunks,
  detectImageMime,
} from "@/lib/lossless-chunks";

export interface StoredAssetBytes {
  bytes: Uint8Array;
  mimeType: string;
  originalByteLength: number;
  chunkCount: number;
  codec: typeof LOSSLESS_CODEC;
}

export async function storeAssetBytes(
  assetId: string,
  bytes: Uint8Array,
  mimeType = detectImageMime(bytes),
  chunkSize = DEFAULT_CHUNK_SIZE,
): Promise<StoredAssetBytes> {
  if (!assetId) throw new Error("Asset id is required.");
  if (bytes.byteLength === 0) throw new Error("Cannot store empty image bytes.");

  const packed = await compressIntoChunks(bytes, chunkSize);
  const records: AssetChunkRecord[] = packed.chunks.map((chunk, chunkIndex) => {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return {
      id: `${assetId}:${chunkIndex}`,
      assetId,
      chunkIndex,
      totalChunks: packed.chunks.length,
      codec: packed.codec,
      originalByteLength: packed.originalByteLength,
      mimeType,
      bytes: copy.buffer,
    };
  });

  await db.transaction("rw", db.assetChunks, db.assets, async () => {
    await db.assetChunks.where("assetId").equals(assetId).delete();
    await db.assetChunks.bulkPut(records);
    await db.assets.update(assetId, {
      persistStatus: "stored",
      persistError: undefined,
      byteLength: packed.originalByteLength,
      mimeType,
      chunkCount: records.length,
      availability: "available",
      lastCheckedAt: Date.now(),
    });
  });

  return {
    bytes,
    mimeType,
    originalByteLength: packed.originalByteLength,
    chunkCount: records.length,
    codec: packed.codec,
  };
}

export async function loadAssetBytes(
  assetId: string,
): Promise<StoredAssetBytes | undefined> {
  const records = await db.assetChunks
    .where("assetId")
    .equals(assetId)
    .sortBy("chunkIndex");
  if (records.length === 0) return undefined;

  const first = records[0]!;
  if (records.length !== first.totalChunks) {
    throw new Error("Stored image chunks are incomplete.");
  }

  const restored = await decompressChunks({
    codec: first.codec,
    originalByteLength: first.originalByteLength,
    chunks: records.map((record) => new Uint8Array(record.bytes)),
  });

  return {
    bytes: restored,
    mimeType: first.mimeType,
    originalByteLength: first.originalByteLength,
    chunkCount: records.length,
    codec: first.codec,
  };
}

export async function markAssetPersistFailed(
  assetId: string,
  message: string,
): Promise<void> {
  await db.assets.update(assetId, {
    persistStatus: "failed",
    persistError: message,
    lastCheckedAt: Date.now(),
  });
}

export async function deleteAssetBytes(assetId: string): Promise<void> {
  await db.assetChunks.where("assetId").equals(assetId).delete();
}
