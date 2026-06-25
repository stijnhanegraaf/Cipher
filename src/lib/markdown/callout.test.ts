import { describe, it, expect } from "vitest";
import { parseCallout, stripCalloutLine } from "./callout";

describe("parseCallout", () => {
  it("plain note", () => {
    expect(parseCallout("[!note]")).toEqual({
      type: "note",
      rawType: "note",
      title: null,
      foldable: false,
      defaultOpen: true,
    });
  });

  it("custom title", () => {
    expect(parseCallout("[!warning] Heads up")).toMatchObject({
      type: "warning",
      rawType: "warning",
      title: "Heads up",
      foldable: false,
      defaultOpen: true,
    });
  });

  it("tip uppercased input lowercased", () => {
    expect(parseCallout("[!TIP]")).toMatchObject({
      type: "tip",
      rawType: "tip",
    });
  });

  it("collapsed fold sign", () => {
    expect(parseCallout("[!note]- Hidden")).toMatchObject({
      type: "note",
      foldable: true,
      defaultOpen: false,
      title: "Hidden",
    });
  });

  it("expanded fold sign", () => {
    expect(parseCallout("[!info]+")).toMatchObject({
      type: "info",
      foldable: true,
      defaultOpen: true,
      title: null,
    });
  });

  it("alias hint -> tip", () => {
    expect(parseCallout("[!hint]")).toMatchObject({
      type: "tip",
      rawType: "hint",
    });
  });

  it("alias summary -> abstract with custom title", () => {
    expect(parseCallout("[!summary] X")).toMatchObject({
      type: "abstract",
      rawType: "summary",
      title: "X",
    });
  });

  it("unknown type falls back to note, preserves rawType", () => {
    expect(parseCallout("[!banana] Y")).toMatchObject({
      type: "note",
      rawType: "banana",
      title: "Y",
    });
  });

  it("leading > is tolerated", () => {
    expect(parseCallout("> [!danger]")).toMatchObject({
      type: "danger",
      foldable: false,
    });
  });

  it("not a callout returns null", () => {
    expect(parseCallout("just a quote")).toBeNull();
  });

  it("empty marker [!] returns null", () => {
    expect(parseCallout("[!]")).toBeNull();
  });

  it("whitespace in title is trimmed", () => {
    expect(parseCallout("[!tip]   Spaced  ")).toMatchObject({
      title: "Spaced",
    });
  });

  it("fold sign with no title", () => {
    expect(parseCallout("[!question]-")).toMatchObject({
      type: "question",
      foldable: true,
      defaultOpen: false,
      title: null,
    });
  });
});

describe("stripCalloutLine", () => {
  it("titled callout: marker AND title are both stripped, leaving empty string", () => {
    // This is the Obsidian-parity fix: `[!note] My Title` must not duplicate
    // "My Title" in the body. The combined strip should return "".
    expect(stripCalloutLine("[!note] My Title", "My Title")).toBe("");
  });

  it("titled callout with trailing body text: only marker+title prefix removed", () => {
    // If the parser somehow emits body after the title in the same text node,
    // preserve it. (Unusual but robustness check.)
    expect(stripCalloutLine("[!warning] Heads up extra body", "Heads up")).toBe("extra body");
  });

  it("no title (null): only the marker prefix is stripped", () => {
    expect(stripCalloutLine("[!note] body text here", null)).toBe("body text here");
  });

  it("no title, no body: empty string after strip", () => {
    expect(stripCalloutLine("[!note]", null)).toBe("");
  });

  it("leading > is stripped along with the marker", () => {
    expect(stripCalloutLine("> [!info] My Info", "My Info")).toBe("");
  });

  it("foldable marker with title stripped", () => {
    expect(stripCalloutLine("[!note]- Hidden", "Hidden")).toBe("");
  });

  it("title not present in text: marker stripped, rest preserved unchanged", () => {
    // If the text node does not start with the title after the marker
    // (edge case: merged runs), we fall back to not truncating.
    expect(stripCalloutLine("[!note] something else", "My Title")).toBe("something else");
  });
});
