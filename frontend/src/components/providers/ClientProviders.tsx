"use client";

import { Toaster } from "sonner";

import { PublicSiteChrome } from "@/components/layout/PublicSiteChrome";
import { QueryProvider } from "@/lib/query/provider";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { CookieConsent } from "@/components/legal/CookieConsent";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <PublicSiteChrome>{children}</PublicSiteChrome>
        <CookieConsent />
        <Toaster position="bottom-right" richColors />
      </QueryProvider>
    </ThemeProvider>
  );
}
