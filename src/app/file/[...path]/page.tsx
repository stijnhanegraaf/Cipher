/**
 * /file/[...path] route — mounts FileFullPage for a single vault file.
 *
 * .canvas files are short-circuited here (server component) before
 * FileFullPage's useFileContent hook is ever called, preventing the raw
 * JSON from being mis-parsed as markdown.
 */
import { FileFullPage } from "@/components/browse/FileFullPage";
import { CanvasFullPage } from "@/components/browse/CanvasView";

export default async function FileRoute({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  // Next 16 dynamic segments — path[] already URL-decoded per segment.
  const joined = path.join("/");
  if (joined.endsWith(".canvas")) return <CanvasFullPage path={joined} />;
  return <FileFullPage path={joined} />;
}
