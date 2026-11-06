import { ImageResponse } from "next/og";

// Home-screen icon for iOS, which wants a PNG (icon.svg covers everything else).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0b0b10" }}>
        <svg viewBox="0 0 512 512" width="180" height="180">
          <path fill="#f5b301" stroke="#f5b301" strokeWidth="24" strokeLinejoin="round" d="M256 96L298 214L423 218L324 294L359 414L256 344L153 414L188 294L89 218L214 214z" />
        </svg>
      </div>
    ),
    size,
  );
}
