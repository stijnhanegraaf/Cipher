"use client";
import { useEffect, useState } from "react";
import { DEFAULT_PREFS, readPrefs, writePrefs, applyPrefsToCssVars, type ReaderPrefs } from "@/lib/browse/reader-prefs";

export function ReaderSettingsPanel({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<ReaderPrefs>(readPrefs);
  useEffect(() => { applyPrefsToCssVars(p); writePrefs(p); }, [p]);

  function patch<K extends keyof ReaderPrefs>(k: K, v: ReaderPrefs[K]) {
    setP((prev) => ({ ...prev, [k]: v }));
  }
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

  return (
    <div role="dialog" aria-label="Reader settings" style={{
      position: "absolute", right: 16, top: 48, width: 280,
      background: "var(--surface-raised)", border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-panel)", boxShadow: "var(--shadow-dialog)", padding: 12, zIndex: 40,
      color: "var(--text-primary)",
    }}>
      <Row label="Font">
        <select value={p.fontFamily} onChange={(e) => patch("fontFamily", e.target.value as ReaderPrefs["fontFamily"])}>
          <option value="sans">Sans</option>
          <option value="serif">Serif</option>
          <option value="mono">Mono</option>
        </select>
      </Row>
      <Row label="Size">
        <input type="number" min={12} max={20} value={p.fontSize} onChange={(e) => patch("fontSize", clamp(+e.target.value, 12, 20))} style={{ width: 60 }} />
      </Row>
      <Row label="Bold">
        <select value={p.boldWeight} onChange={(e) => patch("boldWeight", Number(e.target.value) as ReaderPrefs["boldWeight"])}>
          <option value={400}>Regular</option>
          <option value={500}>Medium</option>
          <option value={600}>Semibold</option>
          <option value={700}>Bold</option>
        </select>
      </Row>
      <Row label="Line height">
        <input type="number" min={1.3} max={2} step={0.1} value={p.lineHeight} onChange={(e) => patch("lineHeight", clamp(+e.target.value, 1.3, 2))} style={{ width: 60 }} />
      </Row>
      <Row label="Direction">
        <select value={p.direction} onChange={(e) => patch("direction", e.target.value as ReaderPrefs["direction"])}>
          <option value="ltr">LTR</option>
          <option value="rtl">RTL</option>
        </select>
      </Row>
      <Row label="Page width">
        <select value={p.pageWidth} onChange={(e) => patch("pageWidth", e.target.value as ReaderPrefs["pageWidth"])}>
          <option value="narrow">Narrow</option>
          <option value="comfortable">Comfortable</option>
          <option value="wide">Wide</option>
          <option value="custom">Custom</option>
        </select>
      </Row>
      {p.pageWidth === "custom" && (
        <Row label="Width (px)">
          <input type="number" min={400} max={1600} value={p.customWidthPx} onChange={(e) => patch("customWidthPx", clamp(+e.target.value, 400, 1600))} style={{ width: 80 }} />
        </Row>
      )}
      <Row label="Zoom">
        <input type="number" min={0.75} max={1.5} step={0.05} value={p.zoom} onChange={(e) => patch("zoom", clamp(+e.target.value, 0.75, 1.5))} style={{ width: 60 }} />
      </Row>
      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
        <button type="button" onClick={() => { setP(DEFAULT_PREFS); applyPrefsToCssVars(DEFAULT_PREFS); writePrefs(DEFAULT_PREFS); }}>
          Reset
        </button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
      <span className="caption" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      {children}
    </div>
  );
}
