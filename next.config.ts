import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // TMDB's CDN already serves pre-sized images (w185, w500, original…),
    // so skip Vercel image optimization and its free-tier quota.
    unoptimized: true,
    remotePatterns: [new URL("https://image.tmdb.org/t/p/**")],
  },
};

export default nextConfig;
