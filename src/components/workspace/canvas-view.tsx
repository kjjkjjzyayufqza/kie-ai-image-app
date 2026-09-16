"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, RotateCcw, Sparkles, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/ui-states";
import { useAssetObjectUrl } from "@/hooks/use-asset-object-url";
import { useI18n } from "@/i18n/i18n-provider";
import {
  DEFAULT_CANVAS_VIEWPORT,
  pointerWorldDelta,
} from "@/lib/canvas-graph";
import { createLiveCanvasBuffer } from "@/lib/canvas-live";
import type {
  Asset,
  CanvasGraph,
  CanvasNode,
  CanvasViewport,
  GenerationTask,
} from "@/lib/domain";
import { saveCanvasGraph } from "@/lib/workspace-service";
import { cn } from "@/lib/utils";

interface CanvasViewProps {
  graph: CanvasGraph;
  assets: Asset[];
  tasks: GenerationTask[];
  onNodeSelected?: (node: CanvasNode) => void;
  onFilesDropped?: (files: File[], origin: { x: number; y: number }) => void;
}

const CLICK_SLOP_PX = 5;

export function CanvasView({
  graph,
  assets,
  tasks,
  onNodeSelected,
  onFilesDropped,
}: CanvasViewProps) {
  const { t } = useI18n();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const liveRef = useRef(createLiveCanvasBuffer(graph.viewport));
  const dragRef = useRef<{
    mode: "pan" | "node";
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    nodeId?: string;
  } | null>(null);
  const interactingRef = useRef(false);
  const persistTimerRef = useRef<number | undefined>(undefined);
  const [spaceDown, setSpaceDown] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [viewport, setViewport] = useState<CanvasViewport>(graph.viewport);
  const [dragPositions, setDragPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [localSelectedId, setLocalSelectedId] = useState<string | undefined>(
    graph.selectedNodeId,
  );
  const assetsById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );
  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.localTaskId, task])),
    [tasks],
  );

  useEffect(() => {
    if (interactingRef.current) return;
    liveRef.current.setViewport(graph.viewport);
    setViewport(graph.viewport);
  }, [graph.viewport.x, graph.viewport.y, graph.viewport.zoom]);

  useEffect(() => {
    if (interactingRef.current) return;
    setLocalSelectedId(graph.selectedNodeId);
  }, [graph.selectedNodeId]);

  useEffect(() => {
    setDragPositions((current) => {
      if (Object.keys(current).length === 0) return current;
      let changed = false;
      const next = { ...current };
      for (const node of graph.nodes) {
        const live = next[node.id];
        if (live && live.x === node.x && live.y === node.y) {
          delete next[node.id];
          delete liveRef.current.nodePositions[node.id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [graph.nodes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceDown(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const persistLive = useCallback(() => {
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = undefined;
    interactingRef.current = false;
    const committed = liveRef.current.commit(graphRef.current);
    void saveCanvasGraph(committed);
  }, []);

  const persistLiveSoon = useCallback(() => {
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      persistLive();
    }, 140);
  }, [persistLive]);

  const applyViewport = useCallback(
    (next: CanvasViewport) => {
      interactingRef.current = true;
      liveRef.current.setViewport(next);
      setViewport(next);
      persistLiveSoon();
    },
    [persistLiveSoon],
  );

  useEffect(() => {
    const node = surfaceRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const current = liveRef.current.viewport;
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      const nextZoom = Math.min(8, Math.max(0.1, current.zoom * factor));
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      const worldX = (cursorX - current.x) / current.zoom;
      const worldY = (cursorY - current.y) / current.zoom;
      applyViewport({
        x: cursorX - worldX * nextZoom,
        y: cursorY - worldY * nextZoom,
        zoom: nextZoom,
      });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [applyViewport]);

  const worldFromClient = (clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const current = liveRef.current.viewport;
    return {
      x: (clientX - rect.left - current.x) / current.zoom,
      y: (clientY - rect.top - current.y) / current.zoom,
    };
  };

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
    const target = event.target as HTMLElement;
    const nodeId = target
      .closest("[data-canvas-node]")
      ?.getAttribute("data-node-id");
    if (nodeId && !spaceDown && event.button === 0) {
      const node = graphRef.current.nodes.find((item) => item.id === nodeId);
      if (!node) return;
      const origin = liveRef.current.nodePositions[nodeId] ?? node;
      dragRef.current = {
        mode: "node",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: origin.x,
        originY: origin.y,
        nodeId,
      };
      interactingRef.current = true;
      liveRef.current.setSelectedNodeId(nodeId);
      setLocalSelectedId(nodeId);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button === 0 || event.button === 1 || spaceDown) {
      interactingRef.current = true;
      dragRef.current = {
        mode: "pan",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: liveRef.current.viewport.x,
        originY: liveRef.current.viewport.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.mode === "pan") {
      const next = {
        ...liveRef.current.viewport,
        x: drag.originX + (event.clientX - drag.startX),
        y: drag.originY + (event.clientY - drag.startY),
      };
      liveRef.current.setViewport(next);
      setViewport(next);
      return;
    }
    if (!drag.nodeId) return;
    const position = pointerWorldDelta(
      { x: drag.originX, y: drag.originY },
      { x: drag.startX, y: drag.startY },
      { x: event.clientX, y: event.clientY },
      liveRef.current.viewport.zoom,
    );
    liveRef.current.setNodePosition(drag.nodeId, position);
    setDragPositions({ ...liveRef.current.nodePositions });
  };

  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const moved =
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >
      CLICK_SLOP_PX;
    if (drag.mode === "node" && drag.nodeId && !moved) {
      const node = graphRef.current.nodes.find((item) => item.id === drag.nodeId);
      if (node) onNodeSelected?.(node);
    }
    persistLive();
  };

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-neutral-50">
      <div
        ref={surfaceRef}
        data-testid="canvas-surface"
        className={cn(
          "absolute inset-0 touch-none overflow-hidden",
          spaceDown && "cursor-grab",
          dropActive && "cursor-copy",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.stopPropagation();
          setDropActive(true);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setDropActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDropActive(false);
          const files = Array.from(event.dataTransfer.files).filter((file) =>
            file.type.startsWith("image/"),
          );
          if (files.length === 0) return;
          onFilesDropped?.(files, worldFromClient(event.clientX, event.clientY));
        }}
        onClick={(event) => {
          if (
            (event.target as HTMLElement).getAttribute("data-testid") ===
            "canvas-surface"
          ) {
            liveRef.current.setSelectedNodeId(null);
            setLocalSelectedId(undefined);
            persistLive();
          }
        }}
      >
        <div
          className="canvas-grid pointer-events-none absolute inset-0"
          style={{
            backgroundPosition: `${viewport.x}px ${viewport.y}px`,
            backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
          }}
        />
        <svg className="pointer-events-none absolute inset-0 size-full">
          {graph.edges.map((edge) => {
            const source = graph.nodes.find((node) => node.id === edge.sourceId);
            const target = graph.nodes.find((node) => node.id === edge.targetId);
            if (!source || !target) return null;
            const sourcePos = dragPositions[source.id] ?? source;
            const targetPos = dragPositions[target.id] ?? target;
            const x1 =
              viewport.x + (sourcePos.x + source.width) * viewport.zoom;
            const y1 =
              viewport.y + (sourcePos.y + source.height / 2) * viewport.zoom;
            const x2 = viewport.x + targetPos.x * viewport.zoom;
            const y2 =
              viewport.y + (targetPos.y + target.height / 2) * viewport.zoom;
            return (
              <line
                key={edge.id}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#a3a3a3"
                strokeWidth={1.5}
              />
            );
          })}
        </svg>
        <div
          className="absolute left-0 top-0 origin-top-left will-change-transform"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          }}
        >
          {graph.nodes.map((node) => {
            const position = dragPositions[node.id];
            const asset = node.assetId ? assetsById.get(node.assetId) : undefined;
            const task = node.localTaskId
              ? tasksById.get(node.localTaskId)
              : undefined;
            return (
              <CanvasNodeCard
                key={node.id}
                nodeId={node.id}
                selected={localSelectedId === node.id}
                x={position?.x ?? node.x}
                y={position?.y ?? node.y}
                width={node.width}
                height={node.height}
                kind={node.kind}
                prompt={node.prompt}
                previewUrl={node.previewUrl}
                asset={asset}
                status={task?.status}
              />
            );
          })}
        </div>
        {graph.nodes.length === 0 ? (
          <EmptyState
            icon={<Sparkles />}
            title={t("canvas.emptyTitle")}
            description={t("canvas.emptyDescription")}
            className="pointer-events-none absolute inset-0 bg-transparent"
          />
        ) : null}
        {dropActive ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-neutral-900/10 text-sm font-medium">
            {t("canvas.dropToAdd")}
          </div>
        ) : null}
      </div>

      <div className="absolute right-3 top-3 flex gap-1 rounded-md border bg-white/95 p-1 shadow-sm">
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() =>
            applyViewport({
              ...viewport,
              zoom: Math.min(8, viewport.zoom * 1.15),
            })
          }
          aria-label={t("canvas.zoomIn")}
        >
          <ZoomIn />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() =>
            applyViewport({
              ...viewport,
              zoom: Math.max(0.1, viewport.zoom / 1.15),
            })
          }
          aria-label={t("canvas.zoomOut")}
        >
          <ZoomOut />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => applyViewport({ ...DEFAULT_CANVAS_VIEWPORT })}
          aria-label={t("canvas.resetView")}
        >
          <RotateCcw />
        </Button>
      </div>
    </div>
  );
}

function CanvasNodeCard({
  nodeId,
  selected,
  x,
  y,
  width,
  height,
  kind,
  prompt,
  previewUrl,
  asset,
  status,
}: {
  nodeId: string;
  selected: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: CanvasNode["kind"];
  prompt?: string;
  previewUrl?: string;
  asset?: Asset;
  status?: GenerationTask["status"];
}) {
  const { t } = useI18n();
  const stored = useAssetObjectUrl(previewUrl ? undefined : asset);
  const src = previewUrl ?? stored.src;
  const generating =
    kind === "generating" ||
    (status && status !== "success" && status !== "fail");

  return (
    <article
      data-canvas-node
      data-node-id={nodeId}
      data-kind={kind}
      data-testid="canvas-node"
      className={cn(
        "absolute overflow-hidden rounded-lg border bg-white shadow-sm",
        selected && "ring-2 ring-neutral-900",
        kind === "reference" && "ring-1 ring-neutral-400",
      )}
      style={{ left: x, top: y, width, height }}
    >
      <div className="relative size-full bg-neutral-100">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={prompt ?? t("canvas.imageAlt")}
            draggable={false}
            className="size-full object-cover"
          />
        ) : generating || stored.pending ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" />
            {t("canvas.generating")}
          </div>
        ) : (
          <div className="flex size-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
            {stored.persistError ?? prompt ?? t("canvas.imageAlt")}
          </div>
        )}
        {kind === "reference" ? (
          <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            {t("canvas.referenceBadge")}
          </span>
        ) : null}
      </div>
    </article>
  );
}
