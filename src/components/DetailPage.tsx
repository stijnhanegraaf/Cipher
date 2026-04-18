"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { MarkdownRenderer, Breadcrumbs } from "@/components/ui";
import { scrollReveal, springs } from "@/lib/motion";

// Theme-aware token indirection — values point to CSS custom properties
// defined in globals.css, so light/dark mode switching is automatic.
const theme = {
  bg: {
    marketing: "var(--bg-marketing)",
    panel: "var(--bg-panel)",
    surface: "var(--bg-surface)",
    secondary: "var(--bg-elevated)",
  },
  text: {
    primary: "var(--text-primary)",
    secondary: "var(--text-secondary)",
    tertiary: "var(--text-tertiary)",
    quaternary: "var(--text-quaternary)",
  },
  brand: {
    indigo: "var(--accent-brand)",
    violet: "var(--accent-violet)",
    hover: "var(--accent-hover)",
  },
  border: {
    subtle: "var(--border-subtle)",
    standard: "var(--border-standard)",
    solid: "var(--border-solid-primary)",
  },
};

// ─── Types ────────────────────────────────────────────────────────────

interface FileData {
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
  content: string;
  sections: { heading: string; level: number; body: string }[];
}

interface DetailPageProps {
  path: string;
  /** Optional section slug to scroll into view on mount (e.g. "thursday-apr-2-2026"). */
  anchor?: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
  /** Runs a chat query — used by breadcrumb section links to scope the view. */
  onAsk?: (query: string) => void;
  /** Called when the user clicks the breadcrumb's Home link. Typically clears chat. */
  onHome?: () => void;
  layoutId?: string;
}

// ─── Badge variant mapping for frontmatter fields ─────────────────────

function getBadgeVariant(value: string): "default" | "success" | "warning" | "indigo" | "outline" {
  const lower = value.toLowerCase();
  if (["active", "done", "complete", "healthy", "ok", "fresh", "live"].includes(lower)) return "success";
  if (["stale", "deprecated", "archived", "inactive"].includes(lower)) return "warning";
  if (["project", "entity", "system", "area"].includes(lower)) return "indigo";
  return "outline";
}

// ─── Table of Contents ─────────────────────────────────────────────────

function TableOfContents({
  sections,
  activeId,
  onItemClick,
}: {
  sections: { heading: string; level: number }[];
  activeId: string | null;
  onItemClick: (id: string) => void;
}) {
  return (
    <nav
      style={{
        position: "sticky",
        top: 80,
        maxHeight: "calc(100vh - 96px)",
        overflowY: "auto",
        width: 180,
        flexShrink: 0,
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 510,
          letterSpacing: "0.08em",
          textTransform: "uppercase" as const,
          color: theme.text.quaternary,
          marginBottom: 12,
        }}
      >
        On this page
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {sections.map((section) => {
          const id = `heading-${section.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          const isActive = activeId === id;
          const paddingLeft = (section.level - 1) * 16;

          return (
            <button
              key={id}
              onClick={() => onItemClick(id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: `4px ${8 + paddingLeft}px`,
                fontSize: 12,
                fontWeight: isActive ? 510 : 400,
                lineHeight: 1.5,
                color: isActive ? theme.text.secondary : theme.text.quaternary,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                borderRadius: 4,
                transition: "color var(--motion-hover) var(--ease-default), background var(--motion-hover) var(--ease-default)",
                textOverflow: "ellipsis",
                overflow: "hidden",
                whiteSpace: "nowrap" as const,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = theme.text.secondary;
                e.currentTarget.style.background = "var(--bg-surface-alpha-2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = isActive ? theme.text.secondary : theme.text.quaternary;
                e.currentTarget.style.background = "transparent";
              }}
            >
              {section.heading}
            </button>
          );
        })}
      </div>
    </nav>
  );
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
        padding: "8px 14px",
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

export function DetailPage({ path, anchor, onBack, onNavigate, onAsk, onHome, layoutId }: DetailPageProps) {
  const [data, setData] = useState<FileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch file data
  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    setEditMode(false);

    fetch(`/api/file?path=${encodeURIComponent(path)}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "File not found" : "Failed to load file");
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      // Scroll to anchor (if any) once content is rendered, then flash a
      // 2s brand-tinted highlight on the landed heading so the user sees
      // where the deep-link dropped them.
      .then(() => {
        if (!anchor) return;
        const id = `heading-${anchor}`;
        // Two rAF ticks so MarkdownRenderer has painted.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const el = scrollRef.current?.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
            if (!el) return;
            el.scrollIntoView({ block: "start", behavior: "smooth" });
            // Retrigger animation each time the path/anchor combination
            // changes by toggling the class.
            el.classList.remove("anchor-highlight");
            void el.offsetWidth;
            el.classList.add("anchor-highlight");
            window.setTimeout(() => el.classList.remove("anchor-highlight"), 2100);
          })
        );
      })
      .catch((err) => {
        setError(err.message || "Failed to load file");
        setLoading(false);
      });
  }, [path, anchor]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset scroll on path change
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [path]);

  // Intersection observer for active heading tracking
  useEffect(() => {
    if (!data || data.sections.length < 4) return;

    const container = scrollRef.current;
    if (!container) return;

    const headingElements = data.sections
      .map((s) => {
        const id = `heading-${s.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        return document.getElementById(id);
      })
      .filter(Boolean) as HTMLElement[];

    if (headingElements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveHeading(entry.target.id);
          }
        }
      },
      {
        root: container,
        rootMargin: "-80px 0px -60% 0px",
        threshold: 0,
      }
    );

    headingElements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [data]);

  // Scroll to heading
  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Determine which frontmatter keys to show as badges
  const frontmatterBadges = useMemo(() => {
    if (!data) return [];
    const badgeKeys = ["type", "area", "status", "kind", "priority", "freshness"];
    return badgeKeys
      .filter((key) => data.frontmatter[key] !== undefined)
      .map((key) => ({
        key,
        value: String(data.frontmatter[key]),
        variant: getBadgeVariant(String(data.frontmatter[key])),
      }));
  }, [data]);

  // Determine whether to show TOC
  const showToc = data && data.sections.length >= 4;

  // Obsidian URL for "Open in Obsidian" link
  const obsidianUrl = `obsidian://open?vault=Obsidian&file=${encodeURIComponent(path)}`;

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
      setData((prev) => prev ? { ...prev, content } : prev);
      setToastMessage({ text: "✓ Saved", type: "success" });
      setTimeout(() => { setSaveStatus("idle"); setToastMessage(null); }, 2000);
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
      saveFile(value);
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
            <Breadcrumbs path={path} onHome={onHome} onSection={onAsk} />

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
                    borderRadius: 4,
                    padding: "4px 12px",
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
            gap: 48,
          }}
        >
          {/* ── Main content column ──────────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0, maxWidth: 720 }}>
            <AnimatePresence mode="wait">
              {loading && (
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
              )}

              {/* F5: Error state with retry */}
              {error && (
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
                  {(() => {
                    const isNotFound = /not found|404/i.test(error || "");
                    const fileName = (path.split("/").pop() || path).replace(/\.md$/i, "");
                    return (
                      <>
                        <p
                          style={{
                            fontSize: 15,
                            fontWeight: 510,
                            color: theme.text.primary,
                            margin: 0,
                          }}
                        >
                          {isNotFound ? `Couldn't find "${fileName}"` : "Something went wrong"}
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
                              Search for "{fileName}"
                              <svg width={13} height={13} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={fetchData}
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
                      </>
                    );
                  })()}
                </motion.div>
              )}

              {data && (
                <motion.div
                  key={data.path}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                >
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
                      style={{
                        fontSize: 32,
                        fontWeight: 400,
                        lineHeight: 1.13,
                        letterSpacing: "-0.704px",
                        color: theme.text.primary,
                        margin: "16px 0 0",
                      }}
                    >
                      {data.title}
                    </motion.h1>
                  </ScrollRevealSection>

                  <ScrollRevealSection delay={0.16}>
                    {/* ── Frontmatter badges ────────────────────────────────── */}
                    {frontmatterBadges.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap" as const,
                          gap: 8,
                          marginTop: 16,
                        }}
                      >
                        {frontmatterBadges.map((badge) => (
                          <span
                            key={badge.key}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "4px 12px",
                              borderRadius: 9999,
                              fontSize: 12,
                              fontWeight: 510,
                              lineHeight: 1.4,
                              background:
                                badge.variant === "success"
                                  ? "color-mix(in srgb, var(--status-done) 12%, transparent)"
                                  : badge.variant === "warning"
                                    ? "color-mix(in srgb, var(--status-warning) 12%, transparent)"
                                    : badge.variant === "indigo"
                                      ? "color-mix(in srgb, var(--accent-brand) 12%, transparent)"
                                      : "transparent",
                              color:
                                badge.variant === "success"
                                  ? "var(--status-done)"
                                  : badge.variant === "warning"
                                    ? "var(--status-warning)"
                                    : badge.variant === "indigo"
                                      ? theme.brand.violet
                                      : theme.text.tertiary,
                              border:
                                badge.variant === "outline"
                                  ? `1px solid ${theme.border.subtle}`
                                  : badge.variant === "default"
                                    ? `1px solid ${theme.border.solid}`
                                    : badge.variant === "success"
                                      ? "1px solid color-mix(in srgb, var(--status-done) 20%, transparent)"
                                      : badge.variant === "warning"
                                        ? "1px solid color-mix(in srgb, var(--status-warning) 20%, transparent)"
                                        : "1px solid color-mix(in srgb, var(--accent-brand) 20%, transparent)",
                            }}
                          >
                            {badge.value}
                          </span>
                        ))}
                      </div>
                    )}
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
                            content={data.content}
                            onNavigate={onNavigate}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </ScrollRevealSection>
                </motion.div>
              )}
            </AnimatePresence>
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
                onItemClick={scrollToHeading}
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

      {/* ── Global animation keyframes ─────────────────────────────── */}
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
      </motion.div>
    </>
  );
}