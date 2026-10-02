"use client";

import { useTheme } from "@/components/ui/ThemeProvider";
import { MoonIcon, SunIcon } from "@/components/ui/icons";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <button type="button" className="theme-toggle" aria-label="Theme toggle" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <SunIcon size={17} /> : <MoonIcon size={17} />}
    </button>
  );
}
