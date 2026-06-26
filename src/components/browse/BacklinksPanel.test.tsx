// @vitest-environment jsdom
import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom";
import { BacklinksPanel } from "./BacklinksPanel";

// Mock fetch globally
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("BacklinksPanel", () => {
  it("renders backlink rows from a mocked fetch", async () => {
    const rows = [
      { sourcePath: "notes/a.md", sourceTitle: "Note A", snippet: "See the project plan here" },
      { sourcePath: "notes/b.md", sourceTitle: "Note B", snippet: "Related to the current work" },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ backlinks: rows }),
    } as Response);

    const onNavigate = vi.fn();
    await act(async () => {
      render(<BacklinksPanel path="notes/target.md" onNavigate={onNavigate} />);
    });

    await waitFor(() => {
      expect(screen.getByText("LINKED MENTIONS · 2")).toBeInTheDocument();
    });

    expect(screen.getByText("Note A")).toBeInTheDocument();
    expect(screen.getByText("Note B")).toBeInTheDocument();
    expect(screen.getByText("See the project plan here")).toBeInTheDocument();
  });

  it("renders nothing when backlinks is empty", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ backlinks: [] }),
    } as Response);

    const { container } = render(
      <BacklinksPanel path="notes/target.md" onNavigate={vi.fn()} />
    );

    await waitFor(() => {
      // Nothing rendered — container should be empty
      expect(container).toBeEmptyDOMElement();
    });
  });

  it("renders nothing on non-200 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: "No vault connected", backlinks: [] }),
    } as Response);

    const { container } = render(
      <BacklinksPanel path="notes/target.md" onNavigate={vi.fn()} />
    );

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });

  it("renders nothing when fetch field backlinks is missing (defensive)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: "unexpected" }),
    } as Response);

    const { container } = render(
      <BacklinksPanel path="notes/target.md" onNavigate={vi.fn()} />
    );

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });
});
