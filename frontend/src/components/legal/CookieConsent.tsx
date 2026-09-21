"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "brackify-cookie-consent";

type ConsentChoice = "all" | "essential";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      if (!existing) setVisible(true);
    } catch {
      // storage unavailable (private mode etc.) — don't nag
    }
  }, []);

  const choose = (choice: ConsentChoice) => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ choice, at: new Date().toISOString() }),
      );
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!mounted || !visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6"
    >
      <div className="glass-card mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border-arena-border p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:flex-row sm:items-center">
        <p className="flex-1 text-xs leading-relaxed text-arena-text-secondary sm:text-sm">
          We use strictly necessary cookies to sign you in and keep the arena
          secure. No ad trackers, ever. Preferences (like your theme) are
          stored only on your device.{" "}
          <Link
            href="/cookies"
            className="font-semibold text-arena-accent underline underline-offset-2 hover:text-arena-accent"
          >
            Cookie Policy
          </Link>
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => choose("essential")}
            className="btn-secondary px-4 py-2 text-xs font-semibold sm:text-sm"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => choose("all")}
            className="btn-primary px-4 py-2 text-xs font-bold sm:text-sm"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
