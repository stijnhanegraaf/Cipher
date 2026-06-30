"use client";
import { useEffect, useState } from "react";

export function PdfPreview({ filePath }: { filePath: string }) {
  // Track which src caused the error (derived: pdfError = pdfErrorSrc === src).
  // Avoids a sync setState-in-effect for reset when filePath changes.
  const [pdfErrorSrc, setPdfErrorSrc] = useState<string | null>(null);
  const name = filePath.split("/").pop() ?? filePath;
  const src = `/api/vault/asset?path=${encodeURIComponent(filePath)}`;
  const pdfError = pdfErrorSrc === src;

  // Check asset reachability; iframes don't fire onerror reliably.
  useEffect(() => {
    let cancelled = false;
    fetch(src, { method: "HEAD" })
      .then((res) => { if (!cancelled && !res.ok) setPdfErrorSrc(src); })
      .catch(() => { if (!cancelled) setPdfErrorSrc(src); });
    return () => { cancelled = true; };
  }, [src]);

  if (pdfError) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24, height: "100%" }}>
        <div style={{ padding: 16, border: "1px solid var(--border-subtle)", borderRadius: 8, background: "var(--bg-surface-alpha-2)", textAlign: "center" }}>
          <div style={{ color: "var(--text-quaternary)", marginBottom: 8 }}>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <div className="small" style={{ color: "var(--text-tertiary)", marginBottom: 4 }}>{name}</div>
          <div className="caption" style={{ color: "var(--text-quaternary)" }}>PDF could not be loaded.</div>
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

  return <iframe src={src} title={filePath} style={{ width: "100%", height: "100%", border: 0 }} />;
}
