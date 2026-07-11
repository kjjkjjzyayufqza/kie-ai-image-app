import { describe, expect, it } from "vitest";

import {
  batchCountSchema,
  generationRequestSchema,
  toKieCreatePayload,
} from "@/lib/model-registry";

describe("generationRequestSchema", () => {
  it("accepts the current GPT Image 2 image-to-image contract", () => {
    const result = generationRequestSchema.parse({
      model: "gpt-image-2-image-to-image",
      mode: "image-to-image",
      prompt: "Preserve the subject and replace the background.",
      aspectRatio: "16:9",
      resolution: "4K",
      inputUrls: ["https://tempfile.redpandaai.co/reference.png"],
    });

    expect(result.mode).toBe("image-to-image");
  });

  it("rejects unsupported high-resolution aspect ratios", () => {
    const result = generationRequestSchema.safeParse({
      model: "gpt-image-2-text-to-image",
      mode: "text-to-image",
      prompt: "Poster",
      aspectRatio: "5:4",
      resolution: "2K",
      inputUrls: [],
    });

    expect(result.success).toBe(false);
  });

  it("maps normalized input to the Kie payload without undocumented fields", () => {
    const payload = toKieCreatePayload({
      model: "gpt-image-2-text-to-image",
      mode: "text-to-image",
      prompt: "A clean product photograph",
      aspectRatio: "1:1",
      resolution: "2K",
      inputUrls: [],
    });

    expect(payload).toEqual({
      model: "gpt-image-2-text-to-image",
      input: {
        prompt: "A clean product photograph",
        aspect_ratio: "1:1",
        resolution: "2K",
      },
    });
  });
});

describe("batchCountSchema", () => {
  it.each([1, 5, 7, 37, 100])("accepts %ix", (count) => {
    expect(batchCountSchema.parse(count)).toBe(count);
  });

  it.each([0, 1.5, 101])("rejects %s", (count) => {
    expect(batchCountSchema.safeParse(count).success).toBe(false);
  });
});
