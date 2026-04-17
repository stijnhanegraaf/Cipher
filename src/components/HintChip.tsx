"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Kbd } from "@/components/ui";

interface HintChipProps {
  /** Hide the chip entirely (e.g. while the user is actively typing). */
  hidden?: boolean;
}

/**
 * Persistent bottom-right shortcut hint. Fades out after brief idle and on activity,
 * reappears after ~8s of stillness. Low-opacity chrome — it's there when you need it,
 * invisible when you don't.
 */
export function HintChip({ hidden = false }: HintChipProps) {
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch (window is unavailable server-side).
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fade on any user activity; re-show after ~8s of inactivity.
  useEffect(() => {
    if (!mounted) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const onActivity = () => {
      setVisible(false);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVisible(true), 8000);
    };

    // Reset the initial timer too — after 8s show it first time.
    timer = setTimeout(() => setVisible(true), 800);

    window.addEventListener("keydown", onActivity);
    window.addEventListener("mousemove", onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("touchstart", onActivity);
    };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {visible && !hidden && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
          className="fixed bottom-4 right-4 z-30 pointer-events-none"
          aria-hidden
        >
          <div
            className="flex items-center gap-2 micro text-text-quaternary"
            style={{
              padding: "6px 10px",
              borderRadius: 9999,
              background: "var(--bg-surface-alpha-2)",
              border: "1px solid var(--border-subtle)",
              backdropFilter: "blur(8px)",
              opacity: 0.8,
            }}
          >
            <Kbd>/</Kbd>
            <span>search</span>
            <span className="opacity-40" style={{ margin: "0 2px" }}>·</span>
            <Kbd>⌘K</Kbd>
            <span>commands</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
