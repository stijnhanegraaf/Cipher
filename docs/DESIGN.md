# Cipher — Design Constitution

> Cipher is a read-only reader for an Obsidian vault. It has one job: render someone's notes so well that the interface disappears and only the writing remains. This document is the law that keeps it that way. It is written against the real token system in `src/app/globals.css` — every rule below references tokens that already exist. Do not invent a parallel naming scheme. When you reach for a value, reach for a token.

---

## 1. Philosophy

Three principles, in priority order. When they conflict, the earlier one wins.

**1. Restraint.** The default answer to "should I add this" is no. Cipher is chrome around a reading surface; the chrome earns its pixels by getting out of the way. No decorative gradients on functional surfaces, no animation that doesn't communicate a state change, no second way to do something there's already one way to do. A feature that makes the reader notice the reader has failed.

**2. Hierarchy through color and space, not weight.** This is the load-bearing rule of the whole system. We have four text-color tiers (`--text-primary` → `--text-secondary` → `--text-tertiary` → `--text-quaternary`) and a full spacing scale (`--space-*`). Use them. Importance is signalled by *which color tier* a thing sits in and *how much room* it has around it — not by bolding it. In the UI chrome, two weights do all the work. Bold is reserved; it is not the tool you reach for first. (The reading surface, section 2, plays by warmer rules — it's allowed real heading weights — but even there, restraint holds.)

**3. Consistency over personality.** A component that behaves like every other component is worth more than a clever one-off. We already have shared primitives — `.app-row` for every list row, `.filter-chip` for every pill, one `.focus-ring`, one `--transition-hover`. New work composes these. If you find yourself writing a bespoke hover, a bespoke radius, a bespoke easing, stop: the system already has an answer, and using it is more important than your improvement to it. Personality lives in the *vault's content*, never in our frame.

---

## 2. The Two Typographic Registers

Cipher speaks in two distinct voices and must never blur them.

### Register A — Chrome (the UI)

Everything that is *not* the user's note: the sidebar, command palette, reader toolbar, search results, status pills, buttons, breadcrumbs.

- **Restrained scale.** Chrome uses the tight utility classes already defined: `.caption` (13px), `.label` (12px), `.micro` (11px), `.small` (15px), and `.section-label` for group headers. Chrome rarely exceeds 15px.
- **Two weights.** `font-weight: 400` for body, `510` for medium emphasis. `590` is the ceiling and is rare (active labels, `.section-label`). You almost never need `700` in chrome — if you typed it, you're solving a hierarchy problem with the wrong tool. Go re-read principle 2.
- **Hierarchy via color, not bold.** A secondary label is `--text-tertiary`, not a smaller bold version of the primary. A disabled control drops to `--text-quaternary` (or `--disabled-opacity`), never to a lighter font.
- **Tabular numbers.** Chrome inherits `font-variant-numeric: tabular-nums` from `body`. Counts, sizes, and timestamps must not jitter.
- **Tight tracking.** The negative letter-spacing baked into the utility classes (e.g. `-0.13px` on `.caption`) is correct for dense UI. Don't override it.

### Register B — Reading surface (the note)

The rendered markdown inside `.markdown-content` / `.reading-column`. This is the product. It is allowed to breathe.

- **Reader-controlled, token-bounded.** The surface reads its own variables — `--md-font`, `--md-size`, `--md-zoom`, `--md-line-height`, `--md-weight`, `--md-max-width`, `--md-dir` — set by the reader toolbar. Respect them; never hard-code a font-size that fights `calc(var(--md-size) * var(--md-zoom))`.
- **Comfortable measure.** Body text is constrained to `--md-max-width` (default `72ch`) and centered via `.reading-column`. The toolbar shares this column so it aligns on the same optical axis. Never let prose run edge-to-edge.
- **A real heading scale with negative tracking.** Headings step down in `rem`-derived sizes (`.heading-2`, `.heading-3`, `.body-emphasis`, `.small-semibold` for h1–h5 respectively, as `MarkdownRenderer` maps them) with slight negative letter-spacing already in those classes. Apply `text-wrap: balance` (`.text-balance`) to headings so they don't orphan a single word.
- **Generous line-height.** `--md-line-height` defaults to `1.6`. Prose is for reading, not for packing.
- **Muted list markers.** Bullets are 4px dots in `--text-quaternary` — present, never loud. List markers are chrome inside the reading surface and stay quiet.
- **Links themed by hue.** In-prose links use `.md-link`: `--accent-violet` resting, underline (a `border-bottom`) revealed on hover/focus, `--accent-hover` on hover. Wiki-links (`[[…]]`) get the dashed `color-mix(... --accent-violet 40% ...)` underbar so the reader can tell an internal jump from an external one at a glance.
- **Dark fenced code, always.** Code blocks render on `--bg-surface` with a `--border-standard` hairline, syntax-highlighted via the runtime-swapped highlight.js themes (atom-one-light / atom-one-dark, toggled on `data-theme`). Inline code is a quiet pill on `--bg-surface-alpha-4`. A copy button is hover-revealed on the block — present on intent, absent at rest.
- **Tables scroll, they don't squeeze.** Every table is wrapped in `overflow-x: auto` so wide data scrolls horizontally instead of crushing the column. Header cells are `.micro` uppercase in `--text-quaternary`; rows separated by `--border-subtle`.

> The two registers never mix. A button never adopts reading-surface generosity; a heading in a note never adopts chrome's 13px restraint.

---

## 3. Color

**Token-only. No exceptions.** Color enters a component through a `var(--…)` reference. The raw hex and rgba literals live in exactly one place: the `:root` (dark) and `.light` blocks of `globals.css`. If you are typing a `#` outside those two blocks, you are doing it wrong.

### The token families (use these names — do not rename them)

- **Surfaces:** `--bg-marketing` (the deepest backdrop), `--bg-panel`, `--bg-surface`, `--bg-elevated`, plus the alpha overlays `--bg-surface-alpha-2 / -4 / -5` for hover tints. Craft-layer surfaces `--surface-chrome / -recessed / -raised` for the framed shell.
- **Text:** `--text-primary / -secondary / -tertiary / -quaternary` and `--text-on-brand` for text over brand fills.
- **Brand & accent:** `--accent-brand`, `--accent-violet`, `--accent-hover`, `--accent-brand-warm`, `--accent-soft`, `--accent-security`.
- **Status (single source of truth):** `--status-open`, `--status-in-progress`, `--status-done`, `--status-blocked`, `--status-warning`, plus `--success` / `--success-pill`. Every status indicator in the app derives from these. Never pick a "close enough" green by hand.
- **Borders & lines:** `--border-subtle`, `--border-standard`, `--border-solid-primary / -secondary / -tertiary`, `--line-tint`, `--line-tertiary`.
- **Effects:** `--overlay`, `--selection-bg`, `--bg-glass`, `--bg-tooltip`, and the `--shadow-*` family.

### Derive states, don't hand-pick them

A hover, active, or selected variant of a color is **mixed from a base token**, never authored as a new hex. This is how the codebase already works — match it:

```css
/* active filter-chip — fill + border derived from one base hue */
background: color-mix(in srgb, var(--accent-brand) 10%, transparent);
border-color: color-mix(in srgb, var(--accent-brand) 40%, transparent);

/* blockquote tint in the reader */
background: color-mix(in srgb, var(--accent-brand) 6%, transparent);
```

The base color tokens in `globals.css` are being converted to literal `oklch()` values (Phase 0b, Task 1) — they will be authored in perceptual space so the hue stays honest across lightness steps. New derived states (hover tints, active fills, selection overlays added from this point forward) use `color-mix(in oklab, …)` for perceptual blending that stays neutral instead of muddying through sRGB. Existing `color-mix(in srgb, …)` call sites are left as-is; do not rewrite them speculatively. The principle is constant: **one base token in, every state out.** Adding a state is mixing, not choosing.

### Per-entity chip system

Tags, note kinds, and link-states each get **one base hue token** — nothing else. A single `.chip`-style helper does the rest, `color-mix`-ing that one hue into background, text, and border for **both** themes at once. `.filter-chip` is the working pattern: ghost at rest, a derived fill when active, a derived border, text promoted to `--text-primary`. The payoff is the rule that keeps the palette from sprawling: **adding a color means adding one hue token, never a new component.** If a new tag color requires more than one new variable, the design is wrong.

### Dark mode is the primary, designed theme

Dark (`:root`) is authored first and authored *intentionally* — light (`.light`) is the override, and neither is a naive inversion of the other.

- **Deep gray, not pure black.** The darkest surface is `--bg-marketing: #08090a`, not `#000`. Surfaces step up in near-neutral grays. Never use `#000` for a panel.
- **Borders are white at low alpha.** Dark-mode separation comes from `rgba(255,255,255,0.05–0.08)` (`--border-subtle` / `--border-standard`), not from drawing dark lines. Light mode flips to black at low alpha. This is why borders must be tokens — the alpha-on-light-vs-dark logic already lives in the token.
- **Status hues are tuned per theme.** Dark uses brighter status colors (`--status-open: #3b82f6`); light uses deeper ones (`#2563eb`) because the light surface already contrasts. The token name is identical across themes — only the value differs — so component code never branches on theme.

---

## 4. Spacing

One scale, 8px-based: `--space-0-5` (2px) through `--space-20` (80px). All padding, margin, and gap come from it. The reader's structural rhythm (heading top-margins, paragraph gaps) is defined once in `MarkdownRenderer` and matches the scale. Component sizing has its own fixed tokens — `--row-h-dense/cozy/default/inline`, `--icon-button-size`, `--checkbox-size`, `--dot-size-sm`, `--avatar-size`, `--spine-indent` — and these are the *only* permitted heights for their elements. A list row is one of four heights. There is no fifth. Off-scale values (`13px`, `padding: 7px`) are forbidden; round to the scale.

---

## 5. Radius

One radius scale: `--radius-micro` (2px), `--radius-small` (4px), `--radius-comfortable` (6px), `--radius-card` (8px), `--radius-panel` (12px), `--radius-large` (22px), `--radius-full` (pill), `--radius-circle`. Plus the craft-frame tokens `--radius-chrome` (12px) and `--radius-row` (8px). Pick the named token that fits the element's tier — a pill is `--radius-full`, a card is `--radius-card`, the app-shell panels are `--radius-chrome`. Never type a raw `border-radius: 10px`. Focus rings and nested elements use `border-radius: inherit` to stay concentric.

---

## 6. Motion Grammar

Motion exists to explain a state change, never to perform. If an animation doesn't tell the reader *what just changed*, delete it.

- **Standard durations, from tokens.** `--motion-hover` / `--motion-micro` (~120ms) for color and background flips; `--motion-quick` (~180ms) for entrances and presses; `--motion-standard` (~220–240ms) for panels and expands; `--motion-slow` (~400ms) for the rare crossfade. The legacy `--duration-*` set maps to the same intent (`--duration-fast` 150ms, `--duration-normal` 250ms). Don't invent a 300ms.
- **One signature easing.** `--ease-default` / `--ease-out-gentle` (the same `cubic-bezier(0.25, 0.1, 0.25, 1)`) is the house curve for hovers and color transitions. `--ease-out-smooth` for entrances. Reach for the token; don't paste a bezier inline.
- **Ease-out, no bounce.** Things decelerate into place. The spring tokens (`--ease-spring-soft/-snap`) exist for a couple of purpose-built choreographies (palette reveal, the 1px row lift) and are deliberately *barely* springy. **No overshoot, no bounce, no elastic** on functional UI. A note reader does not boing.
- **Hover changes background only.** A hover tints the surface (`--bg-surface-alpha-2` for rows, `-4` for controls) and may promote text color. It does **not** resize, scale, or rotate the element.
- **`--transition-hover` is the shared swap.** Background, border-color, and color transition together through this one variable. Use it instead of authoring a fresh `transition` list.
- **Keyframes are few and purpose-built.** `fadeIn`, `slideUp`, `scaleIn`, `anchor-highlight`, the palette-reveal trio, `cipher-cursor-blink`, `icon-stack` crossfade. Each is justified by a specific moment. Adding a keyframe requires a reason a comment can state in one line.
- **Every animation is reduced-motion guarded.** `@media (prefers-reduced-motion: reduce)` already collapses the motion-token durations and neutralizes transforms (row lift, button press, palette springs). **Any new animation or transform must be reachable by that guard.** This is non-negotiable: an animation that ignores reduced-motion is a bug, not a flourish.

---

## 7. Interaction States

- **Active survives hover.** A selected row stays visually distinct *while* being hovered — selection is the stronger signal. `.app-row[data-active="true"]` keeps its brand rail and cancels the hover lift (`transform: translateY(0)`); `.miller-row[data-rail="true"]` keeps its fill and brand left-border even when the cursor is on it; the generic `.state-row[data-active="true"]` keeps `--selected-surface` under hover. Corollary for the press state: when a row is *both* selected and pressed, selection wins — `.state-row[data-active="true"]` is listed after `.state-row:active` so the persistent `--selected-surface` overrides the momentary `--active-surface` press flash at equal specificity. Never let a transient hover or press erase a persistent selection.
- **One focus ring, everywhere.** `2px solid var(--ring)`, `2px` offset, `border-radius: inherit` — where `--ring` is a token derived from the brand hue via `color-mix`. It is applied uniformly via `.focus-ring`, `:focus-visible`, and the shared rule covering `.app-row`, `.filter-chip`, `.chip`, the typeset links/code/table, buttons, and links. Keyboard users get the ring; mouse users (`:focus:not(:focus-visible)`) don't. Every interactive element opts into this one token — no component picks its own focus color.
- **1px press, scoped to motion.** Buttons and `[role="button"]` get a subtle press (`scale(0.97)`), icon buttons `scale(0.94)`, via the spring-snap curve; the generic press utility `.press` (and `.chip`/`.state-row`) uses `translateY(1px)`; the row lift is a `translateY(-1px)`. These are the *only* sanctioned press/lift transforms, and all of them vanish under `prefers-reduced-motion`.
- **Reveal on intent, gated to fine pointers.** Hover-revealed affordances (the heading copy-link, `.recent-remove`, `.today-row__actions`, the reader chips) appear on hover *and* keyboard focus (`:focus-within` / `:focus-visible`), and their hover branch is wrapped in `@media (hover: hover) and (pointer: fine)` so a tap never leaves a control stuck visible.
- **Dim via token, never opacity-on-text.** A de-emphasized row drops to `--text-quaternary` (see `.miller-row[data-dim="true"]`). Reserve raw `opacity` for genuinely non-interactive disabled controls (`--disabled-opacity`).

---

## 8. Chrome Details

- **Thin, stable, theme-aware scrollbars.** 8px, `scrollbar-width: thin`, a theme-aware thumb (`--scrollbar-thumb` → `--scrollbar-thumb-hover`) that is transparent at rest and only appears on hover, transparent track — applied globally (with `scrollbar-gutter: stable` on `html, body, [data-scroll], .scroll-region` so revealing the scrollbar never shifts layout) and via the always-on `.scrollbar-thin` opt-in. The scrollbar is chrome: quiet at rest, never a colored accent.
- **44px targets, coarse pointers only.** Compact icon buttons stay visually small on desktop but expand their *hit area* to 44px on touch via `.hit-44` (a transparent `::before` under `@media (pointer: coarse)`). Desktop density is never sacrificed for touch. Sub-16px inputs are also bumped to 16px under `pointer: coarse` to kill iOS focus-zoom — again, desktop is untouched.
- **The framed shell.** The app lives inside `.app-shell` — a fixed, inset (`--chrome-margin`) grid of rounded `.chrome-panel`s (`--radius-chrome`, `--shadow-chrome`). Below 880px the frame collapses to edge-to-edge (margins and radius zero out, sidebar hides, palette becomes the navigation escape hatch).
- **No-flash boot.** Theme is resolved *before paint* by the inline bootstrap `<script>` in `layout.tsx`, reading the `brain-theme` localStorage key and setting both the `.light` class and the `data-theme="light|dark"` attribute on `<html>` synchronously. The resolution rule is the pure `resolveTheme(stored, osDark)` in `src/lib/browse/resolve-theme.ts` — the inline script mirrors it character-for-character. There is no theme flicker on load, ever. If you touch the boot path, the no-flash guarantee is the acceptance test.
- **theme-color tracks the *resolved* theme.** The same bootstrap sets a single `<meta name="theme-color">` from the resolved theme (not `prefers-color-scheme`) and exposes `window.__setThemeColor`, which the Appearance toggle calls so a manual `brain-theme` override updates the status-bar color live. Don't reintroduce code that assumes `prefers-color-scheme` is the source of truth.

---

## 9. Forbidden

These are not style preferences. A change that does any of the following is rejected on sight.

- **Raw hex or rgba outside `globals.css`'s `:root` / `.light` blocks.** Color enters via `var(--…)`. No `#fff`, no `rgba(...)`, in a component.
- **Tailwind palette classes for color** (`bg-zinc-800`, `text-blue-500`, `border-gray-700`, etc.). Use the mapped semantic tokens (`bg-surface`, `text-text-secondary`, `border-border-standard`) from the `@theme` block. The raw palette does not exist for us.
- **Arbitrary one-off values** — off-scale spacing (`p-[7px]`, `mt-[13px]`), off-scale radius (`rounded-[10px]`), inline beziers, magic font-sizes. If it's not on a scale or in a token, it's not allowed.
- **Scale/zoom/rotate on hover.** Hover tints background. That's it.
- **Spring, bounce, elastic, overshoot** on functional UI. Ease-out only.
- **Animations that ignore `prefers-reduced-motion`.** Every transform and keyframe must be covered by the guard.
- **Bold as a hierarchy tool in chrome.** Reach for a color tier or spacing first; `590`+ is the rare exception, not the reflex.
- **A second focus style, a second hover transition, a second row height, a second easing** when the shared token already exists. Reuse beats reinvention.
- **Pure black (`#000`) surfaces** or **naive-inverted** dark/light values. Both themes are authored deliberately.
- **Per-entity color authored as a new component** instead of one hue token + the `.chip` mix.
- **Bypassing `.app-row` / `.filter-chip` / `.focus-ring`** with a hand-rolled equivalent.

---

## 10. Pre-Commit Checklist

Run this before every commit that touches UI. All eleven must pass.

1. **No raw color literals** (`#`, `rgb`, `rgba`, `hsl`) outside the `:root` / `.light` blocks of `globals.css`. Every color is a `var(--…)`.
2. **No Tailwind palette color classes** — only the mapped semantic `--color-*` tokens are used.
3. **Spacing, radius, and component sizes are from the scales/tokens** — no off-scale `[7px]`-style arbitrary values.
4. **State variants are `color-mix`-derived from a base token**, not hand-picked hex. New mixes use `in oklab`.
5. **The two registers stayed separate** — chrome is restrained (≤15px, two weights, hierarchy via color/space); the reading surface keeps its generous typeset rules.
6. **Hierarchy uses color tier + spacing, not new bold.** No reflexive `font-weight: 700` in chrome.
7. **Motion uses a `--motion-*` duration and a house easing token** — no inline beziers, no bounce/overshoot on functional UI.
8. **Every new transform/animation is covered by `prefers-reduced-motion: reduce`.**
9. **Interactive elements get the shared focus ring**, hover tints background only, active state survives hover, and presses are the sanctioned 1px/scale (motion-guarded).
10. **Touch is respected without taxing desktop** — 44px hit areas via `.hit-44` under `pointer: coarse`, hover-reveals gated to `hover: hover and pointer: fine`, and no layout shift from scrollbars (`scrollbar-gutter: stable`).
11. **Both themes verified.** Toggle dark *and* light; confirm no `#000` surfaces, borders read as low-alpha white/black correctly, status hues are legible, and there is no boot flash.

---

> When in doubt, do less, reuse more, and reach for the token. The vault is the content. We are just the glass.
