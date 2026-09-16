import {
  commitCanvasLiveDeltas,
  type CanvasLiveDeltas,
} from "@/lib/canvas-graph";
import type { CanvasGraph, CanvasViewport } from "@/lib/domain";

export interface LiveCanvasBuffer {
  viewport: CanvasViewport;
  nodePositions: Record<string, { x: number; y: number }>;
  selectedNodeId: string | null | undefined;
  commitCount: number;
  setViewport: (next: CanvasViewport) => void;
  setNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  setSelectedNodeId: (nodeId: string | null | undefined) => void;
  snapshot: () => CanvasLiveDeltas;
  commit: (graph: CanvasGraph, now?: number) => CanvasGraph;
}

export function createLiveCanvasBuffer(
  viewport: CanvasViewport,
): LiveCanvasBuffer {
  const nodePositions: Record<string, { x: number; y: number }> = {};
  const buffer: LiveCanvasBuffer = {
    viewport: { ...viewport },
    nodePositions,
    selectedNodeId: undefined,
    commitCount: 0,
    setViewport(next) {
      buffer.viewport = { ...next };
    },
    setNodePosition(nodeId, position) {
      nodePositions[nodeId] = { x: position.x, y: position.y };
    },
    setSelectedNodeId(nodeId) {
      buffer.selectedNodeId = nodeId;
    },
    snapshot() {
      return {
        viewport: { ...buffer.viewport },
        nodePositions: { ...nodePositions },
        selectedNodeId: buffer.selectedNodeId,
      };
    },
    commit(graph, now = Date.now()) {
      buffer.commitCount += 1;
      return commitCanvasLiveDeltas(graph, buffer.snapshot(), now);
    },
  };
  return buffer;
}
