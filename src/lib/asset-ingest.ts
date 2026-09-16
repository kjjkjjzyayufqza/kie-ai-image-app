import type { Asset, GenerationTask, KieTaskResult } from "@/lib/domain";
import { t } from "@/i18n/runtime";
import {
  loadAssetBytes,
  markAssetPersistFailed,
  storeAssetBytes,
} from "@/lib/asset-blob-store";
import { db } from "@/lib/db";
import { detectImageMime } from "@/lib/lossless-chunks";

export type AssetByteFetcher = (
  url: string,
) => Promise<{ bytes: Uint8Array; mimeType?: string }>;

export async function ingestRemoteAsset(
  asset: Asset,
  fetchBytes: AssetByteFetcher,
): Promise<void> {
  if (!asset.isRenderable) return;
  try {
    const result = await fetchBytes(asset.url);
    const mimeType = result.mimeType?.startsWith("image/")
      ? result.mimeType
      : detectImageMime(result.bytes);
    await storeAssetBytes(asset.id, result.bytes, mimeType);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : t("errors.persistFailed");
    await markAssetPersistFailed(asset.id, message);
  }
}

export async function recordSuccessfulTaskAssets(input: {
  task: GenerationTask;
  result: KieTaskResult;
  fetchBytes?: AssetByteFetcher;
}): Promise<Asset[]> {
  const now = Date.now();
  const existingAssets = await db.assets
    .where("localTaskId")
    .equals(input.task.localTaskId)
    .toArray();
  const existingByOrdinal = new Map(
    existingAssets.map((asset) => [asset.outputOrdinal, asset]),
  );
  if (
    existingAssets.length > 0 &&
    existingAssets.length !== input.result.resultUrls.length
  ) {
    await db.tasks.update(input.task.localTaskId, {
      failureCode: "RESULT_CONTRACT_CHANGED",
      failureMessage: t("errors.resultCountChanged"),
    });
    return existingAssets;
  }

  const assets: Asset[] = input.result.resultUrls.map((entry, outputOrdinal) => {
    const existing = existingByOrdinal.get(outputOrdinal);
    return {
      id: `${input.task.localTaskId}:${outputOrdinal}`,
      localTaskId: input.task.localTaskId,
      roomId: input.task.roomId,
      outputOrdinal,
      url: entry.url,
      isRenderable: entry.isRenderable,
      availability:
        existing?.url === entry.url ? existing.availability : "unchecked",
      favorite: existing?.favorite ?? false,
      tags: existing?.tags ?? [],
      collectionIds: existing?.collectionIds ?? [],
      width: existing?.width,
      height: existing?.height,
      createdAt: existing?.createdAt ?? input.result.completedAt ?? now,
      lastCheckedAt: existing?.lastCheckedAt,
      persistStatus: existing?.persistStatus,
      persistError: existing?.persistError,
      byteLength: existing?.byteLength,
      mimeType: existing?.mimeType,
      chunkCount: existing?.chunkCount,
    };
  });

  await db.assets.bulkPut(
    assets.map((asset) =>
      asset.isRenderable && asset.persistStatus !== "stored"
        ? { ...asset, persistStatus: "pending" as const }
        : asset,
    ),
  );

  if (input.fetchBytes) {
    for (const asset of assets) {
      if (!asset.isRenderable) continue;
      const stored = await loadAssetBytes(asset.id);
      if (stored) continue;
      await ingestRemoteAsset(asset, input.fetchBytes);
    }
  }

  return assets;
}

export async function readLocalAssetObjectUrl(
  assetId: string,
): Promise<string | undefined> {
  const stored = await loadAssetBytes(assetId);
  if (!stored) return undefined;
  const blob = new Blob([Uint8Array.from(stored.bytes)], {
    type: stored.mimeType,
  });
  return URL.createObjectURL(blob);
}
