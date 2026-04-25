"use client";

/**
 * useSidebarPins — fetches + mutates sidebar pins via /api/settings/sidebar.
 * Returns the current pin list plus add/remove/reorder helpers.
 */

import { useCallback, useEffect, useState } from "react";
import type { PinEntry, SidebarConfig } from "@/lib/settings";
import { log } from "@/lib/log";

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const PINS_CHANGED_EVENT = "cipher:pins-changed";

async function persist(config: SidebarConfig): Promise<void> {
  const res = await fetch("/api/settings/sidebar", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `PUT failed: ${res.status}`);
  }
  // Broadcast so other useSidebarPins instances pick up the change.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PINS_CHANGED_EVENT, { detail: config.pins }));
  }
}

/**
 * Manage the sidebar pin list, persisted in `<vault>/.cipher/sidebar.json`.
 *
 * On mount, GETs `/api/settings/sidebar` to hydrate the pin list. All
 * mutations (add / remove / update / reorder) apply optimistically, then
 * fire a PUT in the background; failures are logged, UI state is kept,
 * next mount resyncs with the server.
 *
 * @returns `{ pins, loading, addPin, removePin, updatePin, reorderPins }`.
 */
export function useSidebarPins() {
  const [pins, setPins] = useState<PinEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Mount: hydrate from API.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/sidebar");
        if (!res.ok) return;
        const config: SidebarConfig = await res.json();
        if (!cancelled) setPins(config.pins);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Listen for peer updates (e.g. pin toggled in a different component
  // mounting its own useSidebarPins instance).
  useEffect(() => {
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<PinEntry[]>).detail;
      if (Array.isArray(next)) setPins(next);
    };
    window.addEventListener(PINS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PINS_CHANGED_EVENT, onChange);
  }, []);

  // Optimistic mutation. Every helper uses the functional setState form
  // so callbacks always see the latest pins without stale closures.
  // Persistence fires in the background; on failure we log and leave the
  // optimistic state in place (the next mount will resync with the server).

  const addPin = useCallback((partial: Omit<PinEntry, "id">) => {
    setPins((prev) => {
      const next = [...prev, { id: newId(), ...partial }];
      void persist({ version: 1, pins: next }).catch((e) =>
        log.error("sidebar-pins", "add failed", e)
      );
      return next;
    });
  }, []);

  const removePin = useCallback((id: string) => {
    setPins((prev) => {
      const next = prev.filter((p) => p.id !== id);
      void persist({ version: 1, pins: next }).catch((e) =>
        log.error("sidebar-pins", "remove failed", e)
      );
      return next;
    });
  }, []);

  const updatePin = useCallback((id: string, patch: Partial<Omit<PinEntry, "id">>) => {
    setPins((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
      void persist({ version: 1, pins: next }).catch((e) =>
        log.error("sidebar-pins", "update failed", e)
      );
      return next;
    });
  }, []);

  const reorderPins = useCallback((next: PinEntry[]) => {
    setPins(next);
    void persist({ version: 1, pins: next }).catch((e) =>
      log.error("sidebar-pins", "reorder failed", e)
    );
  }, []);

  return { pins, loading, addPin, removePin, updatePin, reorderPins };
}
