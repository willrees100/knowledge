import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module and pdf-parse relies on CJS internals —
  // both need to stay external to the server bundle rather than get webpacked.
  serverExternalPackages: ["better-sqlite3", "pdf-parse"],
};

export default nextConfig;
