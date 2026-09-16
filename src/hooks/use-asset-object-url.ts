"use client";

import { useEffect, useState } from "react";

import { loadAssetBytes } from "@/lib/asset-blob-store";
import type { Asset } from "@/lib/domain";
import {
  getCachedObjectUrl,
  objectUrlRevision,
  rememberObjectUrl,
} from "@/lib/object-url-cache";

export function useAssetObjectUrl(asset: Asset | undefined): {
  src?: string;
  local: boolean;
  pending: boolean;
  persistError?: string;
} {
  const revision = asset
    ? objectUrlRevision(asset.id, [
        asset.persistStatus,
        asset.chunkCount,
        asset.url,
      ])
    : "";
  const cached = revision ? getCachedObjectUrl(revision) : undefined;
  const [src, setSrc] = useState<string | undefined>(cached);
  const [local, setLocal] = useState(Boolean(cached));
  const [pending, setPending] = useState(
    !cached && asset?.persistStatus === "pending",
  );

  useEffect(() => {
    if (!asset) {
      setSrc(undefined);
      setLocal(false);
      setPending(false);
      return;
    }

    const hit = getCachedObjectUrl(revision);
    if (hit) {
      setSrc(hit);
      setLocal(true);
      setPending(false);
      return;
    }

    let cancelled = false;
    setPending(asset.persistStatus === "pending");

    void loadAssetBytes(asset.id)
      .then((stored) => {
        if (cancelled) return;
        if (stored) {
          const url = rememberObjectUrl(
            asset.id,
            revision,
            new Blob([stored.bytes as BlobPart], { type: stored.mimeType }),
          );
          setSrc(url);
          setLocal(true);
          setPending(false);
          return;
        }
        setLocal(false);
        setPending(asset.persistStatus === "pending");
        setSrc(
          asset.persistStatus === "failed" || asset.persistStatus === "pending"
            ? undefined
            : asset.url,
        );
      })
      .catch(() => {
        if (cancelled) return;
        setLocal(false);
        setPending(false);
        setSrc(asset.persistStatus === "stored" ? undefined : asset.url);
      });

    return () => {
      cancelled = true;
    };
  }, [asset, revision]);

  return {
    src,
    local,
    pending,
    persistError: asset?.persistError,
  };
}
