import type { NextConfig } from "next";

const repo = process.env.PAGES_BASE?.replace(/^\//, "").trim();
const base = repo ? `/${repo}` : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: base,
  },
  allowedDevOrigins: ["127.0.0.1", "*.trycloudflare.com"],
  ...(base ? { basePath: base, assetPrefix: `${base}/` } : {}),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
