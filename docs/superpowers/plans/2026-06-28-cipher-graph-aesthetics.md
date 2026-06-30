# Cipher Graph Aesthetics Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Each task: TDD pure logic, run the FULL gate before committing, ONE commit, footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Leave NO stray uncommitted edits.

**Goal:** Make the force graph genuinely impressive — restrained monochrome + one accent, both-theme-legible hover labels, fewer colors — matching the best implementations.

**Architecture:** Simplify the tag→color mapping to mono + 2 status hues (rainbow becomes an opt-in toggle), then overhaul `ForceGraph.tsx`'s canvas paint (nodes/edges/labels/hover/glow/particles/motion/background) per the research brief. Stay on react-force-graph-2d; canvas colors resolve from OKLCH tokens via the existing per-theme cache.

**Tech Stack:** Next.js 16, React 19, TS-strict, react-force-graph-2d (already a dep), Vitest. No new deps.

## Global Constraints
- TS strict; no new `any`. **Token-only color** (eslint `no-raw-color` + stylelint; ForceGraph.tsx is allowlisted for canvas paint that resolves tokens via getComputedStyle — NO raw hex). Lint MUST stay 0.
- Conventional Commits; ONE commit/task; footer above. Full gate green before each commit: `npm run typecheck && npm run test:unit && npm run build && npm run lint`.
- No regressions to graph DATA, the lib, MapPage's mode/fit controls, or other views.
- Branch: `refinement`. Spec: `docs/superpowers/specs/2026-06-28-cipher-graph-aesthetics-design.md`. Concrete numbers + dark/light token table: `.superpowers/sdd/r3g-research/brief.md` §2-3.

## Locked decisions
1. Monochrome + accent + focus-only glow. 2. Mono + 2 status hues (green=done/success, red=bug/blocked/danger), rainbow as opt-in toggle. 3. Hover labels + zoom-gated persistent. 4. Particles on hovered subgraph only (reduced-motion gated).

## Task order
`1 tag-color simplification → 2 ForceGraph visual overhaul (+ rainbow toggle wiring)`.

---

## Task 1: Simplify tag→color (mono + 2 status hues, drop the random-hash)
**Files:** Modify `src/lib/color/tag-color.ts` + `src/lib/color/tag-color.test.ts`. Source: spec decision #2 + brief §3 ("tag-color.ts — YES, simplify").

**Interfaces (pure):**
- Keep `tagColor(tag: string): HueToken` BUT **drop the FNV-1a hash fallback** — unknown tags return `"--text-tertiary"` (no random colors). Keep the semantic overrides (this is the "rainbow"/full path used only when the toggle is on).
- Add `statusTagColor(tag: string): string` — the DEFAULT (restrained) mapping: `"--hue-success"` for `done`/`success`/`tip`/`hint`; `"--hue-danger"` for `bug`/`blocked`/`danger`/`error`; everything else (incl. "") → `"--text-tertiary"`. Pure, deterministic.

- [ ] **Step 1 — tests (TDD):** in `tag-color.test.ts` add/adjust: `statusTagColor("done")==="--hue-success"`, `statusTagColor("bug")==="--hue-danger"`, `statusTagColor("random")==="--text-tertiary"`, `statusTagColor("")==="--text-tertiary"`; and for `tagColor`: an unknown tag now returns `"--text-tertiary"` (hash dropped), known semantic tags still map (`tagColor("idea")==="--hue-idea"`). Update any existing test that asserted hash-based colors. RED→GREEN.
- [ ] **Step 2 — implement:** add `statusTagColor`; remove `fnv1a32` + the hash fallback from `tagColor` (return `"--text-tertiary"` for non-semantic). Keep `HUE_PALETTE`/`HueToken` exports (GraphLegend may reference). RED→GREEN.
- [ ] **Step 3 — verify:** full gate + lint 0. Confirm `--text-tertiary` exists in globals.css (it does). Commit (`refactor(graph): tag colors → mono default + status hues (drop random-hash)`).

## Task 2: ForceGraph visual overhaul (the impressive part) + rainbow toggle
**Files:** Modify `src/components/browse/ForceGraph.tsx` (paint/hover/labels/motion/background), `src/components/browse/MapPage.tsx` (rainbow-toggle state + pass to ForceGraph + container vignette), `src/components/browse/GraphLegend.tsx` (a "colors" toggle). Source: spec + brief §2-3 (use its exact numbers/token table).

**Interfaces:**
- `ForceGraph` gains a prop `rainbow?: boolean` (default false). When false → resting node fill via `statusTagColor(node.tag)`; when true → `tagColor(node.tag)` (full semantic).
- `MapPage` owns `const [rainbow, setRainbow] = useState(false)` and passes it; `GraphLegend` gets a toggle to flip it.

- [ ] **Step 1 — node paint (mono+accent+glow+rim):** in `paintNode`, resting fill = `resolveToken(rainbow ? tagColor(node.tag) : statusTagColor(node.tag))`; hovered node + 1-hop neighbours + focused → `resolveToken("--accent-brand")`. Widen `nodeRadius` to `min(3 + Math.sqrt(degree)*1.8, 16)`. Hovered node radius ×1.3 + `ctx.shadowColor=accent`, `ctx.shadowBlur = (isLight ? 6 : 12)/globalScale` (read theme via `data-theme`), reset shadow after. Add a 1px rim in `resolveToken("--bg-marketing")`. (Use a `hoveredNodeRef` set in `handleNodeHover`.)
- [ ] **Step 2 — labels (hover + zoom-gated pill, both themes):** show a label when the node is hovered OR a 1-hop neighbour (any zoom), OR persistent for hubs (`degree>=5 && globalScale>1.2`) / all (`globalScale>2.5`). Font `Math.min(12, 12/globalScale)`-style constant-screen size. Draw a rounded-rect **pill** sized from `ctx.measureText`: bg `--bg-elevated` @0.85, 1px `--accent-brand` @0.25 border, text `--text-primary`, radius/pad `4/globalScale`; in light mode add a soft `shadowBlur=4, shadowColor=rgba(0,0,0,0.3)` under the pill (resolve via token-safe approach — the shadow color is a neutral black alpha, allowed as it's not a brand color; if lint flags it, gate via the allowlist already covering this file). Add the pill rect to `paintNodePointerArea` for the hovered/neighbour nodes.
- [ ] **Step 3 — edges:** in `paintLink`, strokeStyle `resolveToken("--border-standard")` rest; rest alpha 0.18 dark / 0.14 light (theme-aware via `ctx.globalAlpha`); non-neighbour (dimmed) 0.06/0.08; highlighted subgraph → `resolveToken("--accent-brand")` @0.75, width ×1.8. Width `Math.max(0.5, 1.2/globalScale)` rest. Restore globalAlpha after.
- [ ] **Step 4 — motion + physics + particles:** props `warmupTicks={prefersReducedMotion ? 200 : 80}`, `cooldownTime={6000}`, `d3VelocityDecay={0.55}`; add an effect setting `fgRef.current.d3Force("charge")?.strength(-120)` + a `forceCollide` (radius = nodeRadius(degree)+2). `linkDirectionalParticles` = (hovered subgraph link && !prefersReducedMotion) ? 2 : 0, `linkDirectionalParticleWidth={2}`. `zoomToFit(400, 50)`. Hover dim transitions stay ~150ms.
- [ ] **Step 5 — background vignette + rainbow toggle:** MapPage's graph container gets `background: var(--bg-marketing)` + an overlay div with the editorial-glow radial (`radial-gradient(ellipse at 50% 40%, color-mix(in oklch, var(--accent-brand) 8%, transparent), transparent 70%)`; light 5%); FG `backgroundColor="transparent"`. Add the `rainbow` state in MapPage + a toggle control in GraphLegend (token-only) that flips it; pass `rainbow` to `<ForceGraph>`. `prefers-reduced-motion` via `useReducedMotion()`.
- [ ] **Step 6 — verify:** full gate + lint 0 (confirm no raw hex slipped in; the file is allowlisted but PREFER tokens). Dev-server visual check (HUMAN — the key one): hover shows a legible pill label in BOTH dark+light, nodes are mono with indigo on hover, hubs bigger, edges visible, particles flow on hover, graph settles smoothly, single-click opens. Commit (`feat(graph): restrained monochrome + accent visual overhaul (hover-label pill, glow, particles)`).

---

## Final verification
- [ ] typecheck 0 / tests pass / build green / lint 0 (eslint+stylelint).
- [ ] Hover labels back + legible in dark AND light; ≤3 node tones (mono + accent + 2 status); hubs read bigger; edges visible in both themes; smooth settle; single-click opens; reduced-motion respected. No new deps.
- [ ] Human dev-server eyeball confirms it looks impressive in both themes.

## Spec coverage
| Spec decision | Task |
|---|---|
| #2 node colors (mono + 2 status) + rainbow toggle | 1 (colors) + 2 (toggle wiring) |
| #1 aesthetic + glow, #3 labels, #4 particles, all visual spec | 2 |

## Self-review notes
- T1 is the pure/tested surface (statusTagColor + tagColor-no-hash); T2 is canvas-visual, verified by build + the human eyeball (no browser automation here).
- Token-only on canvas via the existing per-theme `resolveToken` cache (round-3 perf fix) — keep it; resolve all new colors through it.
- The label pill is THE both-theme-legibility solution (auto-inverting `--bg-elevated`); the one neutral-black shadow in light mode is allowed (not a brand color) under the file's existing allowlist.
- Rainbow toggle keeps GraphLegend meaningful without forcing the rainbow on by default.
