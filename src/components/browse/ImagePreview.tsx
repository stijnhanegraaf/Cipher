"use client";
import { useEffect, useState } from "react";

export function ImagePreview({ filePath }: { filePath: string }) {
  const [zoom, setZoom] = useState(false);
  // Track which path caused the error (derived: imgError = imgErrorPath === filePath).
  // Avoids a sync setState-in-effect for reset when filePath changes.
  const [imgErrorPath, setImgErrorPath] = useState<string | null>(null);
  const imgError = imgErrorPath === filePath;
  const name = filePath.split("/").pop() ?? filePath;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const src = `/api/vault/asset?path=${encodeURIComponent(filePath)}`;
  if (imgError) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24, height: "100%" }}>
        <div style={{ padding: 16, border: "1px solid var(--border-subtle)", borderRadius: 8, background: "var(--bg-surface-alpha-2)", textAlign: "center" }}>
          <div style={{ color: "var(--text-quaternary)", marginBottom: 8 }}>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <div className="small" style={{ color: "var(--text-tertiary)", marginBottom: 4 }}>{name}</div>
          <div className="caption" style={{ color: "var(--text-quaternary)" }}>Image could not be loaded.</div>
          <a
            href={`${src}&download=1`}
            className="focus-ring caption"
            style={{ display: "inline-block", marginTop: 10, padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border-standard)", background: "var(--bg-surface)", textDecoration: "none", color: "var(--text-primary)" }}
          >
            Download
          </a>
        </div>
      </div>
    );
  }
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24, height: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={filePath}
          loading="lazy"
          decoding="async"
          onClick={() => setZoom(true)}
          onError={() => setImgErrorPath(filePath)}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", cursor: "zoom-in", borderRadius: 6 }}
        />
      </div>
      {zoom && (
        <div
          onClick={() => setZoom(false)}
          style={{
            position: "fixed", inset: 0, background: "var(--overlay)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={filePath} style={{ maxWidth: "95vw", maxHeight: "95vh", objectFit: "contain" }} />
        </div>
      )}
    </>
  );
}
