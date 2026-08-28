import type { HTMLAttributes } from "react";
export function GlassModal({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) { return <div className="glass-modal-backdrop"><div className={`glass-modal ${className}`} {...props} /></div>; }
