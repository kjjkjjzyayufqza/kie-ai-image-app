export const LOSSLESS_CODEC = "gzip" as const;
export const DEFAULT_CHUNK_SIZE = 64 * 1024;

export interface CompressedChunks {
  codec: typeof LOSSLESS_CODEC;
  originalByteLength: number;
  chunks: Uint8Array[];
}

export function splitIntoChunks(
  bytes: Uint8Array,
  chunkSize = DEFAULT_CHUNK_SIZE,
): Uint8Array[] {
  if (chunkSize <= 0) {
    throw new Error("Chunk size must be a positive integer.");
  }
  if (bytes.byteLength === 0) {
    return [new Uint8Array()];
  }
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(bytes.slice(offset, offset + chunkSize));
  }
  return chunks;
}

export function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function transformThrough(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Uint8Array(
    await new Response(
      readable.pipeThrough(
        stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
      ),
    ).arrayBuffer(),
  );
}

export async function gzipCompress(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") {
    throw new Error("Lossless gzip compression is not available.");
  }
  return transformThrough(bytes, new CompressionStream("gzip"));
}

export async function gzipDecompress(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Lossless gzip decompression is not available.");
  }
  return transformThrough(bytes, new DecompressionStream("gzip"));
}

export async function compressIntoChunks(
  bytes: Uint8Array,
  chunkSize = DEFAULT_CHUNK_SIZE,
): Promise<CompressedChunks> {
  const compressed = await gzipCompress(bytes);
  return {
    codec: LOSSLESS_CODEC,
    originalByteLength: bytes.byteLength,
    chunks: splitIntoChunks(compressed, chunkSize),
  };
}

export async function decompressChunks(
  packed: CompressedChunks,
): Promise<Uint8Array> {
  if (packed.codec !== LOSSLESS_CODEC) {
    throw new Error(`Unsupported lossless codec: ${packed.codec}`);
  }
  const restored = await gzipDecompress(concatChunks(packed.chunks));
  if (restored.byteLength !== packed.originalByteLength) {
    throw new Error("Decompressed size does not match the original byte length.");
  }
  return restored;
}

export function detectImageMime(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  throw new Error("Unsupported image bytes. Expected JPEG, PNG, WEBP, or GIF.");
}
