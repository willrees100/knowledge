import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; pdf-parse relies on CJS internals; and
  // @napi-rs/canvas (pdf-parse's own dependency, used for DOM-global
  // polyfills — see lib/parse/pdf.ts) ships a native .node binding that
  // Turbopack refuses to bundle at all ("non-ecmascript placeable asset") if
  // it isn't kept external. All three need to stay external to the server
  // bundle rather than get webpacked. (Also tried removing pdf-parse from
  // this list specifically, to fix a live "DOMMatrix is not defined" error —
  // that broke local dev worse instead, with pdfjs-dist's worker file
  // failing to bundle. Reverted; see BUILD_LOG.md for the full trail and the
  // fix that was actually used: an explicit DOMMatrix polyfill.)
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "@napi-rs/canvas"],
};

export default nextConfig;
