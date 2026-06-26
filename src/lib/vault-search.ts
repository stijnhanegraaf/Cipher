/**
 * Recursive directory listing for vault files.
 *
 * NOTE: searchVault() was removed in Phase 3 Task 1.
 * Full-text search is now handled by buildSearchResults via
 * src/lib/search/search-core.ts (whole-vault, ReDoS-safe, tag+FM aware).
 * listVaultFiles is kept because vault-indexes.ts has live callers.
 */

import { join } from "path";
import { getVaultPath } from "./vault-reader";
import { walkFiles } from "@/lib/fs/walk";

// Local root accessor to avoid coupling to the private VAULT_PATH_ helper.
function rootOrEmpty(): string {
  return getVaultPath() || "";
}

export async function listVaultFiles(dirRelPath: string, extension = ".md"): Promise<string[]> {
  const root = rootOrEmpty();
  if (!root) return [];
  const rels = await walkFiles(join(root, dirRelPath), { extensions: [extension] });
  return dirRelPath ? rels.map((r) => `${dirRelPath}/${r}`) : rels;
}

