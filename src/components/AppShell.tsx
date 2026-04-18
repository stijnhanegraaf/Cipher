"use client";

/**
 * Top-level app chrome — mounts Sidebar, DetailPage sheet, CommandPalette,
 * and routes content. Handles keyboard shortcuts and theme bootstrap.
 */

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { DetailPage } from "@/components/DetailPage";
import { VaultDrawer } from "@/components/VaultDrawer";
import { HintChip } from "@/components/HintChip";
import { Sidebar } from "@/components/Sidebar";
import { CommandPalette, type PaletteAction } from "@/components/CommandPalette";
import { useSheet } from "@/lib/hooks/useSheet";
import { useVault } from "@/lib/hooks/useVault";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { useSidebarPins } from "@/lib/hooks/useSidebarPins";

/**
 * AppShell — persistent chrome shared by every route.
 *
 * Owns: Sidebar, CommandPalette, VaultDrawer, DetailPage sheet (via ?sheet=),
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
  const pathname = usePathname();
  const vault = useVault();
  const sheet = useSheet();
  const { addPin } = useSidebarPins();

  const [vaultDrawerOpen, setVaultDrawerOpen] = useState(false);
  const [drawerScopedPath, setDrawerScopedPath] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  // Load recent queries from localStorage on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("cipher-recent");
      if (stored) setRecentQueries(JSON.parse(stored));
    } catch {}
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

  // ── Global shortcuts: ⌘K palette, Esc close top overlay. ───────────
  useKeyboardShortcuts([
    { key: "k", modifiers: ["meta"], handler: () => setPaletteOpen((v) => !v) },
    { key: "k", modifiers: ["ctrl"], handler: () => setPaletteOpen((v) => !v) },
    {
      key: "Escape",
      handler: () => {
        if (paletteOpen) setPaletteOpen(false);
        else if (vaultDrawerOpen) setVaultDrawerOpen(false);
        else if (sheet.path) sheet.close();
      },
    },
  ]);

  // ── Theme toggle (used by sidebar + palette). ──────────────────────
  const handleToggleTheme = useCallback(() => {
    const html = document.documentElement;
    const isLight = html.classList.contains("light");
    if (isLight) {
      html.classList.remove("light");
      html.classList.add("dark");
      localStorage.setItem("brain-theme", "dark");
    } else {
      html.classList.add("light");
      html.classList.remove("dark");
      localStorage.setItem("brain-theme", "light");
    }
  }, []);

  // ── Sidebar handlers. ──────────────────────────────────────────────
  const handleAsk = useCallback(
    (query: string) => {
      const encoded = encodeURIComponent(query);
      router.push(`/chat?q=${encoded}`);
    },
    [router]
  );
  const handleHome = useCallback(() => {
    router.push("/browse");
  }, [router]);

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
      { id: "nav-drawer", group: "Navigation", label: "Open vault drawer", icon: navIcon, run: () => setVaultDrawerOpen(true) },
      { id: "action-theme", group: "Actions", label: "Toggle theme", run: handleToggleTheme },
      {
        id: "action-disconnect-vault",
        group: "Actions",
        label: "Disconnect vault",
        run: () => {
          vault.disconnect?.();
          router.push("/browse");
        },
      },
    ];
  }, [router, handleToggleTheme, vault.disconnect]);

  // Active-state hint for sidebar — route-driven only, no view kind.
  const activeKind = null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        height: "100dvh",
        backgroundColor: "var(--bg-marketing)",
        color: "var(--text-primary)",
        position: "relative",
      }}
    >
      <div className="sidebar-container">
        <Sidebar
          onAsk={handleAsk}
          onHome={handleHome}
          onBrowse={() => setVaultDrawerOpen(true)}
          onPalette={() => setPaletteOpen(true)}
          onToggleTheme={handleToggleTheme}
          activeKind={activeKind}
          recentQueries={recentQueries}
          onRemoveRecent={handleRemoveRecent}
          onClearRecents={handleClearRecents}
          onOpenPin={(path) => {
            setVaultDrawerOpen(true);
            setDrawerScopedPath(path);
          }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100dvh" }}>
        {children}
      </div>

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
            onHome={() => router.push("/browse")}
          />
        )}
      </AnimatePresence>

      <VaultDrawer
        open={vaultDrawerOpen}
        scopedPath={drawerScopedPath ?? undefined}
        onClose={() => { setVaultDrawerOpen(false); setDrawerScopedPath(null); }}
        onNavigate={(query) => {
          setVaultDrawerOpen(false);
          handleAsk(query);
        }}
        onOpenFile={(path) => {
          setVaultDrawerOpen(false);
          sheet.open(path);
        }}
        onClearScope={() => setDrawerScopedPath(null)}
        onPinFolder={(path, label) => addPin({ path, label, icon: "folder" })}
      />

      <HintChip hidden={!!sheet.path || vaultDrawerOpen || paletteOpen} />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={paletteActions}
      />
    </div>
  );
}
