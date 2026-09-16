"use client";

import { ImageOff } from "lucide-react";

import { ImageLoadFrame } from "@/components/workspace/ui-states";
import { useAssetObjectUrl } from "@/hooks/use-asset-object-url";
import { useI18n } from "@/i18n/i18n-provider";
import type { Asset } from "@/lib/domain";
import { cn } from "@/lib/utils";

interface StoredImageProps {
  asset: Asset;
  alt: string;
  className?: string;
  onLoad?: () => void;
}

export function StoredImage({ asset, alt, className, onLoad }: StoredImageProps) {
  const { t } = useI18n();
  const { src, local, pending, persistError } = useAssetObjectUrl(asset);
  const loaded = Boolean(src) && !pending;

  if (!src) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center">
        <ImageOff className="size-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          {pending
            ? t("gallery.persistPending")
            : persistError ?? t("gallery.persistFailed")}
        </p>
      </div>
    );
  }

  return (
    <ImageLoadFrame loaded={loaded || asset.availability === "available"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        data-local-asset={local ? "true" : "false"}
        className={cn(
          "size-full object-cover transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0",
          className,
        )}
        onLoad={onLoad}
      />
    </ImageLoadFrame>
  );
}
