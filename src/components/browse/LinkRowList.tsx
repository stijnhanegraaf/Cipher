"use client";

/**
 * LinkRowList — shared link-row section primitive.
 *
 * Renders a mono-label header + up to 5 link rows. Used by:
 * - FilePreviewPanel ("LINKS TO" / "LINKED FROM") — resolved variant
 * - BacklinksPanel ("LINKED MENTIONS") — also uses resolved variant
 *
 * The `variant` prop is reserved for future broken-link display (T4).
 */

export interface LinkRow {
  path: string;
  title?: string;
}

interface LinkRowListProps {
  title: string;
  rows: LinkRow[];
  onNavigate: (path: string) => void;
  /** "resolved" = normal navigable row (default); "broken" = future T4 broken-link display */
  variant?: "resolved" | "broken";
}

function basename(id: string): string {
  const i = id.lastIndexOf("/");
  const last = i === -1 ? id : id.slice(i + 1);
  return last.replace(/\.md$/i, "");
}

function parentFolder(id: string): string {
  const i = id.lastIndexOf("/");
  return i === -1 ? "" : id.slice(0, i);
}

export function LinkRowList({
  title,
  rows,
  onNavigate,
  variant = "resolved",
}: LinkRowListProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        className="mono-label"
        style={{
          color: "var(--text-quaternary)",
          letterSpacing: "0.08em",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {rows.length === 0 ? null : (
        <div>
          {rows.slice(0, 5).map((r) => (
            <button
              key={r.path}
              type="button"
              onClick={() => onNavigate(r.path)}
              className="app-row focus-ring"
              disabled={variant === "broken"}
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                height: "var(--row-h-dense)",
                padding: "0 8px",
                border: "none",
                background: "transparent",
                cursor: variant === "broken" ? "default" : "pointer",
                gap: 8,
                textAlign: "left",
              }}
            >
              <svg
                width={12}
                height={12}
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                style={{ color: "var(--text-quaternary)", flexShrink: 0 }}
              >
                <path d="M3 2h4l2 2v6H3z" />
              </svg>
              <span
                className="caption-large"
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--text-primary)",
                }}
              >
                {r.title ?? basename(r.path)}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-quaternary)",
                  flexShrink: 0,
                  maxWidth: 140,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {parentFolder(r.path)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
