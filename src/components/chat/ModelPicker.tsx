"use client";

/**
 * ModelPicker — header action that opens a popover to:
 *   - switch between Ollama (local), Ollama Cloud, OpenAI, Anthropic,
 *   - paste an API key for the active provider (when needed),
 *   - pick a model from the active provider's tag list.
 *
 * Connection settings persist server-side to <vault>/.cipher/llm.json via
 * /api/settings/llm. Selected model name persists to localStorage.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { IconStack } from "@/components/ui/IconStack";

type ProviderId = "ollama-local" | "ollama-cloud" | "openai" | "anthropic";

interface Health {
  provider: ProviderId;
  providerLabel: string;
  ok: boolean;
  needsKey: boolean;
  models: string[];
  defaultModel: string;
  embed: {
    ok: boolean;
    source: "openai" | "ollama-local" | "ollama-cloud" | "keyword-only";
    label: string;
  };
}

interface Conn {
  provider: ProviderId;
  ollamaLocal: { hasKey: boolean; baseUrl: string | null };
  ollamaCloud: { hasKey: boolean; baseUrl: string | null };
  openai: { hasKey: boolean; baseUrl: string | null };
  anthropic: { hasKey: boolean; baseUrl: string | null };
}

const PROVIDER_META: Record<ProviderId, {
  label: string;
  short: string;
  tagline: string;
  needsKey: boolean;
  keyLabel?: string;
  keyHint?: string;
  keyHelpUrl?: string;
  keyHelpLabel?: string;
}> = {
  "ollama-local": {
    label: "Ollama (local)", short: "Local", needsKey: false,
    tagline: "Runs on this Mac. Private and free.",
  },
  "ollama-cloud": {
    label: "Ollama Cloud", short: "Cloud", needsKey: true,
    tagline: "Ollama's hosted models. No local GPU needed.",
    keyLabel: "Ollama Cloud key", keyHint: "ollama-...",
    keyHelpUrl: "https://ollama.com/settings/keys",
    keyHelpLabel: "Get a key at ollama.com/settings/keys",
  },
  "openai": {
    label: "OpenAI", short: "OpenAI", needsKey: true,
    tagline: "GPT-4o and o-series. Pay per token.",
    keyLabel: "OpenAI API key", keyHint: "sk-...",
    keyHelpUrl: "https://platform.openai.com/api-keys",
    keyHelpLabel: "Get a key at platform.openai.com",
  },
  "anthropic": {
    label: "Anthropic", short: "Claude", needsKey: true,
    tagline: "Claude 3.5 and 4 family. Pay per token.",
    keyLabel: "Anthropic API key", keyHint: "sk-ant-...",
    keyHelpUrl: "https://console.anthropic.com/settings/keys",
    keyHelpLabel: "Get a key at console.anthropic.com",
  },
};

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
  const [savedFired, setSavedFired] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [hRes, cRes] = await Promise.all([
        fetch("/api/chat/health", { cache: "no-store" }),
        fetch("/api/settings/llm", { cache: "no-store" }),
      ]);
      if (hRes.ok) setHealth((await hRes.json()) as Health);
      if (cRes.ok) setConn((await cRes.json()) as Conn);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // Auto-correct model when the provider's list changes and current is invalid.
  useEffect(() => {
    if (!health?.ok) return;
    if (health.models.length === 0) return;
    if (!health.models.includes(current) && health.defaultModel) {
      onChange(health.defaultModel);
    }
  }, [health, current, onChange]);

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

  const activeProvider = conn?.provider ?? "ollama-local";
  const providerConn = conn?.[
    activeProvider === "ollama-local" ? "ollamaLocal"
    : activeProvider === "ollama-cloud" ? "ollamaCloud"
    : activeProvider
  ];

  const patch = async (patchBody: Record<string, unknown>) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/settings/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("Failed to save LLM settings", txt);
        setSaveError("Couldn't save. Try again.");
        return;
      }
      setApiKey("");
      await refresh();
    } catch (err) {
      console.error("Failed to save LLM settings", err);
      setSaveError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const switchProvider = (p: ProviderId) => patch({ provider: p });

  const saveKey = () => {
    const key = apiKey.trim();
    if (!key) return;
    const slot =
      activeProvider === "ollama-local" ? "ollamaLocal"
      : activeProvider === "ollama-cloud" ? "ollamaCloud"
      : activeProvider;
    patch({ [slot]: { apiKey: key } });
    setSavedFired(true);
    window.setTimeout(() => setSavedFired(false), 400);
  };

  const selectModel = (m: string) => {
    onChange(m);
    setOpen(false);
  };

  const activeMeta = PROVIDER_META[activeProvider];
  const isConnected = !!health?.ok && !health.needsKey && health.models.length > 0;
  const labelText =
    !health              ? "Checking…" :
    health.needsKey      ? `Connect ${activeMeta.short}` :
    !health.ok           ? `${activeMeta.short} offline` :
    health.models.length === 0 ? "No models" :
    current;

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
          height: 28,
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
        <span style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: isConnected
            ? "var(--success, #34d399)"
            : "var(--text-quaternary)",
        }} />
        <span style={{ textTransform: "none" }}>{labelText}</span>
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
            width: 340,
            background: "var(--surface-raised)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-panel)",
            boxShadow: "var(--shadow-dialog)",
            padding: 6,
            zIndex: 30,
          }}
        >
          {/* ── Provider switcher ─────────────────────────────── */}
          <div style={{ padding: "8px 8px 10px" }}>
            <div className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.08em", fontSize: 10, marginBottom: 8 }}>
              PROVIDER
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 3,
                padding: 3,
                background: "var(--bg-surface-alpha-2)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
              }}
            >
              {(Object.keys(PROVIDER_META) as ProviderId[]).map((p) => {
                const active = activeProvider === p;
                const meta = PROVIDER_META[p];
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={saving || active}
                    onClick={() => switchProvider(p)}
                    className="focus-ring caption"
                    style={{
                      padding: "6px 4px",
                      borderRadius: 6,
                      border: "none",
                      background: active ? "var(--surface-raised)" : "transparent",
                      color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                      fontWeight: active ? 500 : 400,
                      cursor: active ? "default" : "pointer",
                      fontSize: 11,
                      boxShadow: active ? "0 1px 2px rgba(0,0,0,0.2)" : "none",
                      transition: "background var(--motion-hover) var(--ease-default)",
                    }}
                  >
                    {meta.short}
                  </button>
                );
              })}
            </div>

            <div className="caption" style={{ marginTop: 8, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
              {activeMeta.tagline}
            </div>

            {saveError && (
              <div className="caption" style={{ marginTop: 6, color: "var(--status-danger, #c0392b)" }}>
                {saveError}
              </div>
            )}

            {activeMeta.needsKey && (
              <div style={{ marginTop: 10 }}>
                <div className="caption" style={{ color: "var(--text-tertiary)", marginBottom: 6 }}>
                  {providerConn?.hasKey ? `${activeMeta.keyLabel} saved` : `Paste your ${activeMeta.keyLabel}`}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={providerConn?.hasKey ? "•••••••• (replace)" : (activeMeta.keyHint ?? "API key")}
                    aria-label={activeMeta.keyLabel ?? "API key"}
                    className="focus-ring"
                    style={{
                      flex: 1,
                      height: 28,
                      padding: "0 8px",
                      fontSize: 12,
                      lineHeight: "28px",
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
                    onClick={saveKey}
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
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <IconStack
                        fired={savedFired}
                        idle={
                          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                            <polyline points="17 21 17 13 7 13 7 21" />
                            <polyline points="7 3 7 8 15 8" />
                          </svg>
                        }
                        success={
                          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        }
                        size={12}
                      />
                      {providerConn?.hasKey && apiKey.trim() ? "Replace" : "Save"}
                    </span>
                  </button>
                </div>
                {activeMeta.keyHelpUrl && (
                  <a
                    href={activeMeta.keyHelpUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="caption"
                    style={{ display: "inline-block", marginTop: 8, color: "var(--text-quaternary)", textDecoration: "underline" }}
                  >
                    {activeMeta.keyHelpLabel ?? "Get a key →"}
                  </a>
                )}
              </div>
            )}

            {health?.embed && (
              <div
                className="caption"
                style={{
                  marginTop: 10,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-surface-alpha-2)",
                  color: health.embed.source === "keyword-only"
                    ? "var(--status-warning, #d19a66)"
                    : "var(--text-tertiary)",
                  lineHeight: 1.4,
                }}
              >
                {health.embed.label}
              </div>
            )}
          </div>

          <div style={{ height: 1, background: "var(--border-subtle)", margin: "0 4px" }} />

          {/* ── Model list ─────────────────────────────────────── */}
          <div className="mono-label" style={{ padding: "10px 10px 6px", color: "var(--text-quaternary)", letterSpacing: "0.08em", fontSize: 10 }}>
            MODELS {health?.ok && !health.needsKey && health.models.length > 0 ? "· CONNECTED" : "· OFFLINE"}
          </div>

          {!health && (
            <div className="caption" style={{ padding: "4px 10px 10px", color: "var(--text-tertiary)" }}>
              Checking…
            </div>
          )}

          {health && !health.ok && health.needsKey && (
            <div className="caption" style={{ padding: "4px 10px 12px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              Paste your {activeMeta.keyLabel} above and press Save. Stored in your vault. Only sent to {activeMeta.label}.
            </div>
          )}

          {health && !health.ok && !health.needsKey && activeProvider === "ollama-local" && (
            <div className="caption" style={{ padding: "4px 10px 12px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              Ollama isn't running. Start it in Terminal:
              <code style={{ display: "block", marginTop: 4, padding: "4px 6px", fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--bg-surface)", borderRadius: 4, color: "var(--text-secondary)" }}>
                ollama serve
              </code>
              <a
                href="https://ollama.com/download"
                target="_blank"
                rel="noreferrer"
                style={{ display: "inline-block", marginTop: 6, color: "var(--text-quaternary)", textDecoration: "underline" }}
              >
                Don't have Ollama? Download it here
              </a>
            </div>
          )}

          {health?.ok && health.models.length === 0 && activeProvider === "ollama-local" && (
            <div className="caption" style={{ padding: "4px 10px 12px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              No models installed yet. Pull one:
              <code style={{ display: "block", marginTop: 4, padding: "4px 6px", fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--bg-surface)", borderRadius: 4, color: "var(--text-secondary)" }}>
                ollama pull llama3.2:3b
              </code>
            </div>
          )}

          {health?.ok && health.models.length === 0 && activeProvider !== "ollama-local" && (
            <div className="caption" style={{ padding: "4px 10px 12px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              Connected, but this key has no models available. Check your {activeMeta.label} account.
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
                  onClick={() => selectModel(m)}
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
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--bg-surface-alpha-2)"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
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
