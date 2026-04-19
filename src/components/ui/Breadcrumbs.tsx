"use client";

/**
 * Breadcrumbs — `Home / {section} / {filename}`.
 *
 * Derives the section from the first non-`wiki` path segment. Home closes
 * the sheet and goes to /browse. Section navigates to the section's
 * dedicated page (System / Timeline / Today) when one exists, otherwise
 * to the default browse landing. Filename is non-interactive.
 */
export interface BreadcrumbsProps {
  path: string;
  onHome?: () => void;
  /**
   * Fires when the user clicks the section crumb. Receives:
   *   section    — the raw folder name (e.g. "projects", "journal").
   *   folderPath — the full vault-relative folder path (e.g.
   *                "wiki/projects" or "journal"), useful when the
   *                consumer wants to open a drawer scoped to that dir.
   */
  onSection?: (section: string, folderPath: string) => void;
}

function deriveParts(path: string): { section: string | null; folderPath: string | null; fileName: string } {
  const clean = path.replace(/^\/+/, "").replace(/\\/g, "/");
  const segments = clean.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || path;
  const fileName = last.replace(/\.md$/i, "");
  if (segments.length < 2) return { section: null, folderPath: null, fileName };
  // Prefer the first non-`wiki` segment as the section label.
  let section: string | null = null;
  const parents: string[] = [];
  for (const seg of segments.slice(0, -1)) {
    parents.push(seg);
    if (seg.toLowerCase() === "wiki") continue;
    section = seg;
    // Stop at the first real (non-wiki) folder so folderPath matches.
    break;
  }
  const folderPath = section ? parents.join("/") : null;
  return { section, folderPath, fileName };
}

function humanizeSection(section: string): string {
  return section
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Breadcrumbs({ path, onHome, onSection }: BreadcrumbsProps) {
  const { section, folderPath, fileName } = deriveParts(path);

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
          {onSection && folderPath ? (
            <button
              type="button"
              onClick={() => onSection(section, folderPath)}
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
