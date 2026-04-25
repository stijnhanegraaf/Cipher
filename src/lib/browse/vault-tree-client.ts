"use client";

export interface TreeChild {
  name: string;
  path: string;
  type: "folder" | "file";
  ext: string;
  size: number;
  mtime: number;
}

const cache = new Map<string, Promise<TreeChild[]>>();

export async function fetchChildren(path: string): Promise<TreeChild[]> {
  const key = path;
  if (cache.has(key)) return cache.get(key)!;
  const p = (async () => {
    const url = path
      ? `/api/vault/tree?path=${encodeURIComponent(path)}`
      : `/api/vault/tree`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`vault/tree ${res.status}`);
    const json = (await res.json()) as { children: TreeChild[] };
    return json.children;
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

export function invalidateTreeCache(path?: string) {
  if (path === undefined) cache.clear();
  else cache.delete(path);
}
