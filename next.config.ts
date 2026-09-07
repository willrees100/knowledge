import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; pdf-parse relies on CJS internals and
  // itself depends on @napi-rs/canvas, another native-binary package — all
  // three need to stay external to the server bundle rather than get
  // webpacked, or a serverless build can fail to package their platform
  // binaries correctly (this reproduced live — see BUILD_LOG.md).
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "@napi-rs/canvas"],
};

export default nextConfig;
