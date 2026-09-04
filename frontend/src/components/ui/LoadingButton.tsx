"use client";

import React from "react";

type LoadingButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  isLoading?: boolean;
  loadingText?: string;
  variant?: "primary" | "secondary" | "danger" | "emerald" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
};

export function LoadingButton({
  children,
  isLoading = false,
  loadingText,
  variant = "primary",
  size = "md",
  icon,
  className = "",
  disabled,
  ...props
}: LoadingButtonProps) {
  const variantStyles = {
    primary:
      "border-cyan-400/40 bg-cyan-400/20 text-arena-accent hover:bg-cyan-400/30 focus-visible:ring-cyan-400 shadow-cyan-950/30",
    secondary:
      "border-white/10 bg-white/[0.04] text-arena-muted hover:border-white/20 hover:text-white focus-visible:ring-white",
    danger:
      "border-red-500/40 bg-red-500/20 text-red-300 hover:bg-red-500/30 focus-visible:ring-red-400 shadow-red-950/40",
    emerald:
      "border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 focus-visible:ring-emerald-400 shadow-emerald-950/30",
    ghost:
      "border-transparent bg-transparent text-arena-muted hover:bg-white/5 hover:text-white focus-visible:ring-cyan-400",
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs rounded-lg gap-1.5",
    md: "px-4 py-2 text-xs sm:text-sm rounded-xl gap-2",
    lg: "px-6 py-3 text-sm sm:text-base rounded-2xl gap-2.5",
  };

  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      className={`inline-flex items-center justify-center font-semibold border transition-all duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070b14] focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none hover:-translate-y-0.5 active:translate-y-0 shadow-sm ${
        variantStyles[variant]
      } ${sizeStyles[size]} ${className}`}
    >
      {isLoading ? (
        <>
          <svg
            className="animate-spin -ml-0.5 h-3.5 w-3.5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>{loadingText || children}</span>
        </>
      ) : (
        <>
          {icon ? <span className="shrink-0">{icon}</span> : null}
          <span>{children}</span>
        </>
      )}
    </button>
  );
}

