/** Server-side tournament fetch for SEO surfaces (metadata, JSON-LD, OG images). */
const FIELDS = "slug,title,description,status,start_time,entry_fee_minor,entry_fee_currency";

export type TournamentSeo = {
  slug: string;
  title: string;
  description: string | null;
  status: string;
  start_time: string | null;
  entry_fee_minor: number | null;
  entry_fee_currency: string | null;
};

export async function fetchTournamentSeo(slug: string): Promise<TournamentSeo | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return null;
    const res = await fetch(
      `${supabaseUrl}/rest/v1/tournaments?select=${FIELDS}&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { headers: { apikey: supabaseKey }, next: { revalidate: 600 } },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as TournamentSeo[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
