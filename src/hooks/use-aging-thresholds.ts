"use client";

import { useState, useCallback, useEffect } from "react";
import {
  DEFAULT_STAGE_THRESHOLDS,
  type AgingThresholdMap,
} from "@/lib/deal-velocity";

const STORAGE_KEY = "revenueiq-aging-thresholds";

function loadThresholds(): AgingThresholdMap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AgingThresholdMap;
  } catch {
    return null;
  }
}

function saveThresholds(thresholds: AgingThresholdMap | null) {
  if (typeof window === "undefined") return;
  if (thresholds === null) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
  }
}

/**
 * Hook for managing configurable stage aging thresholds.
 * Persists custom thresholds to localStorage.
 * Returns `undefined` when using defaults (no custom overrides).
 */
export function useAgingThresholds() {
  const [customThresholds, setCustomThresholds] = useState<AgingThresholdMap | undefined>(() => {
    const saved = loadThresholds();
    return saved ?? undefined;
  });

  // Sync from localStorage on mount (handles SSR hydration)
  useEffect(() => {
    const saved = loadThresholds();
    setCustomThresholds(saved ?? undefined);
  }, []);

  const updateThresholds = useCallback((thresholds: AgingThresholdMap) => {
    // Check if identical to defaults — if so, clear custom
    const isDefault = Object.keys(DEFAULT_STAGE_THRESHOLDS).every((stage) => {
      const def = DEFAULT_STAGE_THRESHOLDS[stage];
      const cust = thresholds[stage];
      return cust && cust.warning === def.warning && cust.critical === def.critical;
    });

    if (isDefault) {
      saveThresholds(null);
      setCustomThresholds(undefined);
    } else {
      saveThresholds(thresholds);
      setCustomThresholds(thresholds);
    }
  }, []);

  const resetToDefaults = useCallback(() => {
    saveThresholds(null);
    setCustomThresholds(undefined);
  }, []);

  const isCustomized = customThresholds !== undefined;

  return {
    /** Pass this to analyzeStageAging / getAgingSeverity — undefined means "use defaults" */
    thresholds: customThresholds,
    /** Whether the user has customized thresholds */
    isCustomized,
    /** Save new thresholds (auto-detects if identical to defaults) */
    updateThresholds,
    /** Reset all thresholds to defaults */
    resetToDefaults,
  };
}
