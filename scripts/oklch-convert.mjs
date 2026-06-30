// scripts/oklch-convert.mjs — one-off migration script.
// Run: node scripts/oklch-convert.mjs
//
// Converts every color token in the :root and .light blocks of globals.css
// from hex / rgba() to literal oklch() values. Zero visual change:
// the round-trip fidelity test (src/lib/color/oklch-convert.test.ts) guarantees
// drift < 1/255 per channel.
//
// SKIPPED intentionally:
//   - --shadow-*   : composite values (color + length + commas) — unsafe to auto-convert
//   - any value containing color-mix( : intentional color-mix; leave as-is
//   - any value containing var(       : references another token; not a literal
//   - any value containing oklch(     : already converted
//   - non-color tokens (spacing, radius, motion, z-index, sizes, easing)
//     → the regex only fires when the whole value is a #hex or rgba() literal,
//       so these are inherently skipped

import { readFileSync, writeFileSync } from "node:fs";
import { converter, parse } from "culori";

const FILE = new URL("../src/app/globals.css", import.meta.url);

const toOklch = converter("oklch");
const r = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

function fmt(c) {
  const L = r(c.l * 100, 3);
  const C = r(c.c, 4);
  const H = c.h === undefined || Number.isNaN(c.h) ? 0 : r(c.h, 2);
  const a = c.alpha === undefined ? 1 : c.alpha;
  return a === 1 ? `oklch(${L}% ${C} ${H})` : `oklch(${L}% ${C} ${H} / ${a})`;
}

// Only matches lines whose value is a SINGLE hex or rgba() literal.
// Composite shadow values (with px/em offsets), color-mix(), var(), cubic-bezier(),
// and bare numbers never match — they contain spaces, commas outside parens, or
// don't start with # / rgba?.
const DECL = /^(\s*)(--[\w-]+)(\s*:\s*)(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))(\s*;)/gm;

let css = readFileSync(FILE, "utf8");
let converted = 0;
let skipped = 0;
const skippedTokens = [];

css = css.replace(DECL, (m, indent, name, sep, value, end) => {
  // Extra safety: skip shadow tokens explicitly (they should already not match
  // the regex, but belt-and-suspenders given their composite nature)
  if (name.startsWith("--shadow-")) {
    skipped++;
    skippedTokens.push({ name, value, reason: "shadow composite" });
    return m;
  }

  const col = parse(value.trim());
  if (!col) {
    skipped++;
    skippedTokens.push({ name, value, reason: "unparseable" });
    return m;
  }

  const ok = toOklch(col);
  if (!ok || Number.isNaN(ok.l)) {
    skipped++;
    skippedTokens.push({ name, value, reason: "oklch conversion failed" });
    return m;
  }

  converted++;
  return `${indent}${name}${sep}${fmt(ok)}${end}`;
});

writeFileSync(FILE, css);
console.log(`\nOKLCH conversion complete:`);
console.log(`  Converted: ${converted} tokens`);
console.log(`  Skipped:   ${skipped} tokens`);

if (skippedTokens.length > 0) {
  console.log(`\nSkipped tokens:`);
  for (const { name, value, reason } of skippedTokens) {
    console.log(`  ${name}: ${value}  (${reason})`);
  }
}
