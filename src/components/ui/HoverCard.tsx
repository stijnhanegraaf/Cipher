"use client";

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

/**
 * HoverCard — progressive disclosure on hover.
 * Linear-style: 200ms open delay, 100ms close delay, multi-layer shadow stack.
 *
 * Usage:
 *   <HoverCard content={<SourceMeta source={s} />}>
 *     <button>{s.label}</button>
 *   </HoverCard>
 *
 * Pointer-coarse devices (touch) never open the card — they fall through to click.
 */
interface HoverCardProps {
  /** The hovered trigger element. Must be a single React element. */
  children: React.ReactElement;
  /** Content rendered inside the floating card. */
  content: React.ReactNode;
  /** Placement hint. Card flips if it would overflow the viewport. Default "top". */
  side?: "top" | "bottom";
  /** ms to wait before opening. Default 200. */
  openDelay?: number;
  /** ms to wait before closing (lets cursor cross the gap). Default 100. */
  closeDelay?: number;
}

type TriggerProps = {
  ref?: React.Ref<HTMLElement>;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
};

export function HoverCard({
  children,
  content,
  side = "top",
  openDelay = 200,
  closeDelay = 100,
}: HoverCardProps) {
  const trigger = children as React.ReactElement<TriggerProps>;
  const triggerRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number; side: "top" | "bottom" } | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Coarse-pointer detection — skip entirely on touch.
  const isTouch = useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(pointer: coarse)").matches ?? false;
  }, []);

  const schedule = useCallback(
    (action: "open" | "close") => {
      if (openTimerRef.current) {
        clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      if (action === "open") {
        openTimerRef.current = setTimeout(() => setOpen(true), openDelay);
      } else {
        closeTimerRef.current = setTimeout(() => setOpen(false), closeDelay);
      }
    },
    [openDelay, closeDelay]
  );

  // Position the card relative to the trigger, flipping to the other side if needed.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const estimatedHeight = 120;
    const gap = 8;
    const vh = window.innerHeight;

    const topY = rect.top - gap;
    const bottomY = rect.bottom + gap;

    let resolved: "top" | "bottom" = side;
    if (side === "top" && rect.top < estimatedHeight + gap) resolved = "bottom";
    if (side === "bottom" && vh - rect.bottom < estimatedHeight + gap) resolved = "top";

    setCoords({
      x: rect.left + rect.width / 2,
      y: resolved === "top" ? topY : bottomY,
      side: resolved,
    });
  }, [open, side]);

  // Close on scroll / resize — positions go stale immediately on movement.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const triggerProps = {
    ref: (el: HTMLElement | null) => {
      triggerRef.current = el;
      // Forward existing ref if the child has one.
      // React's ref types don't play nicely with cloneElement over unknown children.
      const childRef = (trigger as unknown as { ref?: React.Ref<HTMLElement> }).ref;
      if (typeof childRef === "function") childRef(el);
      else if (childRef && typeof childRef === "object") (childRef as React.MutableRefObject<HTMLElement | null>).current = el;
    },
    onMouseEnter: (e: React.MouseEvent) => {
      if (isTouch()) return;
      schedule("open");
      trigger.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      schedule("close");
      trigger.props.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      schedule("open");
      trigger.props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      schedule("close");
      trigger.props.onBlur?.(e);
    },
  };

  // Let the card absorb pointer events — if you move INTO the card, keep it open.
  const cardPointerHandlers = {
    onMouseEnter: () => schedule("open"),
    onMouseLeave: () => schedule("close"),
  };

  const Trigger = trigger.type as React.ElementType;
  const mergedProps = { ...(trigger.props as object), ...triggerProps };

  return (
    <>
      <Trigger {...mergedProps} />
      {mounted && coords && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: coords.side === "top" ? 4 : -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: coords.side === "top" ? 4 : -4 }}
              transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
              role="tooltip"
              {...cardPointerHandlers}
              style={{
                position: "fixed",
                left: coords.x,
                top: coords.y,
                transform: `translate(-50%, ${coords.side === "top" ? "-100%" : "0"})`,
                zIndex: 300,
                minWidth: 200,
                maxWidth: 320,
                padding: "8px 12px",
                background: "var(--bg-tooltip)",
                border: "1px solid var(--border-standard)",
                borderRadius: 6,
                boxShadow: "var(--shadow-dialog)",
                pointerEvents: "auto",
                color: "var(--text-primary)",
              }}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
