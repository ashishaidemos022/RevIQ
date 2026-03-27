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

/**
 * useState-like hook that persists filter values in URL search params
 * AND sessionStorage. When navigating away via sidebar and back,
 * saved filters are restored from sessionStorage into the URL.
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

  // Read value: URL param > sessionStorage > default
  const urlValue = searchParams.get(key);
  const savedValue = typeof window !== "undefined" ? getSavedParams(pathname).get(key) : null;
  const value = urlValue ?? savedValue ?? defaultValue;

  const setValue = useCallback(
    (newValue: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newValue === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, newValue);
      }
      // Persist to sessionStorage
      const stored = getSavedParams(pathname);
      if (newValue === defaultValue) {
        stored.delete(key);
      } else {
        stored.set(key, newValue);
      }
      saveParams(pathname, stored);

      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname, key, defaultValue]
  );

  return [value, setValue];
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
