"use client";

/**
 * useListNavigation — arrow/jk list navigation with Enter to activate.
 * Returns active index + key handler; scroll-into-view on change.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface ListNavigationOptions<T> {
  items: T[];
  /** Called with the currently-selected item when the user presses Enter. */
  onSelect?: (item: T, index: number) => void;
  /** Disabled by default — enable when the list is the active surface (e.g. palette open, chat empty). */
  enabled?: boolean;
  /** Loop past the ends? Default true. */
  loop?: boolean;
  /** Start index. Default 0. */
  initialIndex?: number;
  /** Also accept j/k vim bindings. Default true. */
  vim?: boolean;
}

/**
 * Keyboard-navigable list — the Linear soul.
 *
 * ↑ / ↓  move
 * j / k  also move (when vim=true)
 * Enter  selects
 * Home / End  jump to ends
 *
 * Usage:
 *   const { activeIndex, setActiveIndex, listProps, itemProps } = useListNavigation({
 *     items: results,
 *     enabled: open,
 *     onSelect: (r) => navigate(r.path),
 *   });
 *   return <div {...listProps}>{results.map((r, i) => <a {...itemProps(i)}>...</a>)}</div>
 */
export function useListNavigation<T>({
  items,
  onSelect,
  enabled = true,
  loop = true,
  initialIndex = 0,
  vim = true,
}: ListNavigationOptions<T>) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const containerRef = useRef<HTMLElement | null>(null);

  // Clamp active index when the list shrinks.
  useEffect(() => {
    if (items.length === 0) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= items.length) {
      setActiveIndex(items.length - 1);
    }
  }, [items.length, activeIndex]);

  const move = useCallback(
    (delta: number) => {
      setActiveIndex((current) => {
        if (items.length === 0) return 0;
        let next = current + delta;
        if (loop) {
          next = (next + items.length) % items.length;
        } else {
          next = Math.max(0, Math.min(items.length - 1, next));
        }
        return next;
      });
    },
    [items.length, loop]
  );

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      // Ignore when focus is inside an editable element other than the container.
      const target = e.target as HTMLElement | null;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        const isEditable = tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
        // If the container itself contains the editable, we still participate when arrow keys arrive
        // (command palette search input forwards arrows). Otherwise skip.
        if (isEditable && containerRef.current && !containerRef.current.contains(target)) return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          move(1);
          return;
        case "ArrowUp":
          e.preventDefault();
          move(-1);
          return;
        case "Home":
          e.preventDefault();
          setActiveIndex(0);
          return;
        case "End":
          e.preventDefault();
          setActiveIndex(Math.max(0, items.length - 1));
          return;
        case "Enter":
          if (items.length > 0) {
            const idx = Math.min(activeIndex, items.length - 1);
            onSelect?.(items[idx], idx);
            e.preventDefault();
          }
          return;
      }

      if (vim && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (e.key === "j") {
          e.preventDefault();
          move(1);
        } else if (e.key === "k") {
          e.preventDefault();
          move(-1);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, items, activeIndex, move, onSelect, vim]);

  const listProps = {
    ref: (el: HTMLElement | null) => {
      containerRef.current = el;
    },
    role: "listbox" as const,
    "aria-activedescendant": items.length > 0 ? `list-item-${activeIndex}` : undefined,
  };

  const itemProps = useCallback(
    (index: number) => ({
      id: `list-item-${index}`,
      role: "option" as const,
      "aria-selected": index === activeIndex,
      onMouseEnter: () => setActiveIndex(index),
      "data-active": index === activeIndex ? "true" : undefined,
    }),
    [activeIndex]
  );

  return {
    activeIndex,
    setActiveIndex,
    listProps,
    itemProps,
  };
}
