import React from "react";
import type { PressWeight } from "./motion/tokens";
import { usePress } from "./press";
import "./ui.css";

type NativeButton = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title" | "type">;
export type ButtonVariant = "default" | "primary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

function cls(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Primary and destructive actions are heavy; everything else is medium (DESIGN.md §5.2). */
export function defaultWeight(variant: ButtonVariant): PressWeight {
  return variant === "primary" || variant === "danger" ? "heavy" : "medium";
}

function useMergedRef<T>(a: React.Ref<T> | undefined, b: React.MutableRefObject<T | null>) {
  return React.useCallback(
    (node: T | null) => {
      b.current = node;
      if (typeof a === "function") a(node);
      else if (a) (a as React.MutableRefObject<T | null>).current = node;
    },
    [a, b]
  );
}

type PressExtras = {
  /** Press weight; defaults from the variant (primary/danger heavy, else medium). */
  weight?: PressWeight;
  /** Work is running: the button stays sunk, and after 300 ms shows a spinner in place of its icon. */
  pending?: boolean;
};

/** The one button. Verbs on labels ("Install", "Try again"), sentence case. No native `title`. */
export const Button = React.forwardRef<
  HTMLButtonElement,
  NativeButton & PressExtras & { variant?: ButtonVariant; size?: ButtonSize; icon?: React.ReactNode; type?: "button" | "submit" }
>(function Button({ variant = "default", size = "md", icon, className, children, type = "button", weight, pending, ...rest }, ref) {
  const press = usePress<HTMLButtonElement>({ weight: weight ?? defaultWeight(variant), pending });
  const merged = useMergedRef(ref, press.ref);
  return (
    <button
      ref={merged}
      type={type}
      className={cls("lens-btn", variant !== "default" && `is-${variant}`, size !== "md" && `is-${size}`, className)}
      {...press.props}
      {...rest}
    >
      {icon ? (
        <span className="lens-press-slot">
          <span className="lens-press-content">{icon}</span>
          <span className="lens-press-spinner" aria-hidden />
        </span>
      ) : null}
      {icon || !pending ? (
        children
      ) : (
        <span className="lens-press-slot">
          <span className="lens-press-content">{children}</span>
          <span className="lens-press-spinner" aria-hidden />
        </span>
      )}
    </button>
  );
});

/**
 * Icon-only button. `label` is required by the type: it becomes the accessible name, so an icon
 * button can never ship unnamed again (a11y F4). Children are not accepted; pass the glyph as `icon`.
 */
export type IconButtonProps = Omit<NativeButton, "aria-label" | "children"> & {
  label: string;
  icon: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
} & PressExtras;

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = "ghost", size = "md", className, weight, pending, ...rest },
  ref
) {
  const press = usePress<HTMLButtonElement>({ weight: weight ?? defaultWeight(variant), pending });
  const merged = useMergedRef(ref, press.ref);
  return (
    <button
      ref={merged}
      type="button"
      aria-label={label}
      className={cls(
        "lens-btn lens-icon-btn",
        variant !== "default" && `is-${variant}`,
        size !== "md" && `is-${size}`,
        className
      )}
      {...press.props}
      {...rest}
    >
      <span className="lens-press-slot">
        <span className="lens-press-content">{icon}</span>
        <span className="lens-press-spinner" aria-hidden />
      </span>
    </button>
  );
});
