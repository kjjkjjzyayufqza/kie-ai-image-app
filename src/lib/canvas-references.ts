import type { Asset, CanvasNode, ReferenceUpload } from "@/lib/domain";
import { isRenderableKieUrl } from "@/lib/kie-urls";

const CANVAS_ASSET_REF_PREFIX = "canvas-asset:";

export function canvasAssetReferenceId(assetId: string): string {
  return `${CANVAS_ASSET_REF_PREFIX}${assetId}`;
}

export function referenceFromCanvasNode(
  node: CanvasNode,
  assets: readonly Asset[],
  uploads: readonly ReferenceUpload[],
): ReferenceUpload | undefined {
  if (node.kind === "generating") return undefined;

  if (node.referenceUploadId) {
    return uploads.find((upload) => upload.id === node.referenceUploadId);
  }

  if (node.assetId) {
    const asset = assets.find((item) => item.id === node.assetId);
    if (!asset?.isRenderable || !isRenderableKieUrl(asset.url)) return undefined;
    return {
      id: canvasAssetReferenceId(asset.id),
      keyFingerprint: "",
      displayName: node.prompt?.trim() || "Canvas image",
      mimeType: asset.mimeType ?? "image/png",
      size: asset.byteLength ?? 0,
      temporaryUrl: asset.url,
      status: "ready",
      expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1_000,
      createdAt: asset.createdAt,
    };
  }

  if (node.previewUrl && isRenderableKieUrl(node.previewUrl)) {
    return {
      id: node.id,
      keyFingerprint: "",
      displayName: node.prompt?.trim() || "Canvas image",
      mimeType: "image/png",
      size: 0,
      temporaryUrl: node.previewUrl,
      status: "ready",
      expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1_000,
      createdAt: Date.now(),
    };
  }

  return undefined;
}

export function canvasNodeIdForReference(
  uploadId: string,
  nodes: readonly CanvasNode[],
): string | undefined {
  if (uploadId.startsWith(CANVAS_ASSET_REF_PREFIX)) {
    const assetId = uploadId.slice(CANVAS_ASSET_REF_PREFIX.length);
    return nodes.find((node) => node.assetId === assetId)?.id;
  }
  return (
    nodes.find((node) => node.referenceUploadId === uploadId)?.id ??
    `ref:${uploadId}`
  );
}

export function mergeReference(
  current: readonly ReferenceUpload[],
  incoming: ReferenceUpload,
  maxCount: number,
): ReferenceUpload[] {
  if (
    current.some(
      (item) =>
        item.id === incoming.id || item.temporaryUrl === incoming.temporaryUrl,
    )
  ) {
    return [...current];
  }
  if (current.length >= maxCount) {
    throw new Error("Too many reference images.");
  }
  return [...current, incoming];
}
