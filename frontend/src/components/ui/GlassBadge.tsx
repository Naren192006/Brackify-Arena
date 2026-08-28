import type { HTMLAttributes } from "react";
export function GlassBadge({ className = "", ...props }: HTMLAttributes<HTMLSpanElement>) { return <span className={`glass-badge ${className}`} {...props} />; }
