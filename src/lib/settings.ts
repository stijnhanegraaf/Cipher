/**
 * Reads and writes <vault>/.cipher/sidebar.json with schema validation
 * and atomic writes (tmp + rename). Vault-portable user customisation.
 */
import "server-only";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { join } from "path";
import { getVaultPath } from "./vault-reader";
import { log } from "./log";

// ─── Types ───────────────────────────────────────────────────────────
export type PinIconName =
  | "folder" | "document" | "flag" | "star" | "book" | "rocket"
  | "people" | "archive" | "inbox" | "graph" | "brain" | "calendar";

export interface PinEntry {
  id: string;
  label: string;
  path: string;      // vault-relative folder
  icon: PinIconName;
}

export interface SidebarConfig {
  version: 1;
  pins: PinEntry[];
}

const EMPTY: SidebarConfig = { version: 1, pins: [] };
const FILE_REL = ".cipher/sidebar.json";

// ─── Read ────────────────────────────────────────────────────────────
/**
 * Read the sidebar settings from `<vault>/.cipher/sidebar.json`.
 *
 * Returns an EMPTY config (no pins) when no vault is connected, when the
 * file doesn't exist, or when the JSON fails schema validation — never
 * throws. Malformed files are logged and treated as empty.
 */
export async function readSidebarSettings(): Promise<SidebarConfig> {
  const root = getVaultPath();
  if (!root) return EMPTY;
  try {
    const raw = await readFile(join(root, FILE_REL), "utf-8");
    const parsed = JSON.parse(raw);
    if (!isValidConfig(parsed)) {
      log.warn("settings", "malformed sidebar.json — returning empty config");
      return EMPTY;
    }
    return parsed;
  } catch {
    return EMPTY;
  }
}

// ─── Write (atomic: temp + rename) ───────────────────────────────────
/**
 * Persist sidebar settings to `<vault>/.cipher/sidebar.json`.
 *
 * Validates the config first, then writes via tmp-file + rename so a
 * crash mid-write never leaves a truncated file on disk. Throws when no
 * vault is connected or the config fails validation.
 */
export async function writeSidebarSettings(config: SidebarConfig): Promise<void> {
  const root = getVaultPath();
  if (!root) throw new Error("No vault connected");
  if (!isValidConfig(config)) throw new Error("Invalid sidebar config");
  const absFile = join(root, FILE_REL);
  const absDir = join(root, ".cipher");
  const tmp = `${absFile}.tmp`;
  await mkdir(absDir, { recursive: true });
  await writeFile(tmp, JSON.stringify(config, null, 2), "utf-8");
  await rename(tmp, absFile);
}

// ─── Validation ─────────────────────────────────────────────────────
const ICON_NAMES: ReadonlySet<string> = new Set<PinIconName>([
  "folder","document","flag","star","book","rocket",
  "people","archive","inbox","graph","brain","calendar",
]);

function isValidConfig(v: unknown): v is SidebarConfig {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.version !== 1) return false;
  if (!Array.isArray(o.pins)) return false;
  return o.pins.every(isValidPin);
}

function isValidPin(v: unknown): v is PinEntry {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return typeof p.id === "string" && p.id.length > 0
      && typeof p.label === "string"
      && typeof p.path === "string" && !p.path.startsWith("/")
      && typeof p.icon === "string" && ICON_NAMES.has(p.icon);
}
