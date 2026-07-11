"use client";

import { useState } from "react";
import {
  DatabaseZap,
  Eye,
  EyeOff,
  FileJson,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AccountSnapshot } from "@/lib/domain";
import { downloadTextFile } from "@/lib/browser-actions";
import { fetchKieCredits } from "@/lib/kie-client";
import { maskApiKey, setKieApiKey } from "@/lib/key-store";
import { clearWorkspaceData, exportWorkspaceData } from "@/lib/workspace-service";

export interface BrowserUsageStats {
  todayTasks: number;
  sevenDayTasks: number;
  thirtyDayTasks: number;
  knownCreditsConsumed: number;
}

interface SettingsDialogProps {
  open: boolean;
  apiKey: string;
  snapshot?: AccountSnapshot;
  usageStats: BrowserUsageStats;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({
  open,
  apiKey,
  snapshot,
  usageStats,
  onOpenChange,
}: SettingsDialogProps) {
  const [draftKey, setDraftKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [checking, setChecking] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const saveAndCheck = async () => {
    const normalizedKey = draftKey.trim();
    if (normalizedKey.length < 16) {
      toast.error("请输入完整的 Kie API Key。");
      return;
    }
    setChecking(true);
    try {
      const result = await fetchKieCredits(normalizedKey);
      setKieApiKey(normalizedKey);
      toast.success(`连接成功，剩余 ${result.credits.toLocaleString()} credits`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Key 检查失败。");
    } finally {
      setChecking(false);
    }
  };

  const exportData = async () => {
    const json = await exportWorkspaceData();
    downloadTextFile(
      `kie-workspace-${new Date().toISOString().slice(0, 10)}.json`,
      json,
    );
    toast.success("已导出当前浏览器元数据");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setDraftKey(apiKey);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>连接设置</DialogTitle>
          <DialogDescription>
            Key 只保存在当前浏览器的 localStorage，并在请求时交给无状态代理。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kie-api-key">Kie API Key</Label>
            <div className="flex gap-2">
              <Input
                id="kie-api-key"
                type={showKey ? "text" : "password"}
                value={draftKey}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setDraftKey(event.target.value)}
                placeholder="粘贴你的 API Key"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setShowKey((value) => !value)}
                aria-label={showKey ? "隐藏 Key" : "显示 Key"}
              >
                {showKey ? <EyeOff /> : <Eye />}
              </Button>
            </div>
            {apiKey ? (
              <p className="text-xs text-muted-foreground">
                当前：{maskApiKey(apiKey)}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border bg-border text-sm">
            <div className="bg-white p-3">
              <p className="text-xs text-muted-foreground">官方 credits</p>
              <p className="mt-1 font-medium tabular-nums">
                {snapshot?.credits.toLocaleString() ?? "--"}
              </p>
            </div>
            <div className="bg-white p-3">
              <p className="text-xs text-muted-foreground">延迟</p>
              <p className="mt-1 font-medium tabular-nums">
                {snapshot ? `${snapshot.latencyMs} ms` : "--"}
              </p>
            </div>
            <div className="bg-white p-3">
              <p className="text-xs text-muted-foreground">最后检查</p>
              <p className="mt-1 font-medium">
                {snapshot
                  ? new Date(snapshot.checkedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "--"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border text-sm sm:grid-cols-4">
            <StatCell label="今日任务" value={usageStats.todayTasks} />
            <StatCell label="7 天任务" value={usageStats.sevenDayTasks} />
            <StatCell label="30 天任务" value={usageStats.thirtyDayTasks} />
            <StatCell
              label="已知消费"
              value={usageStats.knownCreditsConsumed}
            />
          </div>
          <p className="-mt-2 text-[11px] text-muted-foreground">
            以上为当前浏览器记录，不代表 Kie 全账号历史。
          </p>

          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              浏览器扩展、同源 XSS 或已被控制的设备可能读取 Key。请在 Kie 控制台设置额度上限并定期轮换。
            </p>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => void exportData()}>
              <FileJson />
              导出元数据
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => setClearConfirmOpen(true)}
            >
              <DatabaseZap />
              清空工作区
            </Button>
          </div>
        </div>

        <DialogFooter>
          {apiKey ? (
            <Button
              variant="outline"
              className="mr-auto"
              onClick={() => {
                setKieApiKey("");
                setDraftKey("");
                toast.success("已从当前浏览器清除 Key");
              }}
            >
              <Trash2 />
              清除
            </Button>
          ) : null}
          <Button onClick={saveAndCheck} disabled={checking}>
            {checking ? <RefreshCw className="animate-spin" /> : <KeyRound />}
            保存并检查
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><DatabaseZap /></AlertDialogMedia>
            <AlertDialogTitle>清空当前浏览器工作区？</AlertDialogTitle>
            <AlertDialogDescription>
              房间、任务、Prompt 和 URL 将永久删除，Kie 远端任务不会取消。API Key 会保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                void clearWorkspaceData().then(() => {
                  setClearConfirmOpen(false);
                  onOpenChange(false);
                  toast.success("当前浏览器工作区已清空");
                });
              }}
            >
              确认清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
