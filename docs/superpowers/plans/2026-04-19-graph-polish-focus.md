# Graph polish — focus mode + folder colors + bioluminescent motion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make /browse/graph actually useful (click-to-focus with animated subgraph reflow + HUD) and more visually alive (folder-tinted nodes, breathing, comets, ripples) without changing the simulation or data.

**Architecture:** Single-file refactor of GraphCanvas.tsx. Additive visual layers + one interaction mode. prefers-reduced-motion gates all motion channels.

**Tech Stack:** Next.js 16 App Router, React 19, TS strict.

**Branch:** v19-graph-polish from master. One commit per task.

---

## Ground rules

- **Single file edited:** `<repo>/src/components/browse/GraphCanvas.tsx`. No new files.
- **No API / prop changes.** The existing `Props` interface stays intact.
- **No simulation changes.** `step()` is untouched except for the single `simulationFrozenRef` early-return added in Task 6.
- **Every task ends with** `npx tsc --noEmit` green, then a `git commit` on branch `v19-graph-polish` with the verbatim message in the task.
- **Existing helpers to reuse as-is:** `roundRect`, `getOneHopNeighbors`, `pickNode`, `fitToView`, `startFadeLoop`'s `idle` rAF.

---

## Task 0 — Branch from master

- [ ] 0.1 From repo root `<repo>`, run:

  ```bash
  git checkout master && git pull --ff-only && git checkout -b v19-graph-polish
  ```

- [ ] 0.2 Confirm `git status` is clean and the current branch is `v19-graph-polish`:

  ```bash
  git rev-parse --abbrev-ref HEAD
  ```

  Expected output: `v19-graph-polish`.

- [ ] 0.3 No code changes yet; no commit for this task.

---

## Task 1 — Folder slot palette + slot-tinted node fill/ring

**Goal:** Replace the uniform white/brand star fill with a deterministic 8-slot folder color. Orphans stay neutral.

### 1.1 Add `SimNode.phase` field scaffold, palette constants, and `folderSlot()` helper

**File:** `src/components/browse/GraphCanvas.tsx`

Old (lines 32–42, `SimNode`):

```ts
interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** in + out links; precomputed so repulsion + centering can weight by it. */
  degree: number;
  /** Per-node charge for degree-weighted repulsion. Hubs push harder. */
  charge: number;
}
```

New:

```ts
interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** in + out links; precomputed so repulsion + centering can weight by it. */
  degree: number;
  /** Per-node charge for degree-weighted repulsion. Hubs push harder. */
  charge: number;
  /** Deterministic 0..7 folder slot for coloring. */
  slot: number;
  /** Breathing phase (0..2π), hashed from id; used by draw(). */
  phase: number;
}

// Deterministic 8-slot folder palette. Dark/light variants resolved at draw-time.
const FOLDER_SLOTS = [
  { dark: "#818CF8", light: "#6366F1" }, // indigo
  { dark: "#C4B5FD", light: "#A78BFA" }, // violet
  { dark: "#6EE7B7", light: "#34D399" }, // emerald
  { dark: "#FBBF24", light: "#F59E0B" }, // amber
  { dark: "#F472B6", light: "#EC4899" }, // pink
  { dark: "#67E8F9", light: "#06B6D4" }, // cyan
  { dark: "#94A3B8", light: "#64748B" }, // slate
  { dark: "#FCA5A5", light: "#F87171" }, // rose
] as const;

function folderSlot(folder: string): number {
  const key = folder.split("/")[0] || "root";
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 8;
}

function hashPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 6283) / 1000; // 0..~2π
}
```

### 1.2 Seed `slot` and `phase` in `initSimulation`

Old (lines 103–117 inside `initSimulation`):

```ts
      const simNodes: SimNode[] = graph.nodes.map((n, i) => {
        const angle = (i / graph.nodes.length) * Math.PI * 2;
        const r = 50 + ((i * 97) % 200);
        const degree = n.backlinks + n.outlinks;
        return {
          ...n,
          x: w / 2 + Math.cos(angle) * r,
          y: h / 2 + Math.sin(angle) * r,
          vx: 0,
          vy: 0,
          radius: Math.max(1.2, Math.min(5, 1.2 + Math.sqrt(n.backlinks) * 0.7)),
          degree,
          charge: 130 + Math.sqrt(degree) * 80,
        };
      });
```

New:

```ts
      const simNodes: SimNode[] = graph.nodes.map((n, i) => {
        const angle = (i / graph.nodes.length) * Math.PI * 2;
        const r = 50 + ((i * 97) % 200);
        const degree = n.backlinks + n.outlinks;
        return {
          ...n,
          x: w / 2 + Math.cos(angle) * r,
          y: h / 2 + Math.sin(angle) * r,
          vx: 0,
          vy: 0,
          radius: Math.max(1.2, Math.min(5, 1.2 + Math.sqrt(n.backlinks) * 0.7)),
          degree,
          charge: 130 + Math.sqrt(degree) * 80,
          slot: folderSlot(n.folder),
          phase: hashPhase(n.id),
        };
      });
```

### 1.3 Apply slot-tinted fill + ring in `draw()`

Old (lines 445–473, the per-node style block):

```ts
      if (hovered || selected) {
        ctx.fillStyle = colAccent;
        ctx.shadowColor = colAccent;
        ctx.shadowBlur = 18;
      } else if (isHub) {
        ctx.fillStyle = colStarHub;
        ctx.shadowColor = isLight ? "rgba(94,106,210,0.6)" : "rgba(200,220,255,0.95)";
        ctx.shadowBlur = 16;
      } else if (isBright) {
        ctx.fillStyle = colStarBright;
        ctx.shadowColor = isLight ? "rgba(94,106,210,0.4)" : "rgba(200,220,255,0.85)";
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = colStar;
        ctx.shadowBlur = 0;
      }

      ctx.globalAlpha = (active ? 1 : 0.15) * inhaleAlpha * pulseMul * focusAlpha;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (selected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * inhaleScale + 4 / scale, 0, Math.PI * 2);
        ctx.strokeStyle = colAccent;
        ctx.globalAlpha = 0.4 * inhaleAlpha;
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
```

New:

```ts
      const isOrphan = n.degree === 0;
      const slot = FOLDER_SLOTS[n.slot];
      const slotColor = isLight ? slot.light : slot.dark;
      const orphanColor = style.getPropertyValue("--text-quaternary").trim() || (isLight ? "#9aa0a6" : "#6b7280");

      if (hovered || selected) {
        ctx.fillStyle = colAccent;
        ctx.shadowColor = colAccent;
        ctx.shadowBlur = 18;
      } else if (isOrphan) {
        ctx.fillStyle = orphanColor;
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = slotColor;
        ctx.shadowColor = slotColor;
        ctx.shadowBlur = isHub ? 14 : isBright ? 6 : 0;
      }

      ctx.globalAlpha = (active ? 1 : 0.15) * inhaleAlpha * pulseMul * focusAlpha * 0.85;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Slot ring (skip for orphans, skip when selected — selected draws brand ring).
      if (!isOrphan && !selected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * inhaleScale + 0.8 / scale, 0, Math.PI * 2);
        ctx.strokeStyle = hovered
          ? (isLight ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,1)")
          : slotColor;
        ctx.lineWidth = 1 / scale;
        ctx.globalAlpha = (active ? 1 : 0.15) * inhaleAlpha * focusAlpha;
        ctx.stroke();
      }

      if (selected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * inhaleScale + 4 / scale, 0, Math.PI * 2);
        ctx.strokeStyle = colAccent;
        ctx.globalAlpha = 0.4 * inhaleAlpha;
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
```

Note: `colStar`, `colStarBright`, `colStarHub` variable declarations stay — not removed (small refactor footprint; they're unused by nodes now but could still be referenced by future edits). TypeScript strict mode does not error on unused locals by default in this repo.

### 1.4 Verify

```bash
npx tsc --noEmit
```

Browser walk:

1. `npm run dev`, open `/browse/graph`.
2. Confirm nodes now render in 8 distinct hues aligned with top-level folder.
3. Confirm orphans stay a neutral grey.
4. Toggle theme → palette switches dark/light variant.

### 1.5 Commit

```bash
git add src/components/browse/GraphCanvas.tsx
git commit -m "feat(graph): folder slot palette + tinted node fill/ring"
```

---

## Task 2 — Node breathing modifier + reduced-motion scaffold

**Goal:** Apply per-node sinusoidal radius modulation in `draw()` without writing back to simulation. Gate behind a `reducedMotion` ref.

### 2.1 Add `reducedMotionRef` + matchMedia listener

Old (lines 62–73, existing refs at top of component body):

```ts
  // View transform (pan + zoom). stored in a ref so the animation loop
  // can read it without triggering re-renders.
  const viewRef = useRef({ tx: 0, ty: 0, scale: 1 });
  const simNodesRef = useRef<SimNode[]>([]);
  const simEdgesRef = useRef<GraphEdge[]>([]);
  const tickCountRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef<{ kind: "pan" | "node"; id?: string; lastX: number; lastY: number } | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const inhaleRef = useRef(0); // 0 → 1 over 300ms on mount
  const pulseRef = useRef<{ id: string; startedAt: number } | null>(null);
  const mountTimeRef = useRef<number>(0);
  // Holds the latest `draw` so the rAF loop doesn't call a stale closure.
  const drawRef = useRef<() => void>(() => {});
```

New (append `reducedMotionRef` at the end):

```ts
  // View transform (pan + zoom). stored in a ref so the animation loop
  // can read it without triggering re-renders.
  const viewRef = useRef({ tx: 0, ty: 0, scale: 1 });
  const simNodesRef = useRef<SimNode[]>([]);
  const simEdgesRef = useRef<GraphEdge[]>([]);
  const tickCountRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef<{ kind: "pan" | "node"; id?: string; lastX: number; lastY: number } | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const inhaleRef = useRef(0); // 0 → 1 over 300ms on mount
  const pulseRef = useRef<{ id: string; startedAt: number; echoStartedAt: number } | null>(null);
  const mountTimeRef = useRef<number>(0);
  // Holds the latest `draw` so the rAF loop doesn't call a stale closure.
  const drawRef = useRef<() => void>(() => {});
  const reducedMotionRef = useRef(false);
```

Note: we preemptively widen `pulseRef` to include `echoStartedAt` now (used in Task 4) — safe because nothing reads it yet.

### 2.2 Wire matchMedia listener inside a new `useEffect` placed right after the existing wheel-handler effect (after line 646)

Add:

```ts
  // Reduced-motion gate. Re-read live so toggling the OS preference
  // updates every motion channel on the next frame.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { reducedMotionRef.current = mq.matches; };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
```

### 2.3 Apply breathing in `draw()` per-node radius calc

Old (line 443):

```ts
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius * inhaleScale, 0, Math.PI * 2);
```

New:

```ts
      // Breathing — per-node phased sine, zero amplitude under reduced motion.
      const breatheAmp = reducedMotionRef.current
        ? 0
        : Math.min(0.18, 0.02 + Math.log(n.backlinks + 1) * 0.04);
      const breathe = 1 + Math.sin(nowPerf * 0.002 * Math.PI + n.phase) * breatheAmp;
      const displayR = n.radius * inhaleScale * breathe;

      ctx.beginPath();
      ctx.arc(n.x, n.y, displayR, 0, Math.PI * 2);
```

Also update both follow-up `ctx.arc` calls that reuse `n.radius * inhaleScale` (ring + selected bloom in Task 1's new code). Replace `n.radius * inhaleScale` with `displayR / breathe * /* same factor */` — simpler: reuse `displayR`:

Old (slot ring arc added in Task 1):

```ts
        ctx.arc(n.x, n.y, n.radius * inhaleScale + 0.8 / scale, 0, Math.PI * 2);
```

New:

```ts
        ctx.arc(n.x, n.y, displayR + 0.8 / scale, 0, Math.PI * 2);
```

Old (selected ring arc):

```ts
        ctx.arc(n.x, n.y, n.radius * inhaleScale + 4 / scale, 0, Math.PI * 2);
```

New:

```ts
        ctx.arc(n.x, n.y, displayR + 4 / scale, 0, Math.PI * 2);
```

### 2.4 Verify

```bash
npx tsc --noEmit
```

Browser walk:

1. `/browse/graph` — observe all nodes gently pulsing with phase offsets (field ripples, not unison).
2. Hub-like nodes breathe more visibly than orphans.
3. Chrome DevTools → Rendering → Emulate `prefers-reduced-motion: reduce` — motion halts to static radius. Toggle off → resumes.

### 2.5 Commit

```bash
git add src/components/browse/GraphCanvas.tsx
git commit -m "feat(graph): per-node breathing with reduced-motion gate"
```

---

## Task 3 — Legend chip + legend-filter integration

**Goal:** 8-dot bottom-left DOM overlay; hover previews filter, click toggles persistent filter. Integrates with `draw()` opacity pass.

### 3.1 Add `legendFilter` state + derived set of active slots

Old (line 58, existing state block):

```ts
  const [focusId, setFocusId] = useState<string | null>(null);
```

New (append):

```ts
  const [focusId, setFocusId] = useState<string | null>(null);
  const [legendFilter, setLegendFilter] = useState<number | null>(null);
  const [legendHover, setLegendHover] = useState<number | null>(null);
```

### 3.2 Thread `legendFilter` / `legendHover` into `draw()` opacity pass

Old (line 462):

```ts
      ctx.globalAlpha = (active ? 1 : 0.15) * inhaleAlpha * pulseMul * focusAlpha * 0.85;
```

New:

```ts
      const effectiveSlotFilter = legendHover ?? legendFilter;
      const slotMul = effectiveSlotFilter === null ? 1 : (n.slot === effectiveSlotFilter ? 1 : 0.15);
      ctx.globalAlpha = (active ? 1 : 0.15) * inhaleAlpha * pulseMul * focusAlpha * slotMul * 0.85;
```

Apply the same `slotMul` to the slot ring stroke alpha and to the slot-ring block:

Old (slot ring stroke):

```ts
        ctx.globalAlpha = (active ? 1 : 0.15) * inhaleAlpha * focusAlpha;
```

New:

```ts
        ctx.globalAlpha = (active ? 1 : 0.15) * inhaleAlpha * focusAlpha * slotMul;
```

Update the `draw` dep list from `[hoveredId, selectedId, activeIds, focusId]` to include `legendFilter` and `legendHover`:

Old (line 518):

```ts
  }, [hoveredId, selectedId, activeIds, focusId]);
```

New:

```ts
  }, [hoveredId, selectedId, activeIds, focusId, legendFilter, legendHover]);
```

### 3.3 Build the legend overlay — folder-name map + render

Add a memoised `slotLabels` inside the component body (after the `activeIds` useMemo, around line 88):

```ts
  // Map each slot to the human-readable folder names that landed in it.
  const slotLabels = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const n of graph.nodes) {
      const s = folderSlot(n.folder);
      const label = n.folder.split("/")[0] || "root";
      if (!map.has(s)) map.set(s, new Set());
      map.get(s)!.add(label);
    }
    return map;
  }, [graph.nodes]);
```

Render the legend inside the returned JSX. Old (lines 728–742, the keyboard hint div):

```tsx
      {/* Keyboard hint */}
      <div
        className="mono-label"
        style={{
          position: "absolute",
          bottom: 12,
          left: 16,
          color: "var(--text-quaternary)",
          letterSpacing: "0.04em",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        drag · scroll to zoom · ↑↓←→ pan · f fit · esc reset
      </div>
```

New (keyboard hint shifts up to leave room for legend, legend sits at `bottom: 12`):

```tsx
      {/* Legend chip — 8 folder-slot dots */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 16,
          display: "flex",
          gap: 2,
          alignItems: "center",
          zIndex: 3,
        }}
      >
        {FOLDER_SLOTS.map((slot, i) => {
          const color = document.documentElement.classList.contains("light") ? slot.light : slot.dark;
          const folders = Array.from(slotLabels.get(i) ?? []).join(" · ") || "(empty)";
          const pressed = legendFilter === i;
          return (
            <button
              key={i}
              type="button"
              aria-label={`Filter to ${folders}`}
              aria-pressed={pressed}
              title={folders}
              onPointerEnter={() => setLegendHover(i)}
              onPointerLeave={() => setLegendHover(null)}
              onClick={() => setLegendFilter((prev) => (prev === i ? null : i))}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: color,
                border: "none",
                padding: 0,
                margin: 0,
                cursor: "pointer",
                outline: pressed ? `1.5px solid var(--accent-brand)` : "none",
                outlineOffset: 2,
                opacity: legendFilter === null || pressed ? 1 : 0.4,
              }}
            />
          );
        })}
      </div>
      {/* Keyboard hint */}
      <div
        className="mono-label"
        style={{
          position: "absolute",
          bottom: 12,
          left: 120,
          color: "var(--text-quaternary)",
          letterSpacing: "0.04em",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        drag · scroll to zoom · ↑↓←→ pan · f fit · esc reset
      </div>
```

### 3.4 Verify

```bash
npx tsc --noEmit
```

Browser walk:

1. Eight colored dots render bottom-left above the keyboard hint.
2. Hover a dot → all non-matching nodes dim to ~15%; pointer-leave restores.
3. Click a dot → persistent filter (outline ring on that dot, other dots dim to 40%).
4. Click same dot again → filter clears.

### 3.5 Commit

```bash
git add src/components/browse/GraphCanvas.tsx
git commit -m "feat(graph): folder legend chip with hover preview + click filter"
```

---

## Task 4 — Folder-tinted dual-ring hub pulse

**Goal:** Upgrade the existing 30s idle pulse to a 12s-interval dual-ring echo in the node's folder-slot color.

### 4.1 Change pulse trigger frequency + capture echo start time

Old (lines 147–165, the `idle` inner function in `startFadeLoop`):

```ts
          const idle = () => {
            const now2 = performance.now();
            if (!pulseRef.current) {
              if (Math.random() < 0.012) {
                const candidates = simNodesRef.current.filter((n) => n.backlinks >= 3);
                if (candidates.length > 0) {
                  const pick = candidates[Math.floor(Math.random() * candidates.length)];
                  pulseRef.current = { id: pick.id, startedAt: now2 };
                }
              }
            } else {
              const age = now2 - pulseRef.current.startedAt;
              if (age > 600) pulseRef.current = null;
            }
            drawRef.current();
            rafRef.current = requestAnimationFrame(idle);
          };
```

New:

```ts
          const idle = () => {
            const now2 = performance.now();
            const reduced = reducedMotionRef.current;
            if (!pulseRef.current && !reduced) {
              // At 60fps, 0.0014 ≈ one hit per 12s.
              if (Math.random() < 0.0014) {
                const candidates = simNodesRef.current.filter((n) => n.backlinks >= 3);
                if (candidates.length > 0) {
                  const pick = candidates[Math.floor(Math.random() * candidates.length)];
                  pulseRef.current = { id: pick.id, startedAt: now2, echoStartedAt: now2 + 200 };
                }
              }
            } else if (pulseRef.current) {
              const age = now2 - pulseRef.current.startedAt;
              // Primary 600ms + echo offset 200ms + echo 600ms = 800ms total.
              if (age > 900) pulseRef.current = null;
            }
            drawRef.current();
            rafRef.current = requestAnimationFrame(idle);
          };
```

### 4.2 Render dual rings in `draw()`

Old (lines 429–434):

```ts
      // Idle pulse — if this node is pulsing, multiply opacity by a sine bump.
      let pulseMul = 1;
      if (pulse && pulse.id === n.id) {
        const age = (nowPerf - pulse.startedAt) / 600;
        pulseMul = 0.8 + 0.2 * Math.sin(age * Math.PI);
      }
```

New:

```ts
      // Idle pulse — subtle opacity bump on the node itself.
      let pulseMul = 1;
      if (pulse && pulse.id === n.id) {
        const age = (nowPerf - pulse.startedAt) / 600;
        if (age >= 0 && age <= 1) pulseMul = 0.85 + 0.15 * Math.sin(age * Math.PI);
      }
```

Then, **after** the per-node `ctx.fill()` + ring calls but before `ctx.globalAlpha = 1` line that closes the node block (around line 475), insert the dual-ring expansion when this node is the pulse target:

Old context (closing the per-node block, line 474):

```ts
      }
      ctx.globalAlpha = 1;
    }
```

New (inject dual-ring draw):

```ts
      }

      // Dual-ring hub pulse expansion (folder-tinted).
      if (pulse && pulse.id === n.id) {
        const slotBase = FOLDER_SLOTS[n.slot];
        const pulseColor = isLight ? slotBase.light : slotBase.dark;

        const t1 = (nowPerf - pulse.startedAt) / 600;
        if (t1 >= 0 && t1 <= 1) {
          const r1 = displayR + 32 * t1;
          const a1 = 0.45 * (1 - t1);
          ctx.beginPath();
          ctx.arc(n.x, n.y, r1, 0, Math.PI * 2);
          ctx.strokeStyle = pulseColor;
          ctx.globalAlpha = a1 * inhaleAlpha;
          ctx.lineWidth = 1.2 / scale;
          ctx.stroke();
        }
        const t2 = (nowPerf - pulse.echoStartedAt) / 600;
        if (t2 >= 0 && t2 <= 1) {
          const r2 = displayR + 20 * t2;
          const a2 = 0.25 * (1 - t2);
          ctx.beginPath();
          ctx.arc(n.x, n.y, r2, 0, Math.PI * 2);
          ctx.strokeStyle = pulseColor;
          ctx.globalAlpha = a2 * inhaleAlpha;
          ctx.lineWidth = 1 / scale;
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
    }
```

### 4.3 Verify

```bash
npx tsc --noEmit
```

Browser walk:

1. Wait up to ~15s on `/browse/graph`; observe a hub emit a double ring in its folder color, not white.
2. Under `prefers-reduced-motion: reduce` emulation, no rings fire.

### 4.4 Commit

```bash
git add src/components/browse/GraphCanvas.tsx
git commit -m "feat(graph): dual-ring folder-tinted hub pulse at 12s cadence"
```

---

## Task 5 — Edge comet trail on hover

**Goal:** When a node becomes hovered, push one comet per incident edge; render the comet sprite travelling source→target over 600ms. Pre-existing hover-glow stays.

### 5.1 Add `cometsRef` + hover-change effect to seed comets

Add ref next to the others (after `reducedMotionRef`):

```ts
  const cometsRef = useRef<{ edgeKey: string; source: string; target: string; startedAt: number }[]>([]);
  const prevHoveredRef = useRef<string | null>(null);
```

Add a new effect that watches `hoveredId`. Place it right after the `drawRef` sync effect (around line 524):

```ts
  // On hover-enter, seed one comet per incident edge (cap 30).
  useEffect(() => {
    const prev = prevHoveredRef.current;
    prevHoveredRef.current = hoveredId;
    if (!hoveredId || hoveredId === prev) return;
    if (reducedMotionRef.current) return;
    const now = performance.now();
    const edges = simEdgesRef.current;
    const incident = edges.filter((e) => e.source === hoveredId || e.target === hoveredId).slice(0, 30);
    for (const e of incident) {
      cometsRef.current.push({
        edgeKey: `${e.source}->${e.target}`,
        source: e.source,
        target: e.target,
        startedAt: now,
      });
    }
  }, [hoveredId]);
```

### 5.2 Draw + prune comets inside `draw()` — requires hoisting `nowPerf`

First, hoist `nowPerf` above the edge draw loop so both the comet pass and the node pass can use it. Then insert the comet draw/prune block between the edge loop and the node loop.

Old (lines 394–421):

```ts
    ctx.lineWidth = 0.4 / scale;
    for (const e of edges) {
      ...
    }
    ctx.globalAlpha = 1;

    // Nodes.
    const pulse = pulseRef.current;
    const nowPerf = performance.now();
    for (const n of nodes) {
```

New:

```ts
    const nowPerf = performance.now();

    ctx.lineWidth = 0.4 / scale;
    for (const e of edges) {
      ...
    }
    ctx.globalAlpha = 1;

    // Comet trails — consume cometsRef, drop finished entries.
    if (!reducedMotionRef.current && cometsRef.current.length > 0) {
      const alive: typeof cometsRef.current = [];
      for (const c of cometsRef.current) {
        const t = (nowPerf - c.startedAt) / 600;
        if (t >= 1) continue;
        const a = byId.get(c.source);
        const b = byId.get(c.target);
        if (!a || !b) continue;
        const headX = a.x + (b.x - a.x) * t;
        const headY = a.y + (b.y - a.y) * t;
        const tailT = Math.max(0, t - 0.06);
        const tailX = a.x + (b.x - a.x) * tailT;
        const tailY = a.y + (b.y - a.y) * tailT;
        const alpha = Math.sin(t * Math.PI);
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.strokeStyle = colAccent;
        ctx.lineWidth = 1.4 / scale;
        ctx.globalAlpha = alpha * inhaleAlpha;
        ctx.stroke();
        alive.push(c);
      }
      cometsRef.current = alive;
      ctx.globalAlpha = 1;
    }

    // Nodes.
    const pulse = pulseRef.current;
    for (const n of nodes) {
```

(Delete the original `const nowPerf = performance.now();` that was on line 421 — it's now hoisted.)

### 5.3 Verify

```bash
npx tsc --noEmit
```

Browser walk:

1. Hover a well-connected node — bright comets travel outward along each edge, each for 600ms.
2. Hover off mid-flight — comets finish their travel, don't snap off.
3. Under reduced-motion — no comets spawn.

### 5.4 Commit

```bash
git add src/components/browse/GraphCanvas.tsx
git commit -m "feat(graph): edge comet trails on node hover"
```

---

## Task 6 — Focus mode core (state, click handlers, camera glide, subgraph layout, interpolated draw)

**Goal:** Single-click enters focus. Double-click opens sheet. Esc exits focus. Camera glides + subgraph reflows into left/right fans. `step()` freezes.

### 6.1 Add focus-related refs + state

After `cometsRef` / `prevHoveredRef`:

```ts
  const cameraRef = useRef<{
    from: { tx: number; ty: number; scale: number };
    to: { tx: number; ty: number; scale: number };
    startedAt: number;
    duration: number;
    direction: "enter" | "exit";
  } | null>(null);
  const focusLayoutRef = useRef<Map<string, { tx: number; ty: number }> | null>(null);
  const simulationFrozenRef = useRef(false);
  const preFocusViewRef = useRef<{ tx: number; ty: number; scale: number } | null>(null);
  const rippleRef = useRef<{ x: number; y: number; startedAt: number } | null>(null);
```

### 6.2 Freeze `step()` while focused

Old (lines 220–224, `step` signature):

```ts
  const step = useCallback(() => {
    const nodes = simNodesRef.current;
    const edges = simEdgesRef.current;
    const container = containerRef.current;
    if (!container || nodes.length === 0) return;
```

New:

```ts
  const step = useCallback(() => {
    if (simulationFrozenRef.current) return;
    const nodes = simNodesRef.current;
    const edges = simEdgesRef.current;
    const container = containerRef.current;
    if (!container || nodes.length === 0) return;
```

### 6.3 Add `enterFocus` / `exitFocus` helpers above `draw()` (around line 340)

Insert after the `step` useCallback closes:

```ts
  const computeFocusLayout = useCallback((selectedId: string) => {
    const nodes = simNodesRef.current;
    const edges = simEdgesRef.current;
    const container = containerRef.current;
    if (!container) return null;
    const byId = new Map<string, SimNode>();
    for (const n of nodes) byId.set(n.id, n);
    const selected = byId.get(selectedId);
    if (!selected) return null;

    const backlinks: SimNode[] = [];
    const outlinks: SimNode[] = [];
    for (const e of edges) {
      if (e.target === selectedId) {
        const n = byId.get(e.source);
        if (n && !backlinks.includes(n)) backlinks.push(n);
      } else if (e.source === selectedId) {
        const n = byId.get(e.target);
        if (n && !outlinks.includes(n)) outlinks.push(n);
      }
    }

    // Sort: most-connected to the top.
    const sortByDegree = (a: SimNode, b: SimNode) => (b.outlinks + b.backlinks) - (a.outlinks + a.backlinks);
    backlinks.sort(sortByDegree);
    outlinks.sort(sortByDegree);

    const h = container.clientHeight;
    const layout = new Map<string, { tx: number; ty: number }>();
    layout.set(selectedId, { tx: selected.x, ty: selected.y });

    const place = (list: SimNode[], xOffset: number) => {
      const spacing = Math.max(36, h / (list.length + 1));
      list.forEach((n, i) => {
        const jitter = ((n.id.charCodeAt(0) % 17) - 8);
        const ty = selected.y + (i - (list.length - 1) / 2) * spacing;
        const tx = selected.x + xOffset + jitter;
        layout.set(n.id, { tx, ty });
      });
    };
    place(backlinks, -220);
    place(outlinks, 220);

    // Target camera: fit subgraph into 70% viewport.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pos of layout.values()) {
      minX = Math.min(minX, pos.tx);
      minY = Math.min(minY, pos.ty);
      maxX = Math.max(maxX, pos.tx);
      maxY = Math.max(maxY, pos.ty);
    }
    const w = container.clientWidth;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const fitScale = Math.min((w * 0.7) / bw, (h * 0.7) / bh, 2.5);
    const scale = Math.max(0.8, fitScale);
    const tx = w / 2 - selected.x * scale;
    const ty = h / 2 - selected.y * scale;

    return { layout, camera: { tx, ty, scale } };
  }, []);

  const enterFocus = useCallback((id: string, clickX: number, clickY: number) => {
    const result = computeFocusLayout(id);
    if (!result) return;
    const reduced = reducedMotionRef.current;
    preFocusViewRef.current = { ...viewRef.current };
    cameraRef.current = {
      from: { ...viewRef.current },
      to: result.camera,
      startedAt: performance.now(),
      duration: reduced ? 100 : 400,
      direction: "enter",
    };
    focusLayoutRef.current = result.layout;
    simulationFrozenRef.current = true;
    setFocusId(id);
    if (!reduced) {
      rippleRef.current = { x: clickX, y: clickY, startedAt: performance.now() };
    }
  }, [computeFocusLayout]);

  const exitFocus = useCallback((clickX?: number, clickY?: number) => {
    const reduced = reducedMotionRef.current;
    const back = preFocusViewRef.current ?? { tx: 0, ty: 0, scale: 1 };
    cameraRef.current = {
      from: { ...viewRef.current },
      to: back,
      startedAt: performance.now(),
      duration: reduced ? 100 : 300,
      direction: "exit",
    };
    setFocusId(null);
    if (!reduced && clickX !== undefined && clickY !== undefined) {
      rippleRef.current = { x: clickX, y: clickY, startedAt: performance.now() };
    }
    // Schedule cleanup when exit glide completes.
    const dur = reduced ? 100 : 300;
    setTimeout(() => {
      focusLayoutRef.current = null;
      simulationFrozenRef.current = false;
      preFocusViewRef.current = null;
    }, dur + 20);
  }, []);
```

### 6.4 Wire camera glide + ripple + node interpolation into `draw()`

Insert at the very top of `draw()` body (just after the `if (!ctx) return;` guard around line 347):

```ts
    // Advance camera glide, if active.
    if (cameraRef.current) {
      const cam = cameraRef.current;
      const tRaw = Math.min(1, (performance.now() - cam.startedAt) / cam.duration);
      const e = 1 - Math.pow(1 - tRaw, 3);
      viewRef.current = {
        tx: cam.from.tx + (cam.to.tx - cam.from.tx) * e,
        ty: cam.from.ty + (cam.to.ty - cam.from.ty) * e,
        scale: cam.from.scale + (cam.to.scale - cam.from.scale) * e,
      };
      if (tRaw >= 1) cameraRef.current = null;
    }
```

Now apply node-position interpolation when `focusLayoutRef.current` is set. We'll first add an inline lerp block to the node loop and a separate inline helper to the edge loop, then consolidate both into a shared `interpFocus` closure at the end of 6.4 (the final consolidated version is the canonical one — feel free to write it in one pass if the shared helper pattern is clear).

Old inside the node loop (just before `ctx.beginPath();` for the fill):

```ts
      const breatheAmp = reducedMotionRef.current
        ? 0
        : Math.min(0.18, 0.02 + Math.log(n.backlinks + 1) * 0.04);
      const breathe = 1 + Math.sin(nowPerf * 0.002 * Math.PI + n.phase) * breatheAmp;
      const displayR = n.radius * inhaleScale * breathe;

      ctx.beginPath();
      ctx.arc(n.x, n.y, displayR, 0, Math.PI * 2);
```

New:

```ts
      const breatheAmp = reducedMotionRef.current
        ? 0
        : Math.min(0.18, 0.02 + Math.log(n.backlinks + 1) * 0.04);
      const breathe = 1 + Math.sin(nowPerf * 0.002 * Math.PI + n.phase) * breatheAmp;
      const displayR = n.radius * inhaleScale * breathe;

      // Focus layout: lerp toward target positions during glide.
      let nx = n.x;
      let ny = n.y;
      const layout = focusLayoutRef.current;
      if (layout) {
        const target = layout.get(n.id);
        if (target) {
          if (cameraRef.current) {
            const tRaw = Math.min(1, (performance.now() - cameraRef.current.startedAt) / cameraRef.current.duration);
            const e = 1 - Math.pow(1 - tRaw, 3);
            if (cameraRef.current.direction === "enter") {
              nx = n.x + (target.tx - n.x) * e;
              ny = n.y + (target.ty - n.y) * e;
            } else {
              // Exit: lerp from target back to sim position.
              nx = target.tx + (n.x - target.tx) * e;
              ny = target.ty + (n.y - target.ty) * e;
            }
          } else {
            // Glide finished, still focused — snap to target.
            nx = target.tx;
            ny = target.ty;
          }
        }
      }

      ctx.beginPath();
      ctx.arc(nx, ny, displayR, 0, Math.PI * 2);
```

Replace remaining `n.x` / `n.y` references **inside this node loop iteration** with `nx` / `ny`:

- Slot ring: `ctx.arc(nx, ny, displayR + 0.8 / scale, ...)`.
- Selected ring: `ctx.arc(nx, ny, displayR + 4 / scale, ...)`.
- Dual-ring pulse arcs (Task 4): `ctx.arc(nx, ny, ...)` in both `t1` and `t2` blocks.

Also update the label overlay (line 483–484):

Old:

```ts
        const sx = n.x * scale + tx;
        const sy = n.y * scale + ty;
```

New:

```ts
        // Use focus-layout position when active, so the label tracks the animated node.
        const layout = focusLayoutRef.current;
        const target = layout?.get(n.id);
        const liveX = target && !cameraRef.current ? target.tx : n.x;
        const liveY = target && !cameraRef.current ? target.ty : n.y;
        const sx = liveX * scale + tx;
        const sy = liveY * scale + ty;
```

Also update the edge draw loop to use interpolated positions so edges track the animated subgraph. Old (lines 412–415):

```ts
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
```

New:

```ts
      const layoutE = focusLayoutRef.current;
      const interp = (node: SimNode): [number, number] => {
        const tgt = layoutE?.get(node.id);
        if (!tgt) return [node.x, node.y];
        if (cameraRef.current) {
          const tRaw = Math.min(1, (performance.now() - cameraRef.current.startedAt) / cameraRef.current.duration);
          const eCurve = 1 - Math.pow(1 - tRaw, 3);
          if (cameraRef.current.direction === "enter") {
            return [node.x + (tgt.tx - node.x) * eCurve, node.y + (tgt.ty - node.y) * eCurve];
          }
          return [tgt.tx + (node.x - tgt.tx) * eCurve, tgt.ty + (node.y - tgt.ty) * eCurve];
        }
        return [tgt.tx, tgt.ty];
      };
      const [ax, ay] = interp(a);
      const [bx, by] = interp(b);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
```

Apply the same `interp` to the comet-trail block (use it for `a`/`b` coordinates).

Old (comet block positions):

```ts
        const headX = a.x + (b.x - a.x) * t;
        const headY = a.y + (b.y - a.y) * t;
        const tailT = Math.max(0, t - 0.06);
        const tailX = a.x + (b.x - a.x) * tailT;
        const tailY = a.y + (b.y - a.y) * tailT;
```

New:

```ts
        const [ax, ay] = interpFocus(a);
        const [bx, by] = interpFocus(b);
        const headX = ax + (bx - ax) * t;
        const headY = ay + (by - ay) * t;
        const tailT = Math.max(0, t - 0.06);
        const tailX = ax + (bx - ax) * tailT;
        const tailY = ay + (by - ay) * tailT;
```

Extract `interp` out of the edge loop and rename to `interpFocus`, declared once per frame right after `nowPerf`:

```ts
    const nowPerf = performance.now();
    const interpFocus = (node: SimNode): [number, number] => {
      const layoutF = focusLayoutRef.current;
      const tgt = layoutF?.get(node.id);
      if (!tgt) return [node.x, node.y];
      if (cameraRef.current) {
        const tRaw = Math.min(1, (nowPerf - cameraRef.current.startedAt) / cameraRef.current.duration);
        const eCurve = 1 - Math.pow(1 - tRaw, 3);
        if (cameraRef.current.direction === "enter") {
          return [node.x + (tgt.tx - node.x) * eCurve, node.y + (tgt.ty - node.y) * eCurve];
        }
        return [tgt.tx + (node.x - tgt.tx) * eCurve, tgt.ty + (node.y - tgt.ty) * eCurve];
      }
      return [tgt.tx, tgt.ty];
    };
```

Then in the edge loop, replace the inline `interp` with `interpFocus`, and in the node loop replace the inline block with:

```ts
      const [nx, ny] = interpFocus(n);
```

(Dropping the inline `if (layout)` block since `interpFocus` handles it.)

### 6.5 Strengthen focus fade — non-connected nodes to 5%

Old (line 438–440):

```ts
      let focusAlpha = 1;
      if (focusId && neighborSet) {
        if (n.id !== focusId && !neighborSet.has(n.id)) focusAlpha = 0.1;
      }
```

New:

```ts
      let focusAlpha = 1;
      if (focusId && neighborSet) {
        if (n.id !== focusId && !neighborSet.has(n.id)) focusAlpha = 0.05;
      }
```

### 6.6 Rewire `handlePointerUp` — single-click = focus toggle, double-click = open

Old (lines 609–622):

```ts
  const handlePointerUp = (e: React.PointerEvent) => {
    const drag = draggingRef.current;
    const { x, y } = getRel(e);
    draggingRef.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
    if (drag && drag.kind === "node" && drag.id) {
      // If pointer didn't move much, treat as a click.
      const moved = Math.hypot(x - drag.lastX, y - drag.lastY);
      if (moved < 4) {
        setSelectedId(drag.id);
        onOpen(drag.id);
      }
    }
  };
```

New:

```ts
  const handlePointerUp = (e: React.PointerEvent) => {
    const drag = draggingRef.current;
    const { x, y } = getRel(e);
    draggingRef.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
    if (drag && drag.kind === "node" && drag.id) {
      const moved = Math.hypot(x - drag.lastX, y - drag.lastY);
      if (moved < 4) {
        setSelectedId(drag.id);
        const clickedId = drag.id;

        if (focusId === null) {
          enterFocus(clickedId, x, y);
        } else if (focusId === clickedId) {
          exitFocus(x, y);
        } else {
          // Chain-focus only if clicked node is connected; else no-op.
          const connected = simEdgesRef.current.some(
            (edge) => (edge.source === focusId && edge.target === clickedId)
              || (edge.target === focusId && edge.source === clickedId),
          );
          if (connected) {
            enterFocus(clickedId, x, y);
          }
        }
      }
    }
  };
```

### 6.7 Update `onDoubleClick` to always open

Old (lines 719–725):

```tsx
        onDoubleClick={(e) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const hit = pickNode(e.clientX - rect.left, e.clientY - rect.top);
          if (hit) setFocusId(hit.id);
        }}
```

New:

```tsx
        onDoubleClick={(e) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const hit = pickNode(e.clientX - rect.left, e.clientY - rect.top);
          if (hit) onOpen(hit.id);
        }}
```

### 6.8 Update Esc keybinding to call `exitFocus`

Old (lines 660–668):

```ts
      else if (e.key === "Escape") {
        if (focusId) {
          setFocusId(null);
          e.preventDefault();
          return;
        }
        viewRef.current = { tx: 0, ty: 0, scale: 1 };
        setSelectedId(null);
      }
```

New:

```ts
      else if (e.key === "Escape") {
        if (focusId) {
          exitFocus();
          e.preventDefault();
          return;
        }
        viewRef.current = { tx: 0, ty: 0, scale: 1 };
        setSelectedId(null);
      }
```

Update dep list on the keydown effect:

Old (line 673):

```ts
  }, [focusId]);
```

New:

```ts
  }, [focusId, exitFocus]);
```

### 6.9 Verify

```bash
npx tsc --noEmit
```

Browser walk:

1. Single-click a node with some connections — camera glides 400ms, non-connected nodes fade to 5%, subgraph reflows into left (backlinks) / right (outlinks) fans centered on the selected node.
2. Single-click the focused node — exits focus with a 300ms glide; sim resumes.
3. Single-click a *connected* neighbour while focused — chain-focuses to it.
4. Single-click a non-connected faded node — no-op.
5. Double-click any node — opens sheet (`onOpen` fires).
6. Press `Esc` while focused — exits with glide.

### 6.10 Commit

```bash
git add src/components/browse/GraphCanvas.tsx
git commit -m "feat(graph): focus mode with camera glide and subgraph reflow"
```

---

## Task 7 — Focus HUD card (React portal, backlink/outlink lists, chain-focus, open-sheet)

**Goal:** Top-right 260px card listing backlinks/outlinks, rows clickable.

### 7.1 Add backlink/outlink computation memo

Add near `slotLabels` memo:

```ts
  const focusLinks = useMemo(() => {
    if (!focusId) return null;
    const backlinks: string[] = [];
    const outlinks: string[] = [];
    for (const e of graph.edges) {
      if (e.target === focusId) backlinks.push(e.source);
      else if (e.source === focusId) outlinks.push(e.target);
    }
    const node = graph.nodes.find((n) => n.id === focusId) ?? null;
    return { backlinks, outlinks, node };
  }, [focusId, graph.edges, graph.nodes]);

  const [expandedBacklinks, setExpandedBacklinks] = useState(false);
  const [expandedOutlinks, setExpandedOutlinks] = useState(false);

  // Reset expansion when focus changes.
  useEffect(() => {
    setExpandedBacklinks(false);
    setExpandedOutlinks(false);
  }, [focusId]);
```

### 7.2 Add `createPortal` import

Old (line 8):

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
```

New:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
```

### 7.3 Render HUD card

Inside the component's return JSX, before the closing `</div>` of the containerRef div, add:

```tsx
      {focusLinks && focusLinks.node && typeof document !== "undefined"
        ? createPortal(
            <div
              role="region"
              aria-live="polite"
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
            >
              <div className="mono-label" style={{ color: "var(--text-quaternary)", marginBottom: 8 }}>
                FOCUSED · {focusLinks.backlinks.length} backlinks · {focusLinks.outlinks.length} outlinks
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {focusLinks.node.title}
                  </div>
                  <div className="caption-large" style={{ color: "var(--text-quaternary)", marginTop: 2 }}>
                    {focusLinks.node.folder || "root"}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Open in sheet"
                  onClick={() => onOpen(focusLinks.node!.id)}
                  style={{
                    border: "1px solid var(--border-subtle)",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    borderRadius: 6,
                    padding: "4px 8px",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  ↗
                </button>
              </div>

              <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "10px 0" }} />

              {(["backlinks", "outlinks"] as const).map((kind) => {
                const list = kind === "backlinks" ? focusLinks.backlinks : focusLinks.outlinks;
                const expanded = kind === "backlinks" ? expandedBacklinks : expandedOutlinks;
                const setExpanded = kind === "backlinks" ? setExpandedBacklinks : setExpandedOutlinks;
                if (list.length === 0) return null;
                const shown = expanded ? list : list.slice(0, 4);
                return (
                  <div key={kind} style={{ marginBottom: kind === "backlinks" ? 10 : 0 }}>
                    <div className="mono-label" style={{ color: "var(--text-quaternary)", marginBottom: 4 }}>
                      {kind === "backlinks" ? "LINKED FROM" : "LINKS TO"}
                    </div>
                    {shown.map((id) => {
                      const basename = id.split("/").pop()?.replace(/\.md$/i, "") ?? id;
                      return (
                        <button
                          key={id}
                          type="button"
                          className="app-row"
                          aria-label={`Focus on ${basename}`}
                          onClick={() => {
                            // Chain-focus — approximate click coords from card center.
                            const rect = containerRef.current?.getBoundingClientRect();
                            const cx = rect ? rect.width / 2 : 0;
                            const cy = rect ? rect.height / 2 : 0;
                            enterFocus(id, cx, cy);
                          }}
                          onDoubleClick={() => onOpen(id)}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            border: "none",
                            background: "transparent",
                            color: "var(--text-secondary)",
                            padding: "4px 6px",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontSize: 13,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          · {basename}
                        </button>
                      );
                    })}
                    {list.length > 4 && !expanded ? (
                      <button
                        type="button"
                        onClick={() => setExpanded(true)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "var(--text-quaternary)",
                          cursor: "pointer",
                          padding: "2px 6px",
                          fontSize: 12,
                        }}
                      >
                        (+{list.length - 4} more ↓)
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
```

### 7.4 Inject the HUD entry animation keyframes once

Inside the component body, add a one-shot `useEffect` to install the stylesheet:

```ts
  useEffect(() => {
    if (typeof document === "undefined") return;
    const id = "graph-hud-keyframes";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes graph-hud-in {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }, []);
```

### 7.5 Verify

```bash
npx tsc --noEmit
```

Browser walk:

1. Click a node → HUD card appears top-right with title, folder, backlink list, outlink list.
2. Click a row → chain-focus to that node; HUD updates.
3. Click `↗` → sheet opens for the focused node's path.
4. Click `(+N more ↓)` → list expands in place.
5. Esc → HUD fades with focus exit.

### 7.6 Commit

```bash
git add src/components/browse/GraphCanvas.tsx
git commit -m "feat(graph): focus HUD card with chain-focus + open-sheet actions"
```

---

## Task 8 — Click ripple on focus enter/exit

**Goal:** Emit a single expanding circle at the click point when focus enters or exits (already wired into `enterFocus` / `exitFocus`; now render it).

### 8.1 Render ripple in `draw()` (screen-space, after `ctx.restore()`)

After `ctx.restore()` (line 477) and before the hover-label overlay block (line 480), insert:

```ts
    // Click ripple (screen-space).
    if (rippleRef.current && !reducedMotionRef.current) {
      const r = rippleRef.current;
      const t = (performance.now() - r.startedAt) / 500;
      if (t >= 1) {
        rippleRef.current = null;
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.arc(r.x, r.y, t * 400, 0, Math.PI * 2);
        ctx.strokeStyle = colAccent;
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    }
```

### 8.2 Verify

```bash
npx tsc --noEmit
```

Browser walk:

1. Click a node → brand-colored ring expands from click point over ~500ms.
2. Exit focus (click focused node or Esc-then-click) → ripple fires again.
3. Under reduced-motion — no ripple renders.

### 8.3 Commit

```bash
git add src/components/browse/GraphCanvas.tsx
git commit -m "feat(graph): click ripple on focus enter/exit"
```

---

## Task 9 — Reduced-motion wiring review + focus glide compression

**Goal:** Verify all four motion channels (breathing, comets, pulses, ripples) + the focus glide (100ms) respect `reducedMotionRef.current` and the matchMedia listener re-evaluates live.

### 9.1 Audit checklist — open `src/components/browse/GraphCanvas.tsx`, confirm every gate

- [ ] Breathing — `breatheAmp = reducedMotionRef.current ? 0 : …` present (Task 2.3).
- [ ] Comet seed — `useEffect` on hover has `if (reducedMotionRef.current) return;` (Task 5.1).
- [ ] Comet draw — outer `if (!reducedMotionRef.current && cometsRef.current.length > 0)` (Task 5.2).
- [ ] Hub pulse seed — `if (!pulseRef.current && !reduced)` (Task 4.1).
- [ ] Click ripple render — `if (rippleRef.current && !reducedMotionRef.current)` (Task 8.1).
- [ ] Focus glide duration — `reduced ? 100 : 400` (enter) and `reduced ? 100 : 300` (exit) in `enterFocus`/`exitFocus` (Task 6.3).

### 9.2 No code changes expected. If the audit finds a missing gate, add it inline, then:

```bash
npx tsc --noEmit
```

Browser walk:

1. Chrome DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`.
2. Reload — breathing static, hover produces no comets, no hub rings, no click ripple, focus enter/exit glide is effectively instant (100ms).
3. Disable emulation — all motion resumes on next frame (matchMedia listener active).

### 9.3 Commit

If any edits were needed, commit with:

```bash
git add src/components/browse/GraphCanvas.tsx
git commit -m "fix(graph): tighten reduced-motion gates across all motion channels"
```

If no edits needed, no commit (task reduces to verification).

---

## Final verification gate

Confirm all 14 spec-level acceptance items hold.

- [ ] 1. `npx tsc --noEmit` clean.
- [ ] 2. `npm run build` green.
- [ ] 3. `/browse/graph` renders with folder-tinted nodes + rings + breathing motion.
- [ ] 4. Single-click a node → 400ms camera glide, non-connected nodes fade to 5%, subgraph reflows into left/right fans, HUD card appears top-right with metadata + linked-from + links-to.
- [ ] 5. Click a row in the HUD → chain-focuses (new subgraph, new layout, smooth transition).
- [ ] 6. Click the selected node or press Esc → exit focus with 300ms glide; simulation resumes; HUD fades out.
- [ ] 7. Double-click any node → sheet opens at that path.
- [ ] 8. Hover a node → edges glow brand-color with comet trail; hover off → comets finish, glow fades.
- [ ] 9. Bottom-left legend dots: hover dims non-matching; click locks filter; click again unlocks.
- [ ] 10. Every ~12s, a hub emits a dual-ring folder-tinted pulse; no unison.
- [ ] 11. Click ripple fires on focus-enter and focus-exit.
- [ ] 12. Theme toggle (dark ↔ light) → folder tints swap; selected ring stays brand-color; HUD card stays readable.
- [ ] 13. Chrome DevTools → Rendering → Emulate `prefers-reduced-motion`: breathing static, comets off, pulses off, ripples off, focus glide compressed to 100ms. All interactions still work.
- [ ] 14. Switch to Structure mode and back → focus state resets cleanly, no leaked rAF, no stale HUD, canvas repaints from scratch.

If every item checks, push:

```bash
git push -u origin v19-graph-polish
```

Leave PR creation to the human operator.
