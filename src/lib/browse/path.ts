/** Encode a vault-relative path for use in /browse/<...path> URLs. */
export function encodeVaultPath(path: string): string {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

/** Decode a Next.js catch-all [[...path]] param back to a vault-relative path. */
export function decodeVaultPath(segments: string[] | undefined): string {
  if (!segments || segments.length === 0) return "";
  return segments.map(decodeURIComponent).join("/");
}

/** Split a vault path into breadcrumb items: [{ name, path }]. Root returns []. */
export function breadcrumbsFor(path: string): { name: string; path: string }[] {
  if (!path) return [];
  const parts = path.split("/");
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join("/") }));
}
