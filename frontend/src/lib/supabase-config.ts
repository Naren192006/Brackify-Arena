export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Supabase's current browser-safe key is publishable. Keep anon as a
  // backwards-compatible alias for projects that still expose that name.
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || url.startsWith("PASTE_YOUR_")) {
    if (process.env.NODE_ENV !== "production") console.error("[supabase] Missing NEXT_PUBLIC_SUPABASE_URL");
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Add it to frontend/.env.local before using Supabase.",
    );
  }
  if (!publishableKey || publishableKey.startsWith("PASTE_YOUR_")) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[supabase] Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add one to frontend/.env.local before using Supabase.",
    );
  }

  try {
    new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }

  return { url, publishableKey };
}
