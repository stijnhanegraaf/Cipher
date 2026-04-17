"use client";

import { useEffect, useRef, useState } from "react";
import { SlashCommandMenu } from "@/components/SlashCommandMenu";

interface Props {
  onSubmit: (query: string) => void;
}

/**
 * ChatEmptyState — Raycast-style pure input. Shown when /chat has no messages.
 * Nothing else renders on the page: no chips, no recent, no tasks.
 */
export function ChatEmptyState({ onSubmit }: Props) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // When the slash menu is open it captures Enter itself (window-level listener).
    if (value.startsWith("/")) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSubmit(value.trim());
    }
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: "20dvh",
        gap: 20,
        background: "var(--bg-marketing)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "var(--accent-brand)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 24px color-mix(in srgb, var(--accent-brand) 25%, transparent), 0 0 0 1px rgba(255,255,255,0.06) inset",
        }}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--text-on-brand)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </div>

      <h1
        className="heading-3"
        style={{
          color: "var(--text-tertiary)",
          margin: 0,
          fontWeight: 500,
        }}
      >
        Ask about your vault
      </h1>

      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 520,
          padding: "0 16px",
        }}
      >
        <SlashCommandMenu
          value={value}
          onSelect={() => setValue("")}
        />
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a question — or /"
          className="focus-ring"
          style={{
            width: "100%",
            height: 44,
            padding: "12px 64px 12px 14px",
            borderRadius: 8,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-standard)",
            color: "var(--text-primary)",
            fontSize: 14,
            lineHeight: 1.4,
            resize: "none",
            outline: "none",
            fontFamily: "inherit",
            transition: "border-color var(--motion-hover) var(--ease-default)",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-brand)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-standard)")}
        />
        <span
          className="mono-label"
          style={{
            position: "absolute",
            right: 26,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-quaternary)",
            letterSpacing: "0.02em",
            pointerEvents: "none",
          }}
        >
          ⌘↵
        </span>
      </div>
    </div>
  );
}
