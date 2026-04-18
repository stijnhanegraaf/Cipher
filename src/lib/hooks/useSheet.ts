"use client";

/**
 * useSheet — URL-driven DetailPage sheet controller (?sheet=...&anchor=...).
 * Returns current sheet path/anchor + open/close helpers.
 */

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * useSheet — URL-driven sheet overlay.
 *
 * Encodes the current sheet file path in the `?sheet=<vault-path>` query
 * param. Any page accepts it and mounts the DetailPage overlay when
 * present. Closing removes the param.
 *
 * Usage:
 *   const sheet = useSheet();
 *   sheet.open("wiki/foo.md");   // sets ?sheet=wiki%2Ffoo.md
 *   sheet.close();               // removes ?sheet
 *   sheet.path;                  // current sheet path or null
 */
export function useSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const path = searchParams.get("sheet");
  const anchor = searchParams.get("anchor");

  const open = useCallback(
    (vaultPath: string, anchorSlug?: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sheet", vaultPath);
      if (anchorSlug) params.set("anchor", anchorSlug);
      else params.delete("anchor");
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("sheet");
    params.delete("anchor");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return { path, anchor, open, close };
}
