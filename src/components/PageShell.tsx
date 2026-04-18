"use client";

import React from "react";

/**
 * PageShell — frame for every non-chat page.
 *
 * Layout (top to bottom):
 *   ╔══════════════════════════════╗
 *   ║ 72px sticky header           ║  icon + title + subtitle + right-aligned actions
 *   ╠══════════════════════════════╣
 *   ║ 40px optional toolbar        ║  filter chips + right-aligned count
 *   ╠══════════════════════════════╣
 *   ║ body slot — scrollable       ║
 *   ║ edge-to-edge                 ║
 *   ║ app-row on list items        ║
 *   ╚══════════════════════════════╝
 *
 * Explicitly no: freshness pill, confidence meta, sources disclosure, reply
 * pills. Those are chat-response chrome; pages don't wear them.
 */

export interface PageShellProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Right side of header — icon buttons or a small group. */
  actions?: React.ReactNode;
  /** Optional 40px row under header for filter chips etc. */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}

export function PageShell({ title, subtitle, icon, actions, toolbar, children }: PageShellProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-marketing)" }}>
      {/* ── Header — 72px sticky ───────────────────────────────── */}
      <header
        style={{
          flexShrink: 0,
          height: 72,
          padding: "0 32px",
          borderBottom: "1px solid var(--border-subtle)",
          background: "color-mix(in srgb, var(--bg-marketing) 85%, transparent)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          {icon && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "var(--bg-surface-alpha-2)",
                color: "var(--text-tertiary)",
                flexShrink: 0,
              }}
            >
              {icon}
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <h1
              className="heading-2"
              style={{
                color: "var(--text-primary)",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className="caption-large"
                style={{
                  color: "var(--text-tertiary)",
                  margin: 0,
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>{actions}</div>}
      </header>

      {/* ── Optional toolbar — 40px ────────────────────────────── */}
      {toolbar && (
        <div
          style={{
            flexShrink: 0,
            height: 40,
            padding: "0 32px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            position: "sticky",
            top: 72,
            zIndex: 19,
            background: "color-mix(in srgb, var(--bg-marketing) 85%, transparent)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
          }}
        >
          {toolbar}
        </div>
      )}

      {/* ── Body — scrollable ──────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "thin" }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Small reusable header-action icon button used by page actions slot.
 * Matches the style of sidebar-header icon buttons for consistency.
 */
export function PageAction({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="focus-ring"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 6,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: "var(--text-tertiary)",
        transition: "background var(--motion-hover) var(--ease-default), color var(--motion-hover) var(--ease-default)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-surface-alpha-2)";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-tertiary)";
      }}
    >
      {children}
    </button>
  );
}
