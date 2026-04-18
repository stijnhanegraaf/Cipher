/**
 * /browse/topic/[name] route — mounts TopicPage.
 */
import { TopicPage } from "@/components/browse/TopicPage";

export default async function TopicRoute({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return <TopicPage name={decodeURIComponent(name)} />;
}
