import { EntityPage } from "@/components/browse/EntityPage";

export default async function EntityRoute({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return <EntityPage name={decodeURIComponent(name)} />;
}
