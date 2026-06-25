import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { setVaultPath, resolveLink } from "./vault-reader";

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
