/**
 * Stylelint — minimal color-token enforcement for Cipher.
 *
 * Policy: raw hex and rgb/rgba/hsl/hsla functions are ONLY allowed inside the
 * :root and .light token-definition blocks (which carry inline disable
 * comments). Everywhere else — @layer components, utilities, keyframes, global
 * overrides — colors MUST be var(--token) or color-mix()/oklch().
 *
 * Rules chosen deliberately narrow so we don't pull in unrelated CSS-audit
 * noise from stylelint-config-standard.
 */

/** @type {import('stylelint').Config} */
const config = {
  rules: {
    /** Flags #rrggbb / #rgb / #rrggbbaa / #rgba hex literals. */
    "color-no-hex": true,

    /**
     * Flags raw rgb(), rgba(), hsl(), hsla() color functions.
     * oklch() and color-mix() are intentionally NOT listed — those are the
     * approved formats for computed/theme-aware values in component rules.
     */
    "function-disallowed-list": ["rgb", "rgba", "hsl", "hsla"],
  },
};

export default config;
