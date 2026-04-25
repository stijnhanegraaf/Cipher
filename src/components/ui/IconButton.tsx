"use client";

/**
 * IconButton — the one primitive for compact icon-only affordances.
 *
 * - Renders as <button>, or <a> when `href` is supplied (polymorphic via `as`).
 * - Consistent hit area (visual 24×22, 44px touch target on coarse pointers).
 * - Focus ring via global `.focus-ring` class.
 * - Pressed/active state driven by `aria-pressed` — no JS hover tracking.
 * - `touch-action: manipulation` is inherited from the global base rule.
 */

import Link from "next/link";
import { forwardRef } from "react";
import type { CSSProperties, ReactNode, ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";

type Size = "sm" | "md";

const SIZE: Record<Size, { w: number; h: number }> = {
  sm: { w: 24, h: 22 },
  md: { w: 28, h: 28 },
};

const base: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  borderRadius: 5,
  border: "1px solid var(--border-subtle)",
  background: "transparent",
  color: "var(--text-tertiary)",
  cursor: "pointer",
  flexShrink: 0,
  textDecoration: "none",
  transition: "var(--transition-hover), transform var(--duration-fast) var(--ease-default)",
};

type CommonProps = {
  size?: Size;
  pressed?: boolean;
  children: ReactNode;
  /** Required — every icon-only control must announce its action. */
  "aria-label": string;
  className?: string;
  style?: CSSProperties;
};

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
    href?: undefined;
  };

type LinkProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "aria-label" | "href"> & {
    href: string;
  };

type Props = ButtonProps | LinkProps;

export const IconButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, Props>(
  function IconButton(props, ref) {
    const { size = "sm", pressed, children, className = "", style, ...rest } = props;
    const { w, h } = SIZE[size];
    const composed: CSSProperties = {
      ...base,
      width: w,
      height: h,
      background: pressed ? "var(--bg-surface-alpha-4)" : base.background,
      color: pressed ? "var(--text-primary)" : base.color,
      ...style,
    };
    const cls = ["icon-btn", "focus-ring", "hit-44", className].filter(Boolean).join(" ");

    const ariaProps = typeof pressed === "boolean" ? { "aria-pressed": pressed } : {};

    if ("href" in rest && rest.href) {
      const { href, ...anchorRest } = rest;
      return (
        <Link
          href={href}
          ref={ref as React.Ref<HTMLAnchorElement>}
          className={cls}
          style={composed}
          {...ariaProps}
          {...anchorRest}
        >
          {children}
        </Link>
      );
    }

    const { type = "button", ...buttonRest } = rest as ButtonProps;
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type={type}
        className={cls}
        style={composed}
        {...ariaProps}
        {...buttonRest}
      >
        {children}
      </button>
    );
  }
);
