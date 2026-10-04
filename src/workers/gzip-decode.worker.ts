/// <reference lib="webworker" />

import { decompressChunks } from "../lib/lossless-chunks";

interface DecodeRequest {
  id: number;
  codec: "gzip";
  originalByteLength: number;
  chunks: ArrayBuffer[];
}

self.onmessage = (event: MessageEvent<DecodeRequest>) => {
  const { id, codec, originalByteLength, chunks } = event.data;
  void decompressChunks({
    codec,
    originalByteLength,
    chunks: chunks.map((chunk) => new Uint8Array(chunk)),
  })
    .then((bytes) => {
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      self.postMessage({ id, buffer }, [buffer]);
    })
    .catch((error: unknown) => {
      self.postMessage({
        id,
        error: error instanceof Error ? error.message : "Decode failed",
      });
    });
};
