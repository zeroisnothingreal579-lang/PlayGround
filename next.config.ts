import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "better-sqlite3",
    "@devicefarmer/adbkit-apkreader",
    "app-info-parser",
    "yauzl",
  ],
  outputFileTracingIncludes: {
    "/**/*": ["./content/replica-skill/**/*"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
