/**
 * Brain — Framer Motion Animation Variants
 *
 * Linear-inspired motion: precise, minimal, engineered.
 *
 * Usage:
 *   import { fadeSlideUp, stagger } from "@/lib/motion";
 *   <motion.div variants={fadeSlideUp} initial="hidden" animate="show">
 *     <motion.div variants={stagger.item}>...</motion.div>
 *   </motion.div>
 */

import type { Variants, Transition } from "framer-motion";

/* ── Shared easing — Linear-like cubic bezier ──── */
const ease = {
  linear: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
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
  default: { duration: duration.normal, ease: ease.linear } as Transition,
  fast: { duration: duration.fast, ease: ease.linear } as Transition,
  slow: { duration: duration.slow, ease: ease.linear } as Transition,
  spring: { duration: duration.normal, ease: ease.spring } as Transition,
  bounce: {
    type: "spring" as const,
    stiffness: 400,
    damping: 17,
  },
};

/* ── Variants ──────────────────────────────── */

/** Simple opacity fade — 0.2s */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: 0.2, ease: ease.linear },
  },
};

/** Slide up + fade — the workhorse entrance, 0.3s */
export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: ease.linear },
  },
};

/** Slide down + fade — for elements entering from top */
export const fadeSlideDown: Variants = {
  hidden: { opacity: 0, y: -8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: ease.linear },
  },
};

/** Scale in + fade — scale 0.98→1, for modals, popovers */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.98 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3, ease: ease.linear },
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
      transition: { duration: 0.3, ease: ease.linear },
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
  hidden: { opacity: 0, y: -8 },
  show: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8, transition: { duration: duration.fast, ease: ease.linear } },
};

export const slideUpExit: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8, transition: { duration: duration.fast, ease: ease.linear } },
};

/* ── Convenience re-exports ────────────────── */
export { ease, duration, transition };