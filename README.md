# Cipher

A chat-native, AI-powered visual interface over a canonical markdown knowledge base.

## What it is

**Cipher** is a read-only prototype of an AI-native frontend that renders structured visual views from a markdown-backed knowledge system. It's not a notes app with an AI sidebar — it's a chat-first operating layer where AI shapes what gets shown.

### Core idea

One input (chat), many possible outputs (dashboards, entity pages, timelines, status panels, search results). The system understands intent and returns the right view type, backed by typed view-models that are validated before rendering.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Chat Input  │────▶│  Intent Router   │────▶│  Retrieval   │
│  (iMessage)  │     │  (detect intent) │     │  (mock data) │
└─────────────┘     └──────────────────┘     └──────────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │  View Model Layer │
                                              │  (typed schemas)  │
                                              └──────────────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │  Render Layer    │
                                              │  (React views)   │
                                              └──────────────────┘
```

### Layers (from docs)

1. **Canonical knowledge layer** — Obsidian markdown (not in this repo)
2. **Retrieval/orchestration layer** — Intent routing + data gathering (mocked)
3. **View-model layer** — Typed JSON schemas (see `src/lib/view-models.ts`)
4. **Render layer** — React components via bounded catalog
5. **Chat** — Single prompt bar, always visible

## Tech stack

- **Next.js 16** (App Router)
- **TypeScript** strict mode
- **Tailwind CSS** v4 for styling
- **Framer Motion** for animations
- **Typed view-models** as the AI→UI contract
- No json-render integration yet (custom React render layer for now; json-render adapter planned for Phase 2)

## View types supported

| View | Description | Example Query |
|------|-------------|---------------|
| `current_work` | Operational dashboard — tasks, highlights, period links | "What matters now?" |
| `entity_overview` | Entity page — summary, connections, timeline | "Tell me about Tebi" |
| `topic_overview` | Topic/project page — current state, questions, next steps | "What is the AI Visual Cipher?" |
| `timeline_synthesis` | Temporal view — themes, events, gaps | "What changed this month?" |
| `system_status` | Health panel — checks, warnings, attention items | "System health" |
| `search_results` | Fallback — clustered results with suggested views | "review prep" |

## UI primitives (component catalog)

**Shell:** ViewRenderer, ViewPanel

**Content:** SectionBlock, SummaryCard, MetricRow, TaskGroup/TaskItem, EntityHeader, LinkList, TimelineMini, ThemeGroup, CalloutBox, Badge

**Evidence:** SourceList, SourceItem, FreshnessHint, ConfidenceHint

**Actions:** ActionBar, ActionButton

## Design

- Apple-level UI quality — clean, minimal, lots of whitespace
- Light mode first, dark mode toggle
- Inter font for SF-like typography
- Smooth animations via Framer Motion
- Mobile responsive
- iMessage-style chat bar — centered, inviting

## Running

```bash
# Install
npm install

# Development
npm run dev
# → http://localhost:3000

# Or specify port
npx next dev -p 3333

# Production build
npm run build
npm start
```

## Project structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout with Inter font, theme script
│   ├── page.tsx            # Home — ChatInterface + ThemeToggle
│   └── globals.css         # Design tokens, scrollbar, selection styles
├── components/
│   ├── ChatInterface.tsx   # Main chat UI with welcome screen + messages
│   ├── ThemeToggle.tsx     # Light/dark mode toggle with localStorage
│   ├── ui/
│   │   ├── Badge.tsx       # All UI primitives (Badge, MetricRow, EntityHeader, etc.)
│   │   ├── TaskGroup.tsx   # Task group and task item components
│   │   └── index.ts        # Re-exports
│   └── views/
│       ├── ViewRenderer.tsx      # Routes view types to components
│       ├── CurrentWorkView.tsx   # Work dashboard view
│       ├── EntityOverviewView.tsx # Entity page view
│       ├── TopicOverviewView.tsx  # Topic page view
│       ├── TimelineView.tsx       # Timeline synthesis view
│       ├── SystemStatusView.tsx   # System health view
│       └── SearchResultsView.tsx  # Search results view
└── lib/
    ├── view-models.ts      # All TypeScript types for the view-model contract
    └── mock-data.ts        # Mock retrieval data for all 6 view types
```

## Phase 1 status

✅ Chat input as main entry point (iMessage-style)  
✅ Typed view-models as the AI→UI interface  
✅ Bounded component catalog (no arbitrary HTML from AI)  
✅ All 6 view types rendered  
✅ Dark/light mode  
✅ Mobile responsive  
✅ Framer Motion animations  
✅ Source visibility on every view  
✅ Action buttons (read-only navigation)  
🔲 json-render integration (Phase 2)  
🔲 Real retrieval API (Phase 2)  
🔲 Write-back actions (Phase 3)  

## Key design principles

1. **Typed view-models** — AI never emits raw HTML/components, only validated JSON schemas
2. **Bounded rendering** — Only approved component compositions, never freeform
3. **Source visibility** — Every view can show where data came from
4. **Chat-first** — One input, many output types
5. **Apple-level UI** — Clean, minimal, whitespace, Inter typography, subtle shadows

## Related docs

- Product spec: `Obsidian/wiki/projects/ai-visual-brain-frontend-product-spec.md`
- UI schema: `Obsidian/wiki/projects/ai-visual-brain-frontend-ui-schema.md`
- Component catalog: `Obsidian/wiki/projects/ai-visual-brain-frontend-component-catalog.md`
- Retrieval contract: `Obsidian/wiki/projects/ai-visual-brain-frontend-retrieval-contract.md`
- Research: `Obsidian/wiki/projects/ai-visual-brain-frontend-research.md`