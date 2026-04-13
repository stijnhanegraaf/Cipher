import { ChatInterface } from "@/components/ChatInterface";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  return (
    <div className="relative">
      <div className="fixed top-3 right-4 z-50">
        <ThemeToggle />
      </div>
      <ChatInterface />
    </div>
  );
}