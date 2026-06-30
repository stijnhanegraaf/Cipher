// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useVault } from "./useVault";

function mockFetchVault(name: string, connected = true) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/api/vault") && (!init || init.method === undefined || init.method === "GET")) {
      return new Response(
        JSON.stringify({ activePath: `/vaults/${name}`, name, connected, hasAudits: false }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    // POST (connect) / DELETE (disconnect)
    return new Response(JSON.stringify({ success: true, path: `/vaults/${name}`, name }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetchVault("sample-vault"));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useVault cross-instance sync", () => {
  it("refreshes its state when a cipher:vault-changed event fires (so other instances stay in sync)", async () => {
    const { result } = renderHook(() => useVault());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.name).toBe("sample-vault");

    // Simulate a DIFFERENT instance connecting to a new vault: the server now
    // reports "my-notes", and a vault-changed event is broadcast.
    vi.stubGlobal("fetch", mockFetchVault("my-notes"));
    await act(async () => {
      window.dispatchEvent(new CustomEvent("cipher:vault-changed"));
    });

    await waitFor(() => expect(result.current.name).toBe("my-notes"));
  });

  it("connect() broadcasts cipher:vault-changed so sibling instances refresh", async () => {
    const listener = vi.fn();
    window.addEventListener("cipher:vault-changed", listener);
    const { result } = renderHook(() => useVault());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.connect("/vaults/my-notes");
    });

    expect(listener).toHaveBeenCalled();
    window.removeEventListener("cipher:vault-changed", listener);
  });

  it("removes its event listener on unmount", async () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { result, unmount } = renderHook(() => useVault());
    await waitFor(() => expect(result.current.loading).toBe(false));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("cipher:vault-changed", expect.any(Function));
  });
});
