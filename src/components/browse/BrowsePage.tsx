"use client";

import { useEffect, useState } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { FileTree } from "./FileTree";
import { PreviewPane } from "./PreviewPane";
import { PreviewHeader } from "./PreviewHeader";
import { LeftPaneFooter } from "./LeftPaneFooter";
import { encodeVaultPath } from "@/lib/browse/path";
import { applyPrefsToCssVars, readPrefs } from "@/lib/browse/reader-prefs";
import { ReaderSettingsPanel } from "./ReaderSettingsPanel";

const EXPAND_KEY = "cipher.browse.expand.v1";

export function BrowsePage({ folderPath: _initialFolder, filePath: _initialFile }: { folderPath: string; filePath: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [treeWidth, setTreeWidth] = useState(280);
  const [expand, setExpand] = useState<Record<string, boolean>>({});
  const [height, setHeight] = useState(800);
  const [mode, setMode] = useState<"rendered" | "source">("rendered");
  const [readerSettingsOpen, setReaderSettingsOpen] = useState(false);

  useEffect(() => { applyPrefsToCssVars(readPrefs()); }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPAND_KEY);
      if (raw) setExpand(JSON.parse(raw));
    } catch {}
    try {
      const raw = localStorage.getItem("cipher.browse.tree-width.v1");
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n)) setTreeWidth(Math.min(480, Math.max(220, n)));
      }
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

  const currentFolder = (pathname ?? "/files").replace(/^\/files\/?/, "");
  const currentFile = searchParams.get("file");

  useEffect(() => { setMode("rendered"); }, [currentFile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        setMode((m) => (m === "rendered" ? "source" : "rendered"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const persistExpand = (next: Record<string, boolean>) => {
    setExpand(next);
    try { localStorage.setItem(EXPAND_KEY, JSON.stringify(next)); } catch {}
  };

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

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = treeWidth;
    let latest = startW;
    const onMove = (me: MouseEvent) => {
      latest = Math.min(480, Math.max(220, startW + (me.clientX - startX)));
      setTreeWidth(latest);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      try { localStorage.setItem("cipher.browse.tree-width.v1", String(latest)); } catch {}
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Leave room in the tree for the breadcrumb header (~32px) and the footer
  // action row (~40px) so the virtualized tree sits flush between them.
  const TREE_CHROME = 72;

  return (
    <div style={{ display: "flex", height: "100dvh", minWidth: 0 }}>
      <aside style={{
        width: treeWidth, borderRight: "1px solid var(--border-subtle)",
        flexShrink: 0, background: "var(--bg-surface-alpha-2)",
        display: "flex", flexDirection: "column", position: "relative",
      }}>
        <PreviewHeader folderPath={currentFolder} filePath={currentFile} />
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <FileTree
            initialPath={currentFolder}
            selectedFilePath={currentFile}
            expandState={expand}
            onExpandChange={persistExpand}
            onSelectFile={selectFile}
            onSelectFolder={selectFolder}
            onOpenFull={openFull}
            width={treeWidth}
            height={Math.max(0, height - TREE_CHROME)}
          />
        </div>
        <LeftPaneFooter
          folderPath={currentFolder}
          filePath={currentFile}
          mode={mode}
          onToggleMode={() => setMode((m) => (m === "rendered" ? "source" : "rendered"))}
          onOpenSettings={() => setReaderSettingsOpen((v) => !v)}
        />
        {readerSettingsOpen && <ReaderSettingsPanel onClose={() => setReaderSettingsOpen(false)} />}
      </aside>
      <div
        onMouseDown={startDrag}
        aria-label="Resize tree"
        style={{
          width: 4,
          cursor: "col-resize",
          background: "var(--border-subtle)",
          flexShrink: 0,
        }}
      />
      <main style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
        <PreviewPane
          folderPath={currentFolder}
          filePath={currentFile}
          mode={mode}
          onOpenFile={selectFile}
          onOpenFolder={selectFolder}
          onNavigate={navigateTo}
        />
      </main>
    </div>
  );
}
