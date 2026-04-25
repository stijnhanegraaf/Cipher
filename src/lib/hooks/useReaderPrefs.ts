"use client";

/**
 * Reader preferences — single source of truth across every ReaderToolbar
 * instance and the Browse/File full views. Applies to CSS custom props
 * immediately so the reading surface reflects changes without re-rendering.
 */

import { useSyncExternalStore } from "react";
import {
  DEFAULT_PREFS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  applyPrefsToCssVars,
  readPrefs,
  writePrefs,
  type ReaderPrefs,
} from "@/lib/browse/reader-prefs";

let current: ReaderPrefs = DEFAULT_PREFS;
let initialised = false;
const listeners = new Set<() => void>();

function ensureInit() {
  if (initialised || typeof window === "undefined") return;
  current = readPrefs();
  applyPrefsToCssVars(current);
  initialised = true;
}

function emit() {
  for (const l of listeners) l();
}

function set(next: ReaderPrefs) {
  current = next;
  applyPrefsToCssVars(next);
  writePrefs(next);
  emit();
}

export function useReaderPrefs() {
  ensureInit();
  const prefs = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => DEFAULT_PREFS,
  );

  return {
    prefs,
    setFamily(family: ReaderPrefs["fontFamily"]) {
      if (prefs.fontFamily === family) return;
      set({ ...prefs, fontFamily: family });
    },
    bumpSize(delta: number) {
      const next = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, prefs.fontSize + delta));
      if (next === prefs.fontSize) return;
      set({ ...prefs, fontSize: next });
    },
    resetSize() {
      if (prefs.fontSize === DEFAULT_PREFS.fontSize) return;
      set({ ...prefs, fontSize: DEFAULT_PREFS.fontSize });
    },
  };
}
