# Cipher Round 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Each task: TDD pure logic, run the FULL gate before committing, ONE commit, footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Leave NO stray uncommitted edits.

**Goal:** Tri-state dark mode (System/Light/Dark, OS-live), first-class vault switching (recents + sidebar), API+CLI LLM providers (Claude + Ollama CLIs), and a full responsive pass — on top of the already-shipped hydration fix.

**Architecture:** Each workstream has a pure/testable core (Vitest) + UI/wiring. Theme adds a live `matchMedia` listener that only acts when pref=`system`. Vault adds a `localStorage` recents module. Providers add a `mode:"api"|"cli"` to settings + an injection-safe `spawn`-based CLI provider. Responsive is CSS-first (media queries + a drawer) with a tiny `useMediaQuery` hook.

**Tech Stack:** Next.js 16, React 19, TS-strict, Tailwind v4, Vitest, Node `child_process` (CLI providers). No new deps.

## Global Constraints
- TS strict; no new `any`. **Token-only color** (eslint `no-raw-color` + stylelint both enforce; `npm run lint` runs both). Lint MUST stay 0.
- Conventional Commits; ONE commit/task; footer above. Full gate green before each commit: `npm run typecheck && npm run test:unit && npm run build && npm run lint`.
- No behavior regressions to existing features. SSR-safe: never read `localStorage`/`sessionStorage`/`matchMedia` in a `useState` initializer or during render — defer to a post-mount `useEffect` (this is the hydration-bug discipline already applied in `3b54e21`).
- Branch: `refinement`. Spec: `docs/superpowers/specs/2026-06-28-cipher-round2-design.md`.

## Task order
`1 dark-mode → 2 vault-recents → 3 providers (largest, security-sensitive) → 4 responsive (large)`. Independent; this order front-loads the small wins.

---

## Task 1: Dark mode tri-state (System / Light / Dark)
**Files:** Modify `src/lib/browse/resolve-theme.ts` + `resolve-theme.test.ts`; `src/app/layout.tsx` (bootstrap script); `src/components/AppShell.tsx` (toggle → 3-state + live matchMedia listener); the toggle control wherever it renders (Sidebar/AppShell — grep `handleToggleTheme`/"Toggle theme"). Source: spec §B.

**Interfaces:** `resolveTheme(pref: string | null, osDark: boolean): "light" | "dark"` — `"system"` or null → osDark; `"light"`/`"dark"` → literal. (Behavior for null/unknown is unchanged; `"system"` now explicitly documented as the OS-follow value.) `localStorage['brain-theme']` now stores `"system" | "light" | "dark"`.

- [ ] **Step 1 — extend resolver test (TDD):** in `resolve-theme.test.ts`, change the two `"system"`-string cases to assert the documented intent (`resolveTheme("system", true) === "dark"`, `resolveTheme("system", false) === "light"`) and add a case asserting `"system"` is treated identically to `null`. Run → already green (the resolver already returns OS for non-light/dark), so this just locks `"system"` semantics. (No resolver code change needed unless a test fails.)
- [ ] **Step 2 — live OS-follow listener:** in `AppShell`, add a post-mount `useEffect` that registers `matchMedia('(prefers-color-scheme: dark)')` `change`; on change, IF the stored pref is `"system"` (or absent), re-apply: toggle `.light` class + `data-theme` + `window.__setThemeColor(resolved)`. No-op when pref is `light`/`dark`. Clean up the listener on unmount. (Use a justified `react-hooks/set-state-in-effect` disable only if you setState; prefer direct DOM class writes like `handleToggleTheme` does — no React state needed.)
- [ ] **Step 3 — 3-state toggle:** replace the binary `handleToggleTheme` with a cycle System → Light → Dark (read current pref from `localStorage['brain-theme']` defaulting to `"system"`; compute next; write it; apply the resolved theme — for `system` resolve against current matchMedia; call `__setThemeColor`). Update the toggle UI label/icon to show the active state (3 states). Keep it token-only.
- [ ] **Step 4 — bootstrap script:** in `layout.tsx`, the inline script already does `v==='light'?…:v==='dark'?…:(OS)` — confirm `"system"` falls into the OS branch (it does, since it's neither 'light' nor 'dark'). Add a one-line comment that `"system"` is the OS-follow value. No logic change unless needed.
- [ ] **Step 5 — verify:** full gate. Dev-server check (note as pending if no browser): toggle cycles 3 states; with pref=System, flipping the OS theme live-updates the app. Commit (`feat(theme): tri-state System/Light/Dark with live OS follow`).

## Task 2: Vault switching — recents + sidebar entry
**Files:** Create `src/lib/browse/recent-vaults.ts` + `.test.ts`; modify `src/components/VaultConnectDialog.tsx` (Recent section + push on connect), `src/components/Sidebar.tsx` (current-vault name + Switch), and the connect flow (`useVault`/AppShell) to record recents on successful connect. Source: spec §C.

**Interfaces (pure):** `RecentVault = { path: string; name: string; lastOpened: number }`; `addRecentVault(list: RecentVault[], entry: RecentVault, cap?=8): RecentVault[]` (dedupe by path, most-recent-first, capped); `getRecentVaults(): RecentVault[]` (reads `localStorage['cipher-recent-vaults']`, SSR-safe → `[]`); `removeRecentVault(list, path): RecentVault[]`. The list-transform fns are pure; the storage read/write wrap them.

- [ ] **Step 1 (TDD):** `recent-vaults.test.ts` — `addRecentVault` (new entry goes first; existing path moves to front, not duplicated; `lastOpened` updated; list capped to 8, oldest dropped); `removeRecentVault` (drops by path, preserves order). RED→implement `recent-vaults.ts`→GREEN. (Pure list fns; the storage wrappers read `localStorage` only in the browser, `[]` on server.)
- [ ] **Step 2 — record on connect:** when `vault.connect(path)` succeeds (in `useVault` or the dialog's submit + AppShell's connected handler), call the storage write with `{ path, name, lastOpened: Date.now() }`. (Date.now() in an event handler is fine — not render.)
- [ ] **Step 3 — dialog Recent section:** in `VaultConnectDialog`, read recents in a post-mount `useEffect` (SSR-safe) and render a "Recent" list at the top — each row = vault name + dimmed path, click → `connect(path)` (then close). Token-only, reuse the existing row styling. Below it, the existing path input + filesystem browser unchanged.
- [ ] **Step 4 — sidebar entry:** the generic "Connect a vault" row becomes: when `vault.connected`, show the current vault name + a "Switch" affordance (fires `cipher:open-vault-connect` or opens the dialog); when not connected, "Connect a vault". Token-only.
- [ ] **Step 5 — verify:** full gate. Dev-server check (pending-ok): connect a vault → it appears in Recent; switching via a recent row works; sidebar shows the current vault. Commit (`feat(vault): recent vaults + sidebar switch entry`).

## Task 3: LLM providers — API + CLI (largest, security-sensitive)
**Files:** Modify `src/lib/llm-settings.ts` (add `mode`/`cliPath` to `ProviderConfig` + `updateLLMSettings` patch + coerce + GET redaction); create `src/lib/chat/providers/cli.ts` + `cli.test.ts` (pure arg-builders + stdout parser), `src/lib/chat/detect-cli.ts` + `.test.ts`; modify `src/lib/chat/providers/index.ts` (`getActiveProvider` selects CLI impl when `mode==="cli"`), `src/app/api/chat/route.ts` (unchanged if it goes through `getActiveProvider`), `src/app/api/chat/health/route.ts` (CLI availability), `src/components/chat/ModelPicker.tsx` (mode toggle + CLI fields), `src/app/api/settings/llm/route.ts` (accept mode/cliPath). Source: spec §D.

**Interfaces:**
- `ProviderConfig` gains `mode?: "api" | "cli"` (default `"api"`) and `cliPath?: string`.
- `buildClaudeCliArgs(model: string): string[]` and `buildOllamaCliArgs(model: string): string[]` (pure; prompt goes via stdin, NOT args) — e.g. Claude `["-p", "--model", model]`-style, Ollama `["run", model]`. (Confirm exact flags against the installed CLIs; keep them in these pure builders.)
- `parseCliChunk(raw: string): string` / a streaming transform turning stdout into `{type:"token",text}` deltas matching the existing `ChatProvider.streamChat` async-iterator contract.
- `detectCli(binary: string, cliPath?: string): Promise<{ available: boolean; version?: string; path?: string }>`.
- `cli.ts` exports a factory `createCliProvider(kind: "claude" | "ollama", cliPath?: string): ChatProvider` whose `streamChat(model, messages)` spawns the binary and yields token deltas; `status()` uses `detectCli`.

- [ ] **Step 1 — settings (TDD):** extend `ProviderConfig` + `coerce` (read `mode`/`cliPath`) + `updateLLMSettings` merge + the GET `/api/settings/llm` redaction (return `mode`, `cliPath`, `hasKey`; never the key). Add/extend a settings test asserting `mode`/`cliPath` round-trip and keys stay redacted. RED→GREEN.
- [ ] **Step 2 — pure CLI builders + parser (TDD):** `cli.test.ts` — `buildClaudeCliArgs`/`buildOllamaCliArgs` return the expected argv (model wired, NO prompt in args); `parseCliChunk`/stream transform turns sample stdout into the right token deltas; assert NO shell metacharacters are ever interpolated. RED→implement `cli.ts` builders+parser→GREEN.
- [ ] **Step 3 — detectCli (TDD):** `detect-cli.test.ts` — parses a `--version` output into `{available,version}`; missing binary → `{available:false}`. Implement with `execFile` (no shell). RED→GREEN.
- [ ] **Step 4 — CLI provider impl:** `createCliProvider` — `streamChat` uses `spawn(cmd, argsArray)` (NO `shell:true`), writes the composed prompt to **stdin**, reads stdout, yields `{type:"token",text}` via the parser; handles process error/exit → throws the existing `ProviderDownError`/`ProviderModelMissingError` as appropriate; kills the child on abort/return (generator cleanup). `status()` → `detectCli`. **Security: validate `cliPath` exists + is executable; never build a shell string; prompt only via stdin/args-array.**
- [ ] **Step 5 — wire selection:** `getActiveProvider` returns `createCliProvider(...)` when the active provider is `anthropic`/`ollama-local` AND its `mode==="cli"`; else the existing API impl. `chat/health` reports CLI availability. The chat route is unchanged (it already calls `getActiveProvider().streamChat`).
- [ ] **Step 6 — ModelPicker UI:** for Claude + Ollama, add a `[API key | Use CLI]` mode toggle; CLI mode shows the detected binary + version (from health), a path-override input (`cliPath`), and a "not found — install hint" state; model list from the CLI where available (Ollama list; Claude known models). Token-only.
- [ ] **Step 7 — verify:** full gate (typecheck/test/build/lint+stylelint 0). Dev-server check (pending-ok): switch Claude to CLI mode with `claude` installed → a chat answer streams from the CLI; same for Ollama; missing-binary shows the install hint; API mode unchanged. Commit (`feat(chat): API+CLI providers (claude + ollama, injection-safe)`).

## Task 4: Full responsive pass (large)
**Files:** Modify `src/app/globals.css` (breakpoints, drawer, panel-stacking, full-screen dialogs); `src/components/AppShell.tsx` (mobile top bar + drawer state); `src/components/Sidebar.tsx` (drawer mode); `src/components/DetailPage.tsx` + reader panels (stack below content on phone); `src/components/browse/{BrowsePage,MapPage}.tsx` (touch/scroll); `VaultConnectDialog` + `CommandPalette` (full-screen on phone). Create `src/lib/hooks/useMediaQuery.ts` + `.test.ts`. Source: spec §E.

**Interfaces:** `useMediaQuery(query: string): boolean` (SSR-safe: false on server + first render, updates post-mount via matchMedia listener); a `useIsMobile()` convenience (`useMediaQuery("(max-width: 640px)")`).

- [ ] **Step 1 (TDD):** `useMediaQuery.test.tsx` (jsdom) — returns false initially (SSR-safe), updates when a mocked matchMedia fires `change`; cleans up the listener on unmount. RED→implement→GREEN.
- [ ] **Step 2 — phone shell:** on phone (`useIsMobile`), render a top bar with a hamburger that toggles an off-canvas **drawer** Sidebar (overlay + slide-in via the motion grammar, focus-trapped, Esc/backdrop to close, `prefers-reduced-motion` respected); `main` goes full-width. Keep desktop/tablet rendering unchanged (gate on the hook).
- [ ] **Step 3 — reader panels stack:** in `DetailPage`/`FileFullPage`, on phone the TOC + backlinks + outgoing + properties panels render **below** the content (single column) instead of a side column. CSS-driven where possible (media query); use the hook only where structure must change.
- [ ] **Step 4 — dialogs + touch surfaces:** `VaultConnectDialog` + `CommandPalette` go full-screen (or near-full) on phone (media query). Verify graph (`GraphCanvas`) + canvas (`CanvasView`) pan/zoom work with touch (Pointer Events) — fix if mouse-only. Confirm the existing 44px coarse-pointer + 16px-input rules apply.
- [ ] **Step 5 — globals breakpoints:** reconcile the existing 880px collapse with the new phone(<640)/tablet(640–1024)/desktop(>1024) breakpoints; ensure no desktop regression (desktop path unchanged). Token-only; no raw colors.
- [ ] **Step 6 — verify:** full gate. Dev-server visual check at phone/tablet/desktop widths (human eyeball — flag pending if no browser): drawer opens/closes, panels stack, dialogs full-screen, graph/canvas pan by touch, nothing overflows; desktop unchanged. Commit (`feat(ui): full responsive layout (phone drawer, stacked panels, tablet)`).

---

## Final verification
- [ ] typecheck 0 / test:unit pass / build green / lint 0 (eslint+stylelint).
- [ ] Hydration error gone (done). Tri-state theme cycles + follows OS live. Recents + sidebar switch work. Claude+Ollama CLI providers stream; API mode unchanged; CLI spawn is injection-safe. Phone/tablet/desktop all usable.
- [ ] No new deps. No stray uncommitted edits. Human visual pass on responsive + theme (no browser automation here).

## Spec coverage
| Spec workstream | Task |
|---|---|
| A Hydration | done (`3b54e21`) |
| B Dark mode tri-state | 1 |
| C Vault recents + sidebar | 2 |
| D API+CLI providers | 3 |
| E Full responsive | 4 |

## Self-review notes
- Pure cores (resolveTheme, recent-vaults, CLI builders/parser, detectCli, useMediaQuery) are the tested surfaces; UI/spawn/visual are gate+dev-server verified.
- Task 3 is security-sensitive (CLI spawn) → careful review: args-array spawn, no shell, prompt via stdin, validated path.
- Task 4 risk = desktop regression → all phone behavior gated behind `useIsMobile`/media queries; desktop path untouched.
- Exact CLI flags (Claude `-p`, Ollama `run`) live in the pure builders so they're test-locked and easy to correct.
