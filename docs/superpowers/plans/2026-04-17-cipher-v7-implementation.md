# Cipher v7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Cipher into proper Linear-quality structured surfaces — Today dashboard with checkbox interaction, bespoke page components per view type, Constellation graph, Raycast-minimal chat empty state, and a sidebar header that finally owns the shell.

**Architecture:** Introduce two shell primitives (`AppShell` owning sidebar + overlays; `PageShell` framing each non-chat page). Migrate `/browse/*` routes from the ChatInterface-with-`view`-prop shim to dedicated page components that use `PageShell`. Replace the Triage dashboard with TodayPage that reads a new `/api/today` endpoint and supports optimistic checkbox + undo. Thread a `useSheet` hook on a `?sheet=<path>` query param so any route can open a detail sheet. ChatInterface loses its `view` prop; it only owns `/chat`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, framer-motion, Tailwind v4 with CSS-var-driven tokens. No existing test framework — verification uses `npx tsc --noEmit` + manual browser walkthrough against the running dev server (port 3000). Each task's final step is a commit.

**Spec:** `docs/superpowers/specs/2026-04-17-cipher-v7-pages-home-graph-chat-design.md`

---

## File structure

### New files
```
src/lib/hooks/useSheet.ts                 — URL sheet-param helper
src/lib/today-builder.ts                  — today + up-next bucket logic
src/app/api/today/route.ts                — GET /api/today

src/components/AppShell.tsx               — owns sidebar + palette + drawer + sheet overlay + hint chip
src/components/PageShell.tsx              — header/toolbar/body frame for every page
src/components/ChatEmptyState.tsx         — /chat empty state

src/components/browse/TodayPage.tsx       — /browse landing
src/components/browse/TodayRow.tsx        — single task row (checkbox + priority + title + actions)
src/components/browse/SystemPage.tsx      — /browse/system
src/components/browse/TimelinePage.tsx    — /browse/timeline
src/components/browse/SearchPage.tsx      — /browse/search
src/components/browse/EntityPage.tsx      — /browse/entity/[name]
src/components/browse/TopicPage.tsx       — /browse/topic/[name]
src/components/browse/FileFullPage.tsx    — /file/[...path]
src/components/browse/GraphPage.tsx       — /browse/graph (wraps existing GraphCanvas + GraphFilters)

src/app/browse/system/page.tsx
src/app/browse/timeline/page.tsx
src/app/browse/search/page.tsx
src/app/browse/entity/[name]/page.tsx
src/app/browse/topic/[name]/page.tsx
src/app/file/[...path]/page.tsx
```

### Modified files
```
src/app/layout.tsx                — wrap {children} in <AppShell>
src/app/browse/page.tsx           — render <TodayPage/> (not ChatInterface)
src/app/browse/graph/page.tsx     — render <GraphPage/> (not ChatInterface)
src/app/chat/page.tsx             — render <ChatInterface/> only (no view prop)
src/components/ChatInterface.tsx  — drop `view` prop + view=triage/graph branches + QUICK_REPLIES + inline Sidebar/Palette/Drawer/DetailPage/HintChip (moved to AppShell); add ChatEmptyState when messages empty
src/components/Sidebar.tsx        — 48px header row with Cipher mark + ⌘K + Browse icon buttons
src/components/browse/GraphCanvas.tsx — Constellation palette + inhale + idle pulse + focus mode
src/components/views/ViewRenderer.tsx — add `variant: "chat-summary"`; render 2-3 line summary + "Open page" button for pageable intents
```

### Deprecated (deleted at end)
```
src/lib/triage-builder.ts
src/app/api/triage/route.ts
src/components/browse/TriageInbox.tsx
src/components/browse/TriageRow.tsx
src/components/browse/TriageFilterBar.tsx
src/components/browse/GraphView.tsx      — superseded by GraphPage
```

### Kept as-is (referenced but not modified in this plan)
```
src/components/browse/PriorityGlyph.tsx  — shared primitive; TodayRow imports it
src/components/browse/GraphCanvas.tsx    — modified for palette/motion but file stays
src/components/browse/GraphFilters.tsx   — unchanged
src/components/DetailPage.tsx            — still renders the sheet
src/lib/view-builder.ts                  — data source for all pages
src/lib/vault-reader.ts                  — data source
```

---

## Testing approach

No test framework is installed in this codebase (no Vitest/Jest/Playwright). Verification per task uses:

1. **`npx tsc --noEmit`** after every code change — catches type errors.
2. **Browser verification** against `http://localhost:3000` with the dev server already running. Specific visible assertions per task (documented inline).
3. **API verification** via `curl http://localhost:3000/api/<route>` for endpoint tasks.
4. **Grep checks** for the final cleanup pass.

Each task's final step is a commit with a conventional message. Frequent commits keep the branch bisectable.

---

## PHASE 1 — Foundation (Tasks 1–4)

### Task 1: `useSheet` hook

**Files:**
- Create: `src/lib/hooks/useSheet.ts`

- [ ] **Step 1: Write the hook**

```ts
"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * useSheet — URL-driven sheet overlay.
 *
 * Encodes the current sheet file path in the `?sheet=<vault-path>` query
 * param. Any page accepts it and mounts the DetailPage overlay when
 * present. Closing removes the param.
 *
 * Usage:
 *   const sheet = useSheet();
 *   sheet.open("wiki/foo.md");   // sets ?sheet=wiki%2Ffoo.md
 *   sheet.close();               // removes ?sheet
 *   sheet.path;                  // current sheet path or null
 */
export function useSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const path = searchParams.get("sheet");

  const open = useCallback(
    (vaultPath: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sheet", vaultPath);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("sheet");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return { path, open, close };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useSheet.ts
git commit -m "feat(v7): add useSheet hook for ?sheet= URL param"
```

---

### Task 2: `AppShell` — owns sidebar, overlays, sheet

**Files:**
- Create: `src/components/AppShell.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Write AppShell**

Create `src/components/AppShell.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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

/**
 * AppShell — persistent chrome shared by every route.
 *
 * Owns: Sidebar, CommandPalette, VaultDrawer, DetailPage sheet (via ?sheet=),
 * HintChip, global keyboard shortcuts. Children render as the route content
 * to the right of the sidebar.
 *
 * The sheet is URL-driven via useSheet: any descendant can push ?sheet=<path>
 * and the overlay mounts. Closing clears the param.
 */

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const vault = useVault();
  const sheet = useSheet();

  const [vaultDrawerOpen, setVaultDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  // Load recent queries from localStorage on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("cipher-recent");
      if (stored) setRecentQueries(JSON.parse(stored));
    } catch {}
  }, []);

  // ── Global shortcuts: ⌘K palette, Esc close top overlay. ───────────
  useKeyboardShortcuts([
    { keys: ["cmd+k", "ctrl+k"], handler: () => setPaletteOpen((v) => !v) },
    { keys: ["mod+k"], handler: () => setPaletteOpen((v) => !v) },
    {
      keys: ["escape"],
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
      { id: "nav-dashboard", group: "Navigation", label: "Dashboard", icon: navIcon, shortcut: [], run: () => router.push("/browse") },
      { id: "nav-chat", group: "Navigation", label: "Chat", icon: navIcon, shortcut: [], run: () => router.push("/chat") },
      { id: "nav-graph", group: "Navigation", label: "Graph", icon: navIcon, shortcut: [], run: () => router.push("/browse/graph") },
      { id: "nav-system", group: "Navigation", label: "System", icon: navIcon, shortcut: [], run: () => router.push("/browse/system") },
      { id: "nav-timeline", group: "Navigation", label: "Timeline", icon: navIcon, shortcut: [], run: () => router.push("/browse/timeline") },
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
  }, [router, handleToggleTheme, vault]);

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
          />
        )}
      </AnimatePresence>

      <VaultDrawer
        open={vaultDrawerOpen}
        onClose={() => setVaultDrawerOpen(false)}
        onNavigate={(query) => {
          setVaultDrawerOpen(false);
          handleAsk(query);
        }}
        onOpenFile={(path) => {
          setVaultDrawerOpen(false);
          sheet.open(path);
        }}
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
```

- [ ] **Step 2: Wrap root layout in AppShell**

Edit `src/app/layout.tsx`. Replace the `<body>` children section so it wraps children with `<AppShell>`:

```tsx
// At the top of the file, add:
import { AppShell } from "@/components/AppShell";

// In RootLayout, replace:
//   {children}
// with:
//   <AppShell>{children}</AppShell>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If any component referenced by AppShell was previously only imported into ChatInterface, the imports now live in AppShell and that's fine.

- [ ] **Step 4: Browser check**

Open `http://localhost:3000/browse`. The sidebar should render (likely twice right now — once from AppShell, once from inside ChatInterface). That's expected — we clean that up in Task 17. Verify: no console errors, keyboard `⌘K` opens the palette, `Esc` closes it.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppShell.tsx src/app/layout.tsx
git commit -m "feat(v7): add AppShell that owns sidebar, palette, drawer, sheet"
```

---

### Task 3: `PageShell` primitive

**Files:**
- Create: `src/components/PageShell.tsx`

- [ ] **Step 1: Write PageShell**

```tsx
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
  icon: React.ReactNode;
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
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 560,
                letterSpacing: -0.4,
                lineHeight: 1.2,
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/PageShell.tsx
git commit -m "feat(v7): add PageShell + PageAction primitives"
```

---

### Task 4: `FileFullPage` + `/file/[...path]` route

**Files:**
- Create: `src/components/browse/FileFullPage.tsx`
- Create: `src/app/file/[...path]/page.tsx`

- [ ] **Step 1: Write FileFullPage**

Create `src/components/browse/FileFullPage.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, PageAction } from "@/components/PageShell";
import { Breadcrumbs, MarkdownRenderer } from "@/components/ui";
import { useSheet } from "@/lib/hooks/useSheet";
import { useVault } from "@/lib/hooks/useVault";

interface FileData {
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
  content: string;
  sections: Array<{ heading: string; level: number; body: string }>;
}

/**
 * FileFullPage — full-route file view at /file/[...path].
 *
 * Renders the same content as the sheet overlay, but inside a PageShell
 * (no backdrop, no slide) and with the browser's own navigation stack.
 * Wiki-links open the sheet (?sheet=) on top of this page.
 */
export function FileFullPage({ path }: { path: string }) {
  const router = useRouter();
  const vault = useVault();
  const sheet = useSheet();
  const [data, setData] = useState<FileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `File fetch failed (${res.status})`);
        }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load file");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const openObsidian = useCallback(() => {
    const vaultName = vault.name || "Obsidian";
    window.open(`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path)}`, "_blank");
  }, [path, vault.name]);

  const title = data?.title ?? path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
  const subtitle = (data?.frontmatter?.description as string) || undefined;

  return (
    <PageShell
      icon={
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
      }
      title={title}
      subtitle={subtitle}
      actions={
        <PageAction label="Open in Obsidian" onClick={openObsidian}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </PageAction>
      }
      toolbar={
        <div style={{ flex: 1 }}>
          <Breadcrumbs
            path={path}
            onHome={() => router.push("/browse")}
            onSection={(query) => router.push(`/chat?q=${encodeURIComponent(query)}`)}
          />
        </div>
      }
    >
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "32px 32px 120px" }}>
        {loading && <p className="caption-large" style={{ color: "var(--text-quaternary)" }}>Loading…</p>}
        {error && (
          <div>
            <p className="caption-large" style={{ color: "var(--status-blocked)", marginBottom: 8 }}>
              Couldn't load file
            </p>
            <p className="small" style={{ color: "var(--text-tertiary)" }}>{error}</p>
          </div>
        )}
        {data && (
          <MarkdownRenderer content={data.content} onNavigate={sheet.open} />
        )}
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 2: Write the route page**

Create `src/app/file/[...path]/page.tsx`:

```tsx
import { FileFullPage } from "@/components/browse/FileFullPage";

export default async function FileRoute({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  // Next 16 dynamic segments — path[] already URL-decoded per segment.
  const joined = path.join("/");
  return <FileFullPage path={joined} />;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Browser check**

Assuming a file like `wiki/knowledge/entities/test.md` exists in the active vault, open:
`http://localhost:3000/file/wiki/knowledge/entities/test.md`

Verify: PageShell header shows with file title, breadcrumbs in toolbar, markdown body renders below.

- [ ] **Step 5: Commit**

```bash
git add src/components/browse/FileFullPage.tsx src/app/file/
git commit -m "feat(v7): add /file/[...path] full-route file view"
```

---

## PHASE 2 — TodayPage (Tasks 5–9)

### Task 5: `today-builder` — types and bucket helper

**Files:**
- Create: `src/lib/today-builder.ts`

- [ ] **Step 1: Write the types + pure bucketing helper**

Create `src/lib/today-builder.ts`:

```ts
import "server-only";
import { readdir, stat } from "fs/promises";
import { extname, join } from "path";
import {
  readVaultFile,
  parseCheckboxes,
  getVaultPath,
  getVaultLayout,
} from "./vault-reader";

// ─── Types ────────────────────────────────────────────────────────────

export type TodayBucket = "today" | "upNext";

export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "open" | "in_progress" | "blocked";

export interface TodayTask {
  id: string;
  bucket: TodayBucket;
  text: string;
  status: TaskStatus;
  priority: TaskPriority;
  path: string;
  lineIndex: number;
  mtime: number;
  /** Lower is more urgent; used for stable sort. */
  rank: number;
}

export interface TodayPayload {
  today: TodayTask[];
  upNext: TodayTask[];
  counts: {
    today: number;
    upNext: number;
    blocked: number;
    highPriority: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────

function stripWikiLinks(text: string): string {
  return text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, p, l) => l || p).trim();
}

function inferStatus(text: string): TaskStatus {
  if (/\bblocked\b|\bwaiting\b/i.test(text)) return "blocked";
  if (/\bin.?progress\b|\bactive\b|\bdoing\b/i.test(text)) return "in_progress";
  return "open";
}

function inferPriority(text: string): TaskPriority {
  if (/\bhigh\b|\burgent\b|\bcritical\b|\bp0\b|\bp1\b/i.test(text)) return "high";
  if (/\bmedium\b|\bmed\b|\bp2\b/i.test(text)) return "medium";
  return "low";
}

/**
 * Decide whether a task lives in the "today" bucket.
 *
 * A task is in Today if any of:
 *  - has high priority,
 *  - text contains @today (case-insensitive),
 *  - the source file is named today.md / open.md / now.md (any folder) AND
 *    its mtime is within the last 24h,
 *  - status is blocked (blocked always surfaces).
 */
export function isTodayCandidate(
  text: string,
  priority: TaskPriority,
  status: TaskStatus,
  sourcePath: string,
  sourceMtime: number,
  now: number = Date.now()
): boolean {
  if (priority === "high") return true;
  if (/@today\b/i.test(text)) return true;
  if (status === "blocked") return true;
  const basename = (sourcePath.split("/").pop() || "").toLowerCase();
  if (
    (basename === "today.md" || basename === "open.md" || basename === "now.md") &&
    now - sourceMtime <= 24 * 60 * 60 * 1000
  ) {
    return true;
  }
  return false;
}

/**
 * Rank function for sort: lower == more urgent.
 *   blocked high: 0, blocked medium: 1, blocked low: 2,
 *   in_progress high: 3, medium 4, low 5,
 *   open high: 6, medium 7, low 8.
 */
export function rankTask(status: TaskStatus, priority: TaskPriority): number {
  const statusWeight = status === "blocked" ? 0 : status === "in_progress" ? 3 : 6;
  const priorityWeight = priority === "high" ? 0 : priority === "medium" ? 1 : 2;
  return statusWeight + priorityWeight;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/today-builder.ts
git commit -m "feat(v7): today-builder types + bucket/rank helpers"
```

---

### Task 6: `today-builder` — vault walk + `buildToday`

**Files:**
- Modify: `src/lib/today-builder.ts`

- [ ] **Step 1: Append vault walk + aggregate**

Append the following to `src/lib/today-builder.ts` (after the helpers from Task 5):

```ts
// ─── Vault walk ──────────────────────────────────────────────────────
// Walks every .md file under a set of candidate folders, opens each file,
// parses open checkboxes, and converts to TodayTask[].

async function safeListMd(absDir: string): Promise<string[]> {
  try {
    const entries = await readdir(absDir, { withFileTypes: true });
    const out: string[] = [];
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(e.name);
    }
    return out;
  } catch {
    return [];
  }
}

async function walkTasksInDir(root: string, relDir: string): Promise<TodayTask[]> {
  const out: TodayTask[] = [];
  const absDir = relDir ? join(root, relDir) : root;
  const files = await safeListMd(absDir);
  for (const name of files) {
    const vaultRel = relDir ? `${relDir}/${name}` : name;
    const file = await readVaultFile(vaultRel);
    if (!file) continue;
    const mtime = file.mtime || 0;
    const checkboxes = parseCheckboxes(file.content);
    for (const cb of checkboxes) {
      if (cb.checked) continue;
      const text = stripWikiLinks(cb.text);
      const priority = inferPriority(cb.text);
      const status = inferStatus(cb.text);
      out.push({
        id: `t-${vaultRel}-${cb.lineIndex}`,
        bucket: "today", // filled in by split()
        text,
        status,
        priority,
        path: vaultRel,
        lineIndex: cb.lineIndex,
        mtime,
        rank: rankTask(status, priority),
      });
    }
  }
  return out;
}

/**
 * Aggregate open tasks from the vault's work folders into today + up-next.
 * Returns an empty payload gracefully when no vault / no work folders.
 */
export async function buildToday(): Promise<TodayPayload> {
  const root = getVaultPath();
  if (!root) {
    return { today: [], upNext: [], counts: { today: 0, upNext: 0, blocked: 0, highPriority: 0 } };
  }
  const layout = getVaultLayout();

  // Candidate folders: layout.workDir if present, plus vault root
  // (for loose today.md/open.md files at root), plus any folder containing
  // a today.md/open.md/now.md file at the top level.
  const candidateDirs = new Set<string>();
  if (layout?.workDir) candidateDirs.add(layout.workDir);
  candidateDirs.add(""); // vault root

  // Also pick up any subfolder that has today.md / open.md / now.md at its top.
  try {
    const topLevel = await readdir(root, { withFileTypes: true });
    for (const entry of topLevel) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const inside = await readdir(join(root, entry.name)).catch(() => []);
      const names = new Set(inside.map((n) => n.toLowerCase()));
      if (names.has("today.md") || names.has("open.md") || names.has("now.md")) {
        candidateDirs.add(entry.name);
      }
    }
  } catch {
    /* ignore */
  }

  // Walk each candidate folder, collect tasks.
  const all: TodayTask[] = [];
  for (const dir of candidateDirs) {
    all.push(...(await walkTasksInDir(root, dir)));
  }

  // De-dup by id (same line can be reached via multiple candidate folders).
  const seen = new Set<string>();
  const deduped: TodayTask[] = [];
  for (const t of all) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    deduped.push(t);
  }

  // Split into today / up-next.
  const now = Date.now();
  const today: TodayTask[] = [];
  const upNext: TodayTask[] = [];
  for (const t of deduped) {
    if (isTodayCandidate(t.text, t.priority, t.status, t.path, t.mtime, now)) {
      today.push({ ...t, bucket: "today" });
    } else {
      upNext.push({ ...t, bucket: "upNext" });
    }
  }

  // Sort by rank, then mtime desc.
  const cmp = (a: TodayTask, b: TodayTask) => a.rank - b.rank || b.mtime - a.mtime;
  today.sort(cmp);
  upNext.sort(cmp);

  const counts = {
    today: today.length,
    upNext: upNext.length,
    blocked: deduped.filter((t) => t.status === "blocked").length,
    highPriority: deduped.filter((t) => t.priority === "high").length,
  };

  // Cap upNext at 16 (TodayPage shows 8, reveals up to 16 with "Show more").
  return { today, upNext: upNext.slice(0, 16), counts };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/today-builder.ts
git commit -m "feat(v7): today-builder vault walk + aggregate"
```

---

### Task 7: `/api/today` endpoint

**Files:**
- Create: `src/app/api/today/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { buildToday } from "@/lib/today-builder";
import { getVaultPath } from "@/lib/vault-reader";

// GET /api/today — returns { today, upNext, counts } for the TodayPage.

export async function GET() {
  try {
    if (!getVaultPath()) {
      return NextResponse.json(
        { error: "No vault connected", today: [], upNext: [], counts: null },
        { status: 409 }
      );
    }
    const payload = await buildToday();
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Today API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build today" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify endpoint**

Run: `curl -s http://localhost:3000/api/today | head -c 400`
Expected output: JSON with top-level `today`, `upNext`, and `counts` keys. Something like `{"today":[{"id":"t-…"`. If vault disconnected, expect `{"error":"No vault connected",…}` with HTTP 409.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/today/route.ts
git commit -m "feat(v7): GET /api/today endpoint"
```

---

### Task 8: `TodayRow` component

**Files:**
- Create: `src/components/browse/TodayRow.tsx`

- [ ] **Step 1: Write TodayRow**

```tsx
"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PriorityGlyph } from "@/components/browse/PriorityGlyph";
import { useSheet } from "@/lib/hooks/useSheet";
import type { TodayTask } from "@/lib/today-builder";

interface Props {
  task: TodayTask;
  /** Fires when the task is checked off. Parent owns optimistic state + API call + undo. */
  onToggle: (task: TodayTask) => void;
  /** True when this row is visually checked-off + about to fade out. */
  pendingCheck?: boolean;
  /** Forwards chat-query intent for the "Ask about" hover action. */
  onAsk?: (query: string) => void;
}

/**
 * TodayRow — 40px task row.
 *
 * Columns: checkbox · priority glyph · title · right meta (path + rel time) ·
 * hover actions. Checkbox click toggles via parent handler (stopPropagation).
 * Row body click opens the source file as a sheet.
 */
export function TodayRow({ task, onToggle, pendingCheck = false, onAsk }: Props) {
  const router = useRouter();
  const sheet = useSheet();
  const [hovered, setHovered] = useState(false);

  const openSheet = useCallback(() => sheet.open(task.path), [sheet, task.path]);
  const openFull = useCallback(() => router.push(`/file/${task.path}`), [router, task.path]);
  const handleAsk = useCallback(() => onAsk?.(`tell me about ${task.text.slice(0, 80)}`), [onAsk, task.text]);

  const handleCheckbox = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle(task);
    },
    [onToggle, task]
  );

  const checked = pendingCheck;

  return (
    <button
      type="button"
      onClick={openSheet}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="app-row focus-ring"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        height: 40,
        padding: "0 16px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        textAlign: "left",
        borderBottom: "1px solid var(--border-subtle)",
        opacity: checked ? 0.5 : 1,
        transition: "opacity 180ms cubic-bezier(0.25, 0.1, 0.25, 1)",
      }}
    >
      {/* Checkbox */}
      <span
        role="checkbox"
        aria-checked={checked}
        aria-label="Mark complete"
        onClick={handleCheckbox}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            e.preventDefault();
            onToggle(task);
          }
        }}
        tabIndex={0}
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          border: `1.5px solid ${checked ? "var(--accent-brand)" : "var(--border-standard)"}`,
          background: checked ? "var(--accent-brand)" : "transparent",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          cursor: "pointer",
          transition: "border-color var(--motion-hover) var(--ease-default), background var(--motion-hover) var(--ease-default)",
        }}
      >
        {checked && (
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="var(--text-on-brand)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </span>

      {/* Priority glyph */}
      <span style={{ flexShrink: 0, opacity: checked ? 0.3 : 1, transition: "opacity 180ms" }}>
        <PriorityGlyph priority={task.priority} size={14} />
      </span>

      {/* Title */}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          lineHeight: 1.4,
          color: task.status === "blocked" ? "var(--text-tertiary)" : "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textDecoration: checked ? "line-through" : "none",
          textDecorationColor: "var(--text-quaternary)",
        }}
      >
        {task.status === "blocked" && (
          <span
            className="mono-label"
            style={{
              marginRight: 8,
              padding: "1px 4px",
              background: "color-mix(in srgb, var(--status-blocked) 15%, transparent)",
              color: "var(--status-blocked)",
              borderRadius: 3,
              letterSpacing: "0.04em",
            }}
          >
            BLK
          </span>
        )}
        {task.text}
      </span>

      {/* Meta / hover actions */}
      {!hovered && (
        <span
          className="mono-label"
          style={{
            color: "var(--text-quaternary)",
            letterSpacing: "0.02em",
            flexShrink: 0,
            maxWidth: 240,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {shortPath(task.path)} · {relTime(task.mtime)}
        </span>
      )}
      {hovered && (
        <span
          style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <RowIconButton label="Open full" onClick={openFull}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7M7 7h10v10" />
            </svg>
          </RowIconButton>
          {onAsk && (
            <RowIconButton label="Ask about" onClick={handleAsk}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </RowIconButton>
          )}
        </span>
      )}
    </button>
  );
}

function RowIconButton({
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
        width: 24,
        height: 24,
        borderRadius: 4,
        background: "transparent",
        border: "none",
        color: "var(--text-tertiary)",
        cursor: "pointer",
        transition: "background var(--motion-hover) var(--ease-default)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-surface-alpha-4)";
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

function shortPath(p: string): string {
  const parts = p.split("/");
  if (parts.length <= 2) return p.replace(/\.md$/i, "");
  return `${parts[0]}/…/${parts[parts.length - 1].replace(/\.md$/i, "")}`;
}

function relTime(ms: number): string {
  if (!ms) return "";
  const now = Date.now();
  const diff = now - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return `${Math.floor(diff / 604_800_000)}w ago`;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/browse/TodayRow.tsx
git commit -m "feat(v7): TodayRow with hover actions + BLK badge"
```

---

### Task 9: `TodayPage` + wire `/browse`

**Files:**
- Create: `src/components/browse/TodayPage.tsx`
- Modify: `src/app/browse/page.tsx`

- [ ] **Step 1: Write TodayPage**

Create `src/components/browse/TodayPage.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, PageAction } from "@/components/PageShell";
import { TodayRow } from "@/components/browse/TodayRow";
import type { TodayPayload, TodayTask } from "@/lib/today-builder";

const FADE_DELAY_MS = 2000;
const UNDO_WINDOW_MS = 6000;
const UP_NEXT_CAP = 8;

export function TodayPage() {
  const router = useRouter();
  const [data, setData] = useState<TodayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Set of task ids currently "checked" — strikethrough + fading out.
   * When a task lands here we schedule a fade-out and removal from the list.
   */
  const [pendingCheck, setPendingCheck] = useState<Set<string>>(new Set());

  /** Undo toast — pops when a task is checked; clicking reverts. */
  const [undoTask, setUndoTask] = useState<TodayTask | null>(null);
  const [showMore, setShowMore] = useState(false);

  // ── Load data. ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/today");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Today fetch failed (${res.status})`);
        }
        const payload: TodayPayload = await res.json();
        if (!cancelled) setData(payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load today");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Toggle / undo handlers. ────────────────────────────────────────
  const writeToggle = useCallback(async (task: TodayTask, checked: boolean) => {
    return fetch("/api/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: task.path, lineIndex: task.lineIndex, checked }),
    });
  }, []);

  const handleToggle = useCallback(
    (task: TodayTask) => {
      // If already pending, clicking again is an immediate revert.
      if (pendingCheck.has(task.id)) {
        setPendingCheck((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
        setUndoTask(null);
        writeToggle(task, false).catch(() => {/* already reverted UI-side */});
        return;
      }

      // Optimistic check.
      setPendingCheck((prev) => {
        const next = new Set(prev);
        next.add(task.id);
        return next;
      });
      setUndoTask(task);

      // Write in background.
      writeToggle(task, true).catch(() => {
        // API failed — revert.
        setPendingCheck((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
        setUndoTask(null);
        alert("Couldn't save — reverted."); // simple fallback; richer toast in v7.1
      });

      // After 2s, remove from list.
      setTimeout(() => {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            today: prev.today.filter((t) => t.id !== task.id),
            upNext: prev.upNext.filter((t) => t.id !== task.id),
            counts: {
              ...prev.counts,
              today: Math.max(0, prev.counts.today - (prev.today.some((t) => t.id === task.id) ? 1 : 0)),
              upNext: Math.max(0, prev.counts.upNext - (prev.upNext.some((t) => t.id === task.id) ? 1 : 0)),
            },
          };
        });
        setPendingCheck((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }, FADE_DELAY_MS);

      // Auto-clear undo toast after the window.
      setTimeout(() => {
        setUndoTask((t) => (t?.id === task.id ? null : t));
      }, UNDO_WINDOW_MS);
    },
    [pendingCheck, writeToggle]
  );

  const handleUndo = useCallback(() => {
    if (!undoTask) return;
    const task = undoTask;
    // Revert UI: remove pending, re-add task into list (optimistic re-insert at top).
    setPendingCheck((prev) => {
      const next = new Set(prev);
      next.delete(task.id);
      return next;
    });
    setData((prev) => {
      if (!prev) return prev;
      const targetBucket = task.bucket === "today" ? "today" : "upNext";
      const list = prev[targetBucket];
      if (list.some((t) => t.id === task.id)) return prev;
      return { ...prev, [targetBucket]: [task, ...list] } as TodayPayload;
    });
    setUndoTask(null);
    // Revert file state.
    writeToggle(task, false).catch(() => {/* stuck if it fails; surface later */});
  }, [undoTask, writeToggle]);

  const handleAsk = useCallback((query: string) => router.push(`/chat?q=${encodeURIComponent(query)}`), [router]);

  // ── Derived. ───────────────────────────────────────────────────────
  const now = new Date();
  const dateLabel = useMemo(() =>
    now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  , []); // reconcile on first render only
  const subtitle = data
    ? `${dateLabel} · ${data.counts.today} open${data.counts.blocked > 0 ? ` · ${data.counts.blocked} blocked` : ""}`
    : dateLabel;

  const todayList = data?.today ?? [];
  const upNextList = data?.upNext ?? [];
  const upNextVisible = showMore ? upNextList : upNextList.slice(0, UP_NEXT_CAP);
  const upNextHiddenCount = upNextList.length - upNextVisible.length;

  // ── Render. ────────────────────────────────────────────────────────
  return (
    <PageShell
      icon={
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      }
      title="Today"
      subtitle={subtitle}
    >
      {loading && (
        <div style={{ padding: 32 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-shimmer"
              style={{
                height: 40,
                marginBottom: 4,
                borderRadius: 6,
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: 32 }}>
          <p className="caption-large" style={{ color: "var(--status-blocked)", marginBottom: 8 }}>
            Couldn't load today
          </p>
          <p className="small" style={{ color: "var(--text-tertiary)" }}>{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <section>
            <SectionHeader label="Today" count={todayList.length} />
            {todayList.length === 0 ? (
              <EmptyState body="No tasks for today. Quiet start." />
            ) : (
              todayList.map((task) => (
                <TodayRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  pendingCheck={pendingCheck.has(task.id)}
                  onAsk={handleAsk}
                />
              ))
            )}
          </section>

          {upNextList.length > 0 && (
            <section style={{ marginTop: 32 }}>
              <SectionHeader label="Up next" count={upNextList.length} />
              {upNextVisible.map((task) => (
                <TodayRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  pendingCheck={pendingCheck.has(task.id)}
                  onAsk={handleAsk}
                />
              ))}
              {upNextHiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowMore(true)}
                  className="focus-ring"
                  style={{
                    display: "block",
                    margin: "12px auto",
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "transparent",
                    border: "1px solid var(--border-standard)",
                    color: "var(--text-tertiary)",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Show more ({upNextHiddenCount})
                </button>
              )}
            </section>
          )}
        </>
      )}

      {/* Undo toast */}
      {undoTask && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: 24,
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--bg-tooltip)",
            border: "1px solid var(--border-standard)",
            color: "var(--text-primary)",
            fontSize: 13,
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            zIndex: 100,
            boxShadow: "var(--shadow-dialog)",
          }}
        >
          <span>Marked done — <span style={{ color: "var(--text-tertiary)", maxWidth: 220, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}>{undoTask.text}</span></span>
          <button
            type="button"
            onClick={handleUndo}
            className="focus-ring"
            style={{
              color: "var(--accent-brand)",
              background: "transparent",
              border: "none",
              fontWeight: 510,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Undo
          </button>
        </div>
      )}
    </PageShell>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div
      className="mono-label"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px 8px",
        color: "var(--text-tertiary)",
        letterSpacing: "0.04em",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <span>{label.toUpperCase()}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-quaternary)" }}>{count}</span>
    </div>
  );
}

function EmptyState({ body }: { body: string }) {
  return (
    <p
      className="small"
      style={{
        color: "var(--text-quaternary)",
        padding: "16px",
        margin: 0,
      }}
    >
      {body}
    </p>
  );
}
```

- [ ] **Step 2: Wire `/browse/page.tsx` to TodayPage**

Replace contents of `src/app/browse/page.tsx`:

```tsx
import { TodayPage } from "@/components/browse/TodayPage";

// /browse — Today dashboard.
export default function BrowsePage() {
  return <TodayPage />;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Browser check**

Open `http://localhost:3000/browse`. Verify:
- PageShell header with sun icon + "Today" title + subtitle (date + counts).
- Two sections: TODAY and UP NEXT with row lists.
- Clicking a checkbox: row fades + strikethrough, undo toast appears bottom-left, row disappears after 2s.
- Clicking Undo within 6s: row reappears at top of its section.
- There are now TWO sidebars visible (one from AppShell, one from ChatInterface rendering on /chat). That's cleaned up in Task 17.

- [ ] **Step 5: Commit**

```bash
git add src/components/browse/TodayPage.tsx src/app/browse/page.tsx
git commit -m "feat(v7): TodayPage with optimistic check + undo, wire /browse"
```

---

## PHASE 3 — Bespoke pages (Tasks 10–14)

### Task 10: `SystemPage` + route

**Files:**
- Create: `src/components/browse/SystemPage.tsx`
- Create: `src/app/browse/system/page.tsx`

- [ ] **Step 1: Write SystemPage**

Create `src/components/browse/SystemPage.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell, PageAction } from "@/components/PageShell";
import { StatusDot, Badge, MarkdownRenderer } from "@/components/ui";
import { useSheet } from "@/lib/hooks/useSheet";
import type { SystemStatusData, Status } from "@/lib/view-models";

/** Fetch system status via the existing /api/query pipeline. */
async function fetchSystemData(): Promise<SystemStatusData | null> {
  const res = await fetch("/api/query?intent=system_status");
  if (!res.ok) return null;
  const payload = await res.json();
  const view = payload?.response?.views?.[0];
  return (view?.data as SystemStatusData) ?? null;
}

export function SystemPage() {
  const sheet = useSheet();
  const [data, setData] = useState<SystemStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchSystemData();
        if (!cancelled) setData(payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load system status");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  const healthyCount = data?.checks.filter((c) => c.status === "ok" || c.status === "fresh").length ?? 0;
  const attentionCount = data?.checks.filter((c) => c.status === "warn" || c.status === "error").length ?? 0;
  const subtitle = data
    ? `${healthyCount} healthy${attentionCount > 0 ? ` · ${attentionCount} needs attention` : ""}`
    : undefined;

  return (
    <PageShell
      icon={
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
        </svg>
      }
      title="System status"
      subtitle={subtitle}
      actions={
        <PageAction label="Refresh" onClick={refresh}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </PageAction>
      }
    >
      {loading && <Loading />}
      {!loading && error && <ErrorBlock body={error} />}
      {!loading && !error && data && (
        <>
          <Section label="Checks" count={data.checks.length}>
            {data.checks.length === 0 ? (
              <EmptyState body="No checks configured." />
            ) : (
              data.checks.map((check, i) => (
                <CheckRow key={i} status={check.status} label={check.label} detail={check.detail} />
              ))
            )}
          </Section>

          {data.attention && data.attention.length > 0 && (
            <Section label="Needs attention" count={data.attention.length}>
              <div
                style={{
                  margin: "12px 16px",
                  padding: "14px 16px",
                  borderRadius: 8,
                  background: "color-mix(in srgb, var(--status-warning) 6%, transparent)",
                  borderLeft: "2px solid var(--status-warning)",
                }}
              >
                <div className="small" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  <MarkdownRenderer content={data.attention.join(". ") + "."} onNavigate={sheet.open} />
                </div>
              </div>
            </Section>
          )}
        </>
      )}
    </PageShell>
  );
}

function Section({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div
        className="mono-label"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 16px 8px",
          color: "var(--text-tertiary)",
          letterSpacing: "0.04em",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span>{label.toUpperCase()}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-quaternary)" }}>{count}</span>
      </div>
      {children}
    </section>
  );
}

function CheckRow({ status, label, detail }: { status: Status; label: string; detail?: string }) {
  const variant =
    status === "ok" || status === "fresh"
      ? ("success" as const)
      : status === "warn"
      ? ("warning" as const)
      : ("error" as const);
  const pillLabel =
    status === "ok" ? "Healthy" : status === "fresh" ? "Fresh" : status === "warn" ? "Warning" : status === "error" ? "Error" : "Stale";
  return (
    <div
      className="app-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
        height: 40,
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <span style={{ flexShrink: 0 }}>
        <StatusDot status={status} size={8} />
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)", fontSize: 13 }}>
        {label}
      </span>
      <Badge variant={variant} dot>
        {pillLabel}
      </Badge>
    </div>
  );
}

function Loading() {
  return (
    <div style={{ padding: 32 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-shimmer" style={{ height: 40, marginBottom: 4, borderRadius: 6, animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}

function ErrorBlock({ body }: { body: string }) {
  return (
    <div style={{ padding: 32 }}>
      <p className="caption-large" style={{ color: "var(--status-blocked)", marginBottom: 8 }}>
        Couldn't load
      </p>
      <p className="small" style={{ color: "var(--text-tertiary)" }}>{body}</p>
    </div>
  );
}

function EmptyState({ body }: { body: string }) {
  return (
    <p className="small" style={{ color: "var(--text-quaternary)", padding: 16, margin: 0 }}>
      {body}
    </p>
  );
}
```

- [ ] **Step 2: Write the route page**

Create `src/app/browse/system/page.tsx`:

```tsx
import { SystemPage } from "@/components/browse/SystemPage";

export default function SystemRoute() {
  return <SystemPage />;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Browser check**

Open `http://localhost:3000/browse/system`. Verify PageShell header "System status", CHECKS section with status rows, optional NEEDS ATTENTION block if data has attention items.

- [ ] **Step 5: Commit**

```bash
git add src/components/browse/SystemPage.tsx src/app/browse/system/
git commit -m "feat(v7): SystemPage at /browse/system"
```

---

### Task 11: `TimelinePage` + route

**Files:**
- Create: `src/components/browse/TimelinePage.tsx`
- Create: `src/app/browse/timeline/page.tsx`

- [ ] **Step 1: Write TimelinePage**

Create `src/components/browse/TimelinePage.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { useSheet } from "@/lib/hooks/useSheet";
import type { TimelineSynthesisData } from "@/lib/view-models";

type Range = "week" | "month" | "quarter" | "all";
const RANGE_LABEL: Record<Range, string> = {
  week: "This week",
  month: "This month",
  quarter: "This quarter",
  all: "All time",
};
const RANGE_MS: Record<Exclude<Range, "all">, number> = {
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  quarter: 90 * 24 * 60 * 60 * 1000,
};

async function fetchTimeline(): Promise<TimelineSynthesisData | null> {
  const res = await fetch("/api/query?intent=timeline_synthesis");
  if (!res.ok) return null;
  const payload = await res.json();
  return (payload?.response?.views?.[0]?.data as TimelineSynthesisData) ?? null;
}

export function TimelinePage() {
  const sheet = useSheet();
  const [data, setData] = useState<TimelineSynthesisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("month");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const payload = await fetchTimeline();
        if (!cancelled) setData(payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load timeline");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Flatten themes into date-sorted items, then group by week bucket.
  const grouped = useMemo(() => {
    if (!data) return [] as { label: string; items: { date: string; label: string; path?: string; summary?: string }[] }[];
    const all = data.themes.flatMap((t) =>
      t.items.map((it) => ({ date: it.date, label: it.label, path: it.path, summary: it.summary, theme: t.label }))
    );
    // Parse date strings loosely — accept "YYYY-MM-DD" or human "12 Mar" (current year).
    const now = Date.now();
    const parsed = all
      .map((it) => {
        const d = parseLooseDate(it.date);
        return d ? { ...it, ts: d.getTime() } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    // Apply range filter.
    const filtered = range === "all"
      ? parsed
      : parsed.filter((p) => now - p.ts <= RANGE_MS[range]);
    // Sort desc.
    filtered.sort((a, b) => b.ts - a.ts);
    // Bucket by week.
    const buckets = new Map<string, typeof filtered>();
    for (const item of filtered) {
      const key = weekKey(new Date(item.ts));
      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
    }
    return Array.from(buckets.entries()).map(([label, items]) => ({ label, items }));
  }, [data, range]);

  return (
    <PageShell
      icon={
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4l3 3" />
        </svg>
      }
      title="Timeline"
      subtitle={data?.range?.label}
      toolbar={
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className="filter-chip focus-ring"
              data-active={range === r ? "true" : undefined}
              aria-pressed={range === r}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
      }
    >
      {loading && <div style={{ padding: 32, color: "var(--text-quaternary)" }}>Loading…</div>}
      {!loading && error && (
        <div style={{ padding: 32 }}>
          <p className="caption-large" style={{ color: "var(--status-blocked)" }}>Couldn't load timeline</p>
          <p className="small" style={{ color: "var(--text-tertiary)" }}>{error}</p>
        </div>
      )}
      {!loading && !error && grouped.length === 0 && (
        <p className="small" style={{ color: "var(--text-quaternary)", padding: 32 }}>No events in this range.</p>
      )}
      {!loading && !error && grouped.map((group) => (
        <section key={group.label}>
          <div
            className="mono-label"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 16px 8px",
              color: "var(--text-tertiary)",
              letterSpacing: "0.04em",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <span>{group.label.toUpperCase()}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-quaternary)" }}>{group.items.length}</span>
          </div>
          {group.items.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => item.path && sheet.open(item.path)}
              className="app-row focus-ring"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "0 16px",
                height: 40,
                border: "none",
                background: "transparent",
                textAlign: "left",
                borderBottom: "1px solid var(--border-subtle)",
                cursor: item.path ? "pointer" : "default",
              }}
              disabled={!item.path}
            >
              <span
                className="mono-label"
                style={{ width: 64, color: "var(--text-quaternary)", flexShrink: 0, letterSpacing: "0.04em" }}
              >
                {item.date}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--text-primary)",
                  fontSize: 13,
                }}
              >
                {item.label}
              </span>
            </button>
          ))}
        </section>
      ))}
    </PageShell>
  );
}

function parseLooseDate(s: string): Date | null {
  if (!s) return null;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const human = s.match(/(\d{1,2})\s+([A-Za-z]{3,})/);
  if (human) {
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const m = months[human[2].slice(0, 3).toLowerCase()];
    if (m !== undefined) {
      const d = new Date();
      d.setMonth(m);
      d.setDate(+human[1]);
      return d;
    }
  }
  const any = Date.parse(s);
  return isNaN(any) ? null : new Date(any);
}

function weekKey(d: Date): string {
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days < 7) return "This week";
  if (days < 14) return "Last week";
  if (days < 31) return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
```

- [ ] **Step 2: Write route page**

Create `src/app/browse/timeline/page.tsx`:

```tsx
import { TimelinePage } from "@/components/browse/TimelinePage";

export default function TimelineRoute() {
  return <TimelinePage />;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Browser check**

Open `http://localhost:3000/browse/timeline`. Verify: header "Timeline", range filter chips in toolbar, grouped sections by week/month.

- [ ] **Step 5: Commit**

```bash
git add src/components/browse/TimelinePage.tsx src/app/browse/timeline/
git commit -m "feat(v7): TimelinePage at /browse/timeline"
```

---

### Task 12: `SearchPage` + route

**Files:**
- Create: `src/components/browse/SearchPage.tsx`
- Create: `src/app/browse/search/page.tsx`

- [ ] **Step 1: Write SearchPage**

Create `src/components/browse/SearchPage.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { useSheet } from "@/lib/hooks/useSheet";
import type { SearchResultsData } from "@/lib/view-models";

async function fetchSearch(q: string): Promise<SearchResultsData | null> {
  if (!q) return null;
  const res = await fetch(`/api/query?intent=search_results&q=${encodeURIComponent(q)}`);
  if (!res.ok) return null;
  const payload = await res.json();
  return (payload?.response?.views?.[0]?.data as SearchResultsData) ?? null;
}

export function SearchPage() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const sheet = useSheet();
  const [data, setData] = useState<SearchResultsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const payload = await fetchSearch(q);
        if (!cancelled) setData(payload);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q]);

  const grouped = useMemo(() => {
    if (!data) return [] as { kind: string; label: string; items: SearchResultsData["results"] }[];
    const order = [
      { kind: "canonical_note", label: "Notes" },
      { kind: "entity", label: "Entities" },
      { kind: "topic", label: "Topics" },
      { kind: "derived_index", label: "Indexes" },
      { kind: "runtime_status", label: "Status" },
      { kind: "generated_summary", label: "Summaries" },
    ];
    const byKind: Record<string, SearchResultsData["results"]> = {};
    for (const r of data.results) {
      (byKind[r.kind || "other"] ??= []).push(r);
    }
    return order
      .filter(({ kind }) => byKind[kind]?.length)
      .map(({ kind, label }) => ({ kind, label, items: byKind[kind] }));
  }, [data]);

  return (
    <PageShell
      icon={
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      }
      title={q ? `Results for "${q}"` : "Search"}
      subtitle={data ? `${data.results.length} result${data.results.length === 1 ? "" : "s"}` : undefined}
    >
      {loading && <div style={{ padding: 32, color: "var(--text-quaternary)" }}>Searching…</div>}
      {!loading && !q && (
        <p className="small" style={{ color: "var(--text-quaternary)", padding: 32 }}>
          No query. Add <code>?q=…</code> to the URL or use ⌘K.
        </p>
      )}
      {!loading && q && data && grouped.length === 0 && (
        <p className="small" style={{ color: "var(--text-quaternary)", padding: 32 }}>
          No matches for “{q}”.
        </p>
      )}
      {!loading && grouped.map((g) => (
        <section key={g.kind}>
          <div
            className="mono-label"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 16px 8px",
              color: "var(--text-tertiary)",
              letterSpacing: "0.04em",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <span>{g.label.toUpperCase()}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-quaternary)" }}>{g.items.length}</span>
          </div>
          {g.items.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => item.path && sheet.open(item.path)}
              className="app-row focus-ring"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "0 16px",
                height: 40,
                border: "none",
                background: "transparent",
                textAlign: "left",
                borderBottom: "1px solid var(--border-subtle)",
                cursor: item.path ? "pointer" : "default",
              }}
              disabled={!item.path}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)", fontSize: 13 }}>
                {item.label}
              </span>
              <span
                className="mono-label"
                style={{ color: "var(--text-quaternary)", letterSpacing: "0.02em", flexShrink: 0, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {item.path}
              </span>
            </button>
          ))}
        </section>
      ))}
    </PageShell>
  );
}
```

- [ ] **Step 2: Write route page**

Create `src/app/browse/search/page.tsx`:

```tsx
import { SearchPage } from "@/components/browse/SearchPage";

export default function SearchRoute() {
  return <SearchPage />;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Browser check**

Open `http://localhost:3000/browse/search?q=system`. Verify: header "Results for 'system'", grouped result rows, clicking opens sheet.

- [ ] **Step 5: Commit**

```bash
git add src/components/browse/SearchPage.tsx src/app/browse/search/
git commit -m "feat(v7): SearchPage at /browse/search"
```

---

### Task 13: `EntityPage` + route

**Files:**
- Create: `src/components/browse/EntityPage.tsx`
- Create: `src/app/browse/entity/[name]/page.tsx`

- [ ] **Step 1: Write EntityPage**

Create `src/components/browse/EntityPage.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell, PageAction } from "@/components/PageShell";
import { LinkList, MarkdownRenderer } from "@/components/ui";
import { useSheet } from "@/lib/hooks/useSheet";
import { useVault } from "@/lib/hooks/useVault";
import type { EntityOverviewData, ViewModel } from "@/lib/view-models";

async function fetchEntity(name: string): Promise<{ view: ViewModel | null; data: EntityOverviewData | null }> {
  const res = await fetch(`/api/query?intent=entity_overview&name=${encodeURIComponent(name)}`);
  if (!res.ok) return { view: null, data: null };
  const payload = await res.json();
  const view = payload?.response?.views?.[0] ?? null;
  return { view, data: (view?.data as EntityOverviewData) ?? null };
}

export function EntityPage({ name }: { name: string }) {
  const sheet = useSheet();
  const vault = useVault();
  const [data, setData] = useState<EntityOverviewData | null>(null);
  const [view, setView] = useState<ViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { view, data } = await fetchEntity(name);
        if (!cancelled) {
          setView(view);
          setData(data);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load entity");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  const openObsidian = useCallback(() => {
    const path = view?.sourceFile || view?.sources?.[0]?.path;
    if (!path) return;
    const vaultName = vault.name || "Obsidian";
    window.open(`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path)}`, "_blank");
  }, [view, vault.name]);

  const title = view?.title || name;
  const subtitle = data?.summary ? data.summary.slice(0, 120) + (data.summary.length > 120 ? "…" : "") : data?.entityType;

  return (
    <PageShell
      icon={
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
        </svg>
      }
      title={title}
      subtitle={subtitle}
      actions={
        <PageAction label="Open in Obsidian" onClick={openObsidian}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </PageAction>
      }
    >
      <div style={{ padding: "24px 32px 80px", maxWidth: 880, margin: "0 auto" }}>
        {loading && <p className="small" style={{ color: "var(--text-quaternary)" }}>Loading…</p>}
        {!loading && error && (
          <p className="small" style={{ color: "var(--status-blocked)" }}>{error}</p>
        )}
        {!loading && !error && data && (
          <>
            {data.whyNow && (
              <div
                style={{
                  marginBottom: 24,
                  padding: "12px 16px",
                  borderRadius: 8,
                  background: "color-mix(in srgb, var(--accent-brand) 6%, transparent)",
                  borderLeft: "2px solid var(--accent-brand)",
                }}
              >
                <div className="small" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  <MarkdownRenderer content={data.whyNow} onNavigate={sheet.open} />
                </div>
              </div>
            )}

            <section style={{ marginBottom: 32 }}>
              <div className="mono-label" style={{ color: "var(--text-tertiary)", letterSpacing: "0.04em", marginBottom: 12 }}>
                SUMMARY
              </div>
              <div className="small" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
                <MarkdownRenderer content={data.summary} onNavigate={sheet.open} />
              </div>
            </section>

            {data.relatedEntities && data.relatedEntities.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <SubHeader label="Connected" count={data.relatedEntities.length} />
                <LinkList items={data.relatedEntities} onNavigate={sheet.open} />
              </section>
            )}
            {data.relatedNotes && data.relatedNotes.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <SubHeader label="Related notes" count={data.relatedNotes.length} />
                <LinkList items={data.relatedNotes} onNavigate={sheet.open} />
              </section>
            )}

            {data.timeline && data.timeline.length > 0 && (
              <section>
                <SubHeader label="Recent activity" count={data.timeline.length} />
                {data.timeline.map((item, i) => (
                  <div
                    key={i}
                    className="app-row"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "0 12px",
                      margin: "0 -12px",
                      height: 32,
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <span className="mono-label" style={{ width: 64, color: "var(--text-quaternary)", letterSpacing: "0.04em", flexShrink: 0 }}>
                      {item.date}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: 13 }}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

function SubHeader({ label, count }: { label: string; count: number }) {
  return (
    <div
      className="mono-label"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
        paddingBottom: 6,
        borderBottom: "1px solid var(--border-subtle)",
        color: "var(--text-tertiary)",
        letterSpacing: "0.04em",
      }}
    >
      <span>{label.toUpperCase()}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-quaternary)" }}>{count}</span>
    </div>
  );
}
```

- [ ] **Step 2: Write route page**

Create `src/app/browse/entity/[name]/page.tsx`:

```tsx
import { EntityPage } from "@/components/browse/EntityPage";

export default async function EntityRoute({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return <EntityPage name={decodeURIComponent(name)} />;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Browser check**

Open `http://localhost:3000/browse/entity/<some-entity>` where `<some-entity>` is any entity name from your vault. Verify: header with entity name, SUMMARY / RELATED / ACTIVITY sections.

- [ ] **Step 5: Commit**

```bash
git add src/components/browse/EntityPage.tsx src/app/browse/entity/
git commit -m "feat(v7): EntityPage at /browse/entity/[name]"
```

---

### Task 14: `TopicPage` + route

**Files:**
- Create: `src/components/browse/TopicPage.tsx`
- Create: `src/app/browse/topic/[name]/page.tsx`

- [ ] **Step 1: Write TopicPage**

Create `src/components/browse/TopicPage.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell, PageAction } from "@/components/PageShell";
import { LinkList, MarkdownRenderer } from "@/components/ui";
import { useSheet } from "@/lib/hooks/useSheet";
import { useVault } from "@/lib/hooks/useVault";
import type { TopicOverviewData, ViewModel } from "@/lib/view-models";

async function fetchTopic(name: string): Promise<{ view: ViewModel | null; data: TopicOverviewData | null }> {
  const res = await fetch(`/api/query?intent=topic_overview&name=${encodeURIComponent(name)}`);
  if (!res.ok) return { view: null, data: null };
  const payload = await res.json();
  const view = payload?.response?.views?.[0] ?? null;
  return { view, data: (view?.data as TopicOverviewData) ?? null };
}

export function TopicPage({ name }: { name: string }) {
  const sheet = useSheet();
  const vault = useVault();
  const [data, setData] = useState<TopicOverviewData | null>(null);
  const [view, setView] = useState<ViewModel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { view, data } = await fetchTopic(name);
        if (!cancelled) {
          setView(view);
          setData(data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [name]);

  const openObsidian = useCallback(() => {
    const path = view?.sourceFile || view?.sources?.[0]?.path;
    if (!path) return;
    const vaultName = vault.name || "Obsidian";
    window.open(`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path)}`, "_blank");
  }, [view, vault.name]);

  const title = view?.title || name;
  const subtitle = data?.summary ? data.summary.slice(0, 120) + (data.summary.length > 120 ? "…" : "") : data?.topicType;

  return (
    <PageShell
      icon={
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
      }
      title={title}
      subtitle={subtitle}
      actions={
        <PageAction label="Open in Obsidian" onClick={openObsidian}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </PageAction>
      }
    >
      <div style={{ padding: "24px 32px 80px", maxWidth: 880, margin: "0 auto" }}>
        {loading && <p className="small" style={{ color: "var(--text-quaternary)" }}>Loading…</p>}
        {!loading && data && (
          <>
            {data.currentState && (
              <section style={{ marginBottom: 32 }}>
                <SubHeader label="Current state" />
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 8,
                    background: "color-mix(in srgb, var(--status-done) 4%, transparent)",
                    borderLeft: "2px solid var(--status-done)",
                  }}
                >
                  <div className="small" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    <MarkdownRenderer content={data.currentState} onNavigate={sheet.open} />
                  </div>
                </div>
              </section>
            )}

            {data.keyQuestions && data.keyQuestions.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <SubHeader label="Open questions" count={data.keyQuestions.length} />
                {data.keyQuestions.map((q, i) => (
                  <div
                    key={i}
                    className="app-row"
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "10px 12px",
                      margin: "0 -12px",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--status-warning)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }}>
                      <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="small" style={{ color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                      {q}
                    </p>
                  </div>
                ))}
              </section>
            )}

            {data.nextSteps && data.nextSteps.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <SubHeader label="Next steps" count={data.nextSteps.length} />
                {data.nextSteps.map((s, i) => (
                  <div
                    key={i}
                    className="app-row"
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "10px 12px",
                      margin: "0 -12px",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <span
                      className="mono-label"
                      style={{
                        width: 18,
                        height: 18,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "50%",
                        background: "color-mix(in srgb, var(--status-done) 12%, transparent)",
                        color: "var(--status-done)",
                        fontWeight: 590,
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      {i + 1}
                    </span>
                    <p className="small" style={{ color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                      {s}
                    </p>
                  </div>
                ))}
              </section>
            )}

            {data.relatedNotes && data.relatedNotes.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <SubHeader label="Related notes" count={data.relatedNotes.length} />
                <LinkList items={data.relatedNotes} onNavigate={sheet.open} />
              </section>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

function SubHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div
      className="mono-label"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
        paddingBottom: 6,
        borderBottom: "1px solid var(--border-subtle)",
        color: "var(--text-tertiary)",
        letterSpacing: "0.04em",
      }}
    >
      <span>{label.toUpperCase()}</span>
      {count != null && (
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-quaternary)" }}>{count}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write route page**

Create `src/app/browse/topic/[name]/page.tsx`:

```tsx
import { TopicPage } from "@/components/browse/TopicPage";

export default async function TopicRoute({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return <TopicPage name={decodeURIComponent(name)} />;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Browser check**

Open `http://localhost:3000/browse/topic/<some-topic>`. Verify: header with topic name, CURRENT STATE / OPEN QUESTIONS / NEXT STEPS / RELATED NOTES sections render.

- [ ] **Step 5: Commit**

```bash
git add src/components/browse/TopicPage.tsx src/app/browse/topic/
git commit -m "feat(v7): TopicPage at /browse/topic/[name]"
```

---

## PHASE 4 — Chat empty + Open-page CTA (Tasks 15–17)

### Task 15: `ChatEmptyState`

**Files:**
- Create: `src/components/ChatEmptyState.tsx`

- [ ] **Step 1: Write ChatEmptyState**

```tsx
"use client";

import { useEffect, useRef } from "react";

interface Props {
  onSubmit: (query: string) => void;
}

/**
 * ChatEmptyState — Raycast-style pure input. Shown when /chat has no messages.
 * Nothing else renders on the page: no chips, no recent, no tasks.
 */
export function ChatEmptyState({ onSubmit }: Props) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const value = inputRef.current?.value ?? "";
      if (value.trim()) onSubmit(value.trim());
    }
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: "20dvh",
        gap: 20,
        background: "var(--bg-marketing)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "var(--accent-brand)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 24px color-mix(in srgb, var(--accent-brand) 25%, transparent), 0 0 0 1px rgba(255,255,255,0.06) inset",
        }}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--text-on-brand)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </div>

      <h1
        className="heading-3"
        style={{
          color: "var(--text-tertiary)",
          margin: 0,
          fontWeight: 500,
        }}
      >
        Ask about your vault
      </h1>

      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 520,
          padding: "0 16px",
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          onKeyDown={handleKey}
          placeholder="Type a question…"
          className="focus-ring"
          style={{
            width: "100%",
            height: 44,
            padding: "12px 64px 12px 14px",
            borderRadius: 8,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-standard)",
            color: "var(--text-primary)",
            fontSize: 14,
            lineHeight: 1.4,
            resize: "none",
            outline: "none",
            fontFamily: "inherit",
            transition: "border-color var(--motion-hover) var(--ease-default)",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-brand)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-standard)")}
        />
        <span
          className="mono-label"
          style={{
            position: "absolute",
            right: 26,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-quaternary)",
            letterSpacing: "0.02em",
            pointerEvents: "none",
          }}
        >
          ⌘↵
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ChatEmptyState.tsx
git commit -m "feat(v7): ChatEmptyState component"
```

---

### Task 16: `ViewRenderer` chat-summary variant + Open-page CTA

**Files:**
- Modify: `src/components/views/ViewRenderer.tsx`

- [ ] **Step 1: Add the summary variant**

In `src/components/views/ViewRenderer.tsx`:

1. Update the `ViewRendererProps` interface to include a `variant` prop:

```ts
interface ViewRendererProps {
  view: ViewModel;
  index?: number;
  onNavigate?: (path: string) => void;
  onToggle?: (itemId: string, checked: boolean) => void;
  onAsk?: (query: string) => void;
  /** How to render this view. "chat-summary" = short summary + Open page CTA. "card" = legacy full card. */
  variant?: "chat-summary" | "card";
}
```

2. Update the function signature:

```ts
export function ViewRenderer({ view, index = 0, onNavigate, onToggle, onAsk, variant = "card" }: ViewRendererProps) {
```

3. At the top of the render (right after the `Component` unknown-view check), add the chat-summary branch. Insert this BEFORE the existing `<motion.div variants={cardEntrance}...` return block:

```tsx
// ── Chat-summary variant — a short prose summary + Open page CTA. ─────
// Used inside ChatSurface for intent types that have a dedicated page.
if (variant === "chat-summary") {
  const pageHref = routeForIntent(view.type, view.title ?? "");
  const summaryText = view.subtitle || view.title || "Here's what I found.";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 600 }}>
      <p className="small" style={{ color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
        {summaryText}
      </p>
      {pageHref && (
        <a
          href={pageHref}
          className="focus-ring"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 6,
            background: "var(--bg-surface-alpha-2)",
            border: "1px solid var(--border-standard)",
            color: "var(--text-primary)",
            fontSize: 13,
            fontWeight: 510,
            textDecoration: "none",
            alignSelf: "flex-start",
            transition: "background var(--motion-hover) var(--ease-default), border-color var(--motion-hover) var(--ease-default)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-surface-alpha-4)";
            e.currentTarget.style.borderColor = "var(--border-solid-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-surface-alpha-2)";
            e.currentTarget.style.borderColor = "var(--border-standard)";
          }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7M7 7h10v10" />
          </svg>
          Open {openPageLabel(view.type, view.title)}
        </a>
      )}
    </div>
  );
}
```

4. Add these helper functions at the bottom of the file (after the `ViewRenderer` function):

```ts
function routeForIntent(intent: ViewType, title: string): string | null {
  switch (intent) {
    case "system_status":
      return "/browse/system";
    case "timeline_synthesis":
      return "/browse/timeline";
    case "search_results":
      return `/browse/search?q=${encodeURIComponent(title)}`;
    case "entity_overview":
      return `/browse/entity/${encodeURIComponent(slugify(title))}`;
    case "topic_overview":
      return `/browse/topic/${encodeURIComponent(slugify(title))}`;
    default:
      return null;
  }
}

function openPageLabel(intent: ViewType, title?: string): string {
  switch (intent) {
    case "system_status": return "system page";
    case "timeline_synthesis": return "timeline";
    case "search_results": return "results";
    case "entity_overview": return title || "entity";
    case "topic_overview": return title || "topic";
    default: return "page";
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/views/ViewRenderer.tsx
git commit -m "feat(v7): ViewRenderer chat-summary variant + Open-page CTA"
```

---

### Task 17: Wire `ChatInterface` empty state, drop chat-only chrome, pass summary variant

**Files:**
- Modify: `src/components/ChatInterface.tsx`

- [ ] **Step 1: Remove Sidebar / CommandPalette / VaultDrawer / DetailPage / HintChip mounting from ChatInterface**

Since AppShell now owns these, remove their mounts + state from ChatInterface. Approximate steps within the file:

1. Delete the import lines for `Sidebar`, `CommandPalette`, `VaultDrawer`, `HintChip`, `DetailPage`.
2. Delete all `useState` / `useCallback` for `vaultDrawerOpen`, `setVaultDrawerOpen`, `paletteOpen`, `setPaletteOpen`, `navStackRef`, `openDetail`, `closeDetail`, `navigateDetail`, `handleToggleTheme`, `paletteActions` memo.
3. In the JSX render, delete the top-level flex-row container that wraps `<Sidebar>` + main content (we no longer render the sidebar here); keep only the inner column with top bar + messages + input.
4. Delete the rendered `<Sidebar>`, `<VaultDrawer>`, `<CommandPalette>`, `<HintChip>`, and the `<LayoutGroup>`/`<AnimatePresence>` wrapping `<DetailPage>`.
5. Remove the `view` prop entirely (and the branches that render TriageInbox / GraphView).
6. Remove the `view="triage"` and `view="graph"` conditional blocks inside the welcome `<AnimatePresence>`.
7. Remove the `QUICK_REPLIES` const and all references to it.
8. Remove the import of `TriageInbox` and `GraphView`.

- [ ] **Step 2: Add ChatEmptyState + use it when no messages**

At the top of `src/components/ChatInterface.tsx` add the import:

```ts
import { ChatEmptyState } from "@/components/ChatEmptyState";
```

Replace the entire welcome `<AnimatePresence>` block with:

```tsx
{showWelcome && messages.length === 0 && vault.connected && (
  <ChatEmptyState onSubmit={(q) => handleSubmit(q)} />
)}
{showWelcome && messages.length === 0 && !vault.connected && (
  /* keep the existing connect-vault wizard UI here — unchanged */
  <ConnectVaultWizard />
)}
```

Extract the existing "no vault" connect-vault wizard into its own small component within this file (or keep inline — just ensure it only renders when `!vault.connected`). It was previously inside the welcome block under `!vault.loading && !vault.connected`.

- [ ] **Step 3: Pass variant="chat-summary" to ViewRenderer in chat messages**

Find the `<ViewRenderer>` usage inside the messages map. Update to pass `variant="chat-summary"`:

```tsx
<ViewRenderer
  view={view}
  index={viewIndex}
  onNavigate={(path) => router.push(`/file/${path}`)}
  onToggle={handleToggle}
  onAsk={handleSubmit}
  variant="chat-summary"
/>
```

Replace `openDetail` calls with `router.push` navigation since ChatInterface no longer owns the detail sheet. Import `useRouter` from `next/navigation` at the top if not already.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Browser check**

Open `http://localhost:3000/chat` (no messages). Verify:
- Only ONE sidebar (from AppShell) on the left.
- Center: Cipher mark, "Ask about your vault", centered input.
- Top bar: empty (no floating FAB, no Cipher mark).
- Type a question + Enter: message appears, AI responds with summary + "Open page" button.
- Click the Open-page button: navigates to the matching route.

- [ ] **Step 6: Commit**

```bash
git add src/components/ChatInterface.tsx
git commit -m "feat(v7): ChatInterface uses empty state, drops sidebar+overlays (moved to AppShell)"
```

---

## PHASE 5 — Sidebar header + top bar (Tasks 18–19)

### Task 18: Sidebar 48px header row with ⌘K + Browse

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Rework Sidebar header**

In `src/components/Sidebar.tsx`, find the existing top section that renders Cipher + wordmark. Replace it with a 48px flex row that has Cipher on the left and two 28×28 icon buttons on the right.

Locate the current top block (the div containing the Cipher-mark button at the top of the sidebar). Replace it with:

```tsx
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
```

Also add a small helper component at the bottom of the Sidebar file (above or below the `export function Sidebar`):

```tsx
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
```

- [ ] **Step 2: Remove the now-redundant "Chat" and "Browse vault" entries from the primary nav**

Since Browse is in the header and Chat is reached via the "Chat" nav entry, keep those as primary nav for navigation purposes (router.push) but remove the sidebar's own "Browse vault" primary nav item (it opens VaultDrawer — the header button now does this).

Scan the `navItems` array in Sidebar and remove the item with `id: "browse"` (the one that calls `onBrowse`).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Browser check**

Open `http://localhost:3000/browse`. Verify: sidebar top is now a 48px row with Cipher left, two icon buttons (⌘K kbd pill, 4-square grid) right. Clicking ⌘K opens palette. Clicking grid opens vault drawer.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(v7): Sidebar header row with Cipher + ⌘K + Browse buttons"
```

---

### Task 19: Top bar cleanup + mobile fallback

**Files:**
- Modify: `src/components/ChatInterface.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Strip the chat top bar**

Open `src/components/ChatInterface.tsx`. Find the existing "Slim top bar" block (the `<div>` with `height: 48` containing the mobile hamburger + ⌘K + Browse buttons on the right). Replace the entire block with a thin empty-but-bordered top bar that only renders the mobile hamburger (AppShell is sidebar-desktop, top-bar-mobile):

```tsx
{/* ── Top bar — empty on desktop, hamburger on mobile ─── */}
<div
  style={{
    flexShrink: 0,
    height: 48,
    borderBottom: "1px solid var(--border-subtle)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    position: "sticky",
    top: 0,
    zIndex: 20,
    background: "color-mix(in srgb, var(--bg-marketing) 85%, transparent)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
  }}
>
  <div />
  <div />
</div>
```

This is intentionally minimal — no action buttons on desktop (they're in the sidebar header now). Mobile fallback (hamburger + ⌘K + Browse on narrow widths) surfaces via CSS in step 2.

- [ ] **Step 2: Add mobile fallback CSS**

At the end of `src/app/globals.css`, add:

```css
/* v7 — Mobile fallback: when sidebar is hidden, surface ⌘K + Browse in the
   page top bar. We emit the same buttons under a .mobile-topbar-actions
   class that each page's top bar can opt into. For now the ChatInterface
   top bar has this class built in; other pages get a similar empty top bar
   (their PageShell header already takes that space). */

@media (max-width: 1023px) {
  .mobile-topbar-actions {
    display: inline-flex !important;
  }
}
.mobile-topbar-actions {
  display: none;
}
```

Note: a full mobile hamburger / sheet sidebar is out of scope for v7 — we rely on the palette (⌘K) as the navigation escape hatch at narrow widths. This keeps the spec's stated mobile fallback honest without a new off-canvas component.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Browser check**

Open `http://localhost:3000/chat`. Verify: top bar is a thin border-only strip (no buttons on desktop). Palette opens via ⌘K (keyboard shortcut, which AppShell still handles).

- [ ] **Step 5: Commit**

```bash
git add src/components/ChatInterface.tsx src/app/globals.css
git commit -m "feat(v7): strip chat top bar, add mobile fallback CSS hook"
```

---

## PHASE 6 — Graph Constellation (Tasks 20–22)

### Task 20: `GraphPage` + wire `/browse/graph`

**Files:**
- Create: `src/components/browse/GraphPage.tsx`
- Modify: `src/app/browse/graph/page.tsx`

- [ ] **Step 1: Write GraphPage**

Create `src/components/browse/GraphPage.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { GraphCanvas } from "@/components/browse/GraphCanvas";
import { GraphFilters } from "@/components/browse/GraphFilters";
import { useSheet } from "@/lib/hooks/useSheet";
import type { Graph } from "@/lib/vault-graph";

export function GraphPage() {
  const sheet = useSheet();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleFolders, setVisibleFolders] = useState<Set<string>>(new Set());
  const [orphansOnly, setOrphansOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/vault/graph");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Graph fetch failed (${res.status})`);
        }
        const payload: Graph = await res.json();
        if (!cancelled) setGraph(payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load graph");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleFolder = useCallback((folder: string) => {
    setVisibleFolders((prev) => {
      const next = new Set(prev);
      if (next.size === 0) {
        const all = new Set(graph?.folders ?? []);
        all.delete(folder);
        return all;
      }
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }, [graph]);
  const allFolders = useCallback(() => setVisibleFolders(new Set()), []);

  return (
    <PageShell
      icon={
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="7" r="2" />
          <circle cx="18" cy="7" r="2" />
          <circle cx="12" cy="17" r="2" />
          <path d="M8 8l3 7M16 8l-3 7" />
        </svg>
      }
      title="Graph"
      subtitle={graph ? `${graph.nodes.length} notes · ${graph.edges.length} links` : undefined}
    >
      <div style={{ display: "flex", flex: 1, height: "100%", minHeight: 0 }}>
        {!loading && !error && graph && (
          <>
            <GraphFilters
              graph={graph}
              visibleFolders={visibleFolders}
              onToggleFolder={toggleFolder}
              onAllFolders={allFolders}
              orphansOnly={orphansOnly}
              onToggleOrphans={() => setOrphansOnly((v) => !v)}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
            />
            <GraphCanvas
              graph={graph}
              onOpen={sheet.open}
              visibleFolders={visibleFolders}
              orphansOnly={orphansOnly}
              searchTerm={searchTerm}
            />
          </>
        )}
        {loading && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-quaternary)" }}>Building graph…</div>}
        {error && <div style={{ flex: 1, padding: 32, color: "var(--status-blocked)" }}>{error}</div>}
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 2: Wire `/browse/graph/page.tsx`**

Replace contents of `src/app/browse/graph/page.tsx`:

```tsx
import { GraphPage } from "@/components/browse/GraphPage";

export default function GraphRoute() {
  return <GraphPage />;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Browser check**

Open `http://localhost:3000/browse/graph`. Verify: PageShell header "Graph", filter panel on left, canvas on right. Click a node → sheet opens.

- [ ] **Step 5: Commit**

```bash
git add src/components/browse/GraphPage.tsx src/app/browse/graph/
git commit -m "feat(v7): GraphPage at /browse/graph (extracted from ChatInterface)"
```

---

### Task 21: Graph Constellation palette

**Files:**
- Modify: `src/components/browse/GraphCanvas.tsx`

- [ ] **Step 1: Replace `draw()` palette with Constellation colors and node-class selection**

Open `src/components/browse/GraphCanvas.tsx`. Find the `draw` callback. Replace its color-setup and rendering logic with a Constellation palette, keyed off theme.

At the top of `draw()`, replace the current CSS-var lookups with:

```ts
const style = getComputedStyle(document.documentElement);
const isLight = document.documentElement.classList.contains("light");

const bgStart = isLight ? "#fafaf5" : "#0b0e18";
const bgEnd   = isLight ? "#f0f0ea" : "#05060a";
const colStar        = isLight ? "rgba(74,81,102,0.85)"  : "rgba(168,178,209,0.85)";
const colStarBright  = isLight ? "#23252a"              : "#ffffff";
const colStarHub     = isLight ? (style.getPropertyValue("--accent-brand").trim() || "#5e6ad2") : "#ffffff";
const colRay         = isLight ? "rgba(94,106,210,0.20)" : "rgba(180,200,255,0.18)";
const colRayHover    = isLight ? "rgba(94,106,210,0.70)" : "rgba(200,220,255,0.70)";
const colAccent      = style.getPropertyValue("--accent-brand").trim() || "#5e6ad2";
const colLabel       = style.getPropertyValue("--text-primary").trim() || "#f7f8f8";
const colTooltipBg   = style.getPropertyValue("--bg-tooltip").trim() || "#0d0e0f";
```

Then replace the background fill with a radial gradient:

```ts
// Paint the cosmic backdrop.
const grd = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
grd.addColorStop(0, bgStart);
grd.addColorStop(1, bgEnd);
ctx.fillStyle = grd;
ctx.fillRect(0, 0, w, h);

// Optional nebula wash — two soft radials.
const nebulaA = ctx.createRadialGradient(w * 0.35, h * 0.6, 0, w * 0.35, h * 0.6, w * 0.4);
nebulaA.addColorStop(0, isLight ? "rgba(94,106,210,0.12)" : "rgba(120,100,200,0.15)");
nebulaA.addColorStop(1, "transparent");
ctx.fillStyle = nebulaA;
ctx.fillRect(0, 0, w, h);
const nebulaB = ctx.createRadialGradient(w * 0.65, h * 0.4, 0, w * 0.65, h * 0.4, w * 0.4);
nebulaB.addColorStop(0, isLight ? "rgba(120,160,220,0.10)" : "rgba(90,130,220,0.12)");
nebulaB.addColorStop(1, "transparent");
ctx.fillStyle = nebulaB;
ctx.fillRect(0, 0, w, h);
```

For node rendering, switch to hub-aware classes. In the node-drawing loop (currently `for (const n of nodes) { ctx.beginPath(); ... }`), replace the fill logic with:

```ts
for (const n of nodes) {
  const active = activeIds.size === 0 || activeIds.has(n.id);
  const hovered = n.id === hoveredId;
  const selected = n.id === selectedId;
  const isHub = n.backlinks >= 8;
  const isBright = !isHub && n.backlinks >= 3;

  ctx.beginPath();
  ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);

  if (hovered || selected) {
    ctx.fillStyle = colAccent;
    ctx.shadowColor = colAccent;
    ctx.shadowBlur = 12;
  } else if (isHub) {
    ctx.fillStyle = colStarHub;
    ctx.shadowColor = isLight ? "rgba(94,106,210,0.5)" : "rgba(200,220,255,0.9)";
    ctx.shadowBlur = 8;
  } else if (isBright) {
    ctx.fillStyle = colStarBright;
    ctx.shadowColor = isLight ? "rgba(94,106,210,0.35)" : "rgba(200,220,255,0.9)";
    ctx.shadowBlur = 4;
  } else {
    ctx.fillStyle = colStar;
    ctx.shadowBlur = 0;
  }

  ctx.globalAlpha = active ? 1 : 0.15;
  ctx.fill();
  ctx.shadowBlur = 0;

  if (selected) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius + 4 / scale, 0, Math.PI * 2);
    ctx.strokeStyle = colAccent;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 2 / scale;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
```

For edge rendering, use the new `colRay` / `colRayHover`:

```ts
ctx.lineWidth = 0.4 / scale;
for (const e of edges) {
  const a = byId.get(e.source);
  const b = byId.get(e.target);
  if (!a || !b) continue;
  const isConnected = hoveredId && (a.id === hoveredId || b.id === hoveredId);
  const aActive = activeIds.size === 0 || activeIds.has(a.id);
  const bActive = activeIds.size === 0 || activeIds.has(b.id);
  const alpha = isConnected ? 1 : (aActive && bActive ? 1 : 0.12);
  ctx.strokeStyle = isConnected ? colRayHover : colRay;
  ctx.lineWidth = isConnected ? 0.6 / scale : 0.4 / scale;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
ctx.globalAlpha = 1;
```

For the hover tooltip, use the new token:

```ts
ctx.fillStyle = colTooltipBg;
// ... rest of label drawing unchanged
```

Update node size in the initial simNode mapping:
```ts
radius: Math.max(1.5, Math.min(6, 1.5 + Math.sqrt(n.backlinks) * 0.8)),
```

- [ ] **Step 2: Tune physics**

In the `step()` function, update the constants:

```ts
const REPULSION = 900;   // was 1200
const TARGET = 70;       // was 50
const DAMPING = 0.88;    // was 0.85
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Browser check**

Open `http://localhost:3000/browse/graph`. Verify: background is a dark cosmic gradient (dark mode) or cream gradient (light mode), nebula wash visible, hub nodes glow softly, edges are whisper-thin rays.

- [ ] **Step 5: Commit**

```bash
git add src/components/browse/GraphCanvas.tsx
git commit -m "feat(v7): Graph Constellation palette + physics tweaks"
```

---

### Task 22: Graph motion — inhale + idle pulse + focus mode

**Files:**
- Modify: `src/components/browse/GraphCanvas.tsx`

- [ ] **Step 1: Add inhale state + idle pulse ref + focus mode state**

At the top of `GraphCanvas`, near other refs, add:

```ts
const [focusId, setFocusId] = useState<string | null>(null);
const inhaleRef = useRef(0); // 0 → 1 over 300ms on mount
const pulseRef = useRef<{ id: string; startedAt: number } | null>(null);
const mountTimeRef = useRef<number>(0);
```

In the existing `useEffect` that builds simNodes (on graph change), set `mountTimeRef.current = performance.now()` and reset `inhaleRef.current = 0`.

- [ ] **Step 2: Drive inhale + idle pulse from the animation loop**

Inside the existing `tick` function of the animation loop, before `draw()`, compute:

```ts
const now = performance.now();
const inhaleElapsed = now - mountTimeRef.current;
inhaleRef.current = Math.min(1, inhaleElapsed / 300);

// Idle pulse — start a new one every ~4s if none active.
if (!pulseRef.current && inhaleRef.current >= 1) {
  if (Math.random() < 0.012) {
    // Pick a random bright or hub node.
    const candidates = simNodesRef.current.filter((n) => n.backlinks >= 3);
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      pulseRef.current = { id: pick.id, startedAt: now };
    }
  }
} else if (pulseRef.current) {
  const age = now - pulseRef.current.startedAt;
  if (age > 600) pulseRef.current = null;
}
```

- [ ] **Step 3: Apply inhale + pulse in `draw()`**

Inside the node drawing loop (from Task 21), multiply the per-node `globalAlpha` and radius by inhale/pulse factors:

```ts
// Inhale: scale nodes from 0.5 → 1, opacity 0 → 1 over 300ms.
const inhaleScale = 0.5 + 0.5 * inhaleRef.current;
const inhaleAlpha = inhaleRef.current;

// Idle pulse — if this node is pulsing, multiplier to opacity.
let pulseMul = 1;
if (pulseRef.current && pulseRef.current.id === n.id) {
  const age = (performance.now() - pulseRef.current.startedAt) / 600;
  pulseMul = 0.8 + 0.2 * Math.sin(age * Math.PI);
}

// Focus: faded nodes (those not in focus subgraph) go to 0.1 alpha.
let focusAlpha = 1;
if (focusId) {
  const neighborSet = getOneHopNeighbors(focusId, edges);
  if (n.id !== focusId && !neighborSet.has(n.id)) focusAlpha = 0.1;
}

ctx.globalAlpha = (active ? 1 : 0.15) * inhaleAlpha * pulseMul * focusAlpha;
ctx.arc(n.x, n.y, n.radius * inhaleScale, 0, Math.PI * 2);
// ... fill logic stays as-is
```

For edges, similarly dim outside the focus subgraph:

```ts
let edgeFocusMul = 1;
if (focusId) {
  const inFocus = (a.id === focusId || b.id === focusId);
  if (!inFocus) edgeFocusMul = 0.15;
}
ctx.globalAlpha = alpha * inhaleAlpha * edgeFocusMul;
```

Add the helper near other utilities in the file:

```ts
function getOneHopNeighbors(nodeId: string, edges: GraphEdge[]): Set<string> {
  const set = new Set<string>();
  for (const e of edges) {
    if (e.source === nodeId) set.add(e.target);
    else if (e.target === nodeId) set.add(e.source);
  }
  return set;
}
```

- [ ] **Step 4: Wire double-click to focus mode and Escape to exit**

In `handlePointerUp`, detect double-click (check if the time between last two clicks is < 350ms). Simpler: add an `onDoubleClick` on the canvas container. Edit the `<canvas>` element's handlers — add:

```tsx
onDoubleClick={(e) => {
  const { x, y } = getRel(e);
  const hit = pickNode(x, y);
  if (hit) setFocusId(hit.id);
}}
```

In the keyboard handler (existing useEffect for ⬆⬇⬅➡ etc), add an Escape branch before the reset behavior:

```ts
else if (e.key === "Escape") {
  if (focusId) { setFocusId(null); e.preventDefault(); return; }
  viewRef.current = { tx: 0, ty: 0, scale: 1 };
  setSelectedId(null);
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Browser check**

Open `http://localhost:3000/browse/graph`. Verify:
- On page load, nodes "inhale" in over ~300ms (scale + fade).
- Every few seconds, a random bright/hub star pulses briefly.
- Double-click a node → other nodes fade to 10% alpha; 1-hop neighbors stay visible.
- Press Escape → focus mode exits, all nodes back to full.

- [ ] **Step 7: Commit**

```bash
git add src/components/browse/GraphCanvas.tsx
git commit -m "feat(v7): Graph inhale mount + idle pulse + focus mode"
```

---

## PHASE 7 — Cleanup (Tasks 23–24)

### Task 23: Delete deprecated files

**Files:**
- Delete: `src/lib/triage-builder.ts`
- Delete: `src/app/api/triage/route.ts`
- Delete: `src/components/browse/TriageInbox.tsx`
- Delete: `src/components/browse/TriageRow.tsx`
- Delete: `src/components/browse/TriageFilterBar.tsx`
- Delete: `src/components/browse/GraphView.tsx`

- [ ] **Step 1: Remove the old files**

```bash
rm src/lib/triage-builder.ts
rm src/app/api/triage/route.ts
rm src/components/browse/TriageInbox.tsx
rm src/components/browse/TriageRow.tsx
rm src/components/browse/TriageFilterBar.tsx
rm src/components/browse/GraphView.tsx
```

- [ ] **Step 2: Grep for stragglers**

Run: `grep -rn "TriageInbox\|triage-builder\|TriageRow\|TriageFilterBar\|GraphView\|/api/triage\|QUICK_REPLIES" src/`
Expected: no remaining references. If any show up, remove them (likely stale imports in ChatInterface).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(v7): delete deprecated triage + GraphView scaffolding"
```

---

### Task 24: Final verification

**Files:** none

- [ ] **Step 1: Clean build**

Run: `pnpm build`
Expected: build completes without error. Type errors fail the build; fix and repeat.

- [ ] **Step 2: Grep sweep for known-bad patterns**

Run these checks and expect zero matches:

```bash
# No uses of the old triage endpoint.
grep -rn "/api/triage" src/

# No inline hex greps in new components for colors that should be vars.
grep -rnE '#[0-9a-fA-F]{6}' src/components/browse/ | grep -v 'fill="#fff"\|stroke="#fff"' | grep -v "// " | head

# No mention of the removed ChatInterface `view` prop anywhere.
grep -rn 'view="triage"\|view="graph"\|view="chat"' src/

# ViewRenderer only used with explicit variant.
grep -rn "<ViewRenderer " src/
```

- [ ] **Step 3: Manual walkthrough**

Open a browser on dark mode, then light mode. For each of the following routes, confirm the stated behavior:

| Route | Verify |
|---|---|
| `/` | Redirects to `/browse` |
| `/browse` | TodayPage header + TODAY + UP NEXT sections; checkbox works with undo toast |
| `/browse/system` | PageShell "System status" header, check rows |
| `/browse/timeline` | PageShell "Timeline" with range filter + weekly groups |
| `/browse/search?q=system` | PageShell "Results for …" + grouped result rows |
| `/browse/entity/<name>` | PageShell with entity name + SUMMARY / RELATED / ACTIVITY |
| `/browse/topic/<name>` | PageShell with topic name + sectioned body |
| `/browse/graph` | Constellation canvas + filter panel; inhale mount; idle pulse; double-click focus; Esc exits |
| `/chat` | Empty-state centered input + Cipher mark; `⌘↵` hint visible |
| `/chat?q=what+matters+now` | Auto-fires query on load |
| `/file/wiki/foo.md` | Full-route file view with breadcrumb + markdown body |
| `?sheet=<path>` on any route | Sheet overlay mounts |

Sidebar:
- 48px header row with Cipher + ⌘K + Browse.
- Nav rows below (Dashboard / Chat / Graph / Entities / Projects / System / Timeline / Browse vault).
- Active nav row matches current URL.
- Recent queries list in middle.
- Settings (Commands + Theme) at the bottom.

Light mode toggle: the palette's "Toggle theme" action flips both dark and light correctly, including the Constellation graph.

- [ ] **Step 4: Commit the plan completion marker (optional)**

```bash
# No code change to commit here; tag the branch for clarity.
git tag v7-complete
```

---

## Self-review summary

Plan cross-checked against the spec (`2026-04-17-cipher-v7-pages-home-graph-chat-design.md`):

**Route architecture:** covered by Tasks 2 (AppShell), 4 (FileFullPage), 9 (/browse), 10–14 (bespoke pages), 20 (/browse/graph), 17 (/chat). Sheet overlay via `?sheet=` covered by Task 1 (`useSheet`) + Task 2 (AppShell mounts DetailPage).

**PageShell:** Task 3.

**TodayPage + bucket criteria + check-off:** Tasks 5–9.

**ChatEmptyState + ViewRenderer chat-summary + Open-page CTA:** Tasks 15–17.

**Sidebar header + top bar empty + mobile fallback:** Tasks 18–19.

**Graph Constellation palette + motion + focus + light mode:** Tasks 20–22.

**Deprecation + cleanup:** Task 23; grep sweep and build verification in Task 24.

**Sequencing matches spec's 8-step landing order:** Task 2 (AppShell) → Task 3 (PageShell) → Tasks 5–9 (Today) → Tasks 10–14 (Pages) → Tasks 15–17 (Chat) → Tasks 18–19 (Sidebar) → Tasks 20–22 (Graph) → Tasks 23–24 (Cleanup).

**Known gap:** Full mobile hamburger/off-canvas sidebar is out of v7 scope; plan documents the CSS hook and relies on ⌘K palette as the narrow-width escape hatch. Called out in Task 19.

**Known small deviations from the spec:**
- Task 9 (TodayPage) uses an `alert()` for the "couldn't save — reverted" path. A richer toast component is a follow-up; the plan documents this inline.
- Task 11 (TimelinePage) implements a local range picker and week-bucket logic derived from the existing TimelineSynthesisData rather than a new endpoint; same data pipeline as chat.
