"use client";

import { useEffect, useState } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { FileTree } from "./FileTree";
import { encodeVaultPath } from "@/lib/browse/path";

const EXPAND_KEY = "cipher.browse.expand.v1";

export function BrowsePage({ folderPath: _initialFolder, filePath: _initialFile }: { folderPath: string; filePath: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [treeWidth] = useState(280);
  const [expand, setExpand] = useState<Record<string, boolean>>({});
  const [height, setHeight] = useState(800);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPAND_KEY);
      if (raw) setExpand(JSON.parse(raw));
    } catch {}
    const measure = () => setHeight(window.innerHeight);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const persistExpand = (next: Record<string, boolean>) => {
    setExpand(next);
    try { localStorage.setItem(EXPAND_KEY, JSON.stringify(next)); } catch {}
  };

  const currentFolder = (pathname ?? "/files").replace(/^\/files\/?/, "");
  const currentFile = searchParams.get("file");

  const selectFile = (p: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("file", p);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const selectFolder = (p: string) => {
    router.replace(`/files/${encodeVaultPath(p)}`, { scroll: false });
  };
  const openFull = (p: string) => {
    router.push(`/file/${encodeVaultPath(p)}`);
  };

  return (
    <div style={{ display: "flex", height: "100dvh", minWidth: 0 }}>
      <aside style={{ width: treeWidth, borderRight: "1px solid var(--border-subtle)", flexShrink: 0 }}>
        <FileTree
          initialPath=""
          selectedFilePath={currentFile}
          expandState={expand}
          onExpandChange={persistExpand}
          onSelectFile={selectFile}
          onSelectFolder={selectFolder}
          onOpenFull={openFull}
          width={treeWidth}
          height={height}
        />
      </aside>
      <main style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
        <div style={{ padding: 16, color: "var(--text-tertiary)", fontSize: 12 }}>
          Folder: {currentFolder || "(root)"} · File: {currentFile ?? "(none)"}
        </div>
      </main>
    </div>
  );
}
