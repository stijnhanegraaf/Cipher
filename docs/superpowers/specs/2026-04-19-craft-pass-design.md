# Craft Pass — Linear × Editorial refinement

**Date:** 2026-04-19
**Status:** Approved for planning
**Scope:** A unified UI craft pass that preserves Linear's cool precision as the base and layers editorial warmth on top, plus one tactile shell move (inset rounded chrome). Four coordinated layers ship together as a single design-system evolution, not four isolated passes — the whole is greater than the sum.

The four layers:

1. **Chrome framework** — inset rounded sidebar + main panel + drawer inside 8px viewport margins. Hairline borders, card radius, subtle shadow.
2. **Typography** — add `Instrument Serif` via `next/font/google` and place it surgically on 6 named display surfaces (page titles, empty-state headings, QA question, sheet title, HUD title). Keep Inter everywhere else.
3. **Color + texture** — warm `--accent-brand` ~3° toward violet, introduce `--accent-brand-warm`, `--accent-soft`, and three layered surface tokens (`--surface-chrome`, `--surface-recessed`, `--surface-raised`). One `.editorial-glow` utility for three signature surfaces. Grain texture hook scaffolded, disabled.
4. **Motion + micro-interactions** — replace cubic-bezier grab-bag with four semantic spring tokens. Choreograph seven named interactions: row hover lift, button press scale, sheet unfold, palette reveal, source-pill stagger, success-icon morph, already-shipped brand cursor. Full `prefers-reduced-motion` fallback.

---

## Context

Current UI ships with Linear-grade tokens (4px grid, geometric, cool indigo accent, single flat surface, uniform cubic-bezier easing). It reads as correct and precise, but referent products the user admires — Josh Puckett's DialKit, Benji Agentation — feel *lovable*. The difference is **warmth placed surgically**: a single serif face in three display slots, a whisper of a gradient under a heading, a spring in a button press, rounded floating chrome. Not a rebrand — a refinement that makes the existing precision feel chosen rather than defaulted.

This spec documents the tokens, surfaces, and micro-interactions needed to execute that refinement across the whole app in one coherent change.

---

## Goals

1. Every page inherits the new inset chrome without per-page code changes.
2. Typography hierarchy gets one editorial register (serif display) alongside the existing Inter UI stack, applied to 6 specific surfaces.
3. Color system gains 5 new semantic tokens and retains backward compatibility with all existing `--accent-brand` / `--border-subtle` / `--bg-surface` consumers.
4. Motion feels spring-based and choreographed, not linear and instantaneous.
5. Everything respects `prefers-reduced-motion` and `prefers-reduced-transparency`.
6. Zero feature changes. Zero copy changes. Zero backend changes. No new dependencies beyond `next/font/google` (already in the bundle for Inter).

---

## Non-goals (firm)

- No logo or brand mark redesign. `CIPHER_` already ships.
- No icon system rework.
- No per-page bespoke layouts.
- No theme palette overhaul (hues stay; just warm the accent 3°).
- No component architecture changes (PageShell, Sidebar, CommandPalette bodies — only token + class updates).
- No third-party motion / animation libraries added.
- No SVG morph library — icon crossfades via two stacked `<svg>` + opacity transition.
- No grain texture enabled in v1 ship (token scaffolding only).
- No Instrument Serif beyond latin subset.
- No copy changes, no feature changes, no backend changes.

---

## Layer 1 — Chrome framework (inset rounded shell)

### Goal

The app currently fills the viewport edge-to-edge. New: the sidebar + main panel + drawer sit inside an 8px viewport margin, with rounded corners and a hairline border, reading as "floating inside a desk surface" rather than "slammed to the window edges."

### Outer shell background

`<body>` background becomes a faint two-stop vertical gradient:

```css
body {
  background: linear-gradient(
    to bottom,
    var(--bg-marketing) 0%,
    color-mix(in srgb, var(--bg-marketing) 98%, white) 100%
  );
}
```

In light mode the bottom stop is 98%-of-marketing-mixed-with-black. Effect is ~1% brightness delta — registers only as a sense of depth behind the chrome.

### Frame

All chrome panels share:

```css
:root {
  --chrome-margin: 8px;          /* viewport inset */
  --chrome-gap: 8px;              /* gap between sidebar + main */
  --radius-chrome: 12px;          /* chrome panel radius */
  --shadow-chrome:
    0 1px 2px color-mix(in srgb, black 25%, transparent),
    0 8px 24px color-mix(in srgb, black 18%, transparent);
}
```

In light mode, `--shadow-chrome` opacities halve to `15%` and `10%`.

The root app layout becomes:

```tsx
<div className="app-shell">
  <aside className="chrome-panel chrome-panel--sidebar">...</aside>
  <main className="chrome-panel chrome-panel--main">...</main>
</div>
```

```css
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
}
```

### Sidebar adjustments

- Width: 240px (unchanged).
- Internal padding: 12px horizontal / 8px vertical (4px grid).
- Row height: `--row-h-cozy` (32px, unchanged).
- Row radius: `--radius-row` (new token, 8px).
- Active row rail stays 2px brand but lives *inside* the rounded row shape — no bleed to chrome edge:

```css
.app-row[data-active="true"] {
  position: relative;
  background: var(--bg-surface-alpha-4);
  border-radius: var(--radius-row);
}
.app-row[data-active="true"]::before {
  content: "";
  position: absolute;
  left: 0; top: 6px; bottom: 6px;
  width: 2px;
  background: var(--accent-brand);
  border-radius: 2px;
}
```

- Section headers (PINNED, RECENT, etc.) get 8px top margin, 4px bottom margin.
- Brand mark (`CIPHER_`) container padding + height unchanged — the wordmark was already tuned in the brand refresh.

### Main panel

- `flex: 1; min-width: 0; min-height: 0` inside the grid.
- Page shell header + toolbar sticky to the panel top, not the viewport — inherits the panel's rounded inner clip automatically via `overflow: hidden` on `.chrome-panel`.

### Detail sheet / drawer

- The existing detail sheet (slides from right) gets a `border-radius: var(--radius-chrome) 0 0 var(--radius-chrome)` on its left edge so it visually pulls *from* the main panel.
- Drawer inherits `--surface-raised` (see Layer 3) for its background.
- The command palette dialog already uses `--radius-panel`; no change.

### Narrow viewports

```css
@media (max-width: 880px) {
  :root { --chrome-margin: 0px; --chrome-gap: 0px; --radius-chrome: 0px; }
  .app-shell { grid-template-columns: 1fr; }
  .chrome-panel--sidebar { display: none; }   /* replaced by drawer trigger */
}
```

Drawer takes over for sidebar access. Inside the drawer, row radius still applies.

### Backward compatibility

Existing `--border-subtle`, `--bg-surface`, `--bg-marketing`, `--radius-panel` tokens are untouched — every downstream consumer keeps working. Only new tokens are added.

---

## Layer 2 — Typography

### Add Instrument Serif

Via `next/font/google` in the root layout:

```tsx
import { Instrument_Serif } from "next/font/google";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});
```

Applied to `<body className={`${inter.variable} ${instrumentSerif.variable}`}>`.

CSS variable exposed as `--font-serif`. Fallback stack: `"Instrument Serif", "EB Garamond", Georgia, serif`.

### Placement (surgical — 6 surfaces only)

| Surface | Size / weight / tracking | Notes |
|---|---|---|
| **PageShell title** | 18px / 400 / −0.015em | Replaces current 13px Inter 510. |
| **Empty-state heading** (chat, file preview empty, vault not connected) | 20-22px / 400 / −0.015em | Replaces current heading-3. |
| **QACard question** | 17px / 400 / −0.01em, primary color | The asked query. Assistant prose answer STAYS Inter. |
| **Detail sheet file title** | 22px / 400 / −0.015em | At the top of the sheet. |
| **Focus-mode HUD card title** | 16px / 400 / −0.01em | The focused node's basename. |
| **Brand splash / loading hero** (if/when used) | 28px / 400 / −0.02em | Reserved; no surface uses this today but the token exists. |

Every other surface stays Inter. That's the discipline — serif earns its moments.

### Italic discipline

Italic allowed only:
- Inside serif headings (rare, editorial moments — e.g. a quoted phrase in a page title).
- In wiki-link previews when showing an external source attribution.

Never in body UI. Keeps italic meaningful when it appears.

### Scale (complete table)

```
heading-1-serif: 28px / 34 / -0.02em    (serif, 400) — reserved, splash
heading-2-serif: 22px / 28 / -0.015em   (serif, 400) — sheet title, empty heading
heading-3-serif: 18px / 24 / -0.015em   (serif, 400) — page shell title
question-serif: 17px / 24 / -0.01em     (serif, 400) — QACard question
hud-title-serif: 16px / 22 / -0.01em    (serif, 400) — focus HUD title

heading-3: 15px / 20 / -0.01em          (Inter, 510) — unchanged (section titles)
body-large: 15px / 22 / -0.005em        (Inter, 400) — QA answer prose
body: 13px / 20 / 0                     (Inter, 400) — rows, body
caption-large: 12px / 16 / 0            (Inter, 400) — row secondary
caption: 11px / 14 / 0                  (Inter, 400) — metadata
micro / mono-label: 10px / 12 / +0.08em (mono, uppercase) — unchanged
```

### CSS utility classes

```css
.heading-2-serif {
  font-family: var(--font-serif);
  font-size: 22px;
  line-height: 28px;
  letter-spacing: -0.015em;
  font-weight: 400;
}
.heading-3-serif { ... /* 18 / 24 */ }
.question-serif { ... /* 17 / 24 */ }
.hud-title-serif { ... /* 16 / 22 */ }
```

Consumer components swap their inline font styling for these classes.

### Font loading

- Preload subset: `latin`.
- `display: swap` so Inter renders immediately, serif swaps when ready.
- Fallback stack guarantees serif-ish rendering even if Google Fonts fails.
- Total payload increase: one extra WOFF2 file (~15 KB compressed for the 400 weight + latin subset).

---

## Layer 3 — Color + texture

### Warm the accent (3° hue shift)

Current:
- `--accent-brand` dark: `#818CF8`
- `--accent-brand` light: `#6366F1`

New:
- `--accent-brand` dark: `#8C8FEE` (was 232° → now 236°)
- `--accent-brand` light: `#6E6AD6` (was 238° → now 243°)

The shift is 3-4° toward violet. Perceptible side-by-side but not on its own — it reads as "the same accent, warmer." Pairs with the serif type better than the original colder indigo.

All existing consumers of `--accent-brand` inherit automatically.

### New accent tokens

```css
:root {
  --accent-brand-warm: #A78BFA;
  --accent-soft: color-mix(in srgb, var(--accent-brand) 6%, var(--bg-surface));
}
:root.light {
  --accent-brand-warm: #8B5CF6;
  --accent-soft: color-mix(in srgb, var(--accent-brand) 6%, var(--bg-surface));
}
```

Usage:
- `--accent-brand-warm`: serif heading underlines on hover, `CIPHER_` cursor when connected (replaces current text-primary), focus-mode subgraph edge glow.
- `--accent-soft`: substitute for `--border-subtle` on 3 specific surfaces (empty-state composer border, HUD card border, sources-row dividers) where we want a hint of warmth in the separator.

### Surface depth — three layered tokens

```css
:root {
  --surface-chrome:   var(--bg-marketing);   /* outer frame (sidebar + main panel) */
  --surface-recessed: color-mix(in srgb, var(--bg-marketing) 98%, black);  /* inputs, code blocks */
  --surface-raised:   color-mix(in srgb, var(--bg-marketing) 98%, white);  /* palette, HUD, dropdowns */
}
:root.light {
  --surface-chrome:   var(--bg-marketing);
  --surface-recessed: color-mix(in srgb, var(--bg-marketing) 98%, black);
  --surface-raised:   color-mix(in srgb, var(--bg-marketing) 98%, white);
}
```

Switch tokens on existing components:

| Component | Was | Now |
|---|---|---|
| Composer textarea | `var(--bg-surface)` | `var(--surface-recessed)` |
| Code blocks (QA prose) | `var(--bg-surface)` | `var(--surface-recessed)` |
| Command palette dialog | `var(--bg-elevated)` | `var(--surface-raised)` |
| ModelPicker popover | `var(--bg-elevated)` | `var(--surface-raised)` |
| Focus HUD card | `var(--bg-elevated)` | `var(--surface-raised)` |
| Dropdowns (any) | `var(--bg-elevated)` | `var(--surface-raised)` |

`--bg-surface` / `--bg-elevated` still exist and still work — just gently replaced on these 6 consumers.

### Editorial glow utility

A single opt-in utility class:

```css
.editorial-glow {
  position: relative;
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
```

Applied to **three surfaces**:
1. Top of the empty-state chat panel (behind `Ask about your vault`).
2. Top of the detail sheet (behind the file title when a file first opens).
3. Behind the `CIPHER_` brand mark in the sidebar (when vault is connected).

Three locations, no more. Registers peripherally.

### Grain texture (scaffolded, disabled in v1)

```css
.grain {
  position: relative;
}
.grain::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: url("data:image/svg+xml,...");  /* 64×64 noise SVG */
  opacity: 0.015;
  mix-blend-mode: overlay;
}
```

Class exists, applied to `<body>` behind a feature flag (`data-grain="enabled"` attribute). Default off. Spec documents the hook so enabling later is a one-line change.

### Semantic colors unchanged

`--success`, `--warning`, `--status-blocked`, `--error` keep their current hex. Warming them would break status signal.

---

## Layer 4 — Motion + micro-interactions

### Easing tokens

```css
:root {
  --ease-spring-soft:  cubic-bezier(0.34, 1.56, 0.64, 1);   /* slight overshoot */
  --ease-spring-snap:  cubic-bezier(0.22, 1.2, 0.36, 1);    /* confident, no overshoot */
  --ease-out-smooth:   cubic-bezier(0.16, 1, 0.3, 1);       /* "Linear easing" */
  --ease-out-gentle:   cubic-bezier(0.25, 0.1, 0.25, 1);    /* existing — fades */
}
```

### Duration tokens

```css
:root {
  --motion-micro:      120ms;    /* row hover, color swap */
  --motion-quick:      180ms;    /* button press, opacity fades */
  --motion-standard:   240ms;    /* sheet/drawer enter, palette reveal */
  --motion-slow:       400ms;    /* camera glides, success morphs */
}
```

### Usage map

| Interaction | Duration | Easing | Notes |
|---|---|---|---|
| Row hover (lift + bg fade) | `--motion-micro` | `--ease-spring-soft` | New micro-moment. |
| Button press scale | `--motion-quick` | `--ease-spring-snap` | Press 0.97 → release 1.0. |
| Sheet enter (frame) | `--motion-standard` | `--ease-spring-snap` | Slide from right. |
| Sheet enter (content) | `--motion-quick` | `--ease-out-gentle` | Fades in, 60ms delay after frame. |
| Sheet enter (editorial glow) | `--motion-quick` | `--ease-out-gentle` | Fades in, 120ms after content. |
| Sheet exit | `--motion-quick` | `--ease-out-smooth` | Slide out + fade, together. |
| Palette backdrop | `--motion-micro` | `--ease-out-gentle` | Fade. |
| Palette panel | `--motion-standard` | `--ease-spring-snap` | Scale 0.96→1, y(+8)→0. |
| Palette row rail | `--motion-quick` | `--ease-out-smooth` | Slides from left, 60ms stagger. |
| QACard source pills | `--motion-quick` | `--ease-spring-snap` | Stagger 40ms each. |
| Success icon morph | `--motion-slow` | `--ease-spring-soft` | Opacity crossfade. |
| Focus-mode camera glide | 400ms | `--ease-spring-snap` | Already specified in graph spec; tokens align now. |

### Signature micro-interactions (detail)

**1. Row hover lift**

```css
.app-row {
  transition:
    background var(--motion-micro) var(--ease-spring-soft),
    transform var(--motion-micro) var(--ease-spring-soft);
}
.app-row:hover {
  background: var(--bg-surface-alpha-2);
  transform: translateY(-1px);
}
.app-row[data-active="true"]:hover {
  transform: translateY(0);  /* active rows stay planted */
}
```

**2. Button press scale**

```css
button {
  transition: transform var(--motion-quick) var(--ease-spring-snap);
}
button:active {
  transform: scale(0.97);
}
```

Applied globally via a base rule on `button, [role="button"]`. Components that already have their own `:active` state get the scale layered underneath.

**3. Sheet unfold choreography**

Three stacked transitions on sheet mount:

```
frame:   transform: translateX(100%) → 0,     240ms spring-snap,   delay 0ms
content: opacity:   0 → 1,                    180ms out-gentle,    delay 60ms
glow:    opacity:   0 → 1,                    180ms out-gentle,    delay 180ms
```

Exit reverses frame + content together over 180ms out-smooth; glow fades with them.

**4. Palette reveal**

```
backdrop:  opacity 0 → 1,                         140ms out-gentle,   delay 0
panel:     opacity + scale(0.96) + y(8px) → 1/0/0, 220ms spring-snap, delay 40ms
first row highlighted rail slides in from left,    180ms out-smooth,  delay 120ms, 60ms row-stagger
```

**5. QACard source-pill stagger**

On stream-complete (when `status === "done"`):

```tsx
// Pseudocode — each source pill gets a CSS animation-delay via inline style
{sources.map((s, i) => (
  <CitationPill
    key={i}
    style={{ animation: `source-enter 180ms var(--ease-spring-snap) ${i * 40}ms both` }}
    ...
  />
))}
```

```css
@keyframes source-enter {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

**6. Success icon morph**

For the Clear-chat, Copy-link, Delete, Save-key buttons — on successful action:

```tsx
// Two stacked <svg>, opacity crossfade
const [fired, setFired] = useState(false);
onClick={() => {
  doThing();
  setFired(true);
  setTimeout(() => setFired(false), 400);
}}

<div className="icon-stack">
  <svg className={fired ? "swap-out" : "swap-in"}>{/* regular icon */}</svg>
  <svg className={fired ? "swap-in" : "swap-out"}>{/* checkmark */}</svg>
</div>
```

```css
.icon-stack { position: relative; width: 14px; height: 14px; }
.icon-stack > svg { position: absolute; inset: 0; transition: opacity var(--motion-slow) var(--ease-spring-soft); }
.icon-stack > .swap-out { opacity: 0; }
.icon-stack > .swap-in { opacity: 1; }
```

**7. Brand cursor breathing — unchanged**

Already shipped. Harmonizes with the new motion tokens without code changes.

### Global principles

- Enter = `--ease-spring-snap` (confident).
- Exit = `--ease-out-smooth` (graceful).
- Micro-feedback = `--ease-spring-soft` (lively).
- Fades = `--ease-out-gentle` (unchanged).
- Stagger simultaneous motions by ≥ 40ms.
- Never transition `box-shadow` or `filter: blur` (forces repaint). `transform` + `opacity` only.
- Add `will-change: transform, opacity` only during active animation; remove after.

### Reduced-motion fallback

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-micro: 0ms;
    --motion-quick: 80ms;
    --motion-standard: 80ms;
    --motion-slow: 100ms;
  }
  .app-row:hover { transform: none; }
  button:active { transform: none; }
  .icon-stack > svg { transition: none; }
  /* any stagger delays inline-styled → :has() to override unavailable in pure CSS;
     components consuming motion tokens should detect reduced-motion via matchMedia
     and skip stagger logic */
}
```

Components with JS-driven stagger (QACard source pills, palette row reveal) check `window.matchMedia("(prefers-reduced-motion: reduce)").matches` and skip the per-item delay when true.

### Performance guards

- All transitions use `transform` + `opacity`.
- `will-change` applied only during active animation.
- Instrument Serif loaded with `display: swap` to avoid FOIT.
- No new deps.

---

## Files touched

**Modified:**

| File | Change |
|---|---|
| `src/app/layout.tsx` | Add Instrument Serif via `next/font/google` alongside existing Inter. Wire `--font-serif` CSS variable. Add `data-theme` attribute + (optional future) `data-grain` attribute. |
| `src/app/globals.css` | New CSS custom properties (chrome, shadows, accent-brand-warm, accent-soft, surface-recessed, surface-raised, radius-chrome, radius-row, motion durations, spring easings). New utility classes (`.heading-2-serif`, `.heading-3-serif`, `.question-serif`, `.hud-title-serif`, `.editorial-glow`, `.grain`). Updated `.app-row` transitions + hover lift. Base `button` press-scale rule. Warm accent hue shift. Media queries for reduced-motion / reduced-transparency / narrow viewport. Update body background gradient. |
| `src/components/AppShell.tsx` (or wherever the sidebar + main grid lives — likely `app/layout.tsx` or a shell component) | Wrap sidebar + main in `.app-shell` grid container. Apply `.chrome-panel` to each. |
| `src/components/Sidebar.tsx` | Swap inline active-row rail CSS for the `::before` pattern (inside rounded shape). Add row radius. |
| `src/components/PageShell.tsx` | PageShell `title` → `className="heading-3-serif"` instead of inline 13px Inter. |
| `src/components/chat/ChatEmptyState.tsx` | Heading → `.heading-2-serif`. Composer wrapped in `.editorial-glow`. |
| `src/components/chat/QACard.tsx` | Question → `.question-serif`. Source-pill stagger animation on stream-complete. |
| `src/components/chat/Composer.tsx` | Textarea background → `var(--surface-recessed)`. |
| `src/components/chat/ModelPicker.tsx` | Popover background → `var(--surface-raised)`. |
| `src/components/CommandPalette.tsx` | Dialog background → `var(--surface-raised)`. Reveal animation choreography per §4. Border → `var(--accent-soft)`. |
| `src/components/browse/FilePreviewPanel.tsx` | Empty-state heading → `.heading-2-serif` (if exists). |
| `src/components/browse/GraphCanvas.tsx` | HUD card title → `.hud-title-serif`. Card background → `var(--surface-raised)`. |
| `src/components/DetailPage.tsx` (or wherever the sheet renders) | File title → `.heading-2-serif`. Sheet wrapped in `.editorial-glow`. Enter/exit choreography timing tokens. |

**New:** none.

---

## Accessibility

- Instrument Serif has its own hinting + optical size at small sizes; 16px minimum for body use. Used only at 16px+ in this spec.
- `prefers-reduced-motion` gates all motion.
- `prefers-reduced-transparency` disables the `.editorial-glow` + future `.grain` texture.
- All existing ARIA roles unchanged.
- Color contrast ratios for warmed accent verified against WCAG AA (both dark/light).

---

## Verification

1. `npx tsc --noEmit` clean.
2. `npm run build` green.
3. `/` (any page) → sidebar + main panel sit inset 8px from viewport edges, 12px radius, 1px hairline border, `--shadow-chrome` underneath. Gap between sidebar + main shows the subtle background gradient.
4. Active sidebar row rail stays 2px brand, fits inside the 8px rounded row shape (no bleed to chrome edge).
5. Page titles render in Instrument Serif 18px on every page (Chat / Graph / Structure / System / Timeline / Today).
6. Empty-state headings render in Instrument Serif 20–22px (chat empty, file preview empty).
7. QACard asked-question renders in Instrument Serif 17px; assistant prose stays Inter.
8. Detail sheet file title renders in Instrument Serif 22px.
9. Focus-mode HUD card file title renders in Instrument Serif 16px.
10. Body text, rows, labels, buttons, inputs — all still Inter.
11. Accent color reads 3° warmer — compare against a screenshot reference in the commit message.
12. Composer + code blocks use the new `--surface-recessed` (subtly darker).
13. Palette + HUD + ModelPicker use `--surface-raised` (subtly lighter).
14. `.editorial-glow` visible behind: empty-state chat heading, sheet file title on open, sidebar brand mark when connected.
15. Hover any `.app-row` → 1px lift with spring-soft easing, background fades together.
16. Click any button → 97% scale on press.
17. Open a file from sidebar → sheet slides in (spring-snap 240ms), content fades in 60ms later, editorial glow fades in after content.
18. ⌘K palette open → backdrop fades, panel scales from 0.96 + y(8) → 1 (spring-snap), first row rail slides in from left, subsequent rows stagger 60ms.
19. QACard finishes streaming → SOURCES header + pills stagger-slide in with 40ms between pills.
20. Click Clear-chat → icon morphs to checkmark for 400ms, then reverts.
21. Chrome DevTools → Emulate `prefers-reduced-motion: reduce`:
    - Row hover lift disabled, button press scale disabled.
    - All enter/exit collapse to ≤100ms.
    - Source-pill stagger skipped.
    All interactions still functional.
22. Chrome DevTools → Emulate `prefers-reduced-transparency: reduce`:
    - All `.editorial-glow` instances render without the gradient.
23. Narrow the viewport below 880px → sidebar becomes drawer, chrome margin collapses to 0.
24. Theme toggle (dark ↔ light): all new tokens resolve correctly, warmed accent shifts per theme, surfaces retain relative depth, editorial glow adjusts alpha.

---

## One-sentence summary

Ship a unified UI craft pass that keeps Linear's cool precision as the base and layers editorial warmth on top via (1) an inset rounded chrome frame around the sidebar + main panel + drawer, (2) `Instrument Serif` placed surgically on 6 display surfaces (page titles, empty-state headings, QA questions, sheet titles, HUD titles), (3) a 3° hue-warmed accent plus two new accent tokens and three layered surface tokens powering three signature `.editorial-glow` surfaces, and (4) a coherent motion language built from four spring-easing tokens that choreographs row hover lifts, button press scales, sheet unfolds, palette reveals, source-pill staggers, and success-icon morphs — all fully gated behind `prefers-reduced-motion` and `prefers-reduced-transparency`, with zero feature / copy / backend changes and zero new runtime dependencies.
