"use client";

/**
 * Persistent 240px left rail: brand + vault chip, primary nav, Pinned
 * group with user-customisable folder shortcuts, Recent queries, theme
 * + palette toggles. Vault-agnostic; pins live in <vault>/.cipher/.
 */

import { useState } from "react";
import { Reorder } from "framer-motion";
import { useRouter, usePathname } from "next/navigation";
import { useVault } from "@/lib/hooks/useVault";
import { useSidebarPins } from "@/lib/hooks/useSidebarPins";
import { PinIcon } from "@/components/ui/PinIcon";
import { PinDialog } from "@/components/sidebar/PinDialog";
import type { PinEntry } from "@/lib/settings";

/**
 * Sidebar — persistent 240px left rail.
 *
 * Houses: Cipher mark + vault chip (top), primary nav (middle), settings (bottom).
 * Responsive: full at ≥1024px, icon-only rail at 768–1023px, hidden behind hamburger below.
 * Every nav item uses `.app-row` so the hover rail is consistent with the rest of the app.
 */

export interface SidebarProps {
  /** Runs a natural-language query in the chat. */
  onAsk: (query: string) => void;
  /** Clears the chat and returns to welcome. */
  onHome: () => void;
  /** Opens the vault drawer for browsing. */
  onBrowse: () => void;
  /** Opens the command palette (e.g. scoped to "change vault"). */
  onPalette: () => void;
  /** Toggles the theme. */
  onToggleTheme: () => void;
  /** Current view type, used to mark the matching nav item as active. */
  activeKind?: string | null;
  /** Recent queries from localStorage. */
  recentQueries?: string[];
  /** Remove a single recent query. */
  onRemoveRecent?: (query: string) => void;
  /** Clear all recent queries. */
  onClearRecents?: () => void;
  /** Called when a pinned folder is clicked. Consumer opens the VaultDrawer scoped to path. */
  onOpenPin?: (path: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  /** Match against the current response's view type (e.g. "current_work"). */
  activeKinds?: string[];
  /** Custom active predicate — takes priority when present (used for route-based active states). */
  activeWhen?: () => boolean;
}

export function Sidebar({ onAsk, onHome, onBrowse, onPalette, onToggleTheme, activeKind, recentQueries = [], onRemoveRecent, onClearRecents, onOpenPin }: SidebarProps) {
  const vault = useVault();
  const router = useRouter();
  const pathname = usePathname();
  const { pins, addPin, removePin, updatePin, reorderPins } = useSidebarPins();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPin, setEditingPin] = useState<PinEntry | null>(null);
  const isBrowse = pathname === "/browse" || pathname?.startsWith("/browse/");
  const isDashboardExact = pathname === "/browse"; // only the root browse route
  const isChat = pathname === "/chat" || pathname?.startsWith("/chat");

  const navItems: NavItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      // Home glyph — distinct from the top-right 4-grid Browse button.
      // Keeps Dashboard visually balanced with the other primary rows
      // while leaving the 4-square grid unique to the Browse affordance.
      icon: (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12l9-8 9 8" />
          <path d="M5 10v10h14V10" />
        </svg>
      ),
      onClick: () => {
        if (isBrowse) onHome();
        else router.push("/browse");
      },
      activeWhen: () => isDashboardExact && !activeKind,
    },
    {
      id: "new-chat",
      label: "Chat",
      icon: (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      ),
      onClick: () => {
        if (isChat) onHome();
        else router.push("/chat");
      },
      activeWhen: () => isChat,
    },
    {
      id: "graph",
      label: "Graph",
      icon: (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="7" r="2" />
          <circle cx="18" cy="7" r="2" />
          <circle cx="12" cy="17" r="2" />
          <path d="M8 8l3 7M16 8l-3 7" />
        </svg>
      ),
      onClick: () => router.push("/browse/graph"),
      activeWhen: () => pathname === "/browse/graph",
    },
    {
      id: "system",
      label: "System",
      icon: (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      onClick: () => router.push("/browse/system"),
      activeWhen: () => pathname === "/browse/system",
    },
    {
      id: "timeline",
      label: "Timeline",
      icon: (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      onClick: () => router.push("/browse/timeline"),
      activeWhen: () => pathname === "/browse/timeline",
    },
  ];

  return (
    <aside
      className="sidebar flex flex-col shrink-0"
      style={{
        width: "100%",
        flex: 1,
        minHeight: 0,
        background: "var(--bg-panel)",
        overflow: "hidden",
      }}
    >
      {/* ── Sidebar header — 48px ─────────────────────────── */}
      <div
        style={{
          height: 48,
          flexShrink: 0,
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {(() => {
          const cursorState: "connected" | "disconnected" | "hidden" =
            !vault.path ? "hidden" : vault.connected ? "connected" : "disconnected";
          const ariaSuffix =
            cursorState === "connected" ? "vault connected"
            : cursorState === "disconnected" ? "vault disconnected"
            : "no vault";
          return (
            <button
              type="button"
              onClick={onHome}
              className="focus-ring"
              aria-label={`Cipher — ${ariaSuffix}`}
              style={{
                display: "inline-flex",
                alignItems: "baseline",
                padding: "4px 6px",
                borderRadius: 6,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-primary)",
                transition: "background var(--motion-hover) var(--ease-default)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-surface-alpha-2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: "-0.015em",
                  lineHeight: 1,
                }}
              >
                Cipher
              </span>
              <span
                className="cipher-cursor"
                data-state={cursorState}
                aria-hidden="true"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 16,
                  fontWeight: 510,
                  marginLeft: 2,
                  lineHeight: 1,
                }}
              >_</span>
            </button>
          );
        })()}

        <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
          <SidebarHeaderButton label="Command palette (⌘K)" onClick={onPalette}>
            <kbd
              className="micro"
              style={{
                padding: "2px 6px",
                borderRadius: "var(--radius-small)",
                border: "1px solid var(--border-standard)",
                background: "var(--bg-surface-alpha-2)",
                color: "var(--text-tertiary)",
                letterSpacing: "0.04em",
              }}
            >
              ⌘K
            </kbd>
          </SidebarHeaderButton>
          <SidebarHeaderButton label="Browse vault" onClick={onBrowse}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          </SidebarHeaderButton>
        </div>
      </div>

      {/* ── Primary nav ──────────────────────────── */}
      <nav className="flex flex-col px-3 gap-0.5" style={{ flexShrink: 0 }}>
        {navItems.map((item) => {
          const active = item.activeWhen
            ? item.activeWhen()
            : !!(item.activeKinds && activeKind && item.activeKinds.includes(activeKind));
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              data-active={active ? "true" : undefined}
              className="focus-ring app-row flex items-center gap-2.5 rounded-[8px] cursor-pointer"
              style={{
                height: 32,
                padding: "0 12px",
                background: active ? "var(--bg-surface-alpha-4)" : "transparent",
                border: "none",
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                transition: "background-color var(--motion-hover) var(--ease-default), color var(--motion-hover) var(--ease-default)",
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: -0.1,
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = "var(--bg-surface-alpha-2)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <span style={{ color: active ? "var(--text-primary)" : "var(--text-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", width: 14 }}>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* ── Pinned ─────────────────────────────── */}
      <div className="px-3 mt-6" style={{ flexShrink: 0 }}>
        <div
          className="px-2"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.04em" }}>
            Pinned
          </span>
          <button
            type="button"
            onClick={() => { setEditingPin(null); setDialogOpen(true); }}
            className="focus-ring"
            title="Add pin"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-quaternary)",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "var(--radius-small)",
              transition: "color var(--motion-hover) var(--ease-default)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-quaternary)"; }}
          >
            <span className="mono-label" style={{ letterSpacing: "0.04em" }}>+ Add</span>
          </button>
        </div>
        <Reorder.Group
          axis="y"
          values={pins}
          onReorder={(next) => reorderPins(next)}
          style={{ display: "flex", flexDirection: "column", gap: 2, listStyle: "none", padding: 0, margin: 0 }}
        >
          {pins.map((pin) => (
            <Reorder.Item
              key={pin.id}
              value={pin}
              style={{ listStyle: "none" }}
              dragTransition={{ bounceStiffness: 400, bounceDamping: 32 }}
            >
              <PinnedRow
                pin={pin}
                onOpen={() => onOpenPin?.(pin.path)}
                onEdit={() => { setEditingPin(pin); setDialogOpen(true); }}
                onRemove={() => removePin(pin.id)}
              />
            </Reorder.Item>
          ))}
        </Reorder.Group>
      </div>

      <PinDialog
        open={dialogOpen}
        initial={editingPin ? { label: editingPin.label, path: editingPin.path, icon: editingPin.icon } : undefined}
        onClose={() => { setDialogOpen(false); setEditingPin(null); }}
        onSave={(values) => {
          if (editingPin) updatePin(editingPin.id, values);
          else addPin(values);
        }}
      />

      {/* ── Recent (scrollable middle) ───────────── */}
      {recentQueries.length > 0 && (
        <div
          className="px-3 mt-6"
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            className="mono-label px-2"
            style={{
              color: "var(--text-quaternary)",
              letterSpacing: "0.04em",
              marginBottom: 8,
            }}
          >
            Recent
          </div>
          <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {recentQueries.slice(0, 8).map((query, i) => (
              <RecentRow
                key={i}
                query={query}
                onOpen={() => onAsk(query)}
                onRemove={onRemoveRecent ? () => onRemoveRecent(query) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom: settings ──────────────────────── */}
      <div
        className="px-3"
        style={{
          flexShrink: 0,
          borderTop: "1px solid var(--border-subtle)",
          marginTop: "auto",
          paddingTop: 8,
          paddingBottom: 12,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div
          className="app-row flex items-center rounded-[8px]"
          style={{
            height: 32,
            padding: "0 8px 0 12px",
            gap: 10,
            color: "var(--text-tertiary)",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: -0.1,
          }}
        >
          <button
            type="button"
            onClick={onPalette}
            aria-label="Command palette (⌘K)"
            title="Command palette"
            className="focus-ring flex items-center"
            style={{
              gap: 10,
              height: "100%",
              padding: 0,
              border: "none",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              fontSize: "inherit",
              fontWeight: "inherit",
              letterSpacing: "inherit",
              flex: 1,
              minWidth: 0,
              textAlign: "left",
              transition: "color var(--motion-hover) var(--ease-default)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M9 3v18M3 9h18" />
              </svg>
            </span>
            <span>Commands</span>
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            title="Toggle theme"
            className="focus-ring"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 24,
              padding: 0,
              border: "none",
              background: "transparent",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              borderRadius: 6,
              flexShrink: 0,
              transition: "background var(--motion-hover) var(--ease-default), color var(--motion-hover) var(--ease-default)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-surface-alpha-2)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.354 15.354A9 9 0 018.646 3.646 9 9 0 0012 21a9 9 0 008.354-5.646z" />
            </svg>
          </button>
          <kbd
            aria-hidden="true"
            className="micro"
            style={{
              padding: "2px 6px",
              borderRadius: "var(--radius-small)",
              border: "1px solid var(--border-standard)",
              background: "var(--bg-surface-alpha-2)",
              color: "var(--text-quaternary)",
              letterSpacing: "0.04em",
              flexShrink: 0,
              pointerEvents: "none",
            }}
          >
            ⌘K
          </kbd>
        </div>
        <a
          href="https://github.com/stijnhanegraaf"
          target="_blank"
          rel="noreferrer"
          title="by stijn hanegraaf"
          aria-label="by stijn hanegraaf"
          className="focus-ring"
          style={{
            display: "block",
            padding: "8px 10px 0",
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: 10,
            lineHeight: 1,
            color: "color-mix(in srgb, var(--text-quaternary) 55%, transparent)",
            textDecoration: "none",
            transition: "color var(--motion-micro) var(--ease-out-gentle)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-quaternary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "color-mix(in srgb, var(--text-quaternary) 55%, transparent)"; }}
        >
          by Stijn
        </a>
      </div>
    </aside>
  );
}

function SidebarHeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
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
        width: "var(--icon-button-size)",
        height: "var(--icon-button-size)",
        borderRadius: "var(--radius-comfortable)",
        background: "transparent",
        border: "none",
        color: "var(--text-tertiary)",
        cursor: "pointer",
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

function RecentRow({ query, onOpen, onRemove }: { query: string; onOpen: () => void; onRemove?: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="focus-ring app-row rounded-[8px] cursor-pointer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: "var(--row-h-dense)",
        padding: "0 6px 0 12px",
        color: "var(--text-tertiary)",
        textAlign: "left",
        transition: "background-color var(--motion-hover) var(--ease-default), color var(--motion-hover) var(--ease-default)",
      }}
    >
      <span
        className="caption"
        style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {query}
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label="Remove from recent"
          title="Remove"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="focus-ring recent-remove"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: "var(--radius-small)",
            background: "transparent",
            border: "none",
            color: "var(--text-quaternary)",
            cursor: "pointer",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--hover-control)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-quaternary)";
          }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function PinnedRow({
  pin,
  onOpen,
  onEdit,
  onRemove,
}: {
  pin: PinEntry;
  onOpen: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onDoubleClick={onEdit}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="focus-ring app-row rounded-[8px] cursor-pointer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: "var(--row-h-dense)",
        padding: "0 6px 0 12px",
        color: "var(--text-tertiary)",
        textAlign: "left",
      }}
    >
      <PinIcon name={pin.icon} />
      <span
        className="caption"
        style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {pin.label}
      </span>
      <button
        type="button"
        aria-label="Remove pin"
        title="Remove"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="focus-ring recent-remove"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 20,
          height: 20,
          borderRadius: "var(--radius-small)",
          background: "transparent",
          border: "none",
          color: "var(--text-quaternary)",
          cursor: "pointer",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--hover-control)";
          e.currentTarget.style.color = "var(--text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--text-quaternary)";
        }}
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

