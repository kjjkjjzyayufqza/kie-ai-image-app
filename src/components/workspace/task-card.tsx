"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Clock3,
  Copy,
  Download,
  Expand,
  ImageOff,
  LoaderCircle,
  RefreshCw,
  ShieldX,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ImagePreviewDialog } from "@/components/workspace/image-preview-dialog";
import { ImageLoadFrame } from "@/components/workspace/ui-states";
import type { Asset, GenerationTask } from "@/lib/domain";
import { copyText } from "@/lib/browser-actions";
import { downloadKieAsset } from "@/lib/kie-client";
import { estimateGptImage2Credits } from "@/lib/model-registry";
import {
  markAssetAvailable,
  markAssetLoadError,
  requestTaskRefresh,
  retryGenerationTask,
} from "@/lib/workspace-service";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";

interface TaskCardProps {
  task: GenerationTask;
  asset?: Asset;
  apiKey: string;
  keyFingerprint: string;
}

export function TaskCard({ task, asset, apiKey, keyFingerprint }: TaskCardProps) {
  const { t } = useI18n();
  const activeLabels: Partial<Record<GenerationTask["status"], string>> = {
    queued: t("queue.status.queued"),
    submitting: t("queue.status.submitting"),
    waiting: t("queue.status.waiting"),
    queuing: t("queue.status.queuing"),
    generating: t("queue.status.generating"),
    stale: t("queue.status.stale"),
  };
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [retryConfirmOpen, setRetryConfirmOpen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const isActive = Boolean(activeLabels[task.status]);

  const download = async () => {
    if (!asset || !apiKey) return;
    setDownloading(true);
    try {
      await downloadKieAsset(
        apiKey,
        asset.url,
        `kie-${task.batchIndex + 1}-${asset.outputOrdinal + 1}.png`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("task.downloadLinkFailed"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <article
      data-testid="task-card"
      className="group relative min-w-0 overflow-hidden rounded-lg border bg-white transition-shadow duration-200 hover:shadow-sm"
    >
      <div className="relative aspect-square bg-neutral-100">
        {task.status === "success" && asset?.isRenderable ? (
          asset.availability === "load-error" ? (
            <StatePanel
              icon={<ImageOff />}
              title={t("task.loadErrorTitle")}
              detail={t("task.loadErrorDetail")}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  className="active:scale-[0.98]"
                  onClick={() => {
                    setImageLoaded(false);
                    void requestTaskRefresh(task.localTaskId);
                  }}
                >
                  <RefreshCw />
                  {t("common.retry")}
                </Button>
              }
            />
          ) : (
            <ImageLoadFrame loaded={imageLoaded || asset.availability === "available"}>
              {/* Kie result URLs are rendered directly and never pass through Next Image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset.url}
                alt={t("task.resultAlt", { index: task.batchIndex + 1 })}
                loading="lazy"
                referrerPolicy="no-referrer"
                className={cn(
                  "size-full object-cover transition-opacity duration-300",
                  imageLoaded || asset.availability === "available"
                    ? "opacity-100"
                    : "opacity-0",
                )}
                onLoad={() => {
                  setImageLoaded(true);
                  void markAssetAvailable(asset.id);
                }}
                onError={() => {
                  setImageLoaded(false);
                  void markAssetLoadError(asset.id);
                }}
              />
            </ImageLoadFrame>
          )
        ) : task.status === "success" && asset && !asset.isRenderable ? (
          <StatePanel
            icon={<ShieldX />}
            title={t("task.domainUnverifiedTitle")}
            detail={t("task.domainUnverifiedDetail")}
          />
        ) : task.status === "fail" ? (
          <StatePanel
            icon={<AlertTriangle className="text-red-600" />}
            title={t("task.failTitle")}
            detail={task.failureMessage ?? t("task.failDetailFallback")}
            action={
              <Button
                size="sm"
                variant="outline"
                className="active:scale-[0.98]"
                onClick={() => setRetryConfirmOpen(true)}
              >
                <RefreshCw />
                {t("task.regenerate")}
              </Button>
            }
          />
        ) : task.status === "unknown" ? (
          <StatePanel
            icon={<AlertTriangle className="text-amber-600" />}
            title={t("task.unknownTitle")}
            detail={t("task.unknownDetail")}
            action={
              <Button
                size="sm"
                variant="outline"
                className="active:scale-[0.98]"
                onClick={() => setRetryConfirmOpen(true)}
              >
                <RefreshCw />
                {t("task.createNewTask")}
              </Button>
            }
          />
        ) : task.status === "canceled-local" ? (
          <StatePanel icon={<Clock3 />} title={t("task.canceledTitle")} detail={t("task.canceledDetail")} />
        ) : (
          <StatePanel
            icon={
              isActive ? (
                <LoaderCircle className="animate-spin text-blue-600" />
              ) : (
                <Clock3 />
              )
            }
            title={activeLabels[task.status] ?? t("task.processing")}
            detail={t("task.imageIndex", { index: task.batchIndex + 1 })}
            progress={isActive}
          />
        )}

        <Badge
          variant="secondary"
          className="absolute left-1.5 top-1.5 bg-white/90 tabular-nums shadow-xs sm:left-2 sm:top-2"
        >
          {task.batchIndex + 1}
        </Badge>

        {asset?.isRenderable && asset.availability !== "load-error" ? (
          <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-100 transition-opacity sm:right-2 sm:top-2 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
            <IconAction label={t("common.preview")} onClick={() => setPreviewOpen(true)}>
              <Expand />
            </IconAction>
            <IconAction
              label={t("common.copyUrl")}
              onClick={() =>
                void copyText(asset.url).then(() => toast.success(t("common.copiedImageUrl")))
              }
            >
              <Copy />
            </IconAction>
            <IconAction label={t("common.download")} disabled={downloading} onClick={download}>
              {downloading ? <LoaderCircle className="animate-spin" /> : <Download />}
            </IconAction>
          </div>
        ) : null}
      </div>

      <div className="flex h-9 items-center justify-between gap-1.5 border-t px-2 text-[11px] text-muted-foreground sm:gap-2 sm:px-2.5">
        <span className="truncate">{task.requestSnapshot.resolution}</span>
        <span className="truncate">{task.requestSnapshot.aspectRatio}</span>
        <span className="truncate tabular-nums">
          {task.creditsConsumed !== undefined
            ? `${task.creditsConsumed} credits`
            : t("task.estimatedCredits", { credits: estimateGptImage2Credits(task.requestSnapshot.resolution) })}
        </span>
      </div>

      {asset?.isRenderable ? (
        <ImagePreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          src={asset.url}
          alt={t("task.resultLargeAlt", { index: task.batchIndex + 1 })}
          title={t("task.resultTitle", { index: task.batchIndex + 1 })}
        />
      ) : null}

      <AlertDialog open={retryConfirmOpen} onOpenChange={setRetryConfirmOpen}>
        <AlertDialogContent className="max-w-[min(100vw-1.5rem,28rem)]">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>{t("task.retryTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("task.retryDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void retryGenerationTask(task.localTaskId, keyFingerprint)
                  .then(() => toast.success(t("task.retryCreated")))
                  .catch((error: unknown) =>
                    toast.error(error instanceof Error ? error.message : t("task.retryFailed")),
                  );
              }}
            >
              {t("task.confirmCreate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

function StatePanel({
  icon,
  title,
  detail,
  action,
  progress,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  action?: React.ReactNode;
  progress?: boolean;
}) {
  return (
    <div className="relative flex size-full flex-col items-center justify-center gap-2 p-3 text-center sm:p-4">
      <span className="text-muted-foreground [&_svg]:size-5">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      <p className="line-clamp-2 text-xs text-muted-foreground">{detail}</p>
      {action}
      {progress ? (
        <div
          className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-neutral-200/80"
          role="progressbar"
          aria-label={title}
        >
          <div className="ui-progress-bar h-full w-1/2 bg-blue-600/80" />
        </div>
      ) : null}
    </div>
  );
}

function IconAction({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-sm"
            variant="secondary"
            className="bg-white/90 shadow-xs active:scale-[0.98]"
            onClick={onClick}
            disabled={disabled}
          />
        }
      >
        {children}
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
