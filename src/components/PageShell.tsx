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
  /** Max width (px) applied to both header + body content so the title and
   *  the content underneath share the same left edge on wide viewports. */
  contentMaxWidth?: number;
  children: React.ReactNode;
}

export function PageShell({ title, subtitle, icon, actions, toolbar, contentMaxWidth, children }: PageShellProps) {
  const innerConstraint: React.CSSProperties = contentMaxWidth
    ? { maxWidth: contentMaxWidth, margin: "0 auto", width: "100%" }
    : { width: "100%" };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-marketing)" }}>
      {/* ── Header — 48px sticky. Matches the sidebar brand-row
             height so the two horizontal rails align exactly. Title
             renders at the same scale as the 'Cipher' mark in the
             sidebar — subtle, not a marketing headline. ─────── */}
      <header
        style={{
          flexShrink: 0,
          height: 48,
          borderBottom: "1px solid var(--border-subtle)",
          background: "color-mix(in srgb, var(--bg-marketing) 85%, transparent)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          display: "flex",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            ...innerConstraint,
            padding: "0 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              minWidth: 0,
              flex: 1,
            }}
          >
            {icon && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-tertiary)",
                  flexShrink: 0,
                  alignSelf: "center",
                }}
              >
                {icon}
              </span>
            )}
            <h1
              className="heading-3-serif"
              style={{
                color: "var(--text-primary)",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <span
                className="mono-label"
                style={{
                  color: "var(--text-quaternary)",
                  letterSpacing: "0.02em",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                }}
              >
                · {subtitle}
              </span>
            )}
          </div>
          {actions && <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>{actions}</div>}
        </div>
      </header>

      {/* ── Optional toolbar — 40px ────────────────────────────── */}
      {toolbar && (
        <div
          style={{
            flexShrink: 0,
            height: 40,
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            position: "sticky",
            top: 48,
            zIndex: 19,
            background: "color-mix(in srgb, var(--bg-marketing) 85%, transparent)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
          }}
        >
          <div style={{ ...innerConstraint, padding: "0 32px", display: "flex", alignItems: "center", gap: 8 }}>
            {toolbar}
          </div>
        </div>
      )}

      {/* ── Body — scrollable. Height cascades through the inner
             constraint wrapper so pages with full-height content
             (GraphCanvas etc.) still get 100% height. ───────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "thin", display: "flex", flexDirection: "column" }}>
        <div style={{ ...innerConstraint, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {children}
        </div>
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
