import type { ButtonHTMLAttributes } from "react";
export function LiquidGlassButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={`liquid-button ${className}`} {...props} />; }
