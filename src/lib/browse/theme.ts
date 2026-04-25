"use client";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "brain-theme"; // reuse existing key so we don't orphan user prefs.

function readRaw(): string | null {
  if (typeof localStorage === "undefined") return null;
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function readTheme(): ThemeChoice {
  const v = readRaw();
  if (v === "light" || v === "dark") return v;
  return "system";
}

export function systemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  return choice === "system" ? systemTheme() : choice;
}

export function applyTheme(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(choice);
  const html = document.documentElement;
  if (resolved === "light") html.classList.add("light");
  else html.classList.remove("light");
  html.setAttribute("data-theme", resolved);
}

export function writeTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {}
  applyTheme(choice);
}

export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
