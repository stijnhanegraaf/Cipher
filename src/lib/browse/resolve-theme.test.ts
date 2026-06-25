import { describe, it, expect } from "vitest";
import { resolveTheme } from "./resolve-theme";

describe("resolveTheme", () => {
  it("stored 'light' → light even when OS is dark", () => {
    expect(resolveTheme("light", true)).toBe("light");
  });
  it("stored 'dark' → dark even when OS is light", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("stored null → follows OS dark", () => {
    expect(resolveTheme(null, true)).toBe("dark");
  });
  it("stored null → follows OS light", () => {
    expect(resolveTheme(null, false)).toBe("light");
  });
  it("stored unknown string → follows OS dark", () => {
    expect(resolveTheme("system", true)).toBe("dark");
  });
  it("stored unknown string → follows OS light", () => {
    expect(resolveTheme("system", false)).toBe("light");
  });
});
