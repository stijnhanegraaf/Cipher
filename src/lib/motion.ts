/**
 * Brain — Framer Motion Animation Variants
 *
 * Import these into components for consistent, Apple-level motion.
 *
 * Usage:
 *   import { fadeSlideUp, stagger } from "@/lib/motion";
 *   <motion.div variants={fadeSlideUp} initial="hidden" animate="show">
 *     <motion.div variants={stagger.item}>...</motion.div>
 *   </motion.div>
 */

import type { Variants, Transition } from "framer-motion";

/* ── Shared easing curves ─────────────────── */
const ease = {
  default: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
  spring: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
  out: [0, 0, 0.58, 1] as [number, number, number, number],
  inOut: [0.42, 0, 0.58, 1] as [number, number, number, number],
};

/* ── Durations ────────────────────────────── */
const duration = {
  instant: 0.075,
  fast: 0.15,
  normal: 0.25,
  slow: 0.35,
  slower: 0.5,
};

/* ── Transition presets ───────────────────── */
const transition = {
  default: { duration: duration.normal, ease: ease.default } as Transition,
  fast: { duration: duration.fast, ease: ease.default } as Transition,
  slow: { duration: duration.slow, ease: ease.default } as Transition,
  spring: { duration: duration.normal, ease: ease.spring } as Transition,
  bounce: {
    type: "spring" as const,
    stiffness: 400,
    damping: 17,
  },
};

/* ── Variants ──────────────────────────────── */

/** Simple opacity fade */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: transition.default,
  },
};

/** Slide up + fade — the workhorse entrance animation */
export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: transition.default,
  },
};

/** Slide down + fade — for elements entering from top */
export const fadeSlideDown: Variants = {
  hidden: { opacity: 0, y: -12 },
  show: {
    opacity: 1,
    y: 0,
    transition: transition.default,
  },
};

/** Scale in + fade — for modals, popovers, cards appearing */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  show: {
    opacity: 1,
    scale: 1,
    transition: transition.spring,
  },
};

/** Stagger container + item — wrap parent with stagger.container */
export const stagger = {
  container: (staggerDelay: number = 0.05): Variants => ({
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
    hidden: { opacity: 0, y: 8 },
    show: {
      opacity: 1,
      y: 0,
      transition: transition.default,
    },
  } as Variants,
};

/** Exit animations */
export const fadeOut: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: duration.fast } },
};

export const fadeSlideDownExit: Variants = {
  hidden: { opacity: 0, y: -12 },
  show: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10, transition: { duration: duration.fast } },
};

export const slideUpExit: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10, transition: { duration: duration.fast } },
};

/* ── Convenience re-exports ────────────────── */
export { ease, duration, transition };