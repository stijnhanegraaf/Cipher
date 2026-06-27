# Task 4 Report: Semantic Search Toggle

## Status: DONE

## What was built

### 1. `src/lib/builders/semantic-search.ts` (pure, no I/O)
`chunksToSearchResults(query, chunks): SearchResultsData` - maps `RetrievedChunk[]` to the standard search shape:
- `label` via `nameFromPath(path).replace(/-/g, " ")` (matches exact-path convention)
- `path` passthrough
- `excerpt` = optional `heading + " -- "` prefix + first 140 chars of chunk text
- `kind` via `toSearchKind(kindFromPath(path))` - same SearchKind vocab as exact path
- Dedup by path keeping first (highest-score) chunk; `retrieve()` already returns cosine-sorted

### 2. `src/lib/builders/semantic-search.test.ts`
9 tests, RED then GREEN:
- Field mapping: label/path/kind/excerpt
- Heading prefix when present / absent
- Excerpt capped at 140 chars
- Dedup: multiple chunks for same path - first kept (highest score)
- Dedup across multiple distinct paths
- Empty chunks yields `{ query, results: [] }`
- kind vocab: all known path patterns (entity/project/research/system/journal/personal/memory)
- Default kind is "note" for unrecognized paths

### 3. `src/app/api/search/route.ts` (GET ?q=&mode=exact|semantic)
- Blank query returns 400
- `mode=exact` (default when mode missing) calls `buildSearchResults(q)`, returns `source: "keyword-only"`, never touches embeddings
- `mode=semantic`:
  - `resolveEmbedder` returns null: transparent degrade to `buildSearchResults`, `source: "keyword-only"`, `retrieve()` never called
  - `retrieve` returns empty array (empty index): transparent degrade to `buildSearchResults`, `source: "keyword-only"`
  - Normal path: `retrieve(q)` then `chunksToSearchResults`, `source: embedder.id`

### 4. `src/app/api/search/route.test.ts`
7 tests covering all branches above. Mocks: `retrieve`, `resolveEmbedder`, `readLLMSettings`, `buildSearchResults`.

### 5. `src/components/browse/SearchPage.tsx`
- `mode` state: `useState<"exact" | "semantic">("exact")`
- `source` state for tracking degraded response
- `fetchSearch(q, mode)` calling GET `/api/search?q=&mode=` replacing old POST to `/api/query`
- `mode` added to `useEffect` deps so toggling re-queries immediately
- Segmented control: EXACT | SEMANTIC buttons, token-only colors (--active-surface, --text-primary, --text-tertiary, --border-standard)
- Keyword-only notice: shows "Search falls back to keywords" when `mode === "semantic" && source === "keyword-only"`

## How exact stays unchanged
- `?q=foo` deep links land on SearchPage with `mode: "exact"` (default state) calling GET `/api/search?mode=exact`
- `/api/search?mode=exact` calls `buildSearchResults(q)` - identical output to the old `/api/query` intent path
- `/api/query` is completely untouched
- `buildSearchResults` is completely untouched (its boundary test still passes)
- Exact mode never resolves an embedder at any layer

## Server-only constraint (client component)
`embeddings.ts` has `import "server-only"`. SearchPage is a client component, so `embedLabel` and `EmbedderId` cannot be imported from there. Solution: `SearchSource` is typed as plain `string` in SearchPage; the keyword-only notice text is inlined ("Search falls back to keywords") matching `embedLabel("keyword-only")` exactly.

## Full gate
- `npm run typecheck` - 0 errors
- `npm run test:unit` - 463 tests passed (42 test files, 9 new semantic-search tests + 7 new route tests)
- `npm run lint` - 0 problems
- `npm run build` - clean (all routes built, `/api/search` appears as dynamic route)
