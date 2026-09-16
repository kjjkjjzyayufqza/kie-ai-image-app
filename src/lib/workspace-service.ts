import {
  attachTaskNodes,
  createEmptyCanvasGraph,
  placeReferenceNodes,
  selectCanvasNode,
} from "@/lib/canvas-graph";
import { db } from "@/lib/db";
import type {
  CanvasGraph,
  GenerationRequest,
  GenerationTask,
  ReferenceUpload,
  Room,
  Turn,
  AssetCollection,
} from "@/lib/domain";
import { batchCountSchema, generationRequestSchema } from "@/lib/model-registry";
import { isDefaultRoomTitle, t } from "@/i18n/runtime";
import { clearComposerDrafts } from "@/lib/composer-draft";

export async function createRoom(title = t("rooms.defaultTitle")): Promise<Room> {
  const now = Date.now();
  const room: Room = {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
  };
  await db.rooms.add(room);
  return room;
}

export async function renameRoom(roomId: string, title: string): Promise<void> {
  const normalizedTitle = title.trim().slice(0, 80);
  if (!normalizedTitle) return;
  await db.rooms.update(roomId, { title: normalizedTitle, updatedAt: Date.now() });
}

export async function deleteRoom(roomId: string): Promise<void> {
  const activeStates = [
    "queued",
    "submitting",
    "waiting",
    "queuing",
    "generating",
    "stale",
  ];
  const activeTask = await db.tasks
    .where("roomId")
    .equals(roomId)
    .filter((task) => activeStates.includes(task.status))
    .first();

  if (activeTask) {
    await db.rooms.update(roomId, { deletedAt: Date.now(), updatedAt: Date.now() });
    return;
  }

  await db.transaction(
    "rw",
    [
      db.rooms,
      db.turns,
      db.tasks,
      db.assets,
      db.assetChunks,
      db.canvasGraphs,
    ],
    async () => {
      const assets = await db.assets.where("roomId").equals(roomId).toArray();
      await Promise.all(
        assets.map((asset) =>
          db.assetChunks.where("assetId").equals(asset.id).delete(),
        ),
      );
      await db.assets.where("roomId").equals(roomId).delete();
      await db.tasks.where("roomId").equals(roomId).delete();
      await db.turns.where("roomId").equals(roomId).delete();
      await db.canvasGraphs.delete(roomId);
      await db.rooms.delete(roomId);
    },
  );
}

export async function submitGenerationBatch(input: {
  roomId: string;
  request: GenerationRequest;
  count: number;
  keyFingerprint: string;
  referenceUploads: ReferenceUpload[];
  canvas?: {
    parentNodeId?: string;
    origin?: { x: number; y: number };
  };
}): Promise<Turn> {
  const request = generationRequestSchema.parse(input.request);
  const count = batchCountSchema.parse(input.count);
  if (!input.keyFingerprint) throw new Error(t("errors.apiKeyRequired"));

  const now = Date.now();
  const turnId = crypto.randomUUID();
  const batchId = crypto.randomUUID();
  const taskIds = Array.from({ length: count }, () => crypto.randomUUID());
  const turn: Turn = {
    id: turnId,
    roomId: input.roomId,
    prompt: request.prompt,
    mode: request.mode,
    model: request.model,
    parameters: {
      aspectRatio: request.aspectRatio,
      resolution: request.resolution,
    },
    referenceUploadIds: input.referenceUploads.map((upload) => upload.id),
    taskIds,
    createdAt: now,
  };
  const tasks: GenerationTask[] = taskIds.map((localTaskId, batchIndex) => ({
    localTaskId,
    keyFingerprint: input.keyFingerprint,
    roomId: input.roomId,
    turnId,
    batchId,
    batchIndex,
    model: request.model,
    requestSnapshot: request,
    status: "queued",
    fencingToken: 0,
    createdAt: now,
    updatedAt: now,
  }));

  await db.transaction(
    "rw",
    db.turns,
    db.tasks,
    db.rooms,
    db.canvasGraphs,
    async () => {
      await db.turns.add(turn);
      await db.tasks.bulkAdd(tasks);
      const room = await db.rooms.get(input.roomId);
      await db.rooms.update(input.roomId, {
        title:
          isDefaultRoomTitle(room?.title)
            ? request.prompt.replace(/\s+/g, " ").slice(0, 32)
            : room?.title,
        updatedAt: now,
      });
      if (input.canvas) {
        const current =
          (await db.canvasGraphs.get(input.roomId)) ??
          createEmptyCanvasGraph(input.roomId, now);
        await db.canvasGraphs.put(
          attachTaskNodes(current, {
            localTaskIds: taskIds,
            parentNodeId: input.canvas.parentNodeId,
            prompt: request.prompt,
            origin: input.canvas.origin,
          }, now),
        );
      }
    },
  );

  return turn;
}

export async function loadCanvasGraph(roomId: string): Promise<CanvasGraph> {
  return (
    (await db.canvasGraphs.get(roomId)) ?? createEmptyCanvasGraph(roomId)
  );
}

export async function ensureCanvasGraph(roomId: string): Promise<CanvasGraph> {
  const existing = await db.canvasGraphs.get(roomId);
  if (existing) return existing;
  const created = createEmptyCanvasGraph(roomId);
  await db.canvasGraphs.put(created);
  return created;
}

export async function saveCanvasGraph(graph: CanvasGraph): Promise<void> {
  await db.canvasGraphs.put({ ...graph, updatedAt: Date.now() });
}

export async function storeReferenceUpload(
  upload: ReferenceUpload,
): Promise<void> {
  await db.referenceUploads.put(upload);
}

export async function placeReferencesOnCanvas(
  roomId: string,
  uploads: Array<{
    id: string;
    temporaryUrl: string;
    displayName: string;
  }>,
  origin?: { x: number; y: number },
): Promise<void> {
  if (uploads.length === 0) return;
  const now = Date.now();
  const current =
    (await db.canvasGraphs.get(roomId)) ?? createEmptyCanvasGraph(roomId, now);
  await db.canvasGraphs.put(
    placeReferenceNodes(current, uploads, origin, now),
  );
}

export async function selectCanvasGraphNode(
  roomId: string,
  nodeId: string | undefined,
): Promise<void> {
  const current =
    (await db.canvasGraphs.get(roomId)) ?? createEmptyCanvasGraph(roomId);
  await db.canvasGraphs.put(selectCanvasNode(current, nodeId));
}

export async function toggleAssetFavorite(assetId: string): Promise<void> {
  const asset = await db.assets.get(assetId);
  if (!asset) return;
  await db.assets.update(assetId, { favorite: !asset.favorite });
}

export async function markAssetLoadError(assetId: string): Promise<void> {
  await db.assets.update(assetId, {
    availability: "load-error",
    lastCheckedAt: Date.now(),
  });
}

export async function markAssetAvailable(assetId: string): Promise<void> {
  await db.assets.update(assetId, {
    availability: "available",
    lastCheckedAt: Date.now(),
  });
}

export async function cancelQueuedTask(localTaskId: string): Promise<void> {
  const task = await db.tasks.get(localTaskId);
  if (!task || task.status !== "queued") return;
  await db.tasks.update(localTaskId, {
    status: "canceled-local",
    completedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function requestTaskRefresh(localTaskId: string): Promise<void> {
  const task = await db.tasks.get(localTaskId);
  if (!task?.remoteTaskId) return;
  await db.tasks.update(localTaskId, {
    status: "stale",
    pollAfter: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function exportWorkspaceData(): Promise<string> {
  const [
    rooms,
    turns,
    tasks,
    assets,
    referenceUploads,
    accountSnapshots,
    collections,
    canvasGraphs,
  ] = await Promise.all([
      db.rooms.toArray(),
      db.turns.toArray(),
      db.tasks.toArray(),
      db.assets.toArray(),
      db.referenceUploads.toArray(),
      db.accountSnapshots.toArray(),
      db.collections.toArray(),
      db.canvasGraphs.toArray(),
    ]);

  return JSON.stringify(
    {
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      rooms,
      turns,
      tasks,
      assets,
      referenceUploads,
      accountSnapshots,
      collections,
      canvasGraphs,
    },
    null,
    2,
  );
}

export async function clearWorkspaceData(): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.rooms,
      db.turns,
      db.tasks,
      db.assets,
      db.referenceUploads,
      db.accountSnapshots,
      db.collections,
      db.assetChunks,
      db.canvasGraphs,
    ],
    async () => {
      await Promise.all([
        db.rooms.clear(),
        db.turns.clear(),
        db.tasks.clear(),
        db.assets.clear(),
        db.referenceUploads.clear(),
        db.accountSnapshots.clear(),
        db.collections.clear(),
        db.assetChunks.clear(),
        db.canvasGraphs.clear(),
      ]);
    },
  );
  clearComposerDrafts();
}

export async function setAssetTags(assetId: string, tags: string[]): Promise<void> {
  const normalizedTags = Array.from(
    new Set(tags.map((tag) => tag.trim().slice(0, 30)).filter(Boolean)),
  ).slice(0, 20);
  await db.assets.update(assetId, { tags: normalizedTags });
}

export async function createAssetCollection(name: string): Promise<AssetCollection> {
  const normalizedName = name.trim().slice(0, 40);
  if (!normalizedName) throw new Error(t("errors.collectionNameEmpty"));
  const collection: AssetCollection = {
    id: crypto.randomUUID(),
    name: normalizedName,
    createdAt: Date.now(),
  };
  await db.collections.add(collection);
  return collection;
}

export async function toggleAssetCollection(
  assetId: string,
  collectionId: string,
): Promise<void> {
  const asset = await db.assets.get(assetId);
  if (!asset) return;
  const collectionIds = asset.collectionIds.includes(collectionId)
    ? asset.collectionIds.filter((id) => id !== collectionId)
    : [...asset.collectionIds, collectionId];
  await db.assets.update(assetId, { collectionIds });
}

export async function retryGenerationTask(
  localTaskId: string,
  keyFingerprint: string,
): Promise<GenerationTask> {
  return db.transaction("rw", db.tasks, db.turns, async () => {
    const original = await db.tasks.get(localTaskId);
    if (!original || !["unknown", "fail"].includes(original.status)) {
      throw new Error(t("errors.cannotRegenerate"));
    }
    if (original.keyFingerprint !== keyFingerprint) {
      throw new Error(t("errors.switchBackKey"));
    }
    const turn = await db.turns.get(original.turnId);
    if (!turn) throw new Error(t("errors.originalTurnMissing"));
    const siblings = await db.tasks.where("turnId").equals(original.turnId).toArray();
    const now = Date.now();
    const retryTask: GenerationTask = {
      ...original,
      localTaskId: crypto.randomUUID(),
      remoteTaskId: undefined,
      retryOfLocalTaskId: original.localTaskId,
      batchId: crypto.randomUUID(),
      batchIndex: Math.max(...siblings.map((task) => task.batchIndex), -1) + 1,
      status: "queued",
      failureCode: undefined,
      failureMessage: undefined,
      creditsConsumed: undefined,
      submissionAttemptId: undefined,
      leaseOwner: undefined,
      leaseUntil: undefined,
      fencingToken: 0,
      requestStartedAt: undefined,
      pollAfter: undefined,
      createdAt: now,
      updatedAt: now,
      completedAt: undefined,
    };
    await db.tasks.add(retryTask);
    await db.turns.update(turn.id, {
      taskIds: [...turn.taskIds, retryTask.localTaskId],
    });
    return retryTask;
  });
}
