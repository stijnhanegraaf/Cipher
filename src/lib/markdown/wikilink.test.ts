import { describe, it, expect } from "vitest";
import { parseWikiTarget } from "./wikilink";

describe("parseWikiTarget", () => {
  it("plain target", () => {
    expect(parseWikiTarget("Q3 Plan")).toEqual({ target: "Q3 Plan", alias: null, anchor: null });
  });
  it("alias", () => {
    expect(parseWikiTarget("q3-plan|Q3 Plan")).toEqual({ target: "q3-plan", alias: "Q3 Plan", anchor: null });
  });
  it("heading anchor", () => {
    expect(parseWikiTarget("note#Section")).toEqual({ target: "note", alias: null, anchor: "Section" });
  });
  it("block anchor", () => {
    expect(parseWikiTarget("note#^abc123")).toEqual({ target: "note", alias: null, anchor: "^abc123" });
  });
  it("alias + anchor together", () => {
    expect(parseWikiTarget("note#Sec|Label")).toEqual({ target: "note", alias: "Label", anchor: "Sec" });
  });
  it("trims whitespace", () => {
    expect(parseWikiTarget("  a  |  b  ")).toEqual({ target: "a", alias: "b", anchor: null });
  });
});
