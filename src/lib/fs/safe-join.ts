import { resolve, sep } from "path";

/**
 * Join `rel` onto `root`, returning the absolute path only if it stays
 * within `root`. Returns null on any traversal escape. Uses path.resolve
 * so `.`/`..` segments are normalized before the containment check, and
 * guards against sibling-prefix collisions (e.g. /root vs /root-evil).
 */
export function safeJoin(root: string, rel: string): string | null {
  const absRoot = resolve(root);
  const abs = resolve(absRoot, rel);
  if (abs === absRoot) return abs;
  if (abs.startsWith(absRoot + sep)) return abs;
  return null;
}
