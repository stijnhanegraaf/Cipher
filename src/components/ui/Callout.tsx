"use client";

import React from "react";
import type { Callout as CalloutMeta, CalloutType } from "@/lib/markdown/callout";

// ── Default titles (render-layer concern, NOT in the parser) ──────────────────
function defaultTitle(type: CalloutType): string {
  const titles: Record<CalloutType, string> = {
    note: "Note",
    abstract: "Abstract",
    info: "Info",
    tip: "Tip",
    success: "Success",
    question: "Question",
    warning: "Warning",
    failure: "Failure",
    danger: "Danger",
    bug: "Bug",
    example: "Example",
    quote: "Quote",
  };
  return titles[type];
}

// ── Hand-rolled SVG icons — 16px, currentColor, no icon library ───────────────
// Follows the FileKindIcon.tsx / wikiLinkIcon convention: stroke-based,
// viewBox="0 0 24 24", stroke="currentColor", no fill.
function CalloutIcon({ type }: { type: CalloutType }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor" as const,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    style: { flexShrink: 0 } as React.CSSProperties,
  };

  switch (type) {
    case "note":
      // Pencil / edit
      return (
        <svg {...common}>
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      );
    case "abstract":
      // List / lines
      return (
        <svg {...common}>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      );
    case "info":
      // Circle with i
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
    case "tip":
      // Flame
      return (
        <svg {...common}>
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      );
    case "success":
      // Check circle
      return (
        <svg {...common}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case "question":
      // Help circle
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "warning":
      // Triangle alert
      return (
        <svg {...common}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "failure":
      // X circle
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    case "danger":
      // Zap / lightning
      return (
        <svg {...common}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case "bug":
      // Bug
      return (
        <svg {...common}>
          <rect x="8" y="6" width="8" height="14" rx="4" />
          <path d="M19 7l-3 2" />
          <path d="M5 7l3 2" />
          <path d="M19 12h-3" />
          <path d="M8 12H5" />
          <path d="M19 17l-3-2" />
          <path d="M8 15H5l0 2" />
          <path d="M9 6 C9 4 15 4 15 6" />
        </svg>
      );
    case "example":
      // List with bullet
      return (
        <svg {...common}>
          <line x1="9" y1="6" x2="20" y2="6" />
          <line x1="9" y1="12" x2="20" y2="12" />
          <line x1="9" y1="18" x2="20" y2="18" />
          <circle cx="4" cy="6" r="1" fill="currentColor" />
          <circle cx="4" cy="12" r="1" fill="currentColor" />
          <circle cx="4" cy="18" r="1" fill="currentColor" />
        </svg>
      );
    case "quote":
      // Quote marks
      return (
        <svg {...common}>
          <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
          <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
        </svg>
      );
  }
}

// ── Chevron for foldable callouts ─────────────────────────────────────────────
const ChevronIcon = () => (
  <svg
    className="callout__chevron"
    width={12}
    height={12}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    style={{ flexShrink: 0, marginLeft: "auto" }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// ── Main Callout component ────────────────────────────────────────────────────
interface CalloutProps {
  meta: CalloutMeta;
  body: React.ReactNode;
}

export function Callout({ meta, body }: CalloutProps) {
  const { type, title, foldable, defaultOpen } = meta;
  const resolvedTitle = title ?? defaultTitle(type);
  const className = `callout callout--${type}`;

  if (foldable) {
    return (
      <details className={className} open={defaultOpen}>
        <summary className="callout__title">
          <CalloutIcon type={type} />
          {resolvedTitle}
          <ChevronIcon />
        </summary>
        <div className="callout__body">{body}</div>
      </details>
    );
  }

  return (
    <div className={className}>
      <div className="callout__title">
        <CalloutIcon type={type} />
        {resolvedTitle}
      </div>
      <div className="callout__body">{body}</div>
    </div>
  );
}
