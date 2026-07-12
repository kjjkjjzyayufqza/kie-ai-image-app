"use client";

import { useMemo, useState } from "react";
import {
  Copy,
  Download,
  Expand,
  GalleryHorizontalEnd,
  Heart,
  ImageOff,
  Link2,
  LoaderCircle,
  Plus,
  Search,
  ShieldX,
  Tags,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EmptyState,
  ImageLoadFrame,
} from "@/components/workspace/ui-states";
import { ImagePreviewDialog } from "@/components/workspace/image-preview-dialog";
import type {
  Asset,
  AssetCollection,
  GenerationTask,
  Turn,
} from "@/lib/domain";
import { copyText, openExternalUrl } from "@/lib/browser-actions";
import { fetchKieDownloadUrl } from "@/lib/kie-client";
import {
  markAssetAvailable,
  markAssetLoadError,
  createAssetCollection,
  setAssetTags,
  toggleAssetFavorite,
  toggleAssetCollection,
} from "@/lib/workspace-service";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";

interface GalleryViewProps {
  assets: Asset[];
  tasks: GenerationTask[];
  turns: Turn[];
  collections: AssetCollection[];
  apiKey: string;
}

type AvailabilityFilter = "all" | "available" | "load-error" | "unavailable";

export function GalleryView({
  assets,
  tasks,
  turns,
  collections,
  apiKey,
}: GalleryViewProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(60);
  const [previewAsset, setPreviewAsset] = useState<Asset>();
  const [downloadingId, setDownloadingId] = useState<string>();
  const [loadedIds, setLoadedIds] = useState<Set<string>>(() => new Set());
  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.localTaskId, task])),
    [tasks],
  );
  const turnsById = useMemo(
    () => new Map(turns.map((turn) => [turn.id, turn])),
    [turns],
  );
  const hasActiveFilters =
    favoritesOnly ||
    availability !== "all" ||
    collectionFilter !== "all" ||
    query.trim().length > 0;

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return assets
      .filter((asset) => {
        const task = tasksById.get(asset.localTaskId);
        const prompt = task ? turnsById.get(task.turnId)?.prompt ?? "" : "";
        return (
          (!favoritesOnly || asset.favorite) &&
          (availability === "all" || asset.availability === availability) &&
          (collectionFilter === "all" ||
            asset.collectionIds.includes(collectionFilter)) &&
          (!normalizedQuery ||
            prompt.toLowerCase().includes(normalizedQuery) ||
            asset.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery)))
        );
      })
      .sort((left, right) => right.createdAt - left.createdAt);
  }, [
    assets,
    availability,
    collectionFilter,
    favoritesOnly,
    query,
    tasksById,
    turnsById,
  ]);

  const downloadAsset = async (asset: Asset) => {
    if (!apiKey) {
      toast.error(t("gallery.needApiKey"));
      return;
    }
    setDownloadingId(asset.id);
    try {
      openExternalUrl(await fetchKieDownloadUrl(apiKey, asset.url));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("gallery.downloadFailed"));
    } finally {
      setDownloadingId(undefined);
    }
  };

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
      <div className="mx-auto max-w-[1600px] p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:mb-5">
          <div className="relative min-w-0 flex-1 basis-full sm:min-w-52 sm:basis-auto sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVisibleLimit(60);
              }}
              placeholder={t("gallery.searchPrompt")}
              className="pl-8"
            />
          </div>
          <Button
            variant={favoritesOnly ? "secondary" : "outline"}
            size="sm"
            className="active:scale-[0.98]"
            onClick={() => setFavoritesOnly((value) => !value)}
            aria-pressed={favoritesOnly}
          >
            <Heart className={cn(favoritesOnly && "fill-current")} />
            {t("gallery.favorites")}
          </Button>
          <Select
            value={availability}
            onValueChange={(value) => setAvailability(value as AvailabilityFilter)}
          >
            <SelectTrigger size="sm" aria-label={t("gallery.availabilityAria")} className="w-auto max-w-[9.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("gallery.allStatuses")}</SelectItem>
              <SelectItem value="available">{t("gallery.available")}</SelectItem>
              <SelectItem value="load-error">{t("gallery.loadError")}</SelectItem>
              <SelectItem value="unavailable">{t("gallery.unavailable")}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={collectionFilter}
            onValueChange={(value) => value && setCollectionFilter(value)}
          >
            <SelectTrigger size="sm" aria-label={t("gallery.collectionsAria")} className="w-auto max-w-[9.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("gallery.allCollections")}</SelectItem>
              {collections.map((collection) => (
                <SelectItem key={collection.id} value={collection.id}>
                  {collection.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon-sm"
            variant="outline"
            className="active:scale-[0.98]"
            onClick={() => setCollectionDialogOpen(true)}
            aria-label={t("gallery.newCollectionAria")}
          >
            <Plus />
          </Button>
          <Badge variant="outline" className="tabular-nums">
            {t("gallery.imageCount", { count: filteredAssets.length })}
          </Badge>
        </div>

        {filteredAssets.length === 0 ? (
          <EmptyState
            icon={<GalleryHorizontalEnd />}
            title={assets.length === 0 ? t("gallery.emptyTitle") : t("gallery.noMatchesTitle")}
            description={
              assets.length === 0
                ? t("gallery.emptyDescription")
                : hasActiveFilters
                  ? t("gallery.noMatchesDescription")
                  : t("gallery.noVisibleDescription")
            }
            action={
              hasActiveFilters ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setFavoritesOnly(false);
                    setAvailability("all");
                    setCollectionFilter("all");
                  }}
                >
                  {t("common.clearFilters")}
                </Button>
              ) : undefined
            }
            className="min-h-[55dvh]"
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {filteredAssets.slice(0, visibleLimit).map((asset) => {
                const task = tasksById.get(asset.localTaskId);
                const turn = task ? turnsById.get(task.turnId) : undefined;
                const loaded =
                  loadedIds.has(asset.id) || asset.availability === "available";
                return (
                  <article
                    key={asset.id}
                    className="group min-w-0 overflow-hidden rounded-lg border bg-white transition-shadow duration-200 hover:shadow-sm"
                  >
                    <div className="relative aspect-square bg-neutral-100">
                      {asset.isRenderable && asset.availability !== "load-error" ? (
                        <ImageLoadFrame loaded={loaded}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={asset.url}
                            alt={turn?.prompt ?? t("gallery.generatedAlt")}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className={cn(
                              "size-full object-cover transition-opacity duration-300",
                              loaded ? "opacity-100" : "opacity-0",
                            )}
                            onLoad={() => {
                              setLoadedIds((current) => {
                                const next = new Set(current);
                                next.add(asset.id);
                                return next;
                              });
                              void markAssetAvailable(asset.id);
                            }}
                            onError={() => void markAssetLoadError(asset.id)}
                          />
                        </ImageLoadFrame>
                      ) : (
                        <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center sm:p-4">
                          {asset.isRenderable ? (
                            <ImageOff className="size-5 text-muted-foreground" />
                          ) : (
                            <ShieldX className="size-5 text-muted-foreground" />
                          )}
                          <p className="text-xs text-muted-foreground">
                            {asset.isRenderable
                              ? t("gallery.loadError")
                              : t("gallery.domainUnverified")}
                          </p>
                          {asset.isRenderable ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="active:scale-[0.98]"
                              onClick={() => {
                                setLoadedIds((current) => {
                                  const next = new Set(current);
                                  next.delete(asset.id);
                                  return next;
                                });
                                void markAssetAvailable(asset.id);
                              }}
                            >
                              {t("common.retry")}
                            </Button>
                          ) : null}
                        </div>
                      )}

                      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-100 transition-opacity sm:right-2 sm:top-2 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          className="bg-white/90 shadow-xs active:scale-[0.98]"
                          disabled={!asset.isRenderable}
                          onClick={() => setPreviewAsset(asset)}
                          aria-label={t("common.preview")}
                        >
                          <Expand />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          className="bg-white/90 shadow-xs active:scale-[0.98]"
                          onClick={() => void toggleAssetFavorite(asset.id)}
                          aria-label={asset.favorite ? t("gallery.unfavorite") : t("gallery.favorite")}
                        >
                          <Heart
                            className={cn(
                              asset.favorite && "fill-current text-red-600",
                            )}
                          />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          className="bg-white/90 shadow-xs active:scale-[0.98]"
                          disabled={
                            !asset.isRenderable || downloadingId === asset.id
                          }
                          onClick={() => void downloadAsset(asset)}
                          aria-label={t("common.download")}
                        >
                          {downloadingId === asset.id ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <Download />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="p-2 sm:p-2.5">
                      <p className="line-clamp-2 min-h-8 text-xs leading-4">
                        {turn?.prompt ?? t("gallery.promptUnavailable")}
                      </p>
                      <div className="mt-2 flex items-center gap-1">
                        <Badge variant="outline">
                          {task?.requestSnapshot.resolution ?? "--"}
                        </Badge>
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {new Date(asset.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="mt-2 flex gap-1 border-t pt-2">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="active:scale-[0.98]"
                          onClick={() =>
                            void copyText(turn?.prompt ?? "").then(() =>
                              toast.success(t("common.copiedPrompt")),
                            )
                          }
                          aria-label={t("common.copyPrompt")}
                        >
                          <Copy />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="active:scale-[0.98]"
                          onClick={() =>
                            void copyText(asset.url).then(() =>
                              toast.success(t("common.copiedUrl")),
                            )
                          }
                          aria-label={t("common.copyImageUrl")}
                        >
                          <Link2 />
                        </Button>
                        <AssetMetadataEditor
                          asset={asset}
                          collections={collections}
                        />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {visibleLimit < filteredAssets.length ? (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  className="active:scale-[0.98]"
                  onClick={() => setVisibleLimit((value) => value + 60)}
                >
                  {t("common.loadMore")}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <ImagePreviewDialog
        open={Boolean(previewAsset)}
        onOpenChange={(open) => !open && setPreviewAsset(undefined)}
        src={previewAsset?.url}
        alt={t("gallery.generatedLargeAlt")}
        title={t("gallery.previewTitle")}
      />

      <Dialog open={collectionDialogOpen} onOpenChange={setCollectionDialogOpen}>
        <DialogContent className="max-w-[min(100vw-1.5rem,28rem)]">
          <DialogHeader>
            <DialogTitle>{t("gallery.newCollectionTitle")}</DialogTitle>
            <DialogDescription>{t("gallery.newCollectionDescription")}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={newCollectionName}
            onChange={(event) => setNewCollectionName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void saveCollection();
              }
            }}
            placeholder={t("gallery.collectionNamePlaceholder")}
            maxLength={40}
          />
          <div className="flex justify-end">
            <Button
              className="active:scale-[0.98]"
              onClick={() => void saveCollection()}
            >
              {t("gallery.createCollection")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  async function saveCollection() {
    try {
      await createAssetCollection(newCollectionName);
      setNewCollectionName("");
      setCollectionDialogOpen(false);
      toast.success(t("gallery.collectionCreated"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("gallery.collectionCreateFailed"));
    }
  }
}

function AssetMetadataEditor({
  asset,
  collections,
}: {
  asset: Asset;
  collections: AssetCollection[];
}) {
  const { t } = useI18n();
  const [tagText, setTagText] = useState("");

  const addTag = async () => {
    const tag = tagText.trim();
    if (!tag) return;
    await setAssetTags(asset.id, [...asset.tags, tag]);
    setTagText("");
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            className="active:scale-[0.98]"
            aria-label={t("gallery.tagsAndCollections")}
          />
        }
      >
        <Tags />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(18rem,calc(100vw-2rem))] space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium">{t("gallery.tags")}</p>
          <div className="mb-2 flex flex-wrap gap-1">
            {asset.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1">
                {tag}
                <button
                  type="button"
                  onClick={() =>
                    void setAssetTags(
                      asset.id,
                      asset.tags.filter((item) => item !== tag),
                    )
                  }
                  aria-label={t("gallery.deleteTag", { tag })}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addTag();
                }
              }}
              placeholder={t("gallery.addTagPlaceholder")}
              maxLength={30}
            />
            <Button size="sm" onClick={() => void addTag()}>
              {t("common.add")}
            </Button>
          </div>
        </div>

        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-medium">{t("gallery.collections")}</p>
          <div className="max-h-36 space-y-2 overflow-y-auto">
            {collections.map((collection) => {
              const checked = asset.collectionIds.includes(collection.id);
              return (
                <Label
                  key={collection.id}
                  className="flex items-center gap-2 font-normal"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() =>
                      void toggleAssetCollection(asset.id, collection.id)
                    }
                  />
                  <span className="truncate">{collection.name}</span>
                </Label>
              );
            })}
            {collections.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("gallery.noCollections")}</p>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
