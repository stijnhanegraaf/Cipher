import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import cipherDesign from "./eslint-plugin-cipher-design/index.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Honor underscore-prefixed identifiers as intentionally unused placeholders.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // ─── cipher-design: token-only color enforcement ───────────────────────────
  // DESIGN.md §3/§9: no raw hex, rgb(), hsl(), or Tailwind palette classes.
  // Scoped to src/**; globals.css is CSS (not linted by ESLint) so naturally excluded.
  // Test files are excluded: color tests legitimately use raw hex for color-conversion
  // round-trip assertions (chip.test.ts, oklch-convert.test.ts) and RuleTester cases
  // (no-raw-color.test.ts intentionally contains violations as test fixtures).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}"],
    plugins: {
      "cipher-design": cipherDesign.plugins["cipher-design"],
    },
    rules: {
      "cipher-design/no-raw-color": "error",
    },
  },

  // ─── Allowlist: AuditDashboard.tsx ─────────────────────────────────────────
  // TODO(phase-4): remove allowlist when AuditDashboard is generalized.
  // Contains 34 raw Tailwind palette colors (zinc/emerald/amber/red) slated for
  // replacement when the component is rewritten in Phase 4.
  {
    files: ["**/AuditDashboard.tsx"],
    rules: {
      "cipher-design/no-raw-color": "off",
    },
  },

  // ─── Allowlist: GraphCanvas.tsx ────────────────────────────────────────────
  // Canvas drawing requires literal colors: ctx.fillStyle / ctx.strokeStyle cannot
  // use CSS custom properties at runtime. See Phase 5: resolve from computed tokens.
  {
    files: ["**/GraphCanvas.tsx"],
    rules: {
      "cipher-design/no-raw-color": "off",
    },
  },

  // ─── Allowlist: layout.tsx ─────────────────────────────────────────────────
  // meta theme-color requires literal color strings; <meta> cannot use var(--).
  // The themeColor viewport config and the inline bootstrap script both need literals.
  {
    files: ["src/app/layout.tsx"],
    rules: {
      "cipher-design/no-raw-color": "off",
    },
  },
]);

export default eslintConfig;
