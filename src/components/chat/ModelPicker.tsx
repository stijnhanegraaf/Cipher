"use client";

/**
 * ModelPicker — header action that opens a popover to:
 *   - toggle between Local Ollama and Ollama Cloud,
 *   - paste an API key (Cloud mode),
 *   - pick the active model from the installed tags list.
 *
 * Connection settings persist server-side to <vault>/.cipher/ollama.json
 * via /api/settings/ollama. The selected model name persists to
 * localStorage on the client.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface Health {
  ok: boolean;
  model: string;
  hasModel: boolean;
  hasEmbedModel: boolean;
  models: string[];
}

interface Conn {
  mode: "local" | "cloud";
  hasKey: boolean;
  baseUrl: string | null;
}

interface Props {
  current: string;
  onChange: (model: string) => void;
}

export function ModelPicker({ current, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [conn, setConn] = useState<Conn | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setHealth(null);
    try {
      const [hRes, cRes] = await Promise.all([
        fetch("/api/chat/health", { cache: "no-store" }),
        fetch("/api/settings/ollama", { cache: "no-store" }),
      ]);
      if (hRes.ok) setHealth((await hRes.json()) as Health);
      if (cRes.ok) setConn((await cRes.json()) as Conn);
    } catch {
      setHealth({ ok: false, model: current, hasModel: false, hasEmbedModel: false, models: [] });
    }
  }, [current]);

  useEffect(() => {
    if (open && !health) refresh();
  }, [open, health, refresh]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const select = (m: string) => {
    onChange(m);
    setOpen(false);
  };

  const setMode = async (mode: "local" | "cloud", key?: string) => {
    setSaving(true);
    try {
      await fetch("/api/settings/ollama", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, apiKey: key ?? conn?.hasKey ? key : undefined }),
      });
      setApiKey("");
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const mode = conn?.mode ?? "local";

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring mono-label"
        aria-label="Choose model"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 24,
          padding: "0 8px",
          border: "1px solid var(--border-subtle)",
          borderRadius: 6,
          background: open ? "var(--bg-surface-alpha-4)" : "var(--bg-surface-alpha-2)",
          color: "var(--text-secondary)",
          letterSpacing: "0.02em",
          fontSize: 11,
          cursor: "pointer",
          transition: "background var(--motion-hover) var(--ease-default)",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: health?.ok ? "var(--success, #34d399)" : "var(--text-quaternary)",
          }}
        />
        <span style={{ textTransform: "none" }}>{current}</span>
        <svg width={8} height={8} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          ref={popRef}
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 320,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            boxShadow: "var(--shadow-dialog)",
            padding: 6,
            zIndex: 30,
          }}
        >
          {/* ── Connection toggle ───────────────────────────────── */}
          <div style={{ padding: "8px 8px 10px" }}>
            <div
              className="mono-label"
              style={{ color: "var(--text-quaternary)", letterSpacing: "0.08em", fontSize: 10, marginBottom: 8 }}
            >
              CONNECTION
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 4,
                padding: 3,
                background: "var(--bg-surface-alpha-2)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
              }}
            >
              {(["local", "cloud"] as const).map((m) => {
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={saving || active}
                    onClick={() => setMode(m)}
                    className="focus-ring caption"
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "none",
                      background: active ? "var(--bg-elevated)" : "transparent",
                      color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                      fontWeight: active ? 500 : 400,
                      cursor: active ? "default" : "pointer",
                      boxShadow: active ? "0 1px 2px rgba(0,0,0,0.2)" : "none",
                      transition: "background var(--motion-hover) var(--ease-default)",
                    }}
                  >
                    {m === "local" ? "Local" : "Cloud"}
                  </button>
                );
              })}
            </div>

            {mode === "cloud" && (
              <div style={{ marginTop: 10 }}>
                <div className="caption" style={{ color: "var(--text-tertiary)", marginBottom: 6 }}>
                  {conn?.hasKey ? "API key saved." : "Paste your Ollama Cloud API key."}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={conn?.hasKey ? "•••••••• (replace)" : "sk-…"}
                    className="focus-ring"
                    style={{
                      flex: 1,
                      height: 28,
                      padding: "0 8px",
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                      border: "1px solid var(--border-standard)",
                      borderRadius: 6,
                      background: "var(--bg-surface)",
                      color: "var(--text-primary)",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    disabled={saving || !apiKey.trim()}
                    onClick={() => setMode("cloud", apiKey.trim())}
                    className="focus-ring caption"
                    style={{
                      height: 28,
                      padding: "0 10px",
                      border: "1px solid var(--border-standard)",
                      borderRadius: 6,
                      background: "var(--accent-brand)",
                      color: "var(--text-on-brand, white)",
                      fontWeight: 500,
                      cursor: apiKey.trim() ? "pointer" : "not-allowed",
                      opacity: apiKey.trim() ? 1 : 0.5,
                    }}
                  >
                    Save
                  </button>
                </div>
                <a
                  href="https://ollama.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="caption"
                  style={{ display: "inline-block", marginTop: 8, color: "var(--text-quaternary)", textDecoration: "underline" }}
                >
                  Get a key →
                </a>
              </div>
            )}
          </div>

          <div style={{ height: 1, background: "var(--border-subtle)", margin: "0 4px" }} />

          {/* ── Model list ────────────────────────────────────── */}
          <div
            className="mono-label"
            style={{ padding: "10px 10px 6px", color: "var(--text-quaternary)", letterSpacing: "0.08em", fontSize: 10 }}
          >
            MODELS {health?.ok ? "· CONNECTED" : "· OFFLINE"}
          </div>

          {!health && (
            <div className="caption" style={{ padding: "4px 10px 10px", color: "var(--text-tertiary)" }}>
              Checking…
            </div>
          )}

          {health && !health.ok && mode === "local" && (
            <div className="caption" style={{ padding: "4px 10px 12px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              Can&apos;t reach <code style={{ fontFamily: "var(--font-mono)" }}>localhost:11434</code>. Start Ollama:
              <code style={{ display: "block", marginTop: 4, padding: "4px 6px", fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--bg-surface)", borderRadius: 4, color: "var(--text-secondary)" }}>
                ollama serve
              </code>
            </div>
          )}

          {health && !health.ok && mode === "cloud" && (
            <div className="caption" style={{ padding: "4px 10px 12px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              Cloud not reachable. Check your API key.
            </div>
          )}

          {health?.ok && health.models.length === 0 && (
            <div className="caption" style={{ padding: "4px 10px 12px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              {mode === "cloud" ? "No cloud models available on this account." : (
                <>
                  No models pulled yet:
                  <code style={{ display: "block", marginTop: 4, padding: "4px 6px", fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--bg-surface)", borderRadius: 4, color: "var(--text-secondary)" }}>
                    ollama pull {health.model}
                  </code>
                </>
              )}
            </div>
          )}

          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {health?.ok && health.models.map((m) => {
              const active = m === current;
              return (
                <button
                  key={m}
                  type="button"
                  role="menuitem"
                  onClick={() => select(m)}
                  className="focus-ring"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "7px 10px",
                    border: "none",
                    background: active ? "var(--bg-surface-alpha-4)" : "transparent",
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = "var(--bg-surface-alpha-2)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span>{m}</span>
                  {active && (
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
