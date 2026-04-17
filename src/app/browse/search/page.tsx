import { Suspense } from "react";
import { SearchPage } from "@/components/browse/SearchPage";

// SearchPage calls useSearchParams, which Next.js 16 requires to be wrapped
// in Suspense at build time. Wrap the client component here.
export default function SearchRoute() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh", background: "var(--bg-marketing)" }} />}>
      <SearchPage />
    </Suspense>
  );
}
