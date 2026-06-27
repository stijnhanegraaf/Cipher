# Cipher Graph Aesthetics Redesign — Design Spec

- **Date:** 2026-06-28
- **Branch:** `refinement`
- **Status:** Approved design (decisions locked via Q&A), ready for implementation plan
- **Author:** Stijn (with Claude Opus 4.8)
- **Research:** `.superpowers/sdd/r3g-research/brief.md` (+ `research-{0..3}.md`) — deep web research on Obsidian's graph, Cosmograph, vasturiano/force-graph, Quartz, Catppuccin/AnuPpuccin, plus a read of the current ForceGraph.

## Purpose

Make Cipher's force graph genuinely impressive and usable: bring back **hover labels** (which node it is) that are perfectly legible in **dark AND light**, use **fewer colors** (the current rainbow-per-tag fights the app's Linear-inspired restraint), and adopt the restraint-driven aesthetic the best implementations converge on.

## Locked decisions (from Q&A)

| # | Topic | Decision |
|---|---|---|
| 1 | Aesthetic | **Monochrome + one accent + focus-only glow** (Obsidian/Cosmograph/Linear model). Not neon bloom (muddy in light mode). |
| 2 | Node colors | **Mono + 2 status hues** — grey default; green for done/success tags, red for bug/blocked/danger. Old per-tag rainbow kept as an **opt-in legend toggle**. |
| 3 | Labels | **Hover + zoom-gated persistent** — label on hover (node + neighbours) regardless of zoom; hub labels persist when zoomed in. |
| 4 | Motion | **Directional particles on the hovered subgraph only**, gated by `prefers-reduced-motion`. |

## Why restraint (research)

The most-praised graphs win through restraint: Cosmograph ships a 3-grey base and spends color only on focus; Obsidian default is one muted node tone + theme accent on hover; Datawrapper's first rule is "grey is the most important color." A rainbow-per-tag graph fights Cipher's Linear north star (globals.css: "Linear-Inspired", one indigo accent). So: monochrome restraint is the dish, glow is the seasoning.

## Concrete visual spec (tokens + numbers)

Reuse existing OKLCH tokens (no new graph tokens). Key insight: **`--text-tertiary` is identical (64.9% L) in both themes** → the single monochrome node/edge base needs no theme branching.

**Nodes:** radius `min(3 + sqrt(degree)*1.8, 16)` (leaf 3 → hub 16, ~1:5). Resting fill `--text-tertiary`; hovered node + 1-hop neighbours + focused node `--accent-brand` (the only saturated color); status-hue nodes (decision 2) green/red when not overridden by hover. Hovered radius ×1.3 + `shadowBlur` glow (`--accent-brand`, 12/globalScale dark, ~6 light). 1px rim in `--bg-marketing` so nodes float above edges. `forceCollide(r+2)` so nodes never blob.

**Edges:** color `--border-standard` (fixes light-mode invisibility); rest opacity 0.18 dark / 0.14 light; non-neighbour greyed 0.06/0.08; highlighted subgraph `--accent-brand` @0.75, width ×1.8. Straight (no curvature). Width `max(0.5,1.2/globalScale)` rest.

**Labels (the #1 ask):** constant screen size `12/globalScale` (capped). **Pill** behind text for both-theme legibility: bg `--bg-elevated` @0.85 (auto-inverts dark/light), 1px `--accent-brand` @0.25 border, `--text-primary` text, radius/padding `4/globalScale`, sized from `measureText`; light-mode safety drop-shadow. Show on hover (node + neighbours) regardless of zoom; persistent for hubs (`degree>=5` at `globalScale>1.2`, all at `>2.5`). Fade in ~150ms. Pill rect added to `nodePointerAreaPaint` (clickable).

**Hover dim-the-rest:** non-neighbour nodes alpha 0.12; tag-filtered-out 0.04; 150ms ease-out.

**Background:** canvas container `--bg-marketing` (recessed) + a subtle accent radial vignette (editorial-glow recipe, accent @8% dark / 5% light). FG canvas `backgroundColor="transparent"`.

**Motion:** `warmupTicks=80` (pre-settle off-screen, no "explode"); `cooldownTime=6000`; `d3VelocityDecay=0.55`; `charge.strength(-120)` + `forceCollide`. `zoomToFit(400,50)`. Hover 150ms. `prefers-reduced-motion` → no particles/glow-pulse, transitions ~0, high warmup + `cooldownTicks=0`.

**Particles (decision 4):** `linkDirectionalParticles={2}` + `linkDirectionalParticleWidth={2}` ONLY on the hovered subgraph, gated by reduced-motion.

Full dark/light token table + exact line-level changes: see `.superpowers/sdd/r3g-research/brief.md` §2-3.

## Scope / Non-goals

**In scope:** `src/components/browse/ForceGraph.tsx` (the visual overhaul), `src/lib/color/tag-color.ts` (simplify to mono + 2 status hues), `src/components/browse/GraphLegend.tsx` (+ optional rainbow toggle), small token/vignette use in `globals.css` if needed.
**Non-goals:** changing the graph DATA (`vault-graph.ts`/adapter), the lib (stay on react-force-graph-2d), physics correctness beyond the tuning above, or other views.

## Execution shape
Opus spec + plan; Sonnet implements per task with reviews. ~2 tasks: (1) tag-color simplification + legend toggle; (2) ForceGraph visual overhaul (nodes/edges/labels/hover/glow/particles/motion/background). Token-only color (canvas paint resolves tokens via the existing per-theme cache). Visual verification is the human's dev-server eyeball (no browser automation here).

## Risks
- **Both-theme legibility:** the label pill auto-inverts; verify on dev server in both. Glow demoted in light mode (ring over blur).
- **Token-only on canvas:** resolve `--accent-brand`/`--text-tertiary`/`--border-standard`/`--bg-elevated`/`--bg-marketing`/`--text-primary` via the existing per-theme `resolveToken` cache; no raw hex.
- **Perf:** keep the per-theme token cache (round-3 fix); particles only on hovered subgraph; reduced-motion path.
- **GraphLegend:** keep it working as the tag toggle; the rainbow becomes opt-in.

## Spec coverage
| Decision | Plan task |
|---|---|
| #2 node colors (mono + status) + rainbow toggle | task 1 |
| #1 aesthetic, #3 labels, #4 particles + all visual spec | task 2 |
