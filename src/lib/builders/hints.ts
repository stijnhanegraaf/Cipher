import "server-only";

/** Shape raw entity/project name lists into deduped, trimmed, capped hints. */
export function buildHints(
  entities: string[],
  projects: string[]
): { entities: string[]; projects: string[] } {
  const clean = (xs: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of xs) {
      const v = raw.trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
      if (out.length >= 5) break;
    }
    return out;
  };
  return { entities: clean(entities), projects: clean(projects) };
}
