import { ChatInterface } from "@/components/ChatInterface";

// /browse — Triage Inbox dashboard as the landing surface.
// Renders ChatInterface with view="triage" so the shell (sidebar, top bar,
// detail sheet, palette, drawer) is shared with /chat. When the user submits
// a query, the surface transitions into chat mode the same way it does from
// any other entry point.

export default function BrowsePage() {
  return <ChatInterface view="triage" />;
}
