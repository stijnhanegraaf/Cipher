"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MarkdownRenderer } from "@/components/ui";

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
}

// ─── Badge variant mapping for frontmatter fields ─────────────────────

function getBadgeVariant(value: string): "default" | "success" | "warning" | "indigo" | "outline" {
  const lower = value.toLowerCase();
  if (["active", "done", "complete", "healthy", "ok", "fresh", "live"].includes(lower)) return "success";
  if (["stale", "deprecated", "archived", "inactive", "stale"].includes(lower)) return "warning";
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
          const paddingLeft = (section.level - 1) * 12;

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

// ─── DetailPage component ─────────────────────────────────────────────

export function DetailPage({ path, onBack, onNavigate }: DetailPageProps) {
  const [data, setData] = useState<FileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch file data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/file?path=${encodeURIComponent(path)}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "File not found" : "Failed to load file");
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Failed to load file");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
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
          {/* Back button — 28px circle */}
          <button
            onClick={onBack}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
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

          {/* Open in Obsidian — 11px quaternary, subtle */}
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
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "0.5";
            }}
          >
            Open in Obsidian
          </a>
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
            maxWidth: showToc ? 720 + 200 : 720,
            margin: "0 auto",
            padding: "0 32px 80px",
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
                  style={{
                    paddingTop: 160,
                    maxWidth: 720,
                  }}
                >
                  {/* Title shimmer */}
                  <div
                    style={{
                      width: "60%",
                      height: 28,
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.04)",
                      animation: "shimmer 2s ease-in-out infinite",
                    }}
                  />
                  {/* Subtitle shimmer */}
                  <div
                    style={{
                      width: "80%",
                      height: 16,
                      borderRadius: 4,
                      marginTop: 16,
                      background: "rgba(255,255,255,0.03)",
                      animation: "shimmer 2s ease-in-out infinite 0.3s",
                    }}
                  />
                  {/* Content shimmer lines */}
                  {["90%", "70%", "85%"].map((w, i) => (
                    <div
                      key={i}
                      style={{
                        width: w,
                        height: 14,
                        borderRadius: 4,
                        marginTop: 12,
                        background: "rgba(255,255,255,0.02)",
                        animation: `shimmer 2s ease-in-out infinite ${0.5 + i * 0.15}s`,
                      }}
                    />
                  ))}
                </motion.div>
              )}

              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    paddingTop: 160,
                    textAlign: "center" as const,
                  }}
                >
                  <svg
                    width={32}
                    height={32}
                    fill="none"
                    stroke={tokens.text.quaternary}
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    style={{ margin: "0 auto 16px" }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <p
                    style={{
                      fontSize: 15,
                      fontWeight: 400,
                      color: tokens.text.tertiary,
                      fontFamily: fontFamily.inter,
                      fontFeatureSettings: '"cv01", "ss03"',
                    }}
                  >
                    {error}
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      color: tokens.text.quaternary,
                      marginTop: 8,
                      fontFamily: fontFamily.mono,
                    }}
                  >
                    {path}
                  </p>
                  <button
                    onClick={() => {
                      setLoading(true);
                      setError(null);
                      // Re-trigger fetch by re-calling effect
                      // Simple: reload the page for now
                      window.location.reload();
                    }}
                    style={{
                      marginTop: 16,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 16px",
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 510,
                      color: tokens.text.secondary,
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${tokens.border.standard}`,
                      cursor: "pointer",
                      fontFamily: fontFamily.inter,
                      fontFeatureSettings: '"cv01", "ss03"',
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                    }}
                  >
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
                  {/* ── File path breadcrumb ──────────────────────────────── */}
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 510,
                      color: tokens.text.quaternary,
                      fontFamily: fontFamily.mono,
                      letterSpacing: "0.02em",
                      margin: "24px 0 0",
                    }}
                  >
                    {data.path}
                  </p>

                  {/* ── Title ─────────────────────────────────────────────── */}
                  <h1
                    style={{
                      fontFamily: fontFamily.inter,
                      fontFeatureSettings: '"cv01", "ss03"',
                      fontSize: 32,
                      fontWeight: 400,
                      lineHeight: 1.13,
                      letterSpacing: "-0.704px",
                      color: tokens.text.primary,
                      margin: "12px 0 0",
                    }}
                  >
                    {data.title}
                  </h1>

                  {/* ── Frontmatter badges ────────────────────────────────── */}
                  {frontmatterBadges.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap" as const,
                        gap: 6,
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
                            padding: "2px 10px",
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

                  {/* ── Divider ─────────────────────────────────────────────── */}
                  <div
                    style={{
                      height: 1,
                      background: tokens.border.subtle,
                      margin: "24px 0",
                    }}
                  />

                  {/* ── Rendered markdown ──────────────────────────────────── */}
                  <MarkdownRenderer
                    content={data.content}
                    onNavigate={onNavigate}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Table of Contents sidebar ──────────────────────────────── */}
          {showToc && data && (
            <div
              style={{
                paddingTop: 24,
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

      {/* ── Global animation keyframes ─────────────────────────────── */}
      <style>{`
        @keyframes dot-pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes shimmer {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}</style>
    </motion.div>
  );
}