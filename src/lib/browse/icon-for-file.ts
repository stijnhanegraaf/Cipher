import type { FileKind } from "./file-kind";

/** Short label to announce the kind (aria-label / tooltip). */
export function labelForFileKind(kind: FileKind): string {
  switch (kind) {
    case "md": return "Markdown file";
    case "image": return "Image";
    case "pdf": return "PDF";
    case "other": return "File";
  }
}

/** Kept for back-compat with tree rows that haven't migrated to the JSX icon. */
export function iconForFileKind(kind: FileKind): string {
  switch (kind) {
    case "md": return "•";
    case "image": return "▢";
    case "pdf": return "▢";
    case "other": return "•";
  }
}
