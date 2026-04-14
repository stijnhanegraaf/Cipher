/**
 * Brain — Framer Motion Animation Variants
 *
 * Linear-inspired motion: precise, minimal, engineered.
 * Spring physics for organic feel. Inspired by Emil Kowalski
 * and Family wallet animation principles.
 *
 * Usage:
 *   import { fadeSlideUp, stagger, springs } from "@/lib/motion";
 *   <motion.div variants={fadeSlideUp} initial="hidden" animate="show">
 *     <motion.div variants={stagger.item}>...</motion.div>
 *   </motion.div>
 */

import type { Variants, Transition, Spring } from "framer-motion";

/* ── Spring presets ─────────────────────────── */
export const springs: Record<string, any> = {
  bouncy: { type: "spring", stiffness: 260, damping: 20, mass: 0.8 },
  gentle: { type: "spring", stiffness: 200, damping: 25, mass: 1 },
  snappy: { type: "spring", stiffness: 400, damping: 25, mass: 0.5 },
  stiff: { type: "spring", stiffness: 500, damping: 30, mass: 1 },
  hover: { type: "spring", stiffness: 300, damping: 25 },
  press: { type: "spring", stiffness: 400, damping: 25 },
  cardEnter: { type: "spring", stiffness: 260, damping: 20, mass: 0.8 },
};

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
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
};

/** Slide down + fade — for elements entering from top */
export const fadeSlideDown: Variants = {
  hidden: { opacity: 0, y: -12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
};

/** Scale in + fade — scale 0.98→1, for modals, popovers */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.98 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
};

/* ── E1: Spring-based card entrance with overshoot ──── */
/** View card entrance — spring physics with scale overshoot */
export const cardEntrance: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: [0.97, 1.02, 1.0],
    transition: springs.cardEnter,
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.98,
    transition: { duration: duration.fast, ease: ease.linear },
  },
};

/** Stagger container with group-aware delays */
export const stagger = {
  container: (staggerDelay: number = 0.04): Variants => ({
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
    hidden: { opacity: 0, y: 12 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
    },
  } as Variants,
  /** E1: Spring-based stagger items with overshoot */
  springItem: {
    hidden: { opacity: 0, y: 14, scale: 0.97 },
    show: {
      opacity: 1,
      y: 0,
      scale: [0.97, 1.02, 1.0],
      transition: springs.bouncy,
    },
  } as Variants,
  /** E1: Group container — 0.12s stagger between groups */
  groupContainer: (groupDelay: number = 0.12): Variants => ({
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.06,
        delayChildren: groupDelay,
      },
    },
  }),
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

/* ── E2: Checkbox toggle keyframes ──── */
export const checkboxSpring = springs.bouncy;

/* ── E5: Message send animation ──── */
export const messageSend: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: springs.bouncy,
  },
};

/** E8: Scroll-reveal section fade-in */
export const scrollReveal: Variants = {
  hidden: { opacity: 0.3, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: ease.linear },
  },
};

/* ── Convenience re-exports ────────────────── */
export { ease, duration, transition };