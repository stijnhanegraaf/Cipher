/**
 * RuleTester tests for cipher-design/no-raw-color ESLint rule.
 * Run: npx vitest run src/lib/color/no-raw-color.test.ts
 */
import { describe, it, expect } from "vitest";
import { RuleTester } from "eslint";

// Load the local plugin rule via dynamic import (ESM .mjs)
const pluginModule = await import(
  new URL("../../../eslint-plugin-cipher-design/index.mjs", import.meta.url).toString()
);
const rule = pluginModule.default.plugins["cipher-design"].rules["no-raw-color"];

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

describe("cipher-design/no-raw-color", () => {
  it("valid: var(--token), semantic classes, URL fragments pass without errors", () => {
    tester.run("no-raw-color", rule, {
      valid: [
        { code: `const s = { color: "var(--text-primary)" };` },
        { code: `const s = { background: "var(--bg-surface)" };` },
        { code: `const s = "var(--accent-brand)";` },
        // var() with hex fallback: hex is inside var(), stripped out, not flagged
        { code: `const s = { color: "var(--text-on-brand, #fff)" };` },
        { code: `const s = { color: "var(--status-danger, #c0392b)" };` },
        // Semantic Tailwind classes (no palette name + shade number)
        { code: `const c = "bg-surface text-text-primary border-border-standard";` },
        { code: `const c = "bg-panel hover:bg-elevated";` },
        // URL fragments: start with a letter that is not a hex digit
        { code: `const url = "#section-anchor";` },
        { code: `const href = "#top";` },
        { code: `const anchor = "#introduction";` },
        // Tailwind non-palette
        { code: `const c = "bg-inherit text-current bg-opacity-50";` },
        // oklch is fine (not flagged, not raw hex/rgb)
        { code: `const c = "oklch(68.812% 0.1384 280.74)";` },
      ],
      invalid: [
        // 3-digit hex
        {
          code: `const s = { color: "#fff" };`,
          errors: [{ messageId: "noHex" }],
        },
        // 6-digit hex
        {
          code: `const s = { color: "#c0392b" };`,
          errors: [{ messageId: "noHex" }],
        },
        // 6-digit hex uppercase
        {
          code: `const s = "#FFFFFF";`,
          errors: [{ messageId: "noHex" }],
        },
        // rgba()
        {
          code: `const s = { background: "rgba(0,0,0,0.5)" };`,
          errors: [{ messageId: "noRgbHsl" }],
        },
        // rgb()
        {
          code: `const x = "rgb(255, 0, 0)";`,
          errors: [{ messageId: "noRgbHsl" }],
        },
        // hsl()
        {
          code: `const x = "hsl(220, 90%, 56%)";`,
          errors: [{ messageId: "noRgbHsl" }],
        },
        // Tailwind palette: bg-zinc-800
        {
          code: `const c = "bg-zinc-800";`,
          errors: [{ messageId: "noTailwindPalette" }],
        },
        // Tailwind palette: text-blue-500
        {
          code: `const c = "text-blue-500";`,
          errors: [{ messageId: "noTailwindPalette" }],
        },
        // Tailwind palette: border-red-400
        {
          code: `const c = "border-red-400";`,
          errors: [{ messageId: "noTailwindPalette" }],
        },
        // Multiple palette classes in one string
        {
          code: `const c = "bg-zinc-900 text-emerald-400";`,
          errors: [
            { messageId: "noTailwindPalette" },
            { messageId: "noTailwindPalette" },
          ],
        },
        // Template literal with raw hex
        {
          code: "const s = `color: #ff0000`;",
          errors: [{ messageId: "noHex" }],
        },
        // Template literal with rgba
        {
          code: "const s = `background: rgba(0,0,0,0.85)`;",
          errors: [{ messageId: "noRgbHsl" }],
        },
      ],
    });
    expect(true).toBe(true); // RuleTester throws on failure
  });
});
