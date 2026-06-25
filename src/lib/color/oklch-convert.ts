import { converter, parse } from "culori";

const toOklch = converter("oklch");

function r(n: number, d: number): number {
  return Math.round(n * 10 ** d) / 10 ** d;
}

function fmt(c: ReturnType<typeof toOklch>): string {
  if (!c) throw new Error("null color");
  const L = r(c.l * 100, 3);
  const C = r(c.c, 4);
  const H = c.h === undefined || Number.isNaN(c.h) ? 0 : r(c.h, 2);
  const a = c.alpha === undefined ? 1 : c.alpha;
  return a === 1
    ? `oklch(${L}% ${C} ${H})`
    : `oklch(${L}% ${C} ${H} / ${a})`;
}

/**
 * Convert a hex (#rgb / #rrggbb / #rrggbbaa) or rgba() color string to an
 * oklch() literal. Alpha is preserved as `/ a` when < 1. Returns the input
 * string unchanged if it cannot be parsed as a single color literal (e.g.
 * var(--x), 0.625rem, color-mix(...), composite shadow values).
 */
export function hexToOklchString(input: string): string {
  const trimmed = input.trim();

  // Fast-path: clearly not a color we want to convert
  if (
    trimmed.startsWith("var(") ||
    trimmed.startsWith("color-mix(") ||
    trimmed.startsWith("oklch(") ||
    trimmed.startsWith("oklch(")
  ) {
    return input;
  }

  const parsed = parse(trimmed);
  if (!parsed) return input;

  const ok = toOklch(parsed);
  if (!ok || Number.isNaN(ok.l)) return input;

  return fmt(ok);
}
