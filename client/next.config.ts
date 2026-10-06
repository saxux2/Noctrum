import type { NextConfig } from "next";

// D-15: rewrite targets come from env so the app can be deployed (the original hard-coded localhost:3000).
const NOCTRUM_API_ORIGIN =
  process.env.NOCTRUM_API_ORIGIN || "http://localhost:8080";
const NOCTRUM_VAULT_API_URL =
  process.env.NOCTRUM_VAULT_API_URL || "http://localhost:8081";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${NOCTRUM_API_ORIGIN}/api/v1/:path*`,
      },
      {
        source: "/health",
        destination: `${NOCTRUM_API_ORIGIN}/health`,
      },
      {
        source: "/external/:path*",
        destination: `${NOCTRUM_VAULT_API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
