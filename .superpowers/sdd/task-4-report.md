# Task 4 Report: Typeset Markdown Reading Surface + Code Copy

## CodeBlock.test.tsx: RED → GREEN

- **RED**: Test written at `src/components/ui/CodeBlock.test.tsx` before `CodeBlock.tsx` existed. Build failed with "Failed to resolve import ./CodeBlock" — confirmed RED.
- **GREEN**: After creating `CodeBlock.tsx`, all 2 CodeBlock tests pass. Full suite: 12 test files, 56 tests, all passing.

## Inline-Style Sites Stripped

All sites listed in `typeset-markdown.md` §5b were addressed. The `.typeset` CSS block now owns all of these:

| Site | What was stripped | Decision |
|---|---|---|
| `h1` | `style={{ margin: "32px 0 16px" }}`, `className="heading-2 text-text-primary"` | STRIPPED — `.typeset h1` owns margin, color, size |
| `h2` | `style={{ margin: "32px 0 16px" }}`, `className="heading-2 text-text-primary"` | STRIPPED |
| `h3` | `style={{ margin: "24px 0 8px" }}`, `className="heading-3 text-text-primary"` | STRIPPED |
| `h4` | `style={{ margin: "20px 0 6px" }}`, `className="body-emphasis text-text-primary"` | STRIPPED |
| `h5` | `style={{ margin: "16px 0 4px" }}`, `className="small-semibold text-text-primary"` | STRIPPED |
| `h6` | `style={{ margin: "16px 0 4px" }}`, `className="caption-medium text-text-tertiary"` | STRIPPED |
| `p` | `style={{ margin: "0 0 16px" }}`, `className="small text-text-secondary"` | STRIPPED — `.typeset p` owns both |
| `ul` | `className="flex flex-col gap-1.5 p-0 m-0 mb-4 list-none"` | STRIPPED — `.typeset ul` owns layout; native markers now used |
| `ol` | `className="flex flex-col gap-1.5 p-0 m-0 mb-4 list-none"`, `style={{ counterReset }}` | STRIPPED — `.typeset ol` owns layout |
| Regular `li` | manual absolute-positioned `<span>` bullet dot + `list-none pl-4` | STRIPPED — `.typeset li::marker` (muted quaternary) replaces manual bullet |
| Task-list `li` | kept `CheckboxIndicator`, removed `small` className from outer li | KEPT functional - custom UI, not prose |
| Inline `code` | `style={{ fontSize, backgroundColor, padding, borderRadius, color }}` | STRIPPED — `.typeset :not(pre) > code` owns all |
| `pre` | entire inline style block (`backgroundColor: var(--bg-surface)`, padding, borderRadius, border, lineHeight, margin) | REPLACED — now renders as `<CodeBlock>`, `.typeset pre` owns all |
| `blockquote` | `style={{ borderLeft, margin, padding, backgroundColor }}`, `className="text-text-secondary"` | STRIPPED — `.typeset blockquote` owns all |
| `hr` | `style={{ border: "none", height, background, margin }}` | STRIPPED — `.typeset hr` owns all |
| `table` wrapper | `className="overflow-x-auto mb-4"` | REPLACED with `className="table-scroll"` + `tabIndex={0}` per spec |
| `thead` | `style={{ borderBottom }}` | STRIPPED — `.typeset thead` owns border |
| `th` | `style={{ textAlign, padding }}`, `className="micro uppercase tracking-[0.08em] text-text-quaternary"` | STRIPPED |
| `td` | `style={{ padding, borderBottom }}`, `className="caption-large text-text-secondary"` | STRIPPED |
| `strong` | `style={{ fontWeight: 590 }}` | STRIPPED — was overriding `--md-weight` reader pref; `.markdown-content strong { font-weight: var(--md-weight, 600) }` handles it |

## Deliberately Kept Inline Styles

| Site | What was kept | Why |
|---|---|---|
| `CopyHeadingLink` | `style={{ marginLeft, opacity, transition, textDecoration, color, fontSize }}` | Functional hover-reveal — not typography-owned by typeset; handled by existing `.copy-heading` CSS |
| `MermaidBlock` | `style={{ margin: "0 0 16px" }}` | Functional layout for mermaid diagrams |
| `img` / `figure` | `style={{ margin, textAlign, maxWidth, borderRadius }}` on figure/img/figcaption | Functional layout; draft did not target these |
| `em` | `style={{ fontStyle: "italic" }}` | Harmless semantic default |
| Task-list checked span | `style={checked ? { textDecoration: "line-through" } : undefined}` | Dynamic/functional — driven by `checked` prop |

## Fenced Code Dark-in-Light Mode

Two layers combine to guarantee dark code in both themes:

1. **`.typeset pre` CSS** (inside `@layer components`) sets `background: var(--code-bg)` where `--code-bg: #15161a` (deep-gray, defined on `.typeset`, applies in BOTH themes regardless of data-theme).

2. **Top-level hljs-force override** (outside `@layer`, next to the existing hljs section):
   ```css
   .typeset pre code.hljs,
   .typeset pre code.hljs * { background: transparent !important; }
   .typeset pre code.hljs { color: var(--code-fg); }
   ```
   This neutralizes the light hljs theme's white/light background when loaded in light mode, letting the dark `--code-bg` from the `<pre>` parent show through. Token hue colors remain readable.

The `!important` is narrowly scoped to `.typeset pre code.hljs` — it does not affect any other surface.

## Build / Lint Results

- `npm run typecheck`: PASS (0 errors)
- `npm run test:unit`: PASS (12 test files, 56 tests, all passing)
- `npm run build`: PASS (Turbopack, no errors)

One CSS bug found and fixed during implementation: the comment text `--bg-*/--text-*` contained `*/` which prematurely closed the `/* ... */` comment block, causing a PostCSS parse error. Fixed by rewriting the comment text.

## Files Modified

- `src/app/globals.css` - chip system tokens + `.chip` helper + `.typeset` block (in `@layer components`); `@keyframes chip-pop`, `@keyframes code-copied`, `.code-copy` animation, hljs-force rule (top-level)
- `src/components/ui/MarkdownRenderer.tsx` - added `typeset` class to container; imported + wired `CodeBlock`; updated table wrapper; stripped 19 inline-style sites
- `src/components/ui/CodeBlock.tsx` - NEW: hover-revealed copy button component
- `src/components/ui/CodeBlock.test.tsx` - NEW: 2 tests (code text assertion + Copied label state)

## Fix pass

### oklch conversions used

- `#15161a` (code-bg deep-gray): `oklch(20.087% 0.0081 274.50)`
- `#e6e7ea` (code-fg light text): `oklch(92.806% 0.0042 271.37)`
- `rgba(255,255,255,0.08)` (code-border): `oklch(100% 0 0 / 0.08)`
- `rgba(255,255,255,0.06)` (code-copy-bg): `oklch(100% 0 0 / 0.06)`
- `rgba(255,255,255,0.10)` (code-copy-border): `oklch(100% 0 0 / 0.10)`
- `rgba(255,255,255,0.12)` (code-copy-bg-hover): `oklch(100% 0 0 / 0.12)`

Values computed via culori `oklch()` + `parse()` (devDep already installed).

### Tokens added to `:root`

```css
/* ── Code surface tokens (intentionally dark in BOTH themes) ── */
--code-bg:            oklch(20.087% 0.0081 274.50);
--code-border:        oklch(100% 0 0 / 0.08);
--code-fg:            oklch(92.806% 0.0042 271.37);
--code-copy-bg:       oklch(100% 0 0 / 0.06);
--code-copy-border:   oklch(100% 0 0 / 0.10);
--code-copy-bg-hover: oklch(100% 0 0 / 0.12);
```

Added at end of `:root` block (line ~232 in original, after `--chip-text-mix`). NOT overridden in `.light` - code stays dark in both themes by design.

### Duplicate chip block

The ~108-line Task-4 duplicate chip block (`:root{--hue-*}` + `.chip{}` + media queries) at lines 1447-1554 was deleted entirely. The Task-3 original at lines 700-773 is confirmed present. `--hue-*`, `--link`, `--chip-*-mix` tokens and `.chip {}` rule each appear exactly once.

### Gate results

- `npm run typecheck`: PASS (0 errors)
- `npm run test:unit`: PASS (12 test files, 56 tests, all passing - including chip unit tests at `src/lib/color/chip.test.ts`)
- `npm run build`: PASS (all routes compiled cleanly)
- `npm run lint`: 87 problems (36 errors, 51 warnings) - UNCHANGED from `7fa8558` baseline

### Token grep output

```
grep -nE "#[0-9a-fA-F]{3,6}|rgba?\(" src/app/globals.css
```

All remaining hits are in `:root` (lines 70-75 shadow tokens, line 216 --hue-idea) or `.light` (lines 290-295 shadow tokens) or are pre-existing component rules NOT introduced by Task 4 (lines 710 comment, 914, 964-965, 984, 1000, 1057, 1062). No raw hex/rgba literals remain in `.typeset {}` or `.code-copy {}` component rules.
