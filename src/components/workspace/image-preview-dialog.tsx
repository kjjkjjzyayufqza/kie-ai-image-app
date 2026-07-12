"use client";

import { useState } from "react";
import {
  Grip,
  Maximize2,
  Minimize2,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";

const MIN_ZOOM = 25;
const MAX_ZOOM = 400;
const ZOOM_STEP = 25;

interface ImagePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src?: string;
  alt: string;
  title?: string;
}

export function ImagePreviewDialog({
  open,
  onOpenChange,
  src,
  alt,
  title,
}: ImagePreviewDialogProps) {
  const { t } = useI18n();
  const resolvedTitle = title ?? t("preview.title");
  const [fit, setFit] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [fullscreen, setFullscreen] = useState(false);

  const changeZoom = (next: number) => {
    setFit(false);
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setFit(true);
          setZoom(100);
          setFullscreen(false);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          "grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border border-white/15 bg-neutral-950 p-0 text-white shadow-2xl",
          fullscreen
            ? "resize-none rounded-none"
            : "rounded-lg sm:min-h-[420px] sm:min-w-[520px] sm:resize",
        )}
        style={
          fullscreen
            ? {
                top: 0,
                left: 0,
                width: "100vw",
                height: "100dvh",
                maxWidth: "100vw",
                maxHeight: "100dvh",
                transform: "none",
              }
            : {
                width: "min(96vw, 1600px)",
                height: "min(94dvh, 1100px)",
                maxWidth: "calc(100vw - 1rem)",
                maxHeight: "calc(100dvh - 1rem)",
              }
        }
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{resolvedTitle}</DialogTitle>
          <DialogDescription>{t("preview.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-12 items-center gap-1 border-b border-white/10 bg-neutral-950 px-2 py-1.5 sm:px-3">
          <p className="mr-auto min-w-0 truncate px-1 text-xs text-white/70">
            {resolvedTitle}
          </p>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            disabled={!src || (!fit && zoom <= MIN_ZOOM)}
            onClick={() => changeZoom(fit ? 75 : zoom - ZOOM_STEP)}
            aria-label={t("preview.zoomOut")}
          >
            <ZoomOut />
          </Button>
          <button
            type="button"
            className="h-8 min-w-14 rounded-md px-2 text-xs tabular-nums text-white/75 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            onClick={() => {
              setFit(true);
              setZoom(100);
            }}
            aria-label={t("preview.fitWindow")}
          >
            {fit ? t("preview.fit") : `${zoom}%`}
          </button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            disabled={!src || (!fit && zoom >= MAX_ZOOM)}
            onClick={() => changeZoom(fit ? 125 : zoom + ZOOM_STEP)}
            aria-label={t("preview.zoomIn")}
          >
            <ZoomIn />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="hidden text-white hover:bg-white/10 hover:text-white sm:inline-flex"
            onClick={() => {
              setFit(true);
              setZoom(100);
            }}
            aria-label={t("preview.resetView")}
          >
            <RotateCcw />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => setFullscreen((value) => !value)}
            aria-label={fullscreen ? t("preview.exitFullscreen") : t("preview.enterFullscreen")}
          >
            {fullscreen ? <Minimize2 /> : <Maximize2 />}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => onOpenChange(false)}
            aria-label={t("preview.close")}
          >
            <X />
          </Button>
        </div>

        <div
          className={cn(
            "min-h-0 overflow-auto overscroll-contain bg-neutral-950",
            fit ? "grid place-items-center p-2" : "p-4",
          )}
          onDoubleClick={() => {
            if (fit) changeZoom(100);
            else {
              setFit(true);
              setZoom(100);
            }
          }}
        >
          {src ? (
            // Kie result URLs are rendered directly and never pass through Next Image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={alt}
              referrerPolicy="no-referrer"
              draggable={false}
              className={cn(
                "select-none object-contain",
                fit ? "max-h-full max-w-full" : "mx-auto h-auto max-w-none",
              )}
              style={fit ? undefined : { width: `${zoom}%` }}
            />
          ) : null}
        </div>
        {!fullscreen ? (
          <Grip className="pointer-events-none absolute bottom-1 right-1 hidden size-4 text-white/35 sm:block" />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
