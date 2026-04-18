# Open-source Readability Pass (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the codebase easy for a new contributor to navigate. Tiny debug-gated logger replaces scattered `console.*`; every raw `any` becomes a concrete type or `unknown` + named validator; every source file gains a 1–4 line TSDoc header; non-obvious exports get TSDoc. Zero behaviour change.

**Architecture:** Four orthogonal sweeps, one commit each. No file splits. No new deps. Logger lands first so the any-sweep migration in Task 2 can rewrite both `console.warn` call sites and the `any` around them at the same time.

**Tech Stack:** TypeScript strict, Next.js 16 App Router, React 19. Verification is `npx tsc --noEmit` + grep checks + routes 200 (no test framework).

**Branch:** `v13-readability-pass` from `master`. Four commits total.

---

## File structure

**New files:**

| File | Responsibility |
|---|---|
| `src/lib/log.ts` | Debug-gated `log.debug/info/warn/error` with scope prefix |

**Files modified (no structural changes, no splits):**

- Task 1 — 13 files with `console.*`: see full list in Task 1.
- Task 2 — 14 files with raw `any`: see full list in Task 2.
- Task 3 — 68 files missing a `/**` header: enumerated script in Task 3.
- Task 4 — ~25 files with non-obvious exports: per-module list in Task 4.

Many files get touched by 2+ tasks. Each task edits only its own concern; final state of each file only lands after all relevant tasks commit.

---

## Task 0: Branch setup

- [ ] **Step 0.1: Verify clean tree on master**

```bash
git status
git log --oneline master -1
```

Expected: working tree clean, on `master`, latest commit is whatever the most recent thing is.

- [ ] **Step 0.2: Create feature branch**

```bash
git checkout -b v13-readability-pass
git branch --show-current
```

Expected: `v13-readability-pass`.

---

## Task 1: Logger + console.* migration

**Files:**
- Create: `src/lib/log.ts`
- Modify (13 files, 17 call sites):
  - `src/app/api/resolve/route.ts:30`
  - `src/app/api/file/route.ts:61,113`
  - `src/app/api/today/route.ts:18`
  - `src/app/api/query/route.ts:33,98`
  - `src/app/api/vault/graph/route.ts:21`
  - `src/app/api/vault/structure/route.ts:98`
  - `src/components/ChatInterface.tsx:343`
  - `src/lib/view-builder.ts:669`
  - `src/lib/settings.ts:34`
  - `src/lib/hooks/useSidebarPins.ts:51,61,71,80`
  - `src/lib/mock-data.ts:49,60`

### Step 1.1: Create `src/lib/log.ts`

```ts
/**
 * Tiny debug-gated logger. Production silences debug + info; warn + error
 * always pass through because they are real signals worth reading.
 * Toggle verbose mode with NEXT_PUBLIC_CIPHER_DEBUG=1 in .env.local.
 */
const verbose =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_CIPHER_DEBUG === "1";

type Scope = string;

function format(scope: Scope, msg: string): string {
  return `[${scope}] ${msg}`;
}

export const log = {
  debug(scope: Scope, msg: string, ...data: unknown[]) {
    if (!verbose) return;
    console.debug(format(scope, msg), ...data);
  },
  info(scope: Scope, msg: string, ...data: unknown[]) {
    if (!verbose) return;
    console.info(format(scope, msg), ...data);
  },
  warn(scope: Scope, msg: string, ...data: unknown[]) {
    console.warn(format(scope, msg), ...data);
  },
  error(scope: Scope, msg: string, ...data: unknown[]) {
    console.error(format(scope, msg), ...data);
  },
};
```

### Step 1.2: Migrate each `console.*` call

For every call site listed above, replace `console.<level>(…)` with `log.<level>("<scope>", "<message>", …data)`. Scope = module basename without extension (e.g. `api/resolve` → `"resolve"`, `hooks/useSidebarPins` → `"sidebar-pins"`, `lib/settings` → `"settings"`). Add `import { log } from "@/lib/log";` at the top of each file.

Exact rewrites (apply verbatim — each is a targeted Edit call per file):

**`src/app/api/resolve/route.ts:30`**

```ts
// before
console.error("Resolve API error:", error);
// after
log.error("resolve", "API error", error);
```

**`src/app/api/file/route.ts:61`**

```ts
// before
console.error("File API error:", error);
// after
log.error("file", "GET error", error);
```

**`src/app/api/file/route.ts:113`**

```ts
// before
console.error("File PUT error:", error);
// after
log.error("file", "PUT error", error);
```

**`src/app/api/today/route.ts:18`**

```ts
// before
console.error("Today API error:", error);
// after
log.error("today", "API error", error);
```

**`src/app/api/query/route.ts:33`**

```ts
// before
console.error("Query API GET error:", error);
// after
log.error("query", "GET error", error);
```

**`src/app/api/query/route.ts:98`**

```ts
// before
console.error("Query API error:", error);
// after
log.error("query", "POST error", error);
```

**`src/app/api/vault/graph/route.ts:21`**

```ts
// before
console.error("Graph API error:", error);
// after
log.error("vault-graph", "API error", error);
```

**`src/app/api/vault/structure/route.ts:98`**

```ts
// before
console.error("Vault structure API error:", error);
// after
log.error("vault-structure", "API error", error);
```

**`src/components/ChatInterface.tsx:343`**

```ts
// before
console.error("handleSubmit fetch error:", err);
// after
log.error("chat", "handleSubmit fetch failed", err);
```

**`src/lib/view-builder.ts:669`**

```ts
// before
console.warn("Vault health scan failed:", e);
// after
log.warn("view-builder", "vault health scan failed", e);
```

**`src/lib/settings.ts:34`**

```ts
// before
console.warn("[settings] malformed sidebar.json — returning empty config");
// after
log.warn("settings", "malformed sidebar.json — returning empty config");
```

**`src/lib/hooks/useSidebarPins.ts:51,61,71,80`** — the four error callbacks. Replace the whole `.catch((e) => console.error("[sidebar-pins] <op> failed:", e))` with `.catch((e) => log.error("sidebar-pins", "<op> failed", e))`. Four sites, one per op: `add`, `remove`, `update`, `reorder`.

**`src/lib/mock-data.ts:49`**

```ts
// before
console.warn(`fetchRealData: API returned ${res.status} ${res.statusText} for query "${query}"`);
// after
log.warn("mock-data", `fetchRealData API returned ${res.status} ${res.statusText}`, { query });
```

**`src/lib/mock-data.ts:60`**

```ts
// before
console.warn(`fetchRealData: Failed to fetch real data for query "${query}"`, error);
// after
log.warn("mock-data", "fetchRealData failed", { query, error });
```

### Step 1.3: Verify

```bash
npx tsc --noEmit
```

Expected: clean (no output).

```bash
grep -rnE "console\.(log|info|debug|warn|error)" src/ | grep -v "src/lib/log.ts"
```

Expected: no output.

```bash
for r in /browse /browse/system /browse/timeline /browse/graph /chat; do
  curl -s -o /dev/null -w "$r %{http_code}\n" "http://localhost:3000$r"
done
```

Expected: every line ends with `200`.

### Step 1.4: Commit

```bash
git add src/lib/log.ts src/app/api src/components/ChatInterface.tsx src/lib/view-builder.ts src/lib/settings.ts src/lib/hooks/useSidebarPins.ts src/lib/mock-data.ts
git commit -m "feat(log): debug-gated logger; migrate 17 console.* call sites

New src/lib/log.ts exposes log.debug/info/warn/error with a scope
prefix. debug + info silenced in production unless
NEXT_PUBLIC_CIPHER_DEBUG=1; warn + error always pass through.

All 17 existing console.* calls migrated. Every site now reads as
log.<level>(<module-scope>, <what>, <data>). No behavior change.
"
```

---

## Task 2: `any` sweep

**Files modified (14):**

- `src/app/api/vault/structure/route.ts` (3 hits)
- `src/components/ui/HoverCard.tsx` (6 hits — React.cloneElement pattern)
- `src/components/ui/MarkdownRenderer.tsx` (2 hits — remark component props)
- `src/components/VaultDrawer.tsx` (1 hit)
- `src/components/views/ViewRenderer.tsx` (4 hits)
- `src/components/views/SystemStatusView.tsx` (1 hit — `view: any`)
- `src/components/views/TopicOverviewView.tsx` (1 hit)
- `src/components/views/CurrentWorkView.tsx` (1 hit)
- `src/components/views/EntityOverviewView.tsx` (1 hit)
- `src/components/views/TimelineView.tsx` (1 hit)
- `src/components/views/SearchResultsView.tsx` (1 hit)

Note: `src/components/AppShell.tsx:23` matches `:\s*any\b` inside a comment (`any descendant can push`). That's a false positive — grep will find it but it's not a type annotation. Ignore.

Full grep at spec time returned 24 hits; 1 is the AppShell false positive, leaving 23 real hits across 11 files. Some files have multiple hits that collapse into a single Edit.

### Step 2.1: `views/*.tsx` — replace `view: any` with `ViewModel`

Every view component takes `view: any` as a prop; the type already exists at `src/lib/view-models.ts` as `ViewModel`. One targeted replacement per file.

For each of these 6 files, change the component signature:

```tsx
// before
({ data, view, … }: { data: SomethingData; view: any; … })
// after
({ data, view, … }: { data: SomethingData; view: ViewModel; … })
```

And add `ViewModel` to the existing `import { … } from "@/lib/view-models";` line.

Files:
- `src/components/views/SystemStatusView.tsx:54`
- `src/components/views/TopicOverviewView.tsx:15`
- `src/components/views/CurrentWorkView.tsx:20`
- `src/components/views/EntityOverviewView.tsx:17`
- `src/components/views/TimelineView.tsx:18`
- `src/components/views/SearchResultsView.tsx:29`

### Step 2.2: `views/ViewRenderer.tsx` — tighten the component map

Current (line 20 + 27-29):

```tsx
const viewComponents: Record<ViewType, React.ComponentType<{ data: any; view: ViewModel; onToggle?: …; onAsk?: …; onNavigate?: … }>> = {
  …
  browse_entities: ({ data }: { data: any; view: any }) => <BrowseView data={data} />,
  browse_projects: ({ data }: { data: any; view: any }) => <BrowseView data={data} />,
  browse_research: ({ data }: { data: any; view: any }) => <BrowseView data={data} />,
};
```

Replace with:

```tsx
type ViewComponentProps = {
  data: unknown;
  view: ViewModel;
  onToggle?: (itemId: string, checked: boolean) => void;
  onAsk?: (query: string) => void;
  onNavigate?: (path: string) => void;
};

const viewComponents: Record<ViewType, React.ComponentType<ViewComponentProps>> = {
  …
  browse_entities: ({ data }) => <BrowseView data={data as BrowseIndexData} />,
  browse_projects: ({ data }) => <BrowseView data={data as BrowseIndexData} />,
  browse_research: ({ data }) => <BrowseView data={data as BrowseIndexData} />,
};
```

Add `BrowseIndexData` to the `from "@/lib/view-models"` import if it isn't already.

### Step 2.3: `api/vault/structure/route.ts` — type the map callbacks

The file maps over indexes from vault-reader. Those indexes are typed:

- `getEntityIndex()` returns `IndexEntry[]`
- `getProjectIndex()` returns `IndexEntry[]`
- `getResearchProjects()` returns `ResearchProject[]`

Import both types:

```ts
import type { IndexEntry, ResearchProject } from "@/lib/view-models";
```

Replace:

```ts
// line 68 — before
items: entities.map((e: any) => ({ name: e.name, path: e.path, type: e.type })),
// after
items: entities.map((e: IndexEntry) => ({ name: e.name, path: e.path, type: e.type })),

// line 75 — before
items: projects.map((p: any) => ({ name: p.name, path: p.path })),
// after
items: projects.map((p: IndexEntry) => ({ name: p.name, path: p.path })),

// line 82 — before
items: research.map((r: any) => ({ name: r.name, path: r.dir })),
// after
items: research.map((r: ResearchProject) => ({ name: r.name, path: r.dir })),
```

### Step 2.4: `src/components/VaultDrawer.tsx:109` — type the research map

```ts
// before
if (data.research?.length) s.push({ key: "research", label: "Research", icon: sectionIcons.research, items: data.research.map((r: any) => ({ name: r.name, path: r.dir })) });
// after
if (data.research?.length) s.push({ key: "research", label: "Research", icon: sectionIcons.research, items: data.research.map((r: { name: string; dir: string }) => ({ name: r.name, path: r.dir })) });
```

The inline object type is fine; this is already a local destructure. A named import could replace it, but YAGNI — the shape is obvious from the usage.

### Step 2.5: `src/components/ui/MarkdownRenderer.tsx` — remark component props

react-markdown passes a `node` prop that isn't in standard JSX. Use `any` → `unknown` won't work because we actually need to destructure `children`/`className`/other props. Replace with proper typing using `ComponentPropsWithoutRef`:

```tsx
// line 226 — before
li: ({ children, node, ...props }: any) => {
// after
li: ({ children, ...props }: React.ComponentPropsWithoutRef<"li">) => {
```

Note: drop the `node` destructure — we never use it. Same for the code block below.

```tsx
// line 273 — before
code: ({ className, children, ...props }: any) => {
// after
code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<"code">) => {
```

If tsc complains that react-markdown's actual component signature has `node` as a required prop, restore the original signature using react-markdown's types:

```tsx
import type { Components } from "react-markdown";
const components: Components = { … };
```

Try `ComponentPropsWithoutRef` first; if that fails, fall back to the `Components` type import.

### Step 2.6: `src/components/ui/HoverCard.tsx` — React.cloneElement pattern

Six `as any` casts around `cloneElement`. The pattern itself is TypeScript-hostile because the child's prop shape is unknown at compile time. Tighten to `React.ReactElement<TriggerProps>` where `TriggerProps` captures the handlers we actually read:

```tsx
type TriggerProps = {
  ref?: React.Ref<HTMLElement>;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
};

// Cast the child once at the top of the render. Every downstream access
// is type-checked against TriggerProps.
const trigger = children as React.ReactElement<TriggerProps>;
```

Then every `(children as any).prop` / `(children.props as any).prop` becomes `trigger.props.prop` or `trigger.ref` (untyped ref can stay — React's `ref` types are notoriously hard to get right on polymorphic children; allowed per ESLint for react-cloneElement patterns).

If one `as any` survives purely for the ref merge and can't be cleanly replaced, keep it with an explicit comment:

```tsx
// React's ref types don't play nicely with cloneElement over unknown children.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const childRef = (children as any).ref;
```

That's the only allowed `any` in the codebase after this sweep — one line with a one-line comment explaining why. Document it in the commit message.

### Step 2.7: Verify

```bash
npx tsc --noEmit
```

Expected: clean.

```bash
grep -rnE ":\s*any\b|as\s+any\b|any\[\]|<any[,>]" src/ | grep -v "useSheet:" | grep -v "eslint-disable-next-line.*no-explicit-any"
```

Expected: no output (the two skip-filters remove the `useSheet: any descendant` comment false positive and the one documented HoverCard exception).

### Step 2.8: Commit

```bash
git add src/app/api src/components
git commit -m "refactor(types): eliminate raw 'any' — unknown + validators

Every raw 'any' across src/ is now a concrete type (or unknown
with a type guard). 23 sites across 11 files:

  views/*.tsx (6)           view: any -> view: ViewModel
  ViewRenderer              data: any -> unknown + cast per map entry
  api/vault/structure       map callbacks typed IndexEntry / ResearchProject
  VaultDrawer               research map typed inline
  MarkdownRenderer          li/code props -> ComponentPropsWithoutRef
  HoverCard                 cloneElement child typed via TriggerProps

One documented exception remains: HoverCard's childRef merge
(React refs are TypeScript-hostile over unknown children). Marked
with an eslint-disable-next-line comment explaining why.
"
```

---

## Task 3: File headers

**Files:** 68 source files without a `/** … */` header as the first non-`use client` non-`import` construct.

### Step 3.1: Enumerate the current offenders

```bash
for f in $(find src -name "*.ts" -o -name "*.tsx" | grep -vE "\.d\.ts$|/ui/index\.ts$" | sort); do
  head -5 "$f" | grep -q "^/\*\*" || echo "$f"
done
```

Expected: ~68 paths. Save the list as your checklist.

### Step 3.2: Apply a header to each file

Use this template:

```ts
/**
 * <One-line purpose in present tense, active voice.>
 *
 * <Optional 1-2 more lines on dependencies / invariants / non-obvious
 *  behaviour. Omit entirely if the one-liner is enough.>
 */
```

Insert position: after any `"use client"` directive, before any `import`. If the file starts with imports, header goes above the imports.

Rules:
- `/** … */` form so TSDoc tooling picks it up. Not `//`.
- Present tense. No "This file …" (implicit).
- No marketing words ("powerful", "amazing"). Plain descriptions.
- Keep it short — 1–4 lines. Re-read after writing; delete anything that's inferable from the export list.

Examples for the heaviest files (copy verbatim):

**`src/lib/vault-reader.ts`**

```ts
/**
 * Reads and parses an Obsidian-style markdown vault.
 *
 * Hot-swappable vault path, layout probe (entities/journal/projects/...),
 * schema-aware readers, wiki-link resolver with basename fallback. Every
 * downstream module (view-builder, vault-health, vault-graph) goes through
 * the helpers here — nothing bypasses this file to touch the filesystem.
 */
```

**`src/lib/view-builder.ts`**

```ts
/**
 * Builds typed view-models from vault data for each detected intent.
 *
 * Given an intent + optional entity/topic name, returns a ViewModel
 * (CurrentWorkData / SystemStatusData / TimelineSynthesisData / …) with
 * the sources, actions, and freshness meta the renderer needs. Vault-
 * agnostic: paths come from getVaultLayout(), never hardcoded.
 */
```

**`src/lib/vault-health.ts`**

```ts
/**
 * Vault health scanner — activity histogram, broken links, stale notes,
 * hubs, folder distribution, link-count distribution.
 *
 * Walks every .md file once per scan. Results cached per-vault for 60s;
 * consumed by /api/query (system_status) and /browse/system.
 */
```

**`src/lib/vault-graph.ts`**

```ts
/**
 * Builds the vault's node-edge graph: every .md file is a node, every
 * resolvable wiki-link is a directed edge. Cached per-vault.
 */
```

**`src/lib/intent-detector.ts`**

```ts
/**
 * Maps a natural-language query to a typed Intent + ViewType.
 *
 * Regex + keyword heuristics; no LLM call. Returns a best-guess intent
 * plus hint files/keywords the builder can use to narrow vault reads.
 */
```

**`src/lib/settings.ts`**

```ts
/**
 * Reads and writes <vault>/.cipher/sidebar.json with schema validation
 * and atomic writes (tmp + rename). Vault-portable user customisation.
 */
```

**`src/lib/today-builder.ts`**

```ts
/**
 * Aggregates today + up-next open tasks from the vault's work folder(s).
 *
 * Returns a ranked list with bucket/status/priority. Consumed by
 * /api/today and /browse (TodayPage).
 */
```

**`src/lib/motion.ts`**

```ts
/**
 * Framer-motion primitives for Cipher — easings, durations, springs,
 * variants. Linear-style: short durations, ease-out, single-axis motion,
 * springs only for physical toggles.
 */
```

**`src/lib/format.ts`**

```ts
/**
 * Tiny string formatters used by renderers — freshness, view-type names,
 * plural helpers. Pure functions; no runtime deps.
 */
```

**`src/lib/log.ts`** — already has a header from Task 1; skip.

**`src/components/ChatInterface.tsx`**

```tsx
/**
 * /chat surface — message list + input + slash commands + hover actions.
 *
 * Submits to /api/query, renders responses via ViewRenderer in
 * chat-summary variant. Slash commands open SlashCommandMenu above the
 * input; empty state uses ChatEmptyState.
 */
```

**`src/components/DetailPage.tsx`**

```tsx
/**
 * DetailPage — URL-driven overlay sheet (?sheet=<path>&anchor=<slug>).
 *
 * Renders a single vault file with TOC + frontmatter badges + inline
 * edit mode. Anchor scrolls + highlights on mount.
 */
```

**`src/components/Sidebar.tsx`**

```tsx
/**
 * Persistent 240px left rail: brand + vault chip, primary nav, Pinned
 * group with user-customisable folder shortcuts, Recent queries, theme
 * + palette toggles. Vault-agnostic; pins live in <vault>/.cipher/.
 */
```

**`src/components/AppShell.tsx`** — already has a header; skip.

**`src/components/VaultDrawer.tsx`**

```tsx
/**
 * File-tree drawer. Optional scopedPath prop roots the drawer at a
 * pinned folder; hover-reveal pin button on folders feeds into
 * useSidebarPins.
 */
```

**`src/components/CommandPalette.tsx`**

```tsx
/**
 * ⌘K command palette with fuzzy-scored actions + grouped sections.
 * Keyboard: ↑↓/jk navigate, Enter runs, Esc closes.
 */
```

**`src/components/SlashCommandMenu.tsx`**

```tsx
/**
 * Floating menu that appears above the chat input when the user starts
 * a message with "/". Each command navigates or runs a query.
 */
```

**`src/components/ChatEmptyState.tsx`**

```tsx
/**
 * Raycast-style empty state for /chat — centered input, no chrome.
 */
```

**`src/components/PageShell.tsx`**

```tsx
/**
 * Chrome for every bespoke page (System, Timeline, Search, Entity,
 * Topic, Today) — 72px header with title + subtitle + right actions
 * slot, optional toolbar row, scrollable content area.
 */
```

**`src/components/HintChip.tsx`**

```tsx
/**
 * Dismissible bottom-right tip chip ("press / to focus"). Persists
 * dismissal in localStorage.
 */
```

**`src/components/ThemeToggle.tsx`**

```tsx
/**
 * Icon button that flips between dark/light theme by toggling the
 * .light class on <html>. Persists choice to localStorage.
 */
```

For every remaining file in the list, write a header in the same style. Target: ~30 seconds per file — one-liner suffices for most UI primitives (`Kbd`, `Badge`, `StatusDot`, `Avatar`, etc.) and most browse pages (`SystemPage`, `TimelinePage`, etc.).

Guidance for common patterns:

- **`src/app/**/page.tsx`** → one-line "Route component — mounts X".
- **`src/app/**/layout.tsx`** → "Layout wrapper for /path/…" if non-trivial.
- **`src/app/api/**/route.ts`** → one line per handler summary.
- **`src/components/ui/*.tsx`** → one-line purpose.
- **`src/components/views/*View.tsx`** → "Renders <ViewModel> for the chat-summary variant".
- **`src/components/browse/*Page.tsx`** → "/browse/<slug> page — <what it shows>".
- **`src/lib/hooks/*.ts`** → what it returns, what it fetches/listens to.

### Step 3.3: Verify

```bash
count=0
for f in $(find src -name "*.ts" -o -name "*.tsx" | grep -vE "\.d\.ts$|/ui/index\.ts$"); do
  head -5 "$f" | grep -q "^/\*\*" || count=$((count + 1))
done
echo "$count files without /** header"
```

Expected: `0 files without /** header`.

```bash
npx tsc --noEmit
```

Expected: clean.

### Step 3.4: Commit

```bash
git add src
git commit -m "docs(headers): 1-4 line TSDoc header on every source file

68 source files (lib/, components/, app/) gained a short header
describing the file's role. Template: present tense, active voice,
no marketing words. UI primitives get a one-liner; files with
cross-module responsibilities (vault-reader, view-builder, …) get
2-4 lines on dependencies + invariants.
"
```

---

## Task 4: TSDoc on non-obvious exports

Walk `src/lib/` and `src/components/` and annotate exports whose signatures don't self-document. Rough target: 60–80 TSDoc comments total.

### Step 4.1: Annotate `src/lib/vault-reader.ts`

The heaviest file — many non-obvious behaviours. Annotate each exported function that isn't self-describing. Specific ones that need comments:

- `getVaultLayout()` — explain the probe, the caching, and that `null` means "no vault connected".
- `setVaultPath()` — document side effects (clears caches, invalidates basename index).
- `readVaultFile()` — `null` semantics + mtime cache behaviour.
- `resolveLink()` — already shown in the spec; copy the spec's example verbatim.
- `extractLinks()` — tolerant of malformed input (returns `[]`).
- `parseCheckboxes()`, `parseKeyValuePairs()`, `parseTable()`, `parseWorkItems()`, `parseStatusChecks()` — each returns an empty array when no match; document that.
- `readWorkOpen()`, `readWorkWaitingFor()`, `readSystemStatus()`, `readOpenLoops()`, `readEntity()`, `readWorkLog()`, `readWorkWeek()`, `readResearchProject()` — probe strategy + null semantics.
- `getHubFiles()`, `getEntityIndex()`, `getJournalIndex()`, `getProjectIndex()`, `getResearchProjects()` — empty-array vs null.
- `listVaultFiles()` — recursive vs shallow, error behaviour.
- `searchVault()` — scoring heuristic, result cap.

Skip the internal helpers (those not `export`ed).

For each, write `/** … */` directly above the function. Example shape:

```ts
/**
 * Read and parse a vault file into a ParsedFile. Returns null when the
 * file doesn't exist or isn't readable. Results are cached by mtime —
 * a second call for an unchanged file hits the cache.
 */
export async function readVaultFile(relPath: string): Promise<ParsedFile | null> { … }
```

### Step 4.2: Annotate `src/lib/view-builder.ts`

- `buildView()` — the central dispatcher. Document the intent → builder mapping.
- Each top-level `build<X>()` function — what it queries, what it returns when the vault doesn't have the expected source.
- `sourceRef()`, `actionRef()` — purpose + invariants.
- `normalizeLinks()` — behaviour when links don't resolve.

### Step 4.3: Annotate `src/lib/vault-health.ts`

- `buildVaultHealth()` — what's scanned, how long the cache lasts, null vs empty-metrics.
- `invalidateHealthCache()` — when to call it (on vault change).

### Step 4.4: Annotate `src/lib/vault-graph.ts`

- `buildGraph()` — cache behaviour, what edges come from (resolved wiki-links only), O(n * avg-links) complexity.
- `invalidateGraphCache()` — call on vault change.

### Step 4.5: Annotate `src/lib/intent-detector.ts`

- `detectIntent()` — what the return shape means, what `confidence` thresholds imply.
- `detectToggleIntent()` — when it fires, what `null` means.

### Step 4.6: Annotate `src/lib/settings.ts`

Already has `readSidebarSettings` + `writeSidebarSettings` fully documented from Task 1 era. Skim; add one-liner to `isValidConfig` and `isValidPin` only if they're exported (they may be internal — skip if so).

### Step 4.7: Annotate `src/lib/today-builder.ts`

- `buildToday()` — aggregation strategy, cap behaviour.
- `isTodayCandidate()` — the heuristic (today/@today/blocked/…).
- `rankTask()` — sort key semantics.

### Step 4.8: Annotate `src/lib/hooks/*.ts`

One TSDoc on every exported hook. Each should say:
- What it returns.
- What runs on mount.
- What persists (localStorage / vault file).
- Mutations that trigger a network call.

Files: `useSidebarPins.ts`, `useSheet.ts`, `useVault.ts`, `useUser.ts`, `useKeyboardShortcuts.ts`, `useListNavigation.ts`.

### Step 4.9: Annotate `src/app/api/**/route.ts`

On each exported handler (`GET`, `POST`, `PUT`, `DELETE`), add a TSDoc describing:
- Request path + query/body shape.
- Response shape.
- Relevant status codes (409 for no vault, 400 for invalid, etc.).

### Step 4.10: Annotate non-obvious component exports

Components whose props interface isn't already commented + have non-trivial lifecycle / Portal / async behaviour:

- `PinDialog` — Portal to document.body, keyboard-dismiss, autocomplete fetch.
- `VaultDrawer` — scopedPath behaviour, structure fetch on mount.
- `DetailPage` — anchor scroll + highlight, edit mode, breadcrumb.
- `CommandPalette` — fuzzy scoring, actions enumeration.
- `SlashCommandMenu` — when it activates, how it dispatches commands.
- `ChatInterface` — empty-state handling, message fetching, slash command delegation.
- `AppShell` — Suspense requirement for useSheet.
- `useSidebarPins` (hook already covered in 4.8 but the consumer-facing TSDoc matters).
- `GraphCanvas` — canvas rendering, pre-settle simulation, Obsidian-like physics.

UI primitives (`Kbd`, `Badge`, `StatusDot`, `Avatar`, `HoverCard`, `Breadcrumbs`, `ActivitySparkline`, `LinkDistributionChart`, `PinIcon`) — skip. Their props are self-documenting.

### Step 4.11: Verify

```bash
npx tsc --noEmit
```

Expected: clean.

Eyeball walk: run `grep -rnE "^export (async )?(function|const|class|type|interface)" src/lib/ | head -50` and spot-check. Any exported symbol without TSDoc that falls into the "non-obvious" list above needs one.

### Step 4.12: Commit

```bash
git add src
git commit -m "docs(tsdoc): annotate non-obvious exports

TSDoc comments on exported symbols whose signature doesn't
self-document: side effects, null-vs-empty semantics, cache
behaviour, API-handler request/response shapes, hook mount
effects. ~70 comments across src/lib/ and src/components/.

Self-documenting utilities (titleFromPath, pluralize, UI
primitives with commented props) intentionally left alone.
"
```

---

## Final verification

After Task 4:

- [ ] **tsc clean:** `npx tsc --noEmit` → no output.
- [ ] **Build green:** `npm run build` → `✓ Compiled successfully`.
- [ ] **Zero raw any:**
  ```bash
  grep -rnE ":\s*any\b|as\s+any\b|any\[\]|<any[,>]" src/ \
    | grep -v "useSheet:" \
    | grep -v "eslint-disable-next-line.*no-explicit-any"
  ```
  Expected: no output.
- [ ] **Zero console.* outside log.ts:**
  ```bash
  grep -rnE "console\.(log|info|debug|warn|error)" src/ | grep -v "src/lib/log.ts"
  ```
  Expected: no output.
- [ ] **Every file has a header:**
  ```bash
  count=0
  for f in $(find src -name "*.ts" -o -name "*.tsx" | grep -vE "\.d\.ts$|/ui/index\.ts$"); do
    head -5 "$f" | grep -q "^/\*\*" || count=$((count + 1))
  done
  echo "$count missing"
  ```
  Expected: `0 missing`.
- [ ] **Routes 200:**
  ```bash
  for r in /browse /browse/system /browse/timeline /browse/graph /chat "/browse/search?q=test"; do
    curl -s -o /dev/null -w "$r %{http_code}\n" "http://localhost:3000$r"
  done
  ```
  Expected: all `200`.

## Push + merge

Once all 4 tasks are committed and verification is green:

```bash
git push -u origin v13-readability-pass
git checkout master
git merge --ff-only v13-readability-pass
git push origin master
```
