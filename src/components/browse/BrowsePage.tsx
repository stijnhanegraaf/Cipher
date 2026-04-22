"use client";

import { useEffect, useState } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { FileTree } from "./FileTree";
import { PreviewPane } from "./PreviewPane";
import { PreviewHeader } from "./PreviewHeader";
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tgt?.isContentEditable;
      if (typing) return;
      e.preventDefault();
      const input = document.querySelector<HTMLInputElement>('input[placeholder^="Filter"]');
      input?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
  const navigateTo = async (target: string) => {
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(target)}`);
      if (!res.ok) return;
      const j = (await res.json()) as { path: string };
      selectFile(j.path);
    } catch { /* swallow */ }
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
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <PreviewHeader folderPath={currentFolder} filePath={currentFile} />
        <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
          <PreviewPane
            folderPath={currentFolder}
            filePath={currentFile}
            onOpenFile={selectFile}
            onOpenFolder={selectFolder}
            onNavigate={navigateTo}
          />
        </div>
      </main>
    </div>
  );
}
