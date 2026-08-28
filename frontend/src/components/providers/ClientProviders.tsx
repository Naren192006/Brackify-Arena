"use client";

import { Toaster } from "sonner";

import { PublicSiteChrome } from "@/components/layout/PublicSiteChrome";
import { QueryProvider } from "@/lib/query/provider";
import { ThemeProvider } from "@/components/ui/ThemeProvider";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <PublicSiteChrome>{children}</PublicSiteChrome>
        <Toaster position="bottom-right" richColors />
      </QueryProvider>
    </ThemeProvider>
  );
}
