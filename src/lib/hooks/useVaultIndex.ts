"use client";

/**
 * useVaultIndex — hydrates /api/vault/index once per mount. Module-level
 * memoisation so reopening the palette doesn't refetch. Revalidate by
 * calling `refresh()` (used on vault change).
 */

import { useEffect, useState } from "react";
import { log } from "@/lib/log";

export interface VaultIndex {
  files: { path: string; name: string; folder: string }[];
  entities: { path: string; name: string }[];
  projects: { path: string; name: string }[];
  hubs: { path: string; name: string }[];
}

const EMPTY: VaultIndex = { files: [], entities: [], projects: [], hubs: [] };

let _cached: VaultIndex | null = null;
let _inflight: Promise<VaultIndex> | null = null;

async function fetchIndex(): Promise<VaultIndex> {
  if (_cached) return _cached;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const res = await fetch("/api/vault/index");
      if (!res.ok) return EMPTY;
      const json = (await res.json()) as VaultIndex;
      _cached = json;
      return json;
    } catch (e) {
      log.warn("vault-index", "fetch failed", e);
      return EMPTY;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

export function invalidateVaultIndex() {
  _cached = null;
}

export function useVaultIndex(): { index: VaultIndex; loading: boolean; refresh: () => void } {
  const [index, setIndex] = useState<VaultIndex>(_cached ?? EMPTY);
  const [loading, setLoading] = useState(!_cached);

  useEffect(() => {
    let cancelled = false;
    fetchIndex().then((v) => {
      if (!cancelled) { setIndex(v); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);

  const refresh = () => {
    invalidateVaultIndex();
    setLoading(true);
    fetchIndex().then((v) => { setIndex(v); setLoading(false); });
  };

  return { index, loading, refresh };
}
