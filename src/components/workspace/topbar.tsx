"use client";

import {
  GalleryHorizontalEnd,
  KeyRound,
  Menu,
  MessageSquareText,
  Settings,
  SlidersHorizontal,
  WalletCards,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LocaleSwitcher } from "@/components/workspace/locale-switcher";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

interface TopbarProps {
  view: "chat" | "gallery";
  credits?: number;
  creditsStale: boolean;
  activeTaskCount: number;
  hasApiKey: boolean;
  isLeader: boolean;
  onViewChange: (view: "chat" | "gallery") => void;
  onOpenRooms: () => void;
  onOpenQueue: () => void;
  onOpenSettings: () => void;
}

export function Topbar({
  view,
  credits,
  creditsStale,
  activeTaskCount,
  hasApiKey,
  isLeader,
  onViewChange,
  onOpenRooms,
  onOpenQueue,
  onOpenSettings,
}: TopbarProps) {
  const { t } = useI18n();

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b bg-white px-2 sm:h-14 sm:gap-2 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 md:hidden"
        onClick={onOpenRooms}
        aria-label={t("topbar.openRooms")}
      >
        <Menu />
      </Button>

      <div className="mr-auto flex min-w-0 items-center gap-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-neutral-950 text-white">
          <SlidersHorizontal className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">KIE Image Workspace</p>
          <p className="hidden truncate text-[11px] text-muted-foreground xs:block sm:block">
            {t("topbar.subtitle")}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center rounded-md border p-0.5">
        <Button
          variant={view === "chat" ? "secondary" : "ghost"}
          size="sm"
          className="active:scale-[0.98]"
          onClick={() => onViewChange("chat")}
          aria-label={t("topbar.chat")}
        >
          <MessageSquareText />
          <span className="hidden sm:inline">{t("topbar.chat")}</span>
        </Button>
        <Button
          variant={view === "gallery" ? "secondary" : "ghost"}
          size="sm"
          className="active:scale-[0.98]"
          onClick={() => onViewChange("gallery")}
          aria-label={t("topbar.gallery")}
        >
          <GalleryHorizontalEnd />
          <span className="hidden sm:inline">{t("topbar.gallery")}</span>
        </Button>
      </div>

      <LocaleSwitcher className="hidden sm:flex" />

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenSettings}
              className={cn(
                "max-w-[7.5rem] shrink-0 px-2 sm:max-w-none sm:inline-flex",
              )}
            />
          }
        >
          {hasApiKey ? <WalletCards /> : <KeyRound />}
          <span className="truncate tabular-nums">
            {credits !== undefined ? (
              credits.toLocaleString()
            ) : hasApiKey ? (
              "--"
            ) : (
              <>
                <span className="hidden sm:inline">{t("topbar.configureKey")}</span>
                <span className="sm:hidden">{t("topbar.keyShort")}</span>
              </>
            )}
          </span>
          {creditsStale && credits !== undefined ? (
            <span
              className="size-1.5 shrink-0 rounded-full bg-amber-500"
              aria-label={t("topbar.creditsStale")}
            />
          ) : null}
        </TooltipTrigger>
        <TooltipContent>
          {!hasApiKey
            ? t("topbar.configureApiKey")
            : credits === undefined
              ? t("topbar.creditsNotSynced")
              : `${t("topbar.officialCreditsRemaining")}${creditsStale ? t("topbar.officialCreditsStaleSuffix") : ""}`}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="relative shrink-0"
              onClick={onOpenQueue}
              aria-label={t("topbar.taskQueue")}
            />
          }
        >
          <SlidersHorizontal />
          {activeTaskCount > 0 ? (
            <Badge className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px]">
              {activeTaskCount > 99 ? "99+" : activeTaskCount}
            </Badge>
          ) : null}
        </TooltipTrigger>
        <TooltipContent>
          {isLeader ? t("topbar.taskQueueLeader") : t("topbar.taskQueue")}
        </TooltipContent>
      </Tooltip>

      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={onOpenSettings}
        aria-label={t("common.settings")}
      >
        <Settings />
      </Button>
    </header>
  );
}
