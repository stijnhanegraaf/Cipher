"use client";

/**
 * useFileContent — fetches a vault file from /api/file and manages
 * loading / error / data state.
 *
 * Extracted from DetailPage.tsx (H, fetch-only slice).
 * FileFullPage.tsx is also converged onto this hook.
 *
 * Pattern mirrors useVaultIndex: the module-level fetch function is async
 * and all setState calls happen in .then() callbacks (never synchronously
 * in the effect body), satisfying the react-hooks/set-state-in-effect rule.
 */

import { useState, useCallback, useEffect } from "react";
import type { FileEnvelope } from "@/lib/types/file-envelope";

export interface UseFileContentResult {
  data: FileEnvelope | null;
  loading: boolean;
  error: string | null;
  /** Call to re-fetch (e.g. from the retry button in DetailStates). */
  reload: () => void;
}

async function fetchFileEnvelope(path: string): Promise<FileEnvelope> {
  const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(res.status === 404 ? "File not found" : "Failed to load file");
  return res.json() as Promise<FileEnvelope>;
}

export function useFileContent(path: string): UseFileContentResult {
  const [data, setData] = useState<FileEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Incrementing this triggers a re-fetch for the retry/reload action.
  const [reloadTick, setReloadTick] = useState(0);

  const reload = useCallback(() => {
    // Event handler (not an effect) — reset to the loading state so retry
    // re-shows the skeleton, matching the original fetchData() behaviour.
    setLoading(true);
    setError(null);
    setReloadTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchFileEnvelope(path)
      .then((json) => {
        if (!cancelled) { setData(json); setLoading(false); setError(null); }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load file");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [path, reloadTick]);

  return { data, loading, error, reload };
}
