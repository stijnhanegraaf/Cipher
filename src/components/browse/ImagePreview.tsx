"use client";
import { useEffect, useState } from "react";

export function ImagePreview({ filePath }: { filePath: string }) {
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const src = `/api/vault/asset?path=${encodeURIComponent(filePath)}`;
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
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", cursor: "zoom-in", borderRadius: 6 }}
        />
      </div>
      {zoom && (
        <div
          onClick={() => setZoom(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
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
