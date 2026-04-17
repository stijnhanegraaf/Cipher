import { ChatInterface } from "@/components/ChatInterface";

// /chat — the AI conversation surface. Default behavior.
// Deep-link support: /chat?q=<encoded> auto-fires the query on mount.

export default function ChatPage() {
  return <ChatInterface view="chat" />;
}
