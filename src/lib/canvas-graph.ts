import type {
  CanvasEdge,
  CanvasGraph,
  CanvasNode,
  CanvasViewport,
} from "@/lib/domain";

export const DEFAULT_CANVAS_VIEWPORT: CanvasViewport = {
  x: 0,
  y: 0,
  zoom: 1,
};

export const DEFAULT_NODE_SIZE = { width: 280, height: 280 };
export const NODE_GAP = 40;

function cloneGraph(graph: CanvasGraph): CanvasGraph {
  return {
    roomId: graph.roomId,
    viewport: { ...graph.viewport },
    nodes: graph.nodes.map((node) => ({ ...node })),
    edges: graph.edges.map((edge) => ({ ...edge })),
    selectedNodeId: graph.selectedNodeId,
    updatedAt: graph.updatedAt,
  };
}

export function createEmptyCanvasGraph(
  roomId: string,
  now = Date.now(),
): CanvasGraph {
  if (!roomId) throw new Error("Canvas graph requires a room id.");
  return {
    roomId,
    viewport: { ...DEFAULT_CANVAS_VIEWPORT },
    nodes: [],
    edges: [],
    updatedAt: now,
  };
}

export function setCanvasViewport(
  graph: CanvasGraph,
  viewport: CanvasViewport,
  now = Date.now(),
): CanvasGraph {
  if (!(viewport.zoom > 0) || !Number.isFinite(viewport.zoom)) {
    throw new Error("Canvas zoom must be a finite number greater than 0.");
  }
  if (!Number.isFinite(viewport.x) || !Number.isFinite(viewport.y)) {
    throw new Error("Canvas pan must be finite.");
  }
  const next = cloneGraph(graph);
  next.viewport = {
    x: viewport.x,
    y: viewport.y,
    zoom: Math.min(8, Math.max(0.1, viewport.zoom)),
  };
  next.updatedAt = now;
  return next;
}

export function selectCanvasNode(
  graph: CanvasGraph,
  nodeId: string | undefined,
  now = Date.now(),
): CanvasGraph {
  if (nodeId && !graph.nodes.some((node) => node.id === nodeId)) {
    throw new Error("Cannot select a node that is not on the canvas.");
  }
  const next = cloneGraph(graph);
  next.selectedNodeId = nodeId;
  next.updatedAt = now;
  return next;
}

export function nextCanvasSlot(
  graph: CanvasGraph,
  origin?: { x: number; y: number },
): { x: number; y: number } {
  if (origin) return origin;
  const selected = graph.nodes.find((node) => node.id === graph.selectedNodeId);
  if (selected) {
    return {
      x: selected.x + selected.width + NODE_GAP,
      y: selected.y,
    };
  }
  const index = graph.nodes.length;
  const columns = 4;
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: column * (DEFAULT_NODE_SIZE.width + NODE_GAP),
    y: row * (DEFAULT_NODE_SIZE.height + NODE_GAP),
  };
}

export function placeImageNode(
  graph: CanvasGraph,
  node: Omit<CanvasNode, "kind"> & { kind?: CanvasNode["kind"] },
  now = Date.now(),
): CanvasGraph {
  if (!node.id) throw new Error("Canvas node requires an id.");
  if (graph.nodes.some((existing) => existing.id === node.id)) {
    throw new Error("Canvas node id already exists.");
  }
  const next = cloneGraph(graph);
  const placed: CanvasNode = {
    kind: node.kind ?? "image",
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    assetId: node.assetId,
    localTaskId: node.localTaskId,
    parentId: node.parentId,
    prompt: node.prompt,
    referenceUploadId: node.referenceUploadId,
    previewUrl: node.previewUrl,
  };
  next.nodes.push(placed);
  next.updatedAt = now;
  return next;
}

export function moveCanvasNode(
  graph: CanvasGraph,
  nodeId: string,
  position: { x: number; y: number },
  now = Date.now(),
): CanvasGraph {
  const index = graph.nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) throw new Error("Canvas node does not exist.");
  const next = cloneGraph(graph);
  next.nodes[index] = {
    ...next.nodes[index]!,
    x: position.x,
    y: position.y,
  };
  next.updatedAt = now;
  return next;
}

export interface CanvasLiveDeltas {
  viewport?: CanvasViewport;
  nodePositions?: Record<string, { x: number; y: number }>;
  selectedNodeId?: string | null;
}

export function pointerWorldDelta(
  origin: { x: number; y: number },
  pointerStart: { x: number; y: number },
  pointerNow: { x: number; y: number },
  zoom: number,
): { x: number; y: number } {
  if (!(zoom > 0) || !Number.isFinite(zoom)) {
    throw new Error("Canvas zoom must be a finite number greater than 0.");
  }
  return {
    x: origin.x + (pointerNow.x - pointerStart.x) / zoom,
    y: origin.y + (pointerNow.y - pointerStart.y) / zoom,
  };
}

export function commitCanvasLiveDeltas(
  graph: CanvasGraph,
  live: CanvasLiveDeltas,
  now = Date.now(),
): CanvasGraph {
  let next = graph;
  if (live.viewport) {
    next = setCanvasViewport(next, live.viewport, now);
  }
  for (const [nodeId, position] of Object.entries(live.nodePositions ?? {})) {
    next = moveCanvasNode(next, nodeId, position, now);
  }
  if (live.selectedNodeId !== undefined) {
    next = selectCanvasNode(next, live.selectedNodeId ?? undefined, now);
  }
  return next;
}

export function associateChildGeneration(
  graph: CanvasGraph,
  parentId: string,
  child: Omit<CanvasNode, "kind" | "parentId"> & {
    kind?: CanvasNode["kind"];
  },
  now = Date.now(),
): CanvasGraph {
  const parent = graph.nodes.find((node) => node.id === parentId);
  if (!parent) throw new Error("Parent canvas node does not exist.");
  const positioned = child.x === undefined || child.y === undefined
    ? child
    : child;
  const withParent = placeImageNode(
    graph,
    {
      ...positioned,
      kind: child.kind ?? "image",
      parentId,
      x:
        child.x ??
        parent.x + parent.width + NODE_GAP,
      y: child.y ?? parent.y,
    },
    now,
  );
  const edge: CanvasEdge = {
    id: `${parentId}->${child.id}`,
    sourceId: parentId,
    targetId: child.id,
    kind: "iteration",
  };
  if (withParent.edges.some((existing) => existing.id === edge.id)) {
    return withParent;
  }
  const next = cloneGraph(withParent);
  next.edges.push(edge);
  next.updatedAt = now;
  return next;
}

export function attachAssetToNode(
  graph: CanvasGraph,
  nodeId: string,
  assetId: string,
  now = Date.now(),
): CanvasGraph {
  const index = graph.nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) throw new Error("Canvas node does not exist.");
  const next = cloneGraph(graph);
  next.nodes[index] = {
    ...next.nodes[index]!,
    kind: "image",
    assetId,
  };
  next.updatedAt = now;
  return next;
}

export function referenceNodeId(uploadId: string): string {
  return `ref:${uploadId}`;
}

export function placeReferenceNode(
  graph: CanvasGraph,
  input: {
    uploadId: string;
    previewUrl: string;
    displayName?: string;
    origin?: { x: number; y: number };
  },
  now = Date.now(),
): CanvasGraph {
  const nodeId = referenceNodeId(input.uploadId);
  const existing = graph.nodes.find(
    (node) =>
      node.id === nodeId || node.referenceUploadId === input.uploadId,
  );
  if (existing) {
    return selectCanvasNode(graph, existing.id, now);
  }
  const slot = nextCanvasSlot(graph, input.origin);
  return selectCanvasNode(
    placeImageNode(
      graph,
      {
        id: nodeId,
        kind: "reference",
        x: slot.x,
        y: slot.y,
        width: DEFAULT_NODE_SIZE.width,
        height: DEFAULT_NODE_SIZE.height,
        referenceUploadId: input.uploadId,
        previewUrl: input.previewUrl,
        prompt: input.displayName,
      },
      now,
    ),
    nodeId,
    now,
  );
}

export function placeReferenceNodes(
  graph: CanvasGraph,
  uploads: Array<{
    id: string;
    temporaryUrl: string;
    displayName?: string;
  }>,
  origin?: { x: number; y: number },
  now = Date.now(),
): CanvasGraph {
  let next = graph;
  let slot = origin ?? nextCanvasSlot(graph);
  for (const upload of uploads) {
    next = placeReferenceNode(
      next,
      {
        uploadId: upload.id,
        previewUrl: upload.temporaryUrl,
        displayName: upload.displayName,
        origin: slot,
      },
      now,
    );
    slot = {
      x: slot.x + DEFAULT_NODE_SIZE.width + NODE_GAP,
      y: slot.y,
    };
  }
  return next;
}

export function removeCanvasNode(
  graph: CanvasGraph,
  nodeId: string,
  now = Date.now(),
): CanvasGraph {
  if (!graph.nodes.some((node) => node.id === nodeId)) {
    throw new Error("Canvas node does not exist.");
  }
  const next = cloneGraph(graph);
  next.nodes = next.nodes.filter((node) => node.id !== nodeId);
  next.edges = next.edges.filter(
    (edge) => edge.sourceId !== nodeId && edge.targetId !== nodeId,
  );
  if (next.selectedNodeId === nodeId) next.selectedNodeId = undefined;
  next.updatedAt = now;
  return next;
}

export function attachTaskNodes(
  graph: CanvasGraph,
  input: {
    localTaskIds: string[];
    parentNodeId?: string;
    prompt?: string;
    origin?: { x: number; y: number };
  },
  now = Date.now(),
): CanvasGraph {
  let next = graph;
  const origin = nextCanvasSlot(graph, input.origin);
  input.localTaskIds.forEach((localTaskId, index) => {
    const node = {
      id: `task:${localTaskId}`,
      kind: "generating" as const,
      x: origin.x + index * (DEFAULT_NODE_SIZE.width + NODE_GAP),
      y: origin.y,
      width: DEFAULT_NODE_SIZE.width,
      height: DEFAULT_NODE_SIZE.height,
      localTaskId,
      prompt: input.prompt,
    };
    next = input.parentNodeId
      ? associateChildGeneration(next, input.parentNodeId, node, now)
      : placeImageNode(next, node, now);
  });
  return next;
}

export function syncCanvasWithAssets(
  graph: CanvasGraph,
  assets: Array<{ id: string; localTaskId: string }>,
  now = Date.now(),
): CanvasGraph {
  const byTask = new Map(assets.map((asset) => [asset.localTaskId, asset.id]));
  let next = graph;
  for (const node of graph.nodes) {
    if (!node.localTaskId) continue;
    const assetId = byTask.get(node.localTaskId);
    if (assetId && node.assetId !== assetId) {
      next = attachAssetToNode(next, node.id, assetId, now);
    }
  }
  return next;
}

export function serializeCanvasGraph(graph: CanvasGraph): string {
  return JSON.stringify(graph);
}

export function parseCanvasGraph(raw: string): CanvasGraph {
  const parsed = JSON.parse(raw) as CanvasGraph;
  if (!parsed || typeof parsed !== "object" || !parsed.roomId) {
    throw new Error("Invalid canvas graph.");
  }
  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error("Invalid canvas graph.");
  }
  return {
    roomId: parsed.roomId,
    viewport: {
      x: parsed.viewport?.x ?? 0,
      y: parsed.viewport?.y ?? 0,
      zoom: parsed.viewport?.zoom ?? 1,
    },
    nodes: parsed.nodes.map((node) => ({ ...node })),
    edges: parsed.edges.map((edge) => ({ ...edge })),
    selectedNodeId: parsed.selectedNodeId,
    updatedAt: parsed.updatedAt,
  };
}
