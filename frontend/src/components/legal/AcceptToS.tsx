"use client";

import React from "react";
import Link from "next/link";

interface AcceptToSProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | null;
  className?: string;
}

export function AcceptToS({ checked, onChange, error, className = "" }: AcceptToSProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="flex items-start gap-3 cursor-pointer select-none text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-950 transition"
        />
        <span className="text-slate-300 leading-relaxed">
          I agree to the{" "}
          <Link
            href="/terms"
            target="_blank"
            className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition"
          >
            Terms of Service
          </Link>
          ,{" "}
          <Link
            href="/privacy"
            target="_blank"
            className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition"
          >
            Privacy Policy
          </Link>
          , and{" "}
          <Link
            href="/conduct"
            target="_blank"
            className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition"
          >
            Fair Play Code of Conduct
          </Link>
          .
        </span>
      </label>
      {error && <p className="text-xs text-rose-400 pl-7">{error}</p>}
    </div>
  );
}

