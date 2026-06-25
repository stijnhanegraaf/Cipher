"use client";

/**
 * Embed.tsx — Transclusion component for ![[...]] embeds.
 *
 * Renders one of:
 *   - image/pdf/av  → <img>/<embed>/<video> pointing at /api/vault/asset
 *   - note/section  → fetches /api/embed, renders nested MarkdownRenderer
 *
 * Recursion safety uses TWO independent React-context guards:
 *   1. Depth counter  — stops at MAX_EMBED_DEPTH (chip: depth-exceeded).
 *   2. Ancestor chain — stops on cycle (chip: cycle).
 * The server endpoint also enforces the depth cap as a backstop.
 */

import React, { useContext, useEffect, useState, createContext } from "react";
import { parseEmbed } from "@/lib/markdown/embed";
import { checkGuard, MAX_EMBED_DEPTH } from "@/lib/markdown/embed-guard";

// ─── Context ──────────────────────────────────────────────────────────────────

interface EmbedGuard {
  depth: number;
  ancestors: readonly string[];
}

export const EmbedGuardContext = createContext<EmbedGuard>({
  depth: 0,
  ancestors: [],
});

export function EmbedDepthProvider({
  depth,
  ancestors,
  children,
}: {
  depth: number;
  ancestors: readonly string[];
  children: React.ReactNode;
}) {
  const value: EmbedGuard = { depth, ancestors };
  return (
    <EmbedGuardContext.Provider value={value}>
      {children}
    </EmbedGuardContext.Provider>
  );
}

// ─── API response types ───────────────────────────────────────────────────────

interface EmbedSuccess {
  resolvedPath: string;
  body: string;
  anchorType: "whole" | "heading" | "block";
}

interface EmbedError {
  error: string;
  target?: string;
  anchor?: string;
}

type EmbedState =
  | { status: "loading" }
  | { status: "resolved"; data: EmbedSuccess }
  | { status: "not-found"; target: string }
  | { status: "section-not-found"; target: string; anchor: string }
  | { status: "depth-exceeded" }
  | { status: "cycle"; chain: readonly string[] }
  | { status: "error"; message: string };

// ─── Chip UI states (token-only colors) ──────────────────────────────────────

function Chip({
  color,
  children,
}: {
  color: "muted" | "warning" | "danger";
  children: React.ReactNode;
}) {
  const colorMap = {
    muted: {
      background: "color-mix(in srgb, var(--text-quaternary) 10%, transparent)",
      color: "var(--text-quaternary)",
      border: "color-mix(in srgb, var(--text-quaternary) 20%, transparent)",
    },
    warning: {
      background: "color-mix(in srgb, var(--hue-warning) 12%, transparent)",
      color: "color-mix(in srgb, var(--hue-warning) 70%, var(--text-primary))",
      border: "color-mix(in srgb, var(--hue-warning) 25%, transparent)",
    },
    danger: {
      background: "color-mix(in srgb, var(--hue-danger) 12%, transparent)",
      color: "color-mix(in srgb, var(--hue-danger) 70%, var(--text-primary))",
      border: "color-mix(in srgb, var(--hue-danger) 25%, transparent)",
    },
  };
  const style = colorMap[color];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: "0.8em",
        fontFamily: "var(--font-mono, monospace)",
        background: style.background,
        color: style.color,
        border: `1px solid ${style.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// ─── Embed component ──────────────────────────────────────────────────────────

interface EmbedProps {
  /** Raw inner text of the ![[...]] (URL-decoded). */
  inner: string;
  onNavigate?: (path: string) => void;
}

export function Embed({ inner, onNavigate }: EmbedProps) {
  const guard = useContext(EmbedGuardContext);
  const parsed = parseEmbed(inner);

  // ── Image / PDF / AV: bypass the note endpoint, render asset directly ───────
  if (parsed.kind === "image") {
    const src = `/api/vault/asset?path=${encodeURIComponent(parsed.target)}`;
    return (
      <figure style={{ margin: "16px 0", textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={parsed.alias ?? parsed.target}
          loading="lazy"
          decoding="async"
          style={{ maxWidth: "100%", borderRadius: 6 }}
        />
        {parsed.alias ? (
          <figcaption className="caption" style={{ color: "var(--text-tertiary)", marginTop: 6 }}>
            {parsed.alias}
          </figcaption>
        ) : null}
      </figure>
    );
  }

  if (parsed.kind === "pdf") {
    const src = `/api/vault/asset?path=${encodeURIComponent(parsed.target)}`;
    return (
      <div style={{ margin: "16px 0" }}>
        <embed
          src={src}
          type="application/pdf"
          style={{ width: "100%", minHeight: 480, borderRadius: 6, border: "1px solid var(--border-subtle)" }}
          title={parsed.alias ?? parsed.target}
        />
        {parsed.alias ? (
          <p className="caption" style={{ color: "var(--text-tertiary)", marginTop: 6, textAlign: "center" }}>
            {parsed.alias}
          </p>
        ) : null}
      </div>
    );
  }

  if (parsed.kind === "av") {
    const src = `/api/vault/asset?path=${encodeURIComponent(parsed.target)}`;
    const isAudio = /\.(mp3|wav|ogg|m4a)$/i.test(parsed.target);
    if (isAudio) {
      return (
        <figure style={{ margin: "16px 0" }}>
          <audio controls src={src} style={{ width: "100%" }} />
          {parsed.alias ? (
            <figcaption className="caption" style={{ color: "var(--text-tertiary)", marginTop: 6, textAlign: "center" }}>
              {parsed.alias}
            </figcaption>
          ) : null}
        </figure>
      );
    }
    return (
      <figure style={{ margin: "16px 0", textAlign: "center" }}>
        <video
          src={src}
          controls
          style={{ maxWidth: "100%", borderRadius: 6 }}
        />
        {parsed.alias ? (
          <figcaption className="caption" style={{ color: "var(--text-tertiary)", marginTop: 6 }}>
            {parsed.alias}
          </figcaption>
        ) : null}
      </figure>
    );
  }

  // ── Note embed ────────────────────────────────────────────────────────────
  return (
    <NoteEmbed
      target={parsed.target}
      anchor={parsed.anchor ?? ""}
      isBlock={parsed.isBlockRef}
      alias={parsed.alias}
      guard={guard}
      onNavigate={onNavigate}
    />
  );
}

// ─── NoteEmbed (async fetch + recursion guards) ───────────────────────────────

interface NoteEmbedProps {
  target: string;
  anchor: string;
  isBlock: boolean;
  alias: string | null;
  guard: EmbedGuard;
  onNavigate?: (path: string) => void;
}

function NoteEmbed({ target, anchor, isBlock, alias, guard, onNavigate }: NoteEmbedProps) {
  const [state, setState] = useState<EmbedState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Resolve the target via the embed endpoint to get the canonical path
      // for cycle detection. We pass depth so the server can backstop.
      const params = new URLSearchParams({ path: target, depth: String(guard.depth) });
      if (anchor) {
        params.set("anchor", anchor);
        if (isBlock) params.set("block", "1");
      }

      let res: Response;
      try {
        res = await fetch(`/api/embed?${params.toString()}`, { cache: "no-store" });
      } catch {
        if (!cancelled) setState({ status: "error", message: "Network error" });
        return;
      }

      if (cancelled) return;

      if (res.status === 409) {
        // Depth exceeded (server backstop) or no vault
        const body = await res.json() as EmbedError;
        if (body.error === "depth-exceeded") {
          setState({ status: "depth-exceeded" });
        } else {
          setState({ status: "error", message: body.error });
        }
        return;
      }

      if (!res.ok) {
        const body = await res.json() as EmbedError;
        if (body.error === "note-not-found") {
          setState({ status: "not-found", target });
        } else if (body.error === "section-not-found") {
          setState({ status: "section-not-found", target, anchor });
        } else {
          setState({ status: "error", message: body.error });
        }
        return;
      }

      const data = await res.json() as EmbedSuccess;

      // Client-side cycle + depth guard using resolved path.
      const guardResult = checkGuard(guard.depth, guard.ancestors, data.resolvedPath);
      if (!guardResult.ok) {
        if (guardResult.reason === "cycle") {
          setState({ status: "cycle", chain: [...guard.ancestors, data.resolvedPath] });
        } else {
          setState({ status: "depth-exceeded" });
        }
        return;
      }

      setState({ status: "resolved", data });
    }

    void load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, anchor, isBlock, guard.depth, guard.ancestors.join(",")]);

  if (state.status === "loading") {
    return (
      <div
        style={{
          padding: "8px 12px",
          borderRadius: 6,
          border: "1px solid var(--border-subtle)",
          color: "var(--text-quaternary)",
          fontSize: "0.875em",
          fontStyle: "italic",
        }}
        aria-label="Loading embed"
      >
        Loading…
      </div>
    );
  }

  if (state.status === "depth-exceeded") {
    return (
      <Chip color="muted">
        Embed depth limit reached (max {MAX_EMBED_DEPTH})
      </Chip>
    );
  }

  if (state.status === "cycle") {
    const chain = state.chain.map((p) => p.replace(/.*\//, "").replace(/\.md$/, ""));
    return (
      <Chip color="warning">
        Embed loop: {chain.join(" → ")}
      </Chip>
    );
  }

  if (state.status === "not-found") {
    return (
      <Chip color="danger">
        Embed not found: {state.target}
      </Chip>
    );
  }

  if (state.status === "section-not-found") {
    return (
      <Chip color="warning">
        Section &ldquo;{state.anchor}&rdquo; not found in {state.target}
      </Chip>
    );
  }

  if (state.status === "error") {
    return (
      <Chip color="danger">
        Embed error: {state.message}
      </Chip>
    );
  }

  // ── Resolved note: render nested MarkdownRenderer ─────────────────────────
  const { data } = state;
  const nextDepth = guard.depth + 1;
  const nextAncestors = [...guard.ancestors, data.resolvedPath];
  const displayName = alias ?? data.resolvedPath.replace(/.*\//, "").replace(/\.md$/, "");

  return (
    <EmbedDepthProvider depth={nextDepth} ancestors={nextAncestors}>
      <NestedNoteEmbed
        body={data.body}
        resolvedPath={data.resolvedPath}
        displayName={displayName}
        nextDepth={nextDepth}
        nextAncestors={nextAncestors}
        onNavigate={onNavigate}
      />
    </EmbedDepthProvider>
  );
}

// ─── Nested note embed renderer (lazy import to avoid circular dep) ───────────

interface NestedNoteEmbedProps {
  body: string;
  resolvedPath: string;
  displayName: string;
  nextDepth: number;
  nextAncestors: readonly string[];
  onNavigate?: (path: string) => void;
}

function NestedNoteEmbed({
  body,
  resolvedPath,
  displayName,
  nextDepth,
  nextAncestors,
  onNavigate,
}: NestedNoteEmbedProps) {
  // Lazy import to avoid circular: MarkdownRenderer imports components.tsx which
  // imports Embed.tsx which would import MarkdownRenderer. We use dynamic require
  // via React.lazy to break the cycle at render time.
  const [MR, setMR] = useState<React.ComponentType<{
    content: string;
    onNavigate?: (path: string) => void;
  }> | null>(null);

  useEffect(() => {
    import("@/components/ui/MarkdownRenderer").then((mod) => {
      setMR(() => mod.MarkdownRenderer);
    });
  }, []);

  if (!MR) {
    return (
      <div
        style={{
          padding: "8px 12px",
          borderRadius: 6,
          border: "1px solid var(--border-subtle)",
          color: "var(--text-quaternary)",
          fontSize: "0.875em",
          fontStyle: "italic",
        }}
      >
        Loading…
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: 6,
        padding: "8px 16px",
        margin: "8px 0",
        background: "color-mix(in srgb, var(--bg-surface) 60%, transparent)",
      }}
      data-embed-path={resolvedPath}
      data-embed-depth={nextDepth}
    >
      <div
        style={{
          fontSize: "0.75em",
          color: "var(--text-tertiary)",
          marginBottom: 8,
          paddingBottom: 4,
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span style={{ opacity: 0.6 }}>↗</span>
        {onNavigate ? (
          <button
            type="button"
            onClick={() => onNavigate(resolvedPath)}
            className="md-link"
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
          >
            {displayName}
          </button>
        ) : (
          <span>{displayName}</span>
        )}
      </div>
      <EmbedDepthProvider depth={nextDepth} ancestors={nextAncestors}>
        <MR content={body} onNavigate={onNavigate} />
      </EmbedDepthProvider>
    </div>
  );
}
