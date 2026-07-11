export const TASK_STATES = [
  "queued",
  "submitting",
  "waiting",
  "queuing",
  "generating",
  "success",
  "fail",
  "stale",
  "unknown",
  "canceled-local",
] as const;

export type TaskStatus = (typeof TASK_STATES)[number];
export type GenerationMode = "text-to-image" | "image-to-image";
export type ImageResolution = "1K" | "2K" | "4K";
export type AspectRatio =
  | "auto"
  | "1:1"
  | "3:2"
  | "2:3"
  | "4:3"
  | "3:4"
  | "16:9"
  | "9:16"
  | "2:1"
  | "1:2"
  | "3:1"
  | "1:3"
  | "21:9"
  | "9:21"
  | "5:4"
  | "4:5";

export interface GenerationRequest {
  model: "gpt-image-2-text-to-image" | "gpt-image-2-image-to-image";
  mode: GenerationMode;
  prompt: string;
  aspectRatio: AspectRatio;
  resolution: ImageResolution;
  inputUrls: string[];
}

export interface Room {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Turn {
  id: string;
  roomId: string;
  prompt: string;
  mode: GenerationMode;
  model: GenerationRequest["model"];
  parameters: Pick<GenerationRequest, "aspectRatio" | "resolution">;
  referenceUploadIds: string[];
  taskIds: string[];
  createdAt: number;
}

export interface GenerationTask {
  localTaskId: string;
  remoteTaskId?: string;
  retryOfLocalTaskId?: string;
  keyFingerprint: string;
  roomId: string;
  turnId: string;
  batchId: string;
  batchIndex: number;
  model: GenerationRequest["model"];
  requestSnapshot: GenerationRequest;
  status: TaskStatus;
  failureCode?: string;
  failureMessage?: string;
  creditsConsumed?: number;
  submissionAttemptId?: string;
  leaseOwner?: string;
  leaseUntil?: number;
  fencingToken: number;
  requestStartedAt?: number;
  pollAfter?: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export type AssetAvailability =
  | "unchecked"
  | "available"
  | "load-error"
  | "unavailable";

export interface Asset {
  id: string;
  localTaskId: string;
  roomId: string;
  outputOrdinal: number;
  url: string;
  isRenderable: boolean;
  availability: AssetAvailability;
  favorite: boolean;
  tags: string[];
  collectionIds: string[];
  width?: number;
  height?: number;
  createdAt: number;
  lastCheckedAt?: number;
}

export interface ReferenceUpload {
  id: string;
  keyFingerprint: string;
  displayName: string;
  mimeType: string;
  size: number;
  temporaryUrl: string;
  status: "ready" | "expiring" | "expired" | "load-error";
  expiresAt: number;
  createdAt: number;
}

export interface AccountSnapshot {
  id: string;
  keyFingerprint: string;
  credits: number;
  latencyMs: number;
  checkedAt: number;
}

export interface CoordinatorLease {
  id: "queue-leader";
  ownerId: string;
  leaseUntil: number;
  fencingToken: number;
}

export interface AssetCollection {
  id: string;
  name: string;
  createdAt: number;
}

export interface KieTaskResult {
  remoteTaskId: string;
  state: Extract<TaskStatus, "waiting" | "queuing" | "generating" | "success" | "fail">;
  resultUrls: Array<{ url: string; isRenderable: boolean }>;
  failCode?: string;
  failMessage?: string;
  creditsConsumed?: number;
  completedAt?: number;
}
