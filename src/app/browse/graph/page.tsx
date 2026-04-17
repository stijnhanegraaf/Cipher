import { ChatInterface } from "@/components/ChatInterface";

// /browse/graph — Vault graph view.
// Renders ChatInterface with view="graph" so the shell (sidebar, top bar,
// detail sheet, palette) is shared. The graph itself fills the content area.

export default function GraphPage() {
  return <ChatInterface view="graph" />;
}
