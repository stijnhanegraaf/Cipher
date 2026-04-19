"use client";

/**
 * QACard — one Q&A unit.
 *
 * Header — `ASKED · <ago>` label + the question text.
 * Body   — one of:
 *            • ViewRenderer (chat-summary) for intent envelopes.
 *            • StreamingText + SourcesRow for LLM answers.
 *            • ErrorRow for server-side errors.
 *            • IndexProgress while embeddings.json is being built.
 */

import { useState, useEffect } from "react";
import { ViewRenderer } from "@/components/views/ViewRenderer";
import type { ResponseEnvelope } from "@/lib/view-models";
import { StreamingText } from "./StreamingText";
import { CitationPill } from "./CitationPill";

export interface QATurnCitation {
  id: number;
  path: string;
  heading?: string;
  snippet: string;
}

export interface QATurn {
  id: string;
  query: string;
  createdAt: number;
  envelope?: ResponseEnvelope;
  text: string;
  citations: QATurnCitation[];
  status: "streaming" | "done" | "error";
  error?: { code: string; message: string };
  indexProgress?: { done: number; total: number };
}

interface Props {
  turn: QATurn;
}

export function QACard({ turn }: Props) {
  const [flashId, setFlashId] = useState<number | undefined>(undefined);

  const flash = (id: number) => {
    setFlashId(id);
    const el = document.querySelector<HTMLButtonElement>(`[data-turn="${turn.id}"] [data-citation-id="${id}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    window.setTimeout(() => setFlashId(undefined), 300);
  };

  return (
    <section data-turn={turn.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          className="mono-label"
          style={{ color: "var(--text-quaternary)", letterSpacing: "0.08em" }}
        >
          ASKED · {formatAgo(turn.createdAt)}
        </span>
        <h2
          className="question-serif"
          style={{
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          {turn.query}
        </h2>
      </header>

      {turn.envelope && (
        <div>
          {turn.envelope.response.views.map((v, i) => (
            <ViewRenderer key={v.viewId} view={v} index={i} variant="chat-summary" />
          ))}
        </div>
      )}

      {!turn.envelope && turn.error && <ErrorRow message={turn.error.message} />}

      {!turn.envelope && !turn.error && turn.indexProgress && turn.text.length === 0 && (
        <IndexProgress done={turn.indexProgress.done} total={turn.indexProgress.total} />
      )}

      {!turn.envelope && !turn.error && (turn.text.length > 0 || turn.status === "streaming") && (
        <StreamingText
          text={turn.text}
          active={turn.status === "streaming"}
          onCitationClick={flash}
        />
      )}

      {!turn.envelope && !turn.error && turn.citations.length > 0 && (
        <SourcesRow citations={turn.citations} flashId={flashId} />
      )}
    </section>
  );
}

function SourcesRow({ citations, flashId }: { citations: QATurnCitation[]; flashId?: number }) {
  const reducedMotion = useReducedMotion();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      <span
        className="mono-label"
        style={{
          color: "var(--text-quaternary)",
          letterSpacing: "0.08em",
          fontVariantNumeric: "tabular-nums",
          animation: reducedMotion
            ? undefined
            : `source-enter var(--motion-quick) var(--ease-spring-snap) both`,
        }}
      >
        SOURCES · {citations.length}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {citations.map((c, i) => (
          <div
            key={c.id}
            style={{
              animation: reducedMotion
                ? undefined
                : `source-enter var(--motion-quick) var(--ease-spring-snap) ${(i + 1) * 40}ms both`,
            }}
          >
            <CitationPill id={c.id} path={c.path} heading={c.heading} flashId={flashId} />
          </div>
        ))}
      </div>
    </div>
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function ErrorRow({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: "10px 12px",
        borderLeft: "2px solid var(--text-warning, #c37a00)",
        background: "var(--bg-surface-alpha-2)",
        color: "var(--text-secondary)",
        fontSize: 13,
        lineHeight: 1.5,
        borderRadius: 4,
      }}
    >
      {renderInlineCode(message)}
    </div>
  );
}

function renderInlineCode(s: string): React.ReactNode {
  const parts = s.split(/(`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith("`") && p.endsWith("`") ? (
      <code key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--bg-surface-alpha-4)", padding: "1px 4px", borderRadius: 4 }}>
        {p.slice(1, -1)}
      </code>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

function IndexProgress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.08em" }}>
        INDEXING VAULT · {done}/{total}
      </span>
      <div style={{ height: 4, background: "var(--bg-surface-alpha-2)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent-brand)", transition: "width 180ms var(--ease-default)" }} />
      </div>
    </div>
  );
}

function formatAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
