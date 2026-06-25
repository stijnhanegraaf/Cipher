import { parse as parseYaml } from "yaml";

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Parse a leading YAML frontmatter block. Uses a real YAML parser so
 * multi-line lists, nested objects, and typed scalars work. The end
 * marker is a `---` line on its own (not any `---` substring), so a
 * horizontal rule in the body is never mistaken for the closing fence.
 */
export function parseFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>;
  content: string;
} {
  const m = raw.match(FM_RE);
  if (!m) return { frontmatter: {}, content: raw };
  let frontmatter: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(m[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      frontmatter = parsed as Record<string, unknown>;
    }
  } catch {
    frontmatter = {};
  }
  return { frontmatter, content: raw.slice(m[0].length) };
}

/** Return the body with any leading frontmatter block removed. */
export function stripFrontmatter(raw: string): string {
  return parseFrontmatter(raw).content;
}
