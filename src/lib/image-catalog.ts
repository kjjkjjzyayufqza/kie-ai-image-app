import type {
  AspectRatio,
  GenerationMode,
  ImageResolution,
} from "@/lib/domain";
import { aspectRatios } from "@/lib/model-ids";

export const MODEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,126}$/;

export type ImageInputField =
  | "input_urls"
  | "image_input"
  | "image_url"
  | "image_urls"
  | "images";

export type ResolutionField = "resolution" | "quality" | "none";

export interface ImageModelDefinition {
  id: string;
  label: string;
  family: string;
  mode: GenerationMode | "both";
  imageField: ImageInputField | null;
  resolutionField: ResolutionField;
  supportedAspectRatios: readonly AspectRatio[];
  supportedResolutions: readonly ImageResolution[];
  credits: Record<ImageResolution, number>;
  qualityMap?: Partial<Record<ImageResolution, string>>;
}

export interface ImageCatalog {
  models: ImageModelDefinition[];
  costs: Record<string, Record<ImageResolution, number>>;
  source: "live" | "fallback";
}

const GPT_RATIOS = aspectRatios;
const COMMON_RATIOS = [
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
] as const satisfies readonly AspectRatio[];
const GROK_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "16:9",
  "9:16",
] as const satisfies readonly AspectRatio[];
const SEEDREAM_RATIOS = [
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "2:3",
  "3:2",
  "21:9",
] as const satisfies readonly AspectRatio[];
const FLUX_RATIOS = [
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
] as const satisfies readonly AspectRatio[];
const ALL_RESOLUTIONS = ["1K", "2K", "4K"] as const;
const UP_TO_2K = ["1K", "2K"] as const;

function credits(
  oneK: number,
  twoK = oneK,
  fourK = twoK,
): Record<ImageResolution, number> {
  return { "1K": oneK, "2K": twoK, "4K": fourK };
}

function defineModel(
  definition: ImageModelDefinition,
): ImageModelDefinition {
  return definition;
}

/**
 * Maintained fallback catalog for when Kie model/cost discovery fails.
 * Credits are Kie published-or-observed estimates (1 USD ≈ 200 credits).
 */
export const FALLBACK_IMAGE_MODELS: readonly ImageModelDefinition[] = [
  defineModel({
    id: "gpt-image-2-text-to-image",
    label: "GPT Image 2",
    family: "gpt-image",
    mode: "text-to-image",
    imageField: null,
    resolutionField: "resolution",
    supportedAspectRatios: GPT_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(6, 10, 16),
  }),
  defineModel({
    id: "gpt-image-2-image-to-image",
    label: "GPT Image 2 Edit",
    family: "gpt-image",
    mode: "image-to-image",
    imageField: "input_urls",
    resolutionField: "resolution",
    supportedAspectRatios: GPT_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(6, 10, 16),
  }),
  defineModel({
    id: "gpt-image/1.5-text-to-image",
    label: "GPT Image 1.5",
    family: "gpt-image",
    mode: "text-to-image",
    imageField: null,
    resolutionField: "resolution",
    supportedAspectRatios: GPT_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(4, 8, 12),
  }),
  defineModel({
    id: "gpt-image/1.5-image-to-image",
    label: "GPT Image 1.5 Edit",
    family: "gpt-image",
    mode: "image-to-image",
    imageField: "input_urls",
    resolutionField: "resolution",
    supportedAspectRatios: GPT_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(4, 8, 12),
  }),
  defineModel({
    id: "flux-2/pro-text-to-image",
    label: "Flux-2 Pro",
    family: "flux-2",
    mode: "text-to-image",
    imageField: null,
    resolutionField: "resolution",
    supportedAspectRatios: FLUX_RATIOS,
    supportedResolutions: UP_TO_2K,
    credits: credits(5, 8, 8),
  }),
  defineModel({
    id: "flux-2/pro-image-to-image",
    label: "Flux-2 Pro Edit",
    family: "flux-2",
    mode: "image-to-image",
    imageField: "input_urls",
    resolutionField: "resolution",
    supportedAspectRatios: FLUX_RATIOS,
    supportedResolutions: UP_TO_2K,
    credits: credits(5, 8, 8),
  }),
  defineModel({
    id: "flux-2/flex-text-to-image",
    label: "Flux-2 Flex",
    family: "flux-2",
    mode: "text-to-image",
    imageField: null,
    resolutionField: "resolution",
    supportedAspectRatios: FLUX_RATIOS,
    supportedResolutions: UP_TO_2K,
    credits: credits(4, 6, 6),
  }),
  defineModel({
    id: "flux-2/flex-image-to-image",
    label: "Flux-2 Flex Edit",
    family: "flux-2",
    mode: "image-to-image",
    imageField: "input_urls",
    resolutionField: "resolution",
    supportedAspectRatios: FLUX_RATIOS,
    supportedResolutions: UP_TO_2K,
    credits: credits(4, 6, 6),
  }),
  defineModel({
    id: "grok-imagine/text-to-image",
    label: "Grok Imagine",
    family: "grok-imagine",
    mode: "text-to-image",
    imageField: null,
    resolutionField: "none",
    supportedAspectRatios: GROK_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(4),
  }),
  defineModel({
    id: "grok-imagine/image-to-image",
    label: "Grok Imagine Edit",
    family: "grok-imagine",
    mode: "image-to-image",
    imageField: "image_urls",
    resolutionField: "none",
    supportedAspectRatios: GROK_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(4),
  }),
  defineModel({
    id: "seedream/5-pro-text-to-image",
    label: "Seedream 5.0 Pro",
    family: "seedream",
    mode: "text-to-image",
    imageField: null,
    resolutionField: "quality",
    supportedAspectRatios: SEEDREAM_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(7, 10, 10),
    qualityMap: { "1K": "basic", "2K": "high", "4K": "high" },
  }),
  defineModel({
    id: "seedream/5-pro-image-to-image",
    label: "Seedream 5.0 Pro Edit",
    family: "seedream",
    mode: "image-to-image",
    imageField: "image_urls",
    resolutionField: "quality",
    supportedAspectRatios: SEEDREAM_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(7, 10, 10),
    qualityMap: { "1K": "basic", "2K": "high", "4K": "high" },
  }),
  defineModel({
    id: "seedream/5-lite-text-to-image",
    label: "Seedream 5.0 Lite",
    family: "seedream",
    mode: "text-to-image",
    imageField: null,
    resolutionField: "quality",
    supportedAspectRatios: SEEDREAM_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(6, 8, 8),
    qualityMap: { "1K": "basic", "2K": "high", "4K": "high" },
  }),
  defineModel({
    id: "nano-banana-2",
    label: "Nano Banana 2",
    family: "nano-banana",
    mode: "both",
    imageField: "image_input",
    resolutionField: "resolution",
    supportedAspectRatios: GPT_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(6, 8, 12),
  }),
  defineModel({
    id: "google/nano-banana",
    label: "Nano Banana",
    family: "nano-banana",
    mode: "both",
    imageField: "image_input",
    resolutionField: "resolution",
    supportedAspectRatios: COMMON_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(4, 6, 8),
  }),
  defineModel({
    id: "google/imagen4",
    label: "Imagen 4",
    family: "imagen",
    mode: "text-to-image",
    imageField: null,
    resolutionField: "resolution",
    supportedAspectRatios: COMMON_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(4, 6, 8),
  }),
  defineModel({
    id: "google/imagen4-fast",
    label: "Imagen 4 Fast",
    family: "imagen",
    mode: "text-to-image",
    imageField: null,
    resolutionField: "resolution",
    supportedAspectRatios: COMMON_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(2, 3, 4),
  }),
  defineModel({
    id: "google/imagen4-ultra",
    label: "Imagen 4 Ultra",
    family: "imagen",
    mode: "text-to-image",
    imageField: null,
    resolutionField: "resolution",
    supportedAspectRatios: COMMON_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(6, 8, 10),
  }),
  defineModel({
    id: "z-image",
    label: "Z-Image",
    family: "z-image",
    mode: "text-to-image",
    imageField: null,
    resolutionField: "resolution",
    supportedAspectRatios: COMMON_RATIOS,
    supportedResolutions: UP_TO_2K,
    credits: credits(5, 6, 6),
  }),
  defineModel({
    id: "qwen2/text-to-image",
    label: "Qwen2",
    family: "qwen",
    mode: "text-to-image",
    imageField: null,
    resolutionField: "resolution",
    supportedAspectRatios: COMMON_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(6, 8, 10),
  }),
  defineModel({
    id: "qwen2/image-edit",
    label: "Qwen2 Edit",
    family: "qwen",
    mode: "image-to-image",
    imageField: "image_urls",
    resolutionField: "resolution",
    supportedAspectRatios: COMMON_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(6, 8, 10),
  }),
  defineModel({
    id: "qwen3/text-to-image",
    label: "Qwen3",
    family: "qwen",
    mode: "text-to-image",
    imageField: null,
    resolutionField: "resolution",
    supportedAspectRatios: COMMON_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(6, 8, 10),
  }),
  defineModel({
    id: "qwen3/image-to-image",
    label: "Qwen3 Edit",
    family: "qwen",
    mode: "image-to-image",
    imageField: "image_urls",
    resolutionField: "resolution",
    supportedAspectRatios: COMMON_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(6, 8, 10),
  }),
  defineModel({
    id: "ideogram/v3-text-to-image",
    label: "Ideogram V3",
    family: "ideogram",
    mode: "text-to-image",
    imageField: null,
    resolutionField: "resolution",
    supportedAspectRatios: COMMON_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(6, 10, 14),
  }),
  defineModel({
    id: "ideogram/v3-edit",
    label: "Ideogram V3 Edit",
    family: "ideogram",
    mode: "image-to-image",
    imageField: "image_urls",
    resolutionField: "resolution",
    supportedAspectRatios: COMMON_RATIOS,
    supportedResolutions: ALL_RESOLUTIONS,
    credits: credits(6, 10, 14),
  }),
];

export const FALLBACK_IMAGE_COST_LIST: Record<
  string,
  Record<ImageResolution, number>
> = Object.fromEntries(
  FALLBACK_IMAGE_MODELS.map((model) => [model.id, model.credits]),
);

export function fallbackImageCatalog(): ImageCatalog {
  return {
    models: FALLBACK_IMAGE_MODELS.map((model) => ({
      ...model,
      credits: { ...model.credits },
    })),
    costs: structuredClone(FALLBACK_IMAGE_COST_LIST),
    source: "fallback",
  };
}

export function modelsForMode(
  catalog: ImageCatalog,
  mode: GenerationMode,
): ImageModelDefinition[] {
  return catalog.models.filter(
    (model) => model.mode === mode || model.mode === "both",
  );
}

export function estimateModelCredits(
  modelId: string,
  resolution: ImageResolution,
  count = 1,
  catalog: ImageCatalog = fallbackImageCatalog(),
): number {
  const fromCatalog =
    catalog.costs[modelId]?.[resolution] ??
    catalog.models.find((model) => model.id === modelId)?.credits[resolution];
  if (fromCatalog === undefined) {
    throw new Error(`No credit list entry for model ${modelId}.`);
  }
  return fromCatalog * count;
}

export function isSupportedModelMode(
  model: ImageModelDefinition,
  mode: GenerationMode,
): boolean {
  return model.mode === "both" || model.mode === mode;
}

const EXCLUDED_ID_PATTERN =
  /(video|audio|speech|music|tts|midi|lyrics|suno|elevenlabs|kling|sora|hailuo|seedance|infinitalk|pixverse|happyhorse|omnihuman|runway|aleph|minimax|from-audio|text-to-speech|text-to-dialogue|upscale|remove-background|layer-decomposition|segment-map|character-remix|character-edit)/i;

const IMAGE_FAMILY_PATTERN =
  /(gpt-image|flux-2|flux\/|seedream|grok-imagine|nano-banana|imagen|z-image|qwen|ideogram|recraft|google\/|wan\/2-7-image)/i;

export function isExcludedModelId(modelId: string): boolean {
  return EXCLUDED_ID_PATTERN.test(modelId);
}

export function looksLikeImageModelId(modelId: string): boolean {
  if (!MODEL_ID_PATTERN.test(modelId) || isExcludedModelId(modelId)) {
    return false;
  }
  const lower = modelId.toLowerCase();
  return (
    IMAGE_FAMILY_PATTERN.test(lower) ||
    lower.includes("text-to-image") ||
    lower.includes("image-to-image") ||
    lower.includes("image-edit")
  );
}

function labelFromId(modelId: string): string {
  const leaf = modelId.split("/").pop() ?? modelId;
  return leaf
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function familyFromId(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.includes("gpt-image")) return "gpt-image";
  if (lower.includes("flux")) return "flux-2";
  if (lower.includes("seedream")) return "seedream";
  if (lower.includes("grok-imagine")) return "grok-imagine";
  if (lower.includes("nano-banana")) return "nano-banana";
  if (lower.includes("imagen")) return "imagen";
  if (lower.includes("z-image")) return "z-image";
  if (lower.includes("qwen")) return "qwen";
  if (lower.includes("ideogram")) return "ideogram";
  if (lower.includes("recraft")) return "recraft";
  if (lower.startsWith("google/")) return "google";
  return modelId.split("/")[0] ?? "image";
}

function inferImageField(
  modelId: string,
  mode: ImageModelDefinition["mode"],
): ImageInputField | null {
  if (mode === "text-to-image") return null;
  const lower = modelId.toLowerCase();
  if (lower.includes("nano-banana") || lower.startsWith("google/")) {
    return "image_input";
  }
  if (lower.includes("grok-imagine") || lower.includes("seedream")) {
    return "image_urls";
  }
  if (lower.includes("qwen") || lower.includes("ideogram")) {
    return "image_urls";
  }
  return "input_urls";
}

function inferResolutionField(modelId: string): ResolutionField {
  const lower = modelId.toLowerCase();
  if (lower.includes("seedream")) return "quality";
  if (lower.includes("grok-imagine") && !lower.includes("image-2-0")) {
    return "none";
  }
  return "resolution";
}

function inferMode(modelId: string): ImageModelDefinition["mode"] {
  const lower = modelId.toLowerCase();
  const i2i = /image-to-image|image-edit|\/edit\b|remix/.test(lower);
  const t2i = /text-to-image/.test(lower);
  if (lower.includes("nano-banana") && !i2i) return "both";
  if (i2i && !t2i) return "image-to-image";
  if (t2i && !i2i) return "text-to-image";
  if (i2i) return "image-to-image";
  return "text-to-image";
}

export function inferModelContract(
  modelId: string,
): ImageModelDefinition | undefined {
  const id = modelId.trim();
  if (!looksLikeImageModelId(id)) return undefined;
  const mode = inferMode(id);
  const family = familyFromId(id);
  const resolutionField = inferResolutionField(id);
  const ratios =
    family === "gpt-image"
      ? GPT_RATIOS
      : family === "grok-imagine"
        ? GROK_RATIOS
        : family === "seedream"
          ? SEEDREAM_RATIOS
          : family === "flux-2"
            ? FLUX_RATIOS
            : COMMON_RATIOS;
  return {
    id,
    label: labelFromId(id),
    family,
    mode,
    imageField: inferImageField(id, mode),
    resolutionField,
    supportedAspectRatios: ratios,
    supportedResolutions:
      resolutionField === "none" || family === "flux-2" ? UP_TO_2K : ALL_RESOLUTIONS,
    credits: credits(6, 10, 16),
    qualityMap:
      resolutionField === "quality"
        ? { "1K": "basic", "2K": "high", "4K": "high" }
        : undefined,
  };
}

export function resolveModelContract(
  modelId: string,
  catalogModels: readonly ImageModelDefinition[] = FALLBACK_IMAGE_MODELS,
): ImageModelDefinition | undefined {
  const exact = catalogModels.find((model) => model.id === modelId);
  if (exact) return exact;
  const fallback = FALLBACK_IMAGE_MODELS.find((model) => model.id === modelId);
  if (fallback) return fallback;
  return inferModelContract(modelId);
}

interface ParsedLiveModel {
  id: string;
  label?: string;
  category?: string;
  credits?: Partial<Record<ImageResolution, number>> | number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function parseCreditsValue(
  value: unknown,
): Partial<Record<ImageResolution, number>> | number | undefined {
  const asSingle = readNumber(value);
  if (asSingle !== undefined) return asSingle;
  const record = asRecord(value);
  if (!record) return undefined;
  const nested =
    record.credits ??
    record.credit ??
    record.price ??
    record.pricing ??
    record.cost ??
    record.costs;
  if (nested !== undefined && nested !== record) {
    const nestedParsed = parseCreditsValue(nested);
    if (nestedParsed !== undefined) return nestedParsed;
  }
  const mapped: Partial<Record<ImageResolution, number>> = {};
  for (const resolution of ALL_RESOLUTIONS) {
    const amount = readNumber(
      record[resolution] ?? record[resolution.toLowerCase()],
    );
    if (amount !== undefined) mapped[resolution] = amount;
  }
  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

function parseLiveModel(value: unknown): ParsedLiveModel | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const id = readString(record, [
    "model",
    "id",
    "modelId",
    "model_id",
    "name",
  ]);
  if (!id || !looksLikeImageModelId(id)) return undefined;
  const category = readString(record, [
    "category",
    "type",
    "mediaType",
    "media_type",
    "kind",
  ]);
  if (
    category &&
    /video|audio|music|chat|llm|speech/i.test(category) &&
    !/image/i.test(category)
  ) {
    return undefined;
  }
  return {
    id,
    label: readString(record, ["label", "displayName", "title", "modelName"]),
    category,
    credits: parseCreditsValue(
      record.credits ??
        record.credit ??
        record.price ??
        record.pricing ??
        record.cost ??
        record.costs,
    ),
  };
}

function collectLiveModels(payload: unknown): ParsedLiveModel[] {
  const root = asRecord(payload);
  const data = root?.data ?? payload;
  const dataRecord = asRecord(data);
  const candidates = [
    ...asArray(data),
    ...asArray(dataRecord?.models),
    ...asArray(dataRecord?.list),
    ...asArray(dataRecord?.items),
    ...asArray(dataRecord?.data),
    ...asArray(root?.models),
    ...asArray(root?.list),
  ];
  const byId = new Map<string, ParsedLiveModel>();
  for (const candidate of candidates) {
    const parsed = parseLiveModel(candidate);
    if (parsed) byId.set(parsed.id, parsed);
  }
  return [...byId.values()];
}

function expandCredits(
  value: ParsedLiveModel["credits"],
  fallback: Record<ImageResolution, number>,
): Record<ImageResolution, number> {
  if (typeof value === "number") {
    return credits(value);
  }
  return {
    "1K": value?.["1K"] ?? fallback["1K"],
    "2K": value?.["2K"] ?? fallback["2K"],
    "4K": value?.["4K"] ?? fallback["4K"],
  };
}

export function parseKieCatalog(payload: unknown): ImageCatalog | undefined {
  const liveModels = collectLiveModels(payload);
  if (liveModels.length === 0) return undefined;

  const models: ImageModelDefinition[] = [];
  const costs: Record<string, Record<ImageResolution, number>> = {};
  const seen = new Set<string>();

  for (const live of liveModels) {
    const contract = resolveModelContract(live.id);
    if (!contract) continue;
    const mergedCredits = expandCredits(live.credits, contract.credits);
    const model: ImageModelDefinition = {
      ...contract,
      id: live.id,
      label: live.label ?? contract.label,
      credits: mergedCredits,
    };
    models.push(model);
    costs[model.id] = mergedCredits;
    seen.add(model.id);
  }

  if (models.length === 0) return undefined;

  for (const fallback of FALLBACK_IMAGE_MODELS) {
    if (seen.has(fallback.id)) continue;
    models.push({ ...fallback, credits: { ...fallback.credits } });
    costs[fallback.id] = { ...fallback.credits };
  }

  return { models, costs, source: "live" };
}

export function resolveImageCatalog(livePayload: unknown | null): ImageCatalog {
  if (livePayload == null) return fallbackImageCatalog();
  return parseKieCatalog(livePayload) ?? fallbackImageCatalog();
}

export function parseDocsLlmsCatalog(markdown: string): ImageCatalog | undefined {
  const models: ImageModelDefinition[] = [];
  const costs: Record<string, Record<ImageResolution, number>> = {};
  const seen = new Set<string>();
  const docToId: Array<[RegExp, string]> = [
    [/gpt-image-2-text-to-image/i, "gpt-image-2-text-to-image"],
    [/gpt-image-2-image-to-image/i, "gpt-image-2-image-to-image"],
    [/1-5-text-to-image/i, "gpt-image/1.5-text-to-image"],
    [/1-5-image-to-image/i, "gpt-image/1.5-image-to-image"],
    [/flux2\/pro-text-to-image/i, "flux-2/pro-text-to-image"],
    [/flux2\/pro-image-to-image/i, "flux-2/pro-image-to-image"],
    [/flux2\/flex-text-to-image/i, "flux-2/flex-text-to-image"],
    [/flux2\/flex-image-to-image/i, "flux-2/flex-image-to-image"],
    [/grok-imagine\/text-to-image/i, "grok-imagine/text-to-image"],
    [/grok-imagine\/image-to-image/i, "grok-imagine/image-to-image"],
    [/seedream\/5-pro-text-to-image/i, "seedream/5-pro-text-to-image"],
    [/seedream\/5-pro-image-to-image/i, "seedream/5-pro-image-to-image"],
    [/google\/nanobanana2/i, "nano-banana-2"],
    [/google\/nano-banana[^-]/i, "google/nano-banana"],
    [/google\/imagen4-fast/i, "google/imagen4-fast"],
    [/google\/imagen4-ultra/i, "google/imagen4-ultra"],
    [/google\/imagen4\.md/i, "google/imagen4"],
    [/z-image\/z-image/i, "z-image"],
    [/qwen2\/text-to-image/i, "qwen2/text-to-image"],
    [/qwen2\/image-edit/i, "qwen2/image-edit"],
    [/qwen3\/text-to-image/i, "qwen3/text-to-image"],
    [/qwen3\/image-to-image/i, "qwen3/image-to-image"],
    [/ideogram\/v3-text-to-image/i, "ideogram/v3-text-to-image"],
    [/ideogram\/v3-edit/i, "ideogram/v3-edit"],
  ];

  for (const [pattern, id] of docToId) {
    if (!pattern.test(markdown) || seen.has(id)) continue;
    const contract = resolveModelContract(id);
    if (!contract) continue;
    models.push({ ...contract });
    costs[id] = { ...contract.credits };
    seen.add(id);
  }

  if (models.length === 0) return undefined;
  for (const fallback of FALLBACK_IMAGE_MODELS) {
    if (seen.has(fallback.id)) continue;
    models.push({ ...fallback, credits: { ...fallback.credits } });
    costs[fallback.id] = { ...fallback.credits };
  }
  return { models, costs, source: "live" };
}
