# Graph polish — focus mode + folder colors + bioluminescent motion

**Date:** 2026-04-19
**Status:** Approved for planning
**Scope:** Turn the existing force-directed graph canvas at `/browse/graph` from "pretty but unused" into an actually-useful research tool. Three layers, additive to the working canvas:

1. **Focus mode** — click any node to isolate its 1-hop subgraph with an animated camera glide + HUD card. The killer interaction.
2. **Folder color system** — deterministic 8-slot hue palette mapped from top-level folder, with a bottom-left dot legend that doubles as a filter.
3. **Bioluminescent motion** — subtle breathing on all nodes, edge-comet on hover, folder-tinted dual-ring hub pulse, click ripple on focus transitions.

All three gated behind `prefers-reduced-motion`. No simulation algorithm change (the velocity cap shipped in `adf1876` stays). No new endpoints, no new data.

---

## Context

The current `GraphCanvas.tsx` renders a cosmic-palette force-directed graph: node radius by backlinks, degree-weighted repulsion, rare idle hub pulses, hover rays, pan/zoom. It's visually pleasant but purely ornamental — it answers no question you couldn't answer by skimming the file list. Across Obsidian / Roam / Logseq user communities the graph is consistently the most-beautiful-and-most-ignored feature. The single most-requested upgrade in those communities is *focus / local graph*: click a node, see only what's connected, arranged legibly. Every successful knowledge-graph tool (Heptabase, Napkin, Kumu.io, Research Rabbit) makes focus the primary interaction.

This spec delivers focus as the center of gravity, stacks a color-coded folder legend on top for at-a-glance structure, and finishes with a calm organic motion system that earns the "wow on first open" without ever being distracting.

---

## Goals

1. Click any node → isolate its connected subgraph with a 400ms camera glide, HUD card with metadata + linked-from list, chain-navigable.
2. Every node wears a deterministic folder color (8 slots, stable across reloads + themes).
3. Background motion ("breathing") on all nodes at rest, without unison.
4. Visual feedback channels on hover (edge comets) and focus (click ripples, subgraph glow).
5. All of the above respects `prefers-reduced-motion` — motion degrades to instant states, interaction still works.
6. Zero simulation changes. Zero endpoint changes. Zero data schema changes.

Non-goals (explicit — see Scope Fences):

- No simulation rewrite (no quadtree, no Verlet, no WebGL). Same Euler + O(n²) springs + velocity cap.
- No multi-node focus.
- No persistent node positions.
- No settings UI for palette or motion (deterministic).
- No tag-based coloring (folder-only in v1).
- No search UI changes.

---

## Architecture

Single file: `src/components/browse/GraphCanvas.tsx`. Everything lives inside the existing component — no new files, no new hooks, no new props.

### Component API — unchanged

```ts
interface Props {
  graph: Graph;
  onOpen: (path: string) => void;
  visibleFolders?: Set<string>;
  orphansOnly?: boolean;
  searchTerm?: string;
}
```

The existing three filter props stay; the new legend chip piggy-backs on `visibleFolders` for its filter state.

### New internal state

```ts
// Added inside the GraphCanvas function body:
const [focusId, setFocusId] = useState<string | null>(null);
// ↑ already present, but the current code treats it as a hint for a
// pulse; this spec makes it the pivot of the whole focus pipeline.

const [legendFilter, setLegendFilter] = useState<number | null>(null);
// null = all folders visible. 0..7 = only that color slot visible.

// Camera animation state (ref, not state, so rAF reads without rerenders):
const cameraRef = useRef<{
  from: { tx: number; ty: number; scale: number };
  to:   { tx: number; ty: number; scale: number };
  startedAt: number;
  duration: number;
} | null>(null);

// Focus layout state — target positions the 1-hop subgraph is flying to.
// Keyed by node id. Non-connected nodes don't appear here.
const focusLayoutRef = useRef<Map<string, { tx: number; ty: number }> | null>(null);

// Click ripple state — one at a time is enough.
const rippleRef = useRef<{ x: number; y: number; startedAt: number } | null>(null);

// Comet-trail queue: one entry per hover-edge, consumed on each rAF.
const cometsRef = useRef<{ edgeKey: string; startedAt: number }[]>([]);
```

### Reuse (don't reimplement)

- Existing `step()`, `draw()`, `rafRef`, `fadeRef`, `inhaleRef`, `pulseRef` — all stay.
- The velocity cap (`MAX_V = 40`) from `adf1876`.
- The 900-tick pre-settle gated on ResizeObserver + rAF from earlier fixes.
- `.mono-label`, `.caption-large`, `.app-row`, `var(--accent-brand)`, `var(--accent-violet)`, `var(--success)`, `var(--text-*)`.

---

## Layer 1 — Focus mode

### Trigger

Single left-click on a node. The existing `handlePointerUp` already picks nodes on click; extend it to enter focus instead of firing `onOpen(path)`. `onOpen` moves to **double-click** (replacing the existing double-click behaviour which already fires `setFocusId`).

| Gesture | Behaviour |
|---|---|
| Hover a node | Highlight rays + static label tooltip (unchanged). |
| Single-click a non-focused node | Enter focus on that node. |
| Single-click the focused node | Exit focus. |
| Single-click a connected (1-hop) node while focused | Chain-focus: re-enter focus on the clicked node. |
| Single-click a *non-connected* node while focused | No-op (safety against stray clicks; avoids accidental exit). |
| Double-click any node | `onOpen(path)` — open sheet. |
| `Esc` | Exit focus. |
| `⌘+click` | `onOpen(path)` in new-tab route (future — not in v1). |

Existing keyboard pan/zoom keys (`+`/`-`/arrows/`f`) stay active during focus.

### Enter focus — layout + animation

1. Compute the connected set `C = {selected} ∪ 1-hop neighbours` from `graph.edges`. Partition neighbours into `backlinks` (edges where `target === selected`) and `outlinks` (edges where `source === selected`).
2. Compute target positions in world coordinates:
   - Selected node: `(0, 0)` in the new reference frame.
   - Backlinks: vertical fan on the LEFT, sorted top-to-bottom by each node's outlink count (most-connected to top). y-spacing `max(36, containerHeight / (backlinks.length + 1))`, x-offset `-220`. Jitter ±8px on x to avoid perfect alignment.
   - Outlinks: vertical fan on the RIGHT, same logic, x-offset `+220`.
3. Compute target camera:
   - `scale`: fit the subgraph bounding box into 70% of the viewport, clamped to `[0.8, 2.5]`.
   - `(tx, ty)`: translate so the selected node renders at the viewport center.
4. Trigger `cameraRef.current = { from: currentView, to: targetView, startedAt: now, duration: 400 }`.
5. Store `focusLayoutRef.current = new Map(targetPositions)`.
6. Freeze simulation: set `simulationFrozenRef.current = true` (new ref). Existing animation rAF is unchanged — it keeps running but `step()` early-returns when `simulationFrozenRef.current` is true.
7. Fade non-connected nodes: no new state; `draw()` reads `focusId + connectedSet` each frame and applies `alpha = 0.05` to non-connected nodes.

### Camera glide

On each frame while `cameraRef.current !== null`:
- `t = min(1, (now - startedAt) / duration)`.
- `ease = 1 - (1 - t)^3` (ease-out-cubic).
- `viewRef.current = lerp(from, to, ease)` — per-field linear interp.
- When `t === 1`, `cameraRef.current = null`.

Node positions also interpolate: for each node in `focusLayoutRef.current`, `node.x/y = lerp(simX/simY, targetX/targetY, ease)` applied in `draw()` (not written back to `simNodes`). On exit, we lerp back from target → current simNode position using the same eased curve over 300ms.

### Exit focus — animation

1. `cameraRef.current = { from: currentView, to: preFocusView, startedAt: now, duration: 300 }` — where `preFocusView` was captured when focus was entered.
2. `focusLayoutRef.current` stays non-null until the exit glide completes; nodes lerp back to their live simulation positions.
3. After duration: `focusLayoutRef.current = null`, `simulationFrozenRef.current = false`, `focusId = null`.
4. Fire a click-ripple at the click point (see Layer 3).

### Subgraph glow (while focused)

- Connected edges are drawn with the hover-glow treatment (1.2px, `--accent-brand` 80% alpha, 4px blur) regardless of hover.
- Selected node gets a 3px soft bloom ring (radial gradient from `rgba(brand, 0.45)` → `rgba(brand, 0)`).

### HUD card

Floating, absolutely positioned, top-right of the canvas, 8px inside the toolbar edge. 260px × auto. `z-index: 5` to sit above the canvas.

```
┌────────────────────────────────────────┐
│  FOCUSED · 5 backlinks · 3 outlinks   │  ← mono-label, quaternary
│                                        │
│  alice.md                        [ ↗ ] │  ← heading-3 primary + open-sheet btn
│  wiki/people/                          │  ← caption quaternary (folder path)
│                                        │
│  ─────────────────────────────         │  ← border-subtle divider
│  LINKED FROM                           │  ← mono-label quaternary
│   · weekly-sync.md                     │  ← 24px .app-row each
│   · q3-plan.md                         │
│   · october-1.md                       │
│   (+2 more ↓)                          │  ← reveal all
│                                        │
│  LINKS TO                              │
│   · retention-playbook.md              │
│   · goals-2026.md                      │
│   · kickoff-notes.md                   │
└────────────────────────────────────────┘
```

- Background `var(--bg-elevated)`, border `1px solid var(--border-subtle)`, radius 10, shadow `var(--shadow-dialog)`, padding 12.
- Fade-in: 180ms from opacity 0 + translateY(-4px) to rest.
- Exit: 140ms reverse.
- Row click → chain-focus on that node. Row double-click → `onOpen(path)` on that node.
- `↗` button → `onOpen(selected.path)` (opens sheet).
- Truncate both lists to 4 rows by default; clicking `(+N more)` expands in place, no network call.

Rendered in a React portal (`document.body`) so it sits above the canvas but respects Esc handling at the GraphCanvas level.

---

## Layer 2 — Folder color system

### Palette

8 deterministic slots. Each slot is a `{ dark: string; light: string }` pair.

```ts
const FOLDER_SLOTS = [
  { dark: "#818CF8", light: "#6366F1" }, // indigo   ← --accent-brand family
  { dark: "#C4B5FD", light: "#A78BFA" }, // violet   ← --accent-violet family
  { dark: "#6EE7B7", light: "#34D399" }, // emerald  ← --success family
  { dark: "#FBBF24", light: "#F59E0B" }, // amber
  { dark: "#F472B6", light: "#EC4899" }, // pink
  { dark: "#67E8F9", light: "#06B6D4" }, // cyan
  { dark: "#94A3B8", light: "#64748B" }, // slate
  { dark: "#FCA5A5", light: "#F87171" }, // rose
] as const;
```

No new CSS custom properties — hard-coded hex per slot. The only theme split is dark vs light, resolved at draw-time by reading `document.documentElement.classList.contains("light")` (the existing pattern in `draw()`).

### Mapping

Hash `node.folder.split("/")[0] || "root"` (top-level folder) to a slot index:

```ts
function folderSlot(folder: string): number {
  const key = folder.split("/")[0] || "root";
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 8;
}
```

Deterministic, stable across reloads, stable across theme toggles. Folders with the same first segment (`work/projects/foo` + `work/people/bar`) share a color — intentional; it shows cluster shape.

### Application in `draw()`

- Node fill: `slot.dark/light` at 85% alpha.
- Node ring (1px stroke, outside radius): slot color at 100%.
- Orphan nodes (`degree === 0`): neutral `var(--text-quaternary)` — ignore the slot color entirely. They're visually de-emphasised.
- Selected node (focus): 2px ring in `var(--accent-brand)` replaces the slot ring. Fill tint stays.
- Hovered node (not focused): 1px ring brightens to `rgba(255, 255, 255, 1)` (dark) / `#000` 80% alpha (light). Fill tint stays.

Edges stay neutral at all times (`--text-quaternary` 12% alpha by default, brand-tinted when hovered or part of focused subgraph) — coloring edges by folder creates visual chaos when nodes span folders.

### Legend chip

Position: bottom-left of the canvas, 12px from the bottom edge, 16px from the left edge. Single row of 8 small dots.

```
● ● ● ● ● ● ● ●
```

- Each dot: 8px, slot color, 2px gap between dots.
- Hover a dot:
  - `legendFilter = slot` on pointer-enter, `legendFilter = null` on pointer-leave (preview only).
  - In `draw()`, nodes whose slot !== `legendFilter` render at 15% alpha; matching nodes stay full.
- Click a dot:
  - Toggle persistent filter: if `legendFilter === slot` → `null`, else → `slot`.
  - Persistent filter survives pointer-leave.
- Tooltip on hover (250ms delay): shows the folder name(s) mapped to that slot, joined by `·`.

Legend implemented as absolutely-positioned divs overlaid on the canvas (React DOM, not canvas draw calls).

---

## Layer 3 — Bioluminescent polish

### 3a. Node breathing

Applied every frame to every node during `draw()` — does NOT write back to the simulation. Pure visual modifier.

```
displayRadius = node.radius × (1 + sin(now × ω + phase) × amp)
```

- `ω = 0.002 × Math.PI` (~3s full cycle)
- `phase = hash(node.id) mod (2π)` — precomputed once at init, stored on `SimNode`.
- `amp = 0.02 + Math.log(node.backlinks + 1) × 0.04`, clamped to `[0.02, 0.18]`.

Orphans breathe at 2%. A 20-backlink hub breathes at ~14%. Phases are desynchronised so the field ripples organically.

Add `phase: number` to the `SimNode` interface.

### 3b. Edge glow + comet trail on hover

**Default edge render:** unchanged — 0.4px stroke, `--text-quaternary` at 12% alpha.

**On hover-enter** (pointer enters a node, existing `hoveredId` is set):
- Push one comet entry per attached edge into `cometsRef.current`: `{ edgeKey: "source->target", startedAt: now }`.
- Cap at 30 comets — if hovering a super-hub, slice the first 30 by edge order.

**On hover-leave:** keep the comets in flight; they finish their own animation (600ms). No immediate cleanup.

**Comet draw:** for each entry, `t = min(1, (now - startedAt) / 600)`. The comet is a 12px bright segment along the edge, positioned at `t` of the edge length (parametrised from source to target). Its color is `--accent-brand`, alpha `sin(t × π)` (rises, peaks, falls). After `t === 1`, the comet is removed from the array.

**Static hover-glow** (for edges while the node is still hovered):
- Stroke: 1.2px, `--accent-brand` at 80% alpha.
- Subtle 4px shadow underneath, drawn by compositing via an off-screen canvas — expensive if recomputed every frame, so cache by `hoveredId`. Invalidate cache when `hoveredId` changes.

### 3c. Folder-tinted dual-ring hub pulse

Replaces the existing 30s-random solo-pulse (keep the mechanism, upgrade the rendering).

- Trigger: every ~12s, pick a random node with `backlinks >= 3` — same candidate rule as current.
- Ring 1: expands 0 → 32px radius over 600ms, fades 0.45 → 0 alpha. Folder slot color.
- Ring 2 (echo): starts 200ms after ring 1. Expands 0 → 20px, fades 0.25 → 0 over 600ms. Same color.
- Pulse state stored in `pulseRef.current` (existing ref). Add a second field `echoStartedAt` for ring 2.

### 3d. Click ripple

One radial line-ripple emitted at the click point whenever focus enters OR exits.

- `rippleRef.current = { x, y, startedAt: now }`.
- Draw: circle stroke, radius = `t × 400` (where `t = min(1, (now - startedAt) / 500)`), stroke width 1px, color `--accent-brand` with alpha `1 - t`.
- After `t === 1`, `rippleRef.current = null`.

### Reduced motion

Single gate at the top of the component body:

```ts
const reducedMotion = typeof window !== "undefined"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
```

When `true`:
- Breathing amplitude = 0 (nodes still render, just static radius).
- Comet trails skipped (edge goes directly to static glow).
- Hub pulse disabled (no visual trigger).
- Click ripple skipped.
- Focus camera glide duration: 400ms → 100ms (enter), 300ms → 100ms (exit). Still visible, just instant.

Re-compute on media-query change via `matchMedia().addEventListener("change", ...)` so toggling the OS setting updates immediately.

---

## Performance notes

- **Breathing:** 255 nodes × 60fps = 15k `sin()` calls/s. Sub-millisecond on any modern CPU.
- **Comet trails:** max 30 concurrent, each 3 ops per frame. Trivial.
- **Hub pulse rings:** two primitives every 12s. Free.
- **Hover glow cache:** off-screen canvas keyed by `hoveredId`; rebuild only on hover change. Amortised zero.
- **Focus layout computation:** O(edges) to partition backlinks/outlinks, O(subgraph) to position. Done once per focus-enter, not per frame.

Total additional frame budget: estimated <1.5 ms on an M-series. Current canvas runs at a steady 60 fps; this keeps it there.

---

## Accessibility

- Focus HUD card: all rows are buttons with `aria-label="Focus on <basename>"`.
- Open-sheet arrow: `aria-label="Open in sheet"`.
- Legend dots: each is a `<button>` with `aria-label="Filter to <folder-list>"`, `aria-pressed={legendFilter === slot}`.
- Focus-mode state: announce via `aria-live="polite"` region inside the HUD card with text `Focused on <basename>, 5 backlinks, 3 outlinks`.
- Esc key exits focus (covered in Interactions).

---

## Files touched

**Modified (1):**
- `src/components/browse/GraphCanvas.tsx`
  - Add focus state + layout refs + camera state.
  - Extend `handlePointerUp` to enter/exit focus on click; move open-sheet to double-click.
  - Extend `handleKeyDown` to handle `Esc` → exit focus.
  - Replace the current node-fill draw call with the folder-slot lookup + breathing radius + ring.
  - Replace the current idle pulse renderer with the dual-ring folder-tinted version.
  - Add comet-trail queue + draw pass.
  - Add click ripple state + draw pass.
  - Add the focus HUD card rendered via portal.
  - Add the bottom-left legend chip (DOM overlay).
  - Add the reduced-motion gate + matchMedia listener.

**New (0):** none.

All state + logic stays inside one file. The component grows by an estimated 300–350 lines; still under the 1000-line threshold the codebase treats as a split signal.

---

## Verification

1. `npx tsc --noEmit` clean.
2. `npm run build` green.
3. `/browse/graph` renders with folder-tinted nodes + rings + breathing motion.
4. Single-click a node → 400ms camera glide, non-connected nodes fade to 5%, subgraph reflows into left/right fans, HUD card appears top-right with metadata + linked-from + links-to.
5. Click a row in the HUD → chain-focuses to that node (new subgraph, new layout, smooth transition).
6. Click the selected node or press Esc → exit focus with a 300ms glide; simulation resumes; HUD fades out.
7. Double-click any node → sheet opens at that path.
8. Hover a node → edges glow brand-color with a comet trail; hover off → comets finish, glow fades.
9. Bottom-left legend dots: hover dims non-matching; click locks filter; click again unlocks.
10. Every ~12s, a hub emits a dual-ring folder-tinted pulse; no unison across the field.
11. Click ripple fires on focus-enter and focus-exit.
12. Theme toggle (dark ↔ light) → folder tints swap; selected ring stays brand-color; HUD card stays readable.
13. Chrome DevTools → Rendering → Emulate prefers-reduced-motion: breathing static, comets off, pulses off, ripples off, focus glide compressed to 100ms. All interactions still work.
14. Switch to Structure mode and back → focus state resets cleanly, no leaked rAF, no stale HUD, canvas repaints from scratch.

---

## One-sentence summary

Turn the Graph view from pretty-but-unused into an actually-useful research tool by adding a click-to-focus mode with animated subgraph reflow + HUD card, layering a deterministic 8-slot folder color system with a legend/filter chip, and wrapping everything in a subtle bioluminescent motion system (breathing nodes, hover comets, echo-ringed hub pulses, click ripples) — all additive to the existing canvas, single-file change, honoring prefers-reduced-motion, zero simulation or data changes.
