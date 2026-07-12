import { z } from "zod";

import type { GenerationRequest, ImageResolution } from "@/lib/domain";

export const aspectRatios = [
  "auto",
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "2:1",
  "1:2",
  "3:1",
  "1:3",
  "21:9",
  "9:21",
  "5:4",
  "4:5",
] as const;

export const resolutions = ["1K", "2K", "4K"] as const;

// Kie has no public pricing API. These values mirror its published GPT Image 2
// pricing checked on 2026-07-11 (1 USD = 200 credits); task records remain
// the source of truth.
export const gptImage2CreditsPerImage: Record<ImageResolution, number> = {
  "1K": 6,
  "2K": 10,
  "4K": 16,
};

export function estimateGptImage2Credits(
  resolution: ImageResolution,
  count = 1,
): number {
  return gptImage2CreditsPerImage[resolution] * count;
}

const unsupportedHighResolutionRatios = new Set([
  "5:4",
  "4:5",
  "3:1",
  "1:3",
  "9:21",
]);

export const generationRequestSchema = z
  .object({
    model: z.enum([
      "gpt-image-2-text-to-image",
      "gpt-image-2-image-to-image",
    ]),
    mode: z.enum(["text-to-image", "image-to-image"]),
    prompt: z.string().trim().min(1).max(20_000),
    aspectRatio: z.enum(aspectRatios),
    resolution: z.enum(resolutions),
    inputUrls: z.array(z.string().url().max(2_048)).max(16),
  })
  .strict()
  .superRefine((input, context) => {
    const expectsImageInput = input.mode === "image-to-image";
    const modelMatchesMode = expectsImageInput
      ? input.model === "gpt-image-2-image-to-image"
      : input.model === "gpt-image-2-text-to-image";

    if (!modelMatchesMode) {
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: "Model and generation mode do not match.",
      });
    }

    if (expectsImageInput && input.inputUrls.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["inputUrls"],
        message: "Image-to-image requires at least one reference image.",
      });
    }

    if (!expectsImageInput && input.inputUrls.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["inputUrls"],
        message: "Text-to-image does not accept reference images.",
      });
    }

    if (
      input.resolution !== "1K" &&
      unsupportedHighResolutionRatios.has(input.aspectRatio)
    ) {
      context.addIssue({
        code: "custom",
        path: ["aspectRatio"],
        message: `${input.aspectRatio} is only available at 1K.`,
      });
    }
  });

export const batchCountSchema = z.number().int().min(1).max(100);

export function toKieCreatePayload(input: GenerationRequest) {
  const validated = generationRequestSchema.parse(input);

  return {
    model: validated.model,
    input: {
      prompt: validated.prompt,
      aspect_ratio: validated.aspectRatio,
      resolution: validated.resolution,
      ...(validated.mode === "image-to-image"
        ? { input_urls: validated.inputUrls }
        : {}),
    },
  };
}

export const modelOptions = [
  {
    id: "gpt-image-2-text-to-image" as const,
    label: "GPT Image 2",
    mode: "text-to-image" as const,
  },
  {
    id: "gpt-image-2-image-to-image" as const,
    label: "GPT Image 2 Edit",
    mode: "image-to-image" as const,
  },
];
