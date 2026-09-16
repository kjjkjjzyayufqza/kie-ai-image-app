"use client";

import { useEffect, useState } from "react";

import {
  fallbackImageCatalog,
  type ImageCatalog,
} from "@/lib/image-catalog";
import { fetchKieImageCatalog } from "@/lib/kie-client";

export function useImageCatalog(apiKey: string): ImageCatalog {
  const [catalog, setCatalog] = useState<ImageCatalog>(() =>
    fallbackImageCatalog(),
  );

  useEffect(() => {
    if (!apiKey) {
      setCatalog(fallbackImageCatalog());
      return;
    }

    let cancelled = false;
    void fetchKieImageCatalog(apiKey)
      .then((data) => {
        if (cancelled) return;
        setCatalog({
          models: data.models as ImageCatalog["models"],
          costs: data.costs as ImageCatalog["costs"],
          source: data.source,
        });
      })
      .catch(() => {
        if (!cancelled) setCatalog(fallbackImageCatalog());
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  return catalog;
}
