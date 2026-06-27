import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { setVaultPath, resolveLink, getVaultLayout } from "./vault-reader";

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cipher-resolve-"));
  await mkdir(join(root, "projects"), { recursive: true });
  await writeFile(join(root, "projects/q3-plan.md"), "# Q3");
  setVaultPath(root);
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

describe("resolveLink normalized fallback", () => {
  it("matches display text with spaces to a hyphenated file, case-insensitively", async () => {
    expect(await resolveLink("Q3 Plan")).toBe("projects/q3-plan.md");
  });
  it("returns null for a genuine miss", async () => {
    expect(await resolveLink("does not exist xyz")).toBeNull();
  });
});

// ─── auditsDir probe tests ────────────────────────────────────────────

describe("getVaultLayout auditsDir probe", () => {
  let vaultRoot: string;

  beforeEach(async () => {
    vaultRoot = await mkdtemp(join(tmpdir(), "cipher-audit-"));
  });

  afterEach(async () => {
    // Clean up the per-test tmpdir to avoid leaking temp directories.
    await rm(vaultRoot, { recursive: true, force: true });
  });

  afterAll(async () => {
    // Restore original vault path after all tests in this suite.
    setVaultPath(root);
  });

  async function layout(r: string) {
    setVaultPath(r);
    return getVaultLayout();
  }

  it("detects top-level audits/ directory", async () => {
    await mkdir(join(vaultRoot, "audits"), { recursive: true });
    const l = await layout(vaultRoot);
    expect(l?.auditsDir).toBe("audits");
  });

  it("detects system/audits under wiki/", async () => {
    await mkdir(join(vaultRoot, "wiki", "system", "audits"), { recursive: true });
    const l = await layout(vaultRoot);
    expect(l?.auditsDir).toBe("wiki/system/audits");
  });

  it(".cipher/layout.json override wins over name probe", async () => {
    await mkdir(join(vaultRoot, "audits"), { recursive: true });
    await mkdir(join(vaultRoot, ".cipher"), { recursive: true });
    await mkdir(join(vaultRoot, "custom-audits"), { recursive: true });
    await writeFile(
      join(vaultRoot, ".cipher", "layout.json"),
      JSON.stringify({ auditsDir: "custom-audits" })
    );
    const l = await layout(vaultRoot);
    expect(l?.auditsDir).toBe("custom-audits");
  });

  it("returns null when no audits folder is present", async () => {
    await mkdir(join(vaultRoot, "notes"), { recursive: true });
    const l = await layout(vaultRoot);
    expect(l?.auditsDir).toBeNull();
  });

  it("derives auditsDir from systemDir when system/audits is not a name match", async () => {
    // Use 'ops' as system dir (matches SYSTEM_NAMES) with an audits subfolder.
    await mkdir(join(vaultRoot, "ops", "audits"), { recursive: true });
    const l = await layout(vaultRoot);
    expect(l?.systemDir).toBe("ops");
    expect(l?.auditsDir).toBe("ops/audits");
  });
});
