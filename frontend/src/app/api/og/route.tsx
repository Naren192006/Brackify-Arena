import { ImageResponse } from "next/og";

export const alt = "Brackify Arena — Esports Tournaments";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; subtitle?: string }>;
}) {
  const { title, subtitle } = await searchParams;
  const heading = (title ?? "WHERE GRIND MEETS GLORY").slice(0, 80);
  const sub = (subtitle ?? "Clean brackets. Live scoring. Real prizes.").slice(0, 120);

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
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 2, color: "#e2e8f0" }}>
            BRACKIFY ARENA
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.05,
              maxWidth: 1000,
              backgroundImage: "linear-gradient(90deg, #f8fafc, #67e8f9)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {heading}
          </div>
          <div style={{ fontSize: 32, color: "#94a3b8", maxWidth: 900 }}>{sub}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 64, height: 4, background: "#22d3ee", borderRadius: 2 }} />
          <div style={{ fontSize: 26, color: "#67e8f9", letterSpacing: 3, fontWeight: 600 }}>
            PLAY. CLIMB. WIN.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
