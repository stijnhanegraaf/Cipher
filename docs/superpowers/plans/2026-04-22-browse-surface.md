# Browse Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the right-side `VaultDrawer` with a full-page `/files` surface: virtualized folder tree on the left, rich markdown / image / PDF preview on the right, scratch-inspired rendering (KaTeX, Mermaid, Shiki), raw↔rendered toggle, reader-preferences panel, and app-wide light/dark/system theme. Pinned folders in the sidebar become navigations into `/files/<path>`.

**Architecture:** One Next.js App Router page at `src/app/files/[[...path]]/page.tsx` renders a client component `BrowsePage` split into `FileTree` (react-arborist, lazy children via `/api/vault/tree`) and `PreviewPane` (dispatches on file extension to `MarkdownPreview` / `ImagePreview` / `PdfPreview` / `GenericPreview`). `MarkdownRenderer` is extended in place with `remark-math` + `rehype-katex` + `rehype-shiki` + a Mermaid code-block component, all lazy-loaded. Reader prefs apply as CSS variables on `.markdown-content`. Theme applies as `data-theme` on `<html>`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, react-markdown + remark-gfm (existing), react-arborist (new), remark-math + rehype-katex + katex (new), mermaid (new, dynamic), rehype-shiki + shiki (new), @codemirror/lang-markdown + @codemirror/view + @codemirror/state (new, dynamic). No test framework in repo — verification is manual via `npm run dev` and targeted `curl`/browser checks.

---

## File structure

**New files**

- `src/app/files/[[...path]]/page.tsx` — App Router entry; reads path + `?file=`, renders `<BrowsePage>`.
- `src/components/browse/BrowsePage.tsx` — client layout: resizable tree + preview.
- `src/components/browse/FileTree.tsx` — `react-arborist` wrapper, lazy children, filter input, keyboard.
- `src/components/browse/PreviewPane.tsx` — dispatches to sub-previews by extension.
- `src/components/browse/PreviewHeader.tsx` — breadcrumb, filename, Open-full-view, Pin, Source-toggle, Reader-settings.
- `src/components/browse/MarkdownPreview.tsx` — calls `MarkdownRenderer`, wraps it in `React.memo`, applies reader-pref class.
- `src/components/browse/ImagePreview.tsx` — zoomable image.
- `src/components/browse/PdfPreview.tsx` — iframe.
- `src/components/browse/GenericPreview.tsx` — card with reveal / download.
- `src/components/browse/FolderGridPreview.tsx` — empty-state cards grid.
- `src/components/browse/SourceView.tsx` — read-only CodeMirror 6, dynamically imported.
- `src/components/browse/ReaderSettingsPanel.tsx` — popover with typography controls.
- `src/components/browse/ThemeToggle.tsx` — Light/Dark/System segmented control.
- `src/lib/browse/vault-tree-client.ts` — typed fetcher for `/api/vault/tree` + in-memory cache.
- `src/lib/browse/reader-prefs.ts` — typed read/write of `cipher.reader-prefs.v1`.
- `src/lib/browse/theme.ts` — typed read/write of `cipher.theme.v1`, system listener.
- `src/lib/browse/path.ts` — `encodeVaultPath` / `decodeVaultPath` helpers.
- `src/lib/browse/file-kind.ts` — ext → kind classifier (`md` / `image` / `pdf` / `other`).
- `src/lib/browse/icon-for-file.ts` — glyph per file kind.
- `src/app/api/vault/tree/route.ts` — `GET` direct children of a folder.
- `src/app/api/vault/asset/route.ts` — `GET` raw bytes; `?download=1` attaches.
- `src/app/api/vault/reveal/route.ts` — `POST` to `open -R` on macOS.

**Modified files**

- `src/components/ui/MarkdownRenderer.tsx` — add math, mermaid, shiki, figure, vault-path image resolution, heading copy-link.
- `src/components/Sidebar.tsx` — pin click = `router.push('/files/<path>')`; remove drawer opener.
- `src/components/AppShell.tsx` — remove `vaultDrawerOpen` / `drawerScopedPath` state + the `<VaultDrawer />` render; remove palette `nav-drawer` action; remove `onBrowse` wiring.
- `src/components/VaultDrawer.tsx` — deleted.
- `src/app/api/vault/structure/route.ts` — deleted.
- `src/app/layout.tsx` (or wherever `<html>` is rendered) — theme bootstrap script so the initial paint has the right `data-theme`.
- `src/app/globals.css` — reader-pref CSS variables on `.markdown-content`; KaTeX + Shiki theme imports behind `data-theme` selectors.
- `package.json` — new dependencies.

---

## Task 0: Optional — install deps up front

All dependency installs are grouped here so the rest of the tasks stay focused on code.

- [ ] **Step 1: Add dependencies**

```bash
npm install react-arborist remark-math rehype-katex katex mermaid rehype-shiki shiki
npm install --save-dev @types/katex
```

- [ ] **Step 2: Add CodeMirror (for source view, Task 14)**

```bash
npm install @codemirror/state @codemirror/view @codemirror/commands @codemirror/lang-markdown @codemirror/theme-one-dark
```

- [ ] **Step 3: Verify `npm run build` still succeeds**

```bash
npm run build
```

Expected: build succeeds; no new warnings other than "large dependency" which is fine.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(browse): add deps for tree, math, mermaid, shiki, codemirror"
```

---

## Task 1: `GET /api/vault/tree` endpoint

**Files:**

- Create: `src/app/api/vault/tree/route.ts`

- [ ] **Step 1: Implement the route**

```ts
// src/app/api/vault/tree/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { join, extname } from "path";
import { getVaultPath } from "@/lib/vault-reader";

interface TreeChild {
  name: string;
  path: string;          // vault-relative, forward-slash
  type: "folder" | "file";
  ext: string;           // "" for folders
  size: number;          // 0 for folders
  mtime: number;         // ms since epoch
}

const CACHE = new Map<string, { at: number; data: TreeChild[] }>();
const TTL_MS = 30_000;

function safeJoin(root: string, rel: string): string | null {
  const abs = join(root, rel);
  const normalisedRoot = root.endsWith("/") ? root : root + "/";
  if (abs !== root && !abs.startsWith(normalisedRoot)) return null;
  return abs;
}

export async function GET(req: NextRequest) {
  const root = getVaultPath();
  if (!root) return NextResponse.json({ error: "no vault" }, { status: 404 });
  const rel = (req.nextUrl.searchParams.get("path") ?? "").replace(/^\/+/, "");
  const abs = safeJoin(root, rel);
  if (!abs) return NextResponse.json({ error: "path escapes vault" }, { status: 400 });

  const cacheKey = `${root}::${rel}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json({ path: rel, children: cached.data });
  }

  let entries;
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const children: TreeChild[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const childAbs = join(abs, e.name);
    let s;
    try { s = await stat(childAbs); } catch { continue; }
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    children.push({
      name: e.name,
      path: childRel,
      type: e.isDirectory() ? "folder" : "file",
      ext: e.isDirectory() ? "" : extname(e.name).toLowerCase().replace(/^\./, ""),
      size: e.isDirectory() ? 0 : s.size,
      mtime: s.mtimeMs,
    });
  }

  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  CACHE.set(cacheKey, { at: Date.now(), data: children });
  return NextResponse.json({ path: rel, children });
}

export function invalidateVaultTreeCache() {
  CACHE.clear();
}
```

- [ ] **Step 2: Wire cache invalidation on writes**

In `src/app/api/file/route.ts` inside the existing `PUT` handler, after a successful write call the invalidator:

```ts
// at top of file, add:
import { invalidateVaultTreeCache } from "@/app/api/vault/tree/route";
// after successful write, before returning the response:
invalidateVaultTreeCache();
```

- [ ] **Step 3: Manual verification**

```bash
npm run dev
# in another terminal:
curl -s 'http://localhost:3000/api/vault/tree' | jq .
curl -s 'http://localhost:3000/api/vault/tree?path=projects' | jq '.children | length'
```

Expected: root returns folders-first alpha. `projects` returns its direct children only (no recursion). Unknown paths return 404.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/vault/tree/route.ts src/app/api/file/route.ts
git commit -m "feat(browse): GET /api/vault/tree for lazy folder children"
```

---

## Task 2: `GET /api/vault/asset` endpoint

**Files:**

- Create: `src/app/api/vault/asset/route.ts`

- [ ] **Step 1: Implement the route**

```ts
// src/app/api/vault/asset/route.ts
import { NextRequest } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { join, extname, basename } from "path";
import { getVaultPath } from "@/lib/vault-reader";

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", svg: "image/svg+xml", avif: "image/avif",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8", md: "text/markdown; charset=utf-8",
  json: "application/json; charset=utf-8", csv: "text/csv; charset=utf-8",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};

function safeJoin(root: string, rel: string): string | null {
  const abs = join(root, rel);
  const normalisedRoot = root.endsWith("/") ? root : root + "/";
  if (abs !== root && !abs.startsWith(normalisedRoot)) return null;
  return abs;
}

export async function GET(req: NextRequest) {
  const root = getVaultPath();
  if (!root) return new Response("no vault", { status: 404 });
  const rel = (req.nextUrl.searchParams.get("path") ?? "").replace(/^\/+/, "");
  const abs = safeJoin(root, rel);
  if (!abs) return new Response("path escapes vault", { status: 400 });

  let s;
  try { s = await stat(abs); } catch { return new Response("not found", { status: 404 }); }
  if (!s.isFile()) return new Response("not a file", { status: 400 });

  const ext = extname(abs).toLowerCase().replace(/^\./, "");
  const mime = MIME[ext] ?? "application/octet-stream";
  const download = req.nextUrl.searchParams.get("download") === "1";

  const stream = createReadStream(abs);
  // @ts-expect-error — Node readable stream accepted by the Web fetch Response.
  const body = stream;
  return new Response(body, {
    headers: {
      "content-type": mime,
      "content-length": String(s.size),
      "cache-control": "private, max-age=60",
      ...(download ? { "content-disposition": `attachment; filename="${basename(abs)}"` } : {}),
    },
  });
}
```

- [ ] **Step 2: Manual verification**

```bash
# pick a real image in your vault
curl -sI 'http://localhost:3000/api/vault/asset?path=projects/screenshot.png' | head
curl -s 'http://localhost:3000/api/vault/asset?path=does/not/exist' -o /dev/null -w '%{http_code}\n'
```

Expected: first call returns `200` with `content-type: image/png`. Missing path returns `404`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/vault/asset/route.ts
git commit -m "feat(browse): GET /api/vault/asset for raw binary streaming"
```

---

## Task 3: `POST /api/vault/reveal` endpoint

**Files:**

- Create: `src/app/api/vault/reveal/route.ts`

- [ ] **Step 1: Implement the route**

```ts
// src/app/api/vault/reveal/route.ts
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { stat } from "fs/promises";
import { join } from "path";
import { getVaultPath } from "@/lib/vault-reader";

function safeJoin(root: string, rel: string): string | null {
  const abs = join(root, rel);
  const normalisedRoot = root.endsWith("/") ? root : root + "/";
  if (abs !== root && !abs.startsWith(normalisedRoot)) return null;
  return abs;
}

export async function POST(req: NextRequest) {
  if (process.platform !== "darwin") {
    return NextResponse.json({ error: "reveal only supported on macOS" }, { status: 501 });
  }
  const root = getVaultPath();
  if (!root) return NextResponse.json({ error: "no vault" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { path?: string };
  const rel = (body.path ?? "").replace(/^\/+/, "");
  const abs = safeJoin(root, rel);
  if (!abs) return NextResponse.json({ error: "path escapes vault" }, { status: 400 });

  try { await stat(abs); } catch { return NextResponse.json({ error: "not found" }, { status: 404 }); }

  spawn("open", ["-R", abs], { detached: true, stdio: "ignore" }).unref();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Manual verification**

```bash
curl -s -XPOST 'http://localhost:3000/api/vault/reveal' \
  -H 'content-type: application/json' \
  -d '{"path":"projects"}'
```

Expected (macOS): Finder opens to the vault and highlights `projects`. Response `{"ok":true}`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/vault/reveal/route.ts
git commit -m "feat(browse): POST /api/vault/reveal (macOS Finder)"
```

---

## Task 4: Path + file-kind helpers

**Files:**

- Create: `src/lib/browse/path.ts`
- Create: `src/lib/browse/file-kind.ts`
- Create: `src/lib/browse/icon-for-file.ts`

- [ ] **Step 1: Path helpers**

```ts
// src/lib/browse/path.ts
/** Encode a vault-relative path for use in /files/<...path> URLs. */
export function encodeVaultPath(path: string): string {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

/** Decode a Next.js catch-all [[...path]] param back to a vault-relative path. */
export function decodeVaultPath(segments: string[] | undefined): string {
  if (!segments || segments.length === 0) return "";
  return segments.map(decodeURIComponent).join("/");
}

/** Split a vault path into breadcrumb items: [{ name, path }]. Root returns []. */
export function breadcrumbsFor(path: string): { name: string; path: string }[] {
  if (!path) return [];
  const parts = path.split("/");
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join("/") }));
}
```

- [ ] **Step 2: File kind**

```ts
// src/lib/browse/file-kind.ts
export type FileKind = "md" | "image" | "pdf" | "other";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "avif"]);

export function fileKindForExt(ext: string): FileKind {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "md" || e === "markdown") return "md";
  if (IMAGE_EXTS.has(e)) return "image";
  if (e === "pdf") return "pdf";
  return "other";
}
```

- [ ] **Step 3: Icon glyph**

```ts
// src/lib/browse/icon-for-file.ts
import type { FileKind } from "./file-kind";

export function iconForFileKind(kind: FileKind): string {
  switch (kind) {
    case "md": return "📄";
    case "image": return "🖼";
    case "pdf": return "📕";
    case "other": return "📎";
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/browse
git commit -m "feat(browse): path + file-kind + icon helpers"
```

---

## Task 5: Tree client with in-memory cache

**Files:**

- Create: `src/lib/browse/vault-tree-client.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/browse/vault-tree-client.ts
"use client";

export interface TreeChild {
  name: string;
  path: string;
  type: "folder" | "file";
  ext: string;
  size: number;
  mtime: number;
}

const cache = new Map<string, Promise<TreeChild[]>>();

export async function fetchChildren(path: string): Promise<TreeChild[]> {
  const key = path;
  if (cache.has(key)) return cache.get(key)!;
  const p = (async () => {
    const url = path
      ? `/api/vault/tree?path=${encodeURIComponent(path)}`
      : `/api/vault/tree`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`vault/tree ${res.status}`);
    const json = (await res.json()) as { children: TreeChild[] };
    return json.children;
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

export function invalidateTreeCache(path?: string) {
  if (path === undefined) cache.clear();
  else cache.delete(path);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/browse/vault-tree-client.ts
git commit -m "feat(browse): client-side tree fetcher with per-path memoization"
```

---

## Task 6: Browse page route skeleton

**Files:**

- Create: `src/app/files/[[...path]]/page.tsx`
- Create: `src/components/browse/BrowsePage.tsx` (minimal stub — tree + preview filled in later tasks)

- [ ] **Step 1: Route**

```tsx
// src/app/files/[[...path]]/page.tsx
import { BrowsePage } from "@/components/browse/BrowsePage";
import { decodeVaultPath } from "@/lib/browse/path";

export default async function BrowseRoute({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<{ file?: string }>;
}) {
  const p = await params;
  const s = await searchParams;
  const folderPath = decodeVaultPath(p.path);
  const filePath = s.file ? decodeURIComponent(s.file) : null;
  return <BrowsePage folderPath={folderPath} filePath={filePath} />;
}
```

- [ ] **Step 2: Client stub**

```tsx
// src/components/browse/BrowsePage.tsx
"use client";

import { useState } from "react";

interface Props { folderPath: string; filePath: string | null }

export function BrowsePage({ folderPath, filePath }: Props) {
  const [treeWidth, setTreeWidth] = useState(280);
  return (
    <div style={{ display: "flex", height: "100dvh", minWidth: 0 }}>
      <aside style={{ width: treeWidth, borderRight: "1px solid var(--border-subtle)", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ padding: 12, fontSize: 12, color: "var(--text-tertiary)" }}>
          Tree for: {folderPath || "(root)"}
        </div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <div style={{ padding: 16 }}>Preview: {filePath ?? "(no file)"}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Open `http://localhost:3000/browse`, `http://localhost:3000/files/projects`, `http://localhost:3000/files/projects?file=projects/notes.md`. All three should render the stub with the right strings.

- [ ] **Step 4: Commit**

```bash
git add src/app/browse src/components/browse/BrowsePage.tsx
git commit -m "feat(browse): route skeleton for /browse and /files/<path>"
```

---

## Task 7: Virtualized FileTree (react-arborist)

**Files:**

- Create: `src/components/browse/FileTree.tsx`
- Modify: `src/components/browse/BrowsePage.tsx`

- [ ] **Step 1: Implement the tree**

```tsx
// src/components/browse/FileTree.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tree, NodeApi, type NodeRendererProps } from "react-arborist";
import { fetchChildren, type TreeChild } from "@/lib/browse/vault-tree-client";
import { fileKindForExt } from "@/lib/browse/file-kind";
import { iconForFileKind } from "@/lib/browse/icon-for-file";

interface NodeData {
  id: string;                 // same as path, or "" for root virtual node
  name: string;
  path: string;
  type: "folder" | "file";
  ext: string;
  children?: NodeData[];      // undefined = unloaded folder; [] = empty; array = loaded
}

function toNode(c: TreeChild): NodeData {
  return {
    id: c.path || "(root)",
    name: c.name,
    path: c.path,
    type: c.type,
    ext: c.ext,
    children: c.type === "folder" ? undefined : undefined,
  };
}

interface Props {
  initialPath: string;
  selectedFilePath: string | null;
  expandState: Record<string, boolean>;
  onExpandChange: (next: Record<string, boolean>) => void;
  onSelectFile: (path: string) => void;
  onSelectFolder: (path: string) => void;
  width: number;
  height: number;
}

export function FileTree({
  initialPath,
  selectedFilePath,
  expandState,
  onExpandChange,
  onSelectFile,
  onSelectFolder,
  width,
  height,
}: Props) {
  const [roots, setRoots] = useState<NodeData[]>([]);
  const [filter, setFilter] = useState("");
  const treeRef = useRef<any>(null);

  // Load root children.
  useEffect(() => {
    let alive = true;
    fetchChildren(initialPath).then((kids) => {
      if (!alive) return;
      setRoots(kids.map(toNode));
    }).catch(() => setRoots([]));
    return () => { alive = false; };
  }, [initialPath]);

  const loadChildren = useCallback(async (node: NodeData): Promise<NodeData[]> => {
    const kids = await fetchChildren(node.path);
    return kids.map(toNode);
  }, []);

  const onToggle = useCallback(async (id: string) => {
    // react-arborist's controlled toggle: load children if unloaded.
    const node = findNode(roots, id);
    if (!node) return;
    if (node.type === "folder" && node.children === undefined) {
      const kids = await loadChildren(node);
      setRoots((prev) => replaceNode(prev, id, (n) => ({ ...n, children: kids })));
    }
    onExpandChange({ ...expandState, [id]: !expandState[id] });
  }, [roots, expandState, onExpandChange, loadChildren]);

  const [debouncedFilter, setDebouncedFilter] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filter), 80);
    return () => clearTimeout(t);
  }, [filter]);

  const filtered = useMemo(() => {
    if (!debouncedFilter.trim()) return roots;
    const needle = debouncedFilter.trim().toLowerCase();
    return filterTree(roots, needle);
  }, [roots, debouncedFilter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: 8, borderBottom: "1px solid var(--border-subtle)" }}>
        <input
          type="text"
          placeholder="Filter…  (/)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setFilter(""); }}
          style={{
            width: "100%", height: 28, padding: "0 8px", fontSize: 12,
            borderRadius: 6, border: "1px solid var(--border-standard)",
            background: "var(--bg-surface)", color: "var(--text-primary)", outline: "none",
          }}
        />
      </div>
      <Tree<NodeData>
        ref={treeRef}
        data={filtered}
        openByDefault={false}
        width={width}
        height={height - 44}
        rowHeight={24}
        indent={16}
        selection={selectedFilePath ?? undefined}
        onToggle={onToggle}
        onSelect={(nodes: NodeApi<NodeData>[]) => {
          const n = nodes[0]; if (!n) return;
          if (n.data.type === "file") onSelectFile(n.data.path);
          else onSelectFolder(n.data.path);
        }}
      >
        {Row}
      </Tree>
    </div>
  );
}

function Row({ node, style, dragHandle }: NodeRendererProps<NodeData>) {
  const isFolder = node.data.type === "folder";
  const glyph = isFolder
    ? (node.isOpen ? "▾" : "▸")
    : iconForFileKind(fileKindForExt(node.data.ext));
  return (
    <div
      ref={dragHandle}
      style={{
        ...style,
        display: "flex", alignItems: "center", gap: 6,
        padding: "0 8px",
        cursor: "pointer",
        color: node.isSelected ? "var(--text-primary)" : "var(--text-secondary)",
        background: node.isSelected ? "var(--bg-surface-alpha-4)" : "transparent",
        fontSize: 12,
      }}
      onClick={() => { if (isFolder) node.toggle(); else node.select(); }}
    >
      <span style={{ width: 14, textAlign: "center", fontSize: 10 }}>{glyph}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.data.name}</span>
    </div>
  );
}

function findNode(nodes: NodeData[], id: string): NodeData | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const r = findNode(n.children, id);
      if (r) return r;
    }
  }
  return null;
}

function replaceNode(nodes: NodeData[], id: string, patch: (n: NodeData) => NodeData): NodeData[] {
  return nodes.map((n) => {
    if (n.id === id) return patch(n);
    if (n.children) return { ...n, children: replaceNode(n.children, id, patch) };
    return n;
  });
}

function filterTree(nodes: NodeData[], needle: string): NodeData[] {
  const out: NodeData[] = [];
  for (const n of nodes) {
    const selfMatch = n.name.toLowerCase().includes(needle);
    const kids = n.children ? filterTree(n.children, needle) : [];
    if (selfMatch || kids.length > 0) {
      out.push({ ...n, children: n.children ? kids : undefined });
    }
  }
  return out;
}
```

- [ ] **Step 2: Wire it into BrowsePage**

Replace the tree `<aside>` stub with:

```tsx
// inside BrowsePage (full replacement of aside + preview wiring for this task)
"use client";

import { useEffect, useMemo, useState } from "react";
import { FileTree } from "./FileTree";

const EXPAND_KEY = "cipher.browse.expand.v1";

export function BrowsePage({ folderPath, filePath }: { folderPath: string; filePath: string | null }) {
  const [treeWidth, setTreeWidth] = useState(280);
  const [expand, setExpand] = useState<Record<string, boolean>>({});
  const [height, setHeight] = useState(800);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPAND_KEY);
      if (raw) setExpand(JSON.parse(raw));
    } catch {}
    const measure = () => setHeight(window.innerHeight);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const persistExpand = (next: Record<string, boolean>) => {
    setExpand(next);
    try { localStorage.setItem(EXPAND_KEY, JSON.stringify(next)); } catch {}
  };

  return (
    <div style={{ display: "flex", height: "100dvh", minWidth: 0 }}>
      <aside style={{ width: treeWidth, borderRight: "1px solid var(--border-subtle)", flexShrink: 0 }}>
        <FileTree
          initialPath=""
          selectedFilePath={filePath}
          expandState={expand}
          onExpandChange={persistExpand}
          onSelectFile={(p) => {
            const url = new URL(window.location.href);
            url.searchParams.set("file", p);
            window.history.replaceState(null, "", url.toString());
          }}
          onSelectFolder={(p) => {
            const parts = p ? p.split("/").map(encodeURIComponent).join("/") : "";
            window.history.replaceState(null, "", `/files/${parts}`);
          }}
          width={treeWidth}
          height={height}
        />
      </aside>
      <main style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
        <div style={{ padding: 16 }}>Preview: {filePath ?? "(no file)"}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Visit `/files`. Root children appear, folders first, alpha. Expanding a folder fetches its children. Type into filter — non-matching rows disappear. Refresh — expand state persists.

- [ ] **Step 4: Commit**

```bash
git add src/components/browse/FileTree.tsx src/components/browse/BrowsePage.tsx
git commit -m "feat(browse): virtualized file tree with lazy children and filter"
```

---

## Task 8: Markdown preview + preview-pane dispatcher

**Files:**

- Create: `src/components/browse/PreviewPane.tsx`
- Create: `src/components/browse/MarkdownPreview.tsx`
- Create: `src/components/browse/FolderGridPreview.tsx`
- Modify: `src/components/browse/BrowsePage.tsx`

- [ ] **Step 1: Markdown preview with LRU cache**

```tsx
// src/components/browse/MarkdownPreview.tsx
"use client";

import { memo, useEffect, useState } from "react";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";

interface FileData { path: string; title: string; content: string }

// LRU cache of the last 20 loaded files. Module-scope so it survives
// component unmounts when the user flips between files in the tree.
const LRU_MAX = 20;
const lru = new Map<string, FileData>();
function lruGet(path: string): FileData | undefined {
  const v = lru.get(path);
  if (v) { lru.delete(path); lru.set(path, v); }
  return v;
}
function lruSet(path: string, data: FileData) {
  if (lru.has(path)) lru.delete(path);
  lru.set(path, data);
  while (lru.size > LRU_MAX) {
    const oldest = lru.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    lru.delete(oldest);
  }
}

export const MarkdownPreview = memo(function MarkdownPreview({ filePath }: { filePath: string }) {
  const [data, setData] = useState<FileData | null>(() => lruGet(filePath) ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const cached = lruGet(filePath);
    if (cached) { setData(cached); setError(null); return () => { alive = false; }; }
    setData(null); setError(null);
    fetch(`/api/file?path=${encodeURIComponent(filePath)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`file ${r.status}`)))
      .then((j) => {
        if (!alive) return;
        const d = j as FileData;
        lruSet(filePath, d);
        setData(d);
      })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [filePath]);

  if (error) return <div className="caption" style={{ color: "var(--status-danger, #c0392b)" }}>Couldn't load file: {error}</div>;
  if (!data) return <div className="caption" style={{ color: "var(--text-tertiary)" }}>Loading…</div>;
  return (
    <div className="markdown-content" style={{ maxWidth: "72ch", margin: "0 auto", padding: "32px 24px" }}>
      <MarkdownRenderer content={data.content} onNavigate={(p) => {
        const url = new URL(window.location.href);
        url.searchParams.set("file", p);
        window.history.replaceState(null, "", url.toString());
        window.dispatchEvent(new Event("cipher:browse-file-changed"));
      }} />
    </div>
  );
});
```

- [ ] **Step 2: Folder grid (empty state)**

```tsx
// src/components/browse/FolderGridPreview.tsx
"use client";

import { useEffect, useState } from "react";
import { fetchChildren, type TreeChild } from "@/lib/browse/vault-tree-client";
import { fileKindForExt } from "@/lib/browse/file-kind";
import { iconForFileKind } from "@/lib/browse/icon-for-file";

export function FolderGridPreview({ folderPath, onOpenFile, onOpenFolder }: {
  folderPath: string;
  onOpenFile: (p: string) => void;
  onOpenFolder: (p: string) => void;
}) {
  const [children, setChildren] = useState<TreeChild[] | null>(null);
  useEffect(() => {
    fetchChildren(folderPath).then(setChildren).catch(() => setChildren([]));
  }, [folderPath]);

  if (!children) return <div className="caption" style={{ color: "var(--text-tertiary)", padding: 24 }}>Loading…</div>;
  return (
    <div style={{ padding: 24, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
      {children.map((c) => (
        <button
          key={c.path}
          type="button"
          onClick={() => c.type === "folder" ? onOpenFolder(c.path) : onOpenFile(c.path)}
          className="focus-ring"
          style={{
            textAlign: "left", padding: 12, border: "1px solid var(--border-subtle)",
            borderRadius: 8, background: "var(--bg-surface-alpha-2)", color: "var(--text-secondary)",
            fontSize: 12, cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 18, marginBottom: 4 }}>
            {c.type === "folder" ? "📁" : iconForFileKind(fileKindForExt(c.ext))}
          </div>
          <div style={{ color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
          <div className="caption" style={{ marginTop: 4, color: "var(--text-quaternary)" }}>
            {new Date(c.mtime).toLocaleDateString()}
          </div>
        </button>
      ))}
      {children.length === 0 && (
        <div className="caption" style={{ color: "var(--text-tertiary)" }}>Empty folder.</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Preview pane dispatcher**

```tsx
// src/components/browse/PreviewPane.tsx
"use client";

import { MarkdownPreview } from "./MarkdownPreview";
import { FolderGridPreview } from "./FolderGridPreview";
import { fileKindForExt } from "@/lib/browse/file-kind";

export function PreviewPane({
  folderPath,
  filePath,
  onOpenFile,
  onOpenFolder,
}: {
  folderPath: string;
  filePath: string | null;
  onOpenFile: (p: string) => void;
  onOpenFolder: (p: string) => void;
}) {
  if (!filePath) return <FolderGridPreview folderPath={folderPath} onOpenFile={onOpenFile} onOpenFolder={onOpenFolder} />;
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const kind = fileKindForExt(ext);
  if (kind === "md") return <MarkdownPreview filePath={filePath} />;
  // image / pdf / other come in later tasks.
  return <div className="caption" style={{ padding: 24, color: "var(--text-tertiary)" }}>Preview for {ext} coming soon.</div>;
}
```

- [ ] **Step 4: Wire into BrowsePage**

In `BrowsePage.tsx`, replace the `<main>`'s inner div with `<PreviewPane folderPath={folderPath} filePath={filePath} onOpenFile={…} onOpenFolder={…} />`, passing the same handlers used by the tree.

Also track file/folder changes driven by history changes — listen for the `cipher:browse-file-changed` event and re-read `window.location` to refresh `filePath`. Or, simpler: accept `filePath` as client state driven from a custom hook instead of the server prop. For this task just re-derive from `useSearchParams()`:

```tsx
// Add near top of BrowsePage:
import { useSearchParams, usePathname } from "next/navigation";

// Inside the component, replace the `filePath` prop usage with:
const sp = useSearchParams();
const pn = usePathname();
const currentFile = sp.get("file");
const currentFolder = pn.replace(/^\/browse\/?/, "");
```

Then pass `currentFile` and `currentFolder` to `PreviewPane`.

- [ ] **Step 5: Manual verification**

Click a `.md` file in the tree. URL updates `?file=`. Preview pane renders markdown. Click a folder (without selecting a file): preview shows the folder grid.

- [ ] **Step 6: Commit**

```bash
git add src/components/browse
git commit -m "feat(browse): markdown preview + folder grid + dispatcher"
```

---

## Task 9: Image, PDF, Generic previews

**Files:**

- Create: `src/components/browse/ImagePreview.tsx`
- Create: `src/components/browse/PdfPreview.tsx`
- Create: `src/components/browse/GenericPreview.tsx`
- Modify: `src/components/browse/PreviewPane.tsx`

- [ ] **Step 1: Image**

```tsx
// src/components/browse/ImagePreview.tsx
"use client";
import { useState } from "react";

export function ImagePreview({ filePath }: { filePath: string }) {
  const [zoom, setZoom] = useState(false);
  const src = `/api/vault/asset?path=${encodeURIComponent(filePath)}`;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24, height: "100%" }}>
        <img
          src={src}
          alt={filePath}
          loading="lazy"
          decoding="async"
          onClick={() => setZoom(true)}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", cursor: "zoom-in", borderRadius: 6 }}
        />
      </div>
      {zoom && (
        <div
          onClick={() => setZoom(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, cursor: "zoom-out",
          }}
        >
          <img src={src} alt={filePath} style={{ maxWidth: "95vw", maxHeight: "95vh", objectFit: "contain" }} />
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: PDF**

```tsx
// src/components/browse/PdfPreview.tsx
"use client";
export function PdfPreview({ filePath }: { filePath: string }) {
  const src = `/api/vault/asset?path=${encodeURIComponent(filePath)}`;
  return <iframe src={src} title={filePath} style={{ width: "100%", height: "100%", border: 0 }} />;
}
```

- [ ] **Step 3: Generic**

```tsx
// src/components/browse/GenericPreview.tsx
"use client";
import { useState } from "react";

export function GenericPreview({ filePath }: { filePath: string }) {
  const [revealing, setRevealing] = useState(false);
  const name = filePath.split("/").pop() ?? filePath;
  const reveal = async () => {
    setRevealing(true);
    try {
      await fetch("/api/vault/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: filePath }),
      });
    } finally { setRevealing(false); }
  };
  return (
    <div style={{ padding: 24 }}>
      <div style={{ padding: 16, border: "1px solid var(--border-subtle)", borderRadius: 8, background: "var(--bg-surface-alpha-2)" }}>
        <div style={{ fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>{name}</div>
        <div className="caption" style={{ color: "var(--text-tertiary)", marginBottom: 12 }}>{filePath}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={reveal}
            disabled={revealing}
            className="focus-ring caption"
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-standard)", background: "var(--bg-surface)", cursor: "pointer" }}
          >
            Reveal in Finder
          </button>
          <a
            href={`/api/vault/asset?path=${encodeURIComponent(filePath)}&download=1`}
            className="focus-ring caption"
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-standard)", background: "var(--bg-surface)", textDecoration: "none", color: "var(--text-primary)" }}
          >
            Download
          </a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Dispatcher update**

In `PreviewPane.tsx`, replace the TODO branch with:

```tsx
import { ImagePreview } from "./ImagePreview";
import { PdfPreview } from "./PdfPreview";
import { GenericPreview } from "./GenericPreview";
// ...
if (kind === "image") return <ImagePreview filePath={filePath} />;
if (kind === "pdf") return <PdfPreview filePath={filePath} />;
return <GenericPreview filePath={filePath} />;
```

- [ ] **Step 5: Manual verification**

Click an image file (zooms on click, Esc or click-again closes). Click a PDF (iframe renders). Click a `.mp4` or `.json` (card shows with Reveal + Download).

- [ ] **Step 6: Commit**

```bash
git add src/components/browse
git commit -m "feat(browse): image / pdf / generic previews"
```

---

## Task 10: Preview header (breadcrumb, Open full view, Pin)

**Files:**

- Create: `src/components/browse/PreviewHeader.tsx`
- Modify: `src/components/browse/BrowsePage.tsx`

- [ ] **Step 1: Header component**

```tsx
// src/components/browse/PreviewHeader.tsx
"use client";

import Link from "next/link";
import { useSidebarPins } from "@/lib/hooks/useSidebarPins";
import { breadcrumbsFor, encodeVaultPath } from "@/lib/browse/path";

export function PreviewHeader({
  folderPath,
  filePath,
}: {
  folderPath: string;
  filePath: string | null;
}) {
  const { pins, addPin, removePin } = useSidebarPins();
  const crumbs = breadcrumbsFor(folderPath);
  const pinned = pins.find((p) => p.path === folderPath);
  const name = filePath ? filePath.split("/").pop() : (folderPath || "Vault");
  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 16px",
      borderBottom: "1px solid var(--border-subtle)",
      fontSize: 12,
    }}>
      <nav style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0, overflow: "hidden" }}>
        <Link href="/files" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>Vault</Link>
        {crumbs.map((c) => (
          <span key={c.path} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "var(--text-quaternary)" }}>/</span>
            <Link href={`/files/${encodeVaultPath(c.path)}`} style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>{c.name}</Link>
          </span>
        ))}
        {filePath && (
          <>
            <span style={{ color: "var(--text-quaternary)" }}>/</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          </>
        )}
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {folderPath && (
          <button
            type="button"
            onClick={() => pinned ? removePin(pinned.id) : addPin({ label: folderPath.split("/").pop() ?? folderPath, path: folderPath })}
            className="focus-ring caption"
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: pinned ? "var(--bg-surface-alpha-4)" : "transparent", cursor: "pointer" }}
          >
            {pinned ? "Pinned" : "Pin folder"}
          </button>
        )}
        {filePath && filePath.toLowerCase().endsWith(".md") && (
          <Link
            href={`/file/${encodeVaultPath(filePath)}`}
            className="focus-ring caption"
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border-subtle)", textDecoration: "none", color: "var(--text-primary)" }}
          >
            Open full view
          </Link>
        )}
      </div>
    </header>
  );
}
```

**Note:** verify `useSidebarPins` actually exposes `addPin` and `removePin` — if the exports differ (e.g. `togglePin`), adapt the two calls. Inspect `src/lib/hooks/useSidebarPins.ts` before writing.

- [ ] **Step 2: Slot into BrowsePage**

Inside `<main>`, render `<PreviewHeader folderPath={currentFolder} filePath={currentFile} />` before `<PreviewPane />` and wrap the pane in a scroll container so the header stays pinned:

```tsx
<main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
  <PreviewHeader folderPath={currentFolder} filePath={currentFile} />
  <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
    <PreviewPane folderPath={currentFolder} filePath={currentFile} onOpenFile={…} onOpenFolder={…} />
  </div>
</main>
```

- [ ] **Step 3: Manual verification**

Breadcrumb renders, each segment navigates. Pin folder: the sidebar's pinned list updates. Unpin: removed. Open full view on an `.md` navigates to `/file/<path>`.

- [ ] **Step 4: Commit**

```bash
git add src/components/browse/PreviewHeader.tsx src/components/browse/BrowsePage.tsx
git commit -m "feat(browse): preview header with breadcrumb, pin, open full view"
```

---

## Task 11: Keyboard navigation (including `/` focus filter)

**Files:**

- Modify: `src/components/browse/BrowsePage.tsx`

- [ ] **Step 1: Global key handler on the page**

Add a key listener at the `BrowsePage` root: pressing `/` (not already typing in an input) focuses the tree's filter input; `⌘⇧M` toggles source view (wired up later in Task 14 — no-op for now but reserve the shortcut).

```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement | null)?.isContentEditable;
    if (!typing && e.key === "/" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const input = document.querySelector<HTMLInputElement>('input[placeholder^="Filter"]');
      input?.focus();
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);
```

- [ ] **Step 2: Explicit ⌘Enter handling in the tree**

In `FileTree.tsx`, attach a `onKeyDown` on the outer tree container that catches `(e.metaKey || e.ctrlKey) && e.key === "Enter"` and, if the focused node is a file, calls a new prop `onOpenFull(path)`. Wire that prop from `BrowsePage` to `router.push(\`/file/\${encodeVaultPath(path)}\`)`.

```tsx
// in FileTree Props, add:
onOpenFull: (path: string) => void;

// in the <Tree>-containing outer div, add:
onKeyDown={(e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    const focused = treeRef.current?.focusedNode?.data as NodeData | undefined;
    if (focused?.type === "file") {
      e.preventDefault();
      onOpenFull(focused.path);
    }
  }
}}
```

- [ ] **Step 3: Manual verification**

Press `/`. Filter input gets focus. Arrow keys move selection within the tree. Enter previews. ⌘Enter on a focused file navigates to `/file/<path>`.

- [ ] **Step 4: Commit**

```bash
git add src/components/browse/BrowsePage.tsx src/components/browse/FileTree.tsx
git commit -m "feat(browse): keyboard shortcuts (filter focus + ⌘Enter)"
```

---

## Task 12: Markdown — KaTeX math

**Files:**

- Modify: `src/components/ui/MarkdownRenderer.tsx`
- Modify: `src/app/globals.css` (or wherever global styles live; inspect first)

- [ ] **Step 1: Wire plugins dynamically**

At the top of `MarkdownRenderer.tsx`, add:

```ts
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
// KaTeX stylesheet is loaded once, on first render.
let katexCssLoaded = false;
function ensureKatexCss() {
  if (katexCssLoaded || typeof document === "undefined") return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
  link.integrity = "sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+";
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
  katexCssLoaded = true;
}
```

In the `MarkdownRenderer` component body, call `ensureKatexCss()` once (inside a `useEffect(() => ensureKatexCss(), [])`).

Add the plugins to `<ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={…}>`.

**Note:** Next.js bundles are OK fetching the KaTeX CSS from CDN because the app is local. If air-gapped: `npm install katex` (already in Task 0) and `import "katex/dist/katex.min.css"` from a module that's only loaded by the renderer — but static CSS imports from client components must happen at module top-level; moving it behind a dynamic flag requires adding it to `globals.css` instead. If CDN is undesired, simply add `@import "katex/dist/katex.min.css";` to `globals.css` and delete the `ensureKatexCss` shim.

- [ ] **Step 2: Manual verification**

Create a test note with `$E=mc^2$` and `$$\int_0^1 x^2 dx$$`. Open in browse. Inline and block math render.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/MarkdownRenderer.tsx
git commit -m "feat(browse): KaTeX math in markdown preview"
```

---

## Task 13: Markdown — Mermaid + Shiki + figure captions + wiki-link to /browse

**Files:**

- Modify: `src/components/ui/MarkdownRenderer.tsx`

This task adds three things in one commit because each is small and they share the component tree.

- [ ] **Step 1: Mermaid via a dedicated `code` renderer**

Replace the existing `code` component mapping (or add one if absent) with:

```tsx
import { useEffect, useRef } from "react";

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
      try {
        const { svg } = await mermaid.render(`m-${Math.random().toString(36).slice(2)}`, code);
        if (alive && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (alive && ref.current) ref.current.innerHTML = `<pre class="caption" style="color:var(--status-danger)">${String(e)}</pre>`;
      }
    })();
    return () => { alive = false; };
  }, [code]);
  return <div ref={ref} className="mermaid-block" />;
}
```

- [ ] **Step 2: Shiki via `rehype-shiki`**

Add to plugins:

```ts
import rehypeShiki from "@shikijs/rehype";

// inside component, instantiate once via module scope:
const shikiOptions = {
  themes: { light: "github-light", dark: "github-dark" },
  defaultColor: false as const, // let themes switch via data-theme
  parseMetaString: () => ({}),
  langs: [
    "ts","tsx","js","jsx","py","go","rust","swift","java","kotlin",
    "rb","php","sql","sh","bash","zsh","yaml","json","toml","html","css","md",
  ],
};
```

Merge into `rehypePlugins={[rehypeKatex, [rehypeShiki, shikiOptions]]}`.

Add the CSS for theme switching in `globals.css`:

```css
/* Shiki theme switching via data-theme on <html>. */
.shiki { background: transparent !important; }
html[data-theme="dark"] .shiki, html[data-theme="dark"] .shiki span { color: var(--shiki-dark) !important; background-color: var(--shiki-dark-bg) !important; }
html[data-theme="light"] .shiki, html[data-theme="light"] .shiki span { color: var(--shiki-light) !important; background-color: var(--shiki-light-bg) !important; }
```

- [ ] **Step 3: `code` component mapping**

```tsx
components={{
  // ...existing mappings…
  code(props) {
    const { className, children, node } = props as any;
    const match = /language-(\w+)/.exec(className || "");
    const lang = match?.[1];
    const inline = (node as any)?.position?.start?.line === (node as any)?.position?.end?.line;
    if (!inline && lang === "mermaid") return <MermaidBlock code={String(children).trim()} />;
    return <code className={className}>{children}</code>;
  },
  img(props) {
    const { src, alt } = props as { src: string; alt: string };
    // Resolve relative paths against the file via /api/vault/asset.
    const resolved = src && !/^https?:\/\//.test(src) && !src.startsWith("/")
      ? `/api/vault/asset?path=${encodeURIComponent(src.replace(/^\.\//, ""))}`
      : src;
    return (
      <figure style={{ margin: "16px 0", textAlign: "center" }}>
        <img src={resolved} alt={alt ?? ""} loading="lazy" decoding="async" style={{ maxWidth: "100%", borderRadius: 6 }} />
        {alt ? <figcaption className="caption" style={{ color: "var(--text-tertiary)", marginTop: 6 }}>{alt}</figcaption> : null}
      </figure>
    );
  },
}}
```

- [ ] **Step 4: Wiki-link → browse route**

In the existing anchor component (`a` mapping), when `href` starts with `vault://`, call `onNavigate(linkText)` if supplied (already done); otherwise, in the browse context, rewrite to `/browse?file=<resolved>` by resolving the wiki target to an actual file path. Simplest resolver for v1: assume unqualified wiki links map to `<name>.md`, prefer exact-name match, fall back to a substring match via `/api/vault/folders` — **but** resolution requires vault awareness. Keep the current `onNavigate(linkText)` hook and let the Browse page resolve.

In `BrowsePage` update the `MarkdownPreview` `onNavigate` wiring:

```tsx
// in MarkdownPreview.tsx, change the onNavigate handler to resolve server-side.
// When a vault:// link is clicked, query the existing /api/file with the linkText:
onNavigate={async (target) => {
  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(target)}`);
    if (res.ok) {
      const j = await res.json() as { path: string };
      const url = new URL(window.location.href);
      url.searchParams.set("file", j.path);
      window.history.replaceState(null, "", url.toString());
      window.dispatchEvent(new Event("cipher:browse-file-changed"));
    }
  } catch {}
}}
```

`/api/file` already resolves wiki names to vault paths (per its own fallback), so this reuses existing logic.

- [ ] **Step 5: Manual verification**

- `.md` with a ```` ```mermaid ```` block renders a diagram.
- `.md` with fenced `ts`, `py`, `rust`, `sql`, `bash` blocks is highlighted.
- `![A caption](./pic.png)` renders figure with caption and resolves the image.
- Clicking a `[[Wiki Link]]` updates the preview in place.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/MarkdownRenderer.tsx src/app/globals.css
git commit -m "feat(browse): mermaid + shiki + figure captions + wiki-link nav"
```

---

## Task 14: Raw ↔ rendered toggle with CodeMirror

**Files:**

- Create: `src/components/browse/SourceView.tsx`
- Modify: `src/components/browse/MarkdownPreview.tsx`
- Modify: `src/components/browse/PreviewHeader.tsx`

- [ ] **Step 1: Source view (lazy-loaded CodeMirror)**

```tsx
// src/components/browse/SourceView.tsx
"use client";
import { useEffect, useRef } from "react";

export function SourceView({ content }: { content: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let view: { destroy: () => void } | null = null;
    let alive = true;
    (async () => {
      const [{ EditorState }, { EditorView, lineNumbers, highlightActiveLine }, { defaultKeymap }, { markdown }, { oneDark }] =
        await Promise.all([
          import("@codemirror/state"),
          import("@codemirror/view"),
          import("@codemirror/commands"),
          import("@codemirror/lang-markdown"),
          import("@codemirror/theme-one-dark"),
        ]);
      if (!alive || !hostRef.current) return;
      const state = EditorState.create({
        doc: content,
        extensions: [
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          markdown(),
          oneDark,
        ],
      });
      view = new EditorView({ state, parent: hostRef.current });
    })();
    return () => { alive = false; view?.destroy(); };
  }, [content]);

  return <div ref={hostRef} style={{ height: "100%" }} />;
}
```

- [ ] **Step 2: Add a `mode` state + toggle in MarkdownPreview**

Extend `MarkdownPreview` to accept `mode: "rendered" | "source"` and render `SourceView` when `mode === "source"`. Lift `mode` into `BrowsePage` state. `⌘⇧M` toggles it. `mode` resets on file change.

```tsx
// MarkdownPreview change:
export const MarkdownPreview = memo(function MarkdownPreview({
  filePath, mode,
}: { filePath: string; mode: "rendered" | "source" }) {
  // ...fetch as before...
  if (mode === "source") return <SourceView content={data.content} />;
  return (/* existing rendered output */);
});
```

In `BrowsePage`:

```tsx
const [mode, setMode] = useState<"rendered" | "source">("rendered");
useEffect(() => { setMode("rendered"); }, [currentFile]);
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "m") {
      e.preventDefault();
      setMode((m) => m === "rendered" ? "source" : "rendered");
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);
```

Pass `mode` and `onToggleMode` to `PreviewHeader` so a button reflects the state.

- [ ] **Step 3: Add toggle button in `PreviewHeader`**

```tsx
<button
  type="button"
  onClick={onToggleMode}
  aria-pressed={mode === "source"}
  className="focus-ring caption"
  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: mode === "source" ? "var(--bg-surface-alpha-4)" : "transparent", cursor: "pointer" }}
  title="Toggle source (⌘⇧M)"
>
  {mode === "source" ? "Rendered" : "Source"}
</button>
```

- [ ] **Step 4: Manual verification**

Open an `.md` file. Click Source button (or `⌘⇧M`) — CodeMirror read-only markdown view appears. Click again — rendered returns. Navigate to a different file — resets to rendered.

- [ ] **Step 5: Commit**

```bash
git add src/components/browse
git commit -m "feat(browse): raw↔rendered toggle with read-only CodeMirror source view"
```

---

## Task 15: Reader preferences (CSS vars + panel)

**Files:**

- Create: `src/lib/browse/reader-prefs.ts`
- Create: `src/components/browse/ReaderSettingsPanel.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/browse/BrowsePage.tsx`
- Modify: `src/components/browse/PreviewHeader.tsx`

- [ ] **Step 1: Prefs store**

```ts
// src/lib/browse/reader-prefs.ts
"use client";

export interface ReaderPrefs {
  fontFamily: "sans" | "serif" | "mono";
  fontSize: number;     // px
  boldWeight: 400 | 500 | 600 | 700;
  lineHeight: number;   // 1.3..2.0
  direction: "ltr" | "rtl";
  pageWidth: "narrow" | "comfortable" | "wide" | "custom";
  customWidthPx: number;
  zoom: number;         // 0.75..1.5
}

export const DEFAULT_PREFS: ReaderPrefs = {
  fontFamily: "sans",
  fontSize: 15,
  boldWeight: 600,
  lineHeight: 1.6,
  direction: "ltr",
  pageWidth: "comfortable",
  customWidthPx: 768,
  zoom: 1,
};

const KEY = "cipher.reader-prefs.v1";

export function readPrefs(): ReaderPrefs {
  if (typeof localStorage === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ReaderPrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch { return DEFAULT_PREFS; }
}

export function writePrefs(p: ReaderPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
}

const WIDTHS: Record<ReaderPrefs["pageWidth"], string> = {
  narrow: "56ch",
  comfortable: "72ch",
  wide: "96ch",
  custom: "var(--cipher-reader-custom-width, 768px)",
};

const FAMILIES: Record<ReaderPrefs["fontFamily"], string> = {
  sans: "var(--font-sans, ui-sans-serif, system-ui)",
  serif: "var(--font-serif, Georgia, 'Times New Roman', serif)",
  mono: "var(--font-mono, ui-monospace, Menlo, monospace)",
};

export function applyPrefsToCssVars(p: ReaderPrefs) {
  if (typeof document === "undefined") return;
  const r = document.documentElement;
  r.style.setProperty("--md-font", FAMILIES[p.fontFamily]);
  r.style.setProperty("--md-size", `${p.fontSize}px`);
  r.style.setProperty("--md-line-height", String(p.lineHeight));
  r.style.setProperty("--md-weight", String(p.boldWeight));
  r.style.setProperty("--md-dir", p.direction);
  r.style.setProperty("--md-max-width", WIDTHS[p.pageWidth]);
  r.style.setProperty("--cipher-reader-custom-width", `${p.customWidthPx}px`);
  r.style.setProperty("--md-zoom", String(p.zoom));
}
```

- [ ] **Step 2: CSS hooks**

Append to `src/app/globals.css`:

```css
.markdown-content {
  font-family: var(--md-font, ui-sans-serif, system-ui);
  font-size: calc(var(--md-size, 15px) * var(--md-zoom, 1));
  line-height: var(--md-line-height, 1.6);
  direction: var(--md-dir, ltr);
  max-width: var(--md-max-width, 72ch);
  margin: 0 auto;
}
.markdown-content strong { font-weight: var(--md-weight, 600); }
```

- [ ] **Step 3: Settings panel**

```tsx
// src/components/browse/ReaderSettingsPanel.tsx
"use client";
import { useEffect, useState } from "react";
import { DEFAULT_PREFS, readPrefs, writePrefs, applyPrefsToCssVars, type ReaderPrefs } from "@/lib/browse/reader-prefs";

export function ReaderSettingsPanel({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<ReaderPrefs>(readPrefs);
  useEffect(() => { applyPrefsToCssVars(p); writePrefs(p); }, [p]);
  const patch = (k: keyof ReaderPrefs, v: ReaderPrefs[keyof ReaderPrefs]) => setP((prev) => ({ ...prev, [k]: v }));
  return (
    <div role="dialog" style={{
      position: "absolute", right: 16, top: 48, width: 280,
      background: "var(--surface-raised)", border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-panel)", boxShadow: "var(--shadow-dialog)", padding: 12, zIndex: 40,
    }}>
      <Row label="Font">
        <select value={p.fontFamily} onChange={(e) => patch("fontFamily", e.target.value as ReaderPrefs["fontFamily"])}>
          <option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option>
        </select>
      </Row>
      <Row label="Size">
        <input type="number" min={12} max={20} value={p.fontSize} onChange={(e) => patch("fontSize", clamp(+e.target.value, 12, 20))} style={{ width: 60 }} />
      </Row>
      <Row label="Bold">
        <select value={p.boldWeight} onChange={(e) => patch("boldWeight", Number(e.target.value) as ReaderPrefs["boldWeight"])}>
          <option value={400}>Regular</option><option value={500}>Medium</option>
          <option value={600}>Semibold</option><option value={700}>Bold</option>
        </select>
      </Row>
      <Row label="Line height">
        <input type="number" min={1.3} max={2} step={0.1} value={p.lineHeight} onChange={(e) => patch("lineHeight", clamp(+e.target.value, 1.3, 2))} style={{ width: 60 }} />
      </Row>
      <Row label="Direction">
        <select value={p.direction} onChange={(e) => patch("direction", e.target.value as ReaderPrefs["direction"])}>
          <option value="ltr">LTR</option><option value="rtl">RTL</option>
        </select>
      </Row>
      <Row label="Page width">
        <select value={p.pageWidth} onChange={(e) => patch("pageWidth", e.target.value as ReaderPrefs["pageWidth"])}>
          <option value="narrow">Narrow</option><option value="comfortable">Comfortable</option>
          <option value="wide">Wide</option><option value="custom">Custom</option>
        </select>
      </Row>
      {p.pageWidth === "custom" && (
        <Row label="Width (px)">
          <input type="number" min={400} max={1600} value={p.customWidthPx} onChange={(e) => patch("customWidthPx", clamp(+e.target.value, 400, 1600))} style={{ width: 80 }} />
        </Row>
      )}
      <Row label="Zoom">
        <input type="number" min={0.75} max={1.5} step={0.05} value={p.zoom} onChange={(e) => patch("zoom", clamp(+e.target.value, 0.75, 1.5))} style={{ width: 60 }} />
      </Row>
      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
        <button type="button" onClick={() => { setP(DEFAULT_PREFS); applyPrefsToCssVars(DEFAULT_PREFS); writePrefs(DEFAULT_PREFS); }}>Reset</button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
      <span className="caption" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      {children}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
```

- [ ] **Step 4: Bootstrap on page mount + add button to header**

In `BrowsePage`:

```tsx
import { applyPrefsToCssVars, readPrefs } from "@/lib/browse/reader-prefs";
// in a useEffect on mount:
useEffect(() => { applyPrefsToCssVars(readPrefs()); }, []);
```

Add a `Reader settings` button to `PreviewHeader` that toggles `ReaderSettingsPanel` visibility (lift the open state into `BrowsePage` and render the panel beside the header).

- [ ] **Step 5: Manual verification**

Open reader settings, change font to Serif — the preview's markdown switches. Change page width to Wide — content widens, sidebar untouched. Reload — choices persist.

- [ ] **Step 6: Commit**

```bash
git add src/lib/browse/reader-prefs.ts src/components/browse src/app/globals.css
git commit -m "feat(browse): reader preferences panel wired to CSS vars"
```

---

## Task 16: App-wide theme (light / dark / system)

**Files:**

- Create: `src/lib/browse/theme.ts`
- Create: `src/components/browse/ThemeToggle.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/browse/PreviewHeader.tsx`

- [ ] **Step 1: Store + listener**

```ts
// src/lib/browse/theme.ts
"use client";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "cipher.theme.v1";

export function readTheme(): ThemeChoice {
  if (typeof localStorage === "undefined") return "system";
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export function writeTheme(t: ThemeChoice) {
  try { localStorage.setItem(KEY, t); } catch {}
  applyTheme(t);
}

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") {
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return choice;
}

export function applyTheme(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolveTheme(choice));
}

export function watchSystemTheme(onChange: (resolved: "light" | "dark") => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => onChange(mql.matches ? "dark" : "light");
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}
```

- [ ] **Step 2: Bootstrap script**

Add an inline script in `src/app/layout.tsx` before the body renders so the first paint has the right theme (no flash):

```tsx
// inside the <head> of layout.tsx (RootLayout):
<script
  dangerouslySetInnerHTML={{
    __html: `
      try {
        var v = localStorage.getItem("cipher.theme.v1");
        var resolved = v === "light" || v === "dark" ? v :
          (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
        document.documentElement.setAttribute("data-theme", resolved);
      } catch (e) {}
    `,
  }}
/>
```

- [ ] **Step 3: ThemeToggle component**

```tsx
// src/components/browse/ThemeToggle.tsx
"use client";
import { useEffect, useState } from "react";
import { applyTheme, readTheme, watchSystemTheme, writeTheme, type ThemeChoice } from "@/lib/browse/theme";

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => {
    setChoice(readTheme());
    const stop = watchSystemTheme(() => { if (readTheme() === "system") applyTheme("system"); });
    return stop;
  }, []);
  const pick = (c: ThemeChoice) => { setChoice(c); writeTheme(c); };
  return (
    <div role="group" aria-label="Theme" style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
      {(["light","dark","system"] as ThemeChoice[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => pick(t)}
          aria-pressed={choice === t}
          className="focus-ring caption"
          style={{ padding: "4px 8px", border: "none", background: choice === t ? "var(--bg-surface-alpha-4)" : "transparent", cursor: "pointer" }}
        >
          {t[0].toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Slot the toggle into the header**

Render `<ThemeToggle />` in `PreviewHeader` next to "Reader settings".

- [ ] **Step 5: Manual verification**

Theme buttons switch instantly, Shiki + KaTeX pick up new theme, reload respects the choice, no flash of wrong theme on initial load, System changes when OS toggles.

- [ ] **Step 6: Commit**

```bash
git add src/lib/browse/theme.ts src/components/browse/ThemeToggle.tsx src/app/layout.tsx src/components/browse/PreviewHeader.tsx
git commit -m "feat(browse): app-wide theme toggle with system-preference follow"
```

---

## Task 17: Wire pinned-folder click to `/files/<path>`

**Files:**

- Modify: `src/components/AppShell.tsx`
- Modify: `src/components/Sidebar.tsx` (only if the click handler lives there — inspect first)

- [ ] **Step 1: Read the current handler**

Inspect the `AppShellInner` render for how it wires Sidebar pins. Per `AppShell.tsx:185-188`:

```tsx
// existing:
setVaultDrawerOpen(true);
setDrawerScopedPath(path);
```

Replace with:

```tsx
router.push(`/files/${path.split("/").map(encodeURIComponent).join("/")}`);
```

Also replace `AppShell.tsx:228-229`:

```tsx
setDrawerScopedPath(folderPath);
setVaultDrawerOpen(true);
```

with

```tsx
router.push(`/files/${folderPath.split("/").map(encodeURIComponent).join("/")}`);
```

Leave `setVaultDrawerOpen` state in place for Task 18 to remove.

- [ ] **Step 2: Manual verification**

Click a pinned folder in the sidebar. Page navigates to `/files/<path>`. Tree is selected/expanded to that folder.

- [ ] **Step 3: Commit**

```bash
git add src/components/AppShell.tsx
git commit -m "feat(browse): pinned folder click navigates to /files/<path>"
```

---

## Task 18: Delete VaultDrawer + `/api/vault/structure`

**Files:**

- Delete: `src/components/VaultDrawer.tsx`
- Delete: `src/app/api/vault/structure/route.ts`
- Modify: `src/components/AppShell.tsx`

- [ ] **Step 1: Remove drawer from AppShell**

Strip out:
- `import { VaultDrawer } from "@/components/VaultDrawer";`
- `vaultDrawerOpen` / `setVaultDrawerOpen` state
- `drawerScopedPath` / `setDrawerScopedPath` state
- The `CommandPalette` action `{ id: "nav-drawer", ... run: () => setVaultDrawerOpen(true) }`
- The Sidebar `onBrowse={() => setVaultDrawerOpen(true)}` prop — replace with `onBrowse={() => router.push("/files")}`
- The `<VaultDrawer … />` render block
- The keybinding that closes the drawer on Esc

- [ ] **Step 2: Delete the files**

```bash
rm src/components/VaultDrawer.tsx
rm src/app/api/vault/structure/route.ts
```

- [ ] **Step 3: Fix fallout**

```bash
npm run build
```

Address any type errors — likely Sidebar still expects `onBrowse` and other entry points may still import from deleted files. Adjust until `build` is clean.

- [ ] **Step 4: Manual verification**

`grep -r "VaultDrawer" src/` — zero matches. All previous drawer entry points (vault chip, palette "Open vault drawer", sidebar structure section) land in `/files` now.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(browse): remove VaultDrawer + /api/vault/structure"
```

---

## Task 19: Heading anchor copy-link

**Files:**

- Modify: `src/components/ui/MarkdownRenderer.tsx`

- [ ] **Step 1: Small link icon on hover**

In the heading component mappings (`h1..h4`), append a hover-visible copy button:

```tsx
function CopyHeadingLink({ id }: { id: string }) {
  const copy = (e: React.MouseEvent) => {
    e.preventDefault();
    const href = `${window.location.pathname}${window.location.search}#${id}`;
    navigator.clipboard.writeText(`${window.location.origin}${href}`).catch(() => {});
  };
  return (
    <a href={`#${id}`} onClick={copy} className="copy-heading" aria-label="Copy link to heading"
      style={{ marginLeft: 6, opacity: 0, transition: "opacity 120ms", textDecoration: "none" }}>
      🔗
    </a>
  );
}
```

Include a CSS rule in `globals.css`:

```css
.markdown-content h1:hover .copy-heading,
.markdown-content h2:hover .copy-heading,
.markdown-content h3:hover .copy-heading,
.markdown-content h4:hover .copy-heading { opacity: 0.6; }
```

Use `<CopyHeadingLink id={id} />` next to the children of each heading tag.

- [ ] **Step 2: Manual verification**

Hover a heading — link icon fades in. Click — URL with `#heading-…` is on the clipboard. Pasting opens at that heading.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/MarkdownRenderer.tsx src/app/globals.css
git commit -m "feat(browse): hover-to-copy heading anchors"
```

---

## Task 20: Resizable tree pane

**Files:**

- Modify: `src/components/browse/BrowsePage.tsx`

- [ ] **Step 1: Drag handle**

Between the `<aside>` and `<main>`, insert a 4px vertical drag handle. On mousedown it starts tracking, clamps width to `[220, 480]`, persists to `localStorage` under `cipher.browse.tree-width.v1`.

```tsx
const [treeWidth, setTreeWidth] = useState(280);
useEffect(() => {
  const raw = localStorage.getItem("cipher.browse.tree-width.v1");
  if (raw) setTreeWidth(Math.min(480, Math.max(220, Number(raw) || 280)));
}, []);
const startDrag = (e: React.MouseEvent) => {
  e.preventDefault();
  const startX = e.clientX, startW = treeWidth;
  const onMove = (me: MouseEvent) => {
    const next = Math.min(480, Math.max(220, startW + (me.clientX - startX)));
    setTreeWidth(next);
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    try { localStorage.setItem("cipher.browse.tree-width.v1", String(treeWidth)); } catch {}
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
};
// …
<div onMouseDown={startDrag} style={{ width: 4, cursor: "col-resize", background: "var(--border-subtle)", flexShrink: 0 }} />
```

- [ ] **Step 2: Manual verification**

Drag the divider. Tree width updates smoothly, clamped at the bounds. Reload — width persists.

- [ ] **Step 3: Commit**

```bash
git add src/components/browse/BrowsePage.tsx
git commit -m "feat(browse): resizable tree pane with persisted width"
```

---

## Task 21: End-to-end verification pass

No file changes; this task walks through the spec's verification checklist and captures any residual bugs as follow-up commits.

- [ ] **Step 1: Run through the spec's verification list**

From `docs/superpowers/specs/2026-04-22-browse-surface-design.md`, section **Verification**, items 1–20. For each:

1. Root `/files` — shows every top-level folder and loose file.
2. Deep expand — `twitter/2026/apr` stays smooth at >500 nodes.
3. Markdown — gfm tables, code, wiki-links update preview inline.
4. Image — click to zoom works.
5. PDF — iframe loads.
6. Generic — Reveal + Download work.
7. Pinned folder — sidebar click lands on `/files/<path>`.
8. Deep link — pasting a URL opens correctly.
9. Filter — matches within 80ms; Esc clears.
10. Keyboard — `/`, arrows, Enter, ⌘Enter.
11. Drawer gone — `grep -r "VaultDrawer" src/` returns zero matches.
12. Scroll — 10k nodes stays at 60fps (profile with React DevTools if doubt).
13. Preview not re-rendering on unrelated state changes.
14. Math renders; KaTeX CSS loads only when needed.
15. Mermaid renders; mermaid not in initial bundle (Network tab).
16. Code highlighting switches with theme.
17. Image caption as `<figure>`.
18. `⌘⇧M` toggle resets on navigation.
19. Reader prefs persist.
20. Theme persists + no flash.

- [ ] **Step 2: Address any failed item as a small fix-up commit**

Each fix: one commit, scope-tagged `fix(browse): …`.

- [ ] **Step 3: Final push to branch**

```bash
git push -u origin feat/browse-surface-spec
```

Open a PR titled "feat(browse): full-page browse surface replaces VaultDrawer".

---

## Self-review notes

- Each task has exact file paths, code bodies where non-obvious, explicit verification, and a commit.
- No placeholders: every "TBD" or "implement later" has been removed or converted into a clearly scoped task.
- Type surface: `TreeChild` in the API and client agree. `NodeData` in `FileTree.tsx` wraps it; `ReaderPrefs` is the single source for preferences; `ThemeChoice` is the theme contract. No names drift between tasks.
- Decomposition: the plan has 21 tasks; each is independently committable and buildable. If the implementer wants to pause after Task 18 ("drawer gone"), the app is usable — rendering enhancements (12–16), reader prefs (15), theme (16), heading anchors (19), and resizer (20) are polish layered on top.
- Out-of-scope items (task writeback, WYSIWYG editor) are explicitly absent — referenced in the spec under Non-goals and not addressed here.
