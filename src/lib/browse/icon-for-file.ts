import type { FileKind } from "./file-kind";

export function iconForFileKind(kind: FileKind): string {
  switch (kind) {
    case "md": return "📄";
    case "image": return "🖼";
    case "pdf": return "📕";
    case "other": return "📎";
  }
}
