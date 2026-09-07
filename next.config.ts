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

  // pdfjs-dist (used internally by pdf-parse) loads its worker script
  // (pdf.worker.mjs) via a computed path at runtime, even for the in-process
  // "fake worker" fallback it uses outside a browser — Vercel's build-time
  // file tracing doesn't follow that and leaves the file out of the deployed
  // function, reproduced live as "Cannot find module .../pdf.worker.mjs" at
  // /var/task/node_modules/pdfjs-dist/.... This explicitly forces it (and the
  // rest of the legacy build directory it lives in) into every API route's
  // trace so the file actually ships.
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/pdfjs-dist/legacy/build/*.mjs"],
  },
};

export default nextConfig;
