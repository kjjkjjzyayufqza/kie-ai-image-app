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
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(60);
  const [previewAsset, setPreviewAsset] = useState<Asset>();
  const [downloadingId, setDownloadingId] = useState<string>();
  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.localTaskId, task])),
    [tasks],
  );
  const turnsById = useMemo(
    () => new Map(turns.map((turn) => [turn.id, turn])),
    [turns],
  );
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
      toast.error("请先配置 Kie API Key。");
      return;
    }
    setDownloadingId(asset.id);
    try {
      openExternalUrl(await fetchKieDownloadUrl(apiKey, asset.url));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "下载失败。");
    } finally {
      setDownloadingId(undefined);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVisibleLimit(60);
              }}
              placeholder="搜索 Prompt"
              className="pl-8"
            />
          </div>
          <Button
            variant={favoritesOnly ? "secondary" : "outline"}
            onClick={() => setFavoritesOnly((value) => !value)}
            aria-pressed={favoritesOnly}
          >
            <Heart className={cn(favoritesOnly && "fill-current")} />
            收藏
          </Button>
          <Select
            value={availability}
            onValueChange={(value) => setAvailability(value as AvailabilityFilter)}
          >
            <SelectTrigger aria-label="图片可用状态">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="available">可用</SelectItem>
              <SelectItem value="load-error">暂时无法加载</SelectItem>
              <SelectItem value="unavailable">已失效</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={collectionFilter}
            onValueChange={(value) => value && setCollectionFilter(value)}
          >
            <SelectTrigger aria-label="图库集合">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部集合</SelectItem>
              {collections.map((collection) => (
                <SelectItem key={collection.id} value={collection.id}>
                  {collection.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="outline"
            onClick={() => setCollectionDialogOpen(true)}
            aria-label="新建集合"
          >
            <Plus />
          </Button>
          <Badge variant="outline" className="tabular-nums">
            {filteredAssets.length} 张
          </Badge>
        </div>

        {filteredAssets.length === 0 ? (
          <div className="grid min-h-[55dvh] place-items-center">
            <div className="text-center">
              <div className="mx-auto mb-3 grid size-10 place-items-center rounded-md border bg-neutral-50">
                <GalleryHorizontalEnd className="size-4 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">图库为空</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {filteredAssets.slice(0, visibleLimit).map((asset) => {
                const task = tasksById.get(asset.localTaskId);
                const turn = task ? turnsById.get(task.turnId) : undefined;
                return (
                  <article key={asset.id} className="group overflow-hidden rounded-lg border bg-white">
                    <div className="relative aspect-square bg-neutral-100">
                      {asset.isRenderable && asset.availability !== "load-error" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={asset.url}
                          alt={turn?.prompt ?? "Kie 生成图片"}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="size-full object-cover"
                          onLoad={() => void markAssetAvailable(asset.id)}
                          onError={() => void markAssetLoadError(asset.id)}
                        />
                      ) : (
                        <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center">
                          {asset.isRenderable ? (
                            <ImageOff className="size-5 text-muted-foreground" />
                          ) : (
                            <ShieldX className="size-5 text-muted-foreground" />
                          )}
                          <p className="text-xs text-muted-foreground">
                            {asset.isRenderable ? "暂时无法加载" : "结果域名未验证"}
                          </p>
                        </div>
                      )}

                      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          className="bg-white/90 shadow-xs"
                          disabled={!asset.isRenderable}
                          onClick={() => setPreviewAsset(asset)}
                          aria-label="预览"
                        >
                          <Expand />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          className="bg-white/90 shadow-xs"
                          onClick={() => void toggleAssetFavorite(asset.id)}
                          aria-label={asset.favorite ? "取消收藏" : "收藏"}
                        >
                          <Heart className={cn(asset.favorite && "fill-current text-red-600")} />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          className="bg-white/90 shadow-xs"
                          disabled={!asset.isRenderable || downloadingId === asset.id}
                          onClick={() => void downloadAsset(asset)}
                          aria-label="下载"
                        >
                          {downloadingId === asset.id ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <Download />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="p-2.5">
                      <p className="line-clamp-2 min-h-8 text-xs leading-4">
                        {turn?.prompt ?? "Prompt 不可用"}
                      </p>
                      <div className="mt-2 flex items-center gap-1">
                        <Badge variant="outline">{task?.requestSnapshot.resolution ?? "--"}</Badge>
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {new Date(asset.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="mt-2 flex gap-1 border-t pt-2">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() =>
                            void copyText(turn?.prompt ?? "").then(() =>
                              toast.success("已复制 Prompt"),
                            )
                          }
                          aria-label="复制 Prompt"
                        >
                          <Copy />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() =>
                            void copyText(asset.url).then(() => toast.success("已复制 URL"))
                          }
                          aria-label="复制图片 URL"
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
                <Button variant="outline" onClick={() => setVisibleLimit((value) => value + 60)}>
                  加载更多
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <Dialog open={Boolean(previewAsset)} onOpenChange={(open) => !open && setPreviewAsset(undefined)}>
        <DialogContent className="max-h-[92dvh] max-w-[min(92vw,1100px)] bg-black p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>图库预览</DialogTitle>
            <DialogDescription>生成图片大图预览</DialogDescription>
          </DialogHeader>
          {previewAsset ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewAsset.url}
              alt="生成图片大图"
              referrerPolicy="no-referrer"
              className="max-h-[calc(92dvh-1rem)] w-full object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={collectionDialogOpen} onOpenChange={setCollectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建集合</DialogTitle>
            <DialogDescription>集合只保存在当前浏览器。</DialogDescription>
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
            placeholder="集合名称"
            maxLength={40}
          />
          <div className="flex justify-end">
            <Button onClick={() => void saveCollection()}>创建集合</Button>
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
      toast.success("集合已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "集合创建失败。");
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
          <Button size="icon-sm" variant="ghost" aria-label="标签和集合" />
        }
      >
        <Tags />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium">标签</p>
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
                  aria-label={`删除标签 ${tag}`}
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
              placeholder="添加标签"
              maxLength={30}
            />
            <Button size="sm" onClick={() => void addTag()}>添加</Button>
          </div>
        </div>

        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-medium">集合</p>
          <div className="max-h-36 space-y-2 overflow-y-auto">
            {collections.map((collection) => {
              const checked = asset.collectionIds.includes(collection.id);
              return (
                <Label key={collection.id} className="flex items-center gap-2 font-normal">
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
              <p className="text-xs text-muted-foreground">还没有集合</p>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
