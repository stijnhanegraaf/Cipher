export type FileKind = "md" | "image" | "pdf" | "canvas" | "other";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "avif"]);

export function fileKindForExt(ext: string): FileKind {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "md" || e === "markdown") return "md";
  if (IMAGE_EXTS.has(e)) return "image";
  if (e === "pdf") return "pdf";
  if (e === "canvas") return "canvas";
  return "other";
}
