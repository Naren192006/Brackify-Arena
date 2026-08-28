import type { ButtonHTMLAttributes } from "react";
type Variant = "primary" | "secondary" | "danger" | "success" | "ghost";
export function GlassButton({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) { return <button className={`glass-button glass-button-${variant} ${className}`} {...props} />; }
