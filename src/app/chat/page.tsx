import { Suspense } from "react";
import { ChatInterface } from "@/components/ChatInterface";

// /chat — the AI conversation surface. Default behavior.
// Deep-link support: /chat?q=<encoded> auto-fires the query on mount.
//
// Suspense boundary is required because ChatInterface calls useSearchParams(),
// which Next.js needs to statically bail out of during prerender.

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100dvh", background: "var(--bg-marketing)" }} />
      }
    >
      <ChatInterface />
    </Suspense>
  );
}
