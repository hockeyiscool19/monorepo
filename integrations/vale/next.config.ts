import type { NextConfig } from "next";

// Vale is served at https://eisensoftware.com/vale through the platform's Firebase Hosting rewrite
// (/vale{,/**} → Cloud Run `vale`). basePath prefixes pages, next/link, next/router, next/image AND the
// API routes: the Kroger callback becomes /vale/api/grocery/oauth/callback, so KROGER_REDIRECT_URI must
// include /vale (deploy.yml sets it). Raw fetch("/api/…") calls are NOT prefixed by Next — use
// `${process.env.NEXT_PUBLIC_BASE_PATH}/api/…` (inlined at build time from `env` below).
const basePath = "/vale";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
