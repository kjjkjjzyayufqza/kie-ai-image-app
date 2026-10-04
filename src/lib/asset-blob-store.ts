import {
  decompressOffThread,
  scheduleAssetLoad,
} from "@/lib/asset-decode-queue";
import { db } from "@/lib/db";
import type { AssetChunkRecord } from "@/lib/domain";
import {
  DEFAULT_CHUNK_SIZE,
  LOSSLESS_CODEC,
  compressIntoChunks,
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

function isBlob(value: unknown): value is Blob {
  return (
    typeof Blob !== "undefined" &&
    typeof value === "object" &&
    value !== null &&
    typeof (value as Blob).arrayBuffer === "function" &&
    typeof (value as Blob).size === "number" &&
    typeof (value as Blob).type === "string"
  );
}

function isArrayBufferLike(value: unknown): value is ArrayBuffer {
  return (
    typeof value === "object" &&
    value !== null &&
    !ArrayBuffer.isView(value) &&
    !isBlob(value) &&
    typeof (value as ArrayBuffer).byteLength === "number" &&
    typeof (value as ArrayBuffer).slice === "function"
  );
}

export async function storedChunkToBytes(value: unknown): Promise<Uint8Array> {
  if (isBlob(value)) {
    return new Uint8Array(await value.arrayBuffer());
  }
  if (ArrayBuffer.isView(value)) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return copy;
  }
  if (isArrayBufferLike(value)) {
    return new Uint8Array(value);
  }
  throw new Error("Stored image chunk has an unsupported binary type.");
}

async function readAssetBytes(
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

  const restored = await decompressOffThread({
    codec: first.codec,
    originalByteLength: first.originalByteLength,
    chunks: await Promise.all(
      records.map((record) => storedChunkToBytes(record.bytes)),
    ),
  });

  return {
    bytes: restored,
    mimeType: first.mimeType,
    originalByteLength: first.originalByteLength,
    chunkCount: records.length,
    codec: first.codec,
  };
}

export function loadAssetBytes(
  assetId: string,
): Promise<StoredAssetBytes | undefined> {
  return scheduleAssetLoad(() => readAssetBytes(assetId));
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
