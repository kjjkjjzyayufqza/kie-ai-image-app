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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Asset, GenerationTask } from "@/lib/domain";
import { copyText, openExternalUrl } from "@/lib/browser-actions";
import { fetchKieDownloadUrl } from "@/lib/kie-client";
import {
  markAssetAvailable,
  markAssetLoadError,
  requestTaskRefresh,
  retryGenerationTask,
} from "@/lib/workspace-service";

interface TaskCardProps {
  task: GenerationTask;
  asset?: Asset;
  apiKey: string;
  keyFingerprint: string;
}

const activeLabels: Partial<Record<GenerationTask["status"], string>> = {
  queued: "等待提交",
  submitting: "正在提交",
  waiting: "等待处理",
  queuing: "队列中",
  generating: "生成中",
  stale: "已暂停轮询",
};

export function TaskCard({ task, asset, apiKey, keyFingerprint }: TaskCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [retryConfirmOpen, setRetryConfirmOpen] = useState(false);
  const isActive = Boolean(activeLabels[task.status]);

  const download = async () => {
    if (!asset || !apiKey) return;
    setDownloading(true);
    try {
      const url = await fetchKieDownloadUrl(apiKey, asset.url);
      openExternalUrl(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "下载链接获取失败。");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <article
      data-testid="task-card"
      className="group relative min-w-0 overflow-hidden rounded-lg border bg-white"
    >
      <div className="relative aspect-square bg-neutral-100">
        {task.status === "success" && asset?.isRenderable ? (
          asset.availability === "load-error" ? (
            <StatePanel
              icon={<ImageOff />}
              title="暂时无法加载"
              detail="图片 URL 可能仍然有效"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void requestTaskRefresh(task.localTaskId)}
                >
                  <RefreshCw />
                  重试
                </Button>
              }
            />
          ) : (
            // Kie result URLs are rendered directly and never pass through Next Image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.url}
              alt={`生成结果 ${task.batchIndex + 1}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-full object-cover"
              onLoad={() => void markAssetAvailable(asset.id)}
              onError={() => void markAssetLoadError(asset.id)}
            />
          )
        ) : task.status === "success" && asset && !asset.isRenderable ? (
          <StatePanel
            icon={<ShieldX />}
            title="结果域名未验证"
            detail="URL 已保留，暂不渲染"
          />
        ) : task.status === "fail" ? (
          <StatePanel
            icon={<AlertTriangle className="text-red-600" />}
            title="生成失败"
            detail={task.failureMessage ?? "Kie 未返回图片"}
            action={
              <Button size="sm" variant="outline" onClick={() => setRetryConfirmOpen(true)}>
                <RefreshCw />
                重新生成
              </Button>
            }
          />
        ) : task.status === "unknown" ? (
          <StatePanel
            icon={<AlertTriangle className="text-amber-600" />}
            title="提交结果未知"
            detail="不会自动重试，以免重复扣费"
            action={
              <Button size="sm" variant="outline" onClick={() => setRetryConfirmOpen(true)}>
                <RefreshCw />
                创建新任务
              </Button>
            }
          />
        ) : task.status === "canceled-local" ? (
          <StatePanel icon={<Clock3 />} title="已取消" detail="任务未提交到 Kie" />
        ) : (
          <StatePanel
            icon={
              isActive ? (
                <LoaderCircle className="animate-spin text-blue-600" />
              ) : (
                <Clock3 />
              )
            }
            title={activeLabels[task.status] ?? "处理中"}
            detail={`第 ${task.batchIndex + 1} 张`}
          />
        )}

        <Badge
          variant="secondary"
          className="absolute left-2 top-2 bg-white/90 tabular-nums shadow-xs"
        >
          {task.batchIndex + 1}
        </Badge>

        {asset?.isRenderable && asset.availability !== "load-error" ? (
          <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <IconAction label="预览" onClick={() => setPreviewOpen(true)}>
              <Expand />
            </IconAction>
            <IconAction
              label="复制 URL"
              onClick={() =>
                void copyText(asset.url).then(() => toast.success("已复制图片 URL"))
              }
            >
              <Copy />
            </IconAction>
            <IconAction label="下载" disabled={downloading} onClick={download}>
              {downloading ? <LoaderCircle className="animate-spin" /> : <Download />}
            </IconAction>
          </div>
        ) : null}
      </div>

      <div className="flex h-9 items-center justify-between gap-2 border-t px-2.5 text-[11px] text-muted-foreground">
        <span className="truncate">{task.requestSnapshot.resolution}</span>
        <span className="truncate">{task.requestSnapshot.aspectRatio}</span>
        <span className="truncate">{formatTaskState(task.status)}</span>
      </div>

      {asset?.isRenderable ? (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-h-[92dvh] max-w-[min(92vw,1100px)] bg-black p-2">
            <DialogHeader className="sr-only">
              <DialogTitle>图片预览</DialogTitle>
              <DialogDescription>生成结果大图预览</DialogDescription>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.url}
              alt={`生成结果 ${task.batchIndex + 1} 大图`}
              referrerPolicy="no-referrer"
              className="max-h-[calc(92dvh-1rem)] w-full object-contain"
            />
          </DialogContent>
        </Dialog>
      ) : null}

      <AlertDialog open={retryConfirmOpen} onOpenChange={setRetryConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><AlertTriangle /></AlertDialogMedia>
            <AlertDialogTitle>创建新的生成任务？</AlertDialogTitle>
            <AlertDialogDescription>
              原任务保持不变，新任务会再次调用 Kie 并可能再次消耗 credits。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void retryGenerationTask(task.localTaskId, keyFingerprint)
                  .then(() => toast.success("已创建新的重试任务"))
                  .catch((error: unknown) =>
                    toast.error(error instanceof Error ? error.message : "重试失败。"),
                  );
              }}
            >
              确认创建
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
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center">
      <span className="text-muted-foreground [&_svg]:size-5">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      <p className="line-clamp-2 text-xs text-muted-foreground">{detail}</p>
      {action}
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
            className="bg-white/90 shadow-xs"
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

function formatTaskState(status: GenerationTask["status"]): string {
  if (status === "success") return "完成";
  if (status === "fail") return "失败";
  if (status === "unknown") return "未知";
  if (status === "canceled-local") return "取消";
  return activeLabels[status] ?? status;
}
