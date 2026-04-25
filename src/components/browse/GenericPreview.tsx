"use client";
import { useState } from "react";

export function GenericPreview({ filePath }: { filePath: string }) {
  const [revealing, setRevealing] = useState(false);
  const name = filePath.split("/").pop() ?? filePath;
  const reveal = async () => {
    setRevealing(true);
    try {
      await fetch("/api/vault/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: filePath }),
      });
    } finally { setRevealing(false); }
  };
  return (
    <div style={{ padding: 24 }}>
      <div style={{ padding: 16, border: "1px solid var(--border-subtle)", borderRadius: 8, background: "var(--bg-surface-alpha-2)", maxWidth: 480 }}>
        <div style={{ fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>{name}</div>
        <div className="caption" style={{ color: "var(--text-tertiary)", marginBottom: 12, wordBreak: "break-all" }}>{filePath}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={reveal}
            disabled={revealing}
            className="focus-ring caption"
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-standard)", background: "var(--bg-surface)", cursor: revealing ? "default" : "pointer" }}
          >
            Reveal in Finder
          </button>
          <a
            href={`/api/vault/asset?path=${encodeURIComponent(filePath)}&download=1`}
            className="focus-ring caption"
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-standard)", background: "var(--bg-surface)", textDecoration: "none", color: "var(--text-primary)" }}
          >
            Download
          </a>
        </div>
      </div>
    </div>
  );
}
