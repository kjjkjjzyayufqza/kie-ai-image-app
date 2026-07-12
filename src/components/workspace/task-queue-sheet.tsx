"use client";

import { Ban, CircleAlert, CircleCheck, Clock3, LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useI18n } from "@/i18n/i18n-provider";
import type { GenerationTask } from "@/lib/domain";
import { cancelQueuedTask } from "@/lib/workspace-service";

interface TaskQueueSheetProps {
  open: boolean;
  tasks: GenerationTask[];
  onOpenChange: (open: boolean) => void;
}

export function TaskQueueSheet({ open, tasks, onOpenChange }: TaskQueueSheetProps) {
  const { t } = useI18n();
  const stateLabels: Record<GenerationTask["status"], string> = {
    queued: t("queue.status.queued"),
    submitting: t("queue.status.submitting"),
    waiting: t("queue.status.waiting"),
    queuing: t("queue.status.queuing"),
    generating: t("queue.status.generating"),
    success: t("queue.status.success"),
    fail: t("queue.status.fail"),
    stale: t("queue.status.stale"),
    unknown: t("queue.status.unknown"),
    "canceled-local": t("queue.status.canceled-local"),
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-md">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{t("queue.title")}</SheetTitle>
          <SheetDescription>{t("queue.description")}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100dvh-89px)]">
          <div className="divide-y">
            {tasks.map((task) => (
              <div key={task.localTaskId} className="flex gap-3 p-4">
                <TaskStateIcon status={task.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {task.requestSnapshot.prompt}
                    </p>
                    <Badge variant="outline" className="shrink-0">
                      {task.batchIndex + 1}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stateLabels[task.status]}
                    {task.failureMessage ? ` · ${task.failureMessage}` : ""}
                  </p>
                </div>
                {task.status === "queued" ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => void cancelQueuedTask(task.localTaskId)}
                  >
                    <Ban />
                    <span className="sr-only">{t("queue.cancelLocal")}</span>
                  </Button>
                ) : null}
              </div>
            ))}
            {tasks.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground">
                {t("queue.empty")}
              </p>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function TaskStateIcon({ status }: { status: GenerationTask["status"] }) {
  if (status === "success") {
    return <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />;
  }
  if (status === "fail" || status === "unknown") {
    return <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600" />;
  }
  if (["submitting", "waiting", "queuing", "generating"].includes(status)) {
    return (
      <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-blue-600" />
    );
  }
  return <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
}
