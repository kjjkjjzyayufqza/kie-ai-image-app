import { gunzipSync, gzipSync } from "node:zlib";

import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

process.env.APP_ORIGIN = "http://localhost:3000";

function makeIdentityGzipStream(compress: boolean) {
  const collected: Uint8Array[] = [];
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk) {
      collected.push(chunk);
    },
    flush(controller) {
      const total = collected.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const input = new Uint8Array(total);
      let offset = 0;
      for (const chunk of collected) {
        input.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const output = compress ? gzipSync(input) : gunzipSync(input);
      controller.enqueue(new Uint8Array(output));
    },
  });
}

if (typeof globalThis.CompressionStream === "undefined") {
  globalThis.CompressionStream = class CompressionStream {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    constructor(format: string) {
      if (format !== "gzip") throw new TypeError(`Unsupported format: ${format}`);
      const stream = makeIdentityGzipStream(true);
      this.readable = stream.readable;
      this.writable = stream.writable;
    }
  } as typeof CompressionStream;
}

if (typeof globalThis.DecompressionStream === "undefined") {
  globalThis.DecompressionStream = class DecompressionStream {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    constructor(format: string) {
      if (format !== "gzip") throw new TypeError(`Unsupported format: ${format}`);
      const stream = makeIdentityGzipStream(false);
      this.readable = stream.readable;
      this.writable = stream.writable;
    }
  } as typeof DecompressionStream;
}
