// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock next/navigation (used by CitationPill → useRouter)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

// Mock the sheet hook used by CitationPill
vi.mock("@/lib/hooks/useSheet", () => ({
  useSheet: () => ({ open: vi.fn() }),
}));

// Mock ensureHljsCss (no DOM/fetch needed in tests)
vi.mock("@/components/ui/markdown/hljs-theme", () => ({
  ensureHljsCss: vi.fn(),
}));

// rAF shim for jsdom
beforeAll(() => {
  if (typeof window !== "undefined" && !window.requestAnimationFrame) {
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      setTimeout(() => cb(0), 0);
      return 0;
    };
    window.cancelAnimationFrame = () => {};
  }
});

import { StreamingMarkdown } from "./StreamingMarkdown";

describe("StreamingMarkdown", () => {
  it("renders <strong> for **bold** markdown", async () => {
    await act(async () => {
      render(
        <StreamingMarkdown text="**Bold** text" active={false} />
      );
    });
    const strong = document.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toContain("Bold");
  });

  it("renders citation button with aria-label for [^1] when active:false", async () => {
    const onCitationClick = vi.fn();
    await act(async () => {
      render(
        <StreamingMarkdown
          text="**Bold** and [^1]"
          active={false}
          onCitationClick={onCitationClick}
        />
      );
    });

    // active:false flushes immediately without rAF throttle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const citationBtn = screen.queryByRole("button", { name: "Source 1" });
    expect(citationBtn).not.toBeNull();
  });

  it("citation button fires onCitationClick(1) when clicked", async () => {
    const onCitationClick = vi.fn();
    await act(async () => {
      render(
        <StreamingMarkdown
          text="See [^1] here"
          active={false}
          onCitationClick={onCitationClick}
        />
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const btn = screen.queryByRole("button", { name: "Source 1" });
    expect(btn).not.toBeNull();
    await act(async () => {
      btn?.click();
    });
    expect(onCitationClick).toHaveBeenCalledWith(1);
  });

  it("shows cursor element while active", async () => {
    const { container } = render(
      <StreamingMarkdown text="Hello" active={true} />
    );
    // The cursor span has aria-hidden and specific text
    const cursor = container.querySelector("[aria-hidden]");
    expect(cursor).not.toBeNull();
    expect(cursor?.textContent).toBe("▌");
  });

  it("hides cursor when not active", async () => {
    const { container } = render(
      <StreamingMarkdown text="Hello" active={false} />
    );
    const cursor = container.querySelector("[aria-hidden]");
    expect(cursor).toBeNull();
  });
});
