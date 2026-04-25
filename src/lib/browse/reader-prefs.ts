"use client";

export interface ReaderPrefs {
  fontFamily: "sans" | "serif" | "mono";
  fontSize: number;     // px
  boldWeight: 400 | 500 | 600 | 700;
  lineHeight: number;   // 1.3..2.0
  direction: "ltr" | "rtl";
  pageWidth: "narrow" | "comfortable" | "wide" | "custom";
  customWidthPx: number;
  zoom: number;         // 0.75..1.5
}

// Crafted defaults — Instrument Serif at 17px/1.65 reads like a long-form
// document. Sans is one click away in the ReaderToolbar.
export const DEFAULT_PREFS: ReaderPrefs = {
  fontFamily: "serif",
  fontSize: 17,
  boldWeight: 600,
  lineHeight: 1.65,
  direction: "ltr",
  pageWidth: "comfortable",
  customWidthPx: 768,
  zoom: 1,
};

export const FONT_SIZE_MIN = 13;
export const FONT_SIZE_MAX = 22;

const KEY = "cipher.reader-prefs.v1";

export function readPrefs(): ReaderPrefs {
  if (typeof localStorage === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ReaderPrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch { return DEFAULT_PREFS; }
}

export function writePrefs(p: ReaderPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
}

const WIDTHS: Record<ReaderPrefs["pageWidth"], string> = {
  narrow: "56ch",
  comfortable: "72ch",
  wide: "96ch",
  custom: "var(--cipher-reader-custom-width, 768px)",
};

const FAMILIES: Record<ReaderPrefs["fontFamily"], string> = {
  sans: "var(--font-sans, ui-sans-serif, system-ui)",
  serif: "var(--font-serif, Georgia, 'Times New Roman', serif)",
  mono: "var(--font-mono, ui-monospace, Menlo, monospace)",
};

export function applyPrefsToCssVars(p: ReaderPrefs) {
  if (typeof document === "undefined") return;
  const r = document.documentElement;
  r.style.setProperty("--md-font", FAMILIES[p.fontFamily]);
  r.style.setProperty("--md-size", `${p.fontSize}px`);
  r.style.setProperty("--md-line-height", String(p.lineHeight));
  r.style.setProperty("--md-weight", String(p.boldWeight));
  r.style.setProperty("--md-dir", p.direction);
  r.style.setProperty("--md-max-width", WIDTHS[p.pageWidth]);
  r.style.setProperty("--cipher-reader-custom-width", `${p.customWidthPx}px`);
  r.style.setProperty("--md-zoom", String(p.zoom));
}
