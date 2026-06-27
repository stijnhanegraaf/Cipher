"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Broadcast on any vault connect/disconnect. useVault is a per-instance hook
 * (no shared store), so without this every other instance — the sidebar, the
 * reader, etc. — would keep stale state after a switch. Each instance listens
 * and re-fetches when this fires.
 */
const VAULT_CHANGED_EVENT = "cipher:vault-changed";

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
  /**
   * True when the connected vault contains a detected audits directory.
   * Drives conditional display of the Audits sidebar row.
   */
  hasAudits: boolean;
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
  hasAudits?: boolean;
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
    hasAudits: false,
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
        hasAudits: !!data.hasAudits,
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
    // Stay in sync when ANY other instance switches/disconnects the vault.
    const onChanged = () => { refresh(); };
    window.addEventListener(VAULT_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(VAULT_CHANGED_EVENT, onChanged);
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
      // Notify sibling instances (sidebar, reader, …) to re-sync.
      window.dispatchEvent(new CustomEvent(VAULT_CHANGED_EVENT));
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
      window.dispatchEvent(new CustomEvent(VAULT_CHANGED_EVENT));
    }
  }, [refresh]);

  return { ...state, connect, disconnect, refresh };
}
