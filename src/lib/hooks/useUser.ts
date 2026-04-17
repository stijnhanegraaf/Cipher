"use client";

/**
 * Minimal user identity. The app only uses this for avatar display, so we keep it
 * generic by default. If you want a real name/initial, set NEXT_PUBLIC_USER_NAME
 * at build time — see .env.example.
 */
export interface UserProfile {
  name: string;
  /** Single-letter initial for avatar rendering. Uppercased. */
  initial: string;
}

function computeInitial(name: string | undefined): string {
  if (!name) return "·";
  const trimmed = name.trim();
  if (!trimmed) return "·";
  return trimmed.slice(0, 1).toUpperCase();
}

const envName = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_USER_NAME : undefined;

const CURRENT_USER: UserProfile = {
  name: envName || "You",
  initial: computeInitial(envName),
};

export function useUser(): UserProfile {
  return CURRENT_USER;
}
