"use client";

/**
 * VaultConnectDialog — modal for connecting (or switching) the active vault.
 *
 * Two modes:
 *   - Path input (default): type/paste an absolute path, connect.
 *   - Browse: walk the filesystem via /api/fs, click a directory to pick it.
 *
 * Posts the absolute path to /api/vault via useVault().connect(), which
 * hot-swaps without a server restart.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useVault } from "@/lib/hooks/useVault";

interface Props {
  open: boolean;
  onClose: () => void;
  onConnected?: (path: string, name: string) => void;
}

interface FsResponse {
  cwd: string;
  parent: string | null;
  home: string;
  dirs: { name: string; path: string }[];
}

export function VaultConnectDialog({ open, onClose, onConnected }: Props) {
  const vault = useVault();
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [fs, setFs] = useState<FsResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPath(vault.path || "");
    setError(null);
    setBrowseOpen(false);
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [open, vault.path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const loadFs = useCallback(async (target?: string) => {
    setError(null);
    const q = target ? `?path=${encodeURIComponent(target)}` : "";
    try {
      const res = await fetch(`/api/fs${q}`);
      const data = (await res.json()) as FsResponse | { error: string };
      if (!res.ok || "error" in data) {
        setError(("error" in data ? data.error : null) ?? "Couldn't read directory.");
        return;
      }
      setFs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  }, []);

  useEffect(() => {
    if (open && browseOpen && !fs) loadFs();
  }, [open, browseOpen, fs, loadFs]);

  const submit = async (next?: string) => {
    const trimmed = (next ?? path).trim();
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
          <div
            key="wrap"
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              pointerEvents: "none",
              zIndex: 401,
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="vault-connect-title"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1.2, 0.36, 1] }}
              style={{
                pointerEvents: "auto",
                width: "min(520px, 100%)",
                maxHeight: "min(78vh, 640px)",
                display: "flex",
                flexDirection: "column",
                background: "var(--surface-raised)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-panel)",
                boxShadow: "var(--shadow-dialog)",
              }}
            >
              <div style={{ padding: "20px 20px 0" }}>
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
              </div>

              {!browseOpen ? (
                <div style={{ padding: 20 }}>
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
                  <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setBrowseOpen(true)}
                      className="focus-ring"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "8px 12px",
                        border: "1px solid var(--border-standard)",
                        background: "var(--surface-recessed)",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                        fontSize: 13,
                        borderRadius: "var(--radius-row)",
                      }}
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                      </svg>
                      Browse…
                    </button>
                    <div style={{ flex: 1 }} />
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
                      onClick={() => submit()}
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
                </div>
              ) : (
                <BrowseView
                  fs={fs}
                  error={error}
                  onNavigate={loadFs}
                  onBack={() => { setBrowseOpen(false); setError(null); }}
                  onPick={(p) => { setPath(p); setBrowseOpen(false); }}
                  onConnect={(p) => submit(p)}
                  busy={busy}
                />
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

function BrowseView({
  fs, error, onNavigate, onBack, onPick, onConnect, busy,
}: {
  fs: FsResponse | null;
  error: string | null;
  onNavigate: (path?: string) => void;
  onBack: () => void;
  onPick: (path: string) => void;
  onConnect: (path: string) => void;
  busy: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div
        style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--border-subtle)",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={() => fs?.parent && onNavigate(fs.parent)}
          disabled={!fs?.parent}
          className="focus-ring"
          aria-label="Go up one folder"
          title="Go up"
          style={{
            width: 28, height: 28,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            padding: 0,
            border: "none",
            background: "transparent",
            color: "var(--text-tertiary)",
            cursor: fs?.parent ? "pointer" : "default",
            borderRadius: "var(--radius-row)",
            opacity: fs?.parent ? 1 : 0.4,
          }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <code
          className="mono-label"
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 11,
            letterSpacing: "0.02em",
            color: "var(--text-secondary)",
            padding: "4px 8px",
            background: "var(--surface-recessed)",
            border: "1px solid var(--border-standard)",
            borderRadius: "var(--radius-row)",
          }}
        >
          {fs?.cwd ?? "…"}
        </code>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "6px 8px",
        }}
      >
        {error && (
          <div className="caption" style={{ padding: "12px 14px", color: "var(--status-blocked)" }}>
            {error}
          </div>
        )}
        {fs && fs.dirs.length === 0 && !error && (
          <div className="caption" style={{ padding: "16px 14px", color: "var(--text-quaternary)" }}>
            No subfolders.
          </div>
        )}
        {fs?.dirs.map((d) => (
          <div
            key={d.path}
            className="vault-fs-row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              height: 32,
              padding: "0 6px 0 10px",
              borderRadius: "var(--radius-row)",
              color: "var(--text-secondary)",
              fontSize: 13,
              transition: "background var(--motion-micro) var(--ease-default), color var(--motion-micro) var(--ease-default)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-surface-alpha-2)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          >
            <button
              type="button"
              onClick={() => onNavigate(d.path)}
              className="focus-ring"
              aria-label={`Open ${d.name}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flex: 1,
                minWidth: 0,
                height: "100%",
                padding: 0,
                border: "none",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                fontSize: "inherit",
                textAlign: "left",
              }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-quaternary)", flexShrink: 0 }}>
                <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {d.name}
              </span>
              <span style={{ color: "var(--text-quaternary)", fontSize: 10 }}>›</span>
            </button>
            <button
              type="button"
              onClick={() => onConnect(d.path)}
              className="focus-ring"
              aria-label={`Use ${d.name} as vault`}
              title={`Use as vault`}
              style={{
                flexShrink: 0,
                padding: "4px 10px",
                border: "1px solid var(--border-subtle)",
                background: "transparent",
                color: "var(--text-tertiary)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 500,
                borderRadius: "var(--radius-small)",
                transition: "background var(--motion-micro) var(--ease-default), color var(--motion-micro) var(--ease-default), border-color var(--motion-micro) var(--ease-default)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-brand)"; e.currentTarget.style.color = "var(--text-on-brand, #fff)"; e.currentTarget.style.borderColor = "var(--accent-brand)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; e.currentTarget.style.borderColor = "var(--border-subtle)"; }}
            >
              Use
            </button>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: 14,
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={onBack}
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
          Back
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => fs?.cwd && onConnect(fs.cwd)}
          disabled={!fs?.cwd || busy}
          className="focus-ring"
          style={{
            padding: "8px 16px",
            border: "none",
            background: "var(--accent-brand)",
            color: "var(--text-on-brand, #fff)",
            cursor: fs?.cwd && !busy ? "pointer" : "default",
            opacity: fs?.cwd && !busy ? 1 : 0.55,
            fontSize: 13,
            fontWeight: 500,
            borderRadius: "var(--radius-row)",
          }}
        >
          {busy ? "Connecting…" : "Use this folder"}
        </button>
      </div>
    </div>
  );
}
