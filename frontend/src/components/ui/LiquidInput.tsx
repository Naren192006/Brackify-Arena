import type { InputHTMLAttributes } from "react";
export function LiquidInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input className={`liquid-input ${className}`} {...props} />; }
