"use client";

import Link from "next/link";
import { useSidebarPins } from "@/lib/hooks/useSidebarPins";
import { encodeVaultPath } from "@/lib/browse/path";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  folderPath: string;
  filePath: string | null;
  mode: "rendered" | "source";
  onToggleMode: () => void;
  onOpenSettings: () => void;
}

const iconBtn: React.CSSProperties = {
  width: 26,
  height: 24,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  borderRadius: 6,
  border: "1px solid var(--border-subtle)",
  background: "transparent",
  color: "var(--text-tertiary)",
  cursor: "pointer",
  flexShrink: 0,
};

export function LeftPaneFooter({ folderPath, filePath, mode, onToggleMode, onOpenSettings }: Props) {
  const { pins, addPin, removePin } = useSidebarPins();
  const pinned = pins.find((p) => p.path === folderPath);
  const isMd = !!filePath && filePath.toLowerCase().endsWith(".md");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 10px",
        borderTop: "1px solid var(--border-subtle)",
        flexShrink: 0,
        flexWrap: "wrap",
      }}
    >
      <ThemeToggle />
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Reader settings"
        title="Reader settings"
        className="focus-ring"
        style={iconBtn}
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7V4h16v3M9 20h6M12 4v16" />
        </svg>
      </button>
      {folderPath && (
        <button
          type="button"
          onClick={() => {
            if (pinned) removePin(pinned.id);
            else addPin({ label: folderPath.split("/").pop() ?? folderPath, path: folderPath, icon: "folder" });
          }}
          aria-label={pinned ? "Unpin folder" : "Pin folder"}
          title={pinned ? "Unpin folder" : "Pin folder"}
          className="focus-ring"
          style={{
            ...iconBtn,
            background: pinned ? "var(--bg-surface-alpha-4)" : "transparent",
            color: pinned ? "var(--text-primary)" : "var(--text-tertiary)",
          }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 17v5M5 9l7-7 7 7v4l-3 2H8L5 13V9z" />
          </svg>
        </button>
      )}
      <div style={{ flex: 1 }} />
      {isMd && (
        <button
          type="button"
          onClick={onToggleMode}
          aria-pressed={mode === "source"}
          title="Toggle source (⌘⇧M)"
          aria-label={mode === "source" ? "Show rendered" : "Show source"}
          className="focus-ring"
          style={{
            ...iconBtn,
            background: mode === "source" ? "var(--bg-surface-alpha-4)" : "transparent",
            color: mode === "source" ? "var(--text-primary)" : "var(--text-tertiary)",
          }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </button>
      )}
      {isMd && (
        <Link
          href={`/file/${encodeVaultPath(filePath!)}`}
          aria-label="Open full view"
          title="Open full view"
          className="focus-ring"
          style={{ ...iconBtn, textDecoration: "none" }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M10 14L21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
          </svg>
        </Link>
      )}
    </div>
  );
}
