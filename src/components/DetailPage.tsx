"use client";

/**
 * DetailPage — URL-driven overlay sheet (?sheet=<path>&anchor=<slug>).
 *
 * Renders a single vault file with TOC + frontmatter badges + inline
 * edit mode. Anchor scrolls + highlights on mount.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { MarkdownRenderer, Breadcrumbs } from "@/components/ui";
import { scrollReveal } from "@/lib/motion";
import { useRecentFiles } from "@/lib/hooks/useRecentFiles";
import { useVault } from "@/lib/hooks/useVault";
import { useFileContent } from "@/lib/hooks/useFileContent";
import { useAnchorScroll } from "@/lib/hooks/useAnchorScroll";
import { useActiveHeading } from "@/lib/hooks/useActiveHeading";
import { buildObsidianUri } from "@/lib/obsidian-uri";
import { log } from "@/lib/log";
import { theme } from "@/components/detail/detail-theme";
import { DetailSkeleton, DetailError } from "@/components/detail/DetailStates";
import { TableOfContents } from "@/components/detail/TableOfContents";
import { BacklinksPanel } from "@/components/browse/BacklinksPanel";
import { OutgoingLinksPanel } from "@/components/browse/OutgoingLinksPanel";
import { PropertiesPanel } from "@/components/detail/PropertiesPanel";

// ─── Types ────────────────────────────────────────────────────────────

interface DetailPageProps {
  path: string;
  /** Optional section slug to scroll into view on mount (e.g. "thursday-apr-2-2026"). */
  anchor?: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
  /** Runs a chat query — used by the "Search for X" fallback on 404. */
  onAsk?: (query: string) => void;
  /** Called when the user clicks the breadcrumb's Home link. Typically routes to /browse. */
  onHome?: () => void;
  /** Called when the user clicks the breadcrumb's section. Navigates to that
   *  folder's page (or opens a scoped drawer) — does NOT run a chat query. */
  onOpenSection?: (section: string, folderPath: string) => void;
  layoutId?: string;
}

// ─── ScrollRevealSection (E8) ──────────────────────────────────────────
function ScrollRevealSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      variants={scrollReveal}
      initial="hidden"
      animate={isInView ? "show" : "hidden"}
      custom={delay}
    >
      {children}
    </motion.div>
  );
}

// ─── Toast component (F6) ──────────────────────────────────────────────
function Toast({ message, type, onDismiss }: { message: string; type: "success" | "error"; onDismiss?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      role={type === "error" ? "alert" : "status"}
      onClick={type === "error" ? onDismiss : undefined}
      style={{
        position: "fixed",
        bottom: 96,
        left: "50%",
        transform: "translateX(-50%)",
        padding: "8px 16px",
        borderRadius: 8,
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
        fontWeight: 510,
        color: "var(--text-on-brand)",
        background: type === "success"
          ? "color-mix(in srgb, var(--accent-brand) 90%, transparent)"
          : "color-mix(in srgb, var(--status-blocked) 90%, transparent)",
        border: `1px solid color-mix(in srgb, ${type === "success" ? "var(--accent-brand)" : "var(--status-blocked)"} 30%, transparent)`,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        zIndex: 100,
        cursor: type === "error" ? "pointer" : "default",
        pointerEvents: type === "error" ? "auto" : "none",
      }}
    >
      <span>{message}</span>
      {type === "error" && (
        <span className="mono-label" style={{ opacity: 0.7, letterSpacing: "0.02em" }}>
          Click to dismiss
        </span>
      )}
    </motion.div>
  );
}

// ─── DetailPage component ─────────────────────────────────────────────

/**
 * Detail view for a single vault file.
 *
 * On mount (and whenever `path` changes), fetches `/api/file` for the
 * file's parsed content and renders the markdown. When `anchor` is set,
 * scrolls the matching heading into view and briefly highlights it.
 * Edit mode swaps the rendered body for a textarea with debounced
 * auto-save via PUT `/api/file`; status + toast feedback surface save
 * failures. Breadcrumbs + onBack/onHome route back out of the sheet.
 */
export function DetailPage({ path, anchor, onBack, onNavigate, onAsk, onHome, onOpenSection, layoutId }: DetailPageProps) {
  const { data, loading, error, reload } = useFileContent(path);
  // savedContent tracks the last successfully saved text so the renderer
  // reflects unsaved changes without requiring a re-fetch (replaces the
  // old setData optimistic update that mutated hook-owned state).
  const [savedContent, setSavedContent] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const { push: pushRecent } = useRecentFiles();
  const vault = useVault();

  useEffect(() => {
    if (path) pushRecent(path);
  }, [path, pushRecent]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Anchor scroll: fires after data is ready and MarkdownRenderer has painted.
  useAnchorScroll(scrollRef, data !== null, anchor);

  // Active heading tracking via IntersectionObserver (extracted to hook).
  const activeHeading = useActiveHeading(scrollRef, data?.sections ?? []);

  // Reset scroll + saved content override on path change
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
    setSavedContent(null);
  }, [path]);

  // Determine whether to show TOC
  const showToc = data && data.sections.length >= 4;

  // Obsidian URL for "Open in Obsidian" link
  const obsidianUrl = buildObsidianUri(vault.name, path);

  // ─── Save function ────────────────────────────────────────────────
  // Throws on non-ok so callers (e.g. exitEditMode with save=true) can stay
  // in edit mode and let the user retry. Error toast surfaces the reason.
  const saveFile = useCallback(async (content: string) => {
    if (!data) return;
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: data.path, content }),
      });
      if (!res.ok) {
        let message = `Save failed (${res.status})`;
        try {
          const body = await res.json();
          if (body && typeof body.error === "string") message = body.error;
        } catch {}
        setSaveStatus("failed");
        setToastMessage({ text: `✗ ${message}`, type: "error" });
        throw new Error(message);
      }
      setSaveStatus("saved");
      setSavedContent(content);
      setToastMessage({ text: "✓ Saved", type: "success" });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setSaveStatus("idle");
        setToastMessage(null);
        toastTimerRef.current = null;
      }, 2000);
    } catch (err) {
      setSaveStatus("failed");
      if (!(err instanceof Error && err.message.startsWith("Save failed"))) {
        // Network-level error — surface with a clean message.
        const message = err instanceof Error ? err.message : "Network error";
        setToastMessage({ text: `✗ ${message}`, type: "error" });
      }
      throw err;
    }
  }, [data]);

  // ─── Auto-save with debounce ──────────────────────────────────────
  const handleEditChange = useCallback((value: string) => {
    setEditContent(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveFile(value).catch((err) => {
        log.warn("detail", "auto-save failed", err);
      });
    }, 2000);
  }, [saveFile]);

  // ─── Enter edit mode ──────────────────────────────────────────────
  const enterEditMode = useCallback(() => {
    if (!data) return;
    setEditContent(data.content);
    setEditMode(true);
    setSaveStatus("idle");
  }, [data]);

  // ─── Exit edit mode ───────────────────────────────────────────────
  // If save fails, stay in edit mode so the user can retry. No silent loss.
  const exitEditMode = useCallback((save = false) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (save && data) {
      saveFile(editContent)
        .then(() => setEditMode(false))
        .catch(() => { /* keep edit mode open; toast already shown */ });
    } else {
      setEditMode(false);
      setSaveStatus("idle");
    }
  }, [editContent, saveFile, data]);

  // Error toasts persist until the user dismisses them (click or backdrop).
  // No auto-dismiss — users should see why the save failed.

  return (
    <>
      {/* Backdrop — lighter than black, blurred. Linear's sheet pattern. */}
      <motion.div
        key={`backdrop-${path}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 49,
          backgroundColor: "color-mix(in srgb, var(--bg-marketing) 60%, transparent)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
        onClick={onBack}
      />
      {/* Sheet — ease-out, no spring. 220ms: crisp, never overshoots. */}
      <motion.div
        key={`panel-${path}`}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--bg-marketing)",
          color: theme.text.primary,
          overflow: "hidden",
        }}
      >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header
        style={{
          flexShrink: 0,
          borderBottom: `1px solid ${theme.border.subtle}`,
          backgroundColor: "var(--bg-marketing)",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "0 24px",
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
            {/* Back button — compact 28px, ghost. Primary nav affordance is the breadcrumb. */}
            <button
              onClick={onBack}
              title="Back"
              aria-label="Back"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: theme.text.tertiary,
                transition: "background var(--motion-hover) var(--ease-default), color var(--motion-hover) var(--ease-default)",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = theme.text.primary;
                e.currentTarget.style.background = "var(--bg-surface-alpha-2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = theme.text.tertiary;
                e.currentTarget.style.background = "transparent";
              }}
            >
              <svg
                width={14}
                height={14}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Breadcrumbs: Home / section / filename. Section is clickable
                and scopes the chat to that area of the vault. */}
            <Breadcrumbs path={path} onHome={onHome} onSection={onOpenSection} />

            {/* Edit / Save / Cancel buttons */}
            {data && !editMode && (
              <button
                onClick={enterEditMode}
                style={{
                  fontSize: 11,
                  fontWeight: 510,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.08em",
                  color: theme.text.quaternary,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  transition: "color var(--motion-hover) var(--ease-default)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = theme.brand.violet; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = theme.text.quaternary; }}
              >
                Edit
              </button>
            )}
            {editMode && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={() => exitEditMode(true)}
                  style={{
                    fontSize: 11,
                    fontWeight: 510,
                    color: theme.text.primary,
                    background: "var(--bg-surface-alpha-4)",
                    border: "1px solid var(--border-standard)",
                    borderRadius: 6,
                    padding: "8px 16px",
                    cursor: "pointer",
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => exitEditMode(false)}
                  style={{
                    fontSize: 11,
                    fontWeight: 510,
                    color: theme.text.quaternary,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Auto-save indicator */}
            {editMode && saveStatus === "saving" && (
              <span style={{ fontSize: 11, color: theme.text.quaternary }}>
                Saving…
              </span>
            )}

            {/* Open in Obsidian */}
            <a
              href={obsidianUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: theme.text.quaternary,
                fontSize: 11,
                fontWeight: 510,
                letterSpacing: "0.02em",
                textDecoration: "none",
                opacity: 0.5,
                transition: "opacity var(--motion-hover) var(--ease-default)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; }}
            >
              Open in Obsidian
            </a>
          </div>
        </div>
      </header>

      {/* ── Content area ──────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          scrollbarWidth: "thin",
          scrollbarColor: `${theme.text.quaternary} transparent`,
        }}
      >
        <div
          style={{
            maxWidth: showToc ? 920 : 720,
            margin: "0 auto",
            padding: "0 24px 80px",
            display: showToc ? "flex" : "block",
            gap: 24,
          }}
        >
          {/* ── Main content column ──────────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0, maxWidth: 720 }}>
            <AnimatePresence mode="wait">
              {loading && <DetailSkeleton />}

              {error && (
                <DetailError
                  error={error}
                  path={path}
                  onAsk={onAsk}
                  onRetry={reload}
                />
              )}

              {data && (
                <motion.div
                  key={data.path}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="editorial-glow" style={{ margin: "0 -16px 0 -16px", padding: "8px 16px 0" }}>
                    <ScrollRevealSection delay={0}>
                      {/* ── File path breadcrumb ──────────────────────────────── */}
                      <p
                        style={{
                          fontSize: 12,
                          fontWeight: 510,
                          color: theme.text.quaternary,
                          fontFamily: "var(--font-mono)",
                          letterSpacing: "0.02em",
                          margin: "32px 0 0",
                        }}
                      >
                        {data.path}
                      </p>
                    </ScrollRevealSection>

                    <ScrollRevealSection delay={0.08}>
                      {/* ── Title ─────────────────────────────────────────────── */}
                      <motion.h1
                        layoutId={layoutId}
                        className="heading-2-serif"
                        style={{
                          color: theme.text.primary,
                          margin: "16px 0 0",
                        }}
                      >
                        {data.title}
                      </motion.h1>
                    </ScrollRevealSection>
                  </div>

                  <ScrollRevealSection delay={0.16}>
                    {/* ── Properties (frontmatter badges + tags) ────────────── */}
                    <PropertiesPanel
                      frontmatter={data.frontmatter}
                      content={data.content}
                    />
                  </ScrollRevealSection>

                  <ScrollRevealSection delay={0.24}>
                    {/* ── Divider ─────────────────────────────────────────────── */}
                    <div
                      style={{
                        height: 1,
                        background: theme.border.subtle,
                        margin: "32px 0",
                      }}
                    />
                  </ScrollRevealSection>

                  <ScrollRevealSection delay={0.32}>
                    {/* ── Content: Edit mode or Read mode ─────────────────────── */}
                    <AnimatePresence mode="wait">
                      {editMode ? (
                        <motion.div
                          key="edit"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                        >
                          <textarea
                            ref={textareaRef}
                            value={editContent}
                            onChange={(e) => handleEditChange(e.target.value)}
                            style={{
                              width: "100%",
                              minHeight: "calc(100vh - 240px)",
                              padding: "16px 24px",
                              fontSize: 14,
                              lineHeight: 1.6,
                              fontFamily: "var(--font-mono)",
                              color: theme.text.secondary,
                              backgroundColor: "var(--bg-panel)",
                              border: "1px solid var(--border-standard)",
                              borderRadius: 8,
                              resize: "vertical",
                              tabSize: 2,
                            }}
                            onKeyDown={(e) => {
                              if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                                e.preventDefault();
                                exitEditMode(true);
                              }
                              if (e.key === "Escape") {
                                exitEditMode(false);
                              }
                            }}
                          />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="read"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                        >
                          <MarkdownRenderer
                            content={savedContent ?? data.content}
                            onNavigate={onNavigate}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </ScrollRevealSection>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Outgoing links (forward links + broken) ───────────────── */}
            {data && !editMode && (
              <OutgoingLinksPanel path={path} onNavigate={onNavigate} variant="sidebar" />
            )}

            {/* ── Backlinks (linked mentions) ────────────────────────────── */}
            {data && !editMode && (
              <BacklinksPanel path={path} onNavigate={onNavigate} variant="sidebar" />
            )}
          </div>

          {/* ── Table of Contents sidebar ──────────────────────────────── */}
          {showToc && data && !editMode && (
            <div
              style={{
                paddingTop: 32,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <TableOfContents
                sections={data.sections.map((s) => ({
                  heading: s.heading,
                  level: s.level,
                }))}
                activeId={activeHeading}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Toast (F6) ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {toastMessage && (
          <Toast
            message={toastMessage.text}
            type={toastMessage.type}
            onDismiss={() => setToastMessage(null)}
          />
        )}
      </AnimatePresence>

      </motion.div>
    </>
  );
}