import type { NextConfig } from "next";

const mediaHost = process.env.R2_PUBLIC_BASE_URL ? new URL(process.env.R2_PUBLIC_BASE_URL).hostname : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: mediaHost ? [{ protocol: "https", hostname: mediaHost }] : [],
  },
};

export default nextConfig;
