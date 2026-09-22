import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Tournament — Brackify Arena";

type Props = { params: Promise<{ slug: string }> };

async function fetchTournament(slug: string) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return null;
    const res = await fetch(
      `${supabaseUrl}/rest/v1/tournaments?select=title,description,status,start_time,entry_fee_minor,entry_fee_currency&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { headers: { apikey: supabaseKey }, next: { revalidate: 600 } },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      title: string;
      description: string | null;
      status: string;
      start_time: string | null;
      entry_fee_minor: number | null;
      entry_fee_currency: string | null;
    }>;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export default async function TournamentOg({ params }: Props) {
  const { slug } = await params;
  const t = await fetchTournament(slug);

  const title = (t?.title ?? "Tournament").slice(0, 80);
  const status = (t?.status ?? "open").toUpperCase();
  const feeMinor = t?.entry_fee_minor ?? 0;
  const fee = feeMinor > 0 ? `₹${(feeMinor / 100).toFixed(0)} entry` : "Free entry";
  const start = t?.start_time
    ? new Date(t.start_time).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "Coming soon";
  const description = (t?.description ?? "Compete in a premium esports tournament on Brackify Arena.").slice(0, 110);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #060a14 0%, #0b1430 55%, #101b3f 100%)",
          color: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "linear-gradient(135deg, #22d3ee, #6366f1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              fontWeight: 700,
              color: "#060a14",
            }}
          >
            B
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 2, color: "#e2e8f0" }}>BRACKIFY ARENA</div>
          <div
            style={{
              marginLeft: "auto",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 2,
              color: "#22d3ee",
              border: "2px solid #22d3ee",
              borderRadius: 999,
              padding: "8px 24px",
            }}
          >
            {status}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.08,
              maxWidth: 1020,
              backgroundImage: "linear-gradient(90deg, #f8fafc, #67e8f9)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 30, color: "#94a3b8", maxWidth: 950 }}>{description}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#67e8f9" }}>{fee}</div>
          <div style={{ width: 2, height: 30, background: "#334155" }} />
          <div style={{ fontSize: 30, color: "#94a3b8" }}>{start}</div>
          <div style={{ marginLeft: "auto", fontSize: 26, color: "#64748b", letterSpacing: 2 }}>
            brackify-arena-self.vercel.app
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
