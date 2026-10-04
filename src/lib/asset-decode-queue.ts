import {
  decompressChunks,
  type CompressedChunks,
} from "@/lib/lossless-chunks";

const LOAD_CONCURRENCY = 2;

const loadQueue: Array<() => void> = [];
let activeLoads = 0;
let flushScheduled = false;

function drainAssetLoads(): void {
  while (activeLoads < LOAD_CONCURRENCY && loadQueue.length > 0) {
    const next = loadQueue.pop();
    if (!next) break;
    activeLoads += 1;
    next();
  }
}

export function scheduleAssetLoad<T>(work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    loadQueue.push(() => {
      void Promise.resolve()
        .then(work)
        .then(resolve, reject)
        .finally(() => {
          activeLoads -= 1;
          drainAssetLoads();
        });
    });
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(() => {
      flushScheduled = false;
      drainAssetLoads();
    });
  });
}

interface WorkerResponse {
  id: number;
  buffer?: ArrayBuffer;
  error?: string;
}

let worker: Worker | undefined;
let nextRequestId = 1;
const pendingDecodes = new Map<
  number,
  { resolve: (bytes: Uint8Array) => void; reject: (error: Error) => void }
>();

function takeWorker(): Worker | undefined {
  if (typeof process !== "undefined" && process.env.VITEST === "true") {
    return undefined;
  }
  if (typeof Worker !== "function") return undefined;
  if (worker) return worker;
  try {
    worker = new Worker(
      new URL("../workers/gzip-decode.worker.ts", import.meta.url),
    );
  } catch {
    worker = undefined;
    return undefined;
  }
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const waiting = pendingDecodes.get(event.data.id);
    if (!waiting) return;
    pendingDecodes.delete(event.data.id);
    if (event.data.buffer) {
      waiting.resolve(new Uint8Array(event.data.buffer));
      return;
    }
    waiting.reject(new Error(event.data.error ?? "Decode failed"));
  };
  worker.onerror = () => {
    for (const waiting of pendingDecodes.values()) {
      waiting.reject(new Error("Image decode worker failed."));
    }
    pendingDecodes.clear();
    worker?.terminate();
    worker = undefined;
  };
  return worker;
}

export async function decompressOffThread(
  packed: CompressedChunks,
): Promise<Uint8Array> {
  const activeWorker = takeWorker();
  if (!activeWorker) return decompressChunks(packed);

  const id = nextRequestId;
  nextRequestId += 1;
  try {
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      pendingDecodes.set(id, { resolve, reject });
      const chunks = packed.chunks.map((chunk) => {
        const copy = new ArrayBuffer(chunk.byteLength);
        new Uint8Array(copy).set(chunk);
        return copy;
      });
      activeWorker.postMessage({
        id,
        codec: packed.codec,
        originalByteLength: packed.originalByteLength,
        chunks,
      });
    });
    return bytes;
  } catch {
    pendingDecodes.delete(id);
    return decompressChunks(packed);
  }
}
