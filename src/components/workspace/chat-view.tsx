"use client";

import { Copy, ImagePlus, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TaskCard } from "@/components/workspace/task-card";
import { copyText } from "@/lib/browser-actions";
import type { Asset, GenerationTask, Turn } from "@/lib/domain";

interface ChatViewProps {
  turns: Turn[];
  tasks: GenerationTask[];
  assets: Asset[];
  apiKey: string;
  keyFingerprint: string;
  hasApiKey: boolean;
  onOpenSettings: () => void;
}

export function ChatView({
  turns,
  tasks,
  assets,
  apiKey,
  keyFingerprint,
  hasApiKey,
  onOpenSettings,
}: ChatViewProps) {
  const tasksByTurn = new Map<string, GenerationTask[]>();
  for (const task of tasks) {
    const list = tasksByTurn.get(task.turnId) ?? [];
    list.push(task);
    tasksByTurn.set(task.turnId, list);
  }
  const assetsByTask = new Map(assets.map((asset) => [asset.localTaskId, asset]));

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto w-full max-w-6xl px-4 pb-52 pt-6 sm:px-6">
        {!hasApiKey ? (
          <div className="mb-6 flex items-center justify-between gap-4 border-b pb-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-md border bg-neutral-50">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Kie 尚未连接</p>
                <p className="truncate text-xs text-muted-foreground">需要 API Key 才能提交生成任务</p>
              </div>
            </div>
            <Button size="sm" onClick={onOpenSettings}>配置 Key</Button>
          </div>
        ) : null}

        {turns.length === 0 ? (
          <div className="grid min-h-[45dvh] place-items-center">
            <div className="text-center">
              <div className="mx-auto mb-3 grid size-10 place-items-center rounded-md border bg-neutral-50">
                <ImagePlus className="size-4 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">开始一段新对话</p>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {turns.map((turn) => {
              const turnTasks = (tasksByTurn.get(turn.id) ?? []).sort(
                (left, right) => left.batchIndex - right.batchIndex,
              );
              return (
                <section key={turn.id} aria-labelledby={`turn-${turn.id}`}>
                  <div className="mb-4 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 id={`turn-${turn.id}`} className="text-sm font-medium leading-6">
                          {turn.prompt}
                        </h2>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            void copyText(turn.prompt).then(() =>
                              toast.success("已复制 Prompt"),
                            )
                          }
                        >
                          <Copy />
                          <span className="sr-only">复制 Prompt</span>
                        </Button>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant="outline">{turnTasks.length}x</Badge>
                        <Badge variant="outline">{turn.parameters.resolution}</Badge>
                        <Badge variant="outline">{turn.parameters.aspectRatio}</Badge>
                        <Badge variant="outline">
                          {turn.mode === "image-to-image" ? "图生图" : "文生图"}
                        </Badge>
                      </div>
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {new Date(turn.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
