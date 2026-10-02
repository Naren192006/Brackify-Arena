import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Resolve an env var to a bare origin (scheme + host), or null when unset/invalid.
 *
 * CSP sources are derived from env rather than hardcoded: CI builds against
 * api.brackifyarena.com, local and Vercel build against the Render host, so a
 * hardcoded list would silently block one of them.
 */
function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL);
const supabaseOrigin = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);

// Optional integrations stay out of the policy until they are actually enabled,
// otherwise their origins would be advertised to every visitor for nothing.
const withSentry = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
const withPlausible = Boolean(process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN);

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",

  // 'unsafe-inline' is required for script-src: the App Router emits inline
  // bootstrap scripts. Removing it needs per-request nonces, which forces every
  // route out of static rendering. Worth revisiting if the pages ever go dynamic.
  [
    "script-src 'self' 'unsafe-inline'",
    isDev ? "'unsafe-eval'" : null, // React Fast Refresh evaluates in dev only
    "https://checkout.razorpay.com",
    withPlausible ? "https://plausible.io" : null,
    withSentry ? "https://*.ingest.sentry.io" : null,
  ],

  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",

  [
    "connect-src 'self'",
    apiOrigin,
    supabaseOrigin,
    "https://*.supabase.co",
    "wss://*.supabase.co", // Supabase Realtime channels
    "https://api.razorpay.com",
    "https://*.razorpay.com",
    withSentry ? "https://*.ingest.sentry.io" : null,
    withPlausible ? "https://plausible.io" : null,
  ],

  [
    "frame-src",
    "https://checkout.razorpay.com",
    "https://api.razorpay.com",
    "https://accounts.google.com",
  ],

  !isDev ? "upgrade-insecure-requests" : null,
]
  .map((directive) => (Array.isArray(directive) ? directive.filter(Boolean).join(" ") : directive))
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // payment=(self) is what Razorpay checkout needs to open.
    value: "camera=(), geolocation=(), microphone=(), payment=(self), usb=()",
  },
  // Must be same-origin-allow-popups, not same-origin: Supabase's Google OAuth
  // flow returns the result through window.opener, which a strict COOP nulls out.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Strict-Transport-Security is deliberately omitted: Vercel already sends
  // "max-age=63072000; includeSubDomains; preload", and a second conflicting
  // max-age header is worse than none.
];

const nextConfig: NextConfig = {
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "**.supabase.in",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;