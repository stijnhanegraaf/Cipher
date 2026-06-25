// @vitest-environment jsdom
/**
 * Behavior-pin test for the react-markdown components override map.
 * Renders representative markdown fragments through MarkdownRenderer
 * and asserts key nodes render correctly.
 *
 * This test pins behavior BEFORE and AFTER the Task 1 refactor
 * (extracting the components map into createMarkdownComponents).
 * It must stay green across the refactor.
 *
 * jsdom rendering notes:
 * - Non-standard URL schemes (vault://, obsidian://) are normalized to "" by jsdom
 *   before the custom <a> component receives the href prop. As a result, the vault://
 *   interception branch (isVaultLink) is never taken in jsdom; both vault:// and
 *   external links fall through to the regular external link render path.
 * - In react-markdown v10, GFM task list items expose className="task-list-item" on
 *   the li node rather than a checked prop. The current li override does not read
 *   className, so task items render as plain <li> elements without the CheckboxIndicator.
 *   The input override (returning null) does suppress the raw <input> elements.
 */
import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import "@testing-library/jest-dom";
import { MarkdownRenderer } from "../MarkdownRenderer";

// Stub fetch so any accidental network calls in vault-link resolution fail cleanly.
beforeAll(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: false } as Response)
  );
});

describe("MarkdownRenderer behavior-pin (components map)", () => {
  it("renders h1 with a heading id and a copy-heading anchor", () => {
    const { container } = render(<MarkdownRenderer content={"# My Heading"} />);
    const h1 = container.querySelector("h1");
    expect(h1).toBeTruthy();
    // textToId("My Heading") → "my-heading"
    expect(h1?.id).toBe("heading-my-heading");
    // CopyHeadingLink renders <a class="copy-heading"> inside the heading
    const copyLink = h1?.querySelector("a.copy-heading");
    expect(copyLink).toBeTruthy();
    expect(copyLink).toHaveAttribute("href", "#heading-my-heading");
  });

  it("renders h2 with a heading id and a copy-heading anchor", () => {
    const { container } = render(<MarkdownRenderer content={"## Sub Heading"} />);
    const h2 = container.querySelector("h2");
    expect(h2).toBeTruthy();
    expect(h2?.id).toBe("heading-sub-heading");
    expect(h2?.querySelector("a.copy-heading")).toBeTruthy();
  });

  it("renders a regular link as md-link with target=_blank", () => {
    const { container } = render(
      <MarkdownRenderer content="[example](https://example.com)" />
    );
    const link = container.querySelector("a.md-link");
    expect(link).toBeTruthy();
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders a fenced code block inside a CodeBlock (pre + copy button)", () => {
    const { container } = render(
      <MarkdownRenderer content={"```js\nconst x = 1;\n```"} />
    );
    const pre = container.querySelector("pre");
    expect(pre).toBeTruthy();
    // CodeBlock renders a button with aria-label containing "Copy"
    const copyBtn = container.querySelector("button[aria-label]");
    expect(copyBtn).toBeTruthy();
    expect(copyBtn?.getAttribute("aria-label")?.toLowerCase()).toContain("copy");
  });

  it("renders inline code with class mono-caption", () => {
    const { container } = render(
      <MarkdownRenderer content="some `inline code` here" />
    );
    const code = container.querySelector("code.mono-caption");
    expect(code).toBeTruthy();
    expect(code?.textContent).toBe("inline code");
  });

  it("renders a table wrapped in div.table-scroll with role=group", () => {
    const { container } = render(
      <MarkdownRenderer content={"| A | B |\n|---|---|\n| 1 | 2 |"} />
    );
    const wrapper = container.querySelector("div.table-scroll");
    expect(wrapper).toBeTruthy();
    expect(wrapper).toHaveAttribute("role", "group");
    expect(wrapper?.querySelector("table")).toBeTruthy();
  });

  it("renders task list items as <li> elements with input elements suppressed", () => {
    const { container } = render(
      <MarkdownRenderer content={"- [ ] todo\n- [x] done"} />
    );
    const lis = container.querySelectorAll("li");
    expect(lis.length).toBe(2);
    // The input override returns null — no raw checkboxes in the DOM
    expect(container.querySelectorAll("input").length).toBe(0);
  });

  it("renders a blockquote", () => {
    const { container } = render(
      <MarkdownRenderer content="> A quote here." />
    );
    expect(container.querySelector("blockquote")).toBeTruthy();
  });

  it("renders bold text with class text-text-primary", () => {
    const { container } = render(
      <MarkdownRenderer content="**bold text**" />
    );
    const strong = container.querySelector("strong.text-text-primary");
    expect(strong).toBeTruthy();
    expect(strong?.textContent).toBe("bold text");
  });

  it("renders italic text with font-style italic", () => {
    const { container } = render(
      <MarkdownRenderer content="_italic text_" />
    );
    const em = container.querySelector("em");
    expect(em).toBeTruthy();
    expect(em?.getAttribute("style")).toContain("italic");
  });

  it("renders the outer wrapper with markdown-content and typeset classes", () => {
    const { container } = render(
      <MarkdownRenderer content="hello" />
    );
    const wrapper = container.querySelector("div.markdown-content.typeset");
    expect(wrapper).toBeTruthy();
  });

  it("appends className prop to the outer wrapper", () => {
    const { container } = render(
      <MarkdownRenderer content="hello" className="custom-class" />
    );
    const wrapper = container.querySelector("div.markdown-content");
    expect(wrapper?.classList.contains("custom-class")).toBe(true);
  });
});
