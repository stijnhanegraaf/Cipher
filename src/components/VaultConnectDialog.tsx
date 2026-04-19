"use client";

/**
 * VaultConnectDialog — modal for connecting (or switching) the active vault.
 *
 * Posts the absolute path to /api/vault via useVault().connect(), which
 * hot-swaps without a server restart. Shows validation errors inline.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useVault } from "@/lib/hooks/useVault";

interface Props {
  open: boolean;
  onClose: () => void;
  onConnected?: (path: string, name: string) => void;
}

export function VaultConnectDialog({ open, onClose, onConnected }: Props) {
  const vault = useVault();
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPath(vault.path || "");
    setError(null);
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [open, vault.path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const submit = async () => {
    const trimmed = path.trim();
    if (!trimmed) { setError("Path is required."); return; }
    if (!trimmed.startsWith("/")) { setError("Use an absolute path (e.g. /Users/you/Obsidian)."); return; }
    setBusy(true);
    setError(null);
    const res = await vault.connect(trimmed);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "Couldn't connect."); return; }
    onConnected?.(trimmed, res.name ?? "");
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              zIndex: 400,
              backdropFilter: "blur(4px)",
            }}
          />
          <motion.div
            key="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vault-connect-title"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1.2, 0.36, 1] }}
            style={{
              position: "fixed",
              top: "20vh",
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(480px, calc(100vw - 32px))",
              background: "var(--surface-raised)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-panel)",
              boxShadow: "var(--shadow-dialog)",
              padding: 20,
              zIndex: 401,
            }}
          >
            <h2
              id="vault-connect-title"
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 20,
                lineHeight: 1.2,
                fontWeight: 400,
                margin: 0,
                color: "var(--text-primary)",
              }}
            >
              {vault.connected ? "Switch vault" : "Connect a vault"}
            </h2>
            <p className="caption" style={{ marginTop: 6, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              Absolute path to a folder of Markdown notes. Obsidian-style vaults work out of the box.
              {vault.connected && " Switching disconnects the current one."}
            </p>

            <input
              ref={inputRef}
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) submit(); }}
              placeholder="/Users/you/Documents/Obsidian"
              className="focus-ring"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              style={{
                display: "block",
                width: "100%",
                marginTop: 16,
                height: 40,
                padding: "0 12px",
                background: "var(--surface-recessed)",
                border: `1px solid ${error ? "var(--status-blocked)" : "var(--border-standard)"}`,
                borderRadius: "var(--radius-row)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontFamily: "var(--font-mono)",
                outline: "none",
              }}
            />

            {error && (
              <div className="caption" style={{ marginTop: 8, color: "var(--status-blocked)", lineHeight: 1.45 }}>
                {error}
              </div>
            )}

            <div style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={onClose}
                className="focus-ring"
                style={{
                  padding: "8px 14px",
                  border: "none",
                  background: "transparent",
                  color: "var(--text-tertiary)",
                  cursor: "pointer",
                  fontSize: 13,
                  borderRadius: "var(--radius-row)",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy || !path.trim()}
                className="focus-ring"
                style={{
                  padding: "8px 16px",
                  border: "none",
                  background: "var(--accent-brand)",
                  color: "var(--text-on-brand, #fff)",
                  cursor: busy || !path.trim() ? "default" : "pointer",
                  opacity: busy || !path.trim() ? 0.55 : 1,
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: "var(--radius-row)",
                  transition: "opacity var(--motion-micro) var(--ease-spring-soft)",
                }}
              >
                {busy ? "Connecting…" : "Connect"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
