"use client";

import { useMemo, useState } from "react";
import { Check, MessageSquare, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Room } from "@/lib/domain";
import { cn } from "@/lib/utils";

interface RoomSidebarProps {
  rooms: Room[];
  currentRoomId?: string;
  onCreate: () => void;
  onSelect: (roomId: string) => void;
  onRename: (roomId: string, title: string) => void;
  onDelete: (roomId: string) => void;
}

export function RoomSidebar({
  rooms,
  currentRoomId,
  onCreate,
  onSelect,
  onRename,
  onDelete,
}: RoomSidebarProps) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [editingTitle, setEditingTitle] = useState("");
  const filteredRooms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rooms.filter(
      (room) =>
        !room.deletedAt &&
        (!normalizedQuery || room.title.toLowerCase().includes(normalizedQuery)),
    );
  }, [query, rooms]);

  const beginRename = (room: Room) => {
    setEditingId(room.id);
    setEditingTitle(room.title);
  };

  const commitRename = () => {
    if (editingId && editingTitle.trim()) {
      onRename(editingId, editingTitle);
    }
    setEditingId(undefined);
  };

  return (
    <aside className="flex h-full min-h-0 flex-col bg-neutral-50/80">
      <div className="space-y-2 border-b p-3">
        <Button className="w-full justify-start" onClick={onCreate}>
          <Plus />
          新建对话
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索对话"
            className="pl-8"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {filteredRooms.map((room) => {
            const isActive = room.id === currentRoomId;
            return (
              <div
                key={room.id}
                className={cn(
                  "group flex min-h-10 items-center gap-1 rounded-md px-1",
                  isActive ? "bg-white shadow-xs ring-1 ring-black/5" : "hover:bg-white/80",
                )}
              >
                {editingId === room.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commitRename();
                        if (event.key === "Escape") setEditingId(undefined);
                      }}
                      className="h-8 min-w-0 flex-1"
                    />
                    <Button size="icon-sm" variant="ghost" onClick={commitRename}>
                      <Check />
                      <span className="sr-only">保存名称</span>
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditingId(undefined)}
                    >
                      <X />
                      <span className="sr-only">取消重命名</span>
                    </Button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
                      onClick={() => onSelect(room.id)}
                    >
                      <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{room.title}</span>
                    </button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                      onClick={() => beginRename(room)}
                    >
                      <Pencil />
                      <span className="sr-only">重命名</span>
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                      onClick={() => onDelete(room.id)}
                    >
                      <Trash2 />
                      <span className="sr-only">删除对话</span>
                    </Button>
                  </>
                )}
              </div>
            );
          })}
          {filteredRooms.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              没有匹配的对话
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </aside>
  );
}
