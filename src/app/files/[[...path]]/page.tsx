import { BrowsePage } from "@/components/browse/BrowsePage";
import { decodeVaultPath } from "@/lib/browse/path";

export default async function FilesRoute({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<{ file?: string }>;
}) {
  const p = await params;
  const s = await searchParams;
  const folderPath = decodeVaultPath(p.path);
  const filePath = s.file ? decodeURIComponent(s.file) : null;
  return <BrowsePage folderPath={folderPath} filePath={filePath} />;
}
