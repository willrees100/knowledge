// Backend dispatcher. Local dev (and any deploy with no Postgres attached)
// uses lib/db-sqlite.ts. Production on Vercel uses lib/db-postgres.ts instead,
// picked whenever a Postgres connection string is present in the environment
// (set automatically once you attach a Postgres database — e.g. Neon, via
// Vercel's Storage tab — to the project).
//
// Why this exists at all: Vercel's deployed serverless functions run on
// separate, short-lived instances with no shared, writable disk between
// requests. A file (SQLite included) written by one request is frequently
// invisible to the very next request — confirmed live: creating a knowledge
// base succeeded, but loading its page immediately after 404'd, because the
// two requests landed on different instances. A real shared database is the
// only fix; SQLite-on-disk remains fine for local dev, where there's one
// process for the whole session.
//
// require() (not import) is used deliberately so the *unused* backend's
// module code never runs — lib/db-postgres.ts assumes a connection string
// exists and would throw constructing its client otherwise.
import type { Chunk, Folder } from "./types";

type DbBackend = typeof import("./db-sqlite");

const usePostgres = Boolean(
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED
);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const backend: DbBackend = usePostgres ? require("./db-postgres") : require("./db-sqlite");

export const createKB = backend.createKB;
export const listKBs = backend.listKBs;
export const getKB = backend.getKB;
export const deleteKB = backend.deleteKB;
export const insertFile = backend.insertFile;
export const listFiles = backend.listFiles;
export const getFileContent = backend.getFileContent;
export const getFileChunks = backend.getFileChunks;
export const insertFeedback = backend.insertFeedback;
export const setFeedbackThumbs = backend.setFeedbackThumbs;
export const listFeedbackForKB = backend.listFeedbackForKB;
export const insertTestGeneration = backend.insertTestGeneration;
export const getTestGeneration = backend.getTestGeneration;
export const getStats = backend.getStats;

export type { Chunk, Folder };
