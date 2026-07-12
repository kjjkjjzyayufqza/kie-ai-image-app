"use client";

import { useMemo, useState } from "react";
import { Check, MessageSquare, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/i18n/i18n-provider";
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
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [draftTitle, setDraftTitle] = useState("");

  const visibleRooms = useMemo(() => {
    const active = rooms.filter((room) => !room.deletedAt);
    const normalized = query.trim().toLowerCase();
    if (!normalized) return active;
    return active.filter((room) => room.title.toLowerCase().includes(normalized));
  }, [query, rooms]);

  const beginRename = (room: Room) => {
    setEditingId(room.id);
    setDraftTitle(room.title);
  };

  const commitRename = () => {
    if (!editingId) return;
    onRename(editingId, draftTitle);
    setEditingId(undefined);
  };

  return (
    <aside className="flex h-full min-h-0 flex-col bg-neutral-50/80">
      <div className="space-y-2 border-b p-3">
        <Button
          className="w-full justify-start active:scale-[0.98]"
          onClick={onCreate}
        >
          <Plus />
          {t("rooms.newChat")}
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("rooms.searchPlaceholder")}
            className="pl-8"
            aria-label={t("rooms.searchAria")}
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {visibleRooms.map((room) => {
            const selected = room.id === currentRoomId;
            return (
              <div
                key={room.id}
                className={cn(
                  "group flex min-h-11 items-center gap-1 rounded-md px-1 transition-colors duration-150",
                  selected
                    ? "bg-white shadow-xs ring-1 ring-black/5"
                    : "hover:bg-white/80",
                )}
              >
                {editingId === room.id ? (
                  <>
                    <Input
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commitRename();
                        if (event.key === "Escape") setEditingId(undefined);
                      }}
                      className="h-8 min-w-0 flex-1"
                      aria-label={t("rooms.roomNameAria")}
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="active:scale-[0.98]"
                      onClick={commitRename}
                    >
                      <Check />
                      <span className="sr-only">{t("rooms.saveName")}</span>
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="active:scale-[0.98]"
                      onClick={() => setEditingId(undefined)}
                    >
                      <X />
                      <span className="sr-only">{t("rooms.cancelRename")}</span>
                    </Button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2.5 text-left text-sm active:bg-white/90"
                      onClick={() => onSelect(room.id)}
                    >
                      <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{room.title}</span>
                    </button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="opacity-100 active:scale-[0.98] sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                      onClick={() => beginRename(room)}
                    >
                      <Pencil />
                      <span className="sr-only">{t("rooms.rename")}</span>
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="opacity-100 active:scale-[0.98] sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                      onClick={() => onDelete(room.id)}
                    >
                      <Trash2 />
                      <span className="sr-only">{t("rooms.delete")}</span>
                    </Button>
                  </>
                )}
              </div>
            );
          })}
          {visibleRooms.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              {query.trim() ? t("rooms.noMatches") : t("rooms.empty")}
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </aside>
  );
}
