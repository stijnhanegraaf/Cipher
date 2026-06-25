/**
 * eslint-plugin-cipher-design
 * Local ESLint plugin enforcing DESIGN.md §3/§9: token-only color in src/**
 *
 * Rule: no-raw-color
 *   Flags raw hex (#fff, #ffffff), rgb()/rgba()/hsl() literals, and Tailwind
 *   palette color classes (bg-zinc-800, text-blue-500, etc.) in TS/TSX source.
 *
 *   Allowed: var(--any-token), semantic classes (bg-surface, text-text-primary).
 *   Does NOT flag hex inside var() fallback positions.
 *   Does NOT flag URL fragments (#section — 's' is not a hex digit).
 */

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const PREFIX = "bg|text|border|ring|from|to|via|fill|stroke|divide|accent|caret|decoration|outline|shadow|ring-offset";

const TAILWIND_PALETTE_RE = new RegExp(
  `\\b(?:${PREFIX})-(?:${PALETTE})-\\d{2,3}(?:\\/\\d+)?\\b`,
  "g"
);

// Matches exactly 3, 4, 6, or 8 hex digits after #.
// 's' in #section is not a hex digit, so URL fragments are naturally excluded.
const HEX_COLOR_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;

const RGB_HSL_RE = /\brgba?\s*\(|\bhsla?\s*\(/g;

// Replace all content inside var(...) with spaces so hex/rgb inside fallbacks are not flagged.
function stripVarFallbacks(str) {
  let result = "";
  let inVar = false;
  let varDepth = 0;
  let i = 0;
  while (i < str.length) {
    if (!inVar && str.slice(i, i + 4) === "var(") {
      inVar = true;
      varDepth = 1;
      result += "    "; // mask "var("
      i += 4;
      continue;
    }
    if (inVar) {
      if (str[i] === "(") varDepth++;
      if (str[i] === ")") {
        varDepth--;
        if (varDepth === 0) {
          inVar = false;
          result += " "; // mask ")"
          i++;
          continue;
        }
      }
      result += " "; // mask content inside var(...)
      i++;
      continue;
    }
    result += str[i];
    i++;
  }
  return result;
}

const noRawColorRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw hex, rgb()/hsl() literals, and Tailwind palette color classes. Use semantic design tokens instead.",
    },
    schema: [],
    messages: {
      noHex:
        "Raw hex color '{{color}}' found. Use a semantic CSS token (var(--...)) instead.",
      noRgbHsl:
        "Raw color function '{{color}}' found. Use a semantic CSS token (var(--...)) instead.",
      noTailwindPalette:
        "Tailwind palette color class '{{color}}' found. Use a semantic token class instead.",
    },
  },

  create(context) {
    function checkStringForColors(node, rawValue) {
      const value = rawValue;

      // 1. Tailwind palette classes
      TAILWIND_PALETTE_RE.lastIndex = 0;
      let m;
      while ((m = TAILWIND_PALETTE_RE.exec(value)) !== null) {
        context.report({
          node,
          messageId: "noTailwindPalette",
          data: { color: m[0] },
        });
      }

      // 2. Strip var() fallbacks, then check for raw hex and rgb/hsl
      const stripped = stripVarFallbacks(value);

      HEX_COLOR_RE.lastIndex = 0;
      while ((m = HEX_COLOR_RE.exec(stripped)) !== null) {
        context.report({
          node,
          messageId: "noHex",
          data: { color: m[0] },
        });
      }

      RGB_HSL_RE.lastIndex = 0;
      while ((m = RGB_HSL_RE.exec(stripped)) !== null) {
        context.report({
          node,
          messageId: "noRgbHsl",
          data: { color: m[0].trim() },
        });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") {
          checkStringForColors(node, node.value);
        }
      },

      TemplateElement(node) {
        if (node.value && node.value.raw) {
          checkStringForColors(node, node.value.raw);
        }
      },
    };
  },
};

const plugin = {
  plugins: {
    "cipher-design": {
      rules: {
        "no-raw-color": noRawColorRule,
      },
    },
  },
  rules: {
    "no-raw-color": noRawColorRule,
  },
};

export default plugin;
