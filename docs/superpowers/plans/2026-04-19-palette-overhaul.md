# ⌘K palette overhaul — universal quick-switcher

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ⌘K the single fast entry point for the whole vault — recent files + pins + commands on empty state, merged-ranked files + pins + entities + projects + commands when typing, `>` / `@` / `#` prefixes to scope, `Enter` routes by result type.

**Architecture:** A new `/api/vault/index` endpoint feeds a memoised `useVaultIndex` hook. A tiny `useRecentFiles` hook tracks opens in localStorage. The existing `CommandPalette.tsx` shell (portal + backdrop + panel + AnimatePresence) stays; only its body is rewritten to call those hooks, fold in pins/commands, and render the typed-state flat list with prefix handling.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, framer-motion. No test framework — verification is `npx tsc --noEmit` + `curl` + browser walk.

**Branch:** `v16-palette-overhaul` from master. One commit per task.

---

## File structure

**New files:**

| File | Responsibility |
|---|---|
| `src/app/api/vault/index/route.ts` | `GET /api/vault/index` — returns `VaultIndex` (files + entities + projects + hubs). 60s per-vault cache. |
| `src/lib/hooks/useVaultIndex.ts` | Client hook — fetches the endpoint once per mount, returns `{ index, loading }`. |
| `src/lib/hooks/useRecentFiles.ts` | Client hook — wraps `localStorage["cipher-recent-files"]`, capacity 20. Exposes `push / remove / clear` + a frequency map. |
| `src/lib/fuzzy.ts` | Extracted `fuzzyScore` (used by both the old + new palette logic). |

**Modified:**

| File | Change |
|---|---|
| `src/components/CommandPalette.tsx` | Body rewritten — empty state groups, typed flat list, prefix detection, per-kind Enter routing. Shell (portal + backdrop + dialog) unchanged. |
| `src/components/DetailPage.tsx` | One `useEffect` — calls `recentFiles.push(path)` on mount per path. |

No other file changes. No new dependencies.

---

## Task 0: Branch setup

- [ ] **Step 0.1: Verify clean tree + latest master**

```bash
git status
git log --oneline master -1
```

Expected: working tree clean, on master, latest commit is whatever the most recent thing is.

- [ ] **Step 0.2: Create feature branch**

```bash
git checkout -b v16-palette-overhaul
git branch --show-current
```

Expected: `v16-palette-overhaul`.

---

## Phase A — Data layer

### Task 1: `GET /api/vault/index` endpoint

**Files:**
- Create: `src/app/api/vault/index/route.ts`

- [ ] **Step 1.1: Write the endpoint**

```ts
/**
 * GET /api/vault/index — flat vault index for the ⌘K palette.
 *
 * Returns every .md file's basename + folder, plus the probed entity
 * and project indexes and hub files. Cached per-vault for 60s so repeat
 * palette opens are instant.
 */
import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { join, extname } from "path";
import {
  getVaultPath,
  getEntityIndex,
  getProjectIndex,
  getHubFiles,
} from "@/lib/vault-reader";

export interface VaultIndex {
  files: { path: string; name: string; folder: string }[];
  entities: { path: string; name: string }[];
  projects: { path: string; name: string }[];
  hubs: { path: string; name: string }[];
}

const _cache = new Map<string, { builtAt: number; index: VaultIndex }>();
const TTL_MS = 60 * 1000;

async function walkMd(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(absDir: string, rel: string, depth: number) {
    if (depth > 8) return;
    let entries: import("fs").Dirent[];
    try { entries = await readdir(absDir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git" || e.name === ".obsidian") continue;
        await walk(join(absDir, e.name), rel ? `${rel}/${e.name}` : e.name, depth + 1);
      } else if (e.isFile() && extname(e.name).toLowerCase() === ".md") {
        out.push(rel ? `${rel}/${e.name}` : e.name);
      }
    }
  }
  await walk(root, "", 0);
  return out;
}

export async function GET() {
  const root = getVaultPath();
  if (!root) {
    return NextResponse.json({ files: [], entities: [], projects: [], hubs: [] } satisfies VaultIndex);
  }
  const cached = _cache.get(root);
  if (cached && Date.now() - cached.builtAt < TTL_MS) {
    return NextResponse.json(cached.index);
  }
  const [paths, entities, projects, hubs] = await Promise.all([
    walkMd(root),
    getEntityIndex(),
    getProjectIndex(),
    getHubFiles(),
  ]);
  const files = paths.map((p) => ({
    path: p,
    name: (p.split("/").pop() ?? p).replace(/\.md$/i, ""),
    folder: p.includes("/") ? p.split("/").slice(0, -1).join("/") : "",
  }));
  const index: VaultIndex = {
    files,
    entities: entities.map((e) => ({ path: e.path, name: e.name })),
    projects: projects.map((p) => ({ path: p.path, name: p.name })),
    hubs: hubs.filter((h) => !!h.file).map((h) => ({ path: h.path, name: h.name })),
  };
  _cache.set(root, { builtAt: Date.now(), index });
  return NextResponse.json(index);
}
```

- [ ] **Step 1.2: Verify TS**

```bash
npx tsc --noEmit
```

Expected: clean (no output).

- [ ] **Step 1.3: Smoke-test the endpoint**

```bash
curl -s http://localhost:3000/api/vault/index | python3 -c "import sys,json; d=json.load(sys.stdin); print('files:', len(d['files'])); print('entities:', len(d['entities'])); print('projects:', len(d['projects'])); print('hubs:', len(d['hubs'])); print('sample file:', d['files'][0] if d['files'] else None)"
```

Expected: non-zero counts on a populated vault, the sample file has `path`, `name`, `folder` fields.

- [ ] **Step 1.4: Commit**

```bash
git add src/app/api/vault/index/route.ts
git commit -m "feat(api): GET /api/vault/index — flat palette index

Returns every .md basename + folder plus entity / project / hub
indexes. Walks the vault once, caches per-vault for 60s. Fuel for
the upcoming ⌘K universal quick-switcher.
"
```

---

### Task 2: `useVaultIndex` hook

**Files:**
- Create: `src/lib/hooks/useVaultIndex.ts`

- [ ] **Step 2.1: Write the hook**

```ts
"use client";

/**
 * useVaultIndex — hydrates /api/vault/index once per mount. Module-level
 * memoisation so reopening the palette doesn't refetch. Revalidate by
 * calling `refresh()` (used on vault change).
 */

import { useEffect, useState } from "react";
import { log } from "@/lib/log";

export interface VaultIndex {
  files: { path: string; name: string; folder: string }[];
  entities: { path: string; name: string }[];
  projects: { path: string; name: string }[];
  hubs: { path: string; name: string }[];
}

const EMPTY: VaultIndex = { files: [], entities: [], projects: [], hubs: [] };

let _cached: VaultIndex | null = null;
let _inflight: Promise<VaultIndex> | null = null;

async function fetchIndex(): Promise<VaultIndex> {
  if (_cached) return _cached;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const res = await fetch("/api/vault/index");
      if (!res.ok) return EMPTY;
      const json = (await res.json()) as VaultIndex;
      _cached = json;
      return json;
    } catch (e) {
      log.warn("vault-index", "fetch failed", e);
      return EMPTY;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

export function invalidateVaultIndex() {
  _cached = null;
}

export function useVaultIndex(): { index: VaultIndex; loading: boolean; refresh: () => void } {
  const [index, setIndex] = useState<VaultIndex>(_cached ?? EMPTY);
  const [loading, setLoading] = useState(!_cached);

  useEffect(() => {
    let cancelled = false;
    fetchIndex().then((v) => {
      if (!cancelled) { setIndex(v); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);

  const refresh = () => {
    invalidateVaultIndex();
    setLoading(true);
    fetchIndex().then((v) => { setIndex(v); setLoading(false); });
  };

  return { index, loading, refresh };
}
```

- [ ] **Step 2.2: Verify TS**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 2.3: Commit**

```bash
git add src/lib/hooks/useVaultIndex.ts
git commit -m "feat(hooks): useVaultIndex — memoised vault search index

Fetches /api/vault/index once per mount; module-level memo makes
reopening the palette instant. Exposes refresh() for vault-swap.
"
```

---

### Task 3: `useRecentFiles` hook

**Files:**
- Create: `src/lib/hooks/useRecentFiles.ts`

- [ ] **Step 3.1: Write the hook**

```ts
"use client";

/**
 * useRecentFiles — client-side recent-opened files list.
 *
 * Persists to localStorage["cipher-recent-files"] as a JSON array of
 * { path, openedAt, count } entries ordered most-recent first, capped at
 * 20 entries. Dedupes on push (move-to-front). Exposes:
 *
 *   recents    most-recent paths (just paths, for rendering).
 *   entries    full entries (with openedAt + count) — for ranking bonuses.
 *   push(path) bump path to front; increment count.
 *   remove(path)
 *   clear()
 *
 * Frequency is kept alongside so the palette can boost frequently-opened
 * files in the rank score.
 */

import { useCallback, useEffect, useState } from "react";

const KEY = "cipher-recent-files";
const MAX = 20;

export interface RecentEntry {
  path: string;
  openedAt: number;  // epoch ms
  count: number;
}

function readStore(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => e && typeof e.path === "string" && typeof e.openedAt === "number" && typeof e.count === "number"
    );
  } catch {
    return [];
  }
}

function writeStore(entries: RecentEntry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX))); } catch { /* ignore quota */ }
}

export function useRecentFiles(): {
  recents: string[];
  entries: RecentEntry[];
  push: (path: string) => void;
  remove: (path: string) => void;
  clear: () => void;
} {
  const [entries, setEntries] = useState<RecentEntry[]>([]);

  // Hydrate once.
  useEffect(() => {
    setEntries(readStore());
  }, []);

  const push = useCallback((path: string) => {
    if (!path) return;
    setEntries((prev) => {
      const now = Date.now();
      const existing = prev.find((e) => e.path === path);
      const next: RecentEntry[] = existing
        ? [{ path, openedAt: now, count: existing.count + 1 }, ...prev.filter((e) => e.path !== path)]
        : [{ path, openedAt: now, count: 1 }, ...prev];
      const trimmed = next.slice(0, MAX);
      writeStore(trimmed);
      return trimmed;
    });
  }, []);

  const remove = useCallback((path: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.path !== path);
      writeStore(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }, []);

  return {
    recents: entries.map((e) => e.path),
    entries,
    push,
    remove,
    clear,
  };
}
```

- [ ] **Step 3.2: Verify TS**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3.3: Commit**

```bash
git add src/lib/hooks/useRecentFiles.ts
git commit -m "feat(hooks): useRecentFiles — localStorage recent-opens + frequency

20-entry cap, move-to-front on push, per-path count so the palette
can boost frequently-opened files in its rank score.
"
```

---

### Task 4: Extract fuzzy scoring to `src/lib/fuzzy.ts`

**Files:**
- Create: `src/lib/fuzzy.ts`
- Modify: `src/components/CommandPalette.tsx` (one import swap)

- [ ] **Step 4.1: Create the shared module**

```ts
/**
 * Shared fuzzy scoring + ranking helpers for the ⌘K palette.
 *
 * fuzzyScore: classic subsequence match with adjacency reward — every
 * query char must appear in order in the target. Lower = better; Infinity
 * means no match. Matches the pre-existing CommandPalette signature so
 * the old consumer behaviour is preserved byte-for-byte.
 *
 * rankScore: spec-driven combined score — higher = better — using prefix,
 * word-boundary, fuzzy, and recency/frequency bonuses. Used by the new
 * typed-state flat list. Returns null when no match at all.
 */

export function fuzzyScore(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += lastMatch === -1 ? ti : ti - lastMatch;
      lastMatch = ti;
      qi++;
    }
  }
  return qi === q.length ? score : Infinity;
}

export interface RankBonus {
  /** True if opened in the last 24h. */
  recent?: boolean;
  /** True if opened ≥ 3 times in the last 7 days. */
  frequent?: boolean;
}

/**
 * Higher-is-better score for the typed-state flat list.
 *
 * weights:
 *   +4 exact prefix (target starts with query)
 *   +2 word-boundary (query matches a word start)
 *   +1 fuzzy substring hits (each consecutive subsequence match)
 *   +3 recency-bonus  (opened in last 24h)
 *   +2 frequency-bonus (opened ≥ 3 times in last 7 days)
 *
 * Returns null when no subsequence match exists at all.
 */
export function rankScore(query: string, target: string, bonus: RankBonus = {}): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Subsequence match check (same as fuzzyScore).
  let qi = 0;
  let consecutiveHits = 0;
  let maxRun = 0;
  let run = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      consecutiveHits++;
      run++;
      maxRun = Math.max(maxRun, run);
      qi++;
    } else {
      run = 0;
    }
  }
  if (qi < q.length) return null;

  let score = consecutiveHits;  // +1 per match char

  if (t.startsWith(q)) score += 4;

  // Word-boundary: query appears at the start of any space/dash/slash-delimited word.
  const words = t.split(/[\s\-_/.]+/);
  if (words.some((w) => w.startsWith(q))) score += 2;

  if (bonus.recent) score += 3;
  if (bonus.frequent) score += 2;

  return score;
}
```

- [ ] **Step 4.2: Delete the old `fuzzyScore` from CommandPalette and import instead**

In `src/components/CommandPalette.tsx`:

Replace the `function fuzzyScore(...)` block (lines ~37–56 in the current file) with an import at the top:

```ts
import { fuzzyScore } from "@/lib/fuzzy";
```

Delete the local `fuzzyScore` function. Leave the rest of the file unchanged.

- [ ] **Step 4.3: Verify TS**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4.4: Smoke-test palette still works**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/browse
```

Expected: `200`. Then manually: hit ⌘K in the browser, type "theme" — the Toggle theme action should still rank and filter correctly.

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/fuzzy.ts src/components/CommandPalette.tsx
git commit -m "refactor(fuzzy): extract scoring + add rankScore for typed state

Shared lib/fuzzy.ts now exports fuzzyScore (preserving the existing
CommandPalette behaviour byte-for-byte) plus rankScore — a higher-
is-better combined score for the typed-state flat list that folds
in prefix, word-boundary, and recency/frequency bonuses per the
palette spec.
"
```

---

## Phase B — Palette rewrite

### Task 5: Empty state — Recent / Pinned / Commands groups

**Files:**
- Modify: `src/components/CommandPalette.tsx`

**Context:** The palette currently shows `actions: PaletteAction[]` grouped by `action.group`. The new empty state shows three fixed groups: Recent files (from `useRecentFiles`), Pinned (from `useSidebarPins`), Commands (the current actions prop). The typed state (Task 6) replaces all of this with a flat ranked list; this task only implements the empty state rendering.

- [ ] **Step 5.1: Add a `PaletteResult` type + the new hooks at the top of CommandPalette.tsx**

Immediately after the existing imports (add the hook imports too):

```tsx
import { useVaultIndex, type VaultIndex } from "@/lib/hooks/useVaultIndex";
import { useRecentFiles, type RecentEntry } from "@/lib/hooks/useRecentFiles";
import { useSidebarPins } from "@/lib/hooks/useSidebarPins";
import { useSheet } from "@/lib/hooks/useSheet";
import { useRouter } from "next/navigation";
import { PinIcon } from "@/components/ui/PinIcon";
import type { PinEntry } from "@/lib/settings";
```

And near the existing `PaletteAction` interface (around line 14), add the unified result type:

```ts
export type PaletteResult =
  | { kind: "recent"; path: string; name: string; folder: string; entry: RecentEntry }
  | { kind: "pin"; pin: PinEntry }
  | { kind: "file"; path: string; name: string; folder: string; bonus: { recent: boolean; frequent: boolean } }
  | { kind: "entity"; path: string; name: string }
  | { kind: "project"; path: string; name: string }
  | { kind: "heading"; slug: string; label: string; filePath: string }
  | { kind: "command"; action: PaletteAction }
  | { kind: "fallback-chat"; query: string };
```

- [ ] **Step 5.2: Wire the hooks inside `CommandPalette` function body**

Near the top of the component body, after `const [query, setQuery] = useState("");`:

```tsx
  const router = useRouter();
  const sheet = useSheet();
  const { index } = useVaultIndex();
  const { recents, entries: recentEntries, push: pushRecent } = useRecentFiles();
  const { pins } = useSidebarPins();
  // Used by the consumer for the one-line 'DetailPage push-on-open' in Task 9.
  void pushRecent;
```

(Leaves `pushRecent` referenced so tsc doesn't flag it unused — we export it in Task 9 via the recent-files hook directly, not through the palette.)

- [ ] **Step 5.3: Build an `emptyResults` list**

Right after the hook wiring (before the old `filtered` useMemo):

```tsx
  // ── Empty state (query === "") ────────────────────────────────────
  const emptyResults: PaletteResult[] = useMemo(() => {
    const out: PaletteResult[] = [];
    // Recent files (up to 5).
    for (const entry of recentEntries.slice(0, 5)) {
      const f = index.files.find((x) => x.path === entry.path);
      if (f) out.push({ kind: "recent", path: f.path, name: f.name, folder: f.folder, entry });
      else out.push({ kind: "recent", path: entry.path, name: entry.path.split("/").pop()?.replace(/\.md$/i, "") ?? entry.path, folder: entry.path.includes("/") ? entry.path.split("/").slice(0, -1).join("/") : "", entry });
    }
    // Pins.
    for (const pin of pins) out.push({ kind: "pin", pin });
    // Commands.
    for (const action of actions) out.push({ kind: "command", action });
    return out;
  }, [recentEntries, index.files, pins, actions]);
```

- [ ] **Step 5.4: Render the empty state when the query is blank**

In the `Results` section of the JSX (currently shows `filtered.length === 0` fallback then `groups.map(...)`), wrap the existing logic in a top-level `query === ""` conditional. The simplest full replacement for the `<div {...listProps} className="flex-1 overflow-y-auto py-1">...</div>` block:

```tsx
            <div
              {...listProps}
              className="flex-1 overflow-y-auto py-1"
              style={{ scrollbarWidth: "thin" }}
            >
              {query.trim() === "" ? (
                <EmptyStateGroups
                  results={emptyResults}
                  activeIndex={activeIndex}
                  itemProps={itemProps}
                  onActivate={(r) => {
                    activateResult(r, false);
                    onClose();
                  }}
                />
              ) : (
                // Task 6 fills this branch.
                <div className="px-4 py-8 text-center caption-large text-text-quaternary">
                  Task 6 — typed state not implemented yet
                </div>
              )}
            </div>
```

Then add the subcomponent + a stubbed `activateResult` further down in the same file:

```tsx
function activateResult(result: PaletteResult, _newTab: boolean) {
  // Full routing lands in Task 7. Stub for now so Task 5 compiles.
  if (result.kind === "command") result.action.run();
}

interface EmptyStateGroupsProps {
  results: PaletteResult[];
  activeIndex: number;
  itemProps: (i: number) => React.HTMLAttributes<HTMLElement>;
  onActivate: (r: PaletteResult) => void;
}

function EmptyStateGroups({ results, activeIndex, itemProps, onActivate }: EmptyStateGroupsProps) {
  const recents = results.filter((r) => r.kind === "recent");
  const pins = results.filter((r) => r.kind === "pin");
  const commands = results.filter((r) => r.kind === "command");
  const sections: { label: string; count?: number; items: PaletteResult[] }[] = [];
  if (recents.length) sections.push({ label: "Recent", count: recents.length, items: recents });
  if (pins.length) sections.push({ label: "Pinned", count: pins.length, items: pins });
  if (commands.length) sections.push({ label: "Commands", items: commands });

  let flatIndex = 0;
  return (
    <>
      {sections.map((section) => {
        const sectionStart = flatIndex;
        flatIndex += section.items.length;
        return (
          <div key={section.label}>
            <div className="flex items-center justify-between px-4 pt-3 pb-1 micro uppercase tracking-[0.08em] text-text-quaternary">
              <span>{section.label}</span>
              {section.count !== undefined && (
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{section.count}</span>
              )}
            </div>
            {section.items.map((result, i) => {
              const idx = sectionStart + i;
              const ip = itemProps(idx);
              const active = idx === activeIndex;
              return (
                <PaletteRow
                  key={resultKey(result)}
                  {...ip}
                  result={result}
                  active={active}
                  onPointerUp={(e) => { if (e.button === 0) onActivate(result); }}
                />
              );
            })}
          </div>
        );
      })}
    </>
  );
}

function resultKey(r: PaletteResult): string {
  switch (r.kind) {
    case "recent": return `recent:${r.path}`;
    case "pin": return `pin:${r.pin.id}`;
    case "file": return `file:${r.path}`;
    case "entity": return `entity:${r.path}`;
    case "project": return `project:${r.path}`;
    case "heading": return `heading:${r.filePath}#${r.slug}`;
    case "command": return `command:${r.action.id}`;
    case "fallback-chat": return "fallback-chat";
  }
}

interface PaletteRowProps extends React.HTMLAttributes<HTMLButtonElement> {
  result: PaletteResult;
  active: boolean;
}
function PaletteRow({ result, active, ...rest }: PaletteRowProps) {
  const label = rowLabel(result);
  const secondary = rowSecondary(result);
  return (
    <button
      type="button"
      tabIndex={-1}
      {...rest}
      className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors duration-75"
      style={{
        background: active ? "var(--bg-surface-alpha-4)" : "transparent",
        borderLeft: active ? "2px solid var(--accent-brand)" : "2px solid transparent",
        cursor: "pointer",
      }}
    >
      <span className="shrink-0 text-text-tertiary flex items-center justify-center" style={{ width: 16, height: 16 }}>
        {rowIcon(result)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="caption-large text-text-primary truncate">{label}</div>
        {secondary && <div className="caption text-text-quaternary truncate">{secondary}</div>}
      </div>
    </button>
  );
}

function rowLabel(r: PaletteResult): string {
  switch (r.kind) {
    case "recent": case "file": return r.name;
    case "pin": return r.pin.label;
    case "entity": case "project": return r.name;
    case "heading": return r.label;
    case "command": return r.action.label;
    case "fallback-chat": return `Ask chat: "${r.query}"`;
  }
}

function rowSecondary(r: PaletteResult): string | null {
  switch (r.kind) {
    case "recent": case "file": return r.folder || null;
    case "pin": return r.pin.path;
    case "entity": return "entity";
    case "project": return "project";
    case "heading": return r.filePath;
    case "command": return r.action.description ?? null;
    case "fallback-chat": return "open /chat";
  }
}

function rowIcon(r: PaletteResult): React.ReactNode {
  switch (r.kind) {
    case "recent": case "file":
      return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>;
    case "pin":
      return <PinIcon name={r.pin.icon} />;
    case "entity":
      return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-7 8-7s8 3 8 7"/></svg>;
    case "project":
      return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>;
    case "heading":
      return <span className="mono-label">#</span>;
    case "command":
      return r.action.icon ?? <span>→</span>;
    case "fallback-chat":
      return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
  }
}
```

Delete or orphan the old `groups` and `filtered` (they'll be replaced properly in Task 6). For now, remove their usage from the JSX — the empty-state path is the only path that renders anything; the typed-state stub shows a placeholder string.

- [ ] **Step 5.5: Update `useListNavigation` to drive the merged empty list**

Replace the existing `useListNavigation` call with:

```tsx
  const listItems: PaletteResult[] = query.trim() === "" ? emptyResults : [];  // Task 6 fills the else.
  const { activeIndex, setActiveIndex, listProps, itemProps } = useListNavigation({
    items: listItems,
    enabled: open,
    onSelect: (result) => {
      activateResult(result, false);
      onClose();
    },
  });
```

- [ ] **Step 5.6: Verify**

```bash
npx tsc --noEmit
```

Expected: clean (it's fine if the footer result-count is temporarily wrong; we fix in Task 6).

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/browse
```

Expected: `200`. Hit ⌘K — the palette should render with Pinned + Commands sections at minimum. Recent will be empty until Task 9 records opens.

- [ ] **Step 5.7: Commit**

```bash
git add src/components/CommandPalette.tsx
git commit -m "feat(palette): empty-state Recent / Pinned / Commands groups

Palette body rewritten for the empty-state path only. Wires the new
useVaultIndex + useRecentFiles + useSidebarPins hooks; renders a
three-section stack (Recent / Pinned / Commands) with a merged flat
index for useListNavigation. Typed-state is a stub until Task 6.
"
```

---

### Task 6: Typed state — flat ranked list + prefix detection

**Files:**
- Modify: `src/components/CommandPalette.tsx`

- [ ] **Step 6.1: Add prefix parsing + typed-state builder**

Inside the component body, after `emptyResults`:

```tsx
  // ── Typed state (query.length > 0) ─────────────────────────────────
  const { prefix, body } = useMemo(() => {
    const q = query;
    if (q.startsWith(">")) return { prefix: ">" as const, body: q.slice(1) };
    if (q.startsWith("@")) return { prefix: "@" as const, body: q.slice(1) };
    if (q.startsWith("#")) return { prefix: "#" as const, body: q.slice(1) };
    return { prefix: null as null, body: q };
  }, [query]);

  const openFilePath = sheet.path;

  // Build candidate rows per prefix, then rank by rankScore.
  const typedResults: PaletteResult[] = useMemo(() => {
    if (query.trim() === "") return [];
    const bodyTrim = body.trim();
    const candidates: { result: PaletteResult; searchText: string; bonus?: { recent: boolean; frequent: boolean } }[] = [];

    const DAY = 24 * 60 * 60 * 1000;
    const WEEK = 7 * DAY;
    const now = Date.now();
    const recentMap = new Map(recentEntries.map((e) => [e.path, e]));

    const fileBonus = (path: string) => {
      const e = recentMap.get(path);
      if (!e) return { recent: false, frequent: false };
      const recent = now - e.openedAt < DAY;
      const frequent = e.count >= 3 && now - e.openedAt < WEEK;
      return { recent, frequent };
    };

    if (prefix === ">") {
      for (const action of actions) candidates.push({ result: { kind: "command", action }, searchText: action.label });
    } else if (prefix === "@") {
      for (const e of index.entities) candidates.push({ result: { kind: "entity", path: e.path, name: e.name }, searchText: e.name });
      for (const p of index.projects) candidates.push({ result: { kind: "project", path: p.path, name: p.name }, searchText: p.name });
    } else if (prefix === "#") {
      // Headings inside the currently-open sheet only. If no sheet, return an info row.
      if (!openFilePath) {
        candidates.push({ result: { kind: "fallback-chat", query: "Open a file first to jump to headings" }, searchText: "" });
      } else {
        // fetched + parsed lazily via a local cache; see Step 6.3.
      }
    } else {
      // Default merged scope.
      for (const f of index.files) candidates.push({ result: { kind: "file", path: f.path, name: f.name, folder: f.folder, bonus: fileBonus(f.path) }, searchText: f.name, bonus: fileBonus(f.path) });
      for (const p of pins) candidates.push({ result: { kind: "pin", pin: p }, searchText: p.label });
      for (const e of index.entities) candidates.push({ result: { kind: "entity", path: e.path, name: e.name }, searchText: e.name });
      for (const p of index.projects) candidates.push({ result: { kind: "project", path: p.path, name: p.name }, searchText: p.name });
      for (const action of actions) candidates.push({ result: { kind: "command", action }, searchText: action.label });
    }

    // Rank.
    const ranked = candidates
      .map((c) => ({ ...c, score: rankScore(bodyTrim, c.searchText, c.bonus) }))
      .filter((c) => c.score !== null)
      .sort((a, b) => (b.score! - a.score!));

    const results = ranked.slice(0, 50).map((r) => r.result);
    if (results.length === 0 && bodyTrim.length > 0 && prefix !== "#") {
      results.push({ kind: "fallback-chat", query: bodyTrim });
    }
    return results;
  }, [query, body, prefix, actions, index.entities, index.projects, index.files, pins, recentEntries, openFilePath]);
```

Add `import { rankScore } from "@/lib/fuzzy";` at the top.

- [ ] **Step 6.2: Heading candidates for `#` prefix**

Add (inside the same component body, before the `typedResults` useMemo):

```tsx
  // Cache of headings for the currently-open sheet file — fetched once per path.
  const [sheetHeadings, setSheetHeadings] = useState<{ path: string; headings: { slug: string; label: string }[] } | null>(null);
  useEffect(() => {
    if (prefix !== "#" || !openFilePath) return;
    if (sheetHeadings?.path === openFilePath) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/file?path=${encodeURIComponent(openFilePath)}`);
        if (!res.ok) return;
        const body = await res.json();
        const sections: { heading: string }[] = body?.sections ?? [];
        const headings = sections.map((s) => ({
          slug: s.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
          label: s.heading,
        }));
        if (!cancelled) setSheetHeadings({ path: openFilePath, headings });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [prefix, openFilePath, sheetHeadings?.path]);
```

Then in the `if (prefix === "#")` branch of `typedResults`, replace the empty-else with:

```tsx
      } else if (sheetHeadings?.path === openFilePath) {
        for (const h of sheetHeadings.headings) {
          candidates.push({
            result: { kind: "heading", slug: h.slug, label: h.label, filePath: openFilePath },
            searchText: h.label,
          });
        }
      }
```

- [ ] **Step 6.3: Render typed-state list**

Replace the `"Task 6 — typed state not implemented yet"` stub with:

```tsx
                <TypedStateList
                  results={typedResults}
                  activeIndex={activeIndex}
                  itemProps={itemProps}
                  onActivate={(r) => {
                    activateResult(r, false);
                    onClose();
                  }}
                />
```

Add the subcomponent definition next to `EmptyStateGroups`:

```tsx
interface TypedStateListProps {
  results: PaletteResult[];
  activeIndex: number;
  itemProps: (i: number) => React.HTMLAttributes<HTMLElement>;
  onActivate: (r: PaletteResult) => void;
}
function TypedStateList({ results, activeIndex, itemProps, onActivate }: TypedStateListProps) {
  if (results.length === 0) return null;
  return (
    <>
      {results.map((result, idx) => {
        const ip = itemProps(idx);
        const active = idx === activeIndex;
        return (
          <PaletteRow
            key={resultKey(result)}
            {...ip}
            result={result}
            active={active}
            onPointerUp={(e) => { if (e.button === 0) onActivate(result); }}
          />
        );
      })}
    </>
  );
}
```

- [ ] **Step 6.4: Update `listItems` to use typed state**

Replace the previous stub:

```tsx
  const listItems: PaletteResult[] = query.trim() === "" ? emptyResults : typedResults;
```

- [ ] **Step 6.5: Update footer result count + search-input placeholder**

Placeholder in the input (line around 192):

```tsx
                placeholder={prefixPlaceholder(prefix)}
```

Add a helper next to the other helpers:

```tsx
function prefixPlaceholder(prefix: ">" | "@" | "#" | null): string {
  switch (prefix) {
    case ">": return "Run a command…";
    case "@": return "Find an entity or project…";
    case "#": return "Jump to a heading in the open file…";
    default: return "Search files, pins, commands…";
  }
}
```

Footer result count (bottom of the file, still inside the palette):

```tsx
              <div className="micro text-text-quaternary">
                {listItems.length} {listItems.length === 1 ? "result" : "results"}
              </div>
```

- [ ] **Step 6.6: Verify**

```bash
npx tsc --noEmit
```

Expected: clean.

Browser walk:
- Hit ⌘K, type `sid` — expect `Sidebar.tsx`-matching files and any pin/entity matches in a flat ranked list.
- Type `>theme` — only the toggle-theme command.
- Type `@` — only entities + projects.
- Open a file (click any pin + click a file in the drawer), re-open ⌘K, type `#` — headings of the open file appear.
- Type `xqzjk` — fallback "Ask chat" row.

- [ ] **Step 6.7: Commit**

```bash
git add src/components/CommandPalette.tsx
git commit -m "feat(palette): typed-state flat ranked list + prefix detection

Query detection for >/@/# prefixes. Default scope merges files,
pins, entities, projects, commands and ranks via rankScore.
'#' scope lazily fetches headings of the currently-open sheet's
file. Fallback 'Ask chat: <query>' row when no candidate matches.
Footer + input placeholder are prefix-aware.
"
```

---

### Task 7: Enter-routing per result type

**Files:**
- Modify: `src/components/CommandPalette.tsx`

- [ ] **Step 7.1: Replace the stubbed `activateResult`**

Move it inside the `CommandPalette` body (it now needs `router` / `sheet` / `pushRecent`). Remove the standalone `function activateResult` at the bottom. Add inside the component, near the hooks:

```tsx
  const activateResult = useCallback((result: PaletteResult, newTab: boolean) => {
    switch (result.kind) {
      case "recent":
      case "file":
        if (newTab) router.push(`/file/${result.path}`);
        else sheet.open(result.path);
        pushRecent(result.path);
        return;
      case "pin":
        // Pin opens the scoped drawer via the existing AppShell flow — close
        // the palette; the consumer decides how to handle it via the existing
        // `onBrowse`/`onOpenPin` callbacks. Simplest: push /browse and open
        // the drawer scoped. Re-use sheet drawer pattern via URL would add
        // surface area — punt for now: jump to /browse and let the user
        // re-click the pin from the sidebar.
        router.push("/browse");
        return;
      case "entity":
      case "project":
        if (newTab) router.push(`/file/${result.path}`);
        else sheet.open(result.path);
        pushRecent(result.path);
        return;
      case "heading":
        sheet.open(result.filePath, result.slug);
        return;
      case "command":
        result.action.run();
        return;
      case "fallback-chat":
        router.push(`/chat?q=${encodeURIComponent(result.query)}`);
        return;
    }
  }, [router, sheet, pushRecent]);
```

Add `useCallback` to the existing react import if not already there.

- [ ] **Step 7.2: Wire `onPointerUp` to pass `newTab`**

In `PaletteRow` props, accept an `onActivateWithModifier?: (e: React.MouseEvent) => void`. Simpler — pass `e.metaKey || e.ctrlKey` to the parent via the existing `onPointerUp`:

Replace in both `EmptyStateGroups` and `TypedStateList`:

```tsx
                  onPointerUp={(e) => {
                    if (e.button !== 0) return;
                    activateResult(result, e.metaKey || e.ctrlKey);
                    onClose();
                  }}
```

Since `EmptyStateGroups` + `TypedStateList` are currently children that call `onActivate(result)` without the event, update their interfaces:

```ts
interface EmptyStateGroupsProps {
  results: PaletteResult[];
  activeIndex: number;
  itemProps: (i: number) => React.HTMLAttributes<HTMLElement>;
  onActivate: (r: PaletteResult, newTab: boolean) => void;
}
```

And in `PaletteRow` pass `onPointerUp` through:

```tsx
<PaletteRow
  key={resultKey(result)}
  {...ip}
  result={result}
  active={active}
  onPointerUp={(e) => { if (e.button === 0) onActivate(result, e.metaKey || e.ctrlKey); }}
/>
```

Same in `TypedStateList`. Parent's callback becomes:

```tsx
onActivate={(r, newTab) => {
  activateResult(r, newTab);
  onClose();
}}
```

And the `useListNavigation`'s `onSelect` callback:

```tsx
onSelect: (result) => {
  activateResult(result, false);
  onClose();
},
```

- [ ] **Step 7.3: Verify**

```bash
npx tsc --noEmit
```

Expected: clean.

Browser walk: Enter on a file opens the sheet. Enter on a command runs it. Enter on a heading scrolls the sheet to that anchor. ⌘Enter on a file routes to `/file/<path>` full-page.

- [ ] **Step 7.4: Commit**

```bash
git add src/components/CommandPalette.tsx
git commit -m "feat(palette): Enter-routing per result type

activateResult dispatches by result kind — sheet.open for files /
entities / projects / headings, command.run for commands, /chat?q
for the fallback row, /browse for pin activation. ⌘Enter opens
the file in a new /file/[...path] route.
"
```

---

### Task 8: Keyboard map — Tab cycles prefix + position-0 backspace clears

**Files:**
- Modify: `src/components/CommandPalette.tsx`

- [ ] **Step 8.1: Handle Tab and special Backspace on the input**

Add an `onKeyDown` to the `<input>` element:

```tsx
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const next = nextPrefix(prefix);
                    setQuery(next === null ? "" : next);
                    setActiveIndex(0);
                    return;
                  }
                  if (e.key === "Backspace" && e.currentTarget.selectionStart === 0 && prefix !== null) {
                    e.preventDefault();
                    setQuery("");
                    setActiveIndex(0);
                  }
                }}
                placeholder={prefixPlaceholder(prefix)}
                className="flex-1 body text-text-primary bg-transparent border-0"
                autoComplete="off"
                spellCheck={false}
              />
```

Add the helper:

```tsx
function nextPrefix(p: ">" | "@" | "#" | null): string | null {
  switch (p) {
    case null: return ">";
    case ">": return "@";
    case "@": return "#";
    case "#": return null;
  }
}
```

(`useListNavigation` already handles arrows, j/k, Home/End, Enter. The `onSelect` path already fires on Enter and passes `newTab: false`. ⌘Enter currently falls through to `useListNavigation`'s Enter handler which doesn't read modifiers — acceptable for this cut; ⌘Enter behaves like Enter. If the user wants true `⌘Enter → new tab`, the global Enter listener needs to intercept `metaKey`. That can be a follow-up if it comes up; for now document behaviour in the footer hint.)

- [ ] **Step 8.2: Update footer hint to reflect the new keys**

Replace the footer `<div>` contents:

```tsx
              <div className="flex items-center gap-3 micro text-text-quaternary">
                <span className="flex items-center gap-1">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                  <span className="ml-1">navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <Kbd>↵</Kbd>
                  <span className="ml-1">open</span>
                </span>
                <span className="flex items-center gap-1">
                  <Kbd>Tab</Kbd>
                  <span className="ml-1">prefix</span>
                </span>
              </div>
```

- [ ] **Step 8.3: Verify**

```bash
npx tsc --noEmit
```

Expected: clean.

Browser walk: `Tab` cycles `"" → ">" → "@" → "#" → ""`. Backspace at cursor position 0 with an active prefix clears it. Footer shows Tab hint.

- [ ] **Step 8.4: Commit**

```bash
git add src/components/CommandPalette.tsx
git commit -m "feat(palette): Tab cycles prefix + position-0 Backspace clears

Tab key advances through null → > → @ → # → null, prefilling the
input. Backspace at cursor-position-0 with an active prefix clears
the prefix entirely. Footer hint row updated to document Tab.
"
```

---

## Phase C — Wire + polish

### Task 9: DetailPage records recent-file opens

**Files:**
- Modify: `src/components/DetailPage.tsx`

- [ ] **Step 9.1: Import the hook and push on path change**

Add to the top of DetailPage's imports:

```tsx
import { useRecentFiles } from "@/lib/hooks/useRecentFiles";
```

Inside the `DetailPage` component body, near the existing `useState` declarations:

```tsx
  const { push: pushRecent } = useRecentFiles();

  useEffect(() => {
    if (path) pushRecent(path);
  }, [path, pushRecent]);
```

- [ ] **Step 9.2: Verify**

```bash
npx tsc --noEmit
```

Expected: clean.

Browser walk: open a file (any route), close the sheet, hit ⌘K — the file appears at the top of the Recent section.

- [ ] **Step 9.3: Commit**

```bash
git add src/components/DetailPage.tsx
git commit -m "feat(palette): DetailPage records each file open as recent

One useEffect in DetailPage — pushes path to useRecentFiles on
mount + path change. The sheet is the one place files are actually
opened; everywhere else (wiki-link click, pin click, ⌘K file row)
routes through the sheet, so this single hook captures everything.
"
```

---

### Task 10: (No-op) Ranking scoring is complete

**Files:** none — already landed in Task 4 (`rankScore`) and Task 6 (bonus wiring).

- [ ] **Step 10.1: Verify the bonus math end-to-end**

Open a file 3 times within a minute (click in VaultDrawer, close sheet, repeat). Hit ⌘K, type a partial match to the filename — the opened file should rank above a comparable non-opened file.

```bash
grep -n "rankScore\|fileBonus" src/components/CommandPalette.tsx src/lib/fuzzy.ts | head
```

Expected: both the definition and the wired usage visible.

- [ ] **Step 10.2: No commit** — this task is a verification gate only. If the math is wrong, fix in CommandPalette.tsx and amend Task 6's commit locally OR make a small fix commit:

```bash
git commit --allow-empty -m "chore(palette): verified rank bonuses are live (no-op task)"
```

---

### Task 11: Fallback "Ask chat" row

**Files:** none new — already wired in Task 6 (`fallback-chat` branch).

- [ ] **Step 11.1: Walk the end-to-end**

Hit ⌘K, type `xqzjk` (nonsense). Expect one row:

```
Ask chat: "xqzjk"     open /chat
```

Pressing Enter routes to `/chat?q=xqzjk`.

- [ ] **Step 11.2: No commit** — already covered by Task 6.

```bash
git commit --allow-empty -m "chore(palette): verified fallback chat row (no-op task)"
```

---

## Final verification

After all tasks are committed:

- [ ] **tsc clean:** `npx tsc --noEmit` → no output.
- [ ] **Build green:** `npm run build` → `✓ Compiled successfully`.
- [ ] **Index endpoint:** `curl -s http://localhost:3000/api/vault/index | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['files']), 'files')"` → non-zero on populated vault.
- [ ] **Empty state:** hit ⌘K → Recent (5 most recent) + Pinned + Commands sections render.
- [ ] **Default scope:** type `sid` → files + pins + entities + projects + commands merged and ranked.
- [ ] **Commands prefix:** `>theme` → only the toggle-theme command.
- [ ] **Entities prefix:** `@` → only entities + projects.
- [ ] **Headings prefix on open file:** open a file, hit ⌘K, type `#` → headings of that file render. Enter scrolls the sheet to the heading anchor.
- [ ] **Headings prefix no open file:** close the sheet, hit ⌘K, type `#` → informational row says "Open a file first".
- [ ] **Enter routing:** each result kind routes correctly. ⌘Enter on a file opens in `/file/[...path]`.
- [ ] **Fallback chat:** type `xqzjk` → single `Ask chat: "xqzjk"` row routes to `/chat?q=xqzjk`.
- [ ] **Tab cycling:** Tab steps through null → `>` → `@` → `#` → null.
- [ ] **Backspace clears prefix:** cursor at position 0 with a prefix active → single Backspace clears it.
- [ ] **Reduced motion:** Chrome emulate prefers-reduced-motion → palette open/close animations shorten to ~0ms (covered by existing globals.css reduced-motion block).

## Push + merge

```bash
git push -u origin v16-palette-overhaul
git checkout master
git merge --ff-only v16-palette-overhaul
git push origin master
```
