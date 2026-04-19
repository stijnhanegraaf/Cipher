"use client";

/**
 * ModelPicker — header action that opens a popover listing Ollama models.
 *
 * Detects installed models via /api/chat/health. Selected model persists
 * to localStorage["cipher-chat-model"]. When Ollama isn't reachable, the
 * popover explains how to start it and pull the default model.
 */

import { useEffect, useRef, useState } from "react";

interface Health {
  ok: boolean;
  model: string;
  hasModel: boolean;
  hasEmbedModel: boolean;
  models: string[];
}

interface Props {
  current: string;
  onChange: (model: string) => void;
}

export function ModelPicker({ current, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || health) return;
    (async () => {
      try {
        const res = await fetch("/api/chat/health", { cache: "no-store" });
        if (!res.ok) return;
        setHealth((await res.json()) as Health);
      } catch {
        setHealth({ ok: false, model: current, hasModel: false, hasEmbedModel: false, models: [] });
      }
    })();
  }, [open, health, current]);

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
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4l2 2" />
        </svg>
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
            minWidth: 260,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            boxShadow: "var(--shadow-dialog)",
            padding: 4,
            zIndex: 30,
          }}
        >
          <div
            className="mono-label"
            style={{
              padding: "8px 10px 6px",
              color: "var(--text-quaternary)",
              letterSpacing: "0.08em",
              fontSize: 10,
            }}
          >
            OLLAMA {health?.ok ? "· CONNECTED" : "· OFFLINE"}
          </div>
          {!health && (
            <div className="caption" style={{ padding: "8px 10px", color: "var(--text-tertiary)" }}>
              Checking…
            </div>
          )}
          {health && !health.ok && (
            <div className="caption" style={{ padding: "8px 10px 10px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              Ollama isn&apos;t reachable on <code style={{ fontFamily: "var(--font-mono)" }}>localhost:11434</code>.
              <div style={{ marginTop: 8 }}>Start it:</div>
              <code style={{ display: "block", marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
                ollama serve
              </code>
              <div style={{ marginTop: 8 }}>Then pull a model:</div>
              <code style={{ display: "block", marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
                ollama pull {health.model}
              </code>
            </div>
          )}
          {health?.ok && health.models.length === 0 && (
            <div className="caption" style={{ padding: "8px 10px 10px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              No chat models pulled yet. Try:
              <code style={{ display: "block", marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
                ollama pull {health.model}
              </code>
            </div>
          )}
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
      )}
    </div>
  );
}
