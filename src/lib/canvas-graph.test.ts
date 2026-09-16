import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  associateChildGeneration,
  commitCanvasLiveDeltas,
  createEmptyCanvasGraph,
  parseCanvasGraph,
  placeImageNode,
  placeReferenceNode,
  pointerWorldDelta,
  serializeCanvasGraph,
  setCanvasViewport,
} from "@/lib/canvas-graph";
import { createLiveCanvasBuffer } from "@/lib/canvas-live";
import type { CanvasGraph } from "@/lib/domain";
import { referenceFromCanvasNode } from "@/lib/canvas-references";
import { db } from "@/lib/db";
import { saveCanvasGraph, loadCanvasGraph } from "@/lib/workspace-service";

describe("canvas graph", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("places an image object, associates a child generation, and reloads pan/zoom", async () => {
    const empty = createEmptyCanvasGraph("room-canvas");
    const withParent = placeImageNode(empty, {
      id: "node-parent",
      kind: "image",
      x: 120,
      y: 80,
      width: 280,
      height: 280,
      assetId: "asset-parent",
    });
    const withChild = associateChildGeneration(withParent, "node-parent", {
      id: "node-child",
      x: 440,
      y: 80,
      width: 280,
      height: 280,
      assetId: "asset-child",
      localTaskId: "task-child",
    });
    const withViewport = setCanvasViewport(withChild, {
      x: -40,
      y: 18,
      zoom: 1.5,
    });

    await saveCanvasGraph(withViewport);
    const reloaded = await loadCanvasGraph("room-canvas");
    const parsed = parseCanvasGraph(serializeCanvasGraph(reloaded));

    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.nodes[0]).toMatchObject({
      id: "node-parent",
      x: 120,
      y: 80,
      assetId: "asset-parent",
    });
    expect(parsed.nodes[1]).toMatchObject({
      id: "node-child",
      parentId: "node-parent",
      assetId: "asset-child",
    });
    expect(parsed.edges).toEqual([
      {
        id: "node-parent->node-child",
        sourceId: "node-parent",
        targetId: "node-child",
        kind: "iteration",
      },
    ]);
    expect(parsed.viewport).toEqual({ x: -40, y: 18, zoom: 1.5 });
  });

  it("places a reference upload on the canvas and reuses the same node", async () => {
    const empty = createEmptyCanvasGraph("room-refs");
    const placed = placeReferenceNode(empty, {
      uploadId: "upload-1",
      previewUrl: "https://tempfile.redpandaai.co/reference.png",
      displayName: "Product shot",
      origin: { x: 10, y: 20 },
    });
    const again = placeReferenceNode(placed, {
      uploadId: "upload-1",
      previewUrl: "https://tempfile.redpandaai.co/reference.png",
      displayName: "Product shot",
    });

    expect(placed.nodes).toHaveLength(1);
    expect(placed.nodes[0]).toMatchObject({
      id: "ref:upload-1",
      kind: "reference",
      referenceUploadId: "upload-1",
      previewUrl: "https://tempfile.redpandaai.co/reference.png",
      x: 10,
      y: 20,
    });
    expect(placed.selectedNodeId).toBe("ref:upload-1");
    expect(again.nodes).toHaveLength(1);

    const asReference = referenceFromCanvasNode(placed.nodes[0]!, [], [
      {
        id: "upload-1",
        keyFingerprint: "fp",
        displayName: "Product shot",
        mimeType: "image/png",
        size: 12,
        temporaryUrl: "https://tempfile.redpandaai.co/reference.png",
        status: "ready",
        expiresAt: Date.now() + 60_000,
        createdAt: Date.now(),
      },
    ]);
    expect(asReference?.id).toBe("upload-1");
    expect(asReference?.temporaryUrl).toBe(
      "https://tempfile.redpandaai.co/reference.png",
    );

    await saveCanvasGraph(placed);
    const reloaded = await loadCanvasGraph("room-refs");
    expect(reloaded.nodes[0]?.kind).toBe("reference");
  });

  it("commits a drag-end position and reloads it from IndexedDB", async () => {
    const placed = placeImageNode(createEmptyCanvasGraph("room-drag"), {
      id: "node-drag",
      kind: "image",
      x: 40,
      y: 60,
      width: 280,
      height: 280,
      assetId: "asset-drag",
    });
    const committed = commitCanvasLiveDeltas(placed, {
      nodePositions: { "node-drag": { x: 220, y: 310 } },
    });
    await saveCanvasGraph(committed);
    const reloaded = await loadCanvasGraph("room-drag");

    expect(reloaded.nodes).toHaveLength(1);
    expect(reloaded.nodes[0]).toMatchObject({
      id: "node-drag",
      x: 220,
      y: 310,
    });
    expect(reloaded.nodes[0]?.x).not.toBe(40);
    expect(reloaded.nodes[0]?.y).not.toBe(60);
  });

  it("records live pointer deltas without persisting until a single commit", async () => {
    const placed = placeImageNode(createEmptyCanvasGraph("room-live"), {
      id: "node-live",
      kind: "image",
      x: 0,
      y: 0,
      width: 280,
      height: 280,
    });
    const live = createLiveCanvasBuffer(placed.viewport);
    const persistCalls: CanvasGraph[] = [];

    const mid = pointerWorldDelta(
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 50, y: 30 },
      1,
    );
    live.setNodePosition("node-live", mid);
    live.setNodePosition(
      "node-live",
      pointerWorldDelta({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 130, y: 90 }, 1),
    );
    expect(live.commitCount).toBe(0);
    expect(persistCalls).toHaveLength(0);
    expect(placed.nodes[0]).toMatchObject({ x: 0, y: 0 });

    const committed = live.commit(placed);
    persistCalls.push(committed);
    await saveCanvasGraph(committed);

    expect(live.commitCount).toBe(1);
    expect(persistCalls).toHaveLength(1);
    expect(committed.nodes[0]).toMatchObject({ x: 120, y: 80 });
    expect((await loadCanvasGraph("room-live")).nodes[0]).toMatchObject({
      x: 120,
      y: 80,
    });
  });
});
