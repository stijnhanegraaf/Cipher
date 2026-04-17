"use client";

import { useRouter, usePathname } from "next/navigation";
import { useVault } from "@/lib/hooks/useVault";

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

export function Sidebar({ onAsk, onHome, onBrowse, onPalette, onToggleTheme, activeKind, recentQueries = [] }: SidebarProps) {
  const vault = useVault();
  const router = useRouter();
  const pathname = usePathname();
  const isBrowse = pathname === "/browse" || pathname?.startsWith("/browse/");
  const isDashboardExact = pathname === "/browse"; // only the root browse route
  const isChat = pathname === "/chat" || pathname?.startsWith("/chat");

  const navItems: NavItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
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
        width: 240,
        height: "100dvh",
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--border-subtle)",
        position: "sticky",
        top: 0,
        overflow: "hidden",
      }}
    >
      {/* ── Sidebar header — 48px ─────────────────────────── */}
      <div
        style={{
          height: 48,
          flexShrink: 0,
          padding: "0 12px 0 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <button
          type="button"
          onClick={onHome}
          className="focus-ring"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 6px",
            margin: "0 -6px",
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
              width: 18, height: 18, borderRadius: 5,
              background: "var(--accent-brand)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="var(--text-on-brand)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </span>
          <span style={{ fontSize: 13, fontWeight: 510, letterSpacing: -0.1 }}>Cipher</span>
        </button>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
          <SidebarHeaderButton label="Command palette (⌘K)" onClick={onPalette}>
            <kbd
              className="mono-label"
              style={{
                fontSize: 10,
                padding: "1px 5px",
                borderRadius: 4,
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

      {/* Vault chip */}
      {vault.connected && vault.name && (
        <div className="px-3" style={{ marginBottom: 12, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onPalette}
            title="Change vault (⌘K)"
            className="focus-ring app-row flex items-center gap-2 w-full rounded-[6px] cursor-pointer"
            style={{
              padding: "6px 10px",
              background: "transparent",
              border: "none",
              transition: "background-color var(--motion-hover) var(--ease-default)",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--status-done)", flexShrink: 0 }} />
            <span className="mono-label" style={{ color: "var(--text-tertiary)", letterSpacing: "0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Vault connected
            </span>
          </button>
        </div>
      )}

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
              className="focus-ring app-row flex items-center gap-2.5 rounded-[6px] cursor-pointer"
              style={{
                height: 32,
                padding: "0 10px",
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
              <button
                key={i}
                type="button"
                onClick={() => onAsk(query)}
                className="focus-ring app-row flex items-center rounded-[6px] cursor-pointer"
                style={{
                  height: 28,
                  padding: "0 10px",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-tertiary)",
                  textAlign: "left",
                  fontSize: 12,
                  fontWeight: 400,
                  lineHeight: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  transition: "background-color var(--motion-hover) var(--ease-default), color var(--motion-hover) var(--ease-default)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-surface-alpha-2)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {query}
                </span>
              </button>
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
        <button
          type="button"
          onClick={onPalette}
          className="focus-ring app-row flex items-center gap-2.5 rounded-[6px] cursor-pointer"
          style={{
            height: 32,
            padding: "0 10px",
            background: "transparent",
            border: "none",
            color: "var(--text-tertiary)",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: -0.1,
            textAlign: "left",
            transition: "background-color var(--motion-hover) var(--ease-default), color var(--motion-hover) var(--ease-default)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-surface-alpha-2)"; e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
        >
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 14, color: "var(--text-tertiary)" }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M9 3v18M3 9h18" />
            </svg>
          </span>
          <span>Commands</span>
          <span
            className="mono-label ml-auto"
            style={{
              padding: "1px 5px",
              borderRadius: 4,
              border: "1px solid var(--border-standard)",
              background: "var(--bg-surface-alpha-2)",
              fontSize: 10,
              color: "var(--text-quaternary)",
              letterSpacing: "0.04em",
            }}
          >
            ⌘K
          </span>
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          className="focus-ring app-row flex items-center gap-2.5 rounded-[6px] cursor-pointer"
          style={{
            height: 32,
            padding: "0 10px",
            background: "transparent",
            border: "none",
            color: "var(--text-tertiary)",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: -0.1,
            textAlign: "left",
            transition: "background-color var(--motion-hover) var(--ease-default), color var(--motion-hover) var(--ease-default)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-surface-alpha-2)"; e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
        >
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 14, color: "var(--text-tertiary)" }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.354 15.354A9 9 0 018.646 3.646 9 9 0 0012 21a9 9 0 008.354-5.646z" />
            </svg>
          </span>
          Theme
        </button>
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
        width: 28,
        height: 28,
        borderRadius: 6,
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
