"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Kbd } from "@/components/ui";

/**
 * Slash-command menu for the chat input.
 *
 * When the user types `/` as the first character, this menu appears anchored
 * above the input. Arrow keys / j k navigate, Enter picks, Esc hides. Commands
 * either navigate to a route or run a chat query.
 */

export interface SlashCommandMenuProps {
  /** Current input value. The menu renders only when it starts with `/`. */
  value: string;
  /** Fires when user picks a command. Returns the text (if any) to set the
   *  input to — typically `""` to clear, or a prefix to keep typing (e.g.
   *  `"/search "`). */
  onSelect: (result: { clearInput: boolean }) => void;
  /** Called when the user wants to run a chat query (e.g. /today). */
  onAsk?: (query: string) => void;
}

interface Command {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
  run: (ctx: { router: ReturnType<typeof useRouter>; onAsk?: (q: string) => void; arg: string }) => void;
  /** Does this command accept an argument after the keyword? */
  takesArg?: boolean;
}

const COMMANDS: Command[] = [
  {
    id: "today",
    label: "/today",
    hint: "Open today's tasks",
    keywords: ["today", "tasks", "now", "open"],
    run: ({ router }) => router.push("/browse"),
  },
  {
    id: "timeline",
    label: "/timeline",
    hint: "Show the activity timeline",
    keywords: ["timeline", "history", "log", "recent"],
    run: ({ router }) => router.push("/browse/timeline"),
  },
  {
    id: "system",
    label: "/system",
    hint: "Vault health and system status",
    keywords: ["system", "health", "status", "checks"],
    run: ({ router }) => router.push("/browse/system"),
  },
  {
    id: "graph",
    label: "/graph",
    hint: "Visual graph of the vault",
    keywords: ["graph", "map", "visual", "connections"],
    run: ({ router }) => router.push("/browse/graph"),
  },
  {
    id: "files",
    label: "/files",
    hint: "Browse the file tree",
    keywords: ["files", "tree", "browse"],
    run: ({ router }) => router.push("/browse"),
  },
  {
    id: "search",
    label: "/search",
    hint: "Search your notes",
    keywords: ["search", "find", "query"],
    takesArg: true,
    run: ({ router, arg }) => {
      if (arg.trim()) router.push(`/browse/search?q=${encodeURIComponent(arg.trim())}`);
      else router.push("/browse/search");
    },
  },
  {
    id: "entity",
    label: "/entity",
    hint: "Open an entity by name",
    keywords: ["entity", "person", "company"],
    takesArg: true,
    run: ({ router, arg }) => {
      const name = arg.trim();
      if (name) router.push(`/browse/entity/${encodeURIComponent(name)}`);
    },
  },
  {
    id: "topic",
    label: "/topic",
    hint: "Open a project or topic by name",
    keywords: ["topic", "project", "research"],
    takesArg: true,
    run: ({ router, arg }) => {
      const name = arg.trim();
      if (name) router.push(`/browse/topic/${encodeURIComponent(name)}`);
    },
  },
];

export function SlashCommandMenu({ value, onSelect, onAsk }: SlashCommandMenuProps) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);

  const active = value.startsWith("/");

  // Parse "slash-command + optional arg" from the input.
  const { keyword, arg } = useMemo(() => {
    if (!active) return { keyword: "", arg: "" };
    const raw = value.slice(1); // drop leading slash
    const spaceIdx = raw.indexOf(" ");
    if (spaceIdx === -1) return { keyword: raw.toLowerCase(), arg: "" };
    return { keyword: raw.slice(0, spaceIdx).toLowerCase(), arg: raw.slice(spaceIdx + 1) };
  }, [value, active]);

  const matches = useMemo(() => {
    if (!active) return [];
    if (!keyword) return COMMANDS;
    return COMMANDS.filter((c) =>
      c.id.startsWith(keyword) ||
      c.keywords.some((k) => k.startsWith(keyword))
    );
  }, [active, keyword]);

  // Reset selection when matches change.
  useEffect(() => {
    setActiveIndex(0);
  }, [keyword]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!active) return;
      if (e.key === "ArrowDown" || (e.key === "j" && e.metaKey)) {
        e.preventDefault();
        setActiveIndex((i) => Math.min(matches.length - 1, i + 1));
      } else if (e.key === "ArrowUp" || (e.key === "k" && e.metaKey)) {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" && matches.length > 0) {
        e.preventDefault();
        const cmd = matches[activeIndex];
        cmd.run({ router, onAsk, arg });
        onSelect({ clearInput: true });
      } else if (e.key === "Escape") {
        e.preventDefault();
        onSelect({ clearInput: true });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, matches, activeIndex, arg, router, onAsk, onSelect]);

  if (!active || matches.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Slash commands"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "100%",
        marginBottom: 8,
        background: "var(--bg-tooltip)",
        border: "1px solid var(--border-standard)",
        borderRadius: 8,
        boxShadow: "var(--shadow-dialog)",
        overflow: "hidden",
        zIndex: 30,
        maxHeight: 280,
        overflowY: "auto",
      }}
    >
      {matches.map((cmd, i) => {
        const isActive = i === activeIndex;
        return (
          <button
            key={cmd.id}
            type="button"
            role="option"
            aria-selected={isActive}
            onMouseEnter={() => setActiveIndex(i)}
            onClick={() => {
              cmd.run({ router, onAsk, arg });
              onSelect({ clearInput: true });
            }}
            className="focus-ring"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "8px 12px",
              border: "none",
              background: isActive ? "var(--hover-row)" : "transparent",
              textAlign: "left",
              cursor: "pointer",
              color: "var(--text-primary)",
            }}
          >
            <span
              className="mono-label"
              style={{
                minWidth: 80,
                color: isActive ? "var(--accent-brand)" : "var(--text-tertiary)",
                letterSpacing: "0.02em",
                flexShrink: 0,
              }}
            >
              {cmd.label}
              {cmd.takesArg ? " …" : ""}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: "var(--text-secondary)" }}>
              {cmd.hint}
            </span>
            {isActive && (
              <span style={{ color: "var(--text-quaternary)" }}>
                <Kbd>↵</Kbd>
              </span>
            )}
          </button>
        );
      })}
      <div
        className="mono-label"
        style={{
          padding: "6px 12px",
          borderTop: "1px solid var(--border-subtle)",
          color: "var(--text-quaternary)",
          letterSpacing: "0.04em",
          display: "flex",
          gap: 12,
        }}
      >
        <span>↑↓ navigate</span>
        <span>↵ pick</span>
        <span>esc cancel</span>
      </div>
    </div>
  );
}
