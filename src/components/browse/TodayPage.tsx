"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, PageAction } from "@/components/PageShell";
import { TodayRow } from "@/components/browse/TodayRow";
import type { TodayPayload, TodayTask } from "@/lib/today-builder";

const FADE_DELAY_MS = 2000;
const UNDO_WINDOW_MS = 6000;
const UP_NEXT_CAP = 8;

export function TodayPage() {
  const router = useRouter();
  const [data, setData] = useState<TodayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Set of task ids currently "checked" — strikethrough + fading out.
   * When a task lands here we schedule a fade-out and removal from the list.
   */
  const [pendingCheck, setPendingCheck] = useState<Set<string>>(new Set());

  /** Undo toast — pops when a task is checked; clicking reverts. */
  const [undoTask, setUndoTask] = useState<TodayTask | null>(null);
  const [showMore, setShowMore] = useState(false);

  // ── Load data. ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/today");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Today fetch failed (${res.status})`);
        }
        const payload: TodayPayload = await res.json();
        if (!cancelled) setData(payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load today");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Toggle / undo handlers. ────────────────────────────────────────
  const writeToggle = useCallback(async (task: TodayTask, checked: boolean) => {
    return fetch("/api/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: task.path, lineIndex: task.lineIndex, checked }),
    });
  }, []);

  const handleToggle = useCallback(
    (task: TodayTask) => {
      // If already pending, clicking again is an immediate revert.
      if (pendingCheck.has(task.id)) {
        setPendingCheck((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
        setUndoTask(null);
        writeToggle(task, false).catch(() => {/* already reverted UI-side */});
        return;
      }

      // Optimistic check.
      setPendingCheck((prev) => {
        const next = new Set(prev);
        next.add(task.id);
        return next;
      });
      setUndoTask(task);

      // Write in background.
      writeToggle(task, true).catch(() => {
        // API failed — revert.
        setPendingCheck((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
        setUndoTask(null);
        alert("Couldn't save — reverted."); // simple fallback; richer toast in v7.1
      });

      // After 2s, remove from list.
      setTimeout(() => {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            today: prev.today.filter((t) => t.id !== task.id),
            upNext: prev.upNext.filter((t) => t.id !== task.id),
            counts: {
              ...prev.counts,
              today: Math.max(0, prev.counts.today - (prev.today.some((t) => t.id === task.id) ? 1 : 0)),
              upNext: Math.max(0, prev.counts.upNext - (prev.upNext.some((t) => t.id === task.id) ? 1 : 0)),
            },
          };
        });
        setPendingCheck((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }, FADE_DELAY_MS);

      // Auto-clear undo toast after the window.
      setTimeout(() => {
        setUndoTask((t) => (t?.id === task.id ? null : t));
      }, UNDO_WINDOW_MS);
    },
    [pendingCheck, writeToggle]
  );

  const handleUndo = useCallback(() => {
    if (!undoTask) return;
    const task = undoTask;
    // Revert UI: remove pending, re-add task into list (optimistic re-insert at top).
    setPendingCheck((prev) => {
      const next = new Set(prev);
      next.delete(task.id);
      return next;
    });
    setData((prev) => {
      if (!prev) return prev;
      const targetBucket = task.bucket === "today" ? "today" : "upNext";
      const list = prev[targetBucket];
      if (list.some((t) => t.id === task.id)) return prev;
      return { ...prev, [targetBucket]: [task, ...list] } as TodayPayload;
    });
    setUndoTask(null);
    // Revert file state.
    writeToggle(task, false).catch(() => {/* stuck if it fails; surface later */});
  }, [undoTask, writeToggle]);

  const handleAsk = useCallback((query: string) => router.push(`/chat?q=${encodeURIComponent(query)}`), [router]);

  // ── Derived. ───────────────────────────────────────────────────────
  const now = new Date();
  const dateLabel = useMemo(() =>
    now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  , []); // reconcile on first render only
  const subtitle = data
    ? `${dateLabel} · ${data.counts.today} open${data.counts.blocked > 0 ? ` · ${data.counts.blocked} blocked` : ""}`
    : dateLabel;

  const todayList = data?.today ?? [];
  const upNextList = data?.upNext ?? [];
  const upNextVisible = showMore ? upNextList : upNextList.slice(0, UP_NEXT_CAP);
  const upNextHiddenCount = upNextList.length - upNextVisible.length;

  // ── Render. ────────────────────────────────────────────────────────
  return (
    <PageShell
      icon={
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      }
      title="Today"
      subtitle={subtitle}
    >
      {loading && (
        <div style={{ padding: 32 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-shimmer"
              style={{
                height: 40,
                marginBottom: 4,
                borderRadius: 6,
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: 32 }}>
          <p className="caption-large" style={{ color: "var(--status-blocked)", marginBottom: 8 }}>
            Couldn't load today
          </p>
          <p className="small" style={{ color: "var(--text-tertiary)" }}>{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <section>
            <SectionHeader label="Today" count={todayList.length} />
            {todayList.length === 0 ? (
              <EmptyState body="No tasks for today. Quiet start." />
            ) : (
              todayList.map((task) => (
                <TodayRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  pendingCheck={pendingCheck.has(task.id)}
                  onAsk={handleAsk}
                />
              ))
            )}
          </section>

          {upNextList.length > 0 && (
            <section style={{ marginTop: 32 }}>
              <SectionHeader label="Up next" count={upNextList.length} />
              {upNextVisible.map((task) => (
                <TodayRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  pendingCheck={pendingCheck.has(task.id)}
                  onAsk={handleAsk}
                />
              ))}
              {upNextHiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowMore(true)}
                  className="focus-ring"
                  style={{
                    display: "block",
                    margin: "12px auto",
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "transparent",
                    border: "1px solid var(--border-standard)",
                    color: "var(--text-tertiary)",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Show more ({upNextHiddenCount})
                </button>
              )}
            </section>
          )}
        </>
      )}

      {/* Undo toast */}
      {undoTask && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: 24,
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--bg-tooltip)",
            border: "1px solid var(--border-standard)",
            color: "var(--text-primary)",
            fontSize: 13,
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            zIndex: 100,
            boxShadow: "var(--shadow-dialog)",
          }}
        >
          <span>Marked done — <span style={{ color: "var(--text-tertiary)", maxWidth: 220, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}>{undoTask.text}</span></span>
          <button
            type="button"
            onClick={handleUndo}
            className="focus-ring"
            style={{
              color: "var(--accent-brand)",
              background: "transparent",
              border: "none",
              fontWeight: 510,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Undo
          </button>
        </div>
      )}
    </PageShell>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div
      className="mono-label"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px 8px",
        color: "var(--text-tertiary)",
        letterSpacing: "0.04em",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <span>{label.toUpperCase()}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-quaternary)" }}>{count}</span>
    </div>
  );
}

function EmptyState({ body }: { body: string }) {
  return (
    <p
      className="small"
      style={{
        color: "var(--text-quaternary)",
        padding: "16px",
        margin: 0,
      }}
    >
      {body}
    </p>
  );
}
