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
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-white px-3 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenRooms}
        aria-label="打开对话列表"
      >
        <Menu />
      </Button>

      <div className="mr-auto flex min-w-0 items-center gap-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-neutral-950 text-white">
          <SlidersHorizontal className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">KIE Image Workspace</p>
          <p className="truncate text-[11px] text-muted-foreground">
            GPT Image 2 · 浏览器本地
          </p>
        </div>
      </div>

      <div className="flex items-center rounded-md border p-0.5">
        <Button
          variant={view === "chat" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onViewChange("chat")}
        >
          <MessageSquareText />
          <span className="hidden lg:inline">对话</span>
        </Button>
        <Button
          variant={view === "gallery" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onViewChange("gallery")}
        >
          <GalleryHorizontalEnd />
          <span className="hidden lg:inline">图库</span>
        </Button>
      </div>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenSettings}
              className="hidden sm:inline-flex"
            />
          }
        >
          {hasApiKey ? <WalletCards /> : <KeyRound />}
          <span className="tabular-nums">
            {credits === undefined ? "配置 Key" : credits.toLocaleString()}
          </span>
          {creditsStale && credits !== undefined ? (
            <span className="size-1.5 rounded-full bg-amber-500" />
          ) : null}
        </TooltipTrigger>
        <TooltipContent>
          {credits === undefined
            ? "配置 Kie API Key"
            : `官方剩余 credits${creditsStale ? "（数据已过期）" : ""}`}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={onOpenQueue}
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
          任务队列{isLeader ? " · 当前标签负责调度" : ""}
        </TooltipContent>
      </Tooltip>

      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenSettings}
        aria-label="设置"
      >
        <Settings />
      </Button>
    </header>
  );
}
