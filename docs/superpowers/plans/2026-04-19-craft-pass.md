# Craft Pass — Linear × Editorial refinement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the unified 4-layer UI craft pass from the spec — inset rounded chrome, Instrument Serif on 6 surfaces, warmed accent + layered surfaces, spring-eased motion with choreographed signatures.

**Architecture:** CSS tokens + utility classes + surgical component edits. Zero new runtime deps beyond next/font/google (Inter already present).

**Tech Stack:** Next.js 16 App Router, React 19, TS strict, next/font/google for Instrument Serif.

**Branch:** v20-craft-pass from v19-graph-polish. One commit per task.

---

## Conventions

- Every task: edit files → `npx tsc --noEmit` → `git add <paths> && git commit`.
- Every commit message ends with:
  `Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>`
- Browser-walk verification: reload app at each visible task; record observation.
- **Dark mode is primary for all screenshots / checks.** Retest light mode at the end.

---

## Task 0 — Branch setup

- [ ] Cut the working branch from `v19-graph-polish`:

  ```bash
  git fetch origin
  git checkout v19-graph-polish
  git pull --ff-only
  git checkout -b v20-craft-pass
  ```

- [ ] Confirm clean tree: `git status` → clean.
- [ ] `npx tsc --noEmit` passes on the starting tree.

No commit.

---

# Phase A — Foundation (tokens + fonts)

## Task 1 — Load Instrument Serif via next/font/google

**Files:** `src/app/layout.tsx`

### Edit

**Before** (top of `src/app/layout.tsx`):

```tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
```

**After:**

```tsx
import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});
```

**Before** (`<html>` line):

```tsx
<html lang="en" className={inter.variable} suppressHydrationWarning>
```

**After:**

```tsx
<html
  lang="en"
  className={`${inter.variable} ${instrumentSerif.variable}`}
  suppressHydrationWarning
>
```

### Verify

- [ ] `npx tsc --noEmit`
- [ ] `npm run build` succeeds (Google Fonts reachable).
- [ ] DevTools → Elements → `<html>` carries both `__variable_inter` and `__variable_instrumentSerif` classes.
- [ ] `getComputedStyle(document.documentElement).getPropertyValue('--font-serif')` returns a font-family string.

### Commit

```
foundation(fonts): load Instrument Serif via next/font/google

Adds --font-serif variable alongside Inter. Latin subset, 400 normal + italic,
display swap. No consumers yet — surface migration follows.

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

---

## Task 2 — New tokens in globals.css

**Files:** `src/app/globals.css`

### Edit 2a — Dark tokens

**After** the existing `--motion-sheet: 220ms;` block (around line 105) inside `:root { ... }`, **append** before the `/* Radius */` comment:

```css
  /* ── Craft pass — chrome frame ───────────── */
  --chrome-margin: 8px;
  --chrome-gap:    8px;
  --radius-chrome: 12px;
  --radius-row:    8px;
  --shadow-chrome:
    0 1px 2px color-mix(in srgb, black 25%, transparent),
    0 8px 24px color-mix(in srgb, black 18%, transparent);

  /* ── Craft pass — layered surfaces ───────── */
  --surface-chrome:   var(--bg-marketing);
  --surface-recessed: color-mix(in srgb, var(--bg-marketing) 98%, black);
  --surface-raised:   color-mix(in srgb, var(--bg-marketing) 98%, white);

  /* ── Craft pass — warmed accent ──────────── */
  --accent-brand-warm: #A78BFA;
  --accent-soft:       color-mix(in srgb, var(--accent-brand) 6%, var(--bg-surface));

  /* ── Craft pass — motion tokens ──────────── */
  --motion-micro:     120ms;
  --motion-quick:     180ms;
  --motion-standard:  240ms;
  --motion-slow:      400ms;
  --ease-spring-soft: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-spring-snap: cubic-bezier(0.22, 1.2, 0.36, 1);
  --ease-out-smooth:  cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-gentle:  cubic-bezier(0.25, 0.1, 0.25, 1);
```

### Edit 2b — Warm the dark `--accent-brand`

**Before:**

```css
  --accent-brand:       #5e6ad2;
```

**After (dark `:root` only):**

```css
  --accent-brand:       #8C8FEE; /* warmed +4° (craft pass) */
```

### Edit 2c — Light tokens

Inside `.light { ... }`, locate `--accent-brand: #5e6ad2;` and **replace** with:

```css
  --accent-brand:       #6E6AD6; /* warmed +5° (craft pass) */
```

Then **append** (right before the closing `}` of `.light`):

```css
  /* Craft pass — light-mode overrides */
  --shadow-chrome:
    0 1px 2px color-mix(in srgb, black 15%, transparent),
    0 8px 24px color-mix(in srgb, black 10%, transparent);
  --accent-brand-warm: #8B5CF6;
  --accent-soft:       color-mix(in srgb, var(--accent-brand) 6%, var(--bg-surface));
  --surface-chrome:    var(--bg-marketing);
  --surface-recessed:  color-mix(in srgb, var(--bg-marketing) 98%, black);
  --surface-raised:    color-mix(in srgb, var(--bg-marketing) 98%, white);
```

### Edit 2d — Body background gradient

Locate the `body { ... }` block inside `@layer base` and **replace** the `background-color: var(--bg-marketing);` line with:

```css
    background:
      linear-gradient(
        to bottom,
        var(--bg-marketing) 0%,
        color-mix(in srgb, var(--bg-marketing) 98%, white) 100%
      );
    background-color: var(--bg-marketing); /* fallback */
```

### Edit 2e — Reduced-motion fallback (append inside existing reduced-motion block)

Replace the existing `@media (prefers-reduced-motion: reduce)` block (lines ~509-515) with:

```css
  @media (prefers-reduced-motion: reduce) {
    :root {
      --motion-micro:    0ms;
      --motion-quick:    80ms;
      --motion-standard: 80ms;
      --motion-slow:     100ms;
    }
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
```

### Verify

- [ ] `npx tsc --noEmit`
- [ ] Reload app: backgrounds still render (no broken tokens).
- [ ] DevTools → Computed on `<body>`: `--accent-brand-warm`, `--surface-raised`, `--motion-quick`, `--ease-spring-snap` all resolve.
- [ ] Accent elements (palette hover rail, sidebar active rail) read 3–4° warmer side-by-side with a pre-branch screenshot.

### Commit

```
foundation(tokens): add chrome/surface/accent/motion tokens + warm accent

Introduces:
- --chrome-margin, --chrome-gap, --radius-chrome, --radius-row, --shadow-chrome
- --surface-chrome, --surface-recessed, --surface-raised
- --accent-brand-warm, --accent-soft, warmed --accent-brand hue
- --motion-micro/quick/standard/slow + 4 spring/easing tokens
- Body gradient + reduced-motion token overrides

Zero consumer changes yet; migrations follow.

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

---

## Task 3 — Utility classes (serif, editorial-glow, grain scaffold)

**Files:** `src/app/globals.css`

### Edit 3a — Serif utilities

At the end of the `@layer base { ... }` block (after `.tiny`, before `.mono-body`), insert:

```css
  /* ── Craft pass — serif display utilities ── */
  .heading-1-serif {
    font-family: var(--font-serif), "EB Garamond", Georgia, serif;
    font-size: 28px;
    line-height: 34px;
    letter-spacing: -0.02em;
    font-weight: 400;
  }
  .heading-2-serif {
    font-family: var(--font-serif), "EB Garamond", Georgia, serif;
    font-size: 22px;
    line-height: 28px;
    letter-spacing: -0.015em;
    font-weight: 400;
  }
  .heading-3-serif {
    font-family: var(--font-serif), "EB Garamond", Georgia, serif;
    font-size: 18px;
    line-height: 24px;
    letter-spacing: -0.015em;
    font-weight: 400;
  }
  .question-serif {
    font-family: var(--font-serif), "EB Garamond", Georgia, serif;
    font-size: 17px;
    line-height: 24px;
    letter-spacing: -0.01em;
    font-weight: 400;
  }
  .hud-title-serif {
    font-family: var(--font-serif), "EB Garamond", Georgia, serif;
    font-size: 16px;
    line-height: 22px;
    letter-spacing: -0.01em;
    font-weight: 400;
  }
```

### Edit 3b — editorial-glow + grain scaffold

Append at the end of `globals.css` (after the last `@media (max-width: 600px)` block):

```css
/* ─────────────────────────────────────────────
   CRAFT PASS — editorial glow + grain scaffold
   ───────────────────────────────────────────── */
.editorial-glow {
  position: relative;
}
.editorial-glow > * {
  position: relative;
  z-index: 1;
}
.editorial-glow::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 200px;
  pointer-events: none;
  background: radial-gradient(
    ellipse 400px 200px at top center,
    color-mix(in srgb, var(--accent-brand-warm) 10%, transparent),
    transparent 70%
  );
  z-index: 0;
}
@media (prefers-reduced-transparency: reduce) {
  .editorial-glow::before { display: none; }
}

.grain {
  position: relative;
}
.grain::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* Placeholder noise SVG — enabled later via [data-grain="enabled"] on <body>. */
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>");
  opacity: 0;
  mix-blend-mode: overlay;
}
body[data-grain="enabled"] .grain::after {
  opacity: 0.015;
}
```

### Verify

- [ ] `npx tsc --noEmit`
- [ ] Temp-test: paste `<h1 className="heading-2-serif">Test</h1>` into any page — renders in Instrument Serif 22px. Remove after verifying.
- [ ] Temp-test: wrap an element in `.editorial-glow` — radial glow appears at top. Remove after.

### Commit

```
foundation(utilities): add serif utilities + editorial-glow + grain scaffold

5 serif classes (.heading-1-serif through .hud-title-serif), .editorial-glow
with prefers-reduced-transparency fallback, and .grain scaffold gated behind
body[data-grain="enabled"] for future enablement.

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

---

# Phase B — Shell chrome

## Task 4 — Inset rounded shell (`.app-shell` + `.chrome-panel`)

**Files:** `src/components/AppShell.tsx`, `src/app/globals.css`

### Edit 4a — globals.css

Append to `globals.css` (after the grain scaffold):

```css
/* ─────────────────────────────────────────────
   CRAFT PASS — app shell chrome frame
   ───────────────────────────────────────────── */
.app-shell {
  position: fixed;
  inset: var(--chrome-margin);
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: var(--chrome-gap);
  isolation: isolate;
}

.chrome-panel {
  background: var(--surface-chrome);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-chrome);
  box-shadow: var(--shadow-chrome);
  overflow: hidden;
  isolation: isolate;
  min-width: 0;
  min-height: 0;
}

.chrome-panel--sidebar {
  display: flex;
  flex-direction: column;
}

.chrome-panel--main {
  display: flex;
  flex-direction: column;
}

@media (max-width: 880px) {
  :root {
    --chrome-margin: 0px;
    --chrome-gap:    0px;
    --radius-chrome: 0px;
  }
  .app-shell {
    grid-template-columns: 1fr;
  }
  .chrome-panel--sidebar {
    display: none;
  }
  .chrome-panel {
    border: none;
    box-shadow: none;
  }
}
```

### Edit 4b — AppShell.tsx

**Before** (the outermost `return (...)` block, lines 149-160):

```tsx
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
```

**After:**

```tsx
  return (
    <div className="app-shell" style={{ color: "var(--text-primary)" }}>
      <aside className="chrome-panel chrome-panel--sidebar sidebar-container">
        <Sidebar
```

Then locate the closing `</div>` for `.sidebar-container` (line 176) and the wrapping `<div style={{ flex: 1, ... }}>` for main content (line 178). **Before:**

```tsx
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100dvh" }}>
        {children}
      </div>
```

**After:**

```tsx
      </aside>

      <main className="chrome-panel chrome-panel--main" style={{ display: "flex", flexDirection: "column" }}>
        {children}
      </main>
```

Ensure `DetailPage`, `VaultDrawer`, `HintChip`, `CommandPalette` remain siblings inside `.app-shell` — they stay as-is (the grid ignores position:fixed/absolute children).

### Edit 4c — Sidebar.tsx: remove redundant positioning

Because the parent `.chrome-panel--sidebar` now owns the border and height, strip conflicting inline styles in `Sidebar.tsx` (line 143-154):

**Before:**

```tsx
    <aside
      className="sidebar flex flex-col shrink-0"
      style={{
        width: 240,
        height: "100dvh",
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--border-subtle)",
        position: "sticky",
        top: 0,
        overflow: "hidden",
      }}
    >
```

**After:**

```tsx
    <aside
      className="sidebar flex flex-col shrink-0"
      style={{
        width: "100%",
        flex: 1,
        minHeight: 0,
        background: "var(--bg-panel)",
        overflow: "hidden",
      }}
    >
```

### Verify

- [ ] `npx tsc --noEmit`
- [ ] Reload `/`: sidebar + main panel inset 8px from all four viewport edges, 12px rounded corners, 1px hairline border, `--shadow-chrome` visible underneath, 8px gap between them shows the body gradient.
- [ ] Narrow viewport below 880px: chrome collapses (margin → 0, sidebar hidden).
- [ ] Scrolling inside `.chrome-panel--main` does not bleed past its rounded corners.
- [ ] Existing pages (chat, graph, timeline) still mount correctly.

### Commit

```
shell(chrome): wrap sidebar + main in inset rounded chrome-panel grid

Adds .app-shell grid + .chrome-panel surfaces with 8px viewport inset, 12px
radius, hairline border, shadow-chrome. Narrow-viewport media query collapses
the chrome. Sidebar inline positioning trimmed to defer to parent panel.

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

---

## Task 5 — Sidebar: rail-inside-rounded-row + row radius + section spacing

**Files:** `src/app/globals.css`, `src/components/Sidebar.tsx`

### Edit 5a — globals.css active-rail override

The existing `.app-row::before` (line 556) positions the rail flush to the row's left edge, which looks wrong inside a rounded chrome panel. Override:

After the existing `.app-row[data-active="true"]::before` selector (not present — currently covered by generic `.app-row:hover::before`), **replace** the `.app-row` block (lines 553-572) with:

```css
  .app-row {
    position: relative;
    border-radius: var(--radius-row);
  }
  .app-row::before {
    content: "";
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 2px;
    border-radius: 2px;
    background: transparent;
    transition: background var(--motion-micro) var(--ease-out-gentle);
    pointer-events: none;
  }
  .app-row:hover::before,
  .app-row:focus-visible::before,
  .app-row[data-active="true"]::before {
    background: var(--accent-brand);
  }
```

Note `border-radius: var(--radius-row)` is the new addition; rail geometry otherwise unchanged.

### Edit 5b — Sidebar nav-item active background radius

In `Sidebar.tsx` line 260, the nav buttons already use `rounded-[6px]`. Change to `rounded-[8px]` so the row radius matches `--radius-row`:

**Before (line 260):**

```tsx
              className="focus-ring app-row flex items-center gap-2.5 rounded-[6px] cursor-pointer"
```

**After:**

```tsx
              className="focus-ring app-row flex items-center gap-2.5 rounded-[8px] cursor-pointer"
```

Repeat for the bottom "Commands" and "Theme" rows (lines 409, 449) and for `RecentRow` / `PinnedRow` (lines 527, 601) — `rounded-[6px]` → `rounded-[8px]`.

### Edit 5c — Section header spacing

Spec calls for 8px top / 4px bottom on section headers. The "Pinned" header already has `marginBottom: 8`. Tighten to `4`:

**Before (line 297-298):**

```tsx
            justifyContent: "space-between",
            marginBottom: 8,
          }}
```

**After:**

```tsx
            justifyContent: "space-between",
            marginBottom: 4,
          }}
```

Same for Recent header (line 374): `marginBottom: 8` → `marginBottom: 4`.

Top-spacing: the `mt-6` (24px) on `.px-3 mt-6` containers already provides > 8px top margin — leave as is.

### Verify

- [ ] `npx tsc --noEmit`
- [ ] Dashboard active row: 2px brand rail sits *inside* the rounded row shape (6px from top/bottom), no bleed to the sidebar panel's rounded edge.
- [ ] Row corners read as 8px pill-ish, matching the chrome's rounded feel.
- [ ] Section labels (PINNED, RECENT) sit 4px above their first item.

### Commit

```
shell(sidebar): rail inside rounded row + 8px row radius

Row radius token (--radius-row) applied globally to .app-row; nav rows swap
rounded-[6px] → rounded-[8px]; section headers tighten to 4px bottom margin.

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

---

## Task 6 — PageShell title → serif

**Files:** `src/components/PageShell.tsx`

### Edit

**Before (lines 95-110):**

```tsx
            <h1
              style={{
                fontSize: 13,
                fontWeight: 510,
                letterSpacing: -0.1,
                lineHeight: 1,
                color: "var(--text-primary)",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {title}
            </h1>
```

**After:**

```tsx
            <h1
              className="heading-3-serif"
              style={{
                color: "var(--text-primary)",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {title}
            </h1>
```

Because `.heading-3-serif` uses `line-height: 24px`, the 48px header still centres the title vertically via `alignItems: "center"` (unchanged).

### Verify

- [ ] `npx tsc --noEmit`
- [ ] `/browse`, `/browse/graph`, `/browse/system`, `/browse/timeline`: page title renders in Instrument Serif 18px.
- [ ] Ellipsis still works when title overflows.

### Commit

```
shell(typography): PageShell title → .heading-3-serif

Promotes the 13px Inter 510 title to Instrument Serif 18/24/-0.015em across
every non-chat page.

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

---

## Task 7 — Row hover lift + button press scale globals

**Files:** `src/app/globals.css`

### Edit — append inside `@layer components` after existing `.app-row::before` block (or immediately after the replaced block from Task 5):

```css
  /* ── Craft pass — row hover lift ───────── */
  .app-row {
    transition:
      background-color var(--motion-micro) var(--ease-spring-soft),
      transform       var(--motion-micro) var(--ease-spring-soft);
  }
  .app-row:hover {
    background-color: var(--bg-surface-alpha-2);
    transform: translateY(-1px);
  }
  .app-row[data-active="true"]:hover {
    transform: translateY(0);
  }
  @media (prefers-reduced-motion: reduce) {
    .app-row:hover { transform: none; }
  }
```

### Edit — append to globals.css end:

```css
/* ─────────────────────────────────────────────
   CRAFT PASS — button press scale (global)
   ───────────────────────────────────────────── */
button, [role="button"] {
  transition:
    background-color var(--duration-fast) var(--ease-default),
    border-color     var(--duration-fast) var(--ease-default),
    color            var(--duration-fast) var(--ease-default),
    opacity          var(--duration-fast) var(--ease-default),
    box-shadow       var(--duration-fast) var(--ease-default),
    transform        var(--motion-quick)  var(--ease-spring-snap);
}
button:active, [role="button"]:active {
  transform: scale(0.97);
}
@media (prefers-reduced-motion: reduce) {
  button:active, [role="button"]:active { transform: none; }
}
```

This layers underneath the existing `button:active { transform: scale(0.97) }` in `.btn-primary`.

### Verify

- [ ] `npx tsc --noEmit`
- [ ] Hover any `.app-row` in the sidebar or a list: subtle 1px upward lift + background fade (spring-soft).
- [ ] Active sidebar row stays planted when hovered (no lift).
- [ ] Mousedown any button: 3% scale-down; release springs back.
- [ ] `prefers-reduced-motion` DevTools: lift + scale both disabled.

### Commit

```
shell(motion): row hover lift + global button press scale

.app-row gains 1px lift + spring-soft bg fade on hover; active rows stay
planted. All button/role=button get scale(0.97) :active with spring-snap.
Reduced-motion disables both.

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

---

# Phase C — Typography + surfaces — Chat

## Task 8 — ChatEmptyState heading + editorial-glow

**Files:** `src/components/chat/ChatEmptyState.tsx`

### Edit 8a — Heading to serif

**Before (lines 69-79):**

```tsx
      <h1
        style={{
          fontSize: 20,
          fontWeight: 500,
          letterSpacing: "-0.01em",
          color: "var(--text-secondary)",
          margin: 0,
        }}
      >
        Ask about your vault
      </h1>
```

**After:**

```tsx
      <h1
        className="heading-2-serif"
        style={{
          color: "var(--text-secondary)",
          margin: 0,
          textAlign: "center",
        }}
      >
        Ask about your vault
      </h1>
```

### Edit 8b — Wrap top in editorial-glow

**Before (lines 56-68):**

```tsx
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "24px",
      }}
    >
```

**After:**

```tsx
    <div
      className="editorial-glow"
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "24px",
      }}
    >
```

### Verify

- [ ] `npx tsc --noEmit`
- [ ] `/chat` (no history): heading is Instrument Serif 22px; a soft warm radial glow registers above/behind it.
- [ ] `prefers-reduced-transparency`: glow disappears, heading remains.

### Commit

```
chat(empty): heading-2-serif + editorial-glow top

Replaces Inter 20/500 with Instrument Serif 22/28/-0.015em and bathes the
empty-state panel in the signature warm radial glow.

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

---

## Task 9 — QACard question + source-pill stagger

**Files:** `src/components/chat/QACard.tsx`, `src/app/globals.css`

### Edit 9a — Question → .question-serif

**Before (lines 62-72):**

```tsx
        <h2
          style={{
            fontSize: 17,
            lineHeight: 1.4,
            fontWeight: 500,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          {turn.query}
        </h2>
```

**After:**

```tsx
        <h2
          className="question-serif"
          style={{
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          {turn.query}
        </h2>
```

### Edit 9b — Keyframe in globals.css

Append after existing keyframes:

```css
@keyframes source-enter {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

### Edit 9c — QACard SourcesRow stagger + reduced-motion guard

Replace the existing `SourcesRow` (lines 104-124) with:

```tsx
function SourcesRow({ citations, flashId }: { citations: QATurnCitation[]; flashId?: number }) {
  const reducedMotion = useReducedMotion();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      <span
        className="mono-label"
        style={{
          color: "var(--text-quaternary)",
          letterSpacing: "0.08em",
          fontVariantNumeric: "tabular-nums",
          animation: reducedMotion
            ? undefined
            : `source-enter var(--motion-quick) var(--ease-spring-snap) both`,
        }}
      >
        SOURCES · {citations.length}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {citations.map((c, i) => (
          <div
            key={c.id}
            style={{
              animation: reducedMotion
                ? undefined
                : `source-enter var(--motion-quick) var(--ease-spring-snap) ${(i + 1) * 40}ms both`,
            }}
          >
            <CitationPill id={c.id} path={c.path} heading={c.heading} flashId={flashId} />
          </div>
        ))}
      </div>
    </div>
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  return reduced;
}
```

At top of file, add `useEffect` to the existing `import { useState } from "react";` line:

**Before:** `import { useState } from "react";`
**After:** `import { useState, useEffect } from "react";`

### Verify

- [ ] `npx tsc --noEmit`
- [ ] Ask a question in `/chat` → assistant streams → on done, SOURCES label fades up then pills stagger in one by one (~40ms each).
- [ ] `prefers-reduced-motion` → pills appear instantly, no translate.
- [ ] Question text renders in Instrument Serif 17px.

### Commit

```
chat(qa): question → .question-serif + source-pill stagger

QACard question promoted to Instrument Serif 17/24/-0.01em. On citation
mount, SOURCES label + each pill run source-enter (180ms spring-snap) with
40ms stagger; gated by prefers-reduced-motion via matchMedia.

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

---

## Task 10 — Composer textarea → --surface-recessed

**Files:** `src/components/chat/Composer.tsx`

### Edit

**Before (line 79):**

```tsx
        background: "var(--bg-surface)",
```

**After:**

```tsx
        background: "var(--surface-recessed)",
```

### Verify

- [ ] `npx tsc --noEmit`
- [ ] Composer background reads subtly darker than the surrounding chat panel (a pressed-in feel).
- [ ] Light mode: also reads very slightly darker than the page.

### Commit

```
chat(composer): textarea → --surface-recessed

Composer gets the layered recessed token so it reads as pressed into the
page, distinct from chrome + raised surfaces.

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

---

## Task 11 — ModelPicker + CommandPalette surfaces + reveal choreography

**Files:** `src/components/chat/ModelPicker.tsx`, `src/components/CommandPalette.tsx`, `src/app/globals.css`

### Edit 11a — ModelPicker popover background

In `src/components/chat/ModelPicker.tsx` line 181:

**Before:** `background: "var(--bg-elevated)",`
**After:** `background: "var(--surface-raised)",`

Also line 219 (active provider button keeps `var(--bg-elevated)`) — replace with `"var(--surface-raised)"` for consistency with the popover layer it sits on.

### Edit 11b — CommandPalette dialog surface

In `src/components/CommandPalette.tsx` line 271:

**Before:** `background: "var(--bg-elevated)",`
**After:** `background: "var(--surface-raised)",`

Also line 270 (`borderRadius: "var(--radius-panel)"`) — leave unchanged; border adjacent to it (~line 272, a `border: "1px solid var(--border-subtle)"` line, verify) swap to `"var(--accent-soft)"`:

Search for the palette panel's border line near line 272. Expected shape:

**Before:** `border: "1px solid var(--border-subtle)",`
**After:** `border: "1px solid var(--accent-soft)",`

(If no matching border line exists, skip this sub-edit — spec calls it out but the panel relies on shadow.)

### Edit 11c — globals.css reveal choreography

Append to globals.css:

```css
/* ─────────────────────────────────────────────
   CRAFT PASS — palette reveal choreography
   ───────────────────────────────────────────── */
@keyframes palette-backdrop-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes palette-panel-in {
  from { opacity: 0; transform: translateY(8px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}
@keyframes palette-row-rail-in {
  from { transform: translateX(-6px); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}

.palette-backdrop {
  animation: palette-backdrop-in var(--motion-micro) var(--ease-out-gentle) both;
}
.palette-panel {
  animation: palette-panel-in var(--motion-standard) var(--ease-spring-snap) 40ms both;
  will-change: transform, opacity;
}
.palette-row-rail {
  animation: palette-row-rail-in var(--motion-quick) var(--ease-out-smooth) both;
}

@media (prefers-reduced-motion: reduce) {
  .palette-backdrop,
  .palette-panel,
  .palette-row-rail {
    animation-duration: 80ms;
    animation-timing-function: linear;
  }
}
```

### Edit 11d — CommandPalette: apply classes to backdrop + panel

In `src/components/CommandPalette.tsx` around the backdrop `motion.div` (line 250) and panel `motion.div` (line 260):

**Before (backdrop):**

```tsx
          <motion.div
            initial={{ opacity: 0 }}
            ...
```

The existing framer-motion timing competes with our CSS choreography. Strip animation props and let CSS handle it:

**Before (the two motion.div blocks — verify exact current props):**

Assume current shape:
```tsx
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} ...>
```

**After (backdrop):**

```tsx
<motion.div
  className="palette-backdrop"
  initial={false}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  transition={{ duration: 0.14, ease: "easeOut" }}
  ...
>
```

**After (panel):** add `className="palette-panel"` to the panel motion.div; keep framer-motion exit but remove enter-initial to let the CSS `palette-panel-in` keyframe run (set `initial={false}`).

Rows: find the row render block (likely a `.map()` producing a `motion.div` or a div per palette result). The leading rail pseudo-element can adopt the `palette-row-rail` class on the first row only, with inline `animationDelay` = `${120 + i*60}ms` for items 0..N.

Minimal implementation — inside the rows `.map((result, i) => ...)`, set on the rendered wrapper:

```tsx
style={{
  ...existingStyle,
  animation: `palette-row-rail-in var(--motion-quick) var(--ease-out-smooth) ${120 + i * 60}ms both`,
}}
```

(If the exact row element is a styled div wrapped in motion.div, attach to the outermost stable node; keep existing hover styles untouched.)

### Verify

- [ ] `npx tsc --noEmit`
- [ ] ⌘K → backdrop fades (~140ms), panel scales from 0.96 + y(8px) (spring-snap, ~220ms, 40ms delay), rows rail-slide in left-to-right with 60ms stagger starting at 120ms.
- [ ] Panel background is `--surface-raised` (slightly lighter than chrome).
- [ ] ModelPicker popover likewise shifts lighter.
- [ ] `prefers-reduced-motion`: all three collapse to ~80ms linear.

### Commit

```
chat(surfaces+motion): palette + ModelPicker on --surface-raised w/ reveal choreography

Palette dialog + ModelPicker popover move to --surface-raised. New CSS-driven
reveal: backdrop fade (micro, out-gentle), panel scale+y (standard, spring-
snap, 40ms delay), row-rail stagger (quick, out-smooth, 60ms each starting
at 120ms). Palette border → --accent-soft.

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

---

# Phase D — Typography + surfaces — Graph/Structure/Detail

## Task 12 — GraphCanvas HUD: serif title + --surface-raised

**Files:** `src/components/browse/GraphCanvas.tsx`

### Edit

**Before (lines 1144-1156):**

```tsx
              style={{
                position: "fixed",
                top: 12,
                right: 12,
                width: 260,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 10,
                boxShadow: "var(--shadow-dialog)",
                padding: 12,
                zIndex: 5,
                animation: "graph-hud-in 180ms ease-out",
              }}
```

**After:**

```tsx
              style={{
                position: "fixed",
                top: 12,
                right: 12,
                width: 260,
                background: "var(--surface-raised)",
                border: "1px solid var(--accent-soft)",
                borderRadius: 10,
                boxShadow: "var(--shadow-dialog)",
                padding: 12,
                zIndex: 5,
                animation: "graph-hud-in 180ms ease-out",
              }}
```

**Before (line 1163):**

```tsx
                  <div style={{ fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {focusLinks.node.title}
                  </div>
```

**After:**

```tsx
                  <div
                    className="hud-title-serif"
                    style={{
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {focusLinks.node.title}
                  </div>
```

### Verify

- [ ] `npx tsc --noEmit`
- [ ] `/browse/graph`: focus a node → HUD card appears with raised background, warmed border, title in Instrument Serif 16px.

### Commit

```
graph(hud): serif title + --surface-raised + --accent-soft border

Focus HUD card gets the raised layer treatment plus a hud-title-serif
16/22/-0.01em file title.

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

---

## Task 13 — FilePreviewPanel heading

**Files:** `src/components/browse/FilePreviewPanel.tsx`

### Gap note

Spec references an "empty-state heading-3 in FilePreviewPanel." Current code (line 177) uses `<span className="caption-large">Select a file to preview.</span>` — no heading-3. The meaningful heading is the **file title on line 239-251** (`className="heading-3"`). Promote that one instead; the 3-word empty-state caption stays as body text to preserve the "quiet when empty" feel.

### Edit

**Before (lines 238-251):**

```tsx
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2
            className="heading-3"
            style={{
              flex: 1,
              color: "var(--text-primary)",
              margin: 0,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {data.env.title}
          </h2>
```

**After:**

```tsx
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2
            className="heading-2-serif"
            style={{
              flex: 1,
              color: "var(--text-primary)",
              margin: 0,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {data.env.title}
          </h2>
```

### Verify

- [ ] `npx tsc --noEmit`
- [ ] Select a file in the vault drawer / structure view: preview panel renders title in Instrument Serif 22px.

### Commit

```
preview(typography): FilePreviewPanel title → .heading-2-serif

Heading promoted from Inter 20/590 to Instrument Serif 22/28/-0.015em. Empty-
state caption untouched (intentional gap: spec referenced a non-existent
empty-state h3 — the quiet "Select a file to preview" caption stays).

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

---

## Task 14 — DetailPage: sheet file title + editorial-glow + timing tokens

**Files:** `src/components/DetailPage.tsx`

### Edit 14a — File title → heading-2-serif

**Before (lines 827-840):**

```tsx
                  <ScrollRevealSection delay={0.08}>
                    {/* ── Title ─────────────────────────────────────────────── */}
                    <motion.h1
                      layoutId={layoutId}
                      style={{
                        fontSize: 32,
                        fontWeight: 400,
                        lineHeight: 1.13,
                        letterSpacing: "-0.704px",
                        color: theme.text.primary,
                        margin: "16px 0 0",
                      }}
                    >
                      {data.title}
                    </motion.h1>
                  </ScrollRevealSection>
```

**After:** keep the motion + scroll-reveal wrappers, just swap to the serif utility:

```tsx
                  <ScrollRevealSection delay={0.08}>
                    {/* ── Title ─────────────────────────────────────────────── */}
                    <motion.h1
                      layoutId={layoutId}
                      className="heading-2-serif"
                      style={{
                        color: theme.text.primary,
                        margin: "16px 0 0",
                      }}
                    >
                      {data.title}
                    </motion.h1>
                  </ScrollRevealSection>
```

Spec calls for 22px; the previous 32px hero feel is deliberately tightened per the spec table ("Detail sheet file title 22px").

### Edit 14b — Wrap sheet header region in .editorial-glow

Locate the panel content wrapper (line ~457: `key={`panel-${path}`}`). Inside the panel's scroll container — ideally wrapping the top header + title + badges region only — add `className="editorial-glow"`.

Minimal, safe edit: wrap the top region (breadcrumbs + title + badges) in a single div:

Find the `<ScrollRevealSection delay={0.04}>` (the path breadcrumb line around 814-824) that precedes the title ScrollRevealSection. Insert an opening div before it and a closing div after the title's `ScrollRevealSection` closes.

Concretely: insert `<div className="editorial-glow" style={{ margin: "0 -16px 0 -16px", padding: "8px 16px 0" }}>` before the first ScrollRevealSection of the header area and close `</div>` after the title block. The negative horizontal margin keeps the glow aligned with the sheet's inner padding.

### Edit 14c — Enter choreography timing tokens

The sheet currently relies on framer-motion. Its `transition` props likely use numeric durations; swap them to reference the new tokens where practical. Locate the panel's `motion.div` (around line 457) and its `transition={...}`:

**Before (expected form):** `transition={{ type: "spring", ... }}` or `{ duration: 0.22 }`.

**After:** leave framer-motion springs intact (they're already spring-flavoured). No code change beyond the editorial-glow wrap is required here — the CSS motion tokens are for pure-CSS surfaces; framer-motion drives this sheet and its timing already falls in the 180–240ms range. Document this choice in the commit.

### Verify

- [ ] `npx tsc --noEmit`
- [ ] Open any file as `?sheet=<path>`: title renders Instrument Serif 22px, warm editorial-glow haloes behind the breadcrumb + title.
- [ ] Sheet still slides in from right, content still reveals via ScrollRevealSection — no regressions.

### Commit

```
detail(sheet): file title → .heading-2-serif + editorial-glow header

Sheet title promoted to Instrument Serif 22/28/-0.015em (down from the 32px
hero). Breadcrumb + title region wrapped in .editorial-glow. Framer-motion
enter springs left intact — already in the 180-240ms spring range that the
new tokens codify.

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

---

# Phase E — Polish

## Task 15 — Success-icon morph pattern

**Files:** `src/components/ChatInterface.tsx` (Clear-chat), `src/components/chat/ModelPicker.tsx` (Save button). Also introduce a shared `IconStack` primitive in `src/components/ui/IconStack.tsx` (new, ~25 LOC) to avoid duplicating the pattern.

### Gap note

Copy-link button is **not** present in the current tree per the spec's list. Skip; pattern still applied to Clear-chat + ModelPicker save.

### Edit 15a — New `src/components/ui/IconStack.tsx`

```tsx
"use client";

import type { ReactNode } from "react";

/**
 * IconStack — two stacked SVGs with opacity crossfade on `fired`.
 * Used for success-icon morphs (clear → check, save → check, etc.).
 * Matches the spec's motion-slow / spring-soft timing via CSS in globals.
 */
export function IconStack({
  fired,
  idle,
  success,
  size = 14,
}: {
  fired: boolean;
  idle: ReactNode;
  success: ReactNode;
  size?: number;
}) {
  return (
    <span
      className="icon-stack"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className={fired ? "swap-out" : "swap-in"}>{idle}</span>
      <span className={fired ? "swap-in"  : "swap-out"}>{success}</span>
    </span>
  );
}
```

### Edit 15b — globals.css

Append:

```css
/* ─────────────────────────────────────────────
   CRAFT PASS — icon stack crossfade
   ───────────────────────────────────────────── */
.icon-stack {
  position: relative;
  display: inline-block;
}
.icon-stack > span {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: opacity var(--motion-slow) var(--ease-spring-soft);
}
.icon-stack > .swap-out { opacity: 0; }
.icon-stack > .swap-in  { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .icon-stack > span { transition: none; }
}
```

### Edit 15c — Clear-chat (ChatInterface.tsx)

Locate the PageAction for "Clear chat" (line ~210). Add local `fired` state, wire the click handler to set `fired=true` for 400ms, and swap the icon child to an `IconStack`:

Before (approximate):

```tsx
<PageAction label="Clear chat" onClick={clearChat}>
  <svg ...>{/* trash icon */}</svg>
</PageAction>
```

After:

```tsx
const [clearFired, setClearFired] = useState(false);
...
<PageAction
  label="Clear chat"
  onClick={() => {
    clearChat();
    setClearFired(true);
    window.setTimeout(() => setClearFired(false), 400);
  }}
>
  <IconStack
    fired={clearFired}
    idle={<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6h12z"/></svg>}
    success={<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
  />
</PageAction>
```

(Use the repo's existing trash icon markup; polyline above is the check.)

### Edit 15d — ModelPicker Save

Locate the save button in `ModelPicker.tsx` (search for the save-key confirmation, near the provider API-key save action). Wrap its interior icon in the same `IconStack` pattern with a local `savedFired` boolean that flips for 400ms after a successful save.

### Verify

- [ ] `npx tsc --noEmit`
- [ ] Click Clear-chat with existing turns: messages clear, the trash icon crossfades to a checkmark for 400ms, then reverts.
- [ ] Save an API key in ModelPicker: button icon crossfades to check for 400ms.
- [ ] `prefers-reduced-motion`: crossfade is instant.

### Commit

```
polish(motion): success-icon morph on Clear-chat + ModelPicker save

New IconStack primitive + .icon-stack CSS (motion-slow + spring-soft cross-
fade). Applied to Clear-chat button (ChatInterface) and ModelPicker save.
Copy-link deferred — surface not present in tree.

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

---

## Task 16 — CIPHER_ brand cursor color when connected

**Files:** `src/app/globals.css`

### Edit

Currently (line 880): the connected cursor uses `color: var(--text-primary)`. Spec: switch to `var(--accent-brand-warm)`.

**Before:**

```css
.cipher-cursor[data-state="connected"] {
  animation: cipher-cursor-blink 1200ms ease-in-out infinite;
  color: var(--text-primary);
}
```

**After:**

```css
.cipher-cursor[data-state="connected"] {
  animation: cipher-cursor-blink 1200ms ease-in-out infinite;
  color: var(--accent-brand-warm);
}
```

### Verify

- [ ] `npx tsc --noEmit`
- [ ] Sidebar: when vault connected, the trailing `_` after CIPHER blinks in the warmed violet hue; disconnected remains quaternary grey.

### Commit

```
polish(brand): CIPHER_ connected cursor → --accent-brand-warm

Connected vault cursor color swaps from text-primary to the warmed violet
accent for a quiet brand signal.

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

---

# Final verification

Run through the 24-item gate from the spec (§Verification), verbatim:

- [ ] 1. `npx tsc --noEmit` clean.
- [ ] 2. `npm run build` green.
- [ ] 3. Any page → sidebar + main inset 8px, 12px radius, 1px hairline, shadow-chrome. Gap shows the body gradient.
- [ ] 4. Active sidebar rail stays inside the rounded row shape.
- [ ] 5. Page titles render Instrument Serif 18px on every page (Chat / Graph / Structure / System / Timeline / Today).
- [ ] 6. Empty-state headings render Instrument Serif 20–22px (chat empty, file preview empty).
- [ ] 7. QACard asked-question renders Instrument Serif 17px; assistant prose stays Inter.
- [ ] 8. Detail sheet file title renders Instrument Serif 22px.
- [ ] 9. Focus-mode HUD card file title renders Instrument Serif 16px.
- [ ] 10. Body text, rows, labels, buttons, inputs — all still Inter.
- [ ] 11. Accent color reads 3° warmer — compare against pre-branch screenshot.
- [ ] 12. Composer + code blocks use `--surface-recessed`.
- [ ] 13. Palette + HUD + ModelPicker use `--surface-raised`.
- [ ] 14. `.editorial-glow` visible behind: empty-state chat heading, sheet file title, sidebar brand mark when connected. **(Note: sidebar brand-mark glow is only implicit via accent-brand-warm on the cursor; if a literal glow is desired, stretch-add in a follow-up.)**
- [ ] 15. Hover any `.app-row` → 1px lift spring-soft + background fade.
- [ ] 16. Click any button → 97% scale on press.
- [ ] 17. Open a file → sheet slides in (spring-snap ~240ms), content fades in ~60ms later, glow fades in after content.
- [ ] 18. ⌘K → backdrop fades, panel scales 0.96→1 + y(8)→0, first row rail slides in, rows stagger 60ms.
- [ ] 19. QACard done streaming → SOURCES + pills stagger-slide in with 40ms between pills.
- [ ] 20. Click Clear-chat → icon morphs to checkmark for 400ms, reverts.
- [ ] 21. DevTools `prefers-reduced-motion: reduce`: row lift off, button scale off, enter/exit ≤100ms, pill stagger skipped.
- [ ] 22. DevTools `prefers-reduced-transparency: reduce`: `.editorial-glow` gradients gone.
- [ ] 23. Viewport <880px: sidebar hidden, chrome margin collapses.
- [ ] 24. Theme toggle dark ↔ light: all new tokens resolve, warmed accent shifts, surfaces keep relative depth, glow alpha reads correctly.

### Merge back

```bash
git push -u origin v20-craft-pass
git checkout v19-graph-polish
git pull --ff-only
git merge --ff-only v20-craft-pass
git push origin v19-graph-polish
```

(Only run the ff-merge if the user approves it — otherwise land via PR.)

---

## Open concerns for reviewer

1. **Task 3 noise SVG** is a minimal inline stub; the spec permitted "scaffolded disabled" so exact SVG content isn't load-bearing. If a cleaner noise pattern is desired later, swap the `background-image` data URL.
2. **Task 11 palette rows** — the real row markup inside `CommandPalette.tsx` uses a mix of framer-motion + styled divs. The plan adds `animation` inline; if a row wrapper is a `motion.div` with conflicting `animate`, prefer attaching the class to its inner stable child (not the motion root) to avoid framer-motion overriding the CSS animation.
3. **Task 14 editorial-glow wrap** — in DetailPage the breadcrumb/title region lives inside multiple nested ScrollRevealSections. If wrapping in a new div breaks reveal delays, wrap a `position: absolute` `::before`-style element instead by adding `.editorial-glow` to the outer `motion.div` for the sheet panel at line 457 — the glow is already `position: absolute inset: 0 0 auto 0` so it lives above the panel regardless of inner layout.
4. **Task 14 timing tokens** — framer-motion springs aren't swapped to CSS tokens because the sheet's entrance is JS-driven and already in-range. If the spec reviewer insists on token unification, migrate in a follow-up by replacing `transition={...}` with `{ duration: 0.24, ease: [0.22, 1.2, 0.36, 1] }`.
5. **Task 15 copy-link** — no Copy-link button in the tree; success-morph applied to Clear-chat + ModelPicker save only. If a share/copy action lands later, wire it in one line via the new `IconStack` primitive.
6. **Sidebar brand-mark editorial-glow** (verification item 14) — the spec calls for a glow behind `CIPHER_` when connected. We ship the warmed cursor color; the full glow is a small stretch (add `.editorial-glow` to the brand-mark button with reduced height) — noted, not in plan, one-line follow-up.
7. **`--accent-brand` warming** will ripple through every consumer (focus rings, brand pills, status dots…). This is intentional per spec but worth a visual diff pass at the end of Task 2.
