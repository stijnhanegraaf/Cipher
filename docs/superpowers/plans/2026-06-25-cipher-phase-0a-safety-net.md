# Cipher Phase 0a — Safety Net, Shared Utilities & High-Trust Bug Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a test harness and shared utilities, then fix the load-bearing bugs that don't depend on any feature — so later phases build on a safe, deduplicated, correct foundation.

**Architecture:** Add Vitest for the pure `lib/` core. Replace duplicated filesystem code (7 directory walks, 3 `safeJoin` copies, 3 frontmatter parsers) with single tested modules under `src/lib/fs/` and `src/lib/markdown/`. Plug the path-traversal hole on the write endpoints. Vendor the CDN stylesheets locally. Fix wiki-link resolution, the hardcoded vault name, the missing hints endpoint, the misrouted `/files` command, write-path cache invalidation, and stale docs. Each change is test-first where the code is pure, and route/UI changes get handler-level tests plus a typecheck/build gate.

**Tech Stack:** Next.js 16.2.3 (App Router), React 19.2.4, TypeScript 5 (strict), Tailwind v4, Vitest (new), the `yaml` package (new).

## Global Constraints

- **TypeScript `strict: true`** — no new `any`; no non-null `!` assertions without a guaranteed prior set.
- **Path alias:** import app modules via `@/*` (maps to `./src/*`).
- **Server-only modules** stay `import "server-only"`; never import them from a client component.
- **No raw hex / Tailwind palette color classes** outside the token layer (`globals.css`) — existing rule; do not introduce new violations (Phase 0b enforces it mechanically).
- **Commit style:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`). One commit per task. Footer line: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Branch:** `refinement`.
- **Vault is a process-global singleton** (single-user localhost tool) — preserve that model; do not introduce per-request vault state.
- **Every task ends green:** `npm run typecheck && npm run lint && npm run test:unit` all pass before commit.

## File Structure

**New files**
- `vitest.config.ts` — Vitest config (node environment, `@` alias).
- `src/lib/fs/walk.ts` — `walkFiles()` + `walkDirs()` (one recursive walk).
- `src/lib/fs/walk.test.ts`
- `src/lib/fs/safe-join.ts` — `safeJoin()` (path-traversal guard).
- `src/lib/fs/safe-join.test.ts`
- `src/lib/markdown/frontmatter.ts` — `parseFrontmatter()` (real YAML).
- `src/lib/markdown/frontmatter.test.ts`
- `src/lib/markdown/wikilink.ts` — `parseWikiTarget()` (split `target|alias#anchor`).
- `src/lib/markdown/wikilink.test.ts`
- `src/lib/obsidian-uri.ts` — `buildObsidianUri()`.
- `src/lib/obsidian-uri.test.ts`
- `src/lib/cache/write-invalidation.ts` — `invalidateAfterWrite()`.
- `src/app/api/browse/hints/route.ts` — real hints endpoint.
- `src/lib/builders/hints.ts` — `buildHints()` + `src/lib/builders/hints.test.ts`.

**Modified files** (exact sites in each task)
- `package.json`, `tsconfig.json` (scripts/types).
- `src/lib/vault-reader.ts`, `src/lib/vault-graph.ts`, `src/lib/vault-search.ts`, `src/lib/chat/embeddings.ts`, `src/app/api/vault/index/route.ts`, `src/app/api/vault/folders/route.ts` (walk migration).
- `src/app/api/vault/tree/route.ts`, `src/app/api/vault/asset/route.ts`, `src/app/api/vault/reveal/route.ts`, `src/app/api/file/route.ts`, `src/app/api/toggle/route.ts` (safeJoin migration + write guards).
- `src/app/api/audit-dashboard/route.ts` (frontmatter parser).
- `src/components/ui/MarkdownRenderer.tsx`, `src/components/DetailPage.tsx` (CDN, wiki-link, obsidian URI).
- `src/components/chat/ChatEmptyState.tsx` (hints).
- `src/components/SlashCommandMenu.tsx` (`/files` route).
- `docs/ARCHITECTURE.md` (stale refs).
- Delete: `scripts/context-sync-calendar.js`, `scripts/memory-diff-check.js`.

---

## Task 1: Vitest harness + scripts

**Files:**
- Modify: `package.json` (scripts + devDependencies)
- Modify: `tsconfig.json` (add vitest globals types)
- Create: `vitest.config.ts`
- Create: `src/lib/__smoke__.test.ts` (temporary smoke test, deleted at end of task)

**Interfaces:**
- Produces: npm scripts `test:unit`, `test:watch`, `typecheck`; a working Vitest runner with the `@/*` alias and `globals: true`.

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
cd ~/Developer/Cipher && npm install -D vitest@^3 @vitejs/plugin-react@^4 jsdom@^25 @testing-library/react@^16 @testing-library/jest-dom@^6
```
Expected: packages added to `devDependencies`, no peer-dep errors that block install.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Component tests opt into jsdom per-file via `// @vitest-environment jsdom`.
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

- [ ] **Step 3: Add scripts to `package.json`**

Replace the `"scripts"` block:
```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 4: Add Vitest globals to `tsconfig.json`**

In `compilerOptions.types`, add `"vitest/globals"`. If `types` does not exist, add it:
```jsonc
    "types": ["vitest/globals"],
```

- [ ] **Step 5: Write a smoke test**

Create `src/lib/__smoke__.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("vitest harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the smoke test**

Run: `npm run test:unit`
Expected: PASS — 1 test passed.

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 8: Delete the smoke test and commit**

```bash
rm src/lib/__smoke__.test.ts
git add package.json package-lock.json tsconfig.json vitest.config.ts
git commit -m "chore: add Vitest test harness and typecheck/test scripts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Shared filesystem walk (`walkFiles` / `walkDirs`)

Replaces 6 recursive walkers (vault-reader basename index, vault-graph, vault-search, embeddings, api/vault/index, api/vault/folders). `today-builder.ts:safeListMd` is intentionally flat/single-dir and is **left as-is**.

**Files:**
- Create: `src/lib/fs/walk.ts`
- Create: `src/lib/fs/walk.test.ts`
- Modify: `src/lib/vault-graph.ts:49-73`
- Modify: `src/lib/vault-search.ts:16-34`
- Modify: `src/lib/chat/embeddings.ts:196-219`
- Modify: `src/app/api/vault/index/route.ts:28-47`
- Modify: `src/app/api/vault/folders/route.ts:13-31`
- Modify: `src/lib/vault-reader.ts:779-810`

**Interfaces:**
- Produces:
  - `walkFiles(root: string, opts?: WalkOptions): Promise<string[]>` — relative, "/"-separated file paths.
  - `walkDirs(root: string, opts?: WalkOptions): Promise<string[]>` — relative directory paths.
  - `WalkOptions = { maxDepth?: number; extensions?: string[]; ignoreDirs?: Set<string>; skipDotfiles?: boolean }`
  - `DEFAULT_IGNORE_DIRS: Set<string>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/fs/walk.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { walkFiles, walkDirs } from "./walk";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cipher-walk-"));
  await mkdir(join(root, "a/b"), { recursive: true });
  await mkdir(join(root, "node_modules/pkg"), { recursive: true });
  await mkdir(join(root, ".obsidian"), { recursive: true });
  await writeFile(join(root, "top.md"), "x");
  await writeFile(join(root, "a/one.md"), "x");
  await writeFile(join(root, "a/b/two.md"), "x");
  await writeFile(join(root, "a/note.txt"), "x");
  await writeFile(join(root, "node_modules/pkg/dep.md"), "x");
  await writeFile(join(root, ".obsidian/config.md"), "x");
  await writeFile(join(root, ".hidden.md"), "x");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("walkFiles", () => {
  it("lists .md files recursively as relative paths, sorted", async () => {
    const files = (await walkFiles(root, { extensions: [".md"] })).sort();
    expect(files).toEqual(["a/b/two.md", "a/one.md", "top.md"]);
  });

  it("ignores node_modules/.obsidian and dotfiles", async () => {
    const files = await walkFiles(root, { extensions: [".md"] });
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
    expect(files.some((f) => f.includes(".obsidian"))).toBe(false);
    expect(files).not.toContain(".hidden.md");
  });

  it("includes all files when extensions omitted", async () => {
    const files = await walkFiles(root);
    expect(files).toContain("a/note.txt");
  });

  it("respects maxDepth (0 = root only)", async () => {
    const files = await walkFiles(root, { extensions: [".md"], maxDepth: 0 });
    expect(files).toEqual(["top.md"]);
  });

  it("returns [] for a missing directory", async () => {
    expect(await walkFiles(join(root, "nope"))).toEqual([]);
  });
});

describe("walkDirs", () => {
  it("lists directories recursively, skipping ignored + dot dirs", async () => {
    const dirs = (await walkDirs(root)).sort();
    expect(dirs).toEqual(["a", "a/b"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/fs/walk.test.ts`
Expected: FAIL — cannot find module `./walk`.

- [ ] **Step 3: Implement `src/lib/fs/walk.ts`**

```ts
import { readdir } from "fs/promises";
import { join, extname } from "path";

export const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".obsidian",
  ".cipher",
]);

export interface WalkOptions {
  /** Max directory depth. Root entries are depth 0. Default 12. */
  maxDepth?: number;
  /** Lowercased extensions to include (e.g. [".md"]). Omit = all files. */
  extensions?: string[];
  /** Directory names to skip. Default DEFAULT_IGNORE_DIRS. */
  ignoreDirs?: Set<string>;
  /** Skip names starting with ".". Default true. */
  skipDotfiles?: boolean;
}

/**
 * Recursively list files under `root`, returning paths relative to `root`
 * (POSIX "/"-separated). One shared implementation replacing the
 * per-subsystem walkers. Never throws — unreadable dirs are skipped.
 */
export async function walkFiles(root: string, opts: WalkOptions = {}): Promise<string[]> {
  const maxDepth = opts.maxDepth ?? 12;
  const exts = opts.extensions?.map((e) => e.toLowerCase());
  const ignore = opts.ignoreDirs ?? DEFAULT_IGNORE_DIRS;
  const skipDot = opts.skipDotfiles ?? true;
  const out: string[] = [];

  async function walk(absDir: string, rel: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: import("fs").Dirent[];
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (skipDot && e.name.startsWith(".")) continue;
      const nextRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (ignore.has(e.name)) continue;
        await walk(join(absDir, e.name), nextRel, depth + 1);
      } else if (e.isFile()) {
        if (!exts || exts.includes(extname(e.name).toLowerCase())) {
          out.push(nextRel);
        }
      }
    }
  }

  await walk(root, "", 0);
  return out;
}

/** Recursively list directories under `root`, returning relative paths. */
export async function walkDirs(root: string, opts: WalkOptions = {}): Promise<string[]> {
  const maxDepth = opts.maxDepth ?? 12;
  const ignore = opts.ignoreDirs ?? DEFAULT_IGNORE_DIRS;
  const skipDot = opts.skipDotfiles ?? true;
  const out: string[] = [];

  async function walk(absDir: string, rel: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: import("fs").Dirent[];
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (skipDot && e.name.startsWith(".")) continue;
      if (ignore.has(e.name)) continue;
      const nextRel = rel ? `${rel}/${e.name}` : e.name;
      out.push(nextRel);
      await walk(join(absDir, e.name), nextRel, depth + 1);
    }
  }

  await walk(root, "", 0);
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/fs/walk.test.ts`
Expected: PASS — all 7 tests pass.

- [ ] **Step 5: Migrate `vault-graph.ts`**

In `src/lib/vault-graph.ts`, delete the `walkMd` function (lines 49-73) and add an import near the top (with the other imports):
```ts
import { walkFiles } from "@/lib/fs/walk";
```
Then replace every call `await walkMd(root)` (and `await walkMd(root, N)`) with:
```ts
await walkFiles(root, { extensions: [".md"] })
```
If a custom depth was passed, include `maxDepth: N`. Remove the now-unused `extname` import if nothing else uses it (run typecheck to confirm).

- [ ] **Step 6: Migrate `vault-search.ts:listVaultFiles`**

Replace the body of `listVaultFiles` (lines 16-34) so it delegates while preserving its signature and root-relative output:
```ts
import { walkFiles } from "@/lib/fs/walk";

export async function listVaultFiles(dirRelPath: string, extension = ".md"): Promise<string[]> {
  const root = rootOrEmpty();
  if (!root) return [];
  const base = dirRelPath ? `${dirRelPath}` : "";
  const rels = await walkFiles(join(root, dirRelPath), { extensions: [extension] });
  return base ? rels.map((r) => `${base}/${r}`) : rels;
}
```
Keep the existing `rootOrEmpty()` and `join` imports.

- [ ] **Step 7: Migrate `chat/embeddings.ts:walkMarkdown`**

Replace `walkMarkdown` (lines 196-219) with a version that delegates the traversal and stats only the returned files:
```ts
import { walkFiles } from "@/lib/fs/walk";

async function walkMarkdown(root: string): Promise<VaultFile[]> {
  const rels = await walkFiles(root, { extensions: [".md"] });
  const out: VaultFile[] = [];
  for (const rel of rels) {
    try {
      const s = await stat(join(root, rel));
      out.push({ path: rel, mtime: s.mtimeMs });
    } catch {
      /* ignore */
    }
  }
  return out;
}
```
Keep the existing `stat` and `join` imports.

- [ ] **Step 8: Migrate `api/vault/index/route.ts:walkMd`**

Delete `walkMd` (lines 28-47), add `import { walkFiles } from "@/lib/fs/walk";`, and replace its single call with `await walkFiles(root, { extensions: [".md"] })`. Remove the now-unused `extname` import if applicable.

- [ ] **Step 9: Migrate `api/vault/folders/route.ts:listAllFolders`**

Delete `listAllFolders` (lines 13-31), add `import { walkDirs } from "@/lib/fs/walk";`, and replace its call `await listAllFolders(root)` with `await walkDirs(root)`.

- [ ] **Step 10: Migrate `vault-reader.ts:buildBasenameIndex`**

Replace the inner `walk` closure usage (lines 779-810) so the index is built from `walkFiles` output:
```ts
import { walkFiles } from "@/lib/fs/walk";

async function buildBasenameIndex(root: string): Promise<Map<string, string[]>> {
  const cached = _basenameIndex.get(root);
  if (cached) return cached;
  const index = new Map<string, string[]>();
  const rels = await walkFiles(root, { extensions: [".md"], maxDepth: 5 });
  for (const rel of rels) {
    const name = rel.slice(rel.lastIndexOf("/") + 1);
    const base = name.slice(0, -3).toLowerCase();
    const list = index.get(base);
    if (list) list.push(rel);
    else index.set(base, [rel]);
  }
  _basenameIndex.set(root, index);
  return index;
}
```

- [ ] **Step 11: Verify nothing broke**

Run: `npm run typecheck && npm run test:unit && npm run build`
Expected: typecheck exit 0; all tests pass; build succeeds. (Build is the integration check that the migrated callers still compile and import correctly.)

- [ ] **Step 12: Commit**

```bash
git add src/lib/fs/walk.ts src/lib/fs/walk.test.ts src/lib/vault-graph.ts src/lib/vault-search.ts src/lib/chat/embeddings.ts src/app/api/vault/index/route.ts src/app/api/vault/folders/route.ts src/lib/vault-reader.ts
git commit -m "refactor: unify directory walking into src/lib/fs/walk

Replaces 6 divergent recursive walkers with one tested walkFiles/walkDirs.
Adds node_modules/.obsidian ignore to the vault-search path that lacked it.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Shared `safeJoin` + plug the write-path traversal hole

**Files:**
- Create: `src/lib/fs/safe-join.ts`
- Create: `src/lib/fs/safe-join.test.ts`
- Modify: `src/app/api/vault/tree/route.ts:18-23`
- Modify: `src/app/api/vault/asset/route.ts:16-21`
- Modify: `src/app/api/vault/reveal/route.ts:7-12`
- Modify: `src/app/api/file/route.ts` (PUT, lines ~107-115; GET path handling)
- Modify: `src/app/api/toggle/route.ts:25-33`

**Interfaces:**
- Produces: `safeJoin(root: string, rel: string): string | null` — absolute path if it stays within `root`, else `null`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/fs/safe-join.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { safeJoin } from "./safe-join";

const ROOT = "/vault/root";

describe("safeJoin", () => {
  it("joins a normal relative path", () => {
    expect(safeJoin(ROOT, "notes/a.md")).toBe("/vault/root/notes/a.md");
  });

  it("allows the root itself", () => {
    expect(safeJoin(ROOT, "")).toBe("/vault/root");
  });

  it("rejects parent-escape", () => {
    expect(safeJoin(ROOT, "../secret")).toBeNull();
    expect(safeJoin(ROOT, "notes/../../secret")).toBeNull();
    expect(safeJoin(ROOT, "../../etc/passwd")).toBeNull();
  });

  it("rejects a sibling prefix collision", () => {
    // /vault/root-evil must NOT be considered inside /vault/root
    expect(safeJoin(ROOT, "../root-evil/x")).toBeNull();
  });

  it("normalizes redundant segments that stay inside", () => {
    expect(safeJoin(ROOT, "notes/./a.md")).toBe("/vault/root/notes/a.md");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit -- src/lib/fs/safe-join.test.ts`
Expected: FAIL — cannot find module `./safe-join`.

- [ ] **Step 3: Implement `src/lib/fs/safe-join.ts`**

```ts
import { resolve, sep } from "path";

/**
 * Join `rel` onto `root`, returning the absolute path only if it stays
 * within `root`. Returns null on any traversal escape. Uses path.resolve
 * so `.`/`..` segments are normalized before the containment check, and
 * guards against sibling-prefix collisions (e.g. /root vs /root-evil).
 */
export function safeJoin(root: string, rel: string): string | null {
  const absRoot = resolve(root);
  const abs = resolve(absRoot, rel);
  if (abs === absRoot) return abs;
  if (abs.startsWith(absRoot + sep)) return abs;
  return null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit -- src/lib/fs/safe-join.test.ts`
Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Replace the three existing copies**

In each of `src/app/api/vault/tree/route.ts`, `src/app/api/vault/asset/route.ts`, `src/app/api/vault/reveal/route.ts`: delete the local `safeJoin` function and add the import:
```ts
import { safeJoin } from "@/lib/fs/safe-join";
```
Leave all call sites unchanged (the signature is identical).

- [ ] **Step 6: Guard the `/api/toggle` write path**

In `src/app/api/toggle/route.ts`, add the import and replace the bare join (lines 25-33):
```ts
import { safeJoin } from "@/lib/fs/safe-join";
```
```ts
    const vaultRoot = getVaultPath();
    if (!vaultRoot) {
      return NextResponse.json({ error: "No vault connected" }, { status: 409 });
    }
    const absPath = safeJoin(vaultRoot, relPath);
    if (!absPath) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    let content: string;
```

- [ ] **Step 7: Guard the `/api/file` PUT write path**

In `src/app/api/file/route.ts` (PUT handler, lines ~107-115), add the import (if not present) and replace the bare join:
```ts
import { safeJoin } from "@/lib/fs/safe-join";
```
```ts
    const vaultRoot = getVaultPath();
    if (!vaultRoot) {
      return NextResponse.json({ error: "No vault connected" }, { status: 409 });
    }
    const absPath = safeJoin(vaultRoot, relPath);
    if (!absPath) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
```

- [ ] **Step 8: Guard the `/api/file` GET path**

In the GET handler, before `readVaultFile(path)`, reject traversal in the raw `path` (the resolver fallback can still run for legitimate non-traversing inputs):
```ts
    const vaultRoot = getVaultPath();
    if (vaultRoot && path.includes("..") && !safeJoin(vaultRoot, path)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
```
Place this immediately after `path` is read and the no-vault check, before the `let file = await readVaultFile(path);` line.

- [ ] **Step 9: Add a route-handler test for the write guard**

Create `src/app/api/toggle/route.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/toggle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/toggle path guard", () => {
  it("rejects a traversing path with 400 (before any fs write)", async () => {
    const res = await POST(req({ path: "../../etc/passwd", lineIndex: 0, checked: true }));
    // 400 (invalid path) or 409 (no vault in test env) — never a 200 success.
    expect([400, 409]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });
});
```
Note: in the test environment no vault is connected, so a 409 is acceptable; the assertion's real job is that a traversing path never returns 200.

- [ ] **Step 10: Verify**

Run: `npm run typecheck && npm run test:unit && npm run build`
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add src/lib/fs/safe-join.ts src/lib/fs/safe-join.test.ts src/app/api/vault/tree/route.ts src/app/api/vault/asset/route.ts src/app/api/vault/reveal/route.ts src/app/api/file/route.ts src/app/api/toggle/route.ts src/app/api/toggle/route.test.ts
git commit -m "fix: guard write endpoints against path traversal; unify safeJoin

/api/file PUT, /api/file GET and /api/toggle joined the vault root with a
bare path; a ../ escaped the vault. All now go through one tested safeJoin.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Real YAML frontmatter parser

Replaces `extractFrontmatter` (vault-reader), `stripFrontmatter` (embeddings), and the divergent `parseFrontmatter` (audit-dashboard). Fixes multi-line lists, nesting, and the audit parser's wrong `---` end-delimiter.

**Files:**
- Create: `src/lib/markdown/frontmatter.ts`
- Create: `src/lib/markdown/frontmatter.test.ts`
- Modify: `src/lib/vault-reader.ts:434-458`
- Modify: `src/lib/chat/embeddings.ts:177-182`
- Modify: `src/app/api/audit-dashboard/route.ts:46-70`

**Interfaces:**
- Produces:
  - `parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; content: string }`
  - `stripFrontmatter(raw: string): string`

- [ ] **Step 1: Install `yaml`**

Run: `cd ~/Developer/Cipher && npm install yaml@^2`
Expected: `yaml` added to `dependencies`.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/markdown/frontmatter.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseFrontmatter, stripFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("returns empty frontmatter when none present", () => {
    const r = parseFrontmatter("# Hello\nbody");
    expect(r.frontmatter).toEqual({});
    expect(r.content).toBe("# Hello\nbody");
  });

  it("parses scalars, booleans, numbers", () => {
    const r = parseFrontmatter("---\ntitle: Q3 Plan\ndone: true\ncount: 3\n---\nbody");
    expect(r.frontmatter).toEqual({ title: "Q3 Plan", done: true, count: 3 });
    expect(r.content).toBe("body");
  });

  it("parses inline AND multi-line list tags", () => {
    const inline = parseFrontmatter("---\ntags: [a, b]\n---\nx");
    expect(inline.frontmatter.tags).toEqual(["a", "b"]);
    const block = parseFrontmatter("---\ntags:\n  - a\n  - b\n---\nx");
    expect(block.frontmatter.tags).toEqual(["a", "b"]);
  });

  it("parses nested objects", () => {
    const r = parseFrontmatter("---\nmeta:\n  author: stijn\n  pinned: false\n---\nx");
    expect(r.frontmatter.meta).toEqual({ author: "stijn", pinned: false });
  });

  it("does not treat a mid-content --- as the end marker", () => {
    const r = parseFrontmatter("---\ntitle: A\n---\nbefore\n\n---\n\nafter");
    expect(r.frontmatter).toEqual({ title: "A" });
    expect(r.content).toBe("before\n\n---\n\nafter");
  });

  it("recovers gracefully from malformed YAML", () => {
    const r = parseFrontmatter("---\n: : : not yaml\n---\nbody");
    expect(typeof r.frontmatter).toBe("object");
    expect(r.content).toBe("body");
  });
});

describe("stripFrontmatter", () => {
  it("returns body only", () => {
    expect(stripFrontmatter("---\na: 1\n---\nbody")).toBe("body");
  });
  it("returns input unchanged when no frontmatter", () => {
    expect(stripFrontmatter("plain")).toBe("plain");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm run test:unit -- src/lib/markdown/frontmatter.test.ts`
Expected: FAIL — cannot find module `./frontmatter`.

- [ ] **Step 4: Implement `src/lib/markdown/frontmatter.ts`**

```ts
import { parse as parseYaml } from "yaml";

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Parse a leading YAML frontmatter block. Uses a real YAML parser so
 * multi-line lists, nested objects, and typed scalars work. The end
 * marker is a `---` line on its own (not any `---` substring), so a
 * horizontal rule in the body is never mistaken for the closing fence.
 */
export function parseFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>;
  content: string;
} {
  const m = raw.match(FM_RE);
  if (!m) return { frontmatter: {}, content: raw };
  let frontmatter: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(m[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      frontmatter = parsed as Record<string, unknown>;
    }
  } catch {
    frontmatter = {};
  }
  return { frontmatter, content: raw.slice(m[0].length) };
}

/** Return the body with any leading frontmatter block removed. */
export function stripFrontmatter(raw: string): string {
  return parseFrontmatter(raw).content;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm run test:unit -- src/lib/markdown/frontmatter.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 6: Replace `vault-reader.ts:extractFrontmatter`**

Delete the `extractFrontmatter` function (lines 434-458). Add import:
```ts
import { parseFrontmatter } from "@/lib/markdown/frontmatter";
```
Replace its single internal call site `const { frontmatter, content } = extractFrontmatter(raw);` with `const { frontmatter, content } = parseFrontmatter(raw);`. (Grep for `extractFrontmatter(` to find the call; there is one in `readVaultFile`.)

- [ ] **Step 7: Replace `embeddings.ts:stripFrontmatter`**

Delete the local `stripFrontmatter` (lines 177-182) and import the shared one:
```ts
import { stripFrontmatter } from "@/lib/markdown/frontmatter";
```
Leave call sites unchanged (same name/signature).

- [ ] **Step 8: Replace `audit-dashboard/route.ts:parseFrontmatter`**

Delete the local `parseFrontmatter` (lines 46-70). Import the shared one and adapt the return-field name (`content` vs the old `body`):
```ts
import { parseFrontmatter } from "@/lib/markdown/frontmatter";
```
At each call site that destructured `{ frontmatter, body }`, change to `{ frontmatter, content: body }` (rename on destructure) so downstream `body` references keep working. Grep for `parseFrontmatter(` and `body` in this file to update both call sites.

- [ ] **Step 9: Verify**

Run: `npm run typecheck && npm run test:unit && npm run build`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add src/lib/markdown/frontmatter.ts src/lib/markdown/frontmatter.test.ts src/lib/vault-reader.ts src/lib/chat/embeddings.ts src/app/api/audit-dashboard/route.ts package.json package-lock.json
git commit -m "refactor: one real-YAML frontmatter parser

Replaces 3 hand-rolled parsers (incl. audit-dashboard's wrong --- delimiter).
Now handles multi-line lists, nested objects, typed scalars.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Vendor KaTeX + highlight.js CSS locally

Removes the runtime jsDelivr dependency (privacy + offline), and aligns CSS versions with the installed packages (`katex@^0.16.45`, `highlight.js@^11.11.1`).

**Files:**
- Modify: `src/components/ui/MarkdownRenderer.tsx:18-56` (and the `useEffect` at line 179)
- Create: `src/app/katex.css` (re-export) — or import the package CSS directly (see steps)

**Interfaces:**
- Produces: KaTeX + hljs styles loaded from local bundles; `ensureKatexCss`/`ensureHljsCss` removed.

- [ ] **Step 1: Confirm the installed package CSS paths exist**

Run:
```bash
ls node_modules/katex/dist/katex.min.css node_modules/highlight.js/styles/atom-one-light.css node_modules/highlight.js/styles/atom-one-dark.css
```
Expected: all three paths exist.

- [ ] **Step 2: Import KaTeX CSS globally**

In `src/app/globals.css`, add directly under the `@import "tailwindcss";` line:
```css
@import "katex/dist/katex.min.css";
```
(Tailwind v4 / PostCSS resolves the package import at build time — bundled, no CDN.)

- [ ] **Step 3: Add the hljs themes as static assets toggled by data-theme**

Copy both hljs theme stylesheets into `public/` so they can be referenced locally with the same light/dark toggle behavior:
```bash
mkdir -p public/vendor/hljs
cp node_modules/highlight.js/styles/atom-one-light.css public/vendor/hljs/atom-one-light.css
cp node_modules/highlight.js/styles/atom-one-dark.css public/vendor/hljs/atom-one-dark.css
```

- [ ] **Step 4: Rewrite the CSS loaders in `MarkdownRenderer.tsx`**

Delete `ensureKatexCss` (lines 18-29) entirely (KaTeX CSS now comes from `globals.css`). Replace `ensureHljsCss` (lines 31-56) so it points at the local copies (keep the light/dark `link.disabled` toggle + MutationObserver):
```ts
// ── highlight.js theme CSS (vendored locally) ──
let hljsCssLoaded = false;
function ensureHljsCss() {
  if (hljsCssLoaded || typeof document === "undefined") return;
  const mk = (href: string, theme: "light" | "dark"): HTMLLinkElement => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-hljs-theme", theme);
    document.head.appendChild(link);
    return link;
  };
  const light = mk("/vendor/hljs/atom-one-light.css", "light");
  const dark = mk("/vendor/hljs/atom-one-dark.css", "dark");
  const sync = () => {
    const d = document.documentElement.getAttribute("data-theme") === "dark";
    light.disabled = d;
    dark.disabled = !d;
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  hljsCssLoaded = true;
}
```

- [ ] **Step 5: Update the invocation**

At line ~179, change the effect to only call the remaining loader:
```ts
  useEffect(() => { ensureHljsCss(); }, []);
```

- [ ] **Step 6: Verify build + no remaining CDN references**

Run:
```bash
npm run build && grep -rn "cdn.jsdelivr.net" src || echo "NO CDN REFERENCES"
```
Expected: build succeeds; grep prints `NO CDN REFERENCES`.

- [ ] **Step 7: Manual verify (math + code render styled, offline)**

Run `npm run dev`, open a note containing a `$x^2$` math expression and a fenced code block; confirm math renders typeset and code is syntax-highlighted in both light and dark themes. (Phase 0b will add screenshot automation; for now a visual check suffices.)

- [ ] **Step 8: Commit**

```bash
git add src/app/globals.css public/vendor/hljs src/components/ui/MarkdownRenderer.tsx
git commit -m "fix: vendor KaTeX + highlight.js CSS locally (remove jsDelivr CDN)

Honors the 'nothing leaves your machine' claim and fixes offline rendering;
aligns CSS with installed package versions.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `buildObsidianUri` helper — fix hardcoded `vault=Obsidian`

**Files:**
- Create: `src/lib/obsidian-uri.ts`
- Create: `src/lib/obsidian-uri.test.ts`
- Modify: `src/components/DetailPage.tsx:366` (and confirm `useVault` is available)
- Modify: `src/components/ui/MarkdownRenderer.tsx:98-107` (the `preprocessWikiLinks` obsidian URL)

**Interfaces:**
- Produces: `buildObsidianUri(vaultName: string | undefined, filePath: string): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/obsidian-uri.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildObsidianUri } from "./obsidian-uri";

describe("buildObsidianUri", () => {
  it("uses the provided vault name, URI-encoded", () => {
    expect(buildObsidianUri("My Vault", "notes/a.md")).toBe(
      "obsidian://open?vault=My%20Vault&file=notes%2Fa.md"
    );
  });
  it("falls back to 'Obsidian' when name is empty/undefined", () => {
    expect(buildObsidianUri(undefined, "a.md")).toBe(
      "obsidian://open?vault=Obsidian&file=a.md"
    );
    expect(buildObsidianUri("", "a.md")).toBe(
      "obsidian://open?vault=Obsidian&file=a.md"
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit -- src/lib/obsidian-uri.test.ts`
Expected: FAIL — cannot find module `./obsidian-uri`.

- [ ] **Step 3: Implement `src/lib/obsidian-uri.ts`**

```ts
/** Build an `obsidian://open` deep link for the given vault + file path. */
export function buildObsidianUri(vaultName: string | undefined, filePath: string): string {
  const name = vaultName && vaultName.trim() ? vaultName : "Obsidian";
  return `obsidian://open?vault=${encodeURIComponent(name)}&file=${encodeURIComponent(filePath)}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit -- src/lib/obsidian-uri.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it in `DetailPage.tsx`**

Add imports (DetailPage is a client component):
```ts
import { useVault } from "@/lib/hooks/useVault";
import { buildObsidianUri } from "@/lib/obsidian-uri";
```
Inside the component, add `const vault = useVault();` near the other hooks, then replace line 366:
```ts
  const obsidianUrl = buildObsidianUri(vault.name, path);
```

- [ ] **Step 6: Use it in `MarkdownRenderer.tsx`**

`MarkdownRenderer` is presentational with no vault context, and its `obsidian://` preprocessor variant is only used when there's no `onNavigate`. Add an optional prop and thread the name through. In the component's props type add:
```ts
  vaultName?: string;
```
Replace `preprocessWikiLinks` (lines 98-107) to accept the name:
```ts
import { buildObsidianUri } from "@/lib/obsidian-uri";

function preprocessWikiLinks(markdown: string, vaultName?: string): string {
  return markdown.replace(/\[\[([^\]]+)\]\]/g, (_m, linkText: string) => {
    const url = buildObsidianUri(vaultName, linkText);
    return `[${linkText}](${url})`;
  });
}
```
Then update any call site of `preprocessWikiLinks(...)` inside the component to pass `vaultName`. (Grep the file for `preprocessWikiLinks(` — there may be exactly one call, or none if only the `vault://` `preprocessWikiLinksDataAttr` variant is currently wired. Replacing the literal inside the function body is what matters: it removes the `vault=Obsidian` string so the final-verification grep passes. The `vault://` variant used with `onNavigate` is unaffected and is fixed in Task 7.)

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm run test:unit && npm run build`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/obsidian-uri.ts src/lib/obsidian-uri.test.ts src/components/DetailPage.tsx src/components/ui/MarkdownRenderer.tsx
git commit -m "fix: use real vault name in Open-in-Obsidian links

DetailPage and MarkdownRenderer hardcoded vault=Obsidian; now derive it from
the connected vault via one tested buildObsidianUri helper.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Wiki-link resolution (alias/anchor split + resolve before navigate)

Fixes wiki-links that 404 because the raw display text (e.g. `[[Q3 Plan]]`) is passed straight to navigation instead of being resolved to `projects/q3-plan.md`.

**Files:**
- Create: `src/lib/markdown/wikilink.ts`
- Create: `src/lib/markdown/wikilink.test.ts`
- Modify: `src/lib/vault-reader.ts` (`resolveLink` — add a normalized fallback)
- Modify: `src/components/ui/MarkdownRenderer.tsx` (vault-link click handler resolves first)

**Interfaces:**
- Produces:
  - `parseWikiTarget(inner: string): { target: string; alias: string | null; anchor: string | null }`
  - `resolveLink(input)` gains a space↔hyphen, case-insensitive basename fallback.

- [ ] **Step 1: Write the failing tests for `parseWikiTarget`**

Create `src/lib/markdown/wikilink.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseWikiTarget } from "./wikilink";

describe("parseWikiTarget", () => {
  it("plain target", () => {
    expect(parseWikiTarget("Q3 Plan")).toEqual({ target: "Q3 Plan", alias: null, anchor: null });
  });
  it("alias", () => {
    expect(parseWikiTarget("q3-plan|Q3 Plan")).toEqual({ target: "q3-plan", alias: "Q3 Plan", anchor: null });
  });
  it("heading anchor", () => {
    expect(parseWikiTarget("note#Section")).toEqual({ target: "note", alias: null, anchor: "Section" });
  });
  it("block anchor", () => {
    expect(parseWikiTarget("note#^abc123")).toEqual({ target: "note", alias: null, anchor: "^abc123" });
  });
  it("alias + anchor together", () => {
    expect(parseWikiTarget("note#Sec|Label")).toEqual({ target: "note", alias: "Label", anchor: "Sec" });
  });
  it("trims whitespace", () => {
    expect(parseWikiTarget("  a  |  b  ")).toEqual({ target: "a", alias: "b", anchor: null });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit -- src/lib/markdown/wikilink.test.ts`
Expected: FAIL — cannot find module `./wikilink`.

- [ ] **Step 3: Implement `src/lib/markdown/wikilink.ts`**

```ts
export interface WikiTarget {
  target: string;
  alias: string | null;
  anchor: string | null;
}

/**
 * Parse the inner text of a `[[...]]` wiki-link into its parts.
 * Forms: `target`, `target|alias`, `target#anchor`, `target#anchor|alias`.
 * A leading `^` on the anchor denotes a block reference.
 */
export function parseWikiTarget(inner: string): WikiTarget {
  let rest = inner.trim();
  let alias: string | null = null;
  const pipe = rest.indexOf("|");
  if (pipe !== -1) {
    alias = rest.slice(pipe + 1).trim() || null;
    rest = rest.slice(0, pipe).trim();
  }
  let anchor: string | null = null;
  const hash = rest.indexOf("#");
  if (hash !== -1) {
    anchor = rest.slice(hash + 1).trim() || null;
    rest = rest.slice(0, hash).trim();
  }
  return { target: rest, alias, anchor };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit -- src/lib/markdown/wikilink.test.ts`
Expected: PASS.

- [ ] **Step 5: Add normalized fallback to `resolveLink`**

In `src/lib/vault-reader.ts`, the Tier-4 basename-index block is `resolveLink` lines **872-887** (the `try { ... } catch { /* fall through */ }` immediately before `return null;`). It currently does only an exact lowercased-basename `index.get(key)` lookup. Replace that entire `try`/`catch` block with the version below, which adds a space↔hyphen, case-insensitive scan after the exact lookup misses (`key`, `trimmed`, `anchor`, `index`, `buildBasenameIndex`, `root` are all already in scope):

```ts
  try {
    const index = await buildBasenameIndex(root);
    const lastSegment = (trimmed.includes("/") ? trimmed.split("/").pop() : trimmed) || trimmed;
    const key = (lastSegment.endsWith(".md") ? lastSegment.slice(0, -3) : lastSegment).toLowerCase();
    const hits = index.get(key);
    if (hits && hits.length > 0) {
      // For nested paths, prefer hits that match the full path structure.
      const fullKey = trimmed.toLowerCase().replace(/\.md$/, "");
      const structuralMatch = hits.find((h) => h.toLowerCase().includes(fullKey));
      const best = structuralMatch || [...hits].sort((a, b) => a.length - b.length)[0];
      return anchor ? best + "#" + anchor : best;
    }
    // Normalized fallback: treat spaces and hyphens as equivalent so a
    // display-text link like "Q3 Plan" matches a file named "q3-plan.md".
    const normalize = (s: string) => s.toLowerCase().replace(/[\s-]+/g, " ").trim();
    const wanted = normalize(key);
    for (const [k, paths] of index) {
      if (paths.length > 0 && normalize(k) === wanted) {
        const best = [...paths].sort((a, b) => a.length - b.length)[0];
        return anchor ? best + "#" + anchor : best;
      }
    }
  } catch { /* fall through */ }
```

- [ ] **Step 6: Add a resolveLink normalization test**

Create `src/lib/vault-reader.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { setVaultPath, resolveLink } from "./vault-reader";

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cipher-resolve-"));
  await mkdir(join(root, "projects"), { recursive: true });
  await writeFile(join(root, "projects/q3-plan.md"), "# Q3");
  setVaultPath(root);
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

describe("resolveLink normalized fallback", () => {
  it("matches display text with spaces to a hyphenated file, case-insensitively", async () => {
    expect(await resolveLink("Q3 Plan")).toBe("projects/q3-plan.md");
  });
  it("returns null for a genuine miss", async () => {
    expect(await resolveLink("does not exist xyz")).toBeNull();
  });
});
```

- [ ] **Step 7: Run to verify pass**

Run: `npm run test:unit -- src/lib/vault-reader.test.ts`
Expected: PASS — both tests pass.

- [ ] **Step 8: Resolve before navigating in `MarkdownRenderer.tsx`**

In the `a` component's `vault://` branch (lines ~291-307), change the click handler to parse the target, resolve via `/api/resolve`, then navigate (falling back to the raw target so DetailPage's friendly 404 still shows on a true miss). Add the import:
```ts
import { parseWikiTarget } from "@/lib/markdown/wikilink";
```
Replace the click handler:
```ts
                  onClick={async (e) => {
                    e.preventDefault();
                    const raw = decodeURIComponent(href.replace("vault://", ""));
                    const { target, anchor } = parseWikiTarget(raw);
                    let dest = target;
                    try {
                      const res = await fetch(`/api/resolve?path=${encodeURIComponent(target)}`, { cache: "no-store" });
                      if (res.ok) {
                        const data = (await res.json()) as { resolved: string | null };
                        if (data.resolved) dest = data.resolved;
                      }
                    } catch {
                      /* fall back to raw target; DetailPage shows a friendly 404 */
                    }
                    onNavigate(anchor ? `${dest}#${anchor}` : dest);
                  }}
```
Note: this assumes `onNavigate(path)` already tolerates a trailing `#anchor` (DetailPage strips/uses it via `useSheet`). If `onNavigate` does not, pass `dest` only and leave anchor handling to Phase 1.

- [ ] **Step 9: Verify**

Run: `npm run typecheck && npm run test:unit && npm run build`
Expected: all green.

- [ ] **Step 10: Manual verify**

`npm run dev`, open a note with `[[Some Existing Note]]` written as display text; click it; confirm it opens the right note instead of a 404.

- [ ] **Step 11: Commit**

```bash
git add src/lib/markdown/wikilink.ts src/lib/markdown/wikilink.test.ts src/lib/vault-reader.ts src/lib/vault-reader.test.ts src/components/ui/MarkdownRenderer.tsx
git commit -m "fix: resolve wiki-links before navigation (alias/anchor split + fuzzy basename)

[[Q3 Plan]] now resolves to projects/q3-plan.md via /api/resolve and a
space/hyphen/case-insensitive basename fallback, instead of 404ing.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Real `/api/browse/hints` endpoint

Replaces the silently-404ing fetch + fake "Alice / Q3 plan" fallback chips with real, vault-derived suggestions.

**Files:**
- Create: `src/lib/builders/hints.ts`
- Create: `src/lib/builders/hints.test.ts`
- Create: `src/app/api/browse/hints/route.ts`
- Modify: `src/components/chat/ChatEmptyState.tsx:21-54`

**Interfaces:**
- Produces:
  - `buildHints(entities: string[], projects: string[]): { entities: string[]; projects: string[] }` (pure shaping/dedup/limit)
  - `GET /api/browse/hints` → `{ entities: string[]; projects: string[] }`

- [ ] **Step 1: Write the failing test for the pure shaper**

Create `src/lib/builders/hints.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildHints } from "./hints";

describe("buildHints", () => {
  it("dedups, trims, and caps to 5 each", () => {
    const r = buildHints(
      [" Alice ", "Alice", "Bob", "C", "D", "E", "F"],
      ["P1", "P1", "P2"]
    );
    expect(r.entities).toEqual(["Alice", "Bob", "C", "D", "E"]);
    expect(r.projects).toEqual(["P1", "P2"]);
  });
  it("drops empties", () => {
    expect(buildHints(["", "  ", "X"], [])).toEqual({ entities: ["X"], projects: [] });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit -- src/lib/builders/hints.test.ts`
Expected: FAIL — cannot find module `./hints`.

- [ ] **Step 3: Implement `src/lib/builders/hints.ts`**

```ts
import "server-only";

/** Shape raw entity/project name lists into deduped, trimmed, capped hints. */
export function buildHints(
  entities: string[],
  projects: string[]
): { entities: string[]; projects: string[] } {
  const clean = (xs: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of xs) {
      const v = raw.trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
      if (out.length >= 5) break;
    }
    return out;
  };
  return { entities: clean(entities), projects: clean(projects) };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit -- src/lib/builders/hints.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the route `src/app/api/browse/hints/route.ts`**

```ts
/** GET /api/browse/hints — vault-derived suggestion chips for the chat empty state. */
import { NextResponse } from "next/server";
import { getVaultPath } from "@/lib/vault-reader";
import { getEntityIndex, getProjectIndex } from "@/lib/vault-indexes";
import { buildHints } from "@/lib/builders/hints";
import { log } from "@/lib/log";

export async function GET() {
  try {
    if (!getVaultPath()) {
      return NextResponse.json({ entities: [], projects: [] }, { status: 409 });
    }
    const [entities, projects] = await Promise.all([getEntityIndex(), getProjectIndex()]);
    // getEntityIndex/getProjectIndex both return IndexEntry[] (view-models.ts),
    // where `name: string` is required.
    return NextResponse.json(
      buildHints(entities.map((e) => e.name), projects.map((p) => p.name))
    );
  } catch (error) {
    log.error("hints", "API error", error);
    return NextResponse.json({ entities: [], projects: [] }, { status: 500 });
  }
}
```

- [ ] **Step 6: Update `ChatEmptyState.tsx` to drop fake names**

Replace `FALLBACK_HINTS` (lines 21-25) with neutral, vault-agnostic defaults:
```ts
const FALLBACK_HINTS = [
  "summarise this week",
  "what changed recently",
  "what should I focus on",
];
```
The existing `useEffect` (lines 31-54) already consumes `data.entities` / `data.projects`; it now receives real data, and when the endpoint returns empties it keeps the neutral fallbacks (no more "Alice"/"Q3 plan").

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm run test:unit && npm run build`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/builders/hints.ts src/lib/builders/hints.test.ts src/app/api/browse/hints/route.ts src/components/chat/ChatEmptyState.tsx
git commit -m "fix: implement /api/browse/hints with real vault entities/projects

Removes the always-404 fetch and the fake 'Alice / Q3 plan' fallback chips
every user was shown; replaces them with vault-derived suggestions.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Fix the misrouted `/files` slash command

**Files:**
- Modify: `src/components/SlashCommandMenu.tsx:70-76`

**Interfaces:** none new.

- [ ] **Step 1: Point `/files` at the file tree**

Replace the `files` command's `run` (line 75) so it routes to the file-tree route instead of `/browse`:
```ts
    run: ({ router }) => router.push("/files"),
```
Leave `/today` as-is (`/browse` IS the Today landing, which is correct).

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run build`
Expected: green.

- [ ] **Step 3: Manual verify**

`npm run dev`, open the chat composer, type `/files`, run it; confirm it lands on the file-tree browser (`/files`), not the Today dashboard.

- [ ] **Step 4: Commit**

```bash
git add src/components/SlashCommandMenu.tsx
git commit -m "fix: /files slash command routes to the file tree, not Today

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Invalidate graph/health/tree caches on write

**Files:**
- Create: `src/lib/cache/write-invalidation.ts`
- Modify: `src/app/api/file/route.ts` (replace the two `invalidateVaultTreeCache()` calls)
- Modify: `src/app/api/toggle/route.ts` (add invalidation after the write)

**Interfaces:**
- Produces: `invalidateAfterWrite(): void` — clears tree + graph + health caches.

- [ ] **Step 1: Implement `src/lib/cache/write-invalidation.ts`**

```ts
import "server-only";
import { invalidateGraphCache } from "@/lib/vault-graph";
import { invalidateHealthCache } from "@/lib/vault-health";
import { invalidateVaultTreeCache } from "@/app/api/vault/tree/route";

/**
 * Clear all derived caches that go stale after a vault file write.
 * vault-reader's own file cache is mtime-keyed and self-heals; the graph,
 * health and tree caches are not, so they must be cleared explicitly.
 */
export function invalidateAfterWrite(): void {
  invalidateVaultTreeCache();
  invalidateGraphCache();
  invalidateHealthCache();
}
```

- [ ] **Step 2: Use it in `/api/file` PUT**

In `src/app/api/file/route.ts`, replace the import `import { invalidateVaultTreeCache } from "@/app/api/vault/tree/route";` with:
```ts
import { invalidateAfterWrite } from "@/lib/cache/write-invalidation";
```
Replace both `invalidateVaultTreeCache();` calls (lines ~116 and ~134) with `invalidateAfterWrite();`.

- [ ] **Step 3: Use it in `/api/toggle` POST**

In `src/app/api/toggle/route.ts`, add the import and call it right after the `writeFile` (line ~53):
```ts
import { invalidateAfterWrite } from "@/lib/cache/write-invalidation";
```
```ts
    await writeFile(absPath, lines.join("\n"), "utf-8");
    invalidateAfterWrite();
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: green. (No circular-import error: `write-invalidation.ts` imports the tree route's named export, which is the existing pattern `/api/file` already used.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/cache/write-invalidation.ts src/app/api/file/route.ts src/app/api/toggle/route.ts
git commit -m "fix: invalidate graph/health/tree caches after file + toggle writes

Graph and health caches previously never cleared on write, so the graph and
System page showed stale data after edits; /api/toggle cleared nothing at all.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Remove personal infrastructure scripts

**Files:**
- Delete: `scripts/context-sync-calendar.js`
- Delete: `scripts/memory-diff-check.js`

**Interfaces:** none.

- [ ] **Step 1: Confirm nothing in the app references them**

Run: `grep -rn "context-sync-calendar\|memory-diff-check" src package.json bin || echo "NO REFERENCES"`
Expected: `NO REFERENCES`.

- [ ] **Step 2: Delete the scripts (and the dir if now empty)**

```bash
cd ~/Developer/Cipher
rm scripts/context-sync-calendar.js scripts/memory-diff-check.js
rmdir scripts 2>/dev/null || true
```

- [ ] **Step 3: Verify build still works**

Run: `npm run build`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove author's personal cron scripts from the public repo

context-sync-calendar.js / memory-diff-check.js hardcoded private iCloud UUIDs,
an email, secrets paths, and an uninstalled rrule dep; unrelated to Cipher.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Fix stale references in `docs/ARCHITECTURE.md`

**Files:**
- Modify: `docs/ARCHITECTURE.md` (lines 73, 82, 96, 119)

**Interfaces:** none.

- [ ] **Step 1: Remove the dead `mock-data.ts` / `USE_REAL_DATA` row**

Delete line 73 entirely:
```
| `mock-data.ts` | Fallback + test data. Only used when `USE_REAL_DATA=false`. |
```
(The app is real-data-only; no such file or flag exists.)

- [ ] **Step 2: Remove the dead `VaultDrawer.tsx` bullet**

Delete line 82:
```
- `VaultDrawer.tsx` — file-tree drawer with optional `scopedPath` for pin-click.
```

- [ ] **Step 3: Fix the dead `/api/vault/structure` reference**

Replace line 96:
```
- `/api/vault/{graph,structure,folders}` → per-surface vault metadata.
```
with the real endpoints:
```
- `/api/vault/{graph,folders,index}` → per-surface vault metadata.
```

- [ ] **Step 4: Remove the dead `CONTRIBUTING.md` reference**

In line 119, delete the trailing sentence `See \`CONTRIBUTING.md\` for the full rules.` (no such file exists). Keep the rest of the line.

- [ ] **Step 5: Verify no remaining dead references**

Run:
```bash
grep -n "mock-data\|USE_REAL_DATA\|VaultDrawer\|vault/structure\|CONTRIBUTING" docs/ARCHITECTURE.md || echo "ALL DEAD REFS REMOVED"
```
Expected: `ALL DEAD REFS REMOVED`.

- [ ] **Step 6: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: remove stale ARCHITECTURE.md references to deleted files

mock-data.ts, USE_REAL_DATA, VaultDrawer.tsx, /api/vault/structure, CONTRIBUTING.md
no longer exist.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (run after all tasks)

- [ ] `npm run typecheck` — exit 0
- [ ] `npm run lint` — exit 0
- [ ] `npm run test:unit` — all suites pass
- [ ] `npm run build` — succeeds
- [ ] `grep -rn "cdn.jsdelivr.net" src` — no results
- [ ] `grep -rn "vault=Obsidian" src` — no results (all via `buildObsidianUri`)
- [ ] Manual smoke on `public/sample-vault`: math + code render styled; a display-text wiki-link opens the right note; `/files` command lands on the file tree; chat empty state shows no "Alice / Q3 plan".

## Spec coverage (this plan vs. the design spec §6)

| Spec §6 item | Task |
|---|---|
| Vitest + scripts | 1 |
| Shared `walkMd` | 2 |
| Shared `safeJoin` + write-path guard | 3 |
| Real YAML frontmatter parser | 4 |
| Vendor KaTeX + hljs CSS | 5 |
| Wiki-links via `/api/resolve` | 7 |
| `vault=Obsidian` → real name | 6 |
| `/api/browse/hints` (real, drop fake chips) | 8 |
| Misrouted `/files` command | 9 |
| Graph/health cache invalidation on write | 10 |
| Remove personal scripts | 11 |
| Stale `docs/ARCHITECTURE.md` | 12 |
| Minimal search-render fix so results show | **Deferred to Phase 3** (full search unification) — see note below |

**Note on the search kind-mismatch:** the spec listed a "minimal fix to render results now" in Phase 0. On review, a partial fix (e.g. adding `"other"` buckets to both consumers) would be thrown away by the Phase 3 unification one phase later, and risks masking the real mismatch. It is therefore folded into Phase 3's single correct fix. If you want search results visible before Phase 3, add a one-line `"other"` bucket to `SearchPage.tsx`'s `order` array as a stopgap; otherwise it is intentionally left for Phase 3.
