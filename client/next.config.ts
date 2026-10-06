import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://localhost:3000/api/v1/:path*",
      },
      {
        source: "/health",
        destination: "http://localhost:3000/health",
      },
      {
        source: "/external/:path*",
        destination: "https://convergence2026-token-api.cldev.cloud/:path*",
      },
    ];
  },
};

export default nextConfig;
