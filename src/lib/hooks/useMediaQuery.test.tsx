// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import { useMediaQuery, useIsMobile } from "./useMediaQuery";

// ── matchMedia mock helpers ──────────────────────────────────────────────
type ChangeListener = (e: { matches: boolean }) => void;

interface MockMql {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  _fire: (matches: boolean) => void;
}

function createMockMql(initialMatches: boolean): MockMql {
  const listeners: ChangeListener[] = [];
  return {
    matches: initialMatches,
    addEventListener: vi.fn((_type: string, cb: ChangeListener) => {
      listeners.push(cb);
    }),
    removeEventListener: vi.fn((_type: string, cb: ChangeListener) => {
      const idx = listeners.indexOf(cb);
      if (idx !== -1) listeners.splice(idx, 1);
    }),
    _fire: (matches: boolean) => {
      for (const cb of listeners) cb({ matches });
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("useMediaQuery", () => {
  let mockMql: MockMql;

  beforeEach(() => {
    mockMql = createMockMql(false);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue(mockMql),
    });
  });

  it("returns false initially (SSR-safe: useState starts at false)", () => {
    const { result } = renderHook(() => useMediaQuery("(max-width: 640px)"));
    // Initial state is false even after effects, because mql.matches is also false in mock.
    // This mirrors SSR behaviour where the server always renders false.
    expect(result.current).toBe(false);
  });

  it("updates to true when matchMedia fires a change event", () => {
    const { result } = renderHook(() => useMediaQuery("(max-width: 640px)"));

    act(() => {
      mockMql._fire(true);
    });

    expect(result.current).toBe(true);
  });

  it("updates back to false when matchMedia fires change with false", () => {
    const { result } = renderHook(() => useMediaQuery("(max-width: 640px)"));

    act(() => { mockMql._fire(true); });
    expect(result.current).toBe(true);

    act(() => { mockMql._fire(false); });
    expect(result.current).toBe(false);
  });

  it("removes the listener on unmount (no memory leak)", () => {
    const { unmount } = renderHook(() => useMediaQuery("(max-width: 640px)"));
    unmount();
    expect(mockMql.removeEventListener).toHaveBeenCalledOnce();
  });

  it("calls matchMedia with the provided query string", () => {
    renderHook(() => useMediaQuery("(min-width: 1024px)"));
    expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 1024px)");
  });
});

describe("useIsMobile", () => {
  beforeEach(() => {
    const mockMql = createMockMql(false);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue(mockMql),
    });
  });

  it("passes (max-width: 640px) to useMediaQuery", () => {
    renderHook(() => useIsMobile());
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 640px)");
  });

  it("returns false initially", () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
