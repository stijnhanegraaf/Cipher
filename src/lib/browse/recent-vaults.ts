/**
 * recent-vaults — persist a list of recently-opened vault paths.
 *
 * Pure list-transform functions (addRecentVault, removeRecentVault) are
 * separated from the localStorage I/O (getRecentVaults, saveRecentVault) so
 * they can be tested in Node without a browser environment.
 */

export interface RecentVault {
  path: string;
  name: string;
  lastOpened: number;
}

const STORAGE_KEY = "cipher-recent-vaults";

/**
 * Pure: prepend entry, dedupe by path (existing path moves to front with
 * updated lastOpened), most-recent first, capped to cap. Does NOT mutate the
 * input array.
 */
export function addRecentVault(
  list: RecentVault[],
  entry: RecentVault,
  cap = 8
): RecentVault[] {
  const filtered = list.filter((v) => v.path !== entry.path);
  return [entry, ...filtered].slice(0, cap);
}

/**
 * Pure: drop the entry with the given path, preserve order. Does NOT mutate
 * the input array.
 */
export function removeRecentVault(
  list: RecentVault[],
  path: string
): RecentVault[] {
  return list.filter((v) => v.path !== path);
}

/**
 * Read localStorage['cipher-recent-vaults']. SSR-safe: returns [] on the
 * server where localStorage is undefined. Tolerant of bad JSON → [].
 */
export function getRecentVaults(): RecentVault[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentVault[];
  } catch {
    return [];
  }
}

/**
 * Read + addRecentVault + write back to localStorage. Browser-only; swallows
 * all errors silently so storage failures never crash the UI.
 */
export function saveRecentVault(entry: RecentVault): void {
  try {
    const current = getRecentVaults();
    const next = addRecentVault(current, entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // swallow — storage quota, private mode, etc.
  }
}
