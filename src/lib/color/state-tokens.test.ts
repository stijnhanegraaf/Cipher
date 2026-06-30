import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const root = css.slice(css.indexOf(":root"), css.indexOf(".light"));
const light = css.slice(css.indexOf(".light"));
describe("state tokens defined in both themes", () => {
  for (const t of ["--hover-surface","--active-surface","--selected-surface","--selected-border","--ring","--ring-offset"]) {
    it(`${t} in :root and .light`, () => {
      expect(root).toContain(t);
      expect(light).toContain(t);
    });
  }
});
