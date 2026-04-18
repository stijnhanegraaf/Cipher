"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("brain-theme");
    if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      setDark(true);
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      setDark(false);
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
      localStorage.setItem("brain-theme", "dark");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
      localStorage.setItem("brain-theme", "light");
    }
  };

  if (!mounted) return null;

  return (
    <motion.button
      onClick={toggle}
      className="relative flex items-center justify-center w-9 h-9 rounded-full border"
      style={{
        backgroundColor: "var(--bg-elevated)",
        borderColor: "var(--border-standard)",
      }}
      aria-label="Toggle theme"
      whileHover={{
        backgroundColor: "var(--hover-control)",
      }}
      transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {dark ? (
          <motion.svg
            key="sun"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-4 h-4"
            style={{ color: "var(--text-primary)" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </motion.svg>
        ) : (
          <motion.svg
            key="moon"
            initial={{ rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -90, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-4 h-4"
            style={{ color: "var(--text-tertiary)" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.button>
  );
}