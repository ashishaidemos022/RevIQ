"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";

/**
 * useState-like hook that persists filter values in URL search params.
 * When navigating away and back, the filter value is restored from the URL.
 * When the value equals the default, the param is removed from the URL to keep it clean.
 */
export function useFilterParam(
  key: string,
  defaultValue: string
): [string, (value: string) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const value = searchParams.get(key) ?? defaultValue;

  const setValue = useCallback(
    (newValue: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newValue === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, newValue);
      }
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
