"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { usePersistedNumber } from "@/hooks/use-persisted-number";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";

const SIDEBAR_WIDTH_KEY = "kie-ai-workspace.sidebar-width.v1";
const MIN_WIDTH = 200;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 256;
const KEYBOARD_STEP = 16;

function clampSidebarWidth(value: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));
}

interface ResizableSidebarProps {
  children: React.ReactNode;
  className?: string;
}

export function ResizableSidebar({ children, className }: ResizableSidebarProps) {
  const { t } = useI18n();
  const labelId = useId();
  const { value: width, setValue: setWidth } = usePersistedNumber(
    SIDEBAR_WIDTH_KEY,
    DEFAULT_WIDTH,
    clampSidebarWidth,
  );
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!dragRef.current) return;
      const delta = event.clientX - dragRef.current.startX;
      setWidth(dragRef.current.startWidth + delta);
    },
    [setWidth],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  }, []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [dragging, endDrag, onPointerMove]);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startWidth: width };
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setWidth((current) => current - KEYBOARD_STEP);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setWidth((current) => current + KEYBOARD_STEP);
    } else if (event.key === "Home") {
      event.preventDefault();
      setWidth(MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      setWidth(MAX_WIDTH);
    }
  };

  return (
    <div
      className={cn("relative hidden shrink-0 border-r md:block", className)}
      style={{ width }}
      data-testid="resizable-sidebar"
    >
      <div className="h-full min-h-0 overflow-hidden">{children}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-labelledby={labelId}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startDrag}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none",
          "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent",
          "hover:after:bg-neutral-300 focus-visible:outline-none focus-visible:after:bg-neutral-900",
          "active:after:bg-neutral-900",
          dragging && "after:bg-neutral-900",
        )}
      >
        <span id={labelId} className="sr-only">
          {t("ui.resizeSidebar", { width })}
        </span>
      </div>
    </div>
  );
}
