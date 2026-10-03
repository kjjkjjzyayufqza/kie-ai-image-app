"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/i18n/i18n-provider";
import type { GenerationMode } from "@/lib/domain";
import {
  modelsForMode,
  type ImageCatalog,
  type ImageModelDefinition,
} from "@/lib/image-catalog";

interface ModelPickerProps {
  catalog: ImageCatalog;
  mode: GenerationMode;
  value: string;
  onChange: (modelId: string) => void;
}

export function ModelPicker({
  catalog,
  mode,
  value,
  onChange,
}: ModelPickerProps) {
  const { t } = useI18n();
  const models = modelsForMode(catalog, mode);
  const selected = models.find((model) => model.id === value) ?? models[0];

  return (
    <Select
      value={selected?.id ?? value}
      onValueChange={(next) => {
        if (next) onChange(next);
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={t("composer.modelAria")}
        data-testid="model-picker"
        className="w-[min(12.5rem,calc(100vw-8rem))]"
      >
        <SelectValue>{selected?.label ?? t("composer.modelAria")}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {models.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            <ModelOptionLabel model={model} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ModelOptionLabel({ model }: { model: ImageModelDefinition }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate">{model.label}</span>
      <span className="text-[10px] tabular-nums text-muted-foreground">
        {model.credits["1K"]}cr
      </span>
    </span>
  );
}

export function defaultModelId(
  catalog: ImageCatalog,
  mode: GenerationMode,
  preferred?: string,
): string {
  const models = modelsForMode(catalog, mode);
  if (preferred && models.some((model) => model.id === preferred)) {
    return preferred;
  }
  const paired = preferred ? pairedModelId(preferred, mode) : undefined;
  if (paired && models.some((model) => model.id === paired)) return paired;
  return models[0]?.id ?? "gpt-image-2-5-flare-text-to-image";
}

function pairedModelId(
  modelId: string,
  mode: GenerationMode,
): string | undefined {
  if (
    modelId === "grok-imagine-image-2-0/text-to-image" &&
    mode === "image-to-image"
  ) {
    return "grok-imagine-image-2-0/image-edit";
  }
  if (
    modelId === "grok-imagine-image-2-0/image-edit" &&
    mode === "text-to-image"
  ) {
    return "grok-imagine-image-2-0/text-to-image";
  }
  if (mode === "image-to-image" && modelId.includes("text-to-image")) {
    return modelId.replace("text-to-image", "image-to-image");
  }
  if (mode === "text-to-image" && modelId.includes("image-to-image")) {
    return modelId.replace("image-to-image", "text-to-image");
  }
  return undefined;
}
