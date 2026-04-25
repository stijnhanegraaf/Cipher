import { NextRequest } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { join, extname, basename } from "path";
import { getVaultPath } from "@/lib/vault-reader";

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", svg: "image/svg+xml", avif: "image/avif",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8", md: "text/markdown; charset=utf-8",
  json: "application/json; charset=utf-8", csv: "text/csv; charset=utf-8",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};

function safeJoin(root: string, rel: string): string | null {
  const abs = join(root, rel);
  const normalisedRoot = root.endsWith("/") ? root : root + "/";
  if (abs !== root && !abs.startsWith(normalisedRoot)) return null;
  return abs;
}

export async function GET(req: NextRequest) {
  const root = getVaultPath();
  if (!root) return new Response("no vault", { status: 404 });
  const rel = (req.nextUrl.searchParams.get("path") ?? "").replace(/^\/+/, "");
  const abs = safeJoin(root, rel);
  if (!abs) return new Response("path escapes vault", { status: 400 });

  let s;
  try { s = await stat(abs); } catch { return new Response("not found", { status: 404 }); }
  if (!s.isFile()) return new Response("not a file", { status: 400 });

  const ext = extname(abs).toLowerCase().replace(/^\./, "");
  const mime = MIME[ext] ?? "application/octet-stream";
  const download = req.nextUrl.searchParams.get("download") === "1";

  const stream = createReadStream(abs);
  // @ts-expect-error — Node readable stream accepted by the Web fetch Response at runtime.
  return new Response(stream, {
    headers: {
      "content-type": mime,
      "content-length": String(s.size),
      "cache-control": "private, max-age=60",
      ...(download ? { "content-disposition": `attachment; filename="${basename(abs)}"` } : {}),
    },
  });
}
