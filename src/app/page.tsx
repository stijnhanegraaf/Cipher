import { ChatInterface } from "@/components/ChatInterface";

export default function Home() {
  return (
    <div
      style={{
        backgroundColor: "#08090a",
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ChatInterface />
    </div>
  );
}