import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReferenceUpload } from "@/lib/domain";
import {
  ingestReferenceFiles,
  resetReferenceIngestForTests,
} from "@/lib/reference-ingest";

function fakeFile(name: string, lastModified = 1): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, {
    type: "image/png",
    lastModified,
  });
}

function fakeUpload(id: string): ReferenceUpload {
  return {
    id,
    keyFingerprint: "fp",
    displayName: id,
    mimeType: "image/png",
    size: 4,
    temporaryUrl: `https://tempfile.redpandaai.co/${id}.png`,
    status: "ready",
    expiresAt: Date.now() + 60_000,
    createdAt: Date.now(),
  };
}

describe("ingestReferenceFiles", () => {
  beforeEach(() => {
    resetReferenceIngestForTests();
  });

  afterEach(() => {
    resetReferenceIngestForTests();
  });

  it("uploads and places each file once when invoked twice with the same list", async () => {
    const uploadFile = vi.fn(async () => fakeUpload("upload-1"));
    const storeUpload = vi.fn(async () => undefined);
    const placeOnCanvas = vi.fn(async () => undefined);
    const files = [fakeFile("reference.png")];
    const input = {
      files,
      apiKey: "key",
      keyFingerprint: "fp",
      roomId: "room-1",
      placeOnCanvas: true,
      origin: { x: 8, y: 12 },
    };
    const deps = { uploadFile, storeUpload, placeOnCanvas };

    const [first, second] = await Promise.all([
      ingestReferenceFiles(input, deps),
      ingestReferenceFiles(input, deps),
    ]);

    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(storeUpload).toHaveBeenCalledTimes(1);
    expect(placeOnCanvas).toHaveBeenCalledTimes(1);
    expect(placeOnCanvas).toHaveBeenCalledWith(
      "room-1",
      [
        expect.objectContaining({
          id: "upload-1",
          temporaryUrl: "https://tempfile.redpandaai.co/upload-1.png",
        }),
      ],
      { x: 8, y: 12 },
    );
    expect(first).toEqual(second);
    expect(first).toHaveLength(1);

    const third = await ingestReferenceFiles(input, deps);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(placeOnCanvas).toHaveBeenCalledTimes(1);
    expect(third).toHaveLength(1);
  });
});
