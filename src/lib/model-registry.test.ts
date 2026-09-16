import { describe, expect, it } from "vitest";

import {
  FALLBACK_IMAGE_COST_LIST,
  FALLBACK_IMAGE_MODELS,
  parseKieCatalog,
  resolveImageCatalog,
} from "@/lib/image-catalog";
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

  it("sends the selected non-GPT catalog model id without rewriting it", () => {
    const payload = toKieCreatePayload({
      model: "flux-2/pro-text-to-image",
      mode: "text-to-image",
      prompt: "A granite kitchen counter in morning light",
      aspectRatio: "1:1",
      resolution: "1K",
      inputUrls: [],
    });

    expect(payload.model).toBe("flux-2/pro-text-to-image");
    expect(payload.model).not.toContain("gpt-image-2");
    expect(payload.input).toMatchObject({
      prompt: "A granite kitchen counter in morning light",
      aspect_ratio: "1:1",
      resolution: "1K",
    });
  });

  it("maps nano-banana-2 image-to-image onto image_input", () => {
    const payload = toKieCreatePayload({
      model: "nano-banana-2",
      mode: "image-to-image",
      prompt: "Keep the product, change the backdrop",
      aspectRatio: "1:1",
      resolution: "1K",
      inputUrls: ["https://tempfile.redpandaai.co/reference.png"],
    });

    expect(payload).toEqual({
      model: "nano-banana-2",
      input: {
        prompt: "Keep the product, change the backdrop",
        aspect_ratio: "1:1",
        resolution: "1K",
        image_input: ["https://tempfile.redpandaai.co/reference.png"],
      },
    });
  });

  it("rejects an illegal model id instead of substituting GPT Image 2", () => {
    const result = generationRequestSchema.safeParse({
      model: "not-a-kie-image-model",
      mode: "text-to-image",
      prompt: "Should fail",
      aspectRatio: "1:1",
      resolution: "1K",
      inputUrls: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "model")).toBe(
        true,
      );
    }
  });

  it("rejects a missing model id instead of substituting GPT Image 2", () => {
    const result = generationRequestSchema.safeParse({
      mode: "text-to-image",
      prompt: "Should fail",
      aspectRatio: "1:1",
      resolution: "1K",
      inputUrls: [],
    });

    expect(result.success).toBe(false);
  });
});

describe("image catalog merge", () => {
  it("uses live Kie models and costs when the response is valid", () => {
    const catalog = parseKieCatalog({
      code: 200,
      data: {
        models: [
          {
            model: "flux-2/pro-text-to-image",
            category: "image",
            credits: { "1K": 5, "2K": 9, "4K": 9 },
          },
          {
            id: "nano-banana-2",
            type: "image",
            price: 8,
          },
        ],
      },
    });

    expect(catalog?.source).toBe("live");
    const flux = catalog?.models.find(
      (model) => model.id === "flux-2/pro-text-to-image",
    );
    const banana = catalog?.models.find((model) => model.id === "nano-banana-2");
    expect(flux?.credits["1K"]).toBe(5);
    expect(flux?.credits["2K"]).toBe(9);
    expect(banana?.credits["1K"]).toBe(8);
    expect(catalog?.costs["flux-2/pro-text-to-image"]["1K"]).toBe(5);
    expect(catalog?.costs["nano-banana-2"]["1K"]).toBe(8);
  });

  it("falls back to the maintained model list and cost list", () => {
    const catalog = resolveImageCatalog(null);
    expect(catalog.source).toBe("fallback");
    expect(catalog.models.map((model) => model.id)).toEqual(
      FALLBACK_IMAGE_MODELS.map((model) => model.id),
    );
    expect(catalog.costs["gpt-image-2-text-to-image"]).toEqual(
      FALLBACK_IMAGE_COST_LIST["gpt-image-2-text-to-image"],
    );
    expect(catalog.costs["gpt-image-2-text-to-image"]["1K"]).toBe(6);
    expect(catalog.costs["gpt-image-2-text-to-image"]["2K"]).toBe(10);
    expect(catalog.costs["gpt-image-2-text-to-image"]["4K"]).toBe(16);
  });

  it("treats an unusable live payload as fallback", () => {
    const catalog = resolveImageCatalog({ code: 500, msg: "nope" });
    expect(catalog.source).toBe("fallback");
    expect(catalog.models.length).toBeGreaterThan(0);
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
