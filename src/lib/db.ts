import Dexie, { type EntityTable } from "dexie";

import type {
  AccountSnapshot,
  Asset,
  AssetChunkRecord,
  AssetCollection,
  CanvasGraph,
  CoordinatorLease,
  GenerationTask,
  ReferenceUpload,
  Room,
  Turn,
} from "@/lib/domain";
import { t } from "@/i18n/runtime";

class KieWorkspaceDatabase extends Dexie {
  rooms!: EntityTable<Room, "id">;
  turns!: EntityTable<Turn, "id">;
  tasks!: EntityTable<GenerationTask, "localTaskId">;
  assets!: EntityTable<Asset, "id">;
  referenceUploads!: EntityTable<ReferenceUpload, "id">;
  accountSnapshots!: EntityTable<AccountSnapshot, "id">;
  coordinatorLeases!: EntityTable<CoordinatorLease, "id">;
  collections!: EntityTable<AssetCollection, "id">;
  assetChunks!: EntityTable<AssetChunkRecord, "id">;
  canvasGraphs!: EntityTable<CanvasGraph, "roomId">;

  constructor() {
    super("kie-ai-image-workspace");

    this.version(1).stores({
      rooms: "id, updatedAt, deletedAt",
      turns: "id, roomId, createdAt, [roomId+createdAt]",
      tasks:
        "localTaskId, remoteTaskId, roomId, turnId, batchId, batchIndex, status, keyFingerprint, createdAt, updatedAt, pollAfter, [roomId+createdAt], [batchId+batchIndex]",
      assets:
        "id, localTaskId, roomId, [localTaskId+outputOrdinal], createdAt, favorite, availability, *tags, *collectionIds",
      referenceUploads:
        "id, keyFingerprint, status, expiresAt, createdAt",
      accountSnapshots: "id, keyFingerprint, checkedAt",
      coordinatorLeases: "id, leaseUntil",
      collections: "id, &name, createdAt",
    });

    this.version(2).stores({
      tasks:
        "localTaskId, remoteTaskId, roomId, turnId, batchId, batchIndex, status, keyFingerprint, createdAt, updatedAt, pollAfter, [roomId+createdAt], [batchId+batchIndex]",
    });

    this.version(3).stores({
      collections: "id, &name, createdAt",
    });

    this.version(4).stores({
      assetChunks: "id, assetId, chunkIndex, [assetId+chunkIndex]",
      canvasGraphs: "roomId, updatedAt",
    });
  }
}

export const db = new KieWorkspaceDatabase();

export async function createInitialRoom(): Promise<Room> {
  const existingRoom = await db.rooms.orderBy("updatedAt").last();
  if (existingRoom && !existingRoom.deletedAt) {
    return existingRoom;
  }

  const now = Date.now();
  const room: Room = {
    id: crypto.randomUUID(),
    title: t("rooms.defaultTitle"),
    createdAt: now,
    updatedAt: now,
  };
  await db.rooms.add(room);
  return room;
}
