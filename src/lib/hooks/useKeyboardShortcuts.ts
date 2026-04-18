"use client";

/**
 * useKeyboardShortcuts — registers global hotkeys (e.g. focus input,
 * open palette, toggle theme). Ignores events inside editable targets.
 */

import { useEffect, RefObject } from "react";

type Modifier = "meta" | "ctrl" | "shift" | "alt";

export interface Shortcut {
  /** Primary key — e.g. "/", "Escape", "k". Matched against KeyboardEvent.key (case-insensitive for single letters). */
  key: string;
  /** Required modifier keys (subset). If omitted, no modifiers allowed. */
  modifiers?: readonly Modifier[];
  /** Fire handler only if none of the currently-focused elements match this predicate. Default: ignore when focus is inside an editable element. */
  when?: (target: EventTarget | null) => boolean;
  /** The action. Return true to prevent the default shortcut behavior. */
  handler: (e: KeyboardEvent) => void | boolean;
  /** Human-readable label for the hint system. Not required for the shortcut to fire. */
  description?: string;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function matchesModifiers(e: KeyboardEvent, required: readonly Modifier[] = []): boolean {
  const req = new Set(required);
  // Meta maps to Cmd on Mac, Win on Windows.
  if (e.metaKey !== req.has("meta")) return false;
  if (e.ctrlKey !== req.has("ctrl")) return false;
  if (e.shiftKey !== req.has("shift")) return false;
  if (e.altKey !== req.has("alt")) return false;
  return true;
}

/**
 * Global keyboard shortcut registry. Attach a stable list at the app root.
 *
 * Example:
 *   useKeyboardShortcuts([
 *     { key: "/", handler: () => inputRef.current?.focus(), description: "Focus chat" },
 *     { key: "Escape", handler: resetChat, description: "Return home" },
 *     { key: "k", modifiers: ["meta"], handler: openPalette, description: "Commands" },
 *   ]);
 *
 * By default, shortcuts with no modifiers do NOT fire while focus is inside an editable
 * element (input/textarea/contentEditable). Override per-shortcut with `when`.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      for (const sc of shortcuts) {
        if (!matchesModifiers(e, sc.modifiers)) continue;
        const keyMatches =
          sc.key.length === 1
            ? e.key.toLowerCase() === sc.key.toLowerCase()
            : e.key === sc.key;
        if (!keyMatches) continue;

        // Default gate: skip unmodified shortcuts when typing in a field.
        const hasModifier = sc.modifiers && sc.modifiers.length > 0;
        const gate = sc.when ?? ((t) => !isEditable(t));
        if (!hasModifier && !gate(e.target)) continue;
        if (sc.when && !sc.when(e.target)) continue;

        const result = sc.handler(e);
        if (result !== false) {
          e.preventDefault();
        }
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcuts]);
}

/**
 * Convenience: focus a ref when `/` is pressed, unless user is already typing.
 */
export function useSlashToFocus(ref: RefObject<HTMLElement | null>) {
  useKeyboardShortcuts([
    {
      key: "/",
      handler: () => {
        ref.current?.focus();
      },
      description: "Focus chat",
    },
  ]);
}
