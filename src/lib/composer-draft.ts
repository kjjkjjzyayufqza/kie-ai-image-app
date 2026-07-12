import { z } from "zod";

import type {
  AspectRatio,
  GenerationMode,
  ImageResolution,
  ReferenceUpload,
} from "@/lib/domain";
import { aspectRatios, resolutions } from "@/lib/model-registry";
import { isRenderableKieUrl } from "@/lib/kie-urls";

const STORAGE_PREFIX = "kie-ai-workspace.composer-draft.v1:";

const referenceUploadSchema = z
  .object({
    id: z.string().min(1),
    keyFingerprint: z.string(),
    displayName: z.string(),
    mimeType: z.string(),
    size: z.number().nonnegative(),
    temporaryUrl: z.string().max(2_048).refine(isRenderableKieUrl),
    status: z.enum(["ready", "expiring", "expired", "load-error"]),
    expiresAt: z.number(),
    createdAt: z.number(),
  })
  .strict();

const composerDraftSchema = z
  .object({
    mode: z.enum(["text-to-image", "image-to-image"]),
    prompt: z.string().max(20_000),
    aspectRatio: z.enum(aspectRatios),
    resolution: z.enum(resolutions),
    countText: z.string().max(3),
    referenceUploads: z.array(referenceUploadSchema).max(16),
  })
  .strict();

export interface ComposerDraft {
  mode: GenerationMode;
  prompt: string;
  aspectRatio: AspectRatio;
  resolution: ImageResolution;
  countText: string;
  referenceUploads: ReferenceUpload[];
}

function storageKey(roomId: string): string {
  return `${STORAGE_PREFIX}${roomId}`;
}

export function loadComposerDraft(roomId: string): ComposerDraft | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(storageKey(roomId));
    if (!raw) return undefined;
    const parsed = composerDraftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function saveComposerDraft(
  roomId: string,
  draft: ComposerDraft,
): void {
  if (typeof window === "undefined") return;
  const parsed = composerDraftSchema.safeParse(draft);
  if (!parsed.success) return;
  try {
    window.localStorage.setItem(storageKey(roomId), JSON.stringify(parsed.data));
  } catch {
    // A full or unavailable storage area must not break the composer.
  }
}

export function clearComposerDrafts(): void {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // An unavailable storage area must not prevent IndexedDB cleanup.
  }
}
