import type { HTMLAttributes } from "react";
export function LiquidGlassCard({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={`liquid-card ${className}`} {...props} />; }
