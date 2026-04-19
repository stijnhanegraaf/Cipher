# Concepts

Short glossary of the recurring words in the codebase. Alphabetical.

### Backlink
An inbound wiki-link to a note. In the Graph view, a node's size scales with its backlink count. In `vault-health`, the "Top hubs" section lists notes sorted by backlinks.

### Broken link
A `[[wiki-link]]` in a note whose target cannot be resolved by `resolveLink()`. Surfaced by `vault-health` and the System page.

### Hub
A note with many backlinks (≥ 3 is "bright", ≥ 8 is "hub" in the Graph rendering). The Connectivity chart on `/browse/system` buckets notes by backlink count.

### Intent
A classified user request. `detectIntent(query)` maps raw text to one of: `current_work`, `entity_overview`, `topic_overview`, `system_status`, `timeline_synthesis`, `search_results`, `browse_entities`, `browse_projects`, `browse_research`.

### Orphan
A note with zero incoming and zero outgoing wiki-links. The Graph view pushes orphans toward an outer ring via a weak outward force.

### Pin
A user-customised folder shortcut in the sidebar's Pinned group. Stored in `<vault>/.cipher/sidebar.json`. Click → opens the VaultDrawer scoped to that folder.

### Probe / Vault layout
The startup-time scan in `getVaultLayout()` that finds out which folders in the vault play which role (entities vs journal vs projects vs …). Every downstream reader uses the probe result instead of hardcoded paths, which is why Cipher works on any vault structure the probe recognises.

### ResponseEnvelope
The typed wrapper returned by `/api/query`. Contains the request info plus the `response.views[]` array of `ViewModel` objects the renderer consumes.

### Scoped drawer
When you click a pinned folder in the sidebar, the VaultDrawer opens with `scopedPath` set — meaning it filters its contents to just that folder and shows a `← All folders` breadcrumb.

### Sheet
The URL-driven overlay that renders a single file on top of any route. Controlled via `?sheet=<vault-path>` (and optional `?anchor=<slug>`). `useSheet` encapsulates the read/write.

### Source
A `SourceRef` attached to a view-model indicating which vault file(s) the data came from. Rendered as clickable pills under a chat response; clicking opens the sheet.

### Stale note
A note that hasn't been touched for ≥ 30 days in an active folder (projects/work/knowledge/system per the layout probe). Surfaced by `vault-health` and the System page.

### Tokens
The CSS custom properties in `src/app/globals.css` — colours, spacing, radii, durations, row heights. Every component reaches for tokens instead of hardcoded values. Tokens adapt to light mode automatically via the `.light` class override.

### ViewModel
A typed object the renderer understands — `SystemStatusData`, `TimelineSynthesisData`, `EntityOverviewData`, etc. Defined in `src/lib/view-models.ts`, built by `src/lib/view-builder.ts`, rendered by `src/components/views/*.tsx`.

### Wiki-link
Obsidian's `[[path]]` or `[[path|label]]` syntax. `extractLinks()` parses them from markdown; `resolveLink()` turns a link path into an absolute vault file path.
