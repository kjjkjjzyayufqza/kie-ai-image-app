import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  createRoom,
  clearWorkspaceData,
  retryGenerationTask,
  submitGenerationBatch,
} from "@/lib/workspace-service";

describe("submitGenerationBatch", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    window.localStorage.clear();
    await db.delete();
  });

  it("creates seven ordered independent placeholders in one turn", async () => {
    const room = await createRoom();
    const turn = await submitGenerationBatch({
      roomId: room.id,
      keyFingerprint: "fingerprint-a",
      count: 7,
      referenceUploads: [],
      request: {
        model: "gpt-image-2-text-to-image",
        mode: "text-to-image",
        prompt: "Seven variations of a glass sculpture",
        aspectRatio: "1:1",
        resolution: "1K",
        inputUrls: [],
      },
    });
    const tasks = await db.tasks.where("turnId").equals(turn.id).sortBy("batchIndex");

    expect(tasks).toHaveLength(7);
    expect(tasks.map((task) => task.batchIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(tasks.every((task) => task.status === "queued")).toBe(true);
    expect(new Set(tasks.map((task) => task.localTaskId)).size).toBe(7);
  });

  it("keeps prompts isolated between rooms", async () => {
    const firstRoom = await createRoom("First");
    const secondRoom = await createRoom("Second");
    await submitGenerationBatch({
      roomId: firstRoom.id,
      keyFingerprint: "fingerprint-a",
      count: 1,
      referenceUploads: [],
      request: {
        model: "gpt-image-2-text-to-image",
        mode: "text-to-image",
        prompt: "Only in the first room",
        aspectRatio: "auto",
        resolution: "1K",
        inputUrls: [],
      },
    });

    expect(await db.turns.where("roomId").equals(secondRoom.id).count()).toBe(0);
  });

  it("retries an unknown submission as a new immutable local task", async () => {
    const room = await createRoom();
    const turn = await submitGenerationBatch({
      roomId: room.id,
      keyFingerprint: "fingerprint-a",
      count: 1,
      referenceUploads: [],
      request: {
        model: "gpt-image-2-text-to-image",
        mode: "text-to-image",
        prompt: "Retry contract",
        aspectRatio: "auto",
        resolution: "1K",
        inputUrls: [],
      },
    });
    const original = (await db.tasks.where("turnId").equals(turn.id).first())!;
    await db.tasks.update(original.localTaskId, { status: "unknown" });

    const retry = await retryGenerationTask(
      original.localTaskId,
      "fingerprint-a",
    );

    expect(retry.localTaskId).not.toBe(original.localTaskId);
    expect(retry.retryOfLocalTaskId).toBe(original.localTaskId);
    expect(retry.status).toBe("queued");
    expect((await db.tasks.get(original.localTaskId))?.status).toBe("unknown");
  });

  it("removes persisted composer drafts when clearing workspace data", async () => {
    const room = await createRoom();
    window.localStorage.setItem(
      `kie-ai-workspace.composer-draft.v1:${room.id}`,
      "persisted-draft",
    );
    window.localStorage.setItem("unrelated-setting", "keep");

    await clearWorkspaceData();

    expect(
      window.localStorage.getItem(
        `kie-ai-workspace.composer-draft.v1:${room.id}`,
      ),
    ).toBeNull();
    expect(window.localStorage.getItem("unrelated-setting")).toBe("keep");
    expect(await db.rooms.count()).toBe(0);
  });
});
