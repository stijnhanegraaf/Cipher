/**
 * /file/[...path] route — mounts FileFullPage for a single vault file.
 */
import { FileFullPage } from "@/components/browse/FileFullPage";

export default async function FileRoute({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  // Next 16 dynamic segments — path[] already URL-decoded per segment.
  const joined = path.join("/");
  return <FileFullPage path={joined} />;
}
