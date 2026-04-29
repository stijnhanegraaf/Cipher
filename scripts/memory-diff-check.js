#!/usr/bin/env node
/**
 * memory-diff-check.js
 * Daily diff alarm for MEMORY.md.
 *
 * Compares MEMORY.md today vs yesterday (git diff HEAD~1).
 * Flags new lines whose source is an untrusted file.
 *
 * Outputs: list of suspicious promotions.
 *
 * Runs standalone via cron. Exits 0 if clean, exits 1 if suspicious
 * content found (so cron failure notifications fire).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MEMORY_PATH = path.join(__dirname, '../MEMORY.md');
const VAULT_ROOT = path.join(__dirname, '../Obsidian/wiki');

/**
 * Check if a file path in the vault has trust: untrusted in its frontmatter.
 */
function isUntrustedSource(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let inFrontmatter = false;
    for (const line of lines) {
      if (line.trim() === '---') {
        if (!inFrontmatter) { inFrontmatter = true; continue; }
        else break;
      }
      if (inFrontmatter) {
        const m = line.match(/^trust:\s*(.+)/i);
        if (m && m[1].trim() === 'untrusted') return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Map a wiki-link or path mention to an absolute vault path.
 */
function resolveVaultPath(mention) {
  // Strip brackets and anchors
  const clean = mention.replace(/^\[\[/, '').replace(/\]\]$/, '').replace(/\|.*$/, '').replace(/#.*$/, '');
  const withExt = clean.endsWith('.md') ? clean : clean + '.md';
  return path.join(VAULT_ROOT, withExt);
}

/**
 * Extract wiki-links from a line of text.
 */
function extractLinks(line) {
  const links = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = regex.exec(line)) !== null) {
    links.push(m[1]);
  }
  return links;
}

function main() {
  if (!fs.existsSync(MEMORY_PATH)) {
    console.log('ℹ️  MEMORY.md not found, skipping.');
    process.exit(0);
  }

  // Get the diff of MEMORY.md against HEAD~1
  let diff;
  try {
    diff = execSync('git diff HEAD~1 -- MEMORY.md', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
  } catch (err) {
    // git diff returns non-zero when there's no previous commit or no changes
    if (err.stdout) diff = err.stdout;
    else {
      console.log('ℹ️  No git history for MEMORY.md, skipping.');
      process.exit(0);
    }
  }

  if (!diff.trim()) {
    console.log('✅ No changes to MEMORY.md since yesterday.');
    process.exit(0);
  }

  // Parse diff: look for added lines (those starting with + but not +++ )
  const addedLines = diff
    .split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++'))
    .map(l => l.slice(1));

  if (addedLines.length === 0) {
    console.log('✅ No new lines in MEMORY.md since yesterday.');
    process.exit(0);
  }

  // For each added line, check if it references an untrusted source
  const suspicious = [];
  for (const line of addedLines) {
    const links = extractLinks(line);
    for (const link of links) {
      const vaultPath = resolveVaultPath(link);
      if (fs.existsSync(vaultPath) && isUntrustedSource(vaultPath)) {
        suspicious.push({ line: line.trim(), link, vaultPath });
      }
    }
    // Also flag if the line itself contains trust: untrusted (inline paste)
    if (line.includes('trust: untrusted') || line.includes('source: twitter') || line.includes('source: caldav')) {
      // Only flag if not already caught by wiki-link check
      if (!links.some(l => {
        const vp = resolveVaultPath(l);
        return fs.existsSync(vp) && isUntrustedSource(vp);
      })) {
        suspicious.push({ line: line.trim(), link: null, vaultPath: null });
      }
    }
  }

  if (suspicious.length === 0) {
    console.log(`✅ ${addedLines.length} new line(s) in MEMORY.md, none from untrusted sources.`);
    process.exit(0);
  }

  console.log(`🚨 SUSPICIOUS: ${suspicious.length} new line(s) from untrusted source(s) promoted to MEMORY.md:`);
  console.log('');
  for (const item of suspicious) {
    if (item.link) {
      console.log(`  • Link: [[${item.link}]]`);
      console.log(`    Line: ${item.line.substring(0, 120)}${item.line.length > 120 ? '...' : ''}`);
    } else {
      console.log(`  • Inline untrusted content:`);
      console.log(`    Line: ${item.line.substring(0, 120)}${item.line.length > 120 ? '...' : ''}`);
    }
  }
  console.log('');
  console.log('Action: Review these promotions. If legitimate, add an override comment:');
  console.log('  <!-- memory-diff-check: ok -- reason: brief explanation -->');

  process.exit(1);
}

main();
