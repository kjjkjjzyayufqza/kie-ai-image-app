import { z } from "zod";

import type { GenerationRequest, ImageResolution } from "@/lib/domain";
import {
  FALLBACK_IMAGE_MODELS,
  MODEL_ID_PATTERN,
  estimateModelCredits,
  resolveModelContract,
  type ImageModelDefinition,
} from "@/lib/image-catalog";
import { aspectRatios, resolutions } from "@/lib/model-ids";

export { aspectRatios, resolutions };

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

export function estimateCreditsForModel(
  modelId: string,
  resolution: ImageResolution,
  count = 1,
): number {
  return estimateModelCredits(modelId, resolution, count);
}

const unsupportedHighResolutionRatios = new Set([
  "5:4",
  "4:5",
  "3:1",
  "1:3",
  "9:21",
]);

const UNKNOWN_MODEL_MESSAGE = "Unknown or unsupported image model.";
const MODEL_MODE_MISMATCH_MESSAGE = "Model and generation mode do not match.";

export const generationRequestSchema = z
  .object({
    model: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(MODEL_ID_PATTERN, UNKNOWN_MODEL_MESSAGE),
    mode: z.enum(["text-to-image", "image-to-image"]),
    prompt: z.string().trim().min(1).max(20_000),
    aspectRatio: z.enum(aspectRatios),
    resolution: z.enum(resolutions),
    inputUrls: z.array(z.string().url().max(2_048)).max(16),
  })
  .strict()
  .superRefine((input, context) => {
    const contract = resolveModelContract(input.model);
    if (!contract) {
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: UNKNOWN_MODEL_MESSAGE,
      });
      return;
    }

    const modeMatches =
      contract.mode === "both" || contract.mode === input.mode;
    if (!modeMatches) {
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: MODEL_MODE_MISMATCH_MESSAGE,
      });
    }

    const expectsImageInput = input.mode === "image-to-image";
    if (expectsImageInput && !contract.imageField) {
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: MODEL_MODE_MISMATCH_MESSAGE,
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
      if (contract.mode !== "both") {
        context.addIssue({
          code: "custom",
          path: ["inputUrls"],
          message: "Text-to-image does not accept reference images.",
        });
      }
    }

    if (
      contract.supportedAspectRatios.length > 0 &&
      !contract.supportedAspectRatios.includes(input.aspectRatio)
    ) {
      context.addIssue({
        code: "custom",
        path: ["aspectRatio"],
        message: `${input.aspectRatio} is not supported by ${contract.id}.`,
      });
    }

    if (
      contract.resolutionField === "resolution" &&
      !contract.supportedResolutions.includes(input.resolution)
    ) {
      context.addIssue({
        code: "custom",
        path: ["resolution"],
        message: `${input.resolution} is not supported by ${contract.id}.`,
      });
    }

    if (
      input.model.startsWith("gpt-image-2") &&
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

function requireContract(modelId: string): ImageModelDefinition {
  const contract = resolveModelContract(modelId);
  if (!contract) {
    throw new Error(UNKNOWN_MODEL_MESSAGE);
  }
  return contract;
}

export function toKieCreatePayload(input: GenerationRequest) {
  const validated = generationRequestSchema.parse(input);
  const contract = requireContract(validated.model);
  const payloadInput: Record<string, unknown> = {
    prompt: validated.prompt,
  };

  if (contract.supportedAspectRatios.includes(validated.aspectRatio)) {
    payloadInput.aspect_ratio = validated.aspectRatio;
  }

  if (contract.resolutionField === "resolution") {
    payloadInput.resolution = validated.resolution;
  } else if (contract.resolutionField === "quality") {
    payloadInput.quality =
      contract.qualityMap?.[validated.resolution] ??
      (validated.resolution === "1K" ? "basic" : "high");
  }

  if (validated.mode === "image-to-image") {
    const field = contract.imageField;
    if (!field) {
      throw new Error(MODEL_MODE_MISMATCH_MESSAGE);
    }
    if (field === "image_url") {
      if (validated.inputUrls.length !== 1) {
        throw new Error("This model requires exactly one reference image.");
      }
      payloadInput.image_url = validated.inputUrls[0];
    } else {
      payloadInput[field] = validated.inputUrls;
    }
  }

  return {
    model: validated.model,
    input: payloadInput,
  };
}

export const modelOptions = FALLBACK_IMAGE_MODELS.map((model) => ({
  id: model.id,
  label: model.label,
  mode: model.mode,
}));
