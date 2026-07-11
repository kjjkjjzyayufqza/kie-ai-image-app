"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { ChatView } from "@/components/workspace/chat-view";
import { Composer } from "@/components/workspace/composer";
import { GalleryView } from "@/components/workspace/gallery-view";
import { RoomSidebar } from "@/components/workspace/room-sidebar";
import { SettingsDialog } from "@/components/workspace/settings-dialog";
import { TaskQueueSheet } from "@/components/workspace/task-queue-sheet";
import { Topbar } from "@/components/workspace/topbar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useKieKey } from "@/hooks/use-kie-key";
import { useTaskCoordinator } from "@/hooks/use-task-coordinator";
import { createInitialRoom, db } from "@/lib/db";
import {
  createRoom,
  deleteRoom,
  renameRoom,
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
  const { apiKey, fingerprint } = useKieKey();
  const { isLeader } = useTaskCoordinator(apiKey, fingerprint);
  const [currentRoomId, setCurrentRoomId] = useState<string>();
  const [view, setView] = useState<"chat" | "gallery">("chat");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [mobileRoomsOpen, setMobileRoomsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const queriedRooms = useLiveQuery(
    () => db.rooms.orderBy("updatedAt").reverse().toArray(),
    [],
  );
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
    useLiveQuery(() => db.assets.orderBy("createdAt").reverse().toArray(), []) ?? [];
  const allTurns = useLiveQuery(() => db.turns.toArray(), []) ?? [];
  const collections =
    useLiveQuery(() => db.collections.orderBy("createdAt").toArray(), []) ?? [];
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

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-white">
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

      <div className="flex min-h-0 flex-1">
        <div className="hidden w-64 shrink-0 border-r md:block">
          <RoomSidebar {...roomSidebarProps} />
        </div>

        <main className="relative flex min-w-0 flex-1 flex-col">
          {view === "gallery" ? (
            <GalleryView
              assets={allAssets}
              tasks={allTasks}
              turns={allTurns}
              collections={collections}
              apiKey={apiKey}
            />
          ) : (
            <>
              <ChatView
                turns={turns}
                tasks={roomTasks}
                assets={roomAssets}
                apiKey={apiKey}
                keyFingerprint={fingerprint}
                hasApiKey={Boolean(apiKey)}
                onOpenSettings={() => setSettingsOpen(true)}
              />
              {currentRoomId ? (
                <Composer
                  key={currentRoomId}
                  roomId={currentRoomId}
                  apiKey={apiKey}
                  keyFingerprint={fingerprint}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
              ) : null}
            </>
          )}
        </main>
      </div>

      <Sheet open={mobileRoomsOpen} onOpenChange={setMobileRoomsOpen}>
        <SheetContent side="left" className="w-[min(88vw,320px)] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>对话列表</SheetTitle>
            <SheetDescription>选择或创建图片对话</SheetDescription>
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
