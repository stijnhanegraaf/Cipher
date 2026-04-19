"use client";

/**
 * useRecentFiles — client-side recent-opened files list.
 *
 * Persists to localStorage["cipher-recent-files"] as a JSON array of
 * { path, openedAt, count } entries ordered most-recent first, capped at
 * 20 entries. Dedupes on push (move-to-front). Exposes:
 *
 *   recents    most-recent paths (just paths, for rendering).
 *   entries    full entries (with openedAt + count) — for ranking bonuses.
 *   push(path) bump path to front; increment count.
 *   remove(path)
 *   clear()
 *
 * Frequency is kept alongside so the palette can boost frequently-opened
 * files in the rank score.
 */

import { useCallback, useEffect, useState } from "react";

const KEY = "cipher-recent-files";
const MAX = 20;

export interface RecentEntry {
  path: string;
  openedAt: number;  // epoch ms
  count: number;
}

function readStore(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => e && typeof e.path === "string" && typeof e.openedAt === "number" && typeof e.count === "number"
    );
  } catch {
    return [];
  }
}

function writeStore(entries: RecentEntry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX))); } catch { /* ignore quota */ }
}

export function useRecentFiles(): {
  recents: string[];
  entries: RecentEntry[];
  push: (path: string) => void;
  remove: (path: string) => void;
  clear: () => void;
} {
  const [entries, setEntries] = useState<RecentEntry[]>([]);

  // Hydrate once.
  useEffect(() => {
    setEntries(readStore());
  }, []);

  const push = useCallback((path: string) => {
    if (!path) return;
    setEntries((prev) => {
      const now = Date.now();
      const existing = prev.find((e) => e.path === path);
      const next: RecentEntry[] = existing
        ? [{ path, openedAt: now, count: existing.count + 1 }, ...prev.filter((e) => e.path !== path)]
        : [{ path, openedAt: now, count: 1 }, ...prev];
      const trimmed = next.slice(0, MAX);
      writeStore(trimmed);
      return trimmed;
    });
  }, []);

  const remove = useCallback((path: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.path !== path);
      writeStore(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }, []);

  return {
    recents: entries.map((e) => e.path),
    entries,
    push,
    remove,
    clear,
  };
}
