# Navigation & ⌘K palette overhaul — Design Spec

**Date:** 2026-04-19
**Status:** Approved for planning
**Scope:** Make ⌘K the single fast entry point for *everything* — open a recent file, jump to a pin, run a command, find an entity, jump to a heading inside the open file. No persistent file tree added; no second shortcut. One key, one panel, ranked results.

---

## Context

The existing ⌘K palette exposes ~8 navigation actions (Dashboard / Chat / Graph / System / Timeline / Open drawer / Toggle theme / Disconnect). It has no file search, no pins, no recent files. The user's complaint is accurate: it's "super limited."

The rest of the app has grown around it. The VaultDrawer handles folder browsing; pinned folders live in the sidebar; recent queries live in the sidebar. But nothing gives a keyboard-first "open that specific file" move. The user has to know the wiki-link text or click through drawer sections.

This spec fills that gap by making ⌘K the universal quick-switcher. Everything searchable in the vault becomes reachable from one key.

---

## Goals

1. Hit ⌘K, see recent files + pins + commands immediately. No typing required for the common case.
2. Type anything, get a merged ranked list across files, pins, entities, projects, and commands.
3. Prefix-scope with `>` (commands), `@` (entities / projects), `#` (headings in the currently-open file sheet).
4. `Enter` routes by result type — file opens the sheet, pin opens the scoped drawer, command runs, heading deep-links.
5. Zero behaviour change to anything outside the palette and a one-line hook on the detail sheet.

Non-goals: a persistent file tree, a second shortcut (⌘P), headings-across-the-whole-vault search, full-text content search.

---

## Architecture

### Data sources

| Source | Origin | Cached |
|---|---|---|
| **Vault index** — every `.md` file, basename, folder | new `GET /api/vault/index`, built from layout-probed dirs | server-side, 60s TTL per vault |
| **Entity + project index** | existing `getEntityIndex()` / `getProjectIndex()` | already cached in `vault-reader` |
| **Pins** | existing `GET /api/settings/sidebar` → `useSidebarPins` | hook-level, hydrated on mount |
| **Recent files** | new `useRecentFiles` hook, `localStorage["cipher-recent-files"]` | browser, capacity 20 |
| **Commands** | hard-coded list in `CommandPalette.tsx` | static |
| **Headings of the open sheet** | read from `sheet.path` → fetch `/api/file?path=...` already used by `DetailPage` — parse section headings from the response | per-sheet, on `#` prefix entry |

### New endpoint — `GET /api/vault/index`

Returns a typed payload the palette can match against without further reads:

```ts
interface VaultIndex {
  files: { path: string; name: string; folder: string }[];
  entities: { path: string; name: string }[];
  projects: { path: string; name: string }[];
  hubs: { path: string; name: string }[];
}
```

Implementation: walk `getVaultLayout()` dirs (same pattern as `vault-health.ts`), cache per-vault for 60s. Heavy the first call (~50ms on a 250-file vault), trivial thereafter. Cleared by `setVaultPath`.

### New hook — `src/lib/hooks/useVaultIndex.ts`

```ts
export function useVaultIndex(): { index: VaultIndex | null; loading: boolean };
```

Fetches `/api/vault/index` on mount. Module-level memoisation so reopening the palette doesn't refetch. Revalidates on vault change.

### New hook — `src/lib/hooks/useRecentFiles.ts`

```ts
export function useRecentFiles(): {
  recents: string[];               // paths, most-recent first, capacity 20
  push(path: string): void;        // move-to-front; dedupes
  remove(path: string): void;
  clear(): void;
};
```

Persisted to `localStorage["cipher-recent-files"]`. No server round-trip.

### New utility — `src/lib/fuzzy.ts`

Extracts the existing `fuzzyScore` from `CommandPalette.tsx` (lines ~24–50). Shared between the palette and any future consumer. Returns a numeric score ≥ 0 (0 = no match).

---

## UI

### Empty state (query === "")

Three labeled, always-in-this-order groups, each capped:

```
RECENT · 5
  Sidebar.tsx                                      components ·  2m ago
  today.md                                         wiki/work  ·  1h ago
  alice.md                                         entities   ·  3h ago
  april.md                                         work/log   ·  1d ago
  llm-agents/deep-dive.md                          research   ·  2d ago

PINNED · N
  Research                                         wiki/knowledge/research
  Projects                                         wiki/projects

COMMANDS
  Dashboard                                        → /browse
  Chat                                             → /chat
  Graph                                            → /browse/graph
  System                                           → /browse/system
  Timeline                                         → /browse/timeline
  Toggle theme
  Disconnect vault
```

- Section labels: `mono-label`, `text-quaternary`, count right-aligned for the data sections.
- Rows: `.app-row` shape, 40px (`--row-h-cozy`).
- Keyboard traverses the full merged list. No skip-between-sections logic.

### Typed state (query.length > 0)

Groups dissolve into a single flat ranked list. Same row shape as empty state; each row rendered with an icon marker that indicates its type.

| Type | Marker | Label | Secondary | Action on `Enter` |
|---|---|---|---|---|
| File | `🗎` (doc glyph) | basename (strip `.md`) | folder path, mono quaternary | `sheet.open(path)` |
| Pin | `▲` (or PinIcon for the pin) | label | full folder path | `setDrawerScopedPath(path)` + open drawer |
| Entity | `∘` | entity name | `entity`, mono quaternary | `sheet.open(entity.path)` |
| Project | `◇` | project name | `project`, mono quaternary | `sheet.open(project.path)` |
| Command | `→` | command label | kbd hint if any | `command.run()` |
| Heading | `#` | heading text | file basename | `sheet.open(file, slug)` |

Results capped at 50.

If nothing matches: one fallback row `Ask chat: "<query>"` that routes to `/chat?q=<encoded>` on Enter.

### Prefix handling

Detected by `query[0]`. Prefix character itself is stripped before matching:

| Prefix | Scope |
|---|---|
| *(none)* | files + pins + entities + projects + commands |
| `>` | commands only |
| `@` | entities + projects only |
| `#` | headings of the currently-open file sheet (via `useSheet().path`). If no sheet is open, show one informational row: `Open a file first to jump to headings`. |

`Tab` cycles through prefixes. `Backspace` at cursor-position 0 clears the prefix.

### Ranking

```
score =   4 × exact-prefix-match
        + 2 × word-boundary-match
        + 1 × fuzzy-substring-hits
        + recency-bonus     (+3 if opened in last 24h)
        + frequency-bonus   (+2 if opened ≥3 times in last 7 days)
```

Recency + frequency come from `useRecentFiles.recents` + a lightweight histogram kept alongside it (path → count map, decayed weekly).

### Keyboard map

| Key | Action |
|---|---|
| `↑` / `k` | Move selection up |
| `↓` / `j` | Move selection down |
| `↵` | Activate selected |
| `⌘↵` | Open in new tab — for files/entities/projects, routes to `/file/<path>` full-route view |
| `Esc` | Close palette |
| `Tab` | Cycle prefix (none → `>` → `@` → `#` → none) |
| Backspace at position 0 when prefix active | Clear prefix |

### Recording "recent"

`DetailPage.tsx` gains one line at the top of its load effect:

```tsx
useEffect(() => { recentFiles.push(path); }, [path]);
```

No other site records recents — the sheet is the one place a file is actually "opened."

---

## Critical files

**New:**

- `src/app/api/vault/index/route.ts`
- `src/lib/hooks/useVaultIndex.ts`
- `src/lib/hooks/useRecentFiles.ts`
- `src/lib/fuzzy.ts`

**Modified:**

- `src/components/CommandPalette.tsx` — body rewritten to consume the three hooks + recent-files store, render empty-state groups + typed flat list, wire prefix detection. Shell (`<AnimatePresence>` + backdrop + panel) unchanged.
- `src/components/DetailPage.tsx` — one-line `recentFiles.push(path)` effect.
- `src/app/api/vault/route.ts` — no change (existing endpoint is fine; the new index is a sibling).

**Reuse (do NOT reimplement):**

- `useSheet` — file open routing.
- `useSidebarPins` — pins list.
- `useVault` — vault state / path.
- `getVaultLayout` — layout-probed dirs the walk uses.
- `getEntityIndex`, `getProjectIndex`, `getHubFiles` — already vault-agnostic, already cached.
- `.app-row` / `.focus-ring` / `mono-label` / all tokens — existing design system.
- `var(--radius-panel)`, `var(--shadow-dialog)`, `var(--row-h-cozy)` — existing tokens.

---

## Verification

1. `npx tsc --noEmit` clean.
2. `npm run build` green.
3. `curl http://localhost:3000/api/vault/index` returns 200 + populated `files`, `entities`, `projects`, `hubs` arrays.
4. Hit ⌘K with a populated vault: recent-empty-state is empty (no files opened yet); pins + commands visible.
5. Open a file via sidebar or drawer, close palette, reopen — file appears at top of `RECENT`.
6. Type `sid` — files/pins/etc. merged and ranked. `>theme` shows only the toggle-theme command. `@alice` shows the alice entity. Open a file sheet, hit ⌘K, type `#` — heading list for that file.
7. `Enter` on each result type routes correctly.
8. Fallback row appears for nonsense queries like `xqzjk` and routes to `/chat?q=xqzjk`.
9. Vault swap (via palette "Disconnect vault" → reconnect to sample vault) — index refreshes.
10. Theme toggle works; palette renders correctly in light mode.

---

## Non-goals (keeping scope tight)

- No persistent file tree.
- No ⌘P second shortcut.
- No vault-wide heading index (too heavy for first cut; current-file only).
- No full-text content search (filenames + headings of open sheet only).
- No keyboard macros / custom prefix definition.
- No "favorites" / starred beyond the existing sidebar pins.
- No recent-queries integration inside ⌘K (they stay in the sidebar where they already live).

---

## One-sentence summary

Make ⌘K the single fast entry point for the whole vault: recent + pinned + commands in the empty state, merged-ranked files + pins + entities + projects + commands when typing, `>` / `@` / `#` prefixes to scope, backed by one new cached `/api/vault/index` endpoint and a tiny recent-files hook.
