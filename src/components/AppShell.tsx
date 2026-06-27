"use client";

/**
 * Top-level app chrome — mounts Sidebar, DetailPage sheet, CommandPalette,
 * and routes content. Handles keyboard shortcuts and theme bootstrap.
 */

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DetailPage } from "@/components/DetailPage";
import { HintChip } from "@/components/HintChip";
import { Sidebar, type SidebarProps } from "@/components/Sidebar";
import { CommandPalette, type PaletteAction } from "@/components/CommandPalette";
import { VaultConnectDialog } from "@/components/VaultConnectDialog";
import { log } from "@/lib/log";
import { useSheet } from "@/lib/hooks/useSheet";
import { useVault } from "@/lib/hooks/useVault";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { useIsMobile } from "@/lib/hooks/useMediaQuery";
import { formatDailyDate } from "@/lib/daily-note";
import {
  type ThemeChoice,
  readTheme,
  resolveTheme as resolveThemeChoice,
  applyTheme,
  writeTheme,
  watchSystemTheme,
} from "@/lib/browse/theme";

/**
 * AppShell — persistent chrome shared by every route.
 *
 * Owns: Sidebar, CommandPalette, DetailPage sheet (via ?sheet=),
 * HintChip, global keyboard shortcuts. Children render as the route content
 * to the right of the sidebar.
 *
 * The sheet is URL-driven via useSheet: any descendant can push ?sheet=<path>
 * and the overlay mounts. Closing clears the param.
 *
 * The Suspense wrapper around AppShellInner is required because useSheet reads
 * useSearchParams, which Next.js 16 requires to be suspended at build time for
 * static rendering.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh", background: "var(--bg-marketing)" }} />}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const vault = useVault();
  const sheet = useSheet();
  const isMobile = useIsMobile();
  const prefersReducedMotion = useReducedMotion();
  const drawerRef = useRef<HTMLElement | null>(null);

  const [paletteOpen, setPaletteOpen] = useState(false);
  // Drawer requested by user interaction; actual open state is derived from
  // whether we're on mobile — prevents stale-open drawer on desktop resize.
  const [drawerRequested, setDrawerOpen] = useState(false);
  const drawerOpen = isMobile && drawerRequested;
  // NOTE: these start with SSR-safe defaults (closed / empty / system) and are
  // hydrated from storage in a post-mount effect below. Reading sessionStorage/
  // localStorage in a useState initializer makes the first client render differ
  // from the server render → hydration mismatch. Defer it to after mount.
  const [connectOpen, setConnectOpen] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  // "system" is the SSR-safe default — matches the bootstrap no-key case.
  const [themePref, setThemePref] = useState<ThemeChoice>("system");

  // Hydrate client-only state once, after mount (server/client first render agree).
  useEffect(() => {
    try {
      const stored = localStorage.getItem("cipher-recent");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount hydration from localStorage (the SSR-safe alternative to a client-only useState initializer)
      if (stored) setRecentQueries(JSON.parse(stored) as string[]);
    } catch { /* ignore */ }
  }, []);

  // Hydrate theme preference from localStorage post-mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount hydration of theme pref from localStorage (SSR-safe; default "system" avoids hydration mismatch)
    setThemePref(readTheme());
  }, []);

  // Live OS-follow: when prefers-color-scheme changes and pref is "system" (or
  // absent), re-resolve and apply the theme via direct DOM writes (no setState).
  useEffect(() => {
    return watchSystemTheme(() => {
      const current = readTheme();
      if (current !== "system") return; // manual light/dark override — no-op
      applyTheme("system");
      window.__setThemeColor?.(resolveThemeChoice("system"));
    });
  }, []);

  // Auto-open the connect nudge once no vault is connected and it hasn't been
  // dismissed this session. Runs post-mount (not in render) so it can't cause a
  // hydration mismatch. Closing sets the dismissed flag, so it won't reopen.
  useEffect(() => {
    if (vault.loading || vault.connected) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot post-mount nudge gated on session-storage + vault state; not a render loop
      if (!sessionStorage.getItem("cipher-vault-nudge-dismissed")) setConnectOpen(true);
    } catch { /* ignore */ }
  }, [vault.loading, vault.connected]);

  // Close connect dialog when vault connects after mount.
  useEffect(() => {
    if (!vault.loading && vault.connected)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- close dialog on external vault-connect completion
      setConnectOpen(false);
  }, [vault.loading, vault.connected]);

  // Any component can request the connect dialog by firing this event.
  useEffect(() => {
    const handler = () => setConnectOpen(true);
    window.addEventListener("cipher:open-vault-connect", handler);
    return () => window.removeEventListener("cipher:open-vault-connect", handler);
  }, []);

  // Remove a single recent query (and persist).
  const handleRemoveRecent = useCallback((query: string) => {
    setRecentQueries((prev) => {
      const next = prev.filter((q) => q !== query);
      try { localStorage.setItem("cipher-recent", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Clear everything.
  const handleClearRecents = useCallback(() => {
    setRecentQueries([]);
    try { localStorage.removeItem("cipher-recent"); } catch {}
  }, []);

  // ── Focus-trap for mobile drawer ─────────────────────────────────────
  useEffect(() => {
    if (!drawerOpen || !drawerRef.current) return;
    const el = drawerRef.current;
    // Auto-focus the first interactive element in the drawer.
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable[0]?.focus();

    // Trap Tab within the drawer.
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((x) => !x.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", trap);
    return () => document.removeEventListener("keydown", trap);
  }, [drawerOpen]);

  // ── Global shortcuts: ⌘K palette, Esc close top overlay. ───────────
  useKeyboardShortcuts([
    { key: "k", modifiers: ["meta"], handler: () => setPaletteOpen((v) => !v) },
    { key: "k", modifiers: ["ctrl"], handler: () => setPaletteOpen((v) => !v) },
    {
      key: "Escape",
      handler: () => {
        if (paletteOpen) setPaletteOpen(false);
        else if (drawerOpen) setDrawerOpen(false);
        else if (sheet.path) sheet.close();
      },
    },
  ]);

  // ── Theme toggle: 3-state cycle System → Light → Dark → System. ───
  const handleCycleTheme = useCallback(() => {
    const current = readTheme();
    const next: ThemeChoice =
      current === "system" ? "light" :
      current === "light"  ? "dark"  : "system";
    writeTheme(next); // applies DOM (.light class + data-theme) + updates localStorage
    window.__setThemeColor?.(resolveThemeChoice(next)); // sync meta theme-color
    setThemePref(next);
  }, []);

  // ── Sidebar handlers. ──────────────────────────────────────────────
  const handleAsk = useCallback(
    (query: string) => {
      const encoded = encodeURIComponent(query);
      router.push(`/chat?q=${encoded}`);
      setDrawerOpen(false);
    },
    [router]
  );
  const handleHome = useCallback(() => {
    router.push("/browse");
    setDrawerOpen(false);
  }, [router]);

  const handleOpenPin = useCallback(
    (path: string) => {
      const isFile = /\.[a-z0-9]+$/i.test(path);
      if (isFile) {
        const parent = path.split("/").slice(0, -1).filter(Boolean).map(encodeURIComponent).join("/");
        router.push(`/files/${parent}?file=${encodeURIComponent(path)}`);
      } else {
        router.push(`/files/${path.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`);
      }
      setDrawerOpen(false);
    },
    [router]
  );

  // ── Palette actions. ───────────────────────────────────────────────
  const paletteActions = useMemo<PaletteAction[]>(() => {
    const navIcon = (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    );
    return [
      { id: "nav-dashboard", group: "Navigation", label: "Dashboard", icon: navIcon, run: () => router.push("/browse") },
      { id: "nav-chat", group: "Navigation", label: "Chat", icon: navIcon, run: () => router.push("/chat") },
      { id: "nav-graph", group: "Navigation", label: "Graph", icon: navIcon, run: () => router.push("/browse/graph") },
      { id: "nav-system", group: "Navigation", label: "System", icon: navIcon, run: () => router.push("/browse/system") },
      { id: "nav-timeline", group: "Navigation", label: "Timeline", icon: navIcon, run: () => router.push("/browse/timeline") },
      { id: "nav-audits", group: "Navigation", label: "Audits", icon: navIcon, run: () => router.push("/browse/audit") },
      { id: "action-theme", group: "Actions", label: `Appearance: ${themePref === "light" ? "Light" : themePref === "dark" ? "Dark" : "System"}`, run: handleCycleTheme },
      {
        id: "action-connect-vault",
        group: "Actions",
        label: vault.connected ? "Switch vault" : "Connect vault",
        run: () => setConnectOpen(true),
      },
      ...(vault.connected ? [{
        id: "action-disconnect-vault",
        group: "Actions" as const,
        label: "Disconnect vault",
        run: () => {
          vault.disconnect?.();
          router.push("/browse");
        },
      }] : []),
      {
        id: "action-daily-note",
        group: "Actions" as const,
        label: "Open today's note",
        run: () => {
          void (async () => {
            try {
              const iso = formatDailyDate(new Date());
              const res = await fetch("/api/daily", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date: iso }),
              });
              if (res.ok) {
                const data = (await res.json()) as { path: string; created: boolean };
                router.push(`/browse?sheet=${encodeURIComponent(data.path)}`);
              } else if (res.status === 409) {
                setConnectOpen(true);
              } else if (res.status === 422) {
                // No journal folder detected. The TodayPage button surfaces a
                // toast for this; from the palette we degrade quietly.
                log.warn("daily-note", "no daily-notes folder detected in this vault");
              }
            } catch (err) {
              log.error("daily-note", "failed to open today's note", err);
            }
          })();
        },
      },
    ];
  }, [router, handleCycleTheme, vault, setConnectOpen, themePref]);

  // Active-state hint for sidebar — route-driven only, no view kind.
  const activeKind = null;

  // Shared sidebar props — passed to both the desktop aside and the mobile drawer.
  const sidebarProps: SidebarProps = {
    onAsk: handleAsk,
    onHome: handleHome,
    onBrowse: () => { router.push("/files"); setDrawerOpen(false); },
    onPalette: () => { setPaletteOpen(true); setDrawerOpen(false); },
    onToggleTheme: handleCycleTheme,
    themePref,
    activeKind,
    recentQueries,
    onRemoveRecent: handleRemoveRecent,
    onClearRecents: handleClearRecents,
    onOpenPin: handleOpenPin,
  };

  // Drawer animation: no spring, single-axis slide.
  // Respects prefers-reduced-motion by cutting the duration to near-zero.
  const drawerTransition = {
    duration: prefersReducedMotion ? 0.01 : 0.22,
    ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
  };

  return (
    <div className="app-shell" style={{ color: "var(--text-primary)" }}>
      <a href="#main-content" className="skip-link">Skip to content</a>

      {/* ── Desktop sidebar (hidden at ≤880px via CSS) — UNCHANGED ── */}
      <aside className="chrome-panel chrome-panel--sidebar sidebar-container">
        <Sidebar {...sidebarProps} />
      </aside>

      <main id="main-content" tabIndex={-1} className="chrome-panel chrome-panel--main" style={{ display: "flex", flexDirection: "column" }}>
        {children}
      </main>

      {/* ══ MOBILE ONLY — gated on isMobile (false on server + first render) ══ */}

      {/* Mobile top bar — 48px fixed chrome with hamburger + Cipher mark + ⌘K */}
      {isMobile && (
        <div
          className="mobile-top-bar"
          aria-label="Mobile navigation bar"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: 48,
            zIndex: 20,
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 12px",
            background: "var(--bg-marketing)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          {/* Hamburger — opens the off-canvas drawer */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            aria-controls="mobile-drawer"
            className="focus-ring tap-44"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: "var(--radius-comfortable)",
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Cipher wordmark */}
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 17,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              color: "var(--text-primary)",
            }}
          >
            Cipher
          </span>

          {/* ⌘K palette trigger */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Command palette (⌘K)"
            className="focus-ring tap-44"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: "var(--radius-comfortable)",
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
        </div>
      )}

      {/* Mobile off-canvas drawer */}
      <AnimatePresence>
        {isMobile && drawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.18 }}
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 350,
                background: "var(--overlay)",
              }}
            />
            {/* Drawer panel */}
            <motion.aside
              key="drawer-panel"
              id="mobile-drawer"
              ref={drawerRef}
              role="dialog"
              aria-label="Navigation menu"
              aria-modal="true"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={drawerTransition}
              className="mobile-drawer-panel chrome-panel"
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                bottom: 0,
                width: 240,
                zIndex: 351,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <Sidebar {...sidebarProps} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Detail sheet — URL-driven via ?sheet=<path> */}
      <AnimatePresence mode="wait">
        {sheet.path && (
          <DetailPage
            key={sheet.path}
            path={sheet.path}
            anchor={sheet.anchor ?? undefined}
            onBack={sheet.close}
            onNavigate={sheet.open}
            onAsk={(query) => {
              sheet.close();
              handleAsk(query);
            }}
            onHome={() => {
              sheet.close();
              router.push("/browse");
            }}
            onOpenSection={(section, folderPath) => {
              // Close the sheet, then route to the most relevant page for
              // this section. Unrecognised sections navigate to the file
              // browser scoped to the folder so the user still sees its contents.
              sheet.close();
              const s = section.toLowerCase();
              if (s === "system" || s === "meta" || s === "ops") {
                router.push("/browse/system");
              } else if (s === "journal" || s === "daily" || s === "daily-notes" || s === "diary" || s === "days") {
                router.push("/browse/timeline");
              } else if (s === "work" || s === "tasks" || s === "todo" || s === "todos") {
                router.push("/browse");
              } else if (s === "audits" || s === "reviews") {
                router.push("/browse/audit");
              } else {
                // Unrecognised section → navigate to the full-page file browser
                // scoped to that folder path.
                router.push(`/files/${folderPath.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`);
              }
            }}
          />
        )}
      </AnimatePresence>

      <HintChip hidden={!!sheet.path || paletteOpen} />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={paletteActions}
      />
      <VaultConnectDialog
        open={connectOpen}
        onClose={() => {
          setConnectOpen(false);
          try { sessionStorage.setItem("cipher-vault-nudge-dismissed", "1"); } catch { /* ignore */ }
        }}
      />
    </div>
  );
}
