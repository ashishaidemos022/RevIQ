"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

const STORAGE_PREFIX = "riq_filters:";

/**
 * Read all saved filter params for a given pathname from sessionStorage.
 */
function getSavedParams(pathname: string): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${pathname}`);
    return raw ? new URLSearchParams(raw) : new URLSearchParams();
  } catch {
    return new URLSearchParams();
  }
}

/**
 * Save filter params for a given pathname to sessionStorage.
 */
function saveParams(pathname: string, params: URLSearchParams) {
  if (typeof window === "undefined") return;
  try {
    const qs = params.toString();
    if (qs) {
      sessionStorage.setItem(`${STORAGE_PREFIX}${pathname}`, qs);
    } else {
      sessionStorage.removeItem(`${STORAGE_PREFIX}${pathname}`);
    }
  } catch {
    // sessionStorage unavailable
  }
}

// Batching: accumulate param updates within the same tick, flush once via microtask.
const pendingBatch: Map<string, { value: string; defaultValue: string }> = new Map();
let batchFlushScheduled = false;
let batchRouter: ReturnType<typeof useRouter> | null = null;
let batchPathname: string = "";

function scheduleBatchFlush() {
  if (batchFlushScheduled) return;
  batchFlushScheduled = true;
  queueMicrotask(() => {
    const router = batchRouter;
    const pathname = batchPathname;
    if (!router) { batchFlushScheduled = false; pendingBatch.clear(); return; }

    // Read fresh from the current URL so we don't lose params set by other hooks
    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : ""
    );
    const stored = getSavedParams(pathname);

    for (const [key, { value, defaultValue }] of pendingBatch) {
      if (value === defaultValue) {
        params.delete(key);
        stored.delete(key);
      } else {
        params.set(key, value);
        stored.set(key, value);
      }
    }

    saveParams(pathname, stored);
    pendingBatch.clear();
    batchFlushScheduled = false;

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  });
}

/**
 * useState-like hook that persists filter values in URL search params
 * AND sessionStorage. When navigating away via sidebar and back,
 * saved filters are restored from sessionStorage into the URL.
 *
 * Multiple concurrent setValue calls within the same tick are batched
 * into a single router.replace() to avoid clobbering each other.
 */
export function useFilterParam(
  key: string,
  defaultValue: string
): [string, (value: string) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const restoredRef = useRef(false);

  // On first mount, if the URL has no params but sessionStorage does, restore them.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    // Only restore if the URL has no filter params at all (fresh navigation from sidebar)
    if (searchParams.toString()) return;

    const saved = getSavedParams(pathname);
    if (saved.toString()) {
      router.replace(`${pathname}?${saved.toString()}`, { scroll: false });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Read value: URL param > pending batch > sessionStorage > default
  const urlValue = searchParams.get(key);
  const pendingValue = pendingBatch.has(key) ? pendingBatch.get(key)!.value : null;
  const savedValue = typeof window !== "undefined" ? getSavedParams(pathname).get(key) : null;
  const value = urlValue ?? pendingValue ?? savedValue ?? defaultValue;

  const setValue = useCallback(
    (newValue: string) => {
      // Capture router/pathname for the batched flush
      batchRouter = router;
      batchPathname = pathname;

      pendingBatch.set(key, { value: newValue, defaultValue });
      scheduleBatchFlush();
    },
    [router, pathname, key, defaultValue]
  );

  return [value, setValue];
}

/**
 * Variant for multi-select filter params (stored as comma-separated string).
 * Empty array = no filter applied (default).
 */
export function useFilterParamArray(
  key: string
): [string[], (value: string[]) => void] {
  const [strValue, setStrValue] = useFilterParam(key, "");
  const arrValue = strValue ? strValue.split(",") : [];
  const setValue = useCallback(
    (v: string[]) => setStrValue(v.length > 0 ? v.join(",") : ""),
    [setStrValue]
  );
  return [arrValue, setValue];
}

/**
 * Variant for numeric filter params (e.g., topN, offset).
 */
export function useFilterParamNumber(
  key: string,
  defaultValue: number
): [number, (value: number) => void] {
  const [strValue, setStrValue] = useFilterParam(key, String(defaultValue));
  const numValue = Number(strValue) || defaultValue;
  const setValue = useCallback(
    (v: number) => setStrValue(String(v)),
    [setStrValue]
  );
  return [numValue, setValue];
}
