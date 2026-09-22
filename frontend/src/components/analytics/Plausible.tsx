import Script from "next/script";

/**
 * Privacy-friendly analytics. Inert until NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set
 * (e.g. "brackify-arena-self.vercel.app") — no script, no requests otherwise.
 */
export function Plausible() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return null;

  return (
    <Script defer data-domain={domain} src="https://plausible.io/js/script.js" strategy="afterInteractive" />
  );
}
