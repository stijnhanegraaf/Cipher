import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { NextRequest } from "next/server";
import { setVaultPath } from "@/lib/vault-reader";
import { POST } from "./route";

// ─── helpers ──────────────────────────────────────────────────────────────────

function req(body: unknown) {
  return new NextRequest("http://localhost/api/daily", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── suite ────────────────────────────────────────────────────────────────────

let root: string;

describe("POST /api/daily", () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "cipher-daily-"));
    // A "journal" folder makes getVaultLayout() detect it as the journalDir.
    await mkdir(join(root, "journal"), { recursive: true });
    setVaultPath(root);
  });

  afterAll(async () => {
    setVaultPath(null);
    await rm(root, { recursive: true, force: true });
  });

  // ── 409 — no vault ──────────────────────────────────────────────────────────
  it("returns 409 when no vault is connected", async () => {
    setVaultPath(null);
    try {
      const res = await POST(req({ date: "2026-06-27" }));
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/no vault/i);
    } finally {
      // Restore vault for subsequent tests.
      setVaultPath(root);
    }
  });

  // ── 400 — bad date ──────────────────────────────────────────────────────────
  it("returns 400 for an invalid date (rolled-over 2026-02-30)", async () => {
    const res = await POST(req({ date: "2026-02-30" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid month (2026-13-01)", async () => {
    const res = await POST(req({ date: "2026-13-01" }));
    expect(res.status).toBe(400);
  });

  // ── 201 — first create ──────────────────────────────────────────────────────
  it("creates the note and returns 201 on first call", async () => {
    const res = await POST(req({ date: "2026-06-27" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { path: string; created: boolean };
    expect(body.created).toBe(true);
    expect(body.path).toContain("2026-06-27.md");
    expect(body.path).toContain("journal");
  });

  // ── 200 + never-clobber guarantee ───────────────────────────────────────────
  it("returns 200 on second call and leaves sentinel bytes UNCHANGED", async () => {
    // Self-contained: create the file ourselves (first POST), then overwrite
    // with a sentinel that the route must NOT replace.  We do not depend on
    // the previous `it` having run first.
    await POST(req({ date: "2026-06-28" })); // creates the file (201 or 200)

    const absFile = join(root, "journal", "2026-06-28.md");
    const sentinel = "SENTINEL_BYTES_MUST_NOT_BE_OVERWRITTEN";
    await writeFile(absFile, sentinel, "utf-8");

    // Second POST for the same date — must open, never write.
    const res = await POST(req({ date: "2026-06-28" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string; created: boolean };
    expect(body.created).toBe(false);
    expect(body.path).toContain("2026-06-28.md");

    // The load-bearing assertion: file content must be the sentinel.
    const content = await readFile(absFile, "utf-8");
    expect(content).toBe(sentinel);
  });

  // ── 422 — no journal folder ─────────────────────────────────────────────────
  it("returns 422 when the vault has no detectable journal folder", async () => {
    // Point to a fresh empty temp directory with no recognised folder names.
    const emptyRoot = await mkdtemp(join(tmpdir(), "cipher-empty-"));
    setVaultPath(emptyRoot);
    try {
      const res = await POST(req({ date: "2026-06-27" }));
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/journal/i);
    } finally {
      setVaultPath(root);
      await rm(emptyRoot, { recursive: true, force: true });
    }
  });

  // ── no-date body falls back gracefully ──────────────────────────────────────
  it("falls back to server date when body.date is absent", async () => {
    // Just check the request doesn't error; status should be 200 (already
    // created a file for today) or 201 (today is a different date).
    const res = await POST(req({}));
    expect([200, 201]).toContain(res.status);
  });
});
