# Open-source readability pass (Phase A) — Design Spec

**Date:** 2026-04-18
**Status:** Approved for planning
**Scope:** Make the codebase easy to navigate for a first-time contributor. No structural refactor. No new features. Just the work that changes a new reader's first impression from "what is this?" to "I know where things are."

This spec is **Phase A** of a three-phase open-source polish sequence:

- **Phase A (this spec)** — readability sweep: logger + file headers + TSDoc on non-obvious exports + strict types (no `any`).
- **Phase C** (next, separate spec) — onboarding layer: `docs/ARCHITECTURE.md` + sample vault in `public/sample-vault/` + `docs/CONCEPTS.md` glossary.
- **Phase B** (last) — structural splits of the four >1000-line files.

Each phase is independent and produces working software. Phase B is deferred longest because C informs how the splits should be done.

---

## Goal

After this pass, a developer cloning the repo should be able to:

1. Read the top of any `src/*.ts{,x}` file and know in 10 seconds what it does and how it fits.
2. Understand any non-obvious exported function from its TSDoc alone — without reading the body.
3. Never encounter a raw `any`. Every value of unknown shape passes through a named validator before use.
4. See no stray `console.*` calls. Logging is consistent, debug-gated, and prefixed by module.

Nothing renders differently. The contract with the browser / vault is unchanged.

---

## Section 1 — Logger

### New file `src/lib/log.ts`

A ~15-line wrapper. Exports `log.debug / log.info / log.warn / log.error`.

```ts
/**
 * Tiny debug-gated logger. Production silences debug + info; warn + error
 * always pass through because they're real signals worth reading.
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

### Migration of existing `console.*` calls

Sweep `grep -rnE "console\.(log|warn|error)" src/` (17 hits at time of writing). Each one lands in one bucket:

- **Debug leftovers** (about 5) — `console.log` used during development, no signal for production. Delete outright.
- **Warnings** (about 8) — malformed input, missing expected file, failed cache load. Rewrite as `log.warn("<module>", "<what>", err)`.
- **Errors** (about 4) — unrecoverable state, crashed subsystem. Rewrite as `log.error("<module>", "<what>", err)`.

Example migration:

```ts
// before
console.warn("[settings] malformed sidebar.json — returning empty config");

// after
log.warn("settings", "malformed sidebar.json — returning empty config");
```

### Verification

- `grep -rnE "console\.(log|info|debug)" src/` outside `src/lib/log.ts` → **zero hits**.
- `grep -rnE "console\.(warn|error)" src/` → only inside `src/lib/log.ts`.

---

## Section 2 — File headers

Every source file at the top of `src/` gets a 1–4 line TSDoc header explaining its role. No exceptions except `.d.ts`, pure barrel `index.ts`, and generated files.

### Template

```ts
/**
 * <One-line purpose — what does this module DO.>
 *
 * <Optional: 1-2 more sentences on dependencies, invariants, or
 *  non-obvious constraints. Omit if the one-liner is enough.>
 */
```

### Examples

```ts
/**
 * Reads and parses an Obsidian-style markdown vault.
 *
 * Hot-swappable vault path, layout probe (entities/journal/projects/…),
 * schema-aware readers, wiki-link resolver with basename fallback. Every
 * downstream module (view-builder, vault-health, vault-graph) goes through
 * the helpers here — nothing bypasses this file to touch the filesystem.
 */
```

```tsx
/**
 * Kbd — keyboard-shortcut chip. Linear-style micro text + tight border.
 */
```

```tsx
/**
 * TodayPage — /browse landing. Dense checklist of today + up-next tasks
 * grouped by source file, optimistic check-off with 2s fade + undo toast.
 */
```

### Scope

Target files (by directory):

- `src/app/**/*.{ts,tsx}` — roughly 18 files (routes, layouts, API handlers).
- `src/components/**/*.tsx` — roughly 40 files.
- `src/lib/**/*.ts` — roughly 20 files.

Total: ~78 files. Excluded:

- `src/components/ui/index.ts` (barrel — no real content to annotate).
- Anything that's purely a re-export.
- Next.js-generated files (we don't touch them in source).

### Style

- Use `/** … */` not `//` so the text participates in TSDoc tooling.
- Write in present tense, active voice.
- No marketing copy ("amazing", "powerful") — plain descriptions.
- No inline code fences in the header. Just prose.

### Verification

- `for f in $(find src -name "*.ts" -o -name "*.tsx" | grep -v "\.d\.ts$" | grep -v "/ui/index\.ts"); do head -4 "$f" | grep -q "^/\*\*" || echo "MISSING: $f"; done` → empty output.

---

## Section 3 — TSDoc on non-obvious exports

Add `/** … */` comments on exported functions, hooks, types, and components whose signature doesn't self-document.

### Annotate when

- Function has side effects not obvious from the name (writes to disk, mutates URL, invalidates cache, closes a sheet).
- Return type hides semantics — e.g. `Promise<string | null>` where `null` could mean "not found", "vault not connected", or "malformed input", and the caller needs to distinguish.
- Hook has mount-effects that fetch data or subscribe to events.
- Endpoint handler — request body shape, response shape, status codes.
- Parser with tolerant behavior (returns `[]` on malformed input vs throwing).
- Function with parameter constraints not visible from types (e.g. "path must be vault-relative, not absolute").
- Component with non-trivial lifecycle (Portal-based, async data loading with its own error states).

### Skip when

- Name + signature fully convey intent — `function titleFromPath(p: string): string` says it all.
- Component props interface already has per-field comments.
- Internal helpers not exported from the file.
- Pure pass-through wrappers.

### Template

```ts
/**
 * <One-line summary in present tense.>
 *
 * <Optional: behavior details — what null means, side effects,
 *  cache interactions, failure modes.>
 *
 * @param <name> <only if the parameter's role isn't obvious>
 * @returns <only if the return semantics need explanation>
 */
```

Omit `@param`/`@returns` unless they add real information. Don't write `@param path - the path` — delete the comment.

### Example

```ts
/**
 * Resolve a wiki-link target to an absolute vault path.
 *
 * Tries in order: exact match → with `.md` suffix → every probed layout
 * folder → legacy `wiki/` prefix → basename index fallback. Returns the
 * resolved path when found, or null when the target doesn't exist in the
 * active vault.
 *
 * @param linkPath  raw wiki-link body (e.g. `"projects/foo"` or `"foo"`).
 *                  Leading slashes are stripped. Trailing `.md` is optional.
 */
export async function resolveLink(linkPath: string): Promise<string | null>
```

### Estimated volume

~30% of exports across the codebase — roughly 60–80 TSDoc comments. Higher concentration in `src/lib/` (lots of side effects), lower in `src/components/ui/` (most primitives are self-documenting from their props).

### Verification

Manual walk: skim every `src/lib/*.ts` file's exported surface; every non-trivial export should have a comment. Grep-based enforcement is brittle for this so the check is eyeball.

---

## Section 4 — `any` → `unknown` + validators

### Current state

Grep `grep -rnE ':\s*any\b|as\s+any\b|any\[\]' src/` returns 17 hits at spec time. Roughly:

- **~8 lazy `any`** — event handlers, parser return types, object maps where a concrete type exists.
- **~9 JSON-boundary `any`** — API response handling, deserialised sidebar config, `localStorage` payloads.

### Strategy

- **Lazy `any`** — replace with the correct concrete type. Most are mechanical (e.g. `(e: any) =>` → `(e: React.PointerEvent) =>`).
- **JSON-boundary `any`** — switch to `unknown`, then narrow through a named type guard before use. Pattern:

```ts
// before
const body = await res.json();
setPins(body.pins);

// after
const body: unknown = await res.json();
if (!isSidebarConfig(body)) {
  log.warn("settings", "malformed response", body);
  return;
}
setPins(body.pins); // body is now SidebarConfig
```

### Validators

- If a type already has a validator (e.g. `settings.ts` has `isValidConfig`), reuse it.
- If it doesn't, add a small `function isFoo(v: unknown): v is Foo` next to the type definition or the consumer. Keep them tight — one line per field check.
- Validators for view-model types live in `view-models.ts`.
- Validators for API-response wrappers live next to the endpoint consumer (one per consumer is fine; no need to share between Timeline / System / Entity pages if their response shapes differ).

### Outcome

- `grep -rnE ':\s*any\b|as\s+any\b|any\[\]' src/` → **zero hits**.
- Every JSON-boundary response is narrowed through a validator before any field access.
- `tsc --noEmit` stays clean.

### Not in scope

- **No schema library.** No Zod, no valibot, no io-ts. Hand-written type guards — lightweight and self-explanatory. (If we add a schema lib later, the type guards become straightforward replacements.)
- **Runtime type-stripping at build time** — irrelevant; we're just tightening TypeScript.

---

## Sequencing

Four orthogonal steps. Each lands as its own commit so reviews stay focused. Suggested order:

1. **Logger** — create `src/lib/log.ts`, sweep-migrate all `console.*` calls. One commit.
2. **`any` sweep** — replace every `any` with a concrete type or `unknown`-plus-validator. One commit.
3. **File headers** — add the 1–4 line TSDoc to every source file. One commit.
4. **TSDoc on non-obvious exports** — walk the exports, annotate. One commit.

Expected 4 commits on a feature branch `v13-readability-pass`. Total effort ~1 working day.

Logger lands first so the `any` sweep can replace `console.warn("…")` with `log.warn("scope", …)` at the same time it rewrites the narrowing logic.

---

## Critical files reference

**New:**

- `src/lib/log.ts`

**Modified (by sweep — no structural changes):**

- All 17 files that currently have `console.*` calls.
- All 17 sites that currently have `any` (some may be the same files).
- ~78 files for file headers.
- ~60–80 exported symbols across `src/lib/` and `src/components/` for TSDoc.

Most files get 1–3 edits max. No file gets restructured. No file splits. No behavior changes.

---

## Non-goals (keeping scope tight)

- **No test framework.** Phase A is formatting and typing; verification is `tsc --noEmit` + the existing grep checks.
- **No file splits.** The four >1000-line files stay intact until Phase B.
- **No `docs/ARCHITECTURE.md`.** That's Phase C.
- **No CHANGELOG.md.** Also Phase C.
- **No sample vault.** Also Phase C.
- **No linting rule additions** (`no-any`, `no-console`). They'd catch future regressions but introducing them mid-pass adds noise. Add in a follow-up PR once the sweep is green.
- **No runtime behavior change.** Every page should render identically before and after.

---

## Verification

- `npx tsc --noEmit` → clean.
- `npm run build` → green.
- `grep -rnE ":\s*any\b|as\s+any\b|any\[\]" src/` → zero hits.
- `grep -rnE "console\.(log|info|debug)" src/` outside `src/lib/log.ts` → zero hits.
- `grep -rnE "console\.(warn|error)" src/` outside `src/lib/log.ts` → zero hits.
- Every source file has a `/**` block as the first non-empty non-`"use client"` non-`import` non-blank construct. Script-check or eyeball.
- Every route still returns 200 (`/browse`, `/chat`, `/browse/system`, `/browse/timeline`, `/browse/graph`).

---

## One-sentence summary

Ship a tiny debug-gated logger, replace every raw `any` with `unknown` plus a named validator, add a 1–4 line header to every source file, and write TSDoc on the exports whose signatures don't already self-document — so the next person reading the tree knows within 10 seconds what each file does.
