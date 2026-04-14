"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { MarkdownRenderer } from "@/components/ui";
import { scrollReveal, springs } from "@/lib/motion";

// Design tokens (from DESIGN.md)
const tokens = {
  bg: {
    marketing: "#08090a",
    panel: "#0f1011",
    surface: "#191a1b",
    secondary: "#28282c",
  },
  text: {
    primary: "#f7f8f8",
    secondary: "#d0d6e0",
    tertiary: "#8a8f98",
    quaternary: "#62666d",
  },
  brand: {
    indigo: "#5e6ad2",
    violet: "#7170ff",
    hover: "#828fff",
  },
  border: {
    subtle: "rgba(255,255,255,0.05)",
    standard: "rgba(255,255,255,0.08)",
    solid: "#23252a",
  },
};

const fontFamily = {
  inter: '"Inter Variable", "SF Pro Display", -apple-system, system-ui, sans-serif',
  mono: '"Berkeley Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
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
  onBack: () => void;
  onNavigate: (path: string) => void;
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
          fontFamily: fontFamily.inter,
          fontFeatureSettings: '"cv01", "ss03"',
          fontSize: 11,
          fontWeight: 510,
          letterSpacing: "0.08em",
          textTransform: "uppercase" as const,
          color: tokens.text.quaternary,
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
                color: isActive ? tokens.text.secondary : tokens.text.quaternary,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                borderRadius: 4,
                fontFamily: fontFamily.inter,
                fontFeatureSettings: '"cv01", "ss03"',
                transition: "color 0.15s, background 0.15s",
                textOverflow: "ellipsis",
                overflow: "hidden",
                whiteSpace: "nowrap" as const,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = tokens.text.secondary;
                e.currentTarget.style.background = "rgba(255,255,255,0.02)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = isActive ? tokens.text.secondary : tokens.text.quaternary;
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
function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: "spring", stiffness: 260, damping: 25 }}
      style={{
        position: "fixed",
        bottom: 96,
        left: "50%",
        transform: "translateX(-50%)",
        padding: "8px 16px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 510,
        fontFamily: fontFamily.inter,
        fontFeatureSettings: '"cv01", "ss03"',
        color: type === "success" ? "#ffffff" : "#ffffff",
        background: type === "success" ? "rgba(94,106,210,0.9)" : "rgba(239,68,68,0.9)",
        border: `1px solid ${type === "success" ? "rgba(113,112,255,0.3)" : "rgba(239,68,68,0.3)"}`,
        backdropFilter: "blur(16px)",
        zIndex: 100,
        pointerEvents: type === "error" ? "auto" : "none",
      }}
    >
      {message}
    </motion.div>
  );
}

// ─── DetailPage component ─────────────────────────────────────────────

export function DetailPage({ path, onBack, onNavigate, layoutId }: DetailPageProps) {
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
      .catch((err) => {
        setError(err.message || "Failed to load file");
        setLoading(false);
      });
  }, [path]);

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
  const saveFile = useCallback(async (content: string) => {
    if (!data) return;
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: data.path, content }),
      });
      if (res.ok) {
        setSaveStatus("saved");
        setData((prev) => prev ? { ...prev, content } : prev);
        setToastMessage({ text: "✓ Saved", type: "success" });
        setTimeout(() => { setSaveStatus("idle"); setToastMessage(null); }, 2000);
      } else {
        setSaveStatus("failed");
        setToastMessage({ text: "✗ Save failed", type: "error" });
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    } catch {
      setSaveStatus("failed");
      setToastMessage({ text: "✗ Save failed", type: "error" });
      setTimeout(() => setSaveStatus("idle"), 3000);
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
  const exitEditMode = useCallback((save = false) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (save && data) {
      saveFile(editContent).then(() => setEditMode(false));
    } else {
      setEditMode(false);
      setSaveStatus("idle");
    }
  }, [editContent, saveFile, data]);

  // ─── Toast auto-dismiss for error toasts ───────────────────────────
  useEffect(() => {
    if (toastMessage?.type === "error") {
      // Error toasts stay until dismissed (5s timeout)
      const t = setTimeout(() => setToastMessage(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toastMessage]);

  return (
    <>
      {/* D2: Backdrop overlay with fade */}
      <motion.div
        key={`backdrop-${path}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 49,
          backgroundColor: "#000000",
        }}
        onClick={onBack}
      />
      {/* D2: Slide panel */}
      <motion.div
        key={`panel-${path}`}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 260, damping: 25 }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#08090a",
          fontFamily: fontFamily.inter,
          fontFeatureSettings: '"cv01", "ss03"',
          color: tokens.text.primary,
          overflow: "hidden",
        }}
      >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header
        style={{
          flexShrink: 0,
          borderBottom: `1px solid ${tokens.border.subtle}`,
          backgroundColor: "#08090a",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "0 24px",
            height: 52,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Back button — 32px circle for alignment */}
            <button
              onClick={onBack}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.05)",
                border: "none",
                cursor: "pointer",
                color: tokens.text.tertiary,
                fontFamily: fontFamily.inter,
                fontFeatureSettings: '"cv01", "ss03"',
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = tokens.text.secondary;
                e.currentTarget.style.background = "rgba(255,255,255,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = tokens.text.tertiary;
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              }}
            >
              <svg
                width={16}
                height={16}
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

            {/* Edit / Save / Cancel buttons */}
            {data && !editMode && (
              <button
                onClick={enterEditMode}
                style={{
                  fontSize: 11,
                  fontWeight: 510,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.08em",
                  color: tokens.text.quaternary,
                  fontFamily: fontFamily.inter,
                  fontFeatureSettings: '"cv01", "ss03"',
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = tokens.brand.violet; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = tokens.text.quaternary; }}
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
                    color: tokens.text.primary,
                    fontFamily: fontFamily.inter,
                    fontFeatureSettings: '"cv01", "ss03"',
                    background: "rgba(255,255,255,0.06)",
                    border: `1px solid rgba(255,255,255,0.08)`,
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
                    color: tokens.text.quaternary,
                    fontFamily: fontFamily.inter,
                    fontFeatureSettings: '"cv01", "ss03"',
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
              <span style={{ fontSize: 11, color: tokens.text.quaternary, fontFamily: fontFamily.inter, fontFeatureSettings: '"cv01", "ss03"' }}>
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
                color: tokens.text.quaternary,
                fontSize: 11,
                fontWeight: 510,
                letterSpacing: "0.02em",
                textDecoration: "none",
                opacity: 0.5,
                fontFamily: fontFamily.inter,
                fontFeatureSettings: '"cv01", "ss03"',
                transition: "opacity 0.15s",
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
          scrollbarColor: `${tokens.text.quaternary} transparent`,
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
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: "spring", stiffness: 260, damping: 25 }}
                  style={{ paddingTop: 160, textAlign: "center" as const }}
                >
                  <svg
                    width={40}
                    height={40}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={tokens.text.quaternary}
                    strokeWidth={1.5}
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
                      color: tokens.text.primary,
                      fontFamily: fontFamily.inter,
                      fontFeatureSettings: '"cv01", "ss03"',
                      margin: 0,
                    }}
                  >
                    Something went wrong
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      color: tokens.text.quaternary,
                      marginTop: 8,
                      fontFamily: fontFamily.inter,
                      fontFeatureSettings: '"cv01", "ss03"',
                    }}
                  >
                    {error}
                  </p>
                  <button
                    onClick={fetchData}
                    style={{
                      marginTop: 24,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 16px",
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 510,
                      color: "#ffffff",
                      background: tokens.brand.indigo,
                      border: "none",
                      cursor: "pointer",
                      fontFamily: fontFamily.inter,
                      fontFeatureSettings: '"cv01", "ss03"',
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = tokens.brand.violet; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = tokens.brand.indigo; }}
                  >
                    <svg width={14} height={14} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 4v6h6" />
                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                    </svg>
                    Try again
                  </button>
                </motion.div>
              )}

              {data && (
                <motion.div
                  key={data.path}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <ScrollRevealSection delay={0}>
                    {/* ── File path breadcrumb ──────────────────────────────── */}
                    <p
                      style={{
                        fontSize: 12,
                        fontWeight: 510,
                        color: tokens.text.quaternary,
                        fontFamily: fontFamily.mono,
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
                        fontFamily: fontFamily.inter,
                        fontFeatureSettings: '"cv01", "ss03"',
                        fontSize: 32,
                        fontWeight: 400,
                        lineHeight: 1.13,
                        letterSpacing: "-0.704px",
                        color: tokens.text.primary,
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
                              fontFamily: fontFamily.inter,
                              fontFeatureSettings: '"cv01", "ss03"',
                              background:
                                badge.variant === "success"
                                  ? "rgba(16,185,129,0.12)"
                                  : badge.variant === "warning"
                                    ? "rgba(245,158,11,0.12)"
                                    : badge.variant === "indigo"
                                      ? "rgba(94,106,210,0.12)"
                                      : "transparent",
                              color:
                                badge.variant === "success"
                                  ? "#10b981"
                                  : badge.variant === "warning"
                                    ? "#f59e0b"
                                    : badge.variant === "indigo"
                                      ? tokens.brand.violet
                                      : tokens.text.tertiary,
                              border:
                                badge.variant === "outline"
                                  ? `1px solid ${tokens.border.subtle}`
                                  : badge.variant === "default"
                                    ? `1px solid ${tokens.border.solid}`
                                    : badge.variant === "success"
                                      ? "1px solid rgba(16,185,129,0.2)"
                                      : badge.variant === "warning"
                                        ? "1px solid rgba(245,158,11,0.2)"
                                        : "1px solid rgba(94,106,210,0.2)",
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
                        background: tokens.border.subtle,
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
                          transition={{ duration: 0.2 }}
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
                              fontFamily: fontFamily.mono,
                              color: tokens.text.secondary,
                              backgroundColor: "#0f1011",
                              border: `1px solid rgba(255,255,255,0.08)`,
                              borderRadius: 8,
                              resize: "vertical",
                              outline: "none",
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
                          transition={{ duration: 0.2 }}
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
          <Toast message={toastMessage.text} type={toastMessage.type} />
        )}
      </AnimatePresence>

      {/* ── Global animation keyframes ─────────────────────────────── */}
      <style>{`
        @keyframes dot-pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        .skeleton-line {
          background: rgba(255,255,255,0.03);
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
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent);
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