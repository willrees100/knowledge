import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type { Chunk, Folder, FeedbackRow, TestGenerationRow } from "./types";

// MVP persistence: a single local SQLite file, including original file bytes
// stored as BLOBs so citation-downloads work without a separate object store.
// See BUILD_LOG.md for why this was chosen over Postgres, and the honest
// caveat about Vercel's ephemeral serverless filesystem.
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "knowledge.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS kbs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    focus TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    kb_id TEXT NOT NULL REFERENCES kbs(id) ON DELETE CASCADE,
    folder TEXT NOT NULL CHECK (folder IN ('notes','slides','practice')),
    filename TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    ext TEXT NOT NULL,
    content BLOB NOT NULL,
    chunks_json TEXT NOT NULL,
    chunk_count INTEGER NOT NULL,
    char_count INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    kb_id TEXT NOT NULL REFERENCES kbs(id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,
    question TEXT NOT NULL,
    answer_source TEXT NOT NULL CHECK (answer_source IN ('source','fallback')),
    thumbs TEXT CHECK (thumbs IN ('up','down') OR thumbs IS NULL)
  );

  CREATE TABLE IF NOT EXISTS test_generations (
    id TEXT PRIMARY KEY,
    kb_id TEXT NOT NULL REFERENCES kbs(id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,
    config_json TEXT NOT NULL,
    question_count INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_files_kb ON files(kb_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_kb ON feedback(kb_id);
  CREATE INDEX IF NOT EXISTS idx_tests_kb ON test_generations(kb_id);
`);

export default db;

// ---------- KBs ----------

export function createKB(input: { id: string; name: string; description: string; focus: string }) {
  db.prepare(
    `INSERT INTO kbs (id, name, description, focus, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(input.id, input.name, input.description, input.focus, new Date().toISOString());
}

export function listKBs() {
  return db.prepare(`SELECT * FROM kbs ORDER BY created_at DESC`).all() as Array<{
    id: string;
    name: string;
    description: string;
    focus: string;
    created_at: string;
  }>;
}

export function getKB(id: string) {
  return db.prepare(`SELECT * FROM kbs WHERE id = ?`).get(id) as
    | { id: string; name: string; description: string; focus: string; created_at: string }
    | undefined;
}

// ---------- Files ----------

export function insertFile(input: {
  id: string;
  kb_id: string;
  folder: Folder;
  filename: string;
  mimetype: string;
  ext: string;
  content: Buffer;
  chunks: Chunk[];
}) {
  const charCount = input.chunks.reduce((sum, c) => sum + c.text.length, 0);
  db.prepare(
    `INSERT INTO files (id, kb_id, folder, filename, mimetype, ext, content, chunks_json, chunk_count, char_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.kb_id,
    input.folder,
    input.filename,
    input.mimetype,
    input.ext,
    input.content,
    JSON.stringify(input.chunks),
    input.chunks.length,
    charCount,
    new Date().toISOString()
  );
}

export function listFiles(kbId: string) {
  return db
    .prepare(
      `SELECT id, kb_id, folder, filename, mimetype, ext, chunk_count, char_count, created_at FROM files WHERE kb_id = ? ORDER BY created_at ASC`
    )
    .all(kbId) as Array<{
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

export function getFileContent(fileId: string) {
  return db.prepare(`SELECT filename, mimetype, content FROM files WHERE id = ?`).get(fileId) as
    | { filename: string; mimetype: string; content: Buffer }
    | undefined;
}

export function getFileChunks(kbId: string, folder?: Folder) {
  const rows = folder
    ? db
        .prepare(`SELECT filename, folder, chunks_json FROM files WHERE kb_id = ? AND folder = ?`)
        .all(kbId, folder)
    : db.prepare(`SELECT filename, folder, chunks_json FROM files WHERE kb_id = ?`).all(kbId);
  return (rows as Array<{ filename: string; folder: Folder; chunks_json: string }>).map((r) => ({
    filename: r.filename,
    folder: r.folder,
    chunks: JSON.parse(r.chunks_json) as Chunk[],
  }));
}

// ---------- Feedback ----------

export function insertFeedback(input: {
  id: string;
  kb_id: string;
  question: string;
  answer_source: "source" | "fallback";
}) {
  db.prepare(
    `INSERT INTO feedback (id, kb_id, timestamp, question, answer_source, thumbs) VALUES (?, ?, ?, ?, ?, NULL)`
  ).run(input.id, input.kb_id, new Date().toISOString(), input.question, input.answer_source);
}

export function setFeedbackThumbs(id: string, thumbs: "up" | "down") {
  const result = db.prepare(`UPDATE feedback SET thumbs = ? WHERE id = ?`).run(thumbs, id);
  return result.changes > 0;
}

export function listFeedbackForKB(kbId: string) {
  return db
    .prepare(`SELECT * FROM feedback WHERE kb_id = ? ORDER BY timestamp DESC`)
    .all(kbId) as FeedbackRow[];
}

// ---------- Test generations ----------

export function insertTestGeneration(input: {
  id: string;
  kb_id: string;
  config: unknown;
  question_count: number;
}) {
  db.prepare(
    `INSERT INTO test_generations (id, kb_id, timestamp, config_json, question_count) VALUES (?, ?, ?, ?, ?)`
  ).run(input.id, input.kb_id, new Date().toISOString(), JSON.stringify(input.config), input.question_count);
}

// ---------- Stats (Feature 4) ----------

export function getStats() {
  const totals = db
    .prepare(
      `SELECT
        COUNT(*) as total_questions,
        SUM(CASE WHEN answer_source = 'source' THEN 1 ELSE 0 END) as source_answers,
        SUM(CASE WHEN answer_source = 'fallback' THEN 1 ELSE 0 END) as fallback_answers,
        SUM(CASE WHEN thumbs = 'up' THEN 1 ELSE 0 END) as thumbs_up,
        SUM(CASE WHEN thumbs = 'down' THEN 1 ELSE 0 END) as thumbs_down,
        SUM(CASE WHEN thumbs IS NULL THEN 1 ELSE 0 END) as thumbs_unrated
      FROM feedback`
    )
    .get() as {
    total_questions: number;
    source_answers: number;
    fallback_answers: number;
    thumbs_up: number;
    thumbs_down: number;
    thumbs_unrated: number;
  };

  const testTotals = db
    .prepare(`SELECT COUNT(*) as total_tests, COALESCE(SUM(question_count),0) as total_questions_generated FROM test_generations`)
    .get() as { total_tests: number; total_questions_generated: number };

  const perKB = db
    .prepare(
      `SELECT
        kbs.id, kbs.name,
        COUNT(feedback.id) as questions_asked,
        SUM(CASE WHEN feedback.thumbs = 'up' THEN 1 ELSE 0 END) as thumbs_up,
        SUM(CASE WHEN feedback.thumbs = 'down' THEN 1 ELSE 0 END) as thumbs_down
      FROM kbs
      LEFT JOIN feedback ON feedback.kb_id = kbs.id
      GROUP BY kbs.id
      ORDER BY kbs.created_at DESC`
    )
    .all() as Array<{ id: string; name: string; questions_asked: number; thumbs_up: number; thumbs_down: number }>;

  const recentFeedback = db
    .prepare(
      `SELECT feedback.timestamp, feedback.question, feedback.answer_source, feedback.thumbs, kbs.name as kb_name
       FROM feedback JOIN kbs ON kbs.id = feedback.kb_id
       ORDER BY feedback.timestamp DESC LIMIT 25`
    )
    .all() as Array<{ timestamp: string; question: string; answer_source: string; thumbs: string | null; kb_name: string }>;

  return { totals, testTotals, perKB, recentFeedback };
}
