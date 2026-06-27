# Cipher Round 2 — Design Spec

- **Date:** 2026-06-28
- **Branch:** `refinement`
- **Status:** Approved design (decisions locked via Q&A), ready for implementation plan
- **Author:** Stijn (with Claude Opus 4.8)

## Purpose

A second round of work on Cipher: fix an active hydration bug, make dark mode a tri-state that tracks the OS live, make vault/library switching first-class (recents + sidebar entry point), add CLI-based LLM providers alongside the existing API ones, and make the whole UI fully responsive (phone/tablet/desktop).

## Locked decisions (from Q&A)

| # | Topic | Decision |
|---|---|---|
| 1 | Hydration bug | **DONE** (commit `3b54e21`) — `connectOpen`/`recentQueries` now SSR-safe + hydrate post-mount |
| 2 | LLM providers | **Both API + CLI.** Add `mode: "api" \| "cli"` to provider config; CLI mode for **Claude** (`claude` CLI) + **Ollama** (`ollama run`), auto-detected on PATH, command path overridable. GPT/OpenAI stays API-only. |
| 3 | Vault switching | **Polish + recents.** Recent-vaults list (1-click switch), sidebar shows current vault name + Switch, keep the path-input + `/api/fs` filesystem browser. |
| 4 | Dark mode | **Tri-state System / Light / Dark.** `System` follows the OS automatically + live (matchMedia listener). Default = System. |
| 5 | Responsive | **Full** — phone (drawer sidebar, stacked panels, touch, scrollable graph/canvas), tablet (adaptive), desktop (as-is). |

## Current state (grounding)

- **Theme:** `resolveTheme(stored, osDark)` in `src/lib/browse/resolve-theme.ts` already falls back to OS when `stored` is null, but: no live OS-change listener, and once toggled the choice sticks forever (no "System" option). Stored in `localStorage['brain-theme']` as `"light"|"dark"|null`. Pre-paint bootstrap inline `<script>` in `layout.tsx`; toggle in `AppShell.handleToggleTheme`; `window.__setThemeColor` syncs `meta theme-color`.
- **Providers:** `src/lib/chat/providers/` has `ollama.ts`, `openai.ts`, `anthropic.ts` + `types.ts` (`ChatProvider` interface: `id`, `streamChat`, `status`) + `index.ts`. `ProviderId = "ollama-local"|"ollama-cloud"|"openai"|"anthropic"`. Settings in `src/lib/llm-settings.ts` → `<vault>/.cipher/llm.json` (`{ provider, <perProvider>: { apiKey?, baseUrl? } }`). UI: `src/components/chat/ModelPicker.tsx`. Chat route: `src/app/api/chat/route.ts` (NDJSON streaming).
- **Vault:** `VaultConnectDialog.tsx` (path input + `/api/fs` browser), `useVault()` hook, `/api/vault` (GET/POST/DELETE hot-swap). Sidebar has a generic "Connect a vault" row.
- **Responsive:** `globals.css` collapses the framed shell below 880px (margins/radius zero, sidebar hides); coarse-pointer 44px rule + 16px-input rule exist. Not a real mobile layout (no drawer, panels don't restack).

## Goals / Non-goals

**Goals:** the 5 workstreams above, each token-only, TS-strict, lint+stylelint 0, TDD where logic exists, no behavior regressions to existing features.

**Non-goals (this round):** a native OS folder picker (impossible from a localhost web app — the `/api/fs` browser is the right tool); a GPT/OpenAI CLI (no clean general-chat CLI exists; GPT stays API-key); editing/writing beyond the existing daily-note + task-toggle; new chat features beyond provider plumbing.

---

## Workstream A — Hydration fix (DONE)

Already shipped (`3b54e21`). `AppShell` `connectOpen` + `recentQueries` start with SSR-safe defaults (closed/empty) and hydrate in a post-mount `useEffect`; the connect nudge opens once post-mount when no vault is connected and not dismissed this session. Documented here for completeness; no further work.

## Workstream B — Dark mode tri-state (System / Light / Dark)

**Model:** stored pref becomes `"system" | "light" | "dark"` in `localStorage['brain-theme']` (null → treated as `system`, back-compat). 
**Resolver:** extend `resolveTheme(pref, osDark)` — `system` → osDark, `light`/`dark` → literal. Keep null→system for old values.
**Live OS-follow (the new behavior):** a `useThemePreference` hook (or AppShell effect) registers a `matchMedia('(prefers-color-scheme: dark)')` `change` listener; when pref is `system`, an OS flip re-applies the `.light`/`.dark` class + `data-theme` + `window.__setThemeColor`. When pref is light/dark, the listener is a no-op.
**Bootstrap:** the pre-paint `<script>` in `layout.tsx` already reads `brain-theme` + matchMedia; update it to treat the value as `system|light|dark` (it already defaults unknown→OS, so mainly: don't treat `"system"` as a literal).
**Toggle UI:** replace the binary toggle with a 3-state control (cycle System → Light → Dark, or a small segmented control) showing the active state; writes the pref + calls `__setThemeColor`. Default first load (no stored pref) = System.
**Testable unit:** `resolveTheme` (extend its tests for `"system"`); the matchMedia wiring is verified on the dev server.

## Workstream C — Vault switching: recents + sidebar entry

**Recents store:** `localStorage['cipher-recent-vaults']` = `Array<{ path: string; name: string; lastOpened: number }>` (cap ~8, dedupe by path, most-recent first). A small pure module `src/lib/browse/recent-vaults.ts` (`addRecentVault`, `getRecentVaults`, `removeRecentVault`) — pure over an injected storage or returning the new array — unit-tested. Pushed on every successful `vault.connect`.
**Dialog:** `VaultConnectDialog` gains a "Recent" section at the top — each row = vault name + path, click → `connect(path)`. Below it, the existing path input + filesystem browser unchanged. (SSR-safe: read recents in a post-mount effect, same as the hydration fix.)
**Sidebar:** the generic "Connect a vault" row becomes: **current vault name** (when connected) + a **"Switch"** action that opens the dialog; when not connected, "Connect a vault". 
**Testable unit:** `recent-vaults.ts` (add/dedupe/cap/remove ordering).

## Workstream D — LLM providers: API + CLI

**Config:** extend `ProviderConfig` (llm-settings.ts) with `mode?: "api" | "cli"` and `cliPath?: string`. Default `mode` = `"api"`. CLI mode is offered only for `anthropic` (Claude) and `ollama-local` (Ollama).
**CLI provider impl:** new `src/lib/chat/providers/cli.ts` implementing `ChatProvider`. It `spawn`s the configured binary with an **args array (no `shell: true`, no string interpolation → injection-safe)**, sends the prompt via stdin or an arg, and streams stdout chunks into the chat stream. Per-provider command builders:
- **Claude:** `claude -p` (print/headless mode) — reuses the user's existing Claude login; prompt via stdin; stream stdout text.
- **Ollama:** `ollama run <model>` — prompt via stdin; stream stdout text.
**Detection:** a small `detectCli(name)` util (probe PATH, e.g. `execFile` of the binary with `--version`) reports availability + version; results surfaced in `ProviderStatus`. The `cliPath` setting overrides the PATH binary.
**Security (explicit):** the binary is launched with `execFile`/`spawn(cmd, argsArray)` — never a shell string; the prompt is never concatenated into a command; `cliPath` is validated to be an existing executable. This is a local-first tool running the user's own CLIs on their own machine — legitimate, implemented injection-safe.
**Routing:** `/api/chat` (and `chat/health`) select the impl by the active provider's `mode`. Existing API providers untouched in API mode.
**ModelPicker UI:** for Claude + Ollama, a `[API key | Use CLI]` mode toggle; CLI mode shows the detected binary + a path-override field + a "not found" state with install hint; model list from the CLI where available (`ollama list`; for Claude, the known model set).
**Testable units:** the per-provider arg/command builders (pure: given model+prompt → argv); the stdout→chunk parser; `detectCli` parsing. The actual spawn is integration-verified.

## Workstream E — Full responsive pass

**Breakpoints:** phone (`< 640px`), tablet (`640–1024px`), desktop (`> 1024px`) — reconcile with the existing 880px collapse.
**Phone:** sidebar becomes an off-canvas **drawer** (hamburger toggle in a top bar; overlay + slide-in, focus-trapped, Esc/backdrop to close); `main` full-width; reader side-panels (TOC, backlinks, outgoing, properties) **stack below content** instead of a side column; dialogs (connect, command palette) go **full-screen**; graph + canvas pan/zoom with touch (the pointer handlers should already work with touch via Pointer Events — verify); 44px targets (rule exists). 
**Tablet:** adaptive — single reading column with collapsible panels; sidebar may stay as a narrow rail or drawer.
**Desktop:** unchanged.
**Mechanism:** CSS-first (media queries / container queries in `globals.css` + component styles), plus a small `useMediaQuery`/`isMobile` hook for the drawer state and the panel-stacking switch. Token-only; no raw colors. Honor `prefers-reduced-motion` for the drawer slide.
**Verification:** dev-server visual pass at phone/tablet/desktop widths (human eyeball — no browser automation here); plus build/typecheck/lint. Any pure helper (e.g. breakpoint logic) unit-tested.

---

## Execution shape

One implementation plan, ~5 tasks (B dark-mode, C vault-recents, D providers [largest], E responsive [large]; A already done), each TDD-where-logic + reviewed, on **Sonnet**. D and E are the big ones; D is security-sensitive (CLI spawn) and gets a careful review; E is broad CSS + a drawer.

## Risks
- **CLI spawn (D):** injection safety — mitigated by args-array spawn (no shell), validated path, prompt via stdin. Streaming a child process into NDJSON needs care (backpressure, process cleanup on abort/unmount).
- **Responsive (E):** broad surface; risk of regressing desktop. Mitigation: additive media queries, desktop path unchanged, verify each surface.
- **Dark-mode live listener (B):** must not fight a manual override — the listener only acts when pref is `system`.
- **Recents (C):** SSR-safe read (post-mount), same discipline as the hydration fix.

## Spec coverage
| Workstream | Plan task |
|---|---|
| A Hydration | done (`3b54e21`) |
| B Dark mode tri-state | task 1 |
| C Vault recents + sidebar | task 2 |
| D API+CLI providers | task 3 |
| E Full responsive | task 4 |
