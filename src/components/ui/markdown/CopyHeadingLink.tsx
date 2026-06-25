"use client";

import React from "react";

// ─── Helper: extract text content from React children for heading IDs ──
export function textToId(children: React.ReactNode): string {
  let text = "";
  React.Children.forEach(children, (child) => {
    if (typeof child === "string") text += child;
    else if (typeof child === "number") text += child;
    else if (React.isValidElement(child)) text += textToId((child.props as { children?: React.ReactNode }).children);
  });
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export const wikiLinkIcon = (
  <svg
    className="inline-block w-3 h-3 mr-[3px] align-[-1px]"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);

export function CopyHeadingLink({ id }: { id: string }) {
  const copy = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof window === "undefined") return;
    const href = `${window.location.pathname}${window.location.search}#${id}`;
    const full = `${window.location.origin}${href}`;
    navigator.clipboard?.writeText(full).catch(() => {});
  };
  return (
    <a
      href={`#${id}`}
      onClick={copy}
      className="copy-heading"
      aria-label="Copy link to heading"
      style={{
        marginLeft: 6, opacity: 0,
        transition: "opacity 120ms var(--ease-default, ease)",
        textDecoration: "none",
        color: "var(--text-quaternary)",
        fontSize: "0.8em",
      }}
    >
      🔗
    </a>
  );
}
