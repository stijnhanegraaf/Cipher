"use client";

/**
 * Top-level app chrome — mounts Sidebar, DetailPage sheet, CommandPalette,
 * and routes content. Handles keyboard shortcuts and theme bootstrap.
 */

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { DetailPage } from "@/components/DetailPage";
import { HintChip } from "@/components/HintChip";
import { Sidebar } from "@/components/Sidebar";
import { CommandPalette, type PaletteAction } from "@/components/CommandPalette";
import { VaultConnectDialog } from "@/components/VaultConnectDialog";
import { log } from "@/lib/log";
import { useSheet } from "@/lib/hooks/useSheet";
import { useVault } from "@/lib/hooks/useVault";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { formatDailyDate } from "@/lib/daily-note";

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

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const dismissed = sessionStorage.getItem("cipher-vault-nudge-dismissed");
    return !dismissed;
  });
  const [recentQueries, setRecentQueries] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("cipher-recent");
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });

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

  // ── Global shortcuts: ⌘K palette, Esc close top overlay. ───────────
  useKeyboardShortcuts([
    { key: "k", modifiers: ["meta"], handler: () => setPaletteOpen((v) => !v) },
    { key: "k", modifiers: ["ctrl"], handler: () => setPaletteOpen((v) => !v) },
    {
      key: "Escape",
      handler: () => {
        if (paletteOpen) setPaletteOpen(false);
        else if (sheet.path) sheet.close();
      },
    },
  ]);

  // ── Theme toggle (used by sidebar + palette). ──────────────────────
  const handleToggleTheme = useCallback(() => {
    const html = document.documentElement;
    const isLight = html.classList.contains("light");
    const next = isLight ? "dark" : "light";
    if (next === "dark") {
      html.classList.remove("light");
      html.classList.add("dark");
    } else {
      html.classList.add("light");
      html.classList.remove("dark");
    }
    localStorage.setItem("brain-theme", next);
    // Sync meta theme-color to the RESOLVED theme (not just OS).
    (window as Window & { __setThemeColor?: (t: string) => void }).__setThemeColor?.(next);
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
      { id: "nav-audits", group: "Navigation", label: "Audits", icon: navIcon, run: () => router.push("/browse/audit") },
      { id: "action-theme", group: "Actions", label: "Toggle theme", run: handleToggleTheme },
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
  }, [router, handleToggleTheme, vault, setConnectOpen]);

  // Active-state hint for sidebar — route-driven only, no view kind.
  const activeKind = null;

  return (
    <div className="app-shell" style={{ color: "var(--text-primary)" }}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <aside className="chrome-panel chrome-panel--sidebar sidebar-container">
        <Sidebar
          onAsk={handleAsk}
          onHome={handleHome}
          onBrowse={() => router.push("/files")}
          onPalette={() => setPaletteOpen(true)}
          onToggleTheme={handleToggleTheme}
          activeKind={activeKind}
          recentQueries={recentQueries}
          onRemoveRecent={handleRemoveRecent}
          onClearRecents={handleClearRecents}
          onOpenPin={(path) => {
            const isFile = /\.[a-z0-9]+$/i.test(path);
            if (isFile) {
              const parent = path.split("/").slice(0, -1).filter(Boolean).map(encodeURIComponent).join("/");
              router.push(`/files/${parent}?file=${encodeURIComponent(path)}`);
            } else {
              router.push(`/files/${path.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`);
            }
          }}
        />
      </aside>

      <main id="main-content" tabIndex={-1} className="chrome-panel chrome-panel--main" style={{ display: "flex", flexDirection: "column" }}>
        {children}
      </main>

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
