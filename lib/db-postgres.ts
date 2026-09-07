import { neon } from "@neondatabase/serverless";
import type { Chunk, Folder, FeedbackRow } from "./types";

// Production backend: a real shared Postgres database (Neon, via Vercel's
// native storage integration) so every serverless request instance reads and
// writes the same data. This is what actually makes the deployed app work —
// see the comment in lib/db.ts for why file-based SQLite cannot on Vercel.
const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED;

const sql = neon(connectionString!);

let initPromise: Promise<void> | null = null;

function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS kbs (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          focus TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS files (
          id TEXT PRIMARY KEY,
          kb_id TEXT NOT NULL REFERENCES kbs(id) ON DELETE CASCADE,
          folder TEXT NOT NULL CHECK (folder IN ('notes','slides','practice')),
          filename TEXT NOT NULL,
          mimetype TEXT NOT NULL,
          ext TEXT NOT NULL,
          content BYTEA NOT NULL,
          chunks_json TEXT NOT NULL,
          chunk_count INTEGER NOT NULL,
          char_count INTEGER NOT NULL,
          created_at TEXT NOT NULL
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS feedback (
          id TEXT PRIMARY KEY,
          kb_id TEXT NOT NULL REFERENCES kbs(id) ON DELETE CASCADE,
          timestamp TEXT NOT NULL,
          question TEXT NOT NULL,
          answer_source TEXT NOT NULL CHECK (answer_source IN ('source','fallback')),
          thumbs TEXT CHECK (thumbs IN ('up','down') OR thumbs IS NULL)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS test_generations (
          id TEXT PRIMARY KEY,
          kb_id TEXT NOT NULL REFERENCES kbs(id) ON DELETE CASCADE,
          timestamp TEXT NOT NULL,
          config_json TEXT NOT NULL,
          question_count INTEGER NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_files_kb ON files(kb_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_feedback_kb ON feedback(kb_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_tests_kb ON test_generations(kb_id)`;
    })();
  }
  return initPromise;
}

export async function createKB(input: { id: string; name: string; description: string; focus: string }) {
  await ensureInit();
  await sql`
    INSERT INTO kbs (id, name, description, focus, created_at)
    VALUES (${input.id}, ${input.name}, ${input.description}, ${input.focus}, ${new Date().toISOString()})
  `;
}

export async function listKBs() {
  await ensureInit();
  const rows = await sql`SELECT * FROM kbs ORDER BY created_at DESC`;
  return rows as unknown as Array<{
    id: string;
    name: string;
    description: string;
    focus: string;
    created_at: string;
  }>;
}

export async function getKB(id: string) {
  await ensureInit();
  const rows = await sql`SELECT * FROM kbs WHERE id = ${id}`;
  return (rows as unknown as Array<{ id: string; name: string; description: string; focus: string; created_at: string }>)[0];
}

export async function deleteKB(id: string) {
  await ensureInit();
  // Postgres enforces FK constraints (files/feedback/test_generations all
  // reference kbs.id ON DELETE CASCADE) by default, unlike SQLite.
  const rows = await sql`DELETE FROM kbs WHERE id = ${id} RETURNING id`;
  return (rows as unknown as Array<{ id: string }>).length > 0;
}

export async function insertFile(input: {
  id: string;
  kb_id: string;
  folder: Folder;
  filename: string;
  mimetype: string;
  ext: string;
  content: Buffer;
  chunks: Chunk[];
}) {
  await ensureInit();
  const charCount = input.chunks.reduce((sum, c) => sum + c.text.length, 0);
  await sql`
    INSERT INTO files (id, kb_id, folder, filename, mimetype, ext, content, chunks_json, chunk_count, char_count, created_at)
    VALUES (${input.id}, ${input.kb_id}, ${input.folder}, ${input.filename}, ${input.mimetype}, ${input.ext}, ${input.content}, ${JSON.stringify(input.chunks)}, ${input.chunks.length}, ${charCount}, ${new Date().toISOString()})
  `;
}

export async function listFiles(kbId: string) {
  await ensureInit();
  const rows = await sql`
    SELECT id, kb_id, folder, filename, mimetype, ext, chunk_count, char_count, created_at
    FROM files WHERE kb_id = ${kbId} ORDER BY created_at ASC
  `;
  return rows as unknown as Array<{
    id: string;
    kb_id: string;
    folder: Folder;
    filename: string;
    mimetype: string;
    ext: string;
    chunk_count: number;
    char_count: number;
    created_at: string;
  }>;
}

// Not yet exercised against a live Postgres connection (no instance available
// to test against while building this) — pg-types-style drivers normally
// decode bytea into a real Buffer automatically like `pg` does, but this
// covers the other shapes a JSON-over-HTTP transport could plausibly hand
// back instead, so a citation download can't silently come back corrupted.
// If real testing turns up a shape not covered here, it'll throw here loudly
// (Buffer.from rejects genuinely unrecognized input) rather than the download
// silently serving garbled bytes.
function decodeBytea(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") {
    // Postgres text-format bytea, e.g. "\x89504e470d0a1a0a..."
    if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
    return Buffer.from(value, "base64");
  }
  return Buffer.from(value as ArrayBuffer);
}

export async function getFileContent(fileId: string) {
  await ensureInit();
  const rows = await sql`SELECT filename, mimetype, content FROM files WHERE id = ${fileId}`;
  const row = (rows as unknown as Array<{ filename: string; mimetype: string; content: unknown }>)[0];
  if (!row) return undefined;
  return { filename: row.filename, mimetype: row.mimetype, content: decodeBytea(row.content) };
}

export async function getFileChunks(kbId: string, folder?: Folder) {
  await ensureInit();
  const rows = folder
    ? await sql`SELECT filename, folder, chunks_json FROM files WHERE kb_id = ${kbId} AND folder = ${folder}`
    : await sql`SELECT filename, folder, chunks_json FROM files WHERE kb_id = ${kbId}`;
  return (rows as unknown as Array<{ filename: string; folder: Folder; chunks_json: string }>).map((r) => ({
    filename: r.filename,
    folder: r.folder,
    chunks: JSON.parse(r.chunks_json) as Chunk[],
  }));
}

export async function insertFeedback(input: {
  id: string;
  kb_id: string;
  question: string;
  answer_source: "source" | "fallback";
}) {
  await ensureInit();
  await sql`
    INSERT INTO feedback (id, kb_id, timestamp, question, answer_source, thumbs)
    VALUES (${input.id}, ${input.kb_id}, ${new Date().toISOString()}, ${input.question}, ${input.answer_source}, NULL)
  `;
}

export async function setFeedbackThumbs(id: string, thumbs: "up" | "down") {
  await ensureInit();
  // neon's tagged-template `sql` returns only result *rows* by default (not a
  // rowCount) — a plain UPDATE with no RETURNING clause always comes back as
  // an empty array regardless of whether it matched anything, which would
  // make this silently report "not found" on every successful update. RETURNING
  // id makes the affected row (if any) show up in the result so `.length` is
  // actually meaningful.
  const rows = await sql`UPDATE feedback SET thumbs = ${thumbs} WHERE id = ${id} RETURNING id`;
  return (rows as unknown as Array<{ id: string }>).length > 0;
}

export async function listFeedbackForKB(kbId: string) {
  await ensureInit();
  const rows = await sql`SELECT * FROM feedback WHERE kb_id = ${kbId} ORDER BY timestamp DESC`;
  return rows as unknown as FeedbackRow[];
}

export async function insertTestGeneration(input: {
  id: string;
  kb_id: string;
  config: unknown;
  question_count: number;
}) {
  await ensureInit();
  await sql`
    INSERT INTO test_generations (id, kb_id, timestamp, config_json, question_count)
    VALUES (${input.id}, ${input.kb_id}, ${new Date().toISOString()}, ${JSON.stringify(input.config)}, ${input.question_count})
  `;
}

export async function getStats() {
  await ensureInit();

  // Postgres returns COUNT/SUM as bigint, which node drivers hand back as
  // strings by default to avoid precision loss — explicit ::int casts here
  // keep every one of these fields a real JS number, matching the SQLite
  // backend's native behavior, so arithmetic on them (e.g. thumbs_up +
  // thumbs_down) doesn't silently become string concatenation instead.
  const totalsRows = await sql`
    SELECT
      COUNT(*)::int as total_questions,
      COALESCE(SUM(CASE WHEN answer_source = 'source' THEN 1 ELSE 0 END),0)::int as source_answers,
      COALESCE(SUM(CASE WHEN answer_source = 'fallback' THEN 1 ELSE 0 END),0)::int as fallback_answers,
      COALESCE(SUM(CASE WHEN thumbs = 'up' THEN 1 ELSE 0 END),0)::int as thumbs_up,
      COALESCE(SUM(CASE WHEN thumbs = 'down' THEN 1 ELSE 0 END),0)::int as thumbs_down,
      COALESCE(SUM(CASE WHEN thumbs IS NULL THEN 1 ELSE 0 END),0)::int as thumbs_unrated
    FROM feedback
  `;
  const totals = (
    totalsRows as unknown as Array<{
      total_questions: number;
      source_answers: number;
      fallback_answers: number;
      thumbs_up: number;
      thumbs_down: number;
      thumbs_unrated: number;
    }>
  )[0];

  const testTotalsRows = await sql`
    SELECT COUNT(*)::int as total_tests, COALESCE(SUM(question_count),0)::int as total_questions_generated
    FROM test_generations
  `;
  const testTotals = (testTotalsRows as unknown as Array<{ total_tests: number; total_questions_generated: number }>)[0];

  const perKBRows = await sql`
    SELECT
      kbs.id, kbs.name,
      COUNT(feedback.id)::int as questions_asked,
      COALESCE(SUM(CASE WHEN feedback.thumbs = 'up' THEN 1 ELSE 0 END),0)::int as thumbs_up,
      COALESCE(SUM(CASE WHEN feedback.thumbs = 'down' THEN 1 ELSE 0 END),0)::int as thumbs_down
    FROM kbs
    LEFT JOIN feedback ON feedback.kb_id = kbs.id
    GROUP BY kbs.id
    ORDER BY kbs.created_at DESC
  `;
  const perKB = perKBRows as unknown as Array<{
    id: string;
    name: string;
    questions_asked: number;
    thumbs_up: number;
    thumbs_down: number;
  }>;

  const recentFeedbackRows = await sql`
    SELECT feedback.timestamp, feedback.question, feedback.answer_source, feedback.thumbs, kbs.name as kb_name
    FROM feedback JOIN kbs ON kbs.id = feedback.kb_id
    ORDER BY feedback.timestamp DESC LIMIT 25
  `;
  const recentFeedback = recentFeedbackRows as unknown as Array<{
    timestamp: string;
    question: string;
    answer_source: string;
    thumbs: string | null;
    kb_name: string;
  }>;

  return { totals, testTotals, perKB, recentFeedback };
}
