"use client";

/**
 * Modal for adding a folder pin — folder picker + optional label.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { PinIcon, PIN_ICON_NAMES } from "@/components/ui/PinIcon";
import type { PinEntry, PinIconName } from "@/lib/settings";

interface Props {
  open: boolean;
  /** Initial values when editing an existing pin. Omit to create. */
  initial?: Partial<Pick<PinEntry, "label" | "path" | "icon">>;
  onClose: () => void;
  onSave: (values: { label: string; path: string; icon: PinIconName }) => void;
}

/**
 * Modal dialog for adding or editing a folder pin.
 *
 * Portals to `document.body` so stacking context never conflicts with the
 * sidebar. On open, debounced path input fetches folder autocomplete
 * suggestions from `/api/vault/folders`. `Escape` dismisses; `onSave`
 * fires with the normalised values, `onClose` cleans up local state.
 */
export function PinDialog({ open, initial, onClose, onSave }: Props) {
  const [path, setPath] = useState(initial?.path ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [icon, setIcon] = useState<PinIconName>(initial?.icon ?? "folder");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [labelTouched, setLabelTouched] = useState(!!initial?.label);
  const pathRef = useRef<HTMLInputElement>(null);

  // Reset state on open.
  useEffect(() => {
    if (!open) return;
    setPath(initial?.path ?? "");
    setLabel(initial?.label ?? "");
    setIcon(initial?.icon ?? "folder");
    setLabelTouched(!!initial?.label);
    setTimeout(() => pathRef.current?.focus(), 10);
  }, [open, initial]);

  // Auto-prefill label from path's last segment until the user edits it.
  useEffect(() => {
    if (labelTouched) return;
    const last = path.split("/").filter(Boolean).pop() ?? "";
    setLabel(last.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
  }, [path, labelTouched]);

  // Folder autocomplete.
  useEffect(() => {
    if (!open) return;
    const q = path.trim();
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/vault/folders?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const body = await res.json();
        setSuggestions(body.folders ?? []);
      } catch { /* aborted */ }
    })();
    return () => ctrl.abort();
  }, [path, open]);

  const canSave = useMemo(() => path.trim().length > 0 && label.trim().length > 0, [path, label]);

  const handleSave = useCallback(() => {
    if (!canSave) return;
    onSave({ label: label.trim(), path: path.trim().replace(/^\/+|\/+$/g, ""), icon });
    onClose();
  }, [canSave, label, path, icon, onSave, onClose]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Portal to document.body so the fixed-position panel can't be re-contained
  // by any transformed ancestor (framer-motion Reorder sets transform on
  // drag handles inside the Sidebar tree, which would otherwise capture
  // fixed descendants).
  if (typeof window === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={onClose}
            className="fixed inset-0"
            style={{
              zIndex: 500,
              background: "color-mix(in srgb, var(--bg-marketing) 60%, transparent)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          />
          <motion.div
            role="dialog"
            aria-label="Add pinned section"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed left-1/2 top-[20vh] -translate-x-1/2 w-[440px] max-w-[calc(100vw-32px)] flex flex-col"
            style={{
              zIndex: 501,
              borderRadius: "var(--radius-panel)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-standard)",
              boxShadow: "var(--shadow-dialog)",
              padding: 20,
              gap: 16,
              opacity: 1,
              isolation: "isolate",
            }}
          >
            <h2 className="heading-3" style={{ margin: 0, color: "var(--text-primary)" }}>
              {initial?.path ? "Edit pin" : "Add pinned section"}
            </h2>

            {/* Path */}
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.04em" }}>Path</span>
              <input
                ref={pathRef}
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) { e.preventDefault(); handleSave(); } }}
                placeholder="wiki/projects"
                className="focus-ring"
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--radius-comfortable)",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-standard)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                  outline: "none",
                }}
              />
              {suggestions.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 100, overflowY: "auto" }}>
                  {suggestions.slice(0, 10).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setPath(f)}
                      className="focus-ring mono-label"
                      style={{
                        padding: "2px 6px",
                        borderRadius: "var(--radius-small)",
                        border: "1px solid var(--border-subtle)",
                        background: "var(--bg-surface-alpha-2)",
                        color: "var(--text-tertiary)",
                        cursor: "pointer",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </label>

            {/* Label */}
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.04em" }}>Label</span>
              <input
                type="text"
                value={label}
                onChange={(e) => { setLabel(e.target.value); setLabelTouched(true); }}
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) { e.preventDefault(); handleSave(); } }}
                placeholder="Research"
                className="focus-ring"
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--radius-comfortable)",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-standard)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </label>

            {/* Icon grid */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.04em" }}>Icon</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
                {PIN_ICON_NAMES.map((n) => {
                  const selected = n === icon;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setIcon(n)}
                      aria-label={n}
                      className="focus-ring"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        height: 32,
                        borderRadius: "var(--radius-small)",
                        background: selected ? "color-mix(in srgb, var(--accent-brand) 20%, transparent)" : "transparent",
                        border: `1px solid ${selected ? "var(--accent-brand)" : "var(--border-subtle)"}`,
                        color: selected ? "var(--accent-brand)" : "var(--text-tertiary)",
                        cursor: "pointer",
                        transition: "background var(--motion-hover) var(--ease-default), color var(--motion-hover) var(--ease-default)",
                      }}
                    >
                      <PinIcon name={n} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={onClose}
                className="focus-ring"
                style={{
                  padding: "8px 14px",
                  borderRadius: "var(--radius-comfortable)",
                  background: "transparent",
                  border: "1px solid var(--border-standard)",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="focus-ring"
                style={{
                  padding: "8px 14px",
                  borderRadius: "var(--radius-comfortable)",
                  background: canSave ? "var(--accent-brand)" : "var(--bg-surface-alpha-5)",
                  border: "none",
                  color: canSave ? "var(--text-on-brand)" : "var(--text-tertiary)",
                  fontSize: 13,
                  fontWeight: 510,
                  cursor: canSave ? "pointer" : "default",
                  opacity: canSave ? 1 : 0.6,
                }}
              >
                {initial?.path ? "Save" : "Add"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
