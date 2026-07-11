"use client";

import { useRef, useState } from "react";
import {
  Image as ImageIcon,
  Images,
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
import type {
  AspectRatio,
  GenerationMode,
  GenerationRequest,
  ImageResolution,
  ReferenceUpload,
} from "@/lib/domain";
import { uploadReferenceImage } from "@/lib/kie-client";
import {
  aspectRatios,
  batchCountSchema,
  generationRequestSchema,
  resolutions,
} from "@/lib/model-registry";
import {
  storeReferenceUpload,
  submitGenerationBatch,
} from "@/lib/workspace-service";
import { cn } from "@/lib/utils";

const quickCounts = [1, 2, 4, 5, 10];
const highResolutionBlockedRatios = new Set<AspectRatio>([
  "5:4",
  "4:5",
  "3:1",
  "1:3",
  "9:21",
]);

interface ComposerProps {
  roomId: string;
  apiKey: string;
  keyFingerprint: string;
  onOpenSettings: () => void;
}

export function Composer({
  roomId,
  apiKey,
  keyFingerprint,
  onOpenSettings,
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<GenerationMode>("text-to-image");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto");
  const [resolution, setResolution] = useState<ImageResolution>("1K");
  const [countText, setCountText] = useState("5");
  const [referenceUploads, setReferenceUploads] = useState<ReferenceUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const count = Number(countText);
  const isCountValid = batchCountSchema.safeParse(count).success;
  const canSubmit =
    Boolean(apiKey && keyFingerprint && prompt.trim()) &&
    isCountValid &&
    !submitting &&
    !uploading &&
    (mode === "text-to-image" || referenceUploads.length > 0);

  const changeMode = (nextMode: GenerationMode) => {
    setMode(nextMode);
    if (nextMode === "text-to-image") setReferenceUploads([]);
  };

  const changeAspectRatio = (nextRatio: AspectRatio) => {
    setAspectRatio(nextRatio);
    if (highResolutionBlockedRatios.has(nextRatio) && resolution !== "1K") {
      setResolution("1K");
      toast.message("该比例已切换为 1K");
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!apiKey || !keyFingerprint) {
      onOpenSettings();
      return;
    }
    const availableSlots = 16 - referenceUploads.length;
    if (files.length > availableSlots) {
      toast.error(`最多添加 16 张参考图，还可添加 ${availableSlots} 张。`);
      return;
    }

    setUploading(true);
    try {
      const uploaded: ReferenceUpload[] = [];
      for (const file of Array.from(files)) {
        const result = await uploadReferenceImage(apiKey, keyFingerprint, file);
        await storeReferenceUpload(result);
        uploaded.push(result);
      }
      setReferenceUploads((current) => [...current, ...uploaded]);
      toast.success(`已上传 ${uploaded.length} 张参考图`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "参考图上传失败。");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const requestSubmit = () => {
    if (!apiKey) {
      onOpenSettings();
      return;
    }
    if (!isCountValid) {
      toast.error("生成数量必须是 1 到 100 的整数。");
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
      model:
        mode === "image-to-image"
          ? "gpt-image-2-image-to-image"
          : "gpt-image-2-text-to-image",
      mode,
      prompt,
      aspectRatio,
      resolution,
      inputUrls: referenceUploads.map((upload) => upload.temporaryUrl),
    };
    const validation = generationRequestSchema.safeParse(request);
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message ?? "生成参数无效。");
      return;
    }
    const minimumExpiry = Date.now() + 10 * 60 * 1_000;
    if (referenceUploads.some((upload) => upload.expiresAt <= minimumExpiry)) {
      toast.error("参考图即将过期，请重新上传。");
      return;
    }

    setSubmitting(true);
    try {
      await submitGenerationBatch({
        roomId,
        request: validation.data,
        count,
        keyFingerprint,
        referenceUploads,
      });
      setPrompt("");
      setReferenceUploads([]);
      toast.success(`已创建 ${count} 个图片任务`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "任务创建失败。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 border-t bg-white/95 px-3 py-3 backdrop-blur-sm sm:px-5 sm:py-5">
      <div className="pointer-events-auto mx-auto max-w-4xl overflow-hidden rounded-lg border bg-white shadow-lg shadow-black/5">
        {mode === "image-to-image" ? (
          <div className="flex min-h-16 items-center gap-2 overflow-x-auto border-b bg-neutral-50/70 p-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(event) => void handleFiles(event.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 shrink-0"
              disabled={uploading || referenceUploads.length >= 16}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <LoaderCircle className="animate-spin" /> : <Upload />}
              参考图
            </Button>
            {referenceUploads.map((upload) => (
              <div
                key={upload.id}
                className="group relative size-11 shrink-0 overflow-hidden rounded-md border bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={upload.temporaryUrl}
                  alt={upload.displayName}
                  referrerPolicy="no-referrer"
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  className="absolute inset-0 grid place-items-center bg-black/55 text-white opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                  onClick={() =>
                    setReferenceUploads((current) =>
                      current.filter((item) => item.id !== upload.id),
                    )
                  }
                  aria-label={`移除 ${upload.displayName}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <span className="ml-auto shrink-0 pr-2 text-xs text-muted-foreground">
              {referenceUploads.length}/16
            </span>
          </div>
        ) : null}

        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              requestSubmit();
            }
          }}
          maxLength={20_000}
          aria-label="Prompt"
          placeholder="输入 Prompt"
          className="min-h-24 resize-none rounded-none border-0 px-4 py-3 shadow-none focus-visible:ring-0"
        />

        <div className="flex flex-wrap items-center gap-2 border-t p-2">
          <div className="flex items-center rounded-md border p-0.5">
            <Button
              type="button"
              size="sm"
              variant={mode === "text-to-image" ? "secondary" : "ghost"}
              onClick={() => changeMode("text-to-image")}
            >
              <Sparkles />
              文生图
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "image-to-image" ? "secondary" : "ghost"}
              onClick={() => changeMode("image-to-image")}
            >
              <ImageIcon />
              图生图
            </Button>
          </div>

          <Select value={aspectRatio} onValueChange={(value) => changeAspectRatio(value as AspectRatio)}>
            <SelectTrigger size="sm" aria-label="图片比例">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {aspectRatios.map((ratio) => (
                <SelectItem key={ratio} value={ratio}>{ratio}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={resolution} onValueChange={(value) => setResolution(value as ImageResolution)}>
            <SelectTrigger size="sm" aria-label="分辨率">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {resolutions.map((value) => (
                <SelectItem
                  key={value}
                  value={value}
                  disabled={value !== "1K" && highResolutionBlockedRatios.has(aspectRatio)}
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
                className="px-2 tabular-nums"
                onClick={() => setCountText(String(quickCount))}
              >
                {quickCount}x
              </Button>
            ))}
          </div>

          <div className="relative w-16">
            <Input
              type="number"
              min={1}
              max={100}
              step={1}
              value={countText}
              onChange={(event) => setCountText(event.target.value)}
              aria-label="生成数量"
              className={cn("h-8 pr-5 tabular-nums", !isCountValid && "border-destructive")}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              x
            </span>
          </div>

          <Badge variant="outline" className="hidden tabular-nums sm:inline-flex">
            {prompt.length.toLocaleString()}/20,000
          </Badge>

          <Button
            type="button"
            className="ml-auto"
            disabled={!canSubmit}
            onClick={requestSubmit}
          >
            {submitting ? <LoaderCircle className="animate-spin" /> : <Send />}
            生成 {isCountValid ? `${count}x` : ""}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><Images /></AlertDialogMedia>
            <AlertDialogTitle>确认创建 {count} 个任务？</AlertDialogTitle>
            <AlertDialogDescription>
              每张图片会独立调用 Kie 并消耗 credits，任务将按限流分批提交。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                void performSubmit();
              }}
            >
              确认生成
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
