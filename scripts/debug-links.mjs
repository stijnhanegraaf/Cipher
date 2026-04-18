/**
 * Debug script: test resolveLink against all wiki-links in the vault.
 * Run: node scripts/debug-links.mjs [vault-path]
 * 
 * If vault-path is omitted, tries ../Obsidian and VAULT_PATH env var.
 */

import { join } from "path";
import { readFile, stat, readdir } from "fs/promises";

const VAULT_PATH = process.argv[2] || process.env.VAULT_PATH || "../Obsidian";

// ─── Extract wiki-links ───────────────────────────────────────────
function extractLinks(text) {
  const links = [];
  const re = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    links.push({ path: match[1].trim(), label: (match[2] || match[1]).trim() });
  }
  return links;
}

// ─── Walk all .md files ──────────────────────────────────────────
async function walkMd(dir, rel = "", depth = 0) {
  if (depth > 8) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      files.push(...await walkMd(full, relPath, depth + 1));
    } else if (e.name.endsWith(".md")) {
      files.push(relPath);
    }
  }
  return files;
}

// ─── Mimic resolveLink ────────────────────────────────────────────
async function resolveLink(linkPath) {
  const [pathPart, anchor] = linkPath.split("#");
  const trimmed = pathPart.trim().replace(/^\/+/, "");
  if (!trimmed) return null;

  // Detect wiki/ prefix
  let hasWiki = false;
  try { hasWiki = (await stat(join(VAULT_PATH, "wiki"))).isDirectory(); } catch {}

  const candidates = [];

  // Tier 1: direct
  candidates.push(trimmed);
  if (!trimmed.endsWith(".md")) candidates.push(trimmed + ".md");

  // Tier 2+3: section folders for short names
  if (!trimmed.includes("/") && hasWiki) {
    for (const dir of [
      "wiki/knowledge/entities", "wiki/knowledge", "wiki/work",
      "wiki/system", "wiki/projects", "wiki/memory", "wiki/journal",
      "wiki/maps", "wiki/topics", "wiki/topics/sideprojects",
    ]) {
      candidates.push(`${dir}/${trimmed}.md`);
    }
  }

  // Always try wiki/ prefix
  if (hasWiki) candidates.push(`wiki/${trimmed.endsWith(".md") ? trimmed : trimmed + ".md"}`);
  candidates.push(trimmed.endsWith(".md") ? trimmed : trimmed + ".md");

  // Tier 4: basename fallback — build a quick index
  // (skipped here for simplicity, but resolveLink uses it)

  for (const candidate of candidates) {
    try {
      const s = await stat(join(VAULT_PATH, candidate));
      if (s.isFile()) return candidate + (anchor ? "#" + anchor : "");
    } catch {}
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log(`Vault path: ${VAULT_PATH}\n`);

  // Verify vault
  try { await stat(join(VAULT_PATH, "wiki")); console.log("✓ wiki/ directory found"); }
  catch { console.log("✗ wiki/ directory NOT found — links may fail"); }

  const files = await walkMd(VAULT_PATH);
  console.log(`Scanning ${files.length} .md files...\n`);

  const broken = [];
  const resolved = new Set();
  let totalLinks = 0;

  for (const filePath of files) {
    const content = await readFile(join(VAULT_PATH, filePath), "utf-8");
    const links = extractLinks(content);
    for (const link of links) {
      totalLinks++;
      const target = await resolveLink(link.path);
      if (target) {
        resolved.add(link.path);
      } else {
        broken.push({ from: filePath, link: link.path, label: link.label });
      }
    }
  }

  console.log(`Total wiki-links: ${totalLinks}`);
  console.log(`Resolved:        ${resolved.size}`);
  console.log(`Broken:          ${broken.length}\n`);

  if (broken.length > 0) {
    console.log("Broken links:");
    for (const b of broken) {
      console.log(`  [[${b.link}]] in ${b.from}`);
    }
    console.log("\nDebug: trying each broken link manually...");
    for (const b of broken) {
      const trimmed = b.link.trim().replace(/^\/+/, "");
      console.log(`\n  Link: "${b.link}"`);
      console.log(`    trimmed: "${trimmed}"`);
      console.log(`    hasSlash: ${trimmed.includes("/")}`);

      // Try all candidates
      const tries = [
        trimmed,
        trimmed + ".md",
        `wiki/${trimmed}`,
        `wiki/${trimmed}.md`,
      ];
      if (!trimmed.includes("/")) {
        tries.push(`wiki/knowledge/entities/${trimmed}.md`, `wiki/work/${trimmed}.md`, `wiki/system/${trimmed}.md`);
      }
      for (const t of tries) {
        try {
          const s = await stat(join(VAULT_PATH, t));
          console.log(`    ✓ FOUND: ${t} (isFile=${s.isFile()})`);
        } catch {
          console.log(`    ✗ miss: ${t}`);
        }
      }
    }
  } else {
    console.log("All links resolve! 🎉");
  }
}

main().catch(console.error);