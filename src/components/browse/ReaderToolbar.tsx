"use client";

/**
 * ReaderToolbar — document-level chrome mounted above the markdown surface.
 *
 * Splits reading concerns (font, size, raw-markdown toggle, open-full) out of
 * PreviewHeader (which stays navigational: breadcrumb + pin). Lives inside
 * the reading column so its max-width aligns with the body text below it.
 */

import { useMod } from "@/lib/hooks/useMod";
import { useReaderPrefs } from "@/lib/hooks/useReaderPrefs";
import { IconButton } from "@/components/ui/IconButton";
import { encodeVaultPath } from "@/lib/browse/path";

interface Props {
  filePath: string;
  mode: "rendered" | "source";
  onToggleMode: () => void;
}

export function ReaderToolbar({ filePath, mode, onToggleMode }: Props) {
  const mod = useMod();
  const { prefs, setFamily, bumpSize, resetSize } = useReaderPrefs();

  return (
    <div
      role="toolbar"
      aria-label="Reading controls"
      className="reader-toolbar"
    >
      <div className="reader-toolbar__group" role="group" aria-label="Font family">
        <button
          type="button"
          className="reader-chip focus-ring"
          aria-pressed={prefs.fontFamily === "serif"}
          onClick={() => setFamily("serif")}
          title="Serif"
          style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: 14 }}
        >
          Aa
        </button>
        <button
          type="button"
          className="reader-chip focus-ring"
          aria-pressed={prefs.fontFamily === "sans"}
          onClick={() => setFamily("sans")}
          title="Sans"
          style={{ fontFamily: "var(--font-sans, ui-sans-serif)", fontSize: 13 }}
        >
          Aa
        </button>
      </div>

      <span className="reader-toolbar__divider" aria-hidden="true" />

      <div className="reader-toolbar__group" role="group" aria-label="Font size">
        <IconButton
          aria-label="Decrease font size"
          title="Decrease size"
          onClick={() => bumpSize(-1)}
          style={{ border: "none" }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M5 12h14" />
          </svg>
        </IconButton>
        <button
          type="button"
          className="reader-size focus-ring"
          onClick={resetSize}
          aria-label={`Font size ${prefs.fontSize} pixels, click to reset`}
          title="Reset size"
        >
          {prefs.fontSize}
        </button>
        <IconButton
          aria-label="Increase font size"
          title="Increase size"
          onClick={() => bumpSize(1)}
          style={{ border: "none" }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </IconButton>
      </div>

      <span className="reader-toolbar__spacer" />

      <IconButton
        aria-label={mode === "source" ? "Show rendered" : "Show source"}
        title={`Toggle raw (${mod}⇧M)`}
        onClick={onToggleMode}
        pressed={mode === "source"}
        style={{ border: "none" }}
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </IconButton>
      <IconButton
        href={`/file/${encodeVaultPath(filePath)}`}
        aria-label="Open full view"
        title="Open full view"
        style={{ border: "none" }}
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6M10 14L21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
        </svg>
      </IconButton>
    </div>
  );
}
