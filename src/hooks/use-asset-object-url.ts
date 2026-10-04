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
  const assetId = asset?.id;
  const revision = assetId
    ? objectUrlRevision(assetId, [
        asset.persistStatus,
        asset.chunkCount,
        asset.url,
      ])
    : "";
  const cached = revision ? getCachedObjectUrl(revision) : undefined;
  const [trackedRevision, setTrackedRevision] = useState(revision);
  const [src, setSrc] = useState<string | undefined>(cached);
  const [local, setLocal] = useState(Boolean(cached));
  const [pending, setPending] = useState(!cached && Boolean(assetId));

  if (revision !== trackedRevision) {
    const hit = revision ? getCachedObjectUrl(revision) : undefined;
    setTrackedRevision(revision);
    setSrc(hit);
    setLocal(Boolean(hit));
    setPending(!hit && Boolean(assetId));
  }

  useEffect(() => {
    if (!assetId) {
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

    const remoteUrl = asset?.url || undefined;
    let cancelled = false;
    setPending(true);
    setLocal(false);

    void loadAssetBytes(assetId)
      .then((stored) => {
        if (cancelled) return;
        if (stored) {
          const url = rememberObjectUrl(
            assetId,
            revision,
            new Blob([stored.bytes.slice()], { type: stored.mimeType }),
          );
          setSrc(url);
          setLocal(true);
          setPending(false);
          return;
        }
        setLocal(false);
        setPending(false);
        setSrc(remoteUrl);
      })
      .catch(() => {
        if (cancelled) return;
        setLocal(false);
        setPending(false);
        setSrc(remoteUrl);
      });

    return () => {
      cancelled = true;
    };
  }, [asset?.url, assetId, revision]);

  return {
    src,
    local,
    pending,
    persistError: asset?.persistError,
  };
}
