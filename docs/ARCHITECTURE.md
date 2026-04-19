# Architecture

Cipher is a Next.js 16 App Router app that reads an Obsidian-style markdown vault from disk and renders an AI-native chat + dashboard over it. Everything is local — no remote server, no auth, no telemetry. This doc gives you a 10-minute tour.

## The big picture

```
┌────────────┐                            ┌──────────────────┐
│  Browser   │                            │   Vault on disk  │
│  (Next.js  │                            │  .md + .cipher/  │
│   client)  │                            └────────▲─────────┘
└─────┬──────┘                                     │
      │  GET/POST /api/*                           │
      │                                            │
┌─────▼──────────────────────────────────────────┐ │
│          Next.js API routes (server)           │ │
│ /api/query · /api/today · /api/vault/* ·       │ │
│ /api/file · /api/settings/* · /api/resolve     │ │
└─────┬──────────────────────────────────────────┘ │
      │                                            │
┌─────▼──────────────────────────────────────────┐ │
│                 lib/ layer (server)            │ │
│                                                │ │
│  ┌──────────────┐  ┌──────────────┐  ┌──────┐  │ │
│  │ vault-reader │◄─┤ view-builder │◄─┤intent│  │ │
│  │   parse +    │  │  intent →    │  │detect│  │ │
│  │   probe      │  │   typed VM   │  │  -or │  │ │
│  └──────┬───────┘  └──────────────┘  └──────┘  │ │
│         │             ▲                        │ │
│         │   ┌─────────┴──────┐  ┌────────────┐ │ │
│         └──►│ vault-health   │  │ vault-graph│ │ │
│             │ scanner        │  │ nodes/edges│ │ │
│             └────────────────┘  └────────────┘ │ │
│                                                │ │
│         All reads go through vault-reader ─────┼─┘
└────────────────────────────────────────────────┘
```

Every filesystem read goes through `src/lib/vault-reader.ts`. Every view the user sees is built by `src/lib/view-builder.ts`. Every chat message routes through `src/lib/intent-detector.ts` → `view-builder`.

## Request life-cycle

1. User types a query in `/chat` and hits enter.
2. `ChatInterface` POSTs to `/api/query` with the raw text.
3. `detectIntent()` classifies the query (regex + keywords) → `{ intent, viewType, confidence, files? }`.
4. `buildView(viewType, query, entityName?)` fetches the relevant data from `vault-reader`:
   - `"system_status"` → `readSystemStatus()` + `buildVaultHealth()`.
   - `"timeline_synthesis"` → probes month-log + journal + weeks folders.
   - `"entity_overview"` → `readEntity(name)` + related links.
   - `"current_work"` → `readWorkOpen()` + `readWorkWaitingFor()`.
   - `"search_results"` → `searchVault(query)`.
   - ...
5. The builder returns a typed `ViewModel` (`SystemStatusData`, `TimelineSynthesisData`, ...).
6. `/api/query` wraps it in a `ResponseEnvelope` with title, summary, sources, actions, freshness meta.
7. Client `ViewRenderer` picks the right per-view component (`SystemStatusView`, `TimelineView`, ...) and renders.

Bespoke pages (`/browse/system`, `/browse/timeline`, etc.) skip steps 2–3 — they POST to `/api/query` directly with a canonical query, or call dedicated endpoints like `/api/today`.

## lib/ — where the brains live

| File | Role |
|---|---|
| `vault-reader.ts` | The one place that touches the filesystem. Layout probe, schema-aware readers, wiki-link resolver. Every other `lib/` file goes through it. |
| `view-builder.ts` | Intent → typed view-model. One `build<X>()` function per view type, each returning a `ViewModel`. |
| `intent-detector.ts` | Regex/keyword classifier. `detectIntent(query)` → best-guess intent + viewType + confidence. No LLM call. |
| `vault-health.ts` | Scans every `.md` once: activity histogram, broken wiki-links, stale notes, hubs, folder distribution. 60s cache. |
| `vault-graph.ts` | Builds the nodes + edges the Graph page needs. Edges = resolved wiki-links only. Cached per vault. |
| `today-builder.ts` | Aggregates today + up-next tasks from the vault's work folder. |
| `settings.ts` | Reads/writes `<vault>/.cipher/sidebar.json` for the custom-sidebar feature. Atomic writes. |
| `log.ts` | Tiny debug-gated logger. `log.warn/error` always pass through; `debug/info` silenced in production. |
| `format.ts`, `motion.ts` | String formatters, framer-motion primitives. Pure utilities. |
| `view-models.ts` | All view-model + domain types. Single source of truth for what a `SystemStatusData` looks like. |
| `mock-data.ts` | Fallback + test data. Only used when `USE_REAL_DATA=false`. |

## components/ — what the user sees

- `AppShell.tsx` — persistent chrome: sidebar + palette + drawer + detail sheet. Wraps every route.
- `Sidebar.tsx` — primary navigation + recent + pinned folder shortcuts.
- `ChatInterface.tsx` — `/chat` surface. Message list + input + slash commands.
- `CommandPalette.tsx` — ⌘K fuzzy-scored actions.
- `DetailPage.tsx` — URL-driven overlay sheet (`?sheet=<path>&anchor=<slug>`).
- `VaultDrawer.tsx` — file-tree drawer with optional `scopedPath` for pin-click.
- `browse/*Page.tsx` — bespoke pages (`TodayPage`, `SystemPage`, `TimelinePage`, `GraphPage`, `SearchPage`, `EntityPage`, `TopicPage`, `FileFullPage`).
- `views/*.tsx` — chat-summary renderers, one per `ViewType`.
- `ui/*.tsx` — reusable primitives (`Badge`, `Kbd`, `StatusDot`, `Avatar`, `HoverCard`, `PinIcon`, `ActivitySparkline`, `LinkDistributionChart`, ...).
- `sidebar/PinDialog.tsx` — modal for adding a folder pin.

## app/ — routes

- `/browse` → TodayPage (landing).
- `/browse/system|timeline|graph|search|entity/[name]|topic/[name]` → bespoke pages.
- `/chat` → ChatInterface.
- `/file/[...path]` → full-page file view (alternative to the overlay sheet).
- `/api/query` → main chat + intent endpoint.
- `/api/today` → TodayPage data.
- `/api/vault/{graph,structure,folders}` → per-surface vault metadata.
- `/api/settings/sidebar` → user pin config GET/PUT.
- `/api/file` → read/write a specific vault file.
- `/api/resolve` → resolve a wiki-link string to a vault path.

## Vault layout probe

`getVaultLayout()` in `vault-reader.ts` probes for common folder names under the vault root (and under a `wiki/` subfolder if present):

| Role | Candidate names |
|---|---|
| Entities | `entities`, `people`, `contacts`, `knowledge/entities` |
| Journal | `journal`, `daily`, `daily-notes` |
| Projects | `projects`, `knowledge/projects` |
| Research | `research`, `knowledge/research` |
| Work | `work`, `tasks` |
| System | `system` |
| Hub file | `dashboard.md`, `index.md`, `home.md`, `README.md` at the root |

Every downstream reader uses the probed dirs — nothing in `lib/` or `app/` hardcodes a specific vault shape. This is why Cipher works on any Obsidian vault the probe recognises, not just the one the author happens to use.

## Design system

Every colour, padding, radius, font size, and motion duration comes from a CSS custom property in `src/app/globals.css`. Components reach for tokens (`var(--accent-brand)`, `var(--row-h-cozy)`, `var(--motion-hover)`, `.app-row`, `.focus-ring`) rather than inventing their own values. Zero raw hex outside `globals.css`. See `CONTRIBUTING.md` for the full rules.

## Data stays local

Every filesystem read happens in server components / API routes on the localhost Next.js process. The browser only sees what the API returns — typed view-models + file contents for the overlay sheet. No data leaves the machine.
