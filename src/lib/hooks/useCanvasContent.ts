"use client";

/**
 * useCanvasContent — fetches a .canvas file from /api/canvas and manages
 * loading / error / data state.
 *
 * Mirrors useFileContent: module-level fetch, state in .then() callbacks
 * (never synchronously in effect body), cancel-on-unmount via `cancelled` flag.
 */

import { useState, useCallback, useEffect } from "react";
import type { ParsedCanvas } from "@/lib/canvas/parse-canvas";

export interface UseCanvasContentResult {
  data: ParsedCanvas | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

async function fetchCanvas(path: string): Promise<ParsedCanvas> {
  const res = await fetch(`/api/canvas?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    throw new Error(res.status === 404 ? "Canvas file not found" : "Failed to load canvas");
  }
  return res.json() as Promise<ParsedCanvas>;
}

export function useCanvasContent(path: string): UseCanvasContentResult {
  const [data, setData] = useState<ParsedCanvas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchCanvas(path)
      .then((json) => {
        if (!cancelled) { setData(json); setLoading(false); setError(null); }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load canvas");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [path, reloadTick]);

  return { data, loading, error, reload };
}
