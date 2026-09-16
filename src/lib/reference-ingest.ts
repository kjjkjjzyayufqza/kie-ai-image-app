import { uploadReferenceImage } from "@/lib/kie-client";
import type { ReferenceUpload } from "@/lib/domain";
import {
  placeReferencesOnCanvas,
  storeReferenceUpload,
} from "@/lib/workspace-service";

export interface FileIdentity {
  name: string;
  size: number;
  type: string;
}

export interface IngestReferenceFilesInput {
  files: File[];
  apiKey: string;
  keyFingerprint: string;
  roomId: string;
  placeOnCanvas: boolean;
  origin?: { x: number; y: number };
}

export interface IngestReferenceDeps {
  uploadFile: (
    apiKey: string,
    keyFingerprint: string,
    file: File,
  ) => Promise<ReferenceUpload>;
  storeUpload: (upload: ReferenceUpload) => Promise<void>;
  placeOnCanvas: (
    roomId: string,
    uploads: Array<{
      id: string;
      temporaryUrl: string;
      displayName: string;
    }>,
    origin?: { x: number; y: number },
  ) => Promise<void>;
}

const defaultDeps: IngestReferenceDeps = {
  uploadFile: uploadReferenceImage,
  storeUpload: storeReferenceUpload,
  placeOnCanvas: placeReferencesOnCanvas,
};

const inflight = new Map<string, Promise<ReferenceUpload[]>>();
const completed = new Map<string, ReferenceUpload[]>();

export function referenceIngestKey(
  roomId: string,
  files: FileIdentity[],
): string {
  return `${roomId}::${files
    .map((file) => `${file.name}:${file.size}:${file.type}`)
    .join("|")}`;
}

export function resetReferenceIngestForTests(): void {
  inflight.clear();
  completed.clear();
}

export async function ingestReferenceFiles(
  input: IngestReferenceFilesInput,
  deps: IngestReferenceDeps = defaultDeps,
): Promise<ReferenceUpload[]> {
  if (input.files.length === 0) return [];
  const key = referenceIngestKey(input.roomId, input.files);
  const already = completed.get(key);
  if (already) return already;
  const pending = inflight.get(key);
  if (pending) return pending;

  const run = (async () => {
    const uploaded: ReferenceUpload[] = [];
    for (const file of input.files) {
      const result = await deps.uploadFile(
        input.apiKey,
        input.keyFingerprint,
        file,
      );
      await deps.storeUpload(result);
      uploaded.push(result);
    }
    if (input.placeOnCanvas) {
      await deps.placeOnCanvas(input.roomId, uploaded, input.origin);
    }
    completed.set(key, uploaded);
    return uploaded;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, run);
  return run;
}
