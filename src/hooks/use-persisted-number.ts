"use client";

import { useCallback, useSyncExternalStore } from "react";

function identity(value: number): number {
  return value;
}

function readStoredNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const listeners = new Map<string, Set<() => void>>();

function subscribeKey(key: string, onStoreChange: () => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(onStoreChange);
  return () => {
    set?.delete(onStoreChange);
  };
}

function emitKey(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

/**
 * Browser-local numeric preference (panel widths, layout density, etc.).
 * Never used for secrets or image bytes.
 */
export function usePersistedNumber(
  key: string,
  fallback: number,
  clamp: (value: number) => number = identity,
) {
  const value = useSyncExternalStore(
    (onStoreChange) => subscribeKey(key, onStoreChange),
    () => clamp(readStoredNumber(key, fallback)),
    () => fallback,
  );

  const setValue = useCallback(
    (next: number | ((current: number) => number)) => {
      const current = clamp(readStoredNumber(key, fallback));
      const resolved = clamp(
        typeof next === "function" ? next(current) : next,
      );
      window.localStorage.setItem(key, String(resolved));
      emitKey(key);
    },
    [clamp, fallback, key],
  );

  return { value, setValue } as const;
}
