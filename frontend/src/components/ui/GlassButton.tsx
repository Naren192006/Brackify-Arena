import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "success" | "ghost";

export function GlassButton({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const variantClass = variant === "primary" ? "glass-button-primary" : "glass-button-secondary";
  return <button className={`${variantClass} ${className}`} {...props} />;
}
