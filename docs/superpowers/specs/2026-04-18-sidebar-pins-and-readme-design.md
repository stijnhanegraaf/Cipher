# Custom Pinned Sidebar + Open-Source README — Design Spec

**Date:** 2026-04-18
**Status:** Approved for planning
**Scope:** Two coordinated sub-projects shipped in one coordinated PR — a user-customisable "Pinned" group in the sidebar, and an open-source-grade README with supporting repo-root assets.

---

## Goal

1. **Custom Pinned Sidebar** — let every user customise the left rail with their own folder shortcuts. Pins live in the vault (portable across machines) and drive the existing VaultDrawer (scoped to the chosen folder on click). No vault-specific hardcoding; works on any Obsidian vault layout the `getVaultLayout()` probe recognises.
2. **Open-source README + LICENSE + CONTRIBUTING** — make the repo welcoming and self-serving: someone lands on it, understands what it is in 30 seconds, and has it running locally in 5 minutes.

Both sub-projects land in one PR because the README describes the custom-sidebar feature as a selling point. Implementation is sequenced: sidebar first (it's the larger and test-worthier change), README second (pure docs + assets, no runtime risk).

---

## Sub-project 1 — Custom Pinned Sidebar

### Data model

Pins live in the vault at `<vault>/.cipher/sidebar.json`:

```jsonc
{
  "version": 1,
  "pins": [
    { "id": "a1b2c3", "label": "Research", "path": "wiki/knowledge/research", "icon": "book" },
    { "id": "d4e5f6", "label": "Projects", "path": "wiki/projects",            "icon": "rocket" }
  ]
}
```

- `id` — stable, ULID-style or crypto-random hex. Generated on create; never rewritten.
- `label` — user-facing text. Defaults to the last path segment on pin.
- `path` — vault-relative folder path. Always forward-slashed, no leading slash.
- `icon` — one of the 12 curated icon names (see below).
- `version` — bumps on schema changes so migrations are possible.

`.cipher/` is a conventional hidden folder at the vault root; same pattern as `.obsidian/`. Synced by whatever syncs the vault (Obsidian Sync, iCloud, Dropbox) with zero extra setup.

### Icon set

12 monochrome 14×14 stroke-2 SVGs, exported as a single `PinIcon` component keyed by name:

```
folder · document · flag · star · book · rocket · people · archive · inbox · graph · brain · calendar
```

Living at `src/components/ui/PinIcon.tsx`. Each icon is inline SVG using `stroke="currentColor"` so `color` controls it. Matches the Linear-style iconography used throughout the existing sidebar.

### Sidebar rendering

New "Pinned" group between "Recent" and the bottom settings row.

- **Header:** mono-label `Pinned` on the left, `+ Add` ghost button on the right. When the pins array is empty, the header stays visible (the `+ Add` button invites action).
- **Rows:** each pin is an `.app-row` (icon + label). Reuses the row styling from the primary nav so visual consistency is automatic.
- **Click a row:** calls `openVaultDrawer({ scopedPath: pin.path })` — the drawer mounts scoped to that folder (see Drawer scoping below).
- **Hover ✕** (right side of the row, reveal-on-hover): removes the pin after a small inline confirmation (the same pattern already used by Recent).
- **Double-click the label:** inline editable text input. `Enter` saves, `Esc` cancels.
- **Drag to reorder:** `framer-motion` `Reorder.Group` with `Reorder.Item`. Drop commits a new `order` to storage.

### Adding pins — two entry points

**1. "+ Add section" dialog** (triggered by the header button):

Small centered modal, uses the existing CommandPalette-style shell for visual consistency.

- **Path** — text input with folder autocomplete. As the user types, results stream in from a new endpoint `GET /api/vault/folders?q=<term>` which returns vault-relative folders whose path contains the term (case-insensitive, capped at 20, sorted by shortness + recency). Pre-populated suggestions when the field is empty: every top-level folder from `getVaultLayout()` that isn't already pinned.
- **Label** — text input, pre-filled with the last path segment on path change. User can override.
- **Icon** — 12-icon grid (3 × 4 or 4 × 3). Selected icon shows a 2px brand ring. Keyboard-navigable (arrow keys + Enter).
- **Save** — writes the new pin to `sidebar.json` via `PUT /api/settings/sidebar`, closes dialog.
- **Esc / backdrop click** — cancel.

**2. Hover-to-pin in VaultDrawer:**

Every folder row in VaultDrawer shows a pin icon on hover (same pattern as TodayRow's inline hover actions). Click = optimistic add with defaults (`label = folder basename`, `icon = "folder"`). A small toast appears at the row for 1.2 s confirming ("Pinned Research"). User can customise the icon/label later via double-click or drag-to-reorder.

### VaultDrawer scoping

The VaultDrawer gains an optional `scopedPath` prop.

- When `scopedPath` is set: drawer renders rooted at that folder. All file/folder listings, all search, all keyboard navigation are relative to this root.
- A breadcrumb strip at the top reads `← All folders  ·  Research` — clicking "All folders" clears the scope; the current folder name is a read-only indicator.
- When `scopedPath` is null: drawer renders the full vault (existing behaviour).

Implementation: one new optional prop + one conditional at the top of the file-listing loop. No new component.

### API + persistence

**New module** — `src/lib/settings.ts`:

```ts
export interface SidebarConfig {
  version: 1;
  pins: PinEntry[];
}
export interface PinEntry {
  id: string;
  label: string;
  path: string;
  icon: PinIconName;
}

export async function readSidebarSettings(): Promise<SidebarConfig>;
export async function writeSidebarSettings(config: SidebarConfig): Promise<void>;
```

- `readSidebarSettings` — reads `<vault>/.cipher/sidebar.json`. Returns `{ version: 1, pins: [] }` on missing file. Runs a migration function based on `version` when future schemas exist.
- `writeSidebarSettings` — ensures `.cipher/` exists, writes via `tmp + rename` for atomicity. Validates the config against the typed schema; throws on invalid input.

**New routes** (Next.js API):

- `GET /api/settings/sidebar` → returns current `SidebarConfig` JSON.
- `PUT /api/settings/sidebar` → body is a full `SidebarConfig`; server validates + writes.
- `GET /api/vault/folders?q=<term>` → returns `{ folders: string[] }` (vault-relative paths, cap 20). Walks the vault once per request; cheap for typical vaults (<500 folders).

All three routes are server-local (no auth, consistent with the rest of the app).

### Hook

**New hook** — `src/lib/hooks/useSidebarPins.ts`:

```ts
function useSidebarPins(): {
  pins: PinEntry[];
  loading: boolean;
  addPin(partial: Omit<PinEntry, "id">): Promise<void>;
  removePin(id: string): Promise<void>;
  updatePin(id: string, patch: Partial<PinEntry>): Promise<void>;
  reorderPins(nextOrder: string[]): Promise<void>;
}
```

- Mount-effect: `GET /api/settings/sidebar`, hydrate state.
- Mutations: optimistic update of local state, then `PUT` the full config. On failure, revert + show a toast.
- Single in-memory source of truth per session; no localStorage cache (vault is already fast to read).

### File layout (new files only)

```
src/lib/settings.ts
src/lib/hooks/useSidebarPins.ts
src/components/ui/PinIcon.tsx
src/components/sidebar/PinDialog.tsx
src/app/api/settings/sidebar/route.ts
src/app/api/vault/folders/route.ts
```

### Modified files

- `src/components/Sidebar.tsx` — new Pinned group rendering between Recent and settings; hooks into `useSidebarPins`.
- `src/components/AppShell.tsx` — threads `scopedPath` through to VaultDrawer when a pin is clicked.
- `src/components/VaultDrawer.tsx` — accepts `scopedPath`; adds the breadcrumb strip + hover-to-pin icon on folder rows.

### Error paths

- `GET /api/settings/sidebar` when `.cipher/sidebar.json` is missing → returns `{ version: 1, pins: [] }` (200). Not a 404 — an empty config is valid state.
- `GET` when the JSON is malformed → returns `{ version: 1, pins: [] }` + logs a warning server-side. Never crashes the sidebar render.
- `PUT` when validation fails → 400 with the validation error message. Frontend shows an inline error in the dialog.
- `PUT` write failures (permission denied, disk full) → 500. Frontend reverts the optimistic state and shows a toast.
- `GET /api/vault/folders` with no vault connected → returns `{ folders: [] }`.

### Testing

No test framework in the repo currently. Verification is manual + grep-based:

1. Add a pin via `+ Add` → appears in sidebar.
2. Click it → VaultDrawer opens scoped to that folder.
3. Restart the dev server → pin persists.
4. Delete `sidebar.json` from the vault while dev server is running → reload browser → empty pinned group without error.
5. `tsc --noEmit` clean; `npm run build` green.

---

## Sub-project 2 — Open-source README + LICENSE + CONTRIBUTING

### README structure

`README.md` at repo root, ~400 lines, scannable. Sections:

1. **Header** — mark/logo, one-line pitch, MIT badge + build badge.
2. **Hero strip** — 3 screenshots side-by-side via a Markdown table (Chat / Today / Graph). Stored in `docs/images/`.
3. **What Cipher is** — 3 sentences. AI chat + bespoke pages over any Obsidian-style markdown vault.
4. **Key features** — bullet list with terse Linear-style copy:
   - Chat with slash commands and hover-action copy/regenerate
   - Today dashboard with optimistic task check-off
   - System health — broken-link detection, 30-day activity sparkline, connectivity histogram
   - Force-directed Graph — hub-weighted physics, orphan ring, Obsidian-style layout
   - Bespoke pages for System / Timeline / Search / Entity / Topic
   - Custom pinned sidebar — fixed per vault, synced where the vault syncs
   - Dark & light, keyboard-first, 4px-grid design tokens
   - Works with any Obsidian vault layout the `getVaultLayout()` probe recognises
5. **Quick start** — one code block, 5 steps.
6. **Point it at your vault** — short section explaining the auto-probe + table of recognised folder names (entities / people / contacts / journal / projects / research / work / system / …).
7. **Customising the sidebar** — 3 sentences + 1 screenshot, covers both pin entry points.
8. **Project layout** — tree with one-line descriptions.
9. **Development** — dev commands.
10. **Design language** — paragraph on token system + `globals.css` as single source of truth + invite to contribute.
11. **Contributing** — short paragraph, link to `CONTRIBUTING.md`.
12. **License** — MIT one-liner.

**Voice:** tight bullets, heavy code blocks, short paragraphs. Callouts (`>` blocks) for the "works with any vault" and "your data stays local" selling points.

### Supporting files

- `LICENSE` — standard MIT text, year 2026, `Stijn Hanegraaf` as copyright holder.
- `CONTRIBUTING.md` — 20-30 lines:
  - How to run locally (repeat of quick start)
  - Code style: TypeScript strict, 4px grid, token-driven colours (no raw hex outside `globals.css`), `.app-row` for every list row
  - PR checklist: `tsc --noEmit` clean, `npm run build` green, every interactive element has `.focus-ring`
  - Where to ask questions (open an issue)
- `.env.example` — `VAULT_PATH=/path/to/your/Obsidian` with a two-line comment explaining that the app auto-detects common paths if unset.
- `docs/images/` — placeholders. README references `docs/images/chat.png`, `docs/images/today.png`, `docs/images/graph.png`, `docs/images/sidebar-pins.png`. User drops real screenshots in when ready.

### Modified files

- Existing `README.md` (currently a pre-v7 stub) is fully replaced.

---

## Sequencing

**Phase A — Sidebar (3 working days):**
1. Data layer: `settings.ts` + API routes. Verify via curl.
2. Icon component + PinDialog. Verify visually.
3. Sidebar integration: new Pinned group + hook wiring.
4. VaultDrawer scoping.
5. Hover-to-pin in VaultDrawer.
6. Drag reorder + inline edit.

**Phase B — README (0.5 day):**
1. Write `README.md`, `LICENSE`, `CONTRIBUTING.md`, `.env.example`.
2. Commit with screenshots referenced as paths only (user drops images in separately).

---

## Non-goals (keeping scope tight)

- No sidebar-wide customisation (reordering the primary Dashboard/Chat/Graph/System/Timeline nav items). Pinned group only.
- No emoji icons. Curated SVG set only (user-selected decision for visual consistency with Linear-style iconography).
- No cross-device manual-sync UI. Lives in the vault; the vault's own sync mechanism handles it.
- No per-pin chat-query or file-pin. Folder pins only for this pass (trivial to extend later).
- No test framework addition. Verification stays grep + manual, consistent with the existing project.
- No i18n on the README. English only.

---

## Critical files reference

**New:**
- `src/lib/settings.ts`
- `src/lib/hooks/useSidebarPins.ts`
- `src/components/ui/PinIcon.tsx`
- `src/components/sidebar/PinDialog.tsx`
- `src/app/api/settings/sidebar/route.ts`
- `src/app/api/vault/folders/route.ts`
- `LICENSE`
- `CONTRIBUTING.md`
- `.env.example`
- `docs/images/` (empty, placeholders)

**Modified:**
- `src/components/Sidebar.tsx`
- `src/components/AppShell.tsx`
- `src/components/VaultDrawer.tsx`
- `README.md` (full rewrite)

---

## Existing utilities to reuse

- `getVaultLayout()` / `getVaultPath()` — already vault-agnostic per v11.
- `.app-row` / `.focus-ring` / `.mono-label` — styling already defined in `globals.css`.
- `useSheet` + existing VaultDrawer — scoping adds one optional prop, not a rewrite.
- `framer-motion` Reorder primitives — already in use in the project.
- `CommandPalette` pattern — PinDialog inherits the same backdrop + box + keyboard navigation.
- `toVaultPath` / resolver cache — any path coming in from the pin config passes through the same safety net as wiki-links before being used.

---

## Verification

1. **Persistence round-trip:** add a pin, restart dev server, reload → pin is still there.
2. **Path portability:** copy `.cipher/sidebar.json` to a different vault, point `VAULT_PATH` at it → same pins render (assuming the paths exist).
3. **Click-through:** every pin opens the VaultDrawer scoped to that folder; "← All folders" breadcrumb returns the drawer to full view.
4. **Reorder + remove:** drag reorders persist; ✕ removes persist.
5. **Empty state:** delete `sidebar.json` → empty "Pinned" group with only the `+ Add` button.
6. **README renders cleanly** on GitHub's Markdown renderer. All relative image links resolve once `docs/images/` has files.
7. **`tsc --noEmit` clean; `npm run build` green; every route still 200.**

---

## One-sentence summary

A user-customisable "Pinned" group in the sidebar that writes its folder shortcuts to `<vault>/.cipher/sidebar.json` for cross-device portability, plus an open-source-grade README + LICENSE + CONTRIBUTING that make the repo welcoming to the first person who clones it.
