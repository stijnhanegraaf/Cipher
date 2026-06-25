# Cipher Phase 0b — Design-System Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Lay the codified, enforced design-system foundation — a written constitution, an OKLCH token substrate with color-mix-derived states, a per-hue chip system, typeset markdown, a motion grammar, consistent interaction/chrome states — and zero out the pre-existing lint backlog, so every later phase inherits a crafted, mechanically-enforced base.

**Architecture:** Cipher's `globals.css` (~1701 lines) is already a CSS-custom-property token system (dark = `:root`, light = `.light`, `@theme` maps to Tailwind v4). This phase converts the color tokens to OKLCH *equivalents* (name-preserving, zero visual change), adds derived state tokens + a chip helper via `color-mix(in oklab, …)`, layers a `.typeset` reading surface onto the existing `--md-*` reader-pref vars, codifies motion/interaction, and adds a custom "no raw hex" ESLint rule. The paste-ready content for each task lives in the draft files under `.superpowers/sdd/0b-drafts/` (produced by the authoring workflow); each task points to the exact draft section.

**Tech Stack:** Next.js 16.2.3, React 19.2.4, TypeScript strict, Tailwind v4, Vitest, `culori` (new devDep, for the one-off OKLCH conversion), ESLint flat config.

## Global Constraints

- **TypeScript `strict: true`** — no new `any`.
- **Token-only color:** no raw hex / `rgb()` / `hsl()` / Tailwind palette color classes (`bg-zinc-800`, `text-blue-500`, …) outside `globals.css`'s `:root`/`.light` blocks. (Task 7 enforces this mechanically.)
- **Conventional Commits**, ONE commit per task; footer line exactly: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Lint gate (amended):** the binding gate is **"no NEW lint findings"** per task. Task 8 separately drives the pre-existing backlog to zero; after Task 8, the gate becomes `npm run lint` exits 0.
- **Do NOT rename existing tokens** (`--bg-*`, `--text-*`, `--accent-*`, `--status-*`, `--radius-*`, `--space-*`, `--motion-*`, `--ease-*`, `--md-*`, `--duration-*`). New tokens are additive.
- **Branch:** `refinement`.
- **Each task ends green:** `npm run typecheck && npm run test:unit && npm run build` pass; no new lint findings; plus the task's stated verification.

## Resolved decisions (front-loaded — do not re-litigate)

1. **OKLCH literal conversion IS in scope** (Task 1), as a **zero-regression equivalence** rewrite (hex/rgba → `oklch()`/`oklch(... / a)`), name-preserving. Primary gate = a round-trip unit test bounding drift to <1/255 per 8-bit channel across the real token set; plus a visual spot-check. Everything after derives from oklch bases.
2. **`color-mix` color space = `in oklab`** for all NEW derived states/chips. Do NOT migrate existing `color-mix(in srgb, …)` call sites (that changes pixels — out of scope).
3. **AuditDashboard.tsx (34 raw-Tailwind-color occurrences): ALLOWLIST**, via a single scoped override in `eslint.config.mjs` with `// TODO(phase-4): remove when AuditDashboard is generalized`. Do not fix its 34 sites now (Phase 4 rewrites it).
4. **The ~27 raw hex literals in other `.ts/.tsx`:** Task 8 fixes them to tokens where they are styling; allowlist only genuinely-literal cases (e.g. a canvas draw color) with an inline reason. Enumerate from `oklch-lint.md` before flipping the rule to `error`.
5. **Keyframes:** add ONLY those with a real Phase-0b consumer; defer the rest (DESIGN.md §6).
6. **Visual verification:** unit tests for all extractable logic + build/typecheck/lint gates + dev-server screenshot checkpoints (light AND dark) after Tasks 3, 4, and 6. No Playwright harness this round.

## Draft source files (paste-ready content)

- `.superpowers/sdd/0b-drafts/design-doc.md` — full `docs/DESIGN.md` content
- `.superpowers/sdd/0b-drafts/css-foundation.md` — state tokens, scrollbars, focus/press, motion, meta-theme-color (with file:line insertion points)
- `.superpowers/sdd/0b-drafts/typeset-markdown.md` — `.typeset` CSS + chip system + renderer edits
- `.superpowers/sdd/0b-drafts/oklch-lint.md` — OKLCH conversion script + categorized lint inventory

## Task ordering

`0 DESIGN.md → 1 OKLCH convert → 2 state tokens → 3 chip system → 4 typeset markdown → 5 motion → 6 interaction+chrome → 7 eslint rule+allowlist → 8 lint-zeroing`. Tokens land before consumers (2→3→4); motion/interaction (5,6) refine on-screen elements; enforcement (7) then cleanup (8) come last so all new code is already compliant.

---

## Task 0: DESIGN.md constitution

**Files:** Create `docs/DESIGN.md`. Source: `.superpowers/sdd/0b-drafts/design-doc.md`.

**Interfaces:** Produces the acceptance rubric Tasks 3-6 are verified against.

- [ ] **Step 1: Write the file** verbatim from `.superpowers/sdd/0b-drafts/design-doc.md`.
- [ ] **Step 2: Reconcile the OKLCH wording.** The draft's color section may say existing tokens use `in srgb` / "migrate opportunistically." Edit it to match the resolved decision: base tokens are being converted to literal `oklch()` (Task 1); new derived states use `color-mix(in oklab, …)`; existing `in srgb` mixes are left as-is. One coherent paragraph, no contradiction.
- [ ] **Step 3: Verify every cited token exists.** Run a check that each `--token` name referenced in `docs/DESIGN.md` resolves in `src/app/globals.css`:
```bash
cd ~/Developer/Cipher
comm -23 \
  <(grep -oE '\-\-[a-z0-9-]+' docs/DESIGN.md | sort -u) \
  <(grep -oE '\-\-[a-z0-9-]+' src/app/globals.css | sort -u)
```
Expected: empty output (every token named in DESIGN.md is defined in globals.css). Fix any phantom references in DESIGN.md (rename to the real token or remove the claim).
- [ ] **Step 4: Commit**
```bash
git add docs/DESIGN.md
git commit -m "docs: add Cipher design constitution (DESIGN.md)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 1: OKLCH equivalence conversion of color tokens

**Files:** Create `scripts/oklch-convert.mjs`; create `src/lib/color/oklch-convert.ts` + `src/lib/color/oklch-convert.test.ts` (the pure, tested core); modify `src/app/globals.css`; add `culori` devDep. Source: `.superpowers/sdd/0b-drafts/oklch-lint.md` §A.

**Interfaces:** Produces `hexToOklchString(input: string): string` (pure) — converts `#rrggbb`/`#rgb`/`rgba(...)` to `oklch(L C H)` / `oklch(L C H / a)`, preserving alpha; returns the input unchanged if not a convertible color literal.

- [ ] **Step 1: Add culori**
```bash
cd ~/Developer/Cipher && npm install -D culori
```
- [ ] **Step 2: Write the failing test** `src/lib/color/oklch-convert.test.ts` — assert round-trip fidelity on the real token set (each `hexToOklchString` output, parsed back to sRGB, is within <1/255 per channel of the original) and alpha preservation. Use representative real tokens from globals.css (e.g. `#08090a`, `#f7f8f8`, `#8C8FEE`, `rgba(255,255,255,0.05)`):
```ts
import { describe, it, expect } from "vitest";
import { converter, parse, formatHex } from "culori";
import { hexToOklchString } from "./oklch-convert";

const toRgb = converter("rgb");
function channels(s: string) {
  const c = toRgb(parse(s))!;
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}

describe("hexToOklchString round-trip", () => {
  for (const hex of ["#08090a", "#f7f8f8", "#8C8FEE", "#10b981", "#ef4444"]) {
    it(`preserves ${hex} within 1/255`, () => {
      const out = hexToOklchString(hex);
      expect(out.startsWith("oklch(")).toBe(true);
      const [r1, g1, b1] = channels(hex);
      const [r2, g2, b2] = channels(out);
      expect(Math.abs(r1 - r2)).toBeLessThanOrEqual(1);
      expect(Math.abs(g1 - g2)).toBeLessThanOrEqual(1);
      expect(Math.abs(b1 - b2)).toBeLessThanOrEqual(1);
    });
  }
  it("preserves alpha", () => {
    expect(hexToOklchString("rgba(255,255,255,0.05)")).toMatch(/\/\s*0?\.05\s*\)$/);
  });
  it("passes through non-colors unchanged", () => {
    expect(hexToOklchString("var(--x)")).toBe("var(--x)");
    expect(hexToOklchString("0.625rem")).toBe("0.625rem");
  });
});
```
- [ ] **Step 3: Run it (RED)** — `npm run test:unit -- src/lib/color/oklch-convert.test.ts` → FAIL (module missing).
- [ ] **Step 4: Implement `src/lib/color/oklch-convert.ts`** using culori (`parse` → `converter("oklch")` → format `oklch(L C H)` with L as a number 0-1 to ~4dp, C to ~4dp, H to ~2dp, and ` / a` only when alpha < 1). Use the exact formatter from `oklch-lint.md` §A. Pass through any string that culori can't parse as a color.
- [ ] **Step 5: Run it (GREEN)** — same command → PASS.
- [ ] **Step 6: Write `scripts/oklch-convert.mjs`** (from `oklch-lint.md` §A): read `src/app/globals.css`, and ONLY within the `:root {…}` and `.light {…}` blocks, replace each color-valued token's hex/rgba literal via the same conversion logic. **Skip:** `--shadow-*` (composite values), any value already containing `color-mix(`/`var(`/`oklch(`, and all non-color numeric tokens (`--space-*`, `--radius-*`, `--motion-*`, `--duration-*`, `--ease-*`, sizes, z-index). Log `converted` and `skipped` counts.
- [ ] **Step 7: Capture baseline screenshots** (for the spot-check) — start the dev server, load a markdown doc + the Browse view in BOTH themes, capture. (If headless screenshotting isn't available, note "manual spot-check pending" and rely on the round-trip test as the mathematical guarantee.)
- [ ] **Step 8: Run the conversion** — `node scripts/oklch-convert.mjs`. Confirm the log: ~55-60 converted, skipped = shadows/color-mix/var only. Eyeball that `@theme`, `.light`, and non-color tokens are untouched via `git diff`.
- [ ] **Step 9: Verify** — `npm run build && npm run typecheck && npm run test:unit` green. Visual spot-check: app looks identical in both themes (the round-trip test guarantees <1/255 drift). No new lint findings (`npm run lint` count unchanged).
- [ ] **Step 10: Commit**
```bash
git add package.json package-lock.json scripts/oklch-convert.mjs src/lib/color/oklch-convert.ts src/lib/color/oklch-convert.test.ts src/app/globals.css
git commit -m "refactor(tokens): convert color tokens to OKLCH equivalents (zero visual change)

Name-preserving hex/rgba→oklch() round-trip (drift <1/255 per channel, unit-tested);
enables color-mix(in oklab) derivation for state tokens + chips.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: color-mix state tokens

**Files:** Modify `src/app/globals.css`. Source: `.superpowers/sdd/0b-drafts/css-foundation.md` Block 1.

**Interfaces:** Produces derived state tokens `--hover-surface`, `--active-surface`, `--selected-surface`, `--selected-border`, `--ring`, `--ring-offset` (defined in both `:root` and `.light`), each via `color-mix(in oklab, …)` of existing base tokens. Coexist with — don't replace — `--hover-row`/`--hover-control`.

- [ ] **Step 1:** Insert the dark-theme state-token block in `:root` (after `--disabled-opacity`, per the draft's cited line) and the light-theme block in `.light`, copied from `css-foundation.md` Block 1.
- [ ] **Step 2:** Add the in-comment note distinguishing solid-derived state tokens (these) from the existing alpha-overlay `--hover-row`/`--hover-control` so contributors pick correctly.
- [ ] **Step 3: Verify tokens resolve.** Add `src/lib/color/state-tokens.test.ts` that asserts each new var name appears in BOTH the `:root` and `.light` blocks of globals.css (string-level check — cheap and catches a malformed/missing definition):
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const root = css.slice(css.indexOf(":root"), css.indexOf(".light"));
const light = css.slice(css.indexOf(".light"));
describe("state tokens defined in both themes", () => {
  for (const t of ["--hover-surface","--active-surface","--selected-surface","--selected-border","--ring","--ring-offset"]) {
    it(`${t} in :root and .light`, () => {
      expect(root).toContain(t);
      expect(light).toContain(t);
    });
  }
});
```
- [ ] **Step 4: Run** — `npm run test:unit -- src/lib/color/state-tokens.test.ts` PASS; `npm run build` green.
- [ ] **Step 5: Commit** (`feat(tokens): add color-mix-derived interaction state tokens`).

---

## Task 3: chip system + per-hue tokens

**Files:** Modify `src/app/globals.css`; create `src/lib/color/chip.ts` + `src/lib/color/chip.test.ts`. Source: `.superpowers/sdd/0b-drafts/typeset-markdown.md` §2.

**Interfaces:** Produces `--hue-*` base tokens + a `.chip` class that color-mixes a consumer-set `--sc` hue into bg/text/border for both themes; and a pure `chipColors(hue, theme): { bg; text; border }` mirroring the CSS recipe (so the derivation is unit-locked).

- [ ] **Step 1: Write the failing test** `src/lib/color/chip.test.ts` asserting `chipColors` returns the expected `color-mix(in oklab, …)` strings for a sample hue in light vs dark (the exact ratios come from `typeset-markdown.md` §2).
- [ ] **Step 2: RED** → run, fails (module missing).
- [ ] **Step 3: Implement `src/lib/color/chip.ts`** — `chipColors(hue, theme)` returning the bg/text/border mix strings matching the CSS.
- [ ] **Step 4: GREEN** → run, passes.
- [ ] **Step 5: Add the CSS** — `--hue-*` tokens (reuse `--accent-*`/`--status-*` where the draft maps them; the one genuinely new hex `--hue-idea` lives in `:root`, which is legal) and the `.chip` class (mix ratios, hover=bg only, `[aria-pressed]`/`[data-selected]` survive-hover, focus ring via `--ring`, 1px press, `pointer:coarse` 44px, reduced-motion guard) inside `@layer components`, from `typeset-markdown.md` §2.
- [ ] **Step 6: Verify** — `npm run typecheck && npm run test:unit && npm run build` green; no new lint findings.
- [ ] **Step 7: VISUAL CHECKPOINT (controller-run).** Controller renders a chip gallery (rest/hover/selected/selected+hover/focus) on the dev server and captures `chip-states-light` + `chip-states-dark`. (This is the first visible consumer of the mix machinery — it validates Task 2.)
- [ ] **Step 8: Commit** (`feat(ui): add per-hue chip system`).

---

## Task 4: typeset markdown

**Files:** Modify `src/app/globals.css` (`.typeset` block + hljs force + keyframes); modify `src/components/ui/MarkdownRenderer.tsx` (add `typeset` class; new `CodeBlock` with copy; focusable scrollable table wrapper; **strip competing inline `style` margins** at the cited sites). Create `src/components/ui/CodeBlock.test.tsx`. Source: `.superpowers/sdd/0b-drafts/typeset-markdown.md` §1.

**Interfaces:** Produces a `.typeset` reading-surface style layered on the existing `--md-*` reader-pref vars (never hard-coding sizes that fight `calc(var(--md-size) * var(--md-zoom))`); a `CodeBlock` component whose copy button copies the code text (not the "Copy" label).

- [ ] **Step 1: Write the failing test** `src/components/ui/CodeBlock.test.tsx` (`// @vitest-environment jsdom`) — render a `CodeBlock` with known code, click copy, assert the clipboard receives the **code text** (mock `navigator.clipboard.writeText`), not the button label.
- [ ] **Step 2: RED** → run, fails.
- [ ] **Step 3: Add the `.typeset` CSS** to globals.css from `typeset-markdown.md` §1 (heading scale w/ negative tracking, muted markers, links via `color-mix` toward a new `--link` token, dark-in-both-themes fenced code, scrollable tables, `text-wrap:balance`, blockquote, callout base).
- [ ] **Step 4: Wire the renderer** — add the `typeset` class to the content container (cited line ~169); add the `CodeBlock` component (cited ~429-443); make the table wrapper `tabIndex={0}` (cited ~473-479).
- [ ] **Step 5: Strip competing inline styles** at the renderer sites listed in `typeset-markdown.md` §1 step (c) (headings/paragraphs/lists/links/code/table — inline `style` wins the cascade, so the new rules no-op unless these are removed). Remove only the margin/typography inline styles the `.typeset` block now owns; keep functional inline styles (e.g. reader-pref-driven ones).
- [ ] **Step 6: GREEN** → run the CodeBlock test, passes.
- [ ] **Step 7: Verify** — `npm run typecheck && npm run test:unit && npm run build` green; no new lint findings.
- [ ] **Step 8: VISUAL CHECKPOINT (controller-run).** Controller loads a kitchen-sink markdown doc (h1-h6, lists, links, wiki-links, inline+fenced code, table, blockquote) on the dev server; captures `typeset-doc-light` + `typeset-doc-dark`. **Explicitly confirm fenced code is dark in light mode** (the requirement most likely to regress). This checkpoint ALSO closes the carried-over Phase-0a "math + code render" manual check.
- [ ] **Step 9: Commit** (`feat(ui): typeset markdown reading surface + code copy`).

---

## Task 5: motion grammar

**Files:** Modify `src/app/globals.css`. Source: `.superpowers/sdd/0b-drafts/css-foundation.md` Block 4 + `typeset-markdown.md` §4.

**Interfaces:** Produces `--ease-signature` + `--dur-color/expand/enter` aliases (NOT renaming existing `--ease-*`/`--motion-*`/`--duration-*`), and the few keyframes that have a real Phase-0b consumer.

- [ ] **Step 1:** Add the easing/duration aliases after the cited line; extend the existing `@media (prefers-reduced-motion: reduce)` `:root` override (cited ~612-618) to also zero the new `--dur-*`.
- [ ] **Step 2:** Add ONLY the keyframes with a landed consumer from Tasks 3-4 (e.g. `chip-pop` if chips use it, `code-copied` for the copy feedback, a `list-item-enter` only if applied this phase). Each MUST have an `@media (prefers-reduced-motion: reduce)` block rendering the final state. Defer any keyframe with no current consumer (note it in the report).
- [ ] **Step 3: Verify** — `npm run build` green; no new lint findings. Controller spot-checks (reduced-motion emulated) that animated elements settle to their final state with no half-frame.
- [ ] **Step 4: Commit** (`feat(ui): motion grammar — signature easing + guarded keyframes`).

---

## Task 6: interaction states + chrome

**Files:** Modify `src/app/globals.css` (focus → `--ring` at the 3 cited sites; `.state-row` + `.press` in `@layer utilities`; **REPLACE** the global scrollbar block at the cited lines; `.tap-44`); modify `src/app/layout.tsx` (bootstrap script + viewport comment); create `src/lib/browse/resolve-theme.ts` + `.test.ts`; wire one `__setThemeColor?.()` call in the theme-toggle component. Source: `.superpowers/sdd/0b-drafts/css-foundation.md` Blocks 2,3,6.

**Interfaces:** Produces `resolveTheme(stored, osDark): "light" | "dark"` (pure) driving the no-flash boot + the live meta-theme-color sync.

- [ ] **Step 1: Write the failing test** `src/lib/browse/resolve-theme.ts` `resolveTheme`: stored `"light"` → light (even on dark OS), `"dark"` → dark, anything else → OS. Test all branches (the manual-light-on-dark-OS case is the bug being fixed).
- [ ] **Step 2: RED → implement → GREEN.**
- [ ] **Step 3: Migrate focus** to `--ring` at the 3 cited globals.css locations (avoid specificity fights — edit all three); add `.state-row` (active-survives-hover, consuming `--*-surface` from Task 2) and `.press` (1px translate) in `@layer utilities`.
- [ ] **Step 4: REPLACE** the global scrollbar block (cited ~1317-1335) with the thin/stable-gutter/hover-reveal/theme-aware version from `css-foundation.md` Block 2 (REPLACE, not append — appending leaves the always-visible global winning). Keep the opt-in `.scrollbar-thin`. Add `.tap-44` + documented `[data-tap-exempt]`.
- [ ] **Step 5: Sync meta-theme-color** — edit `layout.tsx` bootstrap (cited ~53-67) to set a single `<meta name=theme-color>` from `resolveTheme(...)` and expose `window.__setThemeColor`; remove Next's `prefers-color-scheme`-keyed `viewport.themeColor` metas (cited ~35-38) that conflict; call `window.__setThemeColor?.(...)` from the theme-toggle component (locate it — grep for `brain-theme` writes).
- [ ] **Step 6: Verify** — `npm run typecheck && npm run test:unit && npm run build` green; no new lint findings.
- [ ] **Step 7: VISUAL CHECKPOINT (controller-run).** Controller captures `focus-ring` (keyboard focus on row/chip/button/link), `selected-survives-hover` (selected row hovered), `scrollbar-rest-vs-hover`, in light AND dark. PLUS no-flash boot check (reload with stored dark on light OS — no flicker) and a meta-theme-color assertion (stored `dark` under light OS → `<meta theme-color>` content === dark value).
- [ ] **Step 8: Commit** (`feat(ui): unify focus/press/scrollbar + resolved-theme meta-color`).

---

## Task 7: "no raw hex" ESLint rule + AuditDashboard allowlist

**Files:** Modify `eslint.config.mjs`; create the rule (a small local plugin or `no-restricted-syntax` config) + `RuleTester` test. Source: `.superpowers/sdd/0b-drafts/oklch-lint.md` (rule shape) + decision #3 above.

**Interfaces:** Produces a lint rule erroring on raw hex/`rgb()`/`hsl()` literals and Tailwind palette color classes in `src/**` string literals, excluding `globals.css` and the AuditDashboard allowlist.

- [ ] **Step 1: Write the rule + a `RuleTester` test** — positives (`#fff`, `rgba(...)`, `bg-zinc-800`, `text-blue-500` flagged) and negatives (`var(--…)`, semantic classes like `bg-surface`, hex inside the `globals.css` path, the allowlisted file) all asserted. RED first.
- [ ] **Step 2: Implement the rule** and wire it into `eslint.config.mjs` scoped to `src/**` (exclude `src/app/globals.css`).
- [ ] **Step 3: Add the AuditDashboard allowlist** — a file-scoped override (`files: ["**/AuditDashboard.tsx"]`) disabling the color rule(s), with `// TODO(phase-4): remove allowlist when AuditDashboard is generalized`.
- [ ] **Step 4: GREEN** — the RuleTester test passes; `npm run lint` does NOT report new errors from the rule for already-token-compliant code (the ~27 stray hex elsewhere are handled in Task 8 — until then keep the rule a `warn`, or land Task 8 in the same cycle; see Task 8 step 0).
- [ ] **Step 5: Commit** (`feat(lint): enforce token-only color (no raw hex / palette classes)`).

---

## Task 8: lint-zeroing pass

**Files:** ~40 files across `src/` per `.superpowers/sdd/0b-drafts/oklch-lint.md` §B, plus the carried-over Phase-0a cosmetic nits.

**Interfaces:** none new. End state: `npm run lint` exits 0.

- [ ] **Step 0: Flip the Task-7 rule to `error`** once the stray-hex files below are fixed (so "zero" includes the new rule).
- [ ] **Step 1: `eslint --fix`** for the auto-fixable group (removes stale disables).
- [ ] **Step 2: Group 4 — static `node:` imports** (replace the flagged sync `require()`s where safe; JUSTIFIED-DISABLE with a one-line reason where the sync-init `require()` in `vault-reader` is intentional).
- [ ] **Step 3: Groups 1/3/5/7/8/10 (mechanical)** — entity escaping, unused vars (add the `^_` ignore pattern to the eslint config), dep arrays, memo alignment, lift `Date.now()` out of render, type the stray `any`. Per `oklch-lint.md` §B.
- [ ] **Step 4: Group 2 — `set-state-in-effect` (the real work)** — refactor ~9 via lazy `useState` init / derive-during-render; JUSTIFIED-DISABLE the ~5 genuine prop-sync/async-fetch cases with one-line reasons.
- [ ] **Step 5: Group 9 — ref-forwarding** — JUSTIFIED-DISABLE with reason. (Leave the existing correct `<img>` disables in ImagePreview/MarkdownRenderer.)
- [ ] **Step 6: The ~27 stray raw-hex literals** — convert to existing tokens where they're styling; inline-allowlist with a reason only where a literal color is genuinely required (e.g. canvas drawing). This satisfies the Task-7 `error` rule.
- [ ] **Step 7: Carried-over Phase-0a cosmetic nits** — remove the redundant `const base = dirRelPath ? …` identity assignment + dead `combined` var in `vault-search.ts`; fix the `folders/route.ts` stale "depth 5" comment; add trailing newline to the two vendored `public/vendor/hljs/*.css`; drop the unreachable `vaultName?` prop from `MarkdownRenderer` (verified unpassed at all call sites).
- [ ] **Step 8: Verify** — `npm run lint` exits 0; `npm run typecheck && npm run test:unit && npm run build` all green. Grep-assert every `eslint-disable` added this task carries a reason comment.
- [ ] **Step 9: Commit** (`chore: zero out lint backlog + token-only compliance + cosmetic cleanup`).

---

## Final verification (after all tasks)
- [ ] `npm run typecheck` exit 0
- [ ] `npm run lint` exit 0 (backlog zeroed; token-only rule enforced)
- [ ] `npm run test:unit` all suites pass (oklch round-trip, state tokens, chip, CodeBlock, resolve-theme, eslint rule)
- [ ] `npm run build` succeeds
- [ ] `docs/DESIGN.md` exists; every cited token resolves in globals.css
- [ ] Visual checkpoints captured (chip states, typeset doc, focus/selected/scrollbar) in light AND dark; fenced code dark in light mode; no theme-flash on boot; meta-theme-color tracks the manual override
- [ ] `grep -rnE "#[0-9a-fA-F]{3,6}|bg-(zinc|slate|gray|red|green|blue|emerald|amber|...)-[0-9]" src` returns only AuditDashboard (allowlisted) and `globals.css`

## Spec coverage (this plan vs design spec §5 + carried items)
| Spec §5 / carried item | Task |
|---|---|
| DESIGN.md constitution (two registers, forbidden list, checklist) | 0 |
| OKLCH token migration | 1 |
| color-mix-derived state tokens | 2 |
| per-hue chip system | 3 |
| typeset markdown (+ closes 0a math/code visual check) | 4 |
| motion grammar | 5 |
| interaction states + thin scrollbars + focus ring + no-flash meta-color | 6 |
| token-only enforcement | 7 |
| lint-zeroing (0a carry) + cosmetic nits (0a carry) | 8 |

## Self-review notes
- Reader-prefs UI exposure (lineHeight/width/zoom in the toolbar — spec §5.1) is **not** in this phase; it's a feature, not foundation — fold into Phase 1 or a dedicated task. Flagged so it isn't lost.
- AuditDashboard's token-compliance is intentionally deferred to its Phase 4 rework (allowlisted here).
- `color-mix(in srgb)`→`in oklch` migration of EXISTING call sites is explicitly out of scope (pixel-changing).
