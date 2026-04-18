"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Shared client-side vault state. Fetches /api/vault once per mount,
 * exposes connect() to hot-swap without a server restart.
 */
export interface VaultState {
  /** Absolute path of the active vault, or "" when none is connected. */
  path: string;
  /** Basename of the active vault (used in Obsidian deep-links). */
  name: string;
  connected: boolean;
  loading: boolean;
  error?: string;
  /** Connect (or switch) to a new vault path. Rejects on server-side validation error. */
  connect: (path: string) => Promise<{ ok: boolean; error?: string; name?: string }>;
  /** Disconnect the current vault. */
  disconnect: () => Promise<void>;
  /** Manually refresh state from /api/vault. */
  refresh: () => Promise<void>;
}

interface VaultResponse {
  activePath: string;
  name: string;
  connected: boolean;
}

/**
 * Subscribe to the server's active-vault state.
 *
 * On mount, GETs `/api/vault` to learn path / name / connected. Exposes
 * `connect(path)` (POST `/api/vault`, hot-swap without restart),
 * `disconnect()` (DELETE), and `refresh()` for manual resync. Errors
 * surface via the `error` field rather than throwing.
 */
export function useVault(): VaultState {
  const [state, setState] = useState<Omit<VaultState, "connect" | "disconnect" | "refresh">>({
    path: "",
    name: "",
    connected: false,
    loading: true,
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/vault");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as VaultResponse;
      setState({
        path: data.activePath || "",
        name: data.name || "",
        connected: !!data.connected,
        loading: false,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load vault state",
      }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const connect = useCallback(async (path: string) => {
    try {
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || `HTTP ${res.status}` };
      }
      await refresh();
      return { ok: true, name: data.name };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Network error" };
    }
  }, [refresh]);

  const disconnect = useCallback(async () => {
    try {
      await fetch("/api/vault", { method: "DELETE" });
    } finally {
      await refresh();
    }
  }, [refresh]);

  return { ...state, connect, disconnect, refresh };
}
