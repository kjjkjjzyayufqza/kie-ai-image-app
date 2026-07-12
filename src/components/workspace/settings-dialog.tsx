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
import { useI18n } from "@/i18n/i18n-provider";

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
  const { t, locale } = useI18n();
  const [draftKey, setDraftKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [checking, setChecking] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const saveAndCheck = async () => {
    const normalizedKey = draftKey.trim();
    if (normalizedKey.length < 16) {
      toast.error(t("settings.needFullKey"));
      return;
    }
    setChecking(true);
    try {
      const result = await fetchKieCredits(normalizedKey);
      setKieApiKey(normalizedKey);
      toast.success(t("settings.connectSuccess", { credits: result.credits.toLocaleString() }));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("settings.keyCheckFailed"));
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
    toast.success(t("settings.exported"));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setDraftKey(apiKey);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[min(92dvh,100dvh)] w-[min(100vw-1.5rem,28rem)] max-w-md overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription>
            {t("settings.description")}
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
                placeholder={t("settings.keyPlaceholder")}
                className="min-w-0"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="shrink-0 active:scale-[0.98]"
                onClick={() => setShowKey((value) => !value)}
                aria-label={showKey ? t("settings.hideKey") : t("settings.showKey")}
              >
                {showKey ? <EyeOff /> : <Eye />}
              </Button>
            </div>
            {apiKey ? (
              <p className="text-xs text-muted-foreground">
                {t("settings.currentKey", { masked: maskApiKey(apiKey) })}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border bg-border text-sm">
            <div className="bg-white p-2.5 sm:p-3">
              <p className="text-xs text-muted-foreground">{t("settings.officialCredits")}</p>
              <p className="mt-1 font-medium tabular-nums">
                {checking ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <RefreshCw className="size-3 animate-spin" />
                    {t("settings.checking")}
                  </span>
                ) : (
                  (snapshot?.credits.toLocaleString() ?? "--")
                )}
              </p>
            </div>
            <div className="bg-white p-2.5 sm:p-3">
              <p className="text-xs text-muted-foreground">{t("settings.latency")}</p>
              <p className="mt-1 font-medium tabular-nums">
                {snapshot ? `${snapshot.latencyMs} ms` : "--"}
              </p>
            </div>
            <div className="bg-white p-2.5 sm:p-3">
              <p className="text-xs text-muted-foreground">{t("settings.lastChecked")}</p>
              <p className="mt-1 font-medium">
                {snapshot
                  ? new Date(snapshot.checkedAt).toLocaleTimeString(locale === "zh" ? "zh-CN" : "en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "--"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border text-sm sm:grid-cols-4">
            <StatCell label={t("settings.todayTasks")} value={usageStats.todayTasks} />
            <StatCell label={t("settings.sevenDayTasks")} value={usageStats.sevenDayTasks} />
            <StatCell label={t("settings.thirtyDayTasks")} value={usageStats.thirtyDayTasks} />
            <StatCell
              label={t("settings.knownSpend")}
              value={usageStats.knownCreditsConsumed}
            />
          </div>
          <p className="-mt-2 text-[11px] text-muted-foreground">
            {t("settings.usageNote")}
          </p>

          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              {t("settings.securityNote")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              className="active:scale-[0.98]"
              onClick={() => void exportData()}
            >
              <FileJson />
              {t("settings.exportMetadata")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive active:scale-[0.98]"
              onClick={() => setClearConfirmOpen(true)}
            >
              <DatabaseZap />
              {t("settings.clearWorkspace")}
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {apiKey ? (
            <Button
              variant="outline"
              className="mr-auto active:scale-[0.98]"
              onClick={() => {
                setKieApiKey("");
                setDraftKey("");
                toast.success(t("settings.keyCleared"));
              }}
            >
              <Trash2 />
              {t("settings.clearKey")}
            </Button>
          ) : null}
          <Button
            className="active:scale-[0.98]"
            onClick={saveAndCheck}
            disabled={checking}
          >
            {checking ? <RefreshCw className="animate-spin" /> : <KeyRound />}
            {checking ? t("settings.checking") : t("settings.saveAndCheck")}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><DatabaseZap /></AlertDialogMedia>
            <AlertDialogTitle>{t("settings.clearTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.clearDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                void clearWorkspaceData().then(() => {
                  setClearConfirmOpen(false);
                  onOpenChange(false);
                  toast.success(t("settings.workspaceCleared"));
                });
              }}
            >
              {t("settings.confirmClear")}
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
