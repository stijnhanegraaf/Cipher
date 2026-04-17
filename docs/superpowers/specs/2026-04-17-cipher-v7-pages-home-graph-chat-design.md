# Cipher v7 — Pages, Home, Graph, Chat, Sidebar

**Date:** 2026-04-17
**Status:** Design approved, ready for implementation plan.

## Context

v6 shipped the Triage Inbox dashboard, `/browse` and `/chat` routes, a hand-rolled Graph View, and Linear-inspired polish. Living with it surfaced five interconnected pain points:

1. **Home is too much.** Triage mixes tasks, mentions, activity, and highlights into one long list. The user wants a focused "today" todo experience — fewer row kinds, actual checkbox interaction.
2. **Graph lacks visual soul.** Function works; aesthetic is a grayscale blob of dots. Needs "next-level POW POW" craft.
3. **Chat empty state is a list.** `/chat` with no messages still renders dashboard-style content. Should be inviting and minimal.
4. **Non-chat pages still act like chat.** Every structured view (System, Entity, Topic, Timeline, Search) renders through the same ViewRenderer card — with confidence metas, "Tell me more" quick-reply pills, sources disclosure. These are proper pages, not chat responses.
5. **Sidebar isn't doing its job.** ⌘K and Browse buttons live in the main top bar; user wants them in the sidebar header next to the Cipher mark so the top bar becomes pure structure.

This spec addresses all five as a single coordinated redesign — they share architecture, and landing them together is what makes the app finally feel Linear-native rather than "chat with decorations."

## Decisions locked

Via brainstorming Q&A:

- **Home shape:** Today + Up next (two sections).
- **Check-off behavior:** Optimistic + immediate file write + fade out after 2s, undo toast.
- **Chat empty state:** Pure centered input, Raycast-style. No chips, no lists.
- **Pages vs chat:** Bespoke page components per view type — no shared chat chrome.
- **Detail pages:** Route + sheet hybrid. `/file/[...path]` is a full route; sheet remains for peek.
- **Graph aesthetic:** Constellation — cosmic dark, bloom on hubs, whisper rays.
- **Chat responses for pageable intents:** 2–3 line summary + "Open {label} →" CTA. No inline cards.
- **Sidebar header:** Cipher mark left, ⌘K + Browse icon buttons flush right on a 48px header row.

## Route architecture

```
/                         → redirect → /browse
/browse                   → TodayPage (was TriageInbox)
/browse/graph             → GraphPage (Constellation)
/browse/system            → SystemPage
/browse/timeline          → TimelinePage
/browse/search            → SearchPage (?q= reads query)
/browse/entity/[name]     → EntityPage
/browse/topic/[name]      → TopicPage
/file/[...path]           → FileFullPage (full-route file view)
/chat                     → ChatSurface (empty state if no messages)
/chat?q=<encoded>         → Auto-fire query on mount
```

**Sheet overlay coexists with routes.** Any route can render a detail sheet by setting `?sheet=<path>` on its URL. Clicking a row or wiki-link sets the param; closing the sheet removes it. Browser back closes the sheet first, then navigates routes. ⌘-click or explicit "Open full" from the sheet navigates to `/file/[...path]`.

## PageShell (shared frame for every non-chat page)

One component, reused across Today / System / Timeline / Search / Entity / Topic / FileFull.

**Anatomy (top to bottom):**
- **Page header** — sticky, 72px: `[icon] Title` at heading-2 (24px, -0.4 tracking) + single-line subtitle at caption-large tertiary. Right side holds 1–3 icon buttons (filter, open-in-obsidian, more overflow).
- **Optional toolbar** — 40px: filter chips on left, right-aligned item count.
- **Body slot** — edge-to-edge, scrollable, `.app-row` used for every list row. Sectioned content uses `mono-label` headers with 1px `var(--border-subtle)` rule beneath.

**Props:**
```ts
interface PageShellProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  actions?: React.ReactNode;    // right side of header
  toolbar?: React.ReactNode;    // optional 40px strip
  children: React.ReactNode;    // body
}
```

**Rules:**
- No freshness pill, no confidence meta, no sources disclosure, no reply pills.
- Body scrolls; header + toolbar stay fixed at top.
- Same shell renders in dark and light mode via CSS vars.

File: `src/components/PageShell.tsx` (≈80 lines).

## TodayPage (`/browse`)

Replaces current TriageInbox entirely.

### Layout
```
[sun] Today                                  [sort] [filter]
Tuesday, March 12 · 4 open · 2 blocked
────────────────────────────────────────────────────────────

TODAY                                                      4
 ☐ ▉ Fix billing auth           projects/tebi-pos    2h ago
 ☐ ▉ Review migration plan  BLK work/open            4h ago
 ☐ ▇ Design review with team    work/meetings        1d ago
 ☐ ▅ Audit merchant flow        tebi-merchant        1d ago

UP NEXT                                                    5
 ☐ ▅ Wire up /api/resolve tele… work/open            3d ago
 ☐   Investigate POS latency    tebi-pos             1w ago
 ☐ ▇ Write design for graph     graph-spec           1w ago
 ☐   Reply to Atlas on Q2       entities/atlas       2w ago
 ☐   Archive stale research     research/            2w ago

                                                 Show more (3)
```

### "Today" bucket criteria
Task is in Today if any of:
- Priority = `high` or `urgent`
- Text contains `@today` tag (case-insensitive)
- Sourced from a file named `today.md`, `open.md`, or `now.md` (inside any folder, matched case-insensitively) where the file's mtime ≤ 24 hours ago
- Status = `blocked` (always surfaces; waiting is itself the action)

If `today-builder` can't find any matching source files, it returns an empty `today[]` array gracefully — no error, just an empty state.

### "Up next" bucket
Everything else open (not in Today, not done). Sorted: priority high→low, then mtime desc. Capped at 8. Overflow hidden behind a `Show more (N)` disclosure — clicking expands inline, no navigation.

### Row anatomy (40px, uniform)
```
☐  ▉  Fix billing auth           projects/tebi-pos  2h    [↗] [💬]
│  │  └ 13px primary, truncate   │ mono 11 quaternary     │ hover actions
│  └ priority glyph (4-bar SVG)
└ 14px checkbox, hoverable
```
- Row click → open sheet (`?sheet=<path>`) on source file.
- Checkbox click → `stopPropagation`, run toggle.
- Hover actions right-aligned: **Open full** (`↗`) routes to `/file/[...path]`; **Ask about** (`💬`) runs `handleSubmit("tell me about <task text>")` in chat.

### Check-off behavior
1. Click → instant strikethrough + priority bar fades + checkbox fills to `var(--accent-brand)`.
2. Fire `POST /api/toggle` optimistically in background.
3. After 2s, row fades out with 180ms opacity transition and the list reflows (CSS `will-change: opacity` for smoothness).
4. Bottom-left: Undo toast appears for 6s. Click = re-open task, revert file write via inverse toggle.
5. API failure → flip back, toast text: "Couldn't save — reverted."

### No more (removed from old Triage)
No Mentions section. No Activity rows. No Highlights rows. Ruthless.
Mentions → future `/browse/mentions` page.
Activity → `/browse/timeline`.
Highlights → optional block on EntityPage / TopicPage only.

### Data
New `src/lib/today-builder.ts`: reads every `.md` from `workDir` (if layout has one) + any `*/open.md` / `*/today.md` via vault walk. Extracts open checkboxes. Applies bucket criteria. Returns `{ today: TodayTask[]; upNext: TodayTask[]; counts }`.

New endpoint: `GET /api/today` → returns the payload.

**Deprecation note:** `/api/triage` and `triage-builder.ts` either removed or kept as fallback for any remaining callers. TodayPage does not use them.

## ChatEmptyState (`/chat` with no messages)

Pure input centered at ~45% viewport height.

```
                        ◆ Cipher mark (40×40, brand bg)

                        Ask about your vault
                        (heading-3, tertiary, 1 line)

         ┌─────────────────────────────────────────┐
         │   ▌                             ⌘↵      │  ← 520px × 44px
         └─────────────────────────────────────────┘
```

**Rules:**
- Stack vertically centered, container 520px wide.
- Cipher logomark at 40×40 (not 18 like sidebar — this is the hero).
- One line: `heading-3 var(--text-tertiary)`, "Ask about your vault". No subtitle.
- Input 44px tall, single border `var(--border-standard)`, brightens to `var(--accent-brand)` on focus.
- `⌘↵ to send` hint inside the input on the right, `mono-label` quaternary.
- **Nothing else** on the page. No top bar content (top bar is empty), no recent, no chips, no tasks.
- Auto-focus input on mount. No entrance animation.
- On submit: input animates to the bottom in 180ms (existing transition), messages stack above.

File: `src/components/ChatEmptyState.tsx`. Rendered by `ChatInterface` when `view="chat"` AND `messages.length === 0` AND `vault.connected`.

## Sidebar header redesign

### New 48px top row in Sidebar
```
┌──────────────────────────────────────┐
│ ◆ Cipher              ⌘K   ▦         │  ← 48px
│ ────────────────────────────────────  │
│ ● Obsidian                            │  ← vault chip, 32px
```

- **Left:** Cipher mark (18×18, brand-filled) + wordmark "Cipher" at 13px/510 primary.
- **Right:** Two 28×28 icon buttons flush with sidebar right edge:
  - `⌘K` — opens command palette. Visual: `Kbd` component inside a 28px square.
  - `▦` (grid icon) — opens VaultDrawer. Label tooltip "Browse vault" on hover via HoverCard.
- Spacing: 2px gap between the two right buttons. Micro divider line optional, skip.

### Top bar change
The main app top bar (above chat/page content, 48px) becomes **empty** on `/browse` and `/chat` — just the 1px bottom rule for visual separation.
Breadcrumbs still render there when deep (file route, entity page, topic page). See Breadcrumbs section under each page type.

### Mobile fallback (<1024px)
When sidebar is hidden behind hamburger, `⌘K` and `▦` surface in the top bar's right-aligned slot — same two icons, just relocated. Preserves access at all widths.

## View-type page components

Each page reuses `PageShell`. Data sources reuse existing view-builder functions (no new parsers needed).

### SystemPage (`/browse/system`)
```
[⚡] System status                                        [⟳]
Last checked 2m ago · 3 healthy · 1 needs attention
────────────────────────────────────────────────────────────

CHECKS                                                     4
 ● holiday                                 Healthy  2m ago
 ● trip monitoring                         Healthy  2m ago
 ● Current board status                    Healthy  5m ago
 ● Work maintenance                        Warning  1h ago

NEEDS ATTENTION                                            1
┃ Keep runtime behavior, cron behavior, and docs
┃ aligned. Keep reducing drift between current-state
┃ notes and actual runtime truth.
                                    Open System Status →
```
- Check rows: 40px `.app-row`. Status dot left, label, status pill, freshness right, no cards.
- "Needs attention" as a single quoted block (`borderLeft: 2px var(--status-warning)`), click → opens source file.
- Header action `⟳` refreshes the data (POST to `/api/system` to rebuild).
- Data: reuse `buildSystemStatus()` from view-builder; render bespoke.

File: `src/components/browse/SystemPage.tsx`.

### EntityPage (`/browse/entity/[name]`)
```
[📇] Atlas                                          [⋯] [↗]
A React-based analytics dashboard. Ongoing project…
────────────────────────────────────────────────────────────

SUMMARY
Multi-paragraph markdown content from the entity file.
Wiki-links navigate in-place via ?sheet=<path>.

RELATED                                                   12
├ Postgres migration decisions         decisions
├ Atlas team standups                  journal
├ Q2 roadmap                           projects

RECENT ACTIVITY                                            5
• 2h   Edited: Atlas team standup notes
• 1d   New: Q2 planning doc
• 3d   Linked from research/ethics.md
```
- Header actions: `⋯` (overflow: "Copy link", "Delete entity"), `↗` (open in Obsidian).
- `SUMMARY` renders via existing MarkdownRenderer (with `onNavigate` wired).
- `RELATED` = `LinkList` rows (no cards). Icon = kind (entity/project/journal/research).
- `RECENT ACTIVITY` = mtime-sorted file edits referencing this entity (reuse activity code from triage-builder).

File: `src/components/browse/EntityPage.tsx`.

### TopicPage (`/browse/topic/[name]`)
```
[📋] Q2 roadmap                                     [⋯] [↗]
The Q2 planning for Atlas and related projects…
────────────────────────────────────────────────────────────

CURRENT STATE
┃ All three workstreams green; migration cutover scheduled
┃ for April 14.

OPEN QUESTIONS                                             3
? Do we need a rollback for the payment ledger change?
? Who owns the Atlas deprecation path?
? Does the new pricing page block Q2 GA?

NEXT STEPS                                                 4
1. Confirm migration window with ops (owner: Atlas)
2. Final pricing review with legal
3. …

RELATED NOTES                                              8
├ decisions/ledger-migration.md
├ …
```
- Sections mirror current TopicOverviewView but rendered inside PageShell with row-based layout instead of card callouts.
- Open-question rows: `?` icon left, text middle, clickable if source anchor known.
- Next-step rows: numbered, text, optional "Mark done" inline if parseable as a checkbox.

File: `src/components/browse/TopicPage.tsx`.

### TimelinePage (`/browse/timeline`)
```
[🕐] Timeline                            [range: this month ▾]
────────────────────────────────────────────────────────────

THIS WEEK                                                  8
▸ 12 Mar  Atlas Q2 plan approved                           
▸ 11 Mar  Migration rehearsal                3 notes
▸ 09 Mar  New entity: Marketplace v2          entities/

LAST WEEK                                                 14
▸ 05 Mar  …
```
- Grouped by week. Section headers are `mono-label` date ranges.
- Rows: date-gutter left (mono 11, quaternary), label primary, right-aligned badge count.
- Header toolbar: range picker (This week / This month / This quarter / All). Client-side filter.

File: `src/components/browse/TimelinePage.tsx`.

### SearchPage (`/browse/search`)
```
[🔎] Results for "atlas"                            15 found
────────────────────────────────────────────────────────────

NOTES                                                      8
├ Atlas Q2 roadmap                        projects/
├ Atlas team standup notes                journal/
├ …

ENTITIES                                                   3
├ Atlas                                   entities/
├ …

PROJECTS                                                   4
├ …
```
- `?q=` query string drives search via existing `searchVault()`.
- Grouped by kind (Notes / Entities / Projects / Research).
- Rows: kind icon + label + path. Click → sheet or full route.
- Header toolbar: empty for now, future filter chips.

File: `src/components/browse/SearchPage.tsx`.

### FileFullPage (`/file/[...path]`)
Full-route file view. Wraps the existing DetailPage body in a PageShell-based layout.
- Header: breadcrumb Home / section / filename + title of file + open-in-Obsidian action.
- Body: max-width 880px centered, MarkdownRenderer, optional right-side TOC at ≥1280px (existing `sections` from ParsedFile).
- No backdrop, no slide animation — this is a page, not a sheet.
- Browser back/forward navigates route history.
- Reuses existing MarkdownRenderer, formatFreshness, etc.

File: `src/components/browse/FileFullPage.tsx` (wraps most of existing DetailPage content).

## Chat changes

### Empty state
`ChatInterface` when `view === "chat"` AND `messages.length === 0` AND `vault.connected` renders `<ChatEmptyState />` instead of the current welcome.

### In-chat view-type responses (Q7 answer A)
When a chat response intent is one of the pageable types (`entity_overview`, `topic_overview`, `system_status`, `timeline_synthesis`, `search_results`), the AI message renders as:

```
[AI avatar]  A short 2–3 line summary of what you'd see on
             the Atlas page. Touches the top facts only.

             [ ↗  Open Atlas ]
```

- The "Open {label} →" button routes to the matching page via `router.push()`.
- No card border, no confidence meta, no sources disclosure, no "Tell me more / Show related" pills.
- ViewRenderer is only used for view types that genuinely have no dedicated page (currently: none under this design — all five listed types now have pages).
- ViewRenderer can be deleted or marked deprecated once migration complete.

### ViewRenderer trim
Before deletion, short-term: ViewRenderer gets a `variant: "chat-summary"` prop that renders just the summary-paragraph + Open button version above. Old full card layout kept only behind `variant: "card"` and not used in any codepath — staged for removal.

### QUICK_REPLIES
Gutted. Delete the const. Pills stop appearing.

## Graph Constellation (`/browse/graph`)

Palette, physics tuning, and motion all redesigned. Functionally the same GraphCanvas as v6, restyled.

### Palette (dark mode)
```css
bg:           radial-gradient(ellipse at center, #0b0e18 0%, #05060a 70%);
nebula:       two soft radial washes at 15% and 12% alpha, indigo + cyan-blue;
star:         #a8b2d1 @ 0.85 alpha;
star-bright:  #ffffff with drop-shadow blur 4px at 0.9 alpha (soft bloom);
star-hub:     #ffffff with drop-shadow blur 8px at 0.9 alpha (larger bloom);
ray:          rgba(180,200,255,0.18), 0.4px stroke;
ray-hover:    rgba(200,220,255,0.7), 0.6px stroke;
selection:    white core + indigo glow ring at 0.5 alpha.
```

### Palette (light mode)
```css
bg:           radial-gradient(ellipse at center, #fafaf5 0%, #f0f0ea 70%);
nebula:       two radial washes at 12% alpha, indigo + sky-blue;
star:         #4a5166 @ 0.85 alpha;
star-bright:  #23252a with drop-shadow blur 4px at rgba(94,106,210,0.35);
star-hub:     var(--accent-brand) with drop-shadow blur 8px at rgba(94,106,210,0.5);
ray:          rgba(94,106,210,0.20), 0.4px stroke;
ray-hover:    rgba(94,106,210,0.7), 0.6px stroke;
selection:    var(--accent-brand) core + indigo halo at 0.6 alpha.
```
Chosen to keep the "sky at dusk" feel in light mode — not a pure grayscale inversion.

### Physics tweaks
- Node size: `1.5 + Math.sqrt(backlinks) * 0.8`, clamp 1.5–6px (smaller than v6).
- Repulsion constant: 1200 → **900**.
- Edge target distance: 50 → **70**.
- Damping: 0.85 → **0.88**.
- Hub detection: nodes with ≥8 backlinks get `star-hub` class; 3–7 backlinks get `star-bright`; rest plain `star`.

### Motion
- **Mount (inhale)**: nodes start at scale 0.5, opacity 0. Animate to natural positions over 300ms ease-out. Edges fade in 200ms later (delayed opacity 0→1 over 180ms). One cinematic beat, no per-node stagger.
- **Idle pulse**: every 4s, pick a random bright/hub star. 600ms pulse (opacity 0.8→1→0.8). Only 1 active at any time. Adds liveness without motion sickness.
- **Hover**: 120ms color + brightness transition on hovered node's rays (to ray-hover). Label floats in `var(--bg-tooltip)` at mouse.
- **Double-click focus**: all other nodes fade to 0.1 alpha over 200ms. Active node + 1-hop neighbors stay at full. Esc exits focus.
- **`f` fit**: 400ms animated fit (not instant snap).
- **`space` recenter**: 300ms animated re-center to mount position.

### Interactions (keep + enhance)
- Drag background → pan. Cursor becomes `grabbing`.
- Wheel → zoom-to-cursor, 0.3× to 4×, smoothed.
- Click node → open sheet `?sheet=<path>`. ⌘-click → full route `/file/[...path]`.
- Double-click node → focus mode.
- Arrow keys → pan 40px.
- `/` → focus search in filter panel.
- Escape → exit focus / clear selection.

### Filter panel (unchanged structure, add one button)
- Search input top.
- Folders as checkboxes with live counts.
- Orphans toggle.
- **New:** "Focus selected" button at bottom — pins currently-selected node into focus mode.
- Stats footer.

### Minimap — deferred to v7.5

## Implementation scaffolding

### New files
```
src/components/AppShell.tsx              — sidebar + palette + vault drawer wrapper
src/components/PageShell.tsx             — per-page header/toolbar/body frame
src/components/ChatEmptyState.tsx
src/components/browse/TodayPage.tsx
src/components/browse/GraphPage.tsx      — wraps GraphCanvas + GraphFilters (was inline)
src/components/browse/SystemPage.tsx
src/components/browse/TimelinePage.tsx
src/components/browse/SearchPage.tsx
src/components/browse/EntityPage.tsx
src/components/browse/TopicPage.tsx
src/components/browse/FileFullPage.tsx
src/lib/hooks/useSheet.ts                — { open, close, path } around ?sheet=

src/app/browse/system/page.tsx
src/app/browse/timeline/page.tsx
src/app/browse/search/page.tsx
src/app/browse/entity/[name]/page.tsx
src/app/browse/topic/[name]/page.tsx
src/app/file/[...path]/page.tsx

src/lib/today-builder.ts
src/app/api/today/route.ts
```

### Modified files
```
src/app/browse/page.tsx          — renders <TodayPage/> directly (no ChatInterface)
src/app/browse/graph/page.tsx    — renders <GraphPage/> directly (no ChatInterface)
src/app/chat/page.tsx            — renders <ChatInterface view="chat" /> only
src/components/ChatInterface.tsx — empty state uses <ChatEmptyState/>; remove view="triage" and view="graph" branches; trim ViewRenderer variant
src/components/Sidebar.tsx       — 48px header row with ⌘K + Browse icon buttons
src/components/browse/GraphCanvas.tsx — Constellation palette + inhale motion + idle pulse
src/components/views/ViewRenderer.tsx — variant: "chat-summary" only; Open-page CTA; retire card variant
```

**Shell sharing note:** Once `/browse/*` routes render their own pages directly (not through ChatInterface), both `/browse` and `/chat` need to share the sidebar + common overlays (CommandPalette, VaultDrawer). A lightweight `<AppShell>` wrapper is introduced in step 1 — see Sequencing. ChatInterface keeps its chat-specific state; AppShell owns sidebar + overlays and wraps every route's children.

### Deprecated (scheduled for removal after migration)
- `src/lib/triage-builder.ts`
- `src/app/api/triage/route.ts`
- `src/components/browse/TriageInbox.tsx`, `TriageRow.tsx`, `TriageFilterBar.tsx` — delete.
- `src/components/browse/PriorityGlyph.tsx` — **keep as-is**; it's already a shared primitive at this path. TodayPage imports it directly.
- `ChatInterface.tsx`: remove `TriageInbox` import, remove `view="triage"` branch from render, remove `QUICK_REPLIES` const.
- `view="triage"` prop value removed from ChatInterface; `/browse/page.tsx` renders `<TodayPage/>` directly, not `<ChatInterface view="triage"/>`.

### Routing + state rules
- **Sheet overlay via URL**: `?sheet=<path>` param on any route. Read with `useSearchParams()`. Every page accepts this; the existing DetailPage mounts as an overlay when present.
- **Closing the sheet**: `router.replace()` removing the `sheet` param. Browser back also closes first-stack sheet before route change.
- **"Open full" from sheet**: `router.push("/file/" + path)` — navigates to full route, unmounts sheet.
- **Navigation helpers**: a small `useSheet()` hook exposing `{ open, close, path }` for consumers.

## Existing utilities to reuse (do NOT recreate)

- `app-row`, `filter-chip`, `focus-ring` CSS utilities (globals.css).
- Motion tokens `--motion-hover`, `--motion-enter`, `--motion-sheet`.
- Row-height tokens `--row-h-dense`, `--row-h-default`, `--row-h-inline`.
- Status vars `--status-open/in-progress/done/blocked/warning`.
- `StatusDot`, `Avatar`, `Kbd`, `HoverCard`, `Breadcrumbs`, `Badge`, `MarkdownRenderer`.
- `vault-reader.ts`: `getVaultLayout`, `getVaultPath`, `resolveLink`, `parseCheckboxes`, `extractLinks`, `readVaultFile`.
- `view-builder.ts`: `buildSystemStatus`, `buildEntityOverview`, `buildTopicOverview`, `buildTimelineSynthesis`, `buildSearchResults` — page components call these for data.
- `useListNavigation` hook — apply to each page's primary list.
- `useVault`, `useUser` hooks.
- `navStackRef` in ChatInterface — extend to push/pop sheet param via `history.pushState`.

## Verification

### Routing
1. `/` redirects to `/browse`.
2. `/browse` renders TodayPage (not ChatInterface).
3. `/browse/system`, `/browse/timeline`, `/browse/entity/[name]`, `/browse/topic/[name]`, `/browse/search?q=X` all render as pages with PageShell.
4. `/file/foo/bar.md` renders as full-route file page.
5. Sidebar active-state matches current route.
6. `?sheet=<path>` on any route opens sheet; removing param closes it.

### Today
1. Open a vault with mixed tasks; TodayPage renders Today + Up next sections correctly.
2. Checking a task: strikethrough instant, `/api/toggle` fires, row fades after 2s, Undo toast appears.
3. Clicking Undo restores the task to the file and back on the page.
4. `Show more (N)` in Up next expands inline without navigation.
5. Priority glyph renders correctly for all 4 levels.

### Chat empty
1. Navigate to `/chat` with no messages → see centered logomark + "Ask about your vault" + input. Nothing else.
2. Submit a query → input animates to the bottom, messages render above.
3. No recent queries, no chips, no task preview appear.

### Pages vs chat
1. In `/chat`, ask "tell me about Atlas" → AI reply is 2–3 line summary + "Open Atlas →" button.
2. Click the button → routes to `/browse/entity/atlas` with full EntityPage layout.
3. No quick-reply pills, no confidence meta, no sources disclosure anywhere on the page.

### Graph
1. `/browse/graph` renders with cosmic dark bg, nebula mist, bloom on hubs.
2. Mount plays 300ms inhale animation.
3. Idle pulse fires on random bright stars every ~4s.
4. Hover a node → edges brighten, label appears.
5. Double-click → 1-hop focus mode; Esc exits.
6. ⌘-click → full route `/file/...`.

### Sidebar + top bar
1. Sidebar header shows Cipher mark + ⌘K + Browse icon buttons in a 48px row.
2. Top bar is empty on `/browse` and `/chat` (breadcrumb still shows on deep pages).
3. ⌘K opens palette, Browse opens vault drawer.
4. At <1024px, sidebar hides and both icons surface in the top bar.

### Build + type
`pnpm build` succeeds, `tsc --noEmit` clean, Lighthouse a11y ≥ 95 in both themes.

## Sequencing within the single PR

Eight-step landing order, estimated 5–6 working days:
1. `AppShell` wrapper around every route's children (extract sidebar + palette + vault drawer + sheet-param wiring). No visible change.
2. `PageShell` + routing scaffold + `useSheet` hook + `FileFullPage` at `/file/[...path]`.
3. `TodayPage` + `today-builder.ts` + `/api/today` + check-off behavior. Route `/browse/page.tsx` now renders `<TodayPage/>` directly. Deprecate triage endpoints in this step.
4. `SystemPage`, `TimelinePage`, `SearchPage` (structurally simpler).
5. `EntityPage`, `TopicPage` (more fields, richer).
6. `ChatEmptyState`; ViewRenderer trimmed to chat-summary variant; "Open page" CTA routing.
7. Sidebar header redesign + top-bar cleanup + mobile fallback.
8. Graph Constellation palette + inhale/idle-pulse motion + GraphPage extraction (`GraphCanvas + GraphFilters` moves out of `ChatInterface view="graph"` branch).

## Open follow-ups (out of scope for v7)

- Minimap on graph (v7.5).
- Dedicated `/browse/mentions` page (deferred).
- Keyboard j/k navigation on every page's list (can land in a polish pass).
- Proper right-side TOC on FileFullPage at ≥1280px (nice-to-have).
- Delete / kill old triage + ViewRenderer card variant entirely (after v7 lands and stabilizes).

## One-sentence summary

Cipher v7 splits the app into proper Linear-quality pages — a focused Today dashboard with real checkbox interaction, bespoke page components for every structured view type, a Constellation graph with cosmic polish, a Raycast-minimal chat empty state, and a sidebar header that finally owns the shell — so structured surfaces stop masquerading as chat responses.
