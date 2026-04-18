# Custom Pinned Sidebar + Open-Source README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a user-customisable "Pinned" group in the sidebar (folder shortcuts persisted to `<vault>/.cipher/sidebar.json`) plus a complete open-source README + LICENSE + CONTRIBUTING + .env.example.

**Architecture:** Persistence layer in the vault itself; Next.js App Router API routes for read/write; a lightweight React hook for state; framer-motion `Reorder` for drag; new `PinDialog` for the add flow; `VaultDrawer` accepts an optional `scopedPath` and a hover-to-pin button on folder rows. README is a full rewrite plus three small sibling files at repo root and a `docs/images/` placeholder.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, framer-motion 11, Tailwind v4, inline SVG icons, file-backed JSON config (`tmp + rename` atomic writes).

**Branch:** all work lands on a single branch `v12-sidebar-pins-readme`. One commit per task. No test framework — verification is `npx tsc --noEmit` + `curl` + browser.

---

## File structure

**New files:**

| File | Responsibility |
|---|---|
| `src/lib/settings.ts` | Typed read/write of `<vault>/.cipher/sidebar.json`; schema; atomic write |
| `src/lib/hooks/useSidebarPins.ts` | React state + optimistic mutations + API wiring |
| `src/components/ui/PinIcon.tsx` | 12 monochrome SVG icons keyed by name |
| `src/components/sidebar/PinDialog.tsx` | Add/edit dialog — path autocomplete + label + icon grid |
| `src/app/api/settings/sidebar/route.ts` | `GET` / `PUT` the sidebar config |
| `src/app/api/vault/folders/route.ts` | `GET ?q=<term>` — folder autocomplete |
| `LICENSE` | MIT text |
| `CONTRIBUTING.md` | Short contributor guide |
| `docs/images/.gitkeep` | Placeholder so git tracks the directory |

**Modified files:**

| File | Change |
|---|---|
| `src/components/Sidebar.tsx` | New "Pinned" group + hook wiring + dialog trigger |
| `src/components/AppShell.tsx` | Thread `scopedPath` into VaultDrawer on pin click |
| `src/components/VaultDrawer.tsx` | Accept `scopedPath`; breadcrumb when scoped; hover-to-pin on folders |
| `README.md` | Full rewrite (current file is a pre-v7 stub) |
| `.env.example` | Add one-line hint about `<vault>/.cipher/sidebar.json` (optional) |

---

## Task 0: Branch setup

**Files:** (none yet)

- [ ] **Step 0.1: Verify clean tree on master**

```bash
git status
git log --oneline master -1
```

Expected: working tree clean, on master, latest commit is the one that closes the vault-agnostic work.

- [ ] **Step 0.2: Create feature branch**

```bash
git checkout -b v12-sidebar-pins-readme
git branch --show-current
```

Expected: output `v12-sidebar-pins-readme`.

---

## Phase A — Custom Pinned Sidebar

### Task A1: Settings module + API routes

**Files:**
- Create: `src/lib/settings.ts`
- Create: `src/app/api/settings/sidebar/route.ts`
- Create: `src/app/api/vault/folders/route.ts`

- [ ] **Step A1.1: Write `src/lib/settings.ts`**

```ts
import "server-only";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { join } from "path";
import { getVaultPath } from "./vault-reader";

// ─── Types ───────────────────────────────────────────────────────────
export type PinIconName =
  | "folder" | "document" | "flag" | "star" | "book" | "rocket"
  | "people" | "archive" | "inbox" | "graph" | "brain" | "calendar";

export interface PinEntry {
  id: string;
  label: string;
  path: string;      // vault-relative folder
  icon: PinIconName;
}

export interface SidebarConfig {
  version: 1;
  pins: PinEntry[];
}

const EMPTY: SidebarConfig = { version: 1, pins: [] };
const FILE_REL = ".cipher/sidebar.json";

// ─── Read ────────────────────────────────────────────────────────────
export async function readSidebarSettings(): Promise<SidebarConfig> {
  const root = getVaultPath();
  if (!root) return EMPTY;
  try {
    const raw = await readFile(join(root, FILE_REL), "utf-8");
    const parsed = JSON.parse(raw);
    if (!isValidConfig(parsed)) {
      console.warn("[settings] malformed sidebar.json — returning empty config");
      return EMPTY;
    }
    return parsed;
  } catch {
    return EMPTY;
  }
}

// ─── Write (atomic: temp + rename) ───────────────────────────────────
export async function writeSidebarSettings(config: SidebarConfig): Promise<void> {
  const root = getVaultPath();
  if (!root) throw new Error("No vault connected");
  if (!isValidConfig(config)) throw new Error("Invalid sidebar config");
  const absFile = join(root, FILE_REL);
  const absDir = join(root, ".cipher");
  const tmp = `${absFile}.tmp`;
  await mkdir(absDir, { recursive: true });
  await writeFile(tmp, JSON.stringify(config, null, 2), "utf-8");
  await rename(tmp, absFile);
}

// ─── Validation ─────────────────────────────────────────────────────
const ICON_NAMES: ReadonlySet<string> = new Set<PinIconName>([
  "folder","document","flag","star","book","rocket",
  "people","archive","inbox","graph","brain","calendar",
]);

function isValidConfig(v: unknown): v is SidebarConfig {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.version !== 1) return false;
  if (!Array.isArray(o.pins)) return false;
  return o.pins.every(isValidPin);
}

function isValidPin(v: unknown): v is PinEntry {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return typeof p.id === "string" && p.id.length > 0
      && typeof p.label === "string"
      && typeof p.path === "string" && !p.path.startsWith("/")
      && typeof p.icon === "string" && ICON_NAMES.has(p.icon);
}
```

- [ ] **Step A1.2: Write `src/app/api/settings/sidebar/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import {
  readSidebarSettings,
  writeSidebarSettings,
  type SidebarConfig,
} from "@/lib/settings";

export async function GET() {
  const config = await readSidebarSettings();
  return NextResponse.json(config);
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    await writeSidebarSettings(body as SidebarConfig);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Write failed";
    const code = msg === "No vault connected" ? 409 : msg.startsWith("Invalid") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step A1.3: Write `src/app/api/vault/folders/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { join } from "path";
import { getVaultPath } from "@/lib/vault-reader";

// Cache the folder list for 60s to keep typing fast.
let _cache: { root: string; builtAt: number; folders: string[] } | null = null;
const TTL_MS = 60 * 1000;

async function listAllFolders(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(absDir: string, rel: string, depth: number) {
    if (depth > 5) return;
    let entries: import("fs").Dirent[];
    try { entries = await readdir(absDir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".obsidian") continue;
      const relNext = rel ? `${rel}/${entry.name}` : entry.name;
      out.push(relNext);
      await walk(join(absDir, entry.name), relNext, depth + 1);
    }
  }
  await walk(root, "", 0);
  return out;
}

export async function GET(req: NextRequest) {
  const root = getVaultPath();
  if (!root) return NextResponse.json({ folders: [] });
  const now = Date.now();
  if (!_cache || _cache.root !== root || now - _cache.builtAt > TTL_MS) {
    _cache = { root, builtAt: now, folders: await listAllFolders(root) };
  }
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase().trim();
  let folders = _cache.folders;
  if (q) folders = folders.filter((f) => f.toLowerCase().includes(q));
  folders = folders
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, 20);
  return NextResponse.json({ folders });
}
```

- [ ] **Step A1.4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step A1.5: Smoke-test the endpoints**

```bash
curl -s http://localhost:3000/api/settings/sidebar
```

Expected: `{"version":1,"pins":[]}` (or a populated config if the file already exists).

```bash
curl -s "http://localhost:3000/api/vault/folders?q=wiki" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['folders']), d['folders'][:3])"
```

Expected: a non-zero count and paths like `['wiki', 'wiki/journal', 'wiki/projects']` (depending on vault).

- [ ] **Step A1.6: Commit**

```bash
git add src/lib/settings.ts src/app/api/settings/sidebar/route.ts src/app/api/vault/folders/route.ts
git commit -m "feat(settings): vault-persisted sidebar config + folder autocomplete

Adds src/lib/settings.ts with typed SidebarConfig + PinEntry, atomic
(tmp+rename) write to <vault>/.cipher/sidebar.json, and schema
validation.

New API routes:
  GET  /api/settings/sidebar      - returns current config
  PUT  /api/settings/sidebar      - writes a new config (validated)
  GET  /api/vault/folders?q=...   - walks vault folders, cached 60s
"
```

---

### Task A2: PinIcon component

**Files:**
- Create: `src/components/ui/PinIcon.tsx`

- [ ] **Step A2.1: Write the icon component**

```tsx
"use client";

import type { PinIconName } from "@/lib/settings";

/**
 * PinIcon — 12 monochrome 14×14 stroke-2 SVGs keyed by name. Matches
 * the Linear-style iconography used across the sidebar. `stroke="currentColor"`
 * so the parent row controls colour.
 */
const ICONS: Record<PinIconName, React.ReactNode> = {
  folder: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  ),
  document: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </>
  ),
  flag: (
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <path d="M4 22v-7" />
    </>
  ),
  star: (
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  ),
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>
  ),
  rocket: (
    <>
      <path d="M4.5 16.5c-1.5 1.5-2 5-2 5s3.5-.5 5-2c.85-.85 1-2.5.25-3.25S5.35 15.65 4.5 16.5z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-4.95A12.94 12.94 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </>
  ),
  people: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  archive: (
    <>
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </>
  ),
  inbox: (
    <>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  graph: (
    <>
      <circle cx="6" cy="7" r="2" />
      <circle cx="18" cy="7" r="2" />
      <circle cx="12" cy="17" r="2" />
      <path d="M8 8l3 7M16 8l-3 7" />
    </>
  ),
  brain: (
    <>
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
};

export const PIN_ICON_NAMES: PinIconName[] = [
  "folder","document","flag","star","book","rocket",
  "people","archive","inbox","graph","brain","calendar",
];

export function PinIcon({ name, size = 14 }: { name: PinIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}
```

- [ ] **Step A2.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step A2.3: Commit**

```bash
git add src/components/ui/PinIcon.tsx
git commit -m "feat(ui): PinIcon component with 12 monochrome icons

12 curated 14x14 stroke-2 SVGs keyed by PinIconName: folder,
document, flag, star, book, rocket, people, archive, inbox,
graph, brain, calendar. stroke=currentColor for theme + row
control. Exports PIN_ICON_NAMES array for dialog enumeration.
"
```

---

### Task A3: useSidebarPins hook

**Files:**
- Create: `src/lib/hooks/useSidebarPins.ts`

- [ ] **Step A3.1: Write the hook**

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { PinEntry, SidebarConfig } from "@/lib/settings";

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function persist(config: SidebarConfig): Promise<void> {
  const res = await fetch("/api/settings/sidebar", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `PUT failed: ${res.status}`);
  }
}

export function useSidebarPins() {
  const [pins, setPins] = useState<PinEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Mount: hydrate from API.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/sidebar");
        if (!res.ok) return;
        const config: SidebarConfig = await res.json();
        if (!cancelled) setPins(config.pins);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Optimistic mutation. Every helper uses the functional setState form
  // so callbacks always see the latest pins without stale closures.
  // Persistence fires in the background; on failure we log and leave the
  // optimistic state in place (the next mount will resync with the server).

  const addPin = useCallback((partial: Omit<PinEntry, "id">) => {
    setPins((prev) => {
      const next = [...prev, { id: newId(), ...partial }];
      void persist({ version: 1, pins: next }).catch((e) =>
        console.error("[sidebar-pins] add failed:", e)
      );
      return next;
    });
  }, []);

  const removePin = useCallback((id: string) => {
    setPins((prev) => {
      const next = prev.filter((p) => p.id !== id);
      void persist({ version: 1, pins: next }).catch((e) =>
        console.error("[sidebar-pins] remove failed:", e)
      );
      return next;
    });
  }, []);

  const updatePin = useCallback((id: string, patch: Partial<Omit<PinEntry, "id">>) => {
    setPins((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
      void persist({ version: 1, pins: next }).catch((e) =>
        console.error("[sidebar-pins] update failed:", e)
      );
      return next;
    });
  }, []);

  const reorderPins = useCallback((next: PinEntry[]) => {
    setPins(next);
    void persist({ version: 1, pins: next }).catch((e) =>
      console.error("[sidebar-pins] reorder failed:", e)
    );
  }, []);

  return { pins, loading, addPin, removePin, updatePin, reorderPins };
}
```

- [ ] **Step A3.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step A3.3: Commit**

```bash
git add src/lib/hooks/useSidebarPins.ts
git commit -m "feat(hooks): useSidebarPins — optimistic pins state + API sync

Hydrates from GET /api/settings/sidebar on mount, then wraps every
mutation (add / remove / update / reorder) in an optimistic setPins
+ background PUT. On persist failure: logs and refetches to recover
the canonical state.

Returns { pins, loading, addPin, removePin, updatePin, reorderPins }
for consumers in Sidebar + PinDialog + VaultDrawer.
"
```

---

### Task A4: PinDialog

**Files:**
- Create: `src/components/sidebar/PinDialog.tsx`

- [ ] **Step A4.1: Write the dialog component**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PinIcon, PIN_ICON_NAMES } from "@/components/ui/PinIcon";
import type { PinEntry, PinIconName } from "@/lib/settings";

interface Props {
  open: boolean;
  /** Initial values when editing an existing pin. Omit to create. */
  initial?: Partial<Pick<PinEntry, "label" | "path" | "icon">>;
  onClose: () => void;
  onSave: (values: { label: string; path: string; icon: PinIconName }) => void;
}

export function PinDialog({ open, initial, onClose, onSave }: Props) {
  const [path, setPath] = useState(initial?.path ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [icon, setIcon] = useState<PinIconName>(initial?.icon ?? "folder");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [labelTouched, setLabelTouched] = useState(!!initial?.label);
  const pathRef = useRef<HTMLInputElement>(null);

  // Reset state on open.
  useEffect(() => {
    if (!open) return;
    setPath(initial?.path ?? "");
    setLabel(initial?.label ?? "");
    setIcon(initial?.icon ?? "folder");
    setLabelTouched(!!initial?.label);
    setTimeout(() => pathRef.current?.focus(), 10);
  }, [open, initial]);

  // Auto-prefill label from path's last segment until the user edits it.
  useEffect(() => {
    if (labelTouched) return;
    const last = path.split("/").filter(Boolean).pop() ?? "";
    setLabel(last.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
  }, [path, labelTouched]);

  // Folder autocomplete.
  useEffect(() => {
    if (!open) return;
    const q = path.trim();
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/vault/folders?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const body = await res.json();
        setSuggestions(body.folders ?? []);
      } catch { /* aborted */ }
    })();
    return () => ctrl.abort();
  }, [path, open]);

  const canSave = useMemo(() => path.trim().length > 0 && label.trim().length > 0, [path, label]);

  const handleSave = useCallback(() => {
    if (!canSave) return;
    onSave({ label: label.trim(), path: path.trim().replace(/^\/+|\/+$/g, ""), icon });
    onClose();
  }, [canSave, label, path, icon, onSave, onClose]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={onClose}
            className="fixed inset-0 z-[400]"
            style={{ background: "color-mix(in srgb, var(--bg-marketing) 60%, transparent)", backdropFilter: "blur(6px)" }}
          />
          <motion.div
            role="dialog"
            aria-label="Add pinned section"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed left-1/2 top-[20vh] -translate-x-1/2 z-[401] w-[440px] max-w-[calc(100vw-32px)] flex flex-col"
            style={{
              borderRadius: "var(--radius-panel)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-standard)",
              boxShadow: "var(--shadow-dialog)",
              padding: 20,
              gap: 16,
            }}
          >
            <h2 className="heading-3" style={{ margin: 0, color: "var(--text-primary)" }}>
              {initial?.path ? "Edit pin" : "Add pinned section"}
            </h2>

            {/* Path */}
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.04em" }}>Path</span>
              <input
                ref={pathRef}
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) { e.preventDefault(); handleSave(); } }}
                placeholder="wiki/projects"
                className="focus-ring"
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--radius-comfortable)",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-standard)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                  outline: "none",
                }}
              />
              {suggestions.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 100, overflowY: "auto" }}>
                  {suggestions.slice(0, 10).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setPath(f)}
                      className="focus-ring mono-label"
                      style={{
                        padding: "2px 6px",
                        borderRadius: "var(--radius-small)",
                        border: "1px solid var(--border-subtle)",
                        background: "var(--bg-surface-alpha-2)",
                        color: "var(--text-tertiary)",
                        cursor: "pointer",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </label>

            {/* Label */}
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.04em" }}>Label</span>
              <input
                type="text"
                value={label}
                onChange={(e) => { setLabel(e.target.value); setLabelTouched(true); }}
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) { e.preventDefault(); handleSave(); } }}
                placeholder="Research"
                className="focus-ring"
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--radius-comfortable)",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-standard)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </label>

            {/* Icon grid */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.04em" }}>Icon</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
                {PIN_ICON_NAMES.map((n) => {
                  const selected = n === icon;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setIcon(n)}
                      aria-label={n}
                      className="focus-ring"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        height: 32,
                        borderRadius: "var(--radius-small)",
                        background: selected ? "color-mix(in srgb, var(--accent-brand) 20%, transparent)" : "transparent",
                        border: `1px solid ${selected ? "var(--accent-brand)" : "var(--border-subtle)"}`,
                        color: selected ? "var(--accent-brand)" : "var(--text-tertiary)",
                        cursor: "pointer",
                        transition: "background var(--motion-hover) var(--ease-default), color var(--motion-hover) var(--ease-default)",
                      }}
                    >
                      <PinIcon name={n} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={onClose}
                className="focus-ring"
                style={{
                  padding: "8px 14px",
                  borderRadius: "var(--radius-comfortable)",
                  background: "transparent",
                  border: "1px solid var(--border-standard)",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="focus-ring"
                style={{
                  padding: "8px 14px",
                  borderRadius: "var(--radius-comfortable)",
                  background: canSave ? "var(--accent-brand)" : "var(--bg-surface-alpha-5)",
                  border: "none",
                  color: canSave ? "var(--text-on-brand)" : "var(--text-tertiary)",
                  fontSize: 13,
                  fontWeight: 510,
                  cursor: canSave ? "pointer" : "default",
                  opacity: canSave ? 1 : 0.6,
                }}
              >
                {initial?.path ? "Save" : "Add"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step A4.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step A4.3: Commit**

```bash
git add src/components/sidebar/PinDialog.tsx
git commit -m "feat(sidebar): PinDialog — path autocomplete + label + icon grid

Modal with Esc-to-close. Three fields:
  Path  - text input; queries /api/vault/folders?q= on change;
          suggestion chips below the field (click to fill).
  Label - text input; auto-prefilled from path's last segment
          (Title Cased), stops auto-updating once user edits it.
  Icon  - 6-column grid of all 12 PinIcons; selected item gets a
          brand-tinted fill + ring.

Cancel / Save buttons bottom-right. Enter in either text field
saves when both are populated.
"
```

---

### Task A5: Sidebar integration — Pinned group + ✕ hover-remove + click-to-scope

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Context to read before editing:** look at the existing `Recent` group in `Sidebar.tsx` (lines ~270–330 in the current file) — the new `Pinned` group copies its structure: heading row with right-aligned mini-button, list of `.app-row` entries, hover-revealed ✕.

- [ ] **Step A5.1: Extend Sidebar props**

Modify the `SidebarProps` interface (top of file, look for `export interface SidebarProps`). Add one prop:

```ts
  /** Called when a pinned folder is clicked. Consumer opens the VaultDrawer scoped to path. */
  onOpenPin?: (path: string) => void;
```

Also extend the function signature below it to destructure `onOpenPin`.

- [ ] **Step A5.2: Import the pin machinery**

Add to the top of `Sidebar.tsx` (after existing imports):

```ts
import { useState } from "react";
import { useSidebarPins } from "@/lib/hooks/useSidebarPins";
import { PinIcon } from "@/components/ui/PinIcon";
import { PinDialog } from "@/components/sidebar/PinDialog";
import type { PinEntry } from "@/lib/settings";
```

- [ ] **Step A5.3: Wire the hook + dialog state inside the component**

Inside `Sidebar` (after `const vault = useVault();`):

```ts
  const { pins, addPin, removePin, updatePin } = useSidebarPins();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPin, setEditingPin] = useState<PinEntry | null>(null);
```

- [ ] **Step A5.4: Render the Pinned group**

Find the `Recent` group (search for `{recentQueries.length > 0 && (` in the file). Insert the Pinned group **above** the Recent group. Full JSX:

```tsx
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
            title="Add pinned section"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-quaternary)",
              cursor: "pointer",
              padding: "2px 6px",
              borderRadius: "var(--radius-small)",
              transition: "color var(--motion-hover) var(--ease-default)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-quaternary)"; }}
          >
            <span className="mono-label" style={{ letterSpacing: "0.04em" }}>+ Add</span>
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {pins.map((pin) => (
            <PinnedRow
              key={pin.id}
              pin={pin}
              onOpen={() => onOpenPin?.(pin.path)}
              onEdit={() => { setEditingPin(pin); setDialogOpen(true); }}
              onRemove={() => removePin(pin.id)}
            />
          ))}
        </div>
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
```

- [ ] **Step A5.5: Add the `PinnedRow` subcomponent**

Add at the bottom of `Sidebar.tsx`, after the existing `RecentRow` function:

```tsx
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
      className="focus-ring app-row rounded-[6px] cursor-pointer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: "var(--row-h-dense)",
        padding: "0 4px 0 12px",
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
```

Note: this reuses the existing `.recent-remove` CSS class from `globals.css` for hover-reveal behavior — no new CSS needed.

- [ ] **Step A5.6: Thread `onOpenPin` through AppShell (no-op for now)**

Modify `src/components/AppShell.tsx` — find where `<Sidebar ... />` is rendered. Add the prop:

```tsx
onOpenPin={(path) => {
  // Wired in Task A6 (VaultDrawer scoping). For now, just open the drawer.
  setVaultDrawerOpen(true);
  setDrawerScopedPath(path);
}}
```

You'll also need to add the scoped-path state:

```ts
const [drawerScopedPath, setDrawerScopedPath] = useState<string | null>(null);
```

And in the `VaultDrawer` render block, thread the prop (the VaultDrawer change happens in A6 — for now just add the prop; VaultDrawer will ignore it):

```tsx
<VaultDrawer
  open={vaultDrawerOpen}
  onClose={() => { setVaultDrawerOpen(false); setDrawerScopedPath(null); }}
  scopedPath={drawerScopedPath ?? undefined}
  onNavigate={(query) => { ... existing ... }}
  onOpenFile={(path) => { ... existing ... }}
/>
```

Don't change VaultDrawer itself in this task — just thread the prop.

- [ ] **Step A5.7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: clean. If VaultDrawer errors because `scopedPath` isn't a declared prop, temporarily suppress the TS error by deleting the `scopedPath={...}` line and re-adding it in Task A6 — but the clean path is to just ship the VaultDrawer prop addition together in one subtask within A5. Decision: add a NON-FAILING optional prop to VaultDrawer's interface here so this step is TS-clean without implementing the drawer scoping logic (that lands in A6). Add to `VaultDrawer.tsx`'s `VaultDrawerProps`:

```ts
  /** When set, drawer renders rooted at this folder. Wired in Task A6. */
  scopedPath?: string;
```

Destructure it in the function signature but don't use it yet.

- [ ] **Step A5.8: Verify in the browser**

With `npm run dev` running:
1. Visit `http://localhost:3000/browse`.
2. Sidebar should show a "Pinned" header with a `+ Add` button.
3. Click `+ Add` → dialog opens. Type `wiki/projects` in Path. Label auto-prefills to `Projects`. Pick the `rocket` icon. Click Add.
4. Pin appears in the sidebar.
5. Reload browser → pin persists (proves API round-trip + vault write).
6. Hover the pin → ✕ appears on the right. Click ✕ → pin is removed and persists.
7. Click the pin → VaultDrawer opens (will still show full vault until A6).

- [ ] **Step A5.9: Commit**

```bash
git add src/components/Sidebar.tsx src/components/AppShell.tsx src/components/VaultDrawer.tsx
git commit -m "feat(sidebar): Pinned group wiring — +Add dialog, click, hover-remove

New Pinned group above Recent. +Add opens PinDialog; save calls
useSidebarPins.addPin. Each pin is a PinnedRow: PinIcon + label
+ hover-revealed ✕ (reuses .recent-remove CSS for hover reveal).
Double-click opens the dialog in edit mode.

AppShell threads onOpenPin -> setDrawerScopedPath + open drawer;
VaultDrawer gains optional scopedPath prop (no-op this task,
wired in the next).
"
```

---

### Task A6: VaultDrawer scoping + hover-to-pin on folder rows

**Files:**
- Modify: `src/components/VaultDrawer.tsx`

**Context to read:** skim `VaultDrawer.tsx` end-to-end before editing. It currently renders sections fetched from `/api/vault/structure`. The scope restriction means: when `scopedPath` is set, show ONLY items whose path starts with `scopedPath + "/"` or equals `scopedPath`.

- [ ] **Step A6.1: Apply the scope filter**

Inside the rendering logic where `sections` or `items` are mapped, wrap the iteration in a filter. Add this helper near the top of the component body:

```ts
const isInScope = (itemPath: string): boolean => {
  if (!scopedPath) return true;
  return itemPath === scopedPath || itemPath.startsWith(scopedPath + "/");
};
```

Apply `.filter((item) => isInScope(item.path))` to every section's `items` array before rendering. If a section ends up with zero items after filtering, skip the whole section.

- [ ] **Step A6.2: Add the breadcrumb strip when scoped**

At the top of the drawer's content area (above the sections list, below the drawer header), render conditionally:

```tsx
{scopedPath && (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 16px",
      borderBottom: "1px solid var(--border-subtle)",
      background: "var(--bg-surface-alpha-2)",
    }}
  >
    <button
      type="button"
      onClick={() => onClearScope?.()}
      className="focus-ring mono-label"
      style={{
        background: "transparent",
        border: "none",
        color: "var(--accent-brand)",
        cursor: "pointer",
        padding: 0,
        letterSpacing: "0.04em",
      }}
    >
      ← All folders
    </button>
    <span className="mono-label" style={{ color: "var(--text-quaternary)" }}>·</span>
    <span className="caption" style={{ color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {scopedPath}
    </span>
  </div>
)}
```

Add the `onClearScope?: () => void` prop to the interface.

- [ ] **Step A6.3: Add hover-to-pin on folder rows**

Locate the folder-row render (where a directory-like item is shown). Add a `PinButton` beside the folder name, hover-revealed via the same `.recent-remove` CSS class pattern used on pins/recents. Only show when `onPinFolder` prop is provided.

Add the prop to `VaultDrawerProps`:

```ts
  /** When set, folders show a hover-revealed pin icon that calls this. */
  onPinFolder?: (path: string, label: string) => void;
```

Inside the folder-row JSX, beside the folder name (end of the row), add:

```tsx
{onPinFolder && item.isFolder && (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onPinFolder(item.path, item.name);
    }}
    aria-label={`Pin ${item.name}`}
    title="Pin to sidebar"
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
      <path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
    </svg>
  </button>
)}
```

If the existing VaultDrawer item model doesn't expose an `isFolder` field, derive it inline (e.g. `!item.path.toLowerCase().endsWith(".md")`).

- [ ] **Step A6.4: Thread the two new props from AppShell**

In `src/components/AppShell.tsx`, add the `onClearScope` and `onPinFolder` props to the `<VaultDrawer>` call. Pull `addPin` from `useSidebarPins` at the AppShell level:

```tsx
import { useSidebarPins } from "@/lib/hooks/useSidebarPins";

// inside the component:
const { addPin } = useSidebarPins();
```

Then on the drawer:

```tsx
<VaultDrawer
  open={vaultDrawerOpen}
  scopedPath={drawerScopedPath ?? undefined}
  onClose={() => { setVaultDrawerOpen(false); setDrawerScopedPath(null); }}
  onClearScope={() => setDrawerScopedPath(null)}
  onPinFolder={(path, label) => addPin({ path, label, icon: "folder" })}
  onNavigate={(query) => { /* existing */ }}
  onOpenFile={(path) => { /* existing */ }}
/>
```

Since `useSidebarPins` will now be called in BOTH AppShell and Sidebar, that's fine — they're independent instances listening to the same API. On add in either one, the other refetches on next mount. If you want them in lockstep without page reload, hoist the hook into a context later; not needed for this task.

- [ ] **Step A6.5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step A6.6: Verify in the browser**

1. Click a pinned folder in the sidebar → drawer opens, ONLY shows items within that folder, breadcrumb at top reads `← All folders · <path>`.
2. Click `← All folders` → drawer shows the full vault.
3. Open the drawer (via the Browse button), hover any folder row → a pin icon appears at the right.
4. Click the pin icon → sidebar gains a new pinned entry labeled after the folder, icon `folder`. Refresh and confirm persistence.

- [ ] **Step A6.7: Commit**

```bash
git add src/components/VaultDrawer.tsx src/components/AppShell.tsx
git commit -m "feat(drawer): scopedPath + hover-to-pin on folder rows

VaultDrawer accepts scopedPath + onClearScope props. When scoped,
every section filters its items to those under that path, sections
with zero items are skipped, and a breadcrumb strip reads
'← All folders · <path>' at the top.

Folder rows show a hover-revealed pin icon when onPinFolder is
wired. Clicking it adds a default pin (icon=folder, label=basename)
via useSidebarPins.addPin. AppShell wires both props so pinned
clicks and hover-pin both work end-to-end.
"
```

---

### Task A7: Drag reorder + inline rename

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step A7.1: Add Reorder imports**

Add to the existing framer-motion import at the top of `Sidebar.tsx`. If framer-motion isn't imported yet, add:

```ts
import { Reorder } from "framer-motion";
```

- [ ] **Step A7.2: Wrap the pins list in `Reorder.Group`**

Replace the inner pin list in the Pinned group:

```tsx
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
```

Also pull `reorderPins` from the hook call:

```ts
const { pins, addPin, removePin, updatePin, reorderPins } = useSidebarPins();
```

- [ ] **Step A7.3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step A7.4: Verify in the browser**

1. With ≥2 pins in the sidebar, click-and-drag one up or down — it should reorder visually.
2. Release → order persists to `sidebar.json`. Refresh → new order holds.
3. Double-click a pin's label → PinDialog opens in edit mode with the current values populated. Change label + icon → Save. Confirm the row updates.

- [ ] **Step A7.5: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(sidebar): drag-reorder pins + double-click to rename

PinnedRow list wrapped in framer-motion Reorder.Group; drop calls
useSidebarPins.reorderPins, which optimistically updates state and
persists. Double-click on any pin opens the existing PinDialog in
edit mode (initial values populated); save calls updatePin.
"
```

---

## Phase A wrap-up

After Task A7, run the full smoke pass:

- [ ] **tsc clean:** `npx tsc --noEmit` → no output.
- [ ] **Build green:** `npm run build` → `✓ Compiled successfully`.
- [ ] **Routes 200:** `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/browse` → `200`. Repeat for `/chat`, `/browse/system`, `/browse/graph`.
- [ ] **Persistence round-trip:** add a pin, restart dev server, reload browser → pin persists.
- [ ] **Empty-state recovery:** delete `<vault>/.cipher/sidebar.json`, reload browser → empty Pinned group, no crash.

---

## Phase B — Open-source README + repo assets

### Task B1: README + LICENSE + CONTRIBUTING + docs/images

**Files:**
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `docs/images/.gitkeep`
- Modify: `README.md` (full rewrite)
- Modify: `.env.example` (append `CIPHER_CONFIG_PATH` note — optional, keeps existing content)

- [ ] **Step B1.1: Write `LICENSE`**

```
MIT License

Copyright (c) 2026 Stijn Hanegraaf

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step B1.2: Write `CONTRIBUTING.md`**

```markdown
# Contributing

Thanks for considering a contribution.

## Run it locally

```bash
git clone https://github.com/stijnhanegraaf/brain-frontend
cd brain-frontend
npm install
cp .env.example .env.local    # then set VAULT_PATH
npm run dev
# open http://localhost:3000
```

## Code style

- **TypeScript strict.** `npx tsc --noEmit` must be clean.
- **4px grid.** Every `padding`, `margin`, `gap`, `height`, `width` is a multiple of 4 (2 allowed as a half-step). The existing design tokens in `src/app/globals.css` (`--space-*`, `--row-h-*`, `--radius-*`, `--motion-*`) cover almost every case — reach for them first.
- **Token-driven colours.** No raw hex or rgba outside `src/app/globals.css`. Use `var(--bg-*)` / `var(--text-*)` / `var(--border-*)` / `var(--accent-*)` / `var(--status-*)`. Use `color-mix(in srgb, var(--x) N%, transparent)` for tinted fills.
- **`.app-row` on every list row.** Consistent hover rail + focus ring across the app.
- **`.focus-ring` on every interactive element.** Buttons, links, `role="button"` divs, list rows, chips.
- **Vault-agnostic.** Never hardcode a path like `wiki/...`. Use `getVaultLayout()` from `src/lib/vault-reader.ts`.

## PR checklist

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` green
- [ ] Every new interactive element carries `.focus-ring`
- [ ] Every new list row uses `.app-row`
- [ ] No raw hex / no off-grid spacing
- [ ] Screenshot attached for any UI change

## Asking questions

Open an issue — we respond quickly.

## License

By contributing you agree your code is released under the MIT license in `LICENSE`.
```

- [ ] **Step B1.3: Create docs/images placeholder**

```bash
mkdir -p docs/images
: > docs/images/.gitkeep
```

- [ ] **Step B1.4: Write the new `README.md`**

Full replacement. The file should contain:

```markdown
<h1 align="center">Cipher</h1>

<p align="center">
  An AI-native chat + dashboard interface over your Obsidian-style markdown vault.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-5e6ad2?style=flat-square" alt="MIT"></a>
  <img src="https://img.shields.io/badge/Next.js-16-000?style=flat-square&logo=next.js" alt="Next.js 16">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript" alt="TypeScript">
</p>

<p align="center">
  <img src="docs/images/chat.png" width="32%" alt="Chat"/>
  <img src="docs/images/today.png" width="32%" alt="Today"/>
  <img src="docs/images/graph.png" width="32%" alt="Graph"/>
</p>

---

## What Cipher is

Point Cipher at a folder of markdown notes. Ask it things in chat. Get bespoke pages — Today, System health, Timeline, a force-directed Graph, Entity/Topic detail — instead of wall-of-text answers. Everything reads from the files in your vault. Nothing leaves your machine.

> **Works with any Obsidian vault layout.** Cipher probes your vault's folder names (`entities`/`people`/`contacts`, `journal`/`daily`, `projects`, `research`, `work`, `system`, …) and adapts. No folder renaming required.

## Key features

- **Chat** with slash commands (`/today`, `/system`, `/graph`, …) and hover-action Copy / Regenerate
- **Today dashboard** with optimistic task check-off + undo
- **System health** — 30-day activity sparkline, 5-bucket connectivity chart, broken-link detection, stale-note detection, top hubs
- **Graph** — force-directed vault map with hub-weighted physics, orphan ring, bloom halos
- **Bespoke pages** for System, Timeline, Search, Entity, Topic — not chat chrome, real pages with breadcrumbs + deep links
- **Custom pinned sidebar** — pin any folder with a label + icon; config lives in your vault so it syncs with it
- **Linear-grade design system** — 4px grid, single token source in `globals.css`, dark + light, keyboard-first
- **Local-only** — no auth, no remote server, no telemetry

## Quick start

```bash
git clone https://github.com/stijnhanegraaf/brain-frontend
cd brain-frontend
npm install
cp .env.example .env.local    # set VAULT_PATH to your vault directory
npm run dev
# open http://localhost:3000
```

If you don't set `VAULT_PATH`, Cipher probes common locations — `~/Obsidian`, `~/Documents/Obsidian`, `~/Projects/Obsidian`, sibling `../Obsidian`. First one it finds wins.

## Point it at your vault

Cipher auto-detects folder roles by name. This table shows what it looks for:

| Role in Cipher | Your folder can be named… |
|---|---|
| Entities (people, companies, systems) | `entities`, `people`, `contacts`, or `knowledge/entities` |
| Journal (per-day notes) | `journal`, `daily`, `daily-notes` |
| Projects | `projects` or `knowledge/projects` |
| Research | `research` or `knowledge/research` |
| Work (open, waiting-for, logs, weeks) | `work` or `tasks` |
| System (status, health, open-loops) | `system` |
| Hub file | `dashboard.md`, `index.md`, `home.md`, or `README.md` at the vault root |

Folders under a `wiki/` root are auto-detected too. Anything the probe doesn't find is simply ignored — the feature that depends on it just doesn't render a section.

## Customising the sidebar

Two ways to pin a folder:

- **`+ Add` in the Pinned group** — type or pick a path, choose a label + icon, save.
- **Hover-pin in the vault drawer** — hover any folder row and click the pin icon. Defaults to the folder name; edit later via double-click.

Your pins are saved to `<vault>/.cipher/sidebar.json`. Whatever syncs your vault (Obsidian Sync, iCloud, Dropbox) syncs your pins.

<p align="center">
  <img src="docs/images/sidebar-pins.png" width="60%" alt="Sidebar pins"/>
</p>

## Project layout

```
src/
  app/                 Next.js 16 App Router routes + API endpoints
    api/               /api/query, /api/today, /api/settings/sidebar, /api/vault/*
    browse/            /browse, /browse/system, /browse/timeline, /browse/graph, …
    chat/              /chat surface
    file/[...path]/    direct file view
  components/          React components
    browse/            TodayPage, SystemPage, TimelinePage, GraphPage, …
    sidebar/           Sidebar extras (PinDialog)
    ui/                Reusable primitives (PinIcon, StatusDot, Badge, HoverCard, …)
    views/             Chat-summary renderers (ViewRenderer + per-view modes)
  lib/
    vault-reader.ts    Vault layout probe + schema-aware readers + search
    vault-health.ts    Activity / broken-links / stale-notes / hubs scanner
    vault-graph.ts     Nodes + edges builder (cached per vault)
    view-builder.ts    Intent -> typed view model
    intent-detector.ts NL -> intent classifier
    settings.ts        <vault>/.cipher/sidebar.json read/write
    today-builder.ts   Today page data aggregation
```

## Development

```bash
npm run dev          # dev server on :3000
npm run build        # production build
npm run start        # serve production build
npx tsc --noEmit     # type check
```

No test framework yet. Verification is manual + `curl` for the API routes + `grep` for token/convention compliance.

## Design language

Every colour, padding, radius, font size, and motion duration in Cipher comes from a CSS custom property defined in `src/app/globals.css`. Components reach for the tokens (`var(--accent-brand)`, `var(--row-h-cozy)`, `var(--motion-hover)`, `.app-row`, `.focus-ring`) instead of inventing their own values. This is what makes the app feel like one thing instead of assembled parts. Contributions that add new UI should stick to the existing tokens — add a new token only when no existing one fits.

## Contributing

PRs welcome. Read `CONTRIBUTING.md` for the code-style rules and PR checklist.

## License

MIT — see `LICENSE`. Your data stays on your machine; the license on your modifications is yours.
```

- [ ] **Step B1.5: Optional — append to `.env.example`**

Append (append, don't overwrite):

```
# Custom sidebar pins are stored in <vault>/.cipher/sidebar.json.
# Synced automatically with whatever syncs your vault.
```

- [ ] **Step B1.6: Verify rendering**

Open `README.md` in a Markdown preview (GitHub's web preview is the canonical target). The hero image strip should render once `docs/images/chat.png` etc. exist — empty placeholders are expected until screenshots are dropped in. Every internal link (`LICENSE`, `CONTRIBUTING.md`) should resolve.

- [ ] **Step B1.7: Commit**

```bash
git add README.md LICENSE CONTRIBUTING.md docs/images/.gitkeep .env.example
git commit -m "docs: open-source README + MIT LICENSE + CONTRIBUTING

Full README rewrite: hero strip, 30-second pitch, key features,
5-step quickstart, any-vault-layout table, sidebar customisation,
project layout, dev commands, design-language paragraph,
contributing invite, license.

LICENSE: MIT, 2026, Stijn Hanegraaf.
CONTRIBUTING: 30 lines, TypeScript-strict + 4px-grid + token-driven
rules, PR checklist, MIT contribution invite.
docs/images/.gitkeep: placeholder for the three screenshots
referenced in README.
.env.example: comment about <vault>/.cipher/sidebar.json.
"
```

---

## Final verification

After Task B1:

- [ ] `git log --oneline master..HEAD` shows 8 commits (A1..A7 + B1).
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` green.
- [ ] Every surface (`/browse`, `/chat`, `/browse/system`, `/browse/timeline`, `/browse/graph`, `/browse/search?q=test`) returns 200.
- [ ] Add, remove, reorder, edit pins all round-trip through `<vault>/.cipher/sidebar.json`.
- [ ] Click any pin → VaultDrawer opens, scoped to that folder, breadcrumb visible.
- [ ] `← All folders` breadcrumb clears the scope.
- [ ] Hover any folder in the drawer → pin icon appears → click adds to sidebar.
- [ ] Delete `<vault>/.cipher/sidebar.json` → reload → empty Pinned group, no crash.
- [ ] `README.md` renders on GitHub's preview; badges + hero strip resolve once images are added.
- [ ] `LICENSE` is present and GitHub shows "MIT" on the repo page.

## Push + merge

Once all tasks are committed and verification is green:

```bash
git push -u origin v12-sidebar-pins-readme
git checkout master
git merge --ff-only v12-sidebar-pins-readme
git push origin master
```
