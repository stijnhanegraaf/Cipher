<h1 align="center">Cipher</h1>

<p align="center">
  An AI-native chat + dashboard interface over your Obsidian-style markdown vault.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-5e6ad2?style=flat-square" alt="MIT"></a>
  <img src="https://img.shields.io/badge/Next.js-16-000?style=flat-square&logo=next.js" alt="Next.js 16">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript" alt="TypeScript">
</p>

<p align="center">
  <img src="docs/images/chat.png" width="32%" alt="Chat"/>
  <img src="docs/images/today.png" width="32%" alt="Today"/>
  <img src="docs/images/graph.png" width="32%" alt="Graph"/>
</p>

---

## What Cipher is

Point Cipher at a folder of markdown notes. Ask it things in chat. Get bespoke pages — Today, System health, Timeline, a force-directed Graph, Entity/Topic detail — instead of wall-of-text answers. Everything reads from the files in your vault. Nothing leaves your machine.

> **Works with any Obsidian vault layout.** Cipher probes your vault's folder names (`entities`/`people`/`contacts`, `journal`/`daily`, `projects`, `research`, `work`, `system`, …) and adapts. No folder renaming required.

## Key features

- **Chat** with slash commands (`/today`, `/system`, `/graph`, …) and hover-action Copy / Regenerate
- **Today dashboard** with optimistic task check-off + undo
- **System health** — 30-day activity sparkline, 5-bucket connectivity chart, broken-link detection, stale-note detection, top hubs
- **Graph** — force-directed vault map with hub-weighted physics, orphan ring, bloom halos
- **Bespoke pages** for System, Timeline, Search, Entity, Topic — not chat chrome, real pages with breadcrumbs + deep links
- **Custom pinned sidebar** — pin any folder with a label + icon; config lives in your vault so it syncs with it
- **Linear-grade design system** — 4px grid, single token source in `globals.css`, dark + light, keyboard-first
- **Local-only** — no auth, no remote server, no telemetry

## Quick start

```bash
git clone https://github.com/stijnhanegraaf/brain-frontend
cd brain-frontend
npm install
cp .env.example .env.local    # set VAULT_PATH to your vault directory
npm run dev
# open http://localhost:3000
```

If you don't set `VAULT_PATH`, Cipher probes common locations — `~/Obsidian`, `~/Documents/Obsidian`, `~/Projects/Obsidian`, sibling `../Obsidian`. First one it finds wins.

### Don't have a vault yet?

Run against the included sample vault in `public/sample-vault/` (~15 toy markdown files that exercise every surface):

```bash
VAULT_PATH=$(pwd)/public/sample-vault npm run dev
```

Every page will light up — Today shows tasks, System has checks + broken links, Timeline has activity, Graph renders a small cluster, Entity/Topic pages resolve.

## Point it at your vault

Cipher auto-detects folder roles by name. This table shows what it looks for:

| Role in Cipher | Your folder can be named… |
|---|---|
| Entities (people, companies, systems) | `entities`, `people`, `contacts`, or `knowledge/entities` |
| Journal (per-day notes) | `journal`, `daily`, `daily-notes` |
| Projects | `projects` or `knowledge/projects` |
| Research | `research` or `knowledge/research` |
| Work (open, waiting-for, logs, weeks) | `work` or `tasks` |
| System (status, health, open-loops) | `system` |
| Hub file | `dashboard.md`, `index.md`, `home.md`, or `README.md` at the vault root |

Folders under a `wiki/` root are auto-detected too. Anything the probe doesn't find is simply ignored — the feature that depends on it just doesn't render a section.

## Customising the sidebar

Two ways to pin a folder:

- **`+ Add` in the Pinned group** — type or pick a path, choose a label + icon, save.
- **Hover-pin in the vault drawer** — hover any folder row and click the pin icon. Defaults to the folder name; edit later via double-click.

Your pins are saved to `<vault>/.cipher/sidebar.json`. Whatever syncs your vault (Obsidian Sync, iCloud, Dropbox) syncs your pins.

<p align="center">
  <img src="docs/images/sidebar-pins.png" width="60%" alt="Sidebar pins"/>
</p>

## Project layout

```
src/
  app/                 Next.js 16 App Router routes + API endpoints
    api/               /api/query, /api/today, /api/settings/sidebar, /api/vault/*
    browse/            /browse, /browse/system, /browse/timeline, /browse/graph, …
    chat/              /chat surface
    file/[...path]/    direct file view
  components/          React components
    browse/            TodayPage, SystemPage, TimelinePage, GraphPage, …
    sidebar/           Sidebar extras (PinDialog)
    ui/                Reusable primitives (PinIcon, StatusDot, Badge, HoverCard, …)
    views/             Chat-summary renderers (ViewRenderer + per-view modes)
  lib/
    vault-reader.ts    Vault layout probe + schema-aware readers + search
    vault-health.ts    Activity / broken-links / stale-notes / hubs scanner
    vault-graph.ts     Nodes + edges builder (cached per vault)
    view-builder.ts    Intent -> typed view model
    intent-detector.ts NL -> intent classifier
    settings.ts        <vault>/.cipher/sidebar.json read/write
    today-builder.ts   Today page data aggregation
```

## Development

```bash
npm run dev          # dev server on :3000
npm run build        # production build
npm run start        # serve production build
npx tsc --noEmit     # type check
```

No test framework yet. Verification is manual + `curl` for the API routes + `grep` for token/convention compliance.

## Architecture + concepts

For a deeper tour of how the pieces fit together, read:

- `docs/ARCHITECTURE.md` — request life-cycle, module map, vault-layout probe.
- `docs/CONCEPTS.md` — glossary of recurring terms (intent, view model, hub, orphan, sheet, scoped drawer, …).

## Design language

Every colour, padding, radius, font size, and motion duration in Cipher comes from a CSS custom property defined in `src/app/globals.css`. Components reach for the tokens (`var(--accent-brand)`, `var(--row-h-cozy)`, `var(--motion-hover)`, `.app-row`, `.focus-ring`) instead of inventing their own values. This is what makes the app feel like one thing instead of assembled parts. Contributions that add new UI should stick to the existing tokens — add a new token only when no existing one fits.

## Contributing

PRs welcome. Read `CONTRIBUTING.md` for the code-style rules and PR checklist.

## License

MIT — see `LICENSE`. Your data stays on your machine; the license on your modifications is yours.
