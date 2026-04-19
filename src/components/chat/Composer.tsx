"use client";

/**
 * Composer — chat input with auto-grow textarea.
 *
 * One-line rest height; grows up to 6 lines; then scrolls. Placeholder
 * baseline aligns with the ⌘↵ hint via shared line-height. Focus state
 * uses a 1px border + 3px alpha ring (no layout shift).
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { SlashCommandMenu } from "@/components/SlashCommandMenu";

export interface ComposerHandle {
  focus: () => void;
  setValue: (v: string) => void;
}

interface Props {
  onSubmit: (query: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Hide the ⌘↵ kbd hint. */
  hideKbd?: boolean;
  autoFocus?: boolean;
}

const LINE_H = 22;               // 14px × 1.55
const MAX_LINES = 6;
const MAX_H = LINE_H * MAX_LINES;

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { onSubmit, disabled, placeholder = "Ask anything, or / for commands", hideKbd, autoFocus },
  ref
) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    setValue: (v: string) => setValue(v),
  }));

  useEffect(() => {
    if (autoFocus) taRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(MAX_H, Math.max(LINE_H, el.scrollHeight));
    el.style.height = next + "px";
    el.style.overflowY = el.scrollHeight > MAX_H ? "auto" : "hidden";
  }, [value]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (value.startsWith("/")) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed && !disabled) {
        onSubmit(trimmed);
        setValue("");
      }
    }
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "11px 12px 11px 14px",
        background: "var(--bg-surface)",
        border: `1px solid ${focused ? "var(--accent-brand)" : "var(--border-standard)"}`,
        borderRadius: 12,
        boxShadow: focused
          ? "0 0 0 3px color-mix(in srgb, var(--accent-brand) 18%, transparent)"
          : "none",
        transition: "border-color var(--motion-hover) var(--ease-default), box-shadow var(--motion-hover) var(--ease-default)",
      }}
    >
      <SlashCommandMenu
        value={value}
        onSelect={() => setValue("")}
        onAsk={(q) => {
          onSubmit(q);
          setValue("");
        }}
      />
      <textarea
        ref={taRef}
        rows={1}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          height: LINE_H,
          maxHeight: MAX_H,
          padding: 0,
          resize: "none",
          border: "none",
          outline: "none",
          background: "transparent",
          color: "var(--text-primary)",
          fontSize: 14,
          lineHeight: `${LINE_H}px`,
          fontFamily: "inherit",
          display: "block",
        }}
      />
      {!hideKbd && (
        <span
          className="mono-label"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: LINE_H,
            padding: "0 6px",
            borderRadius: 4,
            border: "1px solid var(--border-subtle)",
            background: "var(--bg-surface-alpha-2)",
            color: "var(--text-quaternary)",
            letterSpacing: "0.02em",
            fontSize: 11,
            pointerEvents: "none",
            flexShrink: 0,
          }}
        >
          ⌘↵
        </span>
      )}
    </div>
  );
});
