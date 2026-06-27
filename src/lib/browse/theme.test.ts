// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  readTheme,
  systemTheme,
  resolveTheme,
  applyTheme,
  writeTheme,
  watchSystemTheme,
  type ThemeChoice,
} from "./theme";

const KEY = "brain-theme";

/** Install a matchMedia mock whose dark-match value + change events we control. */
function mockMatchMedia(dark: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches: dark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  vi.stubGlobal("matchMedia", () => mql);
  return {
    mql,
    fire: () => listeners.forEach((cb) => cb()),
    listenerCount: () => listeners.size,
  };
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readTheme", () => {
  it("missing key → system (default)", () => {
    expect(readTheme()).toBe("system");
  });
  it("'light' / 'dark' pass through", () => {
    localStorage.setItem(KEY, "light");
    expect(readTheme()).toBe("light");
    localStorage.setItem(KEY, "dark");
    expect(readTheme()).toBe("dark");
  });
  it("unknown stored value → system", () => {
    localStorage.setItem(KEY, "banana");
    expect(readTheme()).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("light/dark are literal regardless of OS", () => {
    mockMatchMedia(true);
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });
  it("system → OS dark", () => {
    mockMatchMedia(true);
    expect(resolveTheme("system")).toBe("dark");
  });
  it("system → OS light", () => {
    mockMatchMedia(false);
    expect(resolveTheme("system")).toBe("light");
  });
});

describe("systemTheme", () => {
  it("reflects the matchMedia dark match", () => {
    mockMatchMedia(true);
    expect(systemTheme()).toBe("dark");
    mockMatchMedia(false);
    expect(systemTheme()).toBe("light");
  });
});

describe("applyTheme", () => {
  it("light adds .light + data-theme=light", () => {
    mockMatchMedia(false);
    applyTheme("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
  it("dark removes .light + data-theme=dark", () => {
    mockMatchMedia(true);
    document.documentElement.classList.add("light");
    applyTheme("dark");
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
  it("system resolves against the OS", () => {
    mockMatchMedia(true);
    applyTheme("system");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});

describe("writeTheme", () => {
  it("system removes the key (fresh users stay on system)", () => {
    mockMatchMedia(false);
    localStorage.setItem(KEY, "dark");
    writeTheme("system");
    expect(localStorage.getItem(KEY)).toBeNull();
  });
  it("light/dark persist the choice and apply it", () => {
    mockMatchMedia(true);
    writeTheme("light");
    expect(localStorage.getItem(KEY)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("watchSystemTheme", () => {
  it("registers a change listener and returns a cleanup that removes it", () => {
    const m = mockMatchMedia(true);
    const onChange = vi.fn();
    const stop = watchSystemTheme(onChange);
    expect(m.listenerCount()).toBe(1);
    m.fire();
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
    expect(m.listenerCount()).toBe(0);
  });
});
