"use client";

import { useEffect, useRef } from "react";
import { Copy, ImagePlus, KeyRound, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TaskCard } from "@/components/workspace/task-card";
import { EmptyState } from "@/components/workspace/ui-states";
import { useI18n } from "@/i18n/i18n-provider";
import { copyText } from "@/lib/browser-actions";
import type { Asset, GenerationTask, Turn } from "@/lib/domain";

interface ChatViewProps {
  turns: Turn[];
  tasks: GenerationTask[];
  assets: Asset[];
  apiKey: string;
  keyFingerprint: string;
  hasApiKey: boolean;
  scrollRequest: number;
  onOpenSettings: () => void;
}

export function ChatView({
  turns,
  tasks,
  assets,
  apiKey,
  keyFingerprint,
  hasApiKey,
  scrollRequest,
  onOpenSettings,
}: ChatViewProps) {
  const { t, locale } = useI18n();
  const viewportRef = useRef<HTMLDivElement>(null);
  const tasksByTurn = new Map<string, GenerationTask[]>();
  for (const task of tasks) {
    const list = tasksByTurn.get(task.turnId) ?? [];
    list.push(task);
    tasksByTurn.set(task.turnId, list);
  }
  const assetsByTask = new Map(assets.map((asset) => [asset.localTaskId, asset]));

  useEffect(() => {
    if (scrollRequest === 0) return;
    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollRequest, tasks.length]);

  return (
    <ScrollArea
      viewportRef={viewportRef}
      className="min-h-0 min-w-0 flex-1"
    >
      <div className="mx-auto w-full max-w-6xl px-3 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-6">
        {!hasApiKey ? (
          <div className="mb-6 flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-md border bg-neutral-50">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("chat.notConnected")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("chat.notConnectedHint")}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full shrink-0 active:scale-[0.98] sm:w-auto"
              onClick={onOpenSettings}
            >
              <KeyRound />
              {t("chat.configureKey")}
            </Button>
          </div>
        ) : null}

        {turns.length === 0 ? (
          <EmptyState
            icon={<ImagePlus />}
            title={t("chat.emptyTitle")}
            description={
              hasApiKey ? t("chat.emptyWithKey") : t("chat.emptyWithoutKey")
            }
            action={
              !hasApiKey ? (
                <Button size="sm" onClick={onOpenSettings}>
                  {t("chat.configureKey")}
                </Button>
              ) : undefined
            }
            className="min-h-[45dvh]"
          />
        ) : (
          <div className="space-y-8 sm:space-y-10">
            {turns.map((turn) => {
              const turnTasks = (tasksByTurn.get(turn.id) ?? []).sort(
                (left, right) => left.batchIndex - right.batchIndex,
              );
              return (
                <section key={turn.id} aria-labelledby={`turn-${turn.id}`}>
                  <div className="mb-3 flex items-start gap-2 sm:mb-4 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start gap-1.5 sm:items-center sm:gap-2">
                        <h2
                          id={`turn-${turn.id}`}
                          className="min-w-0 break-words text-sm font-medium leading-6"
                        >
                          {turn.prompt}
                        </h2>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 active:scale-[0.98]"
                          onClick={() =>
                            void copyText(turn.prompt).then(() =>
                              toast.success(t("common.copiedPrompt")),
                            )
                          }
                        >
                          <Copy />
                          <span className="sr-only">{t("common.copyPrompt")}</span>
                        </Button>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge variant="outline">{turnTasks.length}x</Badge>
                        <Badge variant="outline">{turn.parameters.resolution}</Badge>
                        <Badge variant="outline">{turn.parameters.aspectRatio}</Badge>
                        <Badge variant="outline">
                          {turn.mode === "image-to-image"
                            ? t("chat.imageToImage")
                            : t("chat.textToImage")}
                        </Badge>
                      </div>
                    </div>
                    <time className="shrink-0 pt-0.5 text-xs text-muted-foreground">
                      {new Date(turn.createdAt).toLocaleTimeString(
                        locale === "zh" ? "zh-CN" : "en-US",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </time>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
                    {turnTasks.map((task) => (
                      <TaskCard
                        key={task.localTaskId}
                        task={task}
                        asset={assetsByTask.get(task.localTaskId)}
                        apiKey={apiKey}
                        keyFingerprint={keyFingerprint}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
