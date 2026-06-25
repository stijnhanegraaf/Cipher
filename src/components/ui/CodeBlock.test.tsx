// @vitest-environment jsdom
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";
import { CodeBlock } from "./CodeBlock";

describe("CodeBlock copy button", () => {
  it("copies the CODE TEXT — not the Copy button label — when clicked", async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    const CODE = "const answer = 42;";
    render(
      <CodeBlock>
        <code>{CODE}</code>
      </CodeBlock>
    );

    const button = screen.getByRole("button", { name: /copy code/i });
    await act(async () => {
      button.click();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    // The clipboard must receive the code text, not the button label "Copy".
    const received = writeText.mock.calls[0][0];
    expect(received).toContain(CODE);
    expect(received).not.toBe("Copy");
  });

  it('shows "Copied" on the button immediately after copying', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    render(
      <CodeBlock>
        <code>let x = 1;</code>
      </CodeBlock>
    );

    const button = screen.getByRole("button", { name: /copy code/i });
    await act(async () => {
      button.click();
    });

    // After click the button label should read "Copied".
    expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument();

    // After the timeout, label reverts.
    await act(async () => {
      vi.advanceTimersByTime(1300);
    });
    expect(screen.queryByRole("button", { name: /copied/i })).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
