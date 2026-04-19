"use client";

/**
 * Composer — bottom-pinned chat input with auto-grow textarea.
 *
 * - 44px minimum, grows with content to ~140px (6 lines), then scrolls.
 * - Enter (no shift) submits; Shift+Enter inserts a newline.
 * - Leading `/` opens SlashCommandMenu, which captures Enter/arrows.
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
  /** Hide the ⌘↵ kbd hint (used by the centered empty-state composer). */
  hideKbd?: boolean;
  autoFocus?: boolean;
}

const MIN_H = 44;
const MAX_H = 140;

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { onSubmit, disabled, placeholder = "Ask anything — or /", hideKbd, autoFocus },
  ref
) {
  const [value, setValue] = useState("");
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
    el.style.height = Math.min(MAX_H, Math.max(MIN_H, el.scrollHeight)) + "px";
    el.style.overflowY = el.scrollHeight > MAX_H ? "auto" : "hidden";
  }, [value]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (value.startsWith("/")) return; // slash menu owns keys
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
        alignItems: "flex-end",
        gap: 8,
        padding: "8px 10px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-standard)",
        borderRadius: 10,
        transition: "border-color var(--motion-hover) var(--ease-default)",
      }}
      onFocusCapture={(e) => (e.currentTarget.style.borderColor = "var(--accent-brand)")}
      onBlurCapture={(e) => (e.currentTarget.style.borderColor = "var(--border-standard)")}
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
        style={{
          flex: 1,
          minHeight: MIN_H - 16,
          maxHeight: MAX_H,
          resize: "none",
          border: "none",
          outline: "none",
          background: "transparent",
          color: "var(--text-primary)",
          fontSize: 14,
          lineHeight: 1.5,
          fontFamily: "inherit",
        }}
      />
      {!hideKbd && (
        <span
          className="mono-label"
          style={{
            alignSelf: "center",
            color: "var(--text-quaternary)",
            letterSpacing: "0.02em",
            pointerEvents: "none",
          }}
        >
          ⌘↵
        </span>
      )}
    </div>
  );
});
