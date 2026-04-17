"use client";

/**
 * Breadcrumbs — `Home / {section} / {filename}`.
 *
 * Derives the section from the first path segment (e.g. `wiki/knowledge/foo.md`
 * → "knowledge"). Home clears the chat; section runs a natural-language query
 * scoped to the section ("show me my <section>"); filename is non-interactive.
 */
export interface BreadcrumbsProps {
  path: string;
  onHome?: () => void;
  onSection?: (query: string) => void;
}

function deriveParts(path: string): { section: string | null; fileName: string } {
  const clean = path.replace(/^\/+/, "").replace(/\\/g, "/");
  const segments = clean.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || path;
  const fileName = last.replace(/\.md$/i, "");
  if (segments.length < 2) return { section: null, fileName };
  // Prefer the first non-`wiki` segment as the section label.
  let section: string | null = null;
  for (const seg of segments.slice(0, -1)) {
    if (seg.toLowerCase() === "wiki") continue;
    section = seg;
    break;
  }
  return { section, fileName };
}

function humanizeSection(section: string): string {
  return section
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function queryForSection(section: string): string {
  const lower = section.toLowerCase();
  if (lower === "entities" || lower === "people" || lower === "contacts") return "show me my entities";
  if (lower === "projects") return "show me my projects";
  if (lower === "research") return "show me my research";
  if (lower === "journal" || lower === "daily") return "show me journal entries";
  if (lower === "work" || lower === "tasks") return "what matters now";
  if (lower === "system") return "system health";
  return `show me ${lower}`;
}

export function Breadcrumbs({ path, onHome, onSection }: BreadcrumbsProps) {
  const { section, fileName } = deriveParts(path);

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 mono-label text-text-quaternary"
      style={{ letterSpacing: "0.02em", minWidth: 0 }}
    >
      {onHome ? (
        <button
          type="button"
          onClick={onHome}
          className="hover:text-text-secondary transition-colors duration-150 cursor-pointer"
          style={{ background: "none", border: "none", padding: 0 }}
        >
          Home
        </button>
      ) : (
        <span>Home</span>
      )}
      {section && (
        <>
          <span style={{ opacity: 0.5 }}>/</span>
          {onSection ? (
            <button
              type="button"
              onClick={() => onSection(queryForSection(section))}
              className="hover:text-text-secondary transition-colors duration-150 cursor-pointer"
              style={{ background: "none", border: "none", padding: 0 }}
            >
              {humanizeSection(section)}
            </button>
          ) : (
            <span>{humanizeSection(section)}</span>
          )}
        </>
      )}
      <span style={{ opacity: 0.5 }}>/</span>
      <span className="text-text-tertiary truncate" style={{ minWidth: 0 }}>
        {fileName}
      </span>
    </nav>
  );
}
