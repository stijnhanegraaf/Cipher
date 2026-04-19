#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * create-cipher — one-command scaffolder.
 *
 * Usage:
 *   npx github:stijnhanegraaf/Cipher my-vault
 *   npx create-cipher my-vault                  # once published to npm
 *
 * What it does:
 *   1. Clones the Cipher repo into ./<target>
 *   2. Runs npm install
 *   3. Prompts for a VAULT_PATH (optional — can be set later)
 *   4. Writes .env.local
 *   5. Prints the "npm run dev" next-step.
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const REPO = "https://github.com/stijnhanegraaf/Cipher.git";

const targetArg = process.argv[2];
if (!targetArg) {
  console.error("Usage: create-cipher <target-folder>");
  process.exit(1);
}

const target = resolve(process.cwd(), targetArg);
if (existsSync(target)) {
  console.error(`\n  ✗ ${target} already exists. Pick another name or remove it first.\n`);
  process.exit(1);
}

console.log(`\n  → cloning Cipher into ${target}`);
try {
  execSync(`git clone --depth 1 ${REPO} "${target}"`, { stdio: "inherit" });
} catch {
  console.error("\n  ✗ git clone failed. Is git installed? Are you online?\n");
  process.exit(1);
}

// Strip the history from the clone so the downstream repo starts fresh.
execSync(`rm -rf "${target}/.git"`, { stdio: "ignore" });

console.log(`\n  → installing dependencies (this takes a minute)…\n`);
const install = spawnSync("npm", ["install"], { cwd: target, stdio: "inherit" });
if (install.status !== 0) {
  console.error("\n  ✗ npm install failed.\n");
  process.exit(install.status ?? 1);
}

const rl = createInterface({ input, output });
const answer = (await rl.question(`\n  → VAULT_PATH (absolute path to your Obsidian vault; blank to set later): `)).trim();
rl.close();

const envPath = resolve(target, ".env.local");
const envBody = answer ? `VAULT_PATH=${answer}\n` : "# VAULT_PATH=/absolute/path/to/your/vault\n";
writeFileSync(envPath, envBody);

console.log(`
  ✓ done.

  next:
    cd ${targetArg}
    npm run dev
${answer ? "" : `\n  edit .env.local first if you want to point at your vault.\n`}
  tip: cipher needs Ollama running for chat + embeddings.
       see README.md → LLM setup.
`);
