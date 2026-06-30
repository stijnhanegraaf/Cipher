import { describe, it, expect } from "vitest";
import { converter, parse } from "culori";
import { hexToOklchString } from "./oklch-convert";

const toRgb = converter("rgb");
function channels(s: string) {
  const c = toRgb(parse(s))!;
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}

describe("hexToOklchString round-trip", () => {
  for (const hex of ["#08090a", "#f7f8f8", "#8C8FEE", "#10b981", "#ef4444"]) {
    it(`preserves ${hex} within 1/255`, () => {
      const out = hexToOklchString(hex);
      expect(out.startsWith("oklch(")).toBe(true);
      const [r1, g1, b1] = channels(hex);
      const [r2, g2, b2] = channels(out);
      expect(Math.abs(r1 - r2)).toBeLessThanOrEqual(1);
      expect(Math.abs(g1 - g2)).toBeLessThanOrEqual(1);
      expect(Math.abs(b1 - b2)).toBeLessThanOrEqual(1);
    });
  }
  it("preserves alpha", () => {
    expect(hexToOklchString("rgba(255,255,255,0.05)")).toMatch(/\/\s*0?\.05\s*\)$/);
  });
  it("passes through non-colors unchanged", () => {
    expect(hexToOklchString("var(--x)")).toBe("var(--x)");
    expect(hexToOklchString("0.625rem")).toBe("0.625rem");
  });
});
