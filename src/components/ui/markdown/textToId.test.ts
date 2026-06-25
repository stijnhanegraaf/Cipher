import { describe, it, expect } from "vitest";
import React from "react";
import { textToId } from "./CopyHeadingLink";

describe("textToId", () => {
  it("converts a plain string to a slug", () => {
    expect(textToId("Hello World")).toBe("hello-world");
  });

  it("converts a number child to a slug", () => {
    expect(textToId(42)).toBe("42");
  });

  it("strips leading and trailing dashes", () => {
    expect(textToId("  Hello  ")).toBe("hello");
  });

  it("collapses multiple non-alphanumeric characters into a single dash", () => {
    expect(textToId("foo -- bar")).toBe("foo-bar");
  });

  it("extracts text from nested React elements", () => {
    const children = React.createElement(
      "span",
      null,
      "Nested ",
      React.createElement("strong", null, "Heading"),
      " Text"
    );
    expect(textToId(children)).toBe("nested-heading-text");
  });

  it("handles an array of mixed children", () => {
    const children = ["Getting ", React.createElement("em", null, "Started"), " Today"];
    expect(textToId(children)).toBe("getting-started-today");
  });
});
