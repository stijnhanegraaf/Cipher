/**
 * Cipher — Framer Motion primitives.
 *
 * Linear animation philosophy:
 *   1. Most transitions 120–180ms, ease-out cubic — never springs for UI state.
 *   2. Single-axis motion (opacity OR small slide, not both unless necessary).
 *   3. No stagger unless it genuinely helps scanning.
 *   4. Springs only for physical objects; damping ≥ 32 to avoid overshoot.
 *   5. The animation confirms the state changed, nothing more.
 *
 * Usage:
 *   import { fadeSlideUp, easings, springs } from "@/lib/motion";
 *   <motion.div variants={fadeSlideUp} initial="hidden" animate="show">
 */

import type { Variants, Transition } from "framer-motion";

/* ── Easings ────────────────────────────── */
// Standard ease-out — Linear's workhorse curve. Opens fast, lands soft.
// Enter curve is faster on the out, slower on the in — matches perceived "popped in".
export const easings = {
  standard: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
  enter: [0.16, 1, 0.3, 1] as [number, number, number, number],
  exit: [0.4, 0, 1, 1] as [number, number, number, number],
  linear: [0, 0, 1, 1] as [number, number, number, number],
} as const;

/* ── Durations ────────────────────────────── */
// Linear sweet spot is 120–180ms. 250ms for entrances. Nothing over 300ms.
const duration = {
  instant: 0.075,  //  75ms — flash acknowledgements
  xfast:   0.12,   // 120ms — hover, tooltip, button state
  fast:    0.15,   // 150ms — palette, transitions
  normal:  0.18,   // 180ms — card entrances, section reveals
  slow:    0.25,   // 250ms — rare, for multi-step reveals
};

/* ── Springs ────────────────────────────── */
// Reserved for physical objects that feel the weight of a real spring.
// Critically-damped preset = no overshoot. Use for checkbox fill, status dot toggle.
// The others are kept for explicit playful moments — never default to bouncy.
export const springs: Record<string, any> = {
  /** Critically-damped: no overshoot, snappy. Use for state toggles. */
  soft:  { type: "spring", stiffness: 320, damping: 32, mass: 0.9 },
  /** Gentle lean-in for hover/press — low amplitude. */
  hover: { type: "spring", stiffness: 300, damping: 32 },
  // v8 note: bouncy / gentle / snappy / stiff / cardEnter / press were
  // removed. For UI state changes use `soft`. For hover/press interactions
  // use the duration + ease-out `transition.*` presets below — no spring
  // should be reached for on a hover/focus/press state.
};

/**
 * Organic stagger delay — non-linear cascade for the rare places stagger genuinely helps.
 * Most places should just render in parallel; reach for this only when scanning benefits
 * from the rhythm.
 */
export function organicStagger(i: number, step: number = 0.04, curve: number = 0.01): number {
  return i * step + Math.sqrt(Math.max(i, 0)) * curve;
}

/* ── Transition presets ───────────────────── */
const transition = {
  default: { duration: duration.normal, ease: easings.standard } as Transition,
  normal:  { duration: duration.normal, ease: easings.standard } as Transition,
  fast:    { duration: duration.fast,   ease: easings.standard } as Transition,
  xfast:   { duration: duration.xfast,  ease: easings.standard } as Transition,
};

/* ── Variants ──────────────────────────────── */

/** Simple opacity fade — 120ms. The default. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: duration.xfast, ease: easings.standard },
  },
};

/** Slide up + fade — primary entrance. 4px slide, 180ms. Subtle. */
export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 4 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: easings.enter },
  },
};

/** Slide down + fade — elements entering from top. */
export const fadeSlideDown: Variants = {
  hidden: { opacity: 0, y: -4 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: easings.enter },
  },
};

/** Scale in + fade — for modals, popovers. 0.96 → 1 over 150ms. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: duration.fast, ease: easings.enter },
  },
};

/** View card entrance — opacity + tiny y-slide. No scale, no spring. */
export const cardEntrance: Variants = {
  hidden: { opacity: 0, y: 4 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: easings.enter },
  },
  exit: {
    opacity: 0,
    y: -2,
    transition: { duration: duration.xfast, ease: easings.exit },
  },
};

/** Stagger container. Default step is small; most callers should skip staggering. */
export const stagger = {
  container: (staggerDelay: number = 0.03): Variants => ({
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: 0,
      },
    },
  }),
  item: {
    hidden: { opacity: 0, y: 4 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: duration.normal, ease: easings.enter },
    },
  } as Variants,
  /** Deprecated alias — kept for backward compatibility, points to `item`. */
  springItem: {
    hidden: { opacity: 0, y: 4 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: duration.normal, ease: easings.enter },
    },
  } as Variants,
  groupContainer: (groupDelay: number = 0): Variants => ({
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.03,
        delayChildren: groupDelay,
      },
    },
  }),
};

/** Exit animations */
export const fadeOut: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: duration.xfast } },
};

export const fadeSlideDownExit: Variants = {
  hidden: { opacity: 0, y: -4 },
  show: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4, transition: { duration: duration.xfast, ease: easings.exit } },
};

export const slideUpExit: Variants = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4, transition: { duration: duration.xfast, ease: easings.exit } },
};

/** Checkbox fill — uses the soft spring. The one UI state change that genuinely needs physics. */
export const checkboxSpring = springs.soft;

/** Message send — no bounce. Appears with a small lift. */
export const messageSend: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: easings.enter },
  },
};

/** Scroll-reveal — 180ms fade only. Low amplitude slide. */
export const scrollReveal: Variants = {
  hidden: { opacity: 0.4, y: 4 },
  show: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: easings.enter, delay },
  }),
};

/* ── Legacy alias — `ease` was the old export name. Keep for imports that still reference it. */
export const ease = easings;

/* ── Convenience re-exports ────────────────── */
export { duration, transition };
