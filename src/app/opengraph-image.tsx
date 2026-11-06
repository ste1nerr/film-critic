import { ImageResponse } from "next/og";

export const alt = "Film Critic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#0b0b10",
          color: "#ececf1",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", width: 120, height: 12, borderRadius: 6, background: "#f5b301" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", fontSize: 112, fontWeight: 700, letterSpacing: -3, lineHeight: 1 }}>Film Critic</div>
          <div style={{ display: "flex", fontSize: 40, lineHeight: 1.3, color: "#9a9aa8", maxWidth: 960 }}>Rate movies and series on plot, ending, acting, atmosphere and vibe.</div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {["Plot", "Ending", "Acting", "Atmosphere", "Vibe"].map((chip) => (
            <div
              key={chip}
              style={{ display: "flex", padding: "10px 24px", borderRadius: 999, border: "2px solid #f5b301", color: "#f5b301", fontSize: 28 }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
