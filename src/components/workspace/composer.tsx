"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Coins,
  Image as ImageIcon,
  Images,
  Info,
  LoaderCircle,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  InlineError,
  SkeletonBlock,
} from "@/components/workspace/ui-states";
import type {
  AspectRatio,
  GenerationMode,
  GenerationRequest,
  ImageResolution,
  ReferenceUpload,
} from "@/lib/domain";
import {
  loadComposerDraft,
  saveComposerDraft,
  type ComposerDraft,
} from "@/lib/composer-draft";
import { ModelPicker, defaultModelId } from "@/components/workspace/model-picker";
import { useImageCatalog } from "@/hooks/use-image-catalog";
import {
  modelsForMode,
  resolveModelContract,
} from "@/lib/image-catalog";
import {
  aspectRatios,
  batchCountSchema,
  generationRequestSchema,
  gptImage2CreditsPerImage,
  resolutions,
} from "@/lib/model-registry";
import { mergeReference } from "@/lib/canvas-references";
import { ingestReferenceFiles } from "@/lib/reference-ingest";
import { submitGenerationBatch } from "@/lib/workspace-service";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";

const quickCounts = [1, 2, 4, 5, 10];
const highResolutionBlockedRatios = new Set<AspectRatio>([
  "5:4",
  "4:5",
  "3:1",
  "1:3",
  "9:21",
]);
const ACCEPTED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_REFERENCE_COUNT = 16;
const MAX_REFERENCE_BYTES = 30 * 1024 * 1024;

interface ComposerProps {
  roomId: string;
  apiKey: string;
  keyFingerprint: string;
  availableCredits?: number;
  observedCreditPrices: Partial<Record<ImageResolution, number>>;
  creditsStale: boolean;
  layout?: "chat" | "canvas";
  canvasParentNodeId?: string;
  canvasPickedReference?: ReferenceUpload;
  canvasDrop?: { files: File[]; origin: { x: number; y: number } } | null;
  onCanvasDropConsumed?: () => void;
  onReferenceFocus?: (uploadId: string) => void;
  onOpenSettings: () => void;
  onSubmitted: () => void;
}

export function Composer({
  roomId,
  apiKey,
  keyFingerprint,
  availableCredits,
  observedCreditPrices,
  creditsStale,
  layout = "chat",
  canvasParentNodeId,
  canvasPickedReference,
  canvasDrop,
  onCanvasDropConsumed,
  onReferenceFocus,
  onOpenSettings,
  onSubmitted,
}: ComposerProps) {
  const { t } = useI18n();
  const catalog = useImageCatalog(apiKey);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropDepthRef = useRef(0);
  const [mode, setMode] = useState<GenerationMode>("image-to-image");
  const [modelId, setModelId] = useState("gpt-image-2-image-to-image");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto");
  const [resolution, setResolution] = useState<ImageResolution>("1K");
  const [countText, setCountText] = useState("5");
  const [referenceUploads, setReferenceUploads] = useState<ReferenceUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [countError, setCountError] = useState<string | null>(null);
  const [brokenPreviewIds, setBrokenPreviewIds] = useState<Set<string>>(
    () => new Set(),
  );
  const draftRef = useRef<ComposerDraft>({
    mode: "image-to-image",
    model: "gpt-image-2-image-to-image",
    prompt: "",
    aspectRatio: "auto",
    resolution: "1K",
    countText: "5",
    referenceUploads: [],
  });

  const persistDraft = useCallback(
    (patch: Partial<ComposerDraft>) => {
      const next = { ...draftRef.current, ...patch };
      draftRef.current = next;
      saveComposerDraft(roomId, next);
    },
    [roomId],
  );

  useEffect(() => {
    let cancelled = false;
    const saved = loadComposerDraft(roomId);
    if (saved) {
      queueMicrotask(() => {
        if (cancelled) return;
        draftRef.current = saved;
        setMode(saved.mode);
        setModelId(
          saved.model ?? defaultModelId(catalog, saved.mode),
        );
        setPrompt(saved.prompt);
        setAspectRatio(saved.aspectRatio);
        setResolution(saved.resolution);
        setCountText(saved.countText);
        setReferenceUploads(saved.referenceUploads);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const count = Number(countText);
  const isCountValid = batchCountSchema.safeParse(count).success;
  const observedUnitCredits = observedCreditPrices[resolution];
  const selectedModel =
    modelsForMode(catalog, mode).find((model) => model.id === modelId) ??
    modelsForMode(catalog, mode)[0];
  const catalogUnitCredits = selectedModel?.credits[resolution];
  const unitCredits =
    observedUnitCredits ??
    catalogUnitCredits ??
    gptImage2CreditsPerImage[resolution];
  const estimatedCredits = isCountValid ? unitCredits * count : undefined;
  const estimatedRemaining =
    availableCredits !== undefined && estimatedCredits !== undefined
      ? availableCredits - estimatedCredits
      : undefined;
  const insufficientCredits =
    estimatedRemaining !== undefined && estimatedRemaining < 0;
  const needsReferences = mode === "image-to-image";
  const hasReferences = referenceUploads.length > 0;

  const disabledReason = useMemo(() => {
    if (!apiKey || !keyFingerprint) return t("composer.needApiKey");
    if (!prompt.trim()) return t("composer.needPrompt");
    if (!isCountValid) return t("composer.needValidCount");
    if (needsReferences && !hasReferences) return t("composer.needReference");
    if (uploading) return t("composer.uploading");
    if (submitting) return t("composer.submitting");
    return null;
  }, [
    apiKey,
    hasReferences,
    isCountValid,
    keyFingerprint,
    needsReferences,
    prompt,
    submitting,
    t,
    uploading,
  ]);

  const canSubmit = disabledReason === null;

  const changeMode = (nextMode: GenerationMode) => {
    const nextModel = defaultModelId(catalog, nextMode, modelId);
    setMode(nextMode);
    setModelId(nextModel);
    persistDraft({ mode: nextMode, model: nextModel });
    setReferenceError(null);
  };

  const changeModel = (nextModel: string) => {
    const contract = resolveModelContract(nextModel, catalog.models);
    const nextRatio =
      contract && !contract.supportedAspectRatios.includes(aspectRatio)
        ? (contract.supportedAspectRatios[0] ?? "1:1")
        : aspectRatio;
    const nextResolution =
      contract &&
      contract.resolutionField === "resolution" &&
      !contract.supportedResolutions.includes(resolution)
        ? (contract.supportedResolutions[0] ?? "1K")
        : resolution;
    setModelId(nextModel);
    if (nextRatio !== aspectRatio) setAspectRatio(nextRatio);
    if (nextResolution !== resolution) setResolution(nextResolution);
    persistDraft({
      model: nextModel,
      aspectRatio: nextRatio,
      resolution: nextResolution,
    });
  };

  const changeAspectRatio = (nextRatio: AspectRatio) => {
    setAspectRatio(nextRatio);
    const nextResolution =
      highResolutionBlockedRatios.has(nextRatio) && resolution !== "1K"
        ? "1K"
        : resolution;
    persistDraft({
      aspectRatio: nextRatio,
      resolution: nextResolution,
    });
    if (highResolutionBlockedRatios.has(nextRatio) && resolution !== "1K") {
      setResolution("1K");
      toast.message(t("composer.switchedTo1k"));
    }
  };

  const validateFilesLocally = useCallback(
    (files: File[]): string | null => {
      if (files.length === 0) return t("composer.noValidFiles");
      const availableSlots = MAX_REFERENCE_COUNT - referenceUploads.length;
      if (availableSlots <= 0) {
        return t("composer.maxReferences", { max: MAX_REFERENCE_COUNT });
      }
      if (files.length > availableSlots) {
        return t("composer.maxReferencesRemaining", { max: MAX_REFERENCE_COUNT, remaining: availableSlots });
      }
      for (const file of files) {
        if (!ACCEPTED_MIME.has(file.type)) {
          return t("composer.onlyJpegPngWebp");
        }
        if (file.size <= 0 || file.size > MAX_REFERENCE_BYTES) {
          return t("composer.maxFileSize");
        }
      }
      return null;
    },
    [referenceUploads.length, t],
  );

  const handleFiles = async (
    fileList: FileList | File[] | null,
    origin?: { x: number; y: number },
  ) => {
    const files = fileList
      ? Array.from(fileList).filter((file) => file.type.startsWith("image/"))
      : [];
    if (!files.length) {
      if (fileList && Array.from(fileList).length > 0) {
        setReferenceError(t("composer.onlyJpegPngWebp"));
      }
      return;
    }
    if (!apiKey || !keyFingerprint) {
      onOpenSettings();
      return;
    }

    const localError = validateFilesLocally(files);
    if (localError) {
      setReferenceError(localError);
      toast.error(localError);
      return;
    }

    setReferenceError(null);
    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });
    try {
      const uploaded = await ingestReferenceFiles({
        files,
        apiKey,
        keyFingerprint,
        roomId,
        placeOnCanvas: layout === "canvas",
        origin,
      });
      if (layout === "canvas") {
        changeMode("image-to-image");
      }
      setReferenceUploads((current) => {
        let next = current;
        for (const upload of uploaded) {
          next = mergeReference(next, upload, MAX_REFERENCE_COUNT);
        }
        persistDraft({
          referenceUploads: next,
          mode: layout === "canvas" ? "image-to-image" : mode,
        });
        return next;
      });
      toast.success(t("composer.uploadedReferences", { count: uploaded.length }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("composer.uploadFailed");
      setReferenceError(message);
      toast.error(message);
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFilesRef = useRef(handleFiles);
  handleFilesRef.current = handleFiles;
  const consumeDropRef = useRef(onCanvasDropConsumed);
  consumeDropRef.current = onCanvasDropConsumed;

  useEffect(() => {
    if (!canvasDrop) return;
    void handleFilesRef
      .current(canvasDrop.files, canvasDrop.origin)
      .finally(() => consumeDropRef.current?.());
  }, [canvasDrop]);

  useEffect(() => {
    if (!canvasPickedReference) return;
    setMode("image-to-image");
    setReferenceUploads((current) => {
      try {
        const next = mergeReference(
          current,
          canvasPickedReference,
          MAX_REFERENCE_COUNT,
        );
        persistDraft({
          referenceUploads: next,
          mode: "image-to-image",
        });
        return next;
      } catch {
        toast.error(t("composer.maxReferences", { max: MAX_REFERENCE_COUNT }));
        return current;
      }
    });
  }, [canvasPickedReference?.id, persistDraft, t]);

  const acceptsReferenceDrop = mode === "image-to-image" || layout === "canvas";

  const onDragEnter = (event: React.DragEvent) => {
    if (!acceptsReferenceDrop) return;
    event.preventDefault();
    event.stopPropagation();
    dropDepthRef.current += 1;
    if (event.dataTransfer.types.includes("Files")) {
      setDragActive(true);
    }
  };

  const onDragLeave = (event: React.DragEvent) => {
    if (!acceptsReferenceDrop) return;
    event.preventDefault();
    event.stopPropagation();
    dropDepthRef.current = Math.max(0, dropDepthRef.current - 1);
    if (dropDepthRef.current === 0) setDragActive(false);
  };

  const onDragOver = (event: React.DragEvent) => {
    if (!acceptsReferenceDrop) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (event: React.DragEvent) => {
    if (!acceptsReferenceDrop) return;
    event.preventDefault();
    event.stopPropagation();
    dropDepthRef.current = 0;
    setDragActive(false);
    void handleFiles(event.dataTransfer.files);
  };

  const requestSubmit = () => {
    if (!apiKey) {
      onOpenSettings();
      return;
    }
    if (!isCountValid) {
      setCountError(t("composer.countInvalid"));
      toast.error(t("composer.countInvalid"));
      return;
    }
    setCountError(null);
    if (needsReferences && !hasReferences) {
      setReferenceError(t("composer.needReferencePeriod"));
      return;
    }
    if (count > 20) {
      setConfirmOpen(true);
      return;
    }
    void performSubmit();
  };

  const performSubmit = async () => {
    const request: GenerationRequest = {
      model: selectedModel?.id ?? modelId,
      mode,
      prompt,
      aspectRatio,
      resolution,
      inputUrls:
        mode === "image-to-image"
          ? referenceUploads.map((upload) => upload.temporaryUrl)
          : [],
    };
    const validation = generationRequestSchema.safeParse(request);
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message ?? t("composer.invalidParams"));
      return;
    }
    const minimumExpiry = Date.now() + 10 * 60 * 1_000;
    if (
      mode === "image-to-image" &&
      referenceUploads.some((upload) => upload.expiresAt <= minimumExpiry)
    ) {
      setReferenceError(t("composer.referenceExpiring"));
      toast.error(t("composer.referenceExpiring"));
      return;
    }

    setSubmitting(true);
    try {
      await submitGenerationBatch({
        roomId,
        request: validation.data,
        count,
        keyFingerprint,
        referenceUploads:
          mode === "image-to-image" ? referenceUploads : [],
        canvas:
          layout === "canvas"
            ? { parentNodeId: canvasParentNodeId }
            : undefined,
      });
      setReferenceError(null);
      onSubmitted();
      toast.success(t("composer.createdTasks", { count }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("composer.taskCreateFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="shrink-0 border-t bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-sm sm:px-5 sm:pb-5 sm:pt-4">
      <div
        className={cn(
          "mx-auto max-w-5xl overflow-hidden rounded-lg border bg-white shadow-lg shadow-black/5 transition-[box-shadow,border-color] duration-200",
          dragActive && "border-neutral-900 ring-2 ring-neutral-900/10",
        )}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {mode === "image-to-image" || layout === "canvas" ? (
          <div
            className={cn(
              "border-b bg-neutral-50/70 p-2 transition-colors duration-200",
              dragActive && "bg-neutral-100",
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(event) => void handleFiles(event.target.files)}
            />

            <div
              className={cn(
                "grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-dashed p-2 transition-colors duration-200 sm:flex sm:min-h-16 sm:flex-row",
                dragActive
                  ? "border-neutral-900 bg-white"
                  : "border-neutral-200 bg-white/60",
                referenceError && "border-destructive/50",
              )}
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 shrink-0 active:scale-[0.98] sm:h-11"
                disabled={uploading || referenceUploads.length >= MAX_REFERENCE_COUNT}
                onClick={() => {
                  if (!apiKey) {
                    onOpenSettings();
                    return;
                  }
                  fileInputRef.current?.click();
                }}
              >
                {uploading ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Upload />
                )}
                {uploading && uploadProgress
                  ? t("composer.uploadingProgress", { current: uploadProgress.current, total: uploadProgress.total })
                  : t("composer.selectReferences")}
              </Button>

              <div
                className={cn(
                  "order-3 col-span-2 flex min-w-0 w-full items-center gap-2 overflow-x-auto pb-0.5 sm:order-none sm:w-auto sm:flex-1",
                  !uploading &&
                    referenceUploads.length === 0 &&
                    "hidden sm:flex",
                )}
              >
                {referenceUploads.map((upload) => {
                  const broken = brokenPreviewIds.has(upload.id);
                  return (
                    <div
                      key={upload.id}
                      className="group relative size-11 shrink-0 overflow-hidden rounded-md border bg-white"
                    >
                      {broken ? (
                        <div className="flex size-full items-center justify-center bg-neutral-100 text-[10px] text-muted-foreground">
                          {t("composer.expired")}
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={upload.temporaryUrl}
                          alt={upload.displayName}
                          referrerPolicy="no-referrer"
                          className="size-full cursor-pointer object-cover"
                          onClick={() => onReferenceFocus?.(upload.id)}
                          onError={() =>
                            setBrokenPreviewIds((current) => {
                              const next = new Set(current);
                              next.add(upload.id);
                              return next;
                            })
                          }
                        />
                      )}
                      <button
                        type="button"
                        className="absolute right-0 top-0 grid size-5 place-items-center bg-black/70 text-white opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                        onClick={() => {
                          setReferenceUploads((current) => {
                            const next = current.filter(
                              (item) => item.id !== upload.id,
                            );
                            persistDraft({ referenceUploads: next });
                            return next;
                          });
                          setBrokenPreviewIds((current) => {
                            const next = new Set(current);
                            next.delete(upload.id);
                            return next;
                          });
                          setReferenceError(null);
                        }}
                        aria-label={t("composer.removeReference", { name: upload.displayName })}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  );
                })}
                {uploading
                  ? Array.from(
                      { length: Math.max(1, (uploadProgress?.total ?? 1) - (uploadProgress?.current ?? 1) + 1) },
                      (_, index) => (
                        <SkeletonBlock
                          key={`upload-slot-${index}`}
                          className="size-11 shrink-0 rounded-md"
                        />
                      ),
                    )
                  : null}
                {!uploading && referenceUploads.length === 0 ? (
                  <p className="min-w-0 flex-1 px-1 text-xs leading-5 text-muted-foreground">
                    <span className="hidden sm:inline">
                      {t("composer.dropHint", { max: MAX_REFERENCE_COUNT })}
                    </span>
                  </p>
                ) : null}
              </div>

              <span className="shrink-0 self-center pr-1 text-xs tabular-nums text-muted-foreground">
                {referenceUploads.length}/{MAX_REFERENCE_COUNT}
              </span>
            </div>
            {referenceError ? (
              <InlineError className="mt-2 px-1">{referenceError}</InlineError>
            ) : null}
          </div>
        ) : null}

        <Textarea
          value={prompt}
          onChange={(event) => {
            const nextPrompt = event.target.value;
            setPrompt(nextPrompt);
            persistDraft({ prompt: nextPrompt });
          }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              requestSubmit();
            }
          }}
          maxLength={20_000}
          aria-label={t("composer.promptAria")}
          placeholder={t("composer.promptPlaceholder")}
          className="min-h-20 resize-none rounded-none border-0 px-3 py-3 shadow-none focus-visible:ring-0 sm:min-h-24 sm:px-4"
        />

        <div
          className={cn(
            "flex min-w-0 items-center gap-2 border-t bg-neutral-50/80 px-3 py-2",
            insufficientCredits && "bg-red-50",
          )}
        >
          <Coins
            className={cn(
              "size-4 shrink-0 text-muted-foreground",
              insufficientCredits && "text-red-700",
            )}
          />
          <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
            <p
              className={cn(
                "shrink-0 text-xs font-medium tabular-nums",
                insufficientCredits && "text-red-700",
              )}
            >
              {t("composer.estimateCredits", { credits: estimatedCredits?.toLocaleString() ?? "--" })}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {isCountValid ? t("composer.perImage", { count, credits: unitCredits }) : `${unitCredits} credits/image`}
              {observedUnitCredits !== undefined ? t("composer.observed") : ""}
              {estimatedRemaining !== undefined
                ? insufficientCredits
                  ? t("composer.shortfall", { credits: Math.abs(estimatedRemaining).toLocaleString() })
                  : t("composer.remainingAfter", { credits: estimatedRemaining.toLocaleString() })
                : t("composer.creditsNotSynced")}
              {creditsStale && availableCredits !== undefined ? t("composer.creditsMayBeStale") : ""}
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="shrink-0"
                  aria-label={t("composer.estimateHelp")}
                />
              }
            >
              <Info />
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              {observedUnitCredits !== undefined
                ? t("composer.observedEstimate", { resolution })
                : t("composer.defaultEstimate")}
              {" "}
              {t("composer.actualBilling")}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t p-2 sm:gap-2">
          <div className="flex items-center rounded-md border p-0.5">
            <Button
              type="button"
              size="sm"
              variant={mode === "image-to-image" ? "secondary" : "ghost"}
              className="active:scale-[0.98]"
              onClick={() => changeMode("image-to-image")}
            >
              <ImageIcon />
              {t("chat.imageToImage")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "text-to-image" ? "secondary" : "ghost"}
              className="active:scale-[0.98]"
              onClick={() => changeMode("text-to-image")}
            >
              <Sparkles />
              {t("chat.textToImage")}
            </Button>
          </div>

          <ModelPicker
            catalog={catalog}
            mode={mode}
            value={modelId}
            onChange={changeModel}
          />

          <Select
            value={aspectRatio}
            onValueChange={(value) => changeAspectRatio(value as AspectRatio)}
          >
            <SelectTrigger size="sm" aria-label={t("composer.aspectRatioAria")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {aspectRatios.map((ratio) => (
                <SelectItem key={ratio} value={ratio}>
                  {ratio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={resolution}
            onValueChange={(value) => {
              const nextResolution = value as ImageResolution;
              setResolution(nextResolution);
              persistDraft({ resolution: nextResolution });
            }}
          >
            <SelectTrigger size="sm" aria-label={t("composer.resolutionAria")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {resolutions.map((value) => (
                <SelectItem
                  key={value}
                  value={value}
                  disabled={
                    value !== "1K" && highResolutionBlockedRatios.has(aspectRatio)
                  }
                >
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="hidden items-center gap-1 lg:flex">
            {quickCounts.map((quickCount) => (
              <Button
                key={quickCount}
                type="button"
                size="sm"
                variant={count === quickCount ? "secondary" : "ghost"}
                className="px-2 tabular-nums active:scale-[0.98]"
                onClick={() => {
                  setCountText(String(quickCount));
                  persistDraft({ countText: String(quickCount) });
                  setCountError(null);
                }}
              >
                {quickCount}x
              </Button>
            ))}
          </div>

          <div className="relative w-14 sm:w-16">
            <Input
              type="number"
              min={1}
              max={100}
              step={1}
              value={countText}
              onChange={(event) => {
                const nextCount = event.target.value;
                setCountText(nextCount);
                persistDraft({ countText: nextCount });
                setCountError(null);
              }}
              aria-label={t("composer.countAria")}
              aria-invalid={!isCountValid || Boolean(countError)}
              className={cn(
                "h-8 pr-5 tabular-nums",
                (!isCountValid || countError) && "border-destructive",
              )}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              x
            </span>
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <Badge
              variant="outline"
              className="hidden tabular-nums sm:inline-flex"
            >
              {prompt.length.toLocaleString()}/20,000
            </Badge>
            {disabledReason && !canSubmit ? (
              <span className="hidden max-w-[12rem] truncate text-[11px] text-muted-foreground sm:block">
                {disabledReason}
              </span>
            ) : null}
            <Button
              type="button"
              className="active:scale-[0.98]"
              disabled={!canSubmit}
              title={disabledReason ?? undefined}
              aria-disabled={!canSubmit}
              onClick={requestSubmit}
            >
              {submitting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Send />
              )}
              {submitting
                ? t("composer.generating")
                : t("composer.generate", { count: isCountValid ? `${count}x` : "" }).trim()}
            </Button>
          </div>
        </div>
        {countError ? (
          <div className="border-t px-3 py-2">
            <InlineError>{countError}</InlineError>
          </div>
        ) : null}
        {submitting ? (
          <div
            className="h-0.5 w-full overflow-hidden bg-neutral-100"
            role="progressbar"
            aria-label={t("composer.creatingTasksAria")}
          >
            <div className="ui-progress-bar h-full w-1/3 bg-neutral-900" />
          </div>
        ) : null}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-[min(100vw-1.5rem,28rem)]">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Images />
            </AlertDialogMedia>
            <AlertDialogTitle>{t("composer.confirmTitle", { count })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("composer.confirmDescription", { credits: estimatedCredits?.toLocaleString() ?? "--", unit: unitCredits })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                void performSubmit();
              }}
            >
              {t("composer.confirmGenerate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
