"use client";

/**
 * /browse/tag/[tag] page — notes carrying a specific tag.
 */

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { useSheet } from "@/lib/hooks/useSheet";
import type { TagEntry } from "@/lib/vault-tags";

interface TagsResponse {
  tag: string;
  notes: TagEntry[];
  error?: string;
}

async function fetchTagNotes(tag: string): Promise<TagsResponse> {
  const res = await fetch(`/api/vault/tags?tag=${encodeURIComponent(tag)}`);
  if (!res.ok) return { tag, notes: [] };
  return res.json() as Promise<TagsResponse>;
}

export function TagPage({ tag }: { tag: string }) {
  const sheet = useSheet();
  const [notes, setNotes] = useState<TagEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchTagNotes(tag);
        if (!cancelled) setNotes(data.notes ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tag]);

  const subtitle = loading ? undefined : `${notes.length} ${notes.length === 1 ? "note" : "notes"}`;

  return (
    <PageShell
      title={`#${tag}`}
      subtitle={subtitle}
      contentMaxWidth={880}
    >
      <div style={{ padding: "24px 32px 80px" }}>
        {loading && (
          <p className="small" style={{ color: "var(--text-quaternary)" }}>Loading…</p>
        )}

        {!loading && notes.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "64px 32px",
              textAlign: "center",
              gap: 8,
            }}
          >
            <p className="small" style={{ color: "var(--text-tertiary)", margin: 0 }}>
              No notes tagged <strong>#{tag}</strong>
            </p>
            <p className="small" style={{ color: "var(--text-quaternary)", margin: 0 }}>
              Add <code>tags: {tag}</code> to a note&apos;s frontmatter to see it here.
            </p>
          </div>
        )}

        {!loading && notes.length > 0 && (
          <div>
            {notes.map((note) => (
              <NoteRow
                key={note.path}
                note={note}
                onOpen={() => sheet.open(note.path)}
              />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function NoteRow({ note, onOpen }: { note: TagEntry; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="app-row"
      onClick={onOpen}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "10px 12px",
        margin: "0 -12px",
        borderBottom: "1px solid var(--border-subtle)",
        background: "none",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        color: "inherit",
        borderBottomColor: "var(--border-subtle)",
        borderBottomStyle: "solid",
        borderBottomWidth: 1,
      }}
    >
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--text-quaternary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span
        className="small"
        style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}
      >
        {note.title}
      </span>
      <svg
        width={12}
        height={12}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--text-quaternary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
