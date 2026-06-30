import { describe, it, expect } from "vitest";
import { parseTagQuery } from "./tag-query";

describe("parseTagQuery", () => {
  it("single #tag with no remaining text", () => {
    expect(parseTagQuery("#design")).toEqual({ tags: ["design"], rest: "" });
  });

  it("tag followed by free text", () => {
    expect(parseTagQuery("#design palette")).toEqual({
      tags: ["design"],
      rest: "palette",
    });
  });

  it("multiple tags with trailing text", () => {
    expect(parseTagQuery("#a #b/c stuff")).toEqual({
      tags: ["a", "b/c"],
      rest: "stuff",
    });
  });

  it("no tags — returns original query as rest", () => {
    expect(parseTagQuery("just text")).toEqual({
      tags: [],
      rest: "just text",
    });
  });

  it("regression: short #ai tag (< 3 chars) must NOT be eaten by length>2 filter", () => {
    expect(parseTagQuery("#ai")).toEqual({ tags: ["ai"], rest: "" });
  });

  it("multiple tags with no rest text", () => {
    expect(parseTagQuery("#foo #bar")).toEqual({
      tags: ["foo", "bar"],
      rest: "",
    });
  });

  it("empty string", () => {
    expect(parseTagQuery("")).toEqual({ tags: [], rest: "" });
  });

  it("tag normalized to lowercase", () => {
    expect(parseTagQuery("#Design")).toEqual({ tags: ["design"], rest: "" });
  });

  it("hierarchical tag preserved", () => {
    expect(parseTagQuery("#area/work notes")).toEqual({
      tags: ["area/work"],
      rest: "notes",
    });
  });
});
