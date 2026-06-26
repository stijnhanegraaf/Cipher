/**
 * /browse/tag/[tag] route — mounts TagPage.
 */
import { TagPage } from "@/components/browse/TagPage";

export default async function TagRoute({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  return <TagPage tag={decodeURIComponent(tag)} />;
}
