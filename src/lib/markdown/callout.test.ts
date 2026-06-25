import { describe, it, expect } from "vitest";
import { parseCallout } from "./callout";

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
