import React from "react";
import "./ui.css";

type NativeButton = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title" | "type">;
export type ButtonVariant = "default" | "primary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

function cls(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** The one button. Verbs on labels ("Install", "Try again"), sentence case. No native `title`. */
export const Button = React.forwardRef<
  HTMLButtonElement,
  NativeButton & { variant?: ButtonVariant; size?: ButtonSize; icon?: React.ReactNode; type?: "button" | "submit" }
>(function Button({ variant = "default", size = "md", icon, className, children, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cls("lens-btn", variant !== "default" && `is-${variant}`, size !== "md" && `is-${size}`, className)}
      {...rest}
    >
      {icon}
      {children}
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
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = "ghost", size = "md", className, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cls(
        "lens-btn lens-icon-btn",
        variant !== "default" && `is-${variant}`,
        size !== "md" && `is-${size}`,
        className
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});
