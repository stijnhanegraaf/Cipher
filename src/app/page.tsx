import { ChatInterface } from "@/components/ChatInterface";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  return (
    <div className="relative h-dvh flex flex-col bg-white dark:bg-neutral-950">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <ChatInterface />
    </div>
  );
}