"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import {
  fingerprintApiKey,
  getKieApiKey,
  subscribeToKieKey,
} from "@/lib/key-store";

export function useKieKey() {
  const apiKey = useSyncExternalStore(
    subscribeToKieKey,
    getKieApiKey,
    () => "",
  );
  const [fingerprint, setFingerprint] = useState("");

  useEffect(() => {
    let active = true;
    void fingerprintApiKey(apiKey).then((value) => {
      if (active) setFingerprint(value);
    });
    return () => {
      active = false;
    };
  }, [apiKey]);

  return { apiKey, fingerprint };
}
