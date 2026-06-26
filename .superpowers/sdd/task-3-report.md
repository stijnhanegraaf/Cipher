# Task 3 Report — DetailPage Decomposition (PART 1 of 2)

## Extractions

### Sub-step 1: `useFileContent` + `useAnchorScroll`

**Files created:**
- `src/lib/hooks/useFileContent.ts` (61 lines)
- `src/lib/hooks/useAnchorScroll.ts` (67 lines)

**Split of the fetch/anchor-scroll entanglement (sharpest seam):**

The original code had a single `fetchData` callback (lines 228-289) that:
1. Called `setLoading(true)` + `setError(null)` synchronously
2. Fetched `/api/file`
3. Called `setData(json)` + `setLoading(false)` in `.then()`
4. In a chained `.then()`, immediately ran the DOM anchor-scroll + highlight

The split: `useFileContent` owns only #1-3 (fetch + state). `useAnchorScroll` owns #4 (DOM scroll effect), but now fires from a `useEffect` watching `(ready: boolean, anchor)` — where `ready` = `data !== null`. This preserves identical behavior:
- The double-`rAF` trick before DOM query is preserved verbatim
- The `anchor-highlight` toggle + 2100ms cleanup is identical
- Effect dependency ordering is equivalent: both fire after React has committed the data render

**Caveat on `setData` optimistic update after save:** The original `saveFile` called `setData(prev => ...)` to update displayed content without re-fetching. Since `data` is now hook-owned, I introduced a `savedContent: string | null` local state in DetailPage. On successful save, `setSavedContent(content)` is called; `MarkdownRenderer` receives `savedContent ?? data.content`. Reset to `null` on path change. Behavior identical.

**FileFullPage convergence:** Replaced the custom `useEffect` + `useState` fetch loop (lines 32-54) with `const { data, loading, error } = useFileContent(path)`. Removed unused `useState`, `useEffect`, `FileData` type alias, and `FileEnvelope` import.

**Lint challenge:** The project's `react-hooks/set-state-in-effect` rule flags `setState()` calls synchronously inside effect bodies, even transitively via function calls. Solved by mirroring `useVaultIndex.ts` pattern: module-level async `fetchFileEnvelope()` function returns a Promise; setState calls happen only in `.then()` callbacks.

---

### Sub-step 2: `DetailStates.tsx`

**File created:** `src/components/detail/DetailStates.tsx` (202 lines)

Extracted:
- `DetailSkeleton` — the 6-line shimmer skeleton (R: lines ~594-609)
- `DetailError` — the 130-line error/404 state with retry + "Search for X" (S: lines ~611-743)
- CSS keyframes (Y: `dot-pulse`, `.skeleton-line`, `skeleton-shimmer`) — moved into `DetailStates.tsx` alongside the skeleton that needs them

DetailPage now renders:
```tsx
{loading && <DetailSkeleton />}
{error && <DetailError error={error} path={path} onAsk={onAsk} onRetry={reload} />}
```

The IIFE pattern `{(() => { ... })()}` inside the error block was cleaned up into a proper component. Behavior identical (same isNotFound regex, same fileName extraction).

---

### Sub-step 3: `TableOfContents.tsx` + `useActiveHeading.ts`

**Files created:**
- `src/lib/hooks/useActiveHeading.ts` (60 lines)
- `src/components/detail/TableOfContents.tsx` (104 lines)

Extracted:
- `useActiveHeading(containerRef, sections)` — the IntersectionObserver effect (J: lines ~160-192) with identical `rootMargin: "-80px 0px -60% 0px"`, `threshold: 0`
- `TableOfContents` component — the TOC nav render (D: lines ~54-130) with `scrollToHeading` inlined as a `useCallback` inside the component (K: lines ~194-200)
- Reset-scroll-on-path (I) stays in DetailPage's `useEffect([path])` — it resets the scroll container, not a TOC concern

DetailPage now uses:
```tsx
const activeHeading = useActiveHeading(scrollRef, data?.sections ?? []);
// ...
<TableOfContents sections={...} activeId={activeHeading} />
```

The `onItemClick` prop was eliminated — scroll is now self-contained in the component.

---

## Line counts

| File | Before | After |
|---|---|---|
| `DetailPage.tsx` | 1037 | 687 |
| `DetailStates.tsx` (new) | — | 202 |
| `TableOfContents.tsx` (new) | — | 104 |
| `useFileContent.ts` (new) | — | 61 |
| `useAnchorScroll.ts` (new) | — | 67 |
| `useActiveHeading.ts` (new) | — | 60 |
| `FileFullPage.tsx` | 102 | 68 |

DetailPage reduced by 350 lines (~34%). Remaining bulk is the edit/save subsystem (~120 lines) and the framer-motion sheet shell + header chrome — both out of scope for this task.

---

## Gate results

- `npm run typecheck` — 0 errors
- `npm run test:unit` — 285 passed (28 test files), 0 failures
- `npm run build` — clean, all routes compiled
- `npm run lint` — **0 problems**
