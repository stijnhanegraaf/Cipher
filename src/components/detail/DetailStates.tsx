"use client";

/**
 * DetailStates — loading skeleton + error/404 state for the detail sheet.
 *
 * Extracted from DetailPage.tsx (R: loading skeleton, S: error/404 block,
 * Y: keyframes). DetailPage renders <DetailStates> for non-data branches.
 */

import { motion } from "framer-motion";
import { theme } from "@/components/detail/detail-theme";

// ─── Skeleton ──────────────────────────────────────────────────────────

export function DetailSkeleton() {
  return (
    <>
      <motion.div
        key="loading"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ paddingTop: 160, maxWidth: 720 }}
      >
        {/* Skeleton shimmer lines */}
        <div className="skeleton-line" style={{ width: "60%", height: 32, borderRadius: 8 }} />
        <div className="skeleton-line" style={{ width: "80%", height: 16, borderRadius: 4, marginTop: 16 }} />
        <div className="skeleton-line" style={{ width: "100%", height: 14, borderRadius: 4, marginTop: 32 }} />
        <div className="skeleton-line" style={{ width: "90%", height: 14, borderRadius: 4, marginTop: 8 }} />
        <div className="skeleton-line" style={{ width: "70%", height: 14, borderRadius: 4, marginTop: 8 }} />
        <div className="skeleton-line" style={{ width: "85%", height: 14, borderRadius: 4, marginTop: 8 }} />
      </motion.div>

      {/* Keyframes live here alongside the skeleton that needs them. */}
      <style>{`
        @keyframes dot-pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        .skeleton-line {
          background: var(--bg-surface-alpha-2);
          position: relative;
          overflow: hidden;
        }
        .skeleton-line::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, var(--bg-surface-alpha-4), transparent);
          animation: skeleton-shimmer 1.5s ease-in-out infinite;
        }
        @keyframes skeleton-shimmer {
          0% { transform: translateX(0); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </>
  );
}

// ─── Error / 404 ───────────────────────────────────────────────────────

interface DetailErrorProps {
  error: string;
  path: string;
  onAsk?: (query: string) => void;
  onRetry: () => void;
}

export function DetailError({ error, path, onAsk, onRetry }: DetailErrorProps) {
  const isNotFound = /not found|404/i.test(error);
  const fileName = (path.split("/").pop() ?? path).replace(/\.md$/i, "");

  return (
    <motion.div
      key="error"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      style={{ paddingTop: 160, textAlign: "center" as const }}
    >
      <svg
        width={40}
        height={40}
        viewBox="0 0 24 24"
        fill="none"
        stroke={theme.text.quaternary}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ margin: "0 auto 24px" }}
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>

      <p
        style={{
          fontSize: 15,
          fontWeight: 510,
          color: theme.text.primary,
          margin: 0,
        }}
      >
        {isNotFound ? `Couldn't find "${fileName}"` : "Couldn't load this file"}
      </p>
      <p
        style={{
          fontSize: 13,
          color: theme.text.quaternary,
          marginTop: 8,
          maxWidth: 420,
          marginLeft: "auto",
          marginRight: "auto",
          lineHeight: 1.5,
        }}
      >
        {isNotFound
          ? "This link referenced a file that isn't in your vault. It may have been renamed, moved, or never existed."
          : error}
      </p>
      <div
        style={{
          marginTop: 24,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {isNotFound && onAsk && (
          <button
            onClick={() => onAsk(`search for ${fileName}`)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 510,
              color: "var(--text-on-brand)",
              background: theme.brand.indigo,
              border: "none",
              cursor: "pointer",
              transition: "background 120ms cubic-bezier(0.25, 0.1, 0.25, 1)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = theme.brand.violet; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = theme.brand.indigo; }}
          >
            Search for &quot;{fileName}&quot;
            <svg width={13} height={13} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        )}
        <button
          onClick={onRetry}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 510,
            color: "var(--text-secondary)",
            background: "var(--bg-surface-alpha-2)",
            border: "1px solid var(--border-standard)",
            cursor: "pointer",
            transition: "background 120ms cubic-bezier(0.25, 0.1, 0.25, 1)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-surface-alpha-4)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-surface-alpha-2)"; }}
        >
          <svg width={13} height={13} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4v6h6" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          Try again
        </button>
      </div>
      <p
        style={{
          marginTop: 24,
          fontSize: 11,
          color: "var(--text-quaternary)",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.02em",
        }}
      >
        {path}
      </p>
    </motion.div>
  );
}
