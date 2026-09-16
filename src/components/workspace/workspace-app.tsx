"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { CanvasView } from "@/components/workspace/canvas-view";
import { ChatView } from "@/components/workspace/chat-view";
import { Composer } from "@/components/workspace/composer";
import { GalleryView } from "@/components/workspace/gallery-view";
import { ResizableSidebar } from "@/components/workspace/resizable-sidebar";
import { RoomSidebar } from "@/components/workspace/room-sidebar";
import { SettingsDialog } from "@/components/workspace/settings-dialog";
import { TaskQueueSheet } from "@/components/workspace/task-queue-sheet";
import { Topbar, type WorkspaceView } from "@/components/workspace/topbar";
import { WorkspaceHydrationShell } from "@/components/workspace/ui-states";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useKieKey } from "@/hooks/use-kie-key";
import { useTaskCoordinator } from "@/hooks/use-task-coordinator";
import { useI18n } from "@/i18n/i18n-provider";
import { createInitialRoom, db } from "@/lib/db";
import { createEmptyCanvasGraph } from "@/lib/canvas-graph";
import {
  canvasNodeIdForReference,
  referenceFromCanvasNode,
} from "@/lib/canvas-references";
import type { ImageResolution, ReferenceUpload } from "@/lib/domain";
import {
  createRoom,
  deleteRoom,
  ensureCanvasGraph,
  renameRoom,
  selectCanvasGraphNode,
} from "@/lib/workspace-service";

const ACTIVE_ROOM_STORAGE_KEY = "kie-ai-workspace.active-room.v1";
const activeTaskStates = new Set([
  "queued",
  "submitting",
  "waiting",
  "queuing",
  "generating",
  "stale",
]);

export function WorkspaceApp() {
  const { t } = useI18n();
  const { apiKey, fingerprint } = useKieKey();
  const { isLeader } = useTaskCoordinator(apiKey, fingerprint);
  const [currentRoomId, setCurrentRoomId] = useState<string>();
  const [view, setView] = useState<WorkspaceView>("chat");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [mobileRoomsOpen, setMobileRoomsOpen] = useState(false);
  const [chatScrollRequest, setChatScrollRequest] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [pickedReference, setPickedReference] = useState<ReferenceUpload>();
  const [canvasDrop, setCanvasDrop] = useState<{
    files: File[];
    origin: { x: number; y: number };
  } | null>(null);
  const consumeCanvasDrop = useCallback(() => setCanvasDrop(null), []);

  const queriedRooms = useLiveQuery(
    () => db.rooms.orderBy("updatedAt").reverse().toArray(),
    [],
  );
  const hydrated = queriedRooms !== undefined;
  const rooms = useMemo(() => queriedRooms ?? [], [queriedRooms]);
  const currentRoom = rooms.find(
    (room) => room.id === currentRoomId && !room.deletedAt,
  );
  const turns =
    useLiveQuery(
      () =>
        currentRoomId
          ? db.turns.where("roomId").equals(currentRoomId).sortBy("createdAt")
          : [],
      [currentRoomId],
    ) ?? [];
  const roomTasks =
    useLiveQuery(
      () =>
        currentRoomId
          ? db.tasks.where("roomId").equals(currentRoomId).sortBy("createdAt")
          : [],
      [currentRoomId],
    ) ?? [];
  const queriedTasks = useLiveQuery(
    () => db.tasks.orderBy("updatedAt").reverse().toArray(),
    [],
  );
  const allTasks = useMemo(() => queriedTasks ?? [], [queriedTasks]);
  const roomAssets =
    useLiveQuery(
      () =>
        currentRoomId
          ? db.assets.where("roomId").equals(currentRoomId).sortBy("createdAt")
          : [],
      [currentRoomId],
    ) ?? [];
  const allAssets =
    useLiveQuery(() => db.assets.orderBy("createdAt").reverse().toArray(), []) ??
    [];
  const allTurns = useLiveQuery(() => db.turns.toArray(), []) ?? [];
  const collections =
    useLiveQuery(() => db.collections.orderBy("createdAt").toArray(), []) ?? [];
  const canvasGraph = useLiveQuery(
    () => (currentRoomId ? db.canvasGraphs.get(currentRoomId) : undefined),
    [currentRoomId],
  );
  const referenceUploads =
    useLiveQuery(() => db.referenceUploads.toArray(), []) ?? [];
  const snapshot = useLiveQuery(async () => {
    if (!fingerprint) return undefined;
    return db.accountSnapshots.where("keyFingerprint").equals(fingerprint).last();
  }, [fingerprint]);
  const activeTaskCount = useMemo(
    () => allTasks.filter((task) => activeTaskStates.has(task.status)).length,
    [allTasks],
  );
  const usageStats = useMemo(() => {
    const now = currentTime || 0;
    const oneDay = 24 * 60 * 60 * 1_000;
    const matchingTasks = allTasks.filter(
      (task) => task.keyFingerprint === fingerprint,
    );
    return {
      todayTasks: matchingTasks.filter((task) => now - task.createdAt <= oneDay)
        .length,
      sevenDayTasks: matchingTasks.filter(
        (task) => now - task.createdAt <= 7 * oneDay,
      ).length,
      thirtyDayTasks: matchingTasks.filter(
        (task) => now - task.createdAt <= 30 * oneDay,
      ).length,
      knownCreditsConsumed: matchingTasks.reduce(
        (total, task) => total + (task.creditsConsumed ?? 0),
        0,
      ),
    };
  }, [allTasks, currentTime, fingerprint]);
  const observedCreditPrices = useMemo(() => {
    const prices: Partial<Record<ImageResolution, number>> = {};
    for (const task of allTasks) {
      if (
        task.keyFingerprint === fingerprint &&
        task.creditsConsumed !== undefined &&
        task.creditsConsumed > 0 &&
        prices[task.requestSnapshot.resolution] === undefined
      ) {
        prices[task.requestSnapshot.resolution] = task.creditsConsumed;
      }
    }
    return prices;
  }, [allTasks, fingerprint]);

  useEffect(() => {
    if (rooms.length === 0) {
      void createInitialRoom().then((room) => setCurrentRoomId(room.id));
      return;
    }
    if (currentRoom) return;
    const storedRoomId = window.localStorage.getItem(ACTIVE_ROOM_STORAGE_KEY);
    const nextRoom =
      rooms.find((room) => room.id === storedRoomId && !room.deletedAt) ??
      rooms.find((room) => !room.deletedAt);
    if (nextRoom) {
      queueMicrotask(() => setCurrentRoomId(nextRoom.id));
    }
  }, [currentRoom, rooms]);

  useEffect(() => {
    const updateTime = () => setCurrentTime(Date.now());
    const timeout = window.setTimeout(updateTime, 0);
    const interval = window.setInterval(updateTime, 30_000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (currentRoomId) {
      window.localStorage.setItem(ACTIVE_ROOM_STORAGE_KEY, currentRoomId);
    }
  }, [currentRoomId]);

  useEffect(() => {
    if (view === "canvas" && currentRoomId) {
      void ensureCanvasGraph(currentRoomId);
    }
  }, [view, currentRoomId]);

  const selectRoom = (roomId: string) => {
    setCurrentRoomId(roomId);
    setView("chat");
    setMobileRoomsOpen(false);
  };

  const addRoom = async () => {
    const room = await createRoom();
    selectRoom(room.id);
  };

  const removeRoom = async (roomId: string) => {
    await deleteRoom(roomId);
    if (roomId !== currentRoomId) return;
    const nextRoom = rooms.find((room) => room.id !== roomId && !room.deletedAt);
    if (nextRoom) {
      setCurrentRoomId(nextRoom.id);
    } else {
      const room = await createRoom();
      setCurrentRoomId(room.id);
    }
  };

  const roomSidebarProps = {
    rooms,
    currentRoomId,
    onCreate: () => void addRoom(),
    onSelect: selectRoom,
    onRename: (roomId: string, title: string) => void renameRoom(roomId, title),
    onDelete: (roomId: string) => void removeRoom(roomId),
  };

  if (!hydrated) {
    return <WorkspaceHydrationShell />;
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-white pt-[env(safe-area-inset-top)]">
      <Topbar
        view={view}
        credits={snapshot?.credits}
        creditsStale={
          !snapshot || currentTime === 0 || currentTime - snapshot.checkedAt > 60_000
        }
        activeTaskCount={activeTaskCount}
        hasApiKey={Boolean(apiKey)}
        isLeader={isLeader}
        onViewChange={setView}
        onOpenRooms={() => setMobileRoomsOpen(true)}
        onOpenQueue={() => setQueueOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <ResizableSidebar>
          <RoomSidebar {...roomSidebarProps} />
        </ResizableSidebar>

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {view === "gallery" ? (
            <GalleryView
              assets={allAssets}
              tasks={allTasks}
              turns={allTurns}
              collections={collections}
              apiKey={apiKey}
            />
          ) : view === "canvas" ? (
            <>
              <CanvasView
                key={currentRoomId}
                graph={
                  canvasGraph ??
                  createEmptyCanvasGraph(currentRoomId ?? "pending")
                }
                assets={roomAssets}
                tasks={roomTasks}
                onNodeSelected={(node) => {
                  const picked = referenceFromCanvasNode(
                    node,
                    roomAssets,
                    referenceUploads,
                  );
                  if (picked) setPickedReference(picked);
                }}
                onFilesDropped={(files, origin) =>
                  setCanvasDrop({ files, origin })
                }
              />
              {currentRoomId ? (
                <Composer
                  key={`${currentRoomId}:canvas`}
                  roomId={currentRoomId}
                  apiKey={apiKey}
                  keyFingerprint={fingerprint}
                  availableCredits={snapshot?.credits}
                  observedCreditPrices={observedCreditPrices}
                  creditsStale={
                    !snapshot ||
                    currentTime === 0 ||
                    currentTime - snapshot.checkedAt > 60_000
                  }
                  layout="canvas"
                  canvasParentNodeId={canvasGraph?.selectedNodeId}
                  canvasPickedReference={pickedReference}
                  canvasDrop={canvasDrop}
                  onCanvasDropConsumed={consumeCanvasDrop}
                  onReferenceFocus={(uploadId) =>
                    void selectCanvasGraphNode(
                      currentRoomId,
                      canvasNodeIdForReference(
                        uploadId,
                        canvasGraph?.nodes ?? [],
                      ),
                    )
                  }
                  onOpenSettings={() => setSettingsOpen(true)}
                  onSubmitted={() => undefined}
                />
              ) : null}
            </>
          ) : (
            <>
              <ChatView
                turns={turns}
                tasks={roomTasks}
                assets={roomAssets}
                apiKey={apiKey}
                keyFingerprint={fingerprint}
                hasApiKey={Boolean(apiKey)}
                scrollRequest={chatScrollRequest}
                onOpenSettings={() => setSettingsOpen(true)}
              />
              {currentRoomId ? (
                <Composer
                  key={currentRoomId}
                  roomId={currentRoomId}
                  apiKey={apiKey}
                  keyFingerprint={fingerprint}
                  availableCredits={snapshot?.credits}
                  observedCreditPrices={observedCreditPrices}
                  creditsStale={
                    !snapshot ||
                    currentTime === 0 ||
                    currentTime - snapshot.checkedAt > 60_000
                  }
                  onOpenSettings={() => setSettingsOpen(true)}
                  onSubmitted={() =>
                    setChatScrollRequest((request) => request + 1)
                  }
                />
              ) : null}
            </>
          )}
        </main>
      </div>

      <Sheet open={mobileRoomsOpen} onOpenChange={setMobileRoomsOpen}>
        <SheetContent
          side="left"
          className="w-[min(88vw,320px)] max-w-full p-0 pt-[env(safe-area-inset-top)]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t("rooms.sheetTitle")}</SheetTitle>
            <SheetDescription>{t("rooms.sheetDescription")}</SheetDescription>
          </SheetHeader>
          <RoomSidebar {...roomSidebarProps} />
        </SheetContent>
      </Sheet>

      <SettingsDialog
        open={settingsOpen}
        apiKey={apiKey}
        snapshot={snapshot}
        usageStats={usageStats}
        onOpenChange={setSettingsOpen}
      />
      <TaskQueueSheet
        open={queueOpen}
        tasks={allTasks}
        onOpenChange={setQueueOpen}
      />
    </div>
  );
}
