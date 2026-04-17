/**
 * VaultPath — branded string type for already-resolved vault-relative paths.
 *
 * A VaultPath is a string that has been verified to point at a real file in
 * the active vault (or is trusted to, because it was constructed from the
 * resolver or a guaranteed-absolute source). This type discipline lets us
 * reject raw link labels at the boundary so they can't silently 404 later.
 *
 * Client-safe module — no server imports. Server code calls resolveLink()
 * from vault-reader and wraps with asVaultPath(). Client code that needs to
 * resolve goes via /api/resolve (or trusts a server response).
 */

export type VaultPath = string & { readonly __vaultPath: unique symbol };

/** Cast a known-good absolute path to VaultPath. No runtime check. */
export function asVaultPath(p: string): VaultPath {
  return p as VaultPath;
}

/**
 * True when the input looks like a real vault-relative file path:
 * contains a slash AND ends with .md. Used as a cheap client-side gate
 * before hitting the API.
 */
export function looksAbsolute(input: string): boolean {
  if (!input) return false;
  const s = input.trim();
  return s.includes("/") && s.toLowerCase().endsWith(".md");
}

/** Strip a leading slash, whitespace, and other noise from a user input. */
export function normalizeInput(input: string): string {
  return (input || "").trim().replace(/^\/+/, "").replace(/\\/g, "/");
}
