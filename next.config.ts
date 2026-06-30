import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.placeholderapi.com",
      },
      {
        protocol: "https",
        hostname: "replicate.delivery",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/meta/login",
        destination: "/auth/login",
      },
      {
        source: "/meta/register",
        destination: "/auth/register",
      },
      {
        source: "/meta/:path*",
        destination: "/:path*",
      },
    ];
  },
};

export default nextConfig;
