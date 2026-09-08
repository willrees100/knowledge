"use client";

import { useState } from "react";
import Link from "next/link";
import type { FileRow, Folder, KB } from "@/lib/types";
import { linkifyCitations } from "@/lib/citations";

interface Props {
  kb: KB;
  initialFiles: FileRow[];
}

// Conservative margin under Vercel's ~4.5MB serverless request-body limit —
// see the size-check comment in FolderUploader's handleFiles for why.
const MAX_UPLOAD_MB = 4;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

const FOLDER_META: Record<Folder, { label: string; accept: string; hint: string }> = {
  notes: { label: "Notes", accept: ".pdf,.docx,.txt", hint: `PDF, DOCX, or TXT — typed text only, max ${MAX_UPLOAD_MB}MB/file` },
  slides: { label: "Slides", accept: ".pdf,.pptx", hint: `PDF or PPTX, max ${MAX_UPLOAD_MB}MB/file` },
  practice: {
    label: "Practice Problems",
    accept: ".pdf,.docx,.pptx,.txt",
    hint: `PDF, DOCX, PPTX, or TXT, max ${MAX_UPLOAD_MB}MB/file`,
  },
};

type QAEntry = {
  question: string;
  answer: string;
  source: "source" | "fallback";
  truncated: boolean;
  feedbackId: string | null;
  thumbs: "up" | "down" | null;
};

export default function KbWorkspace({ kb, initialFiles }: Props) {
  const [files, setFiles] = useState<FileRow[]>(initialFiles);
  const [tab, setTab] = useState<"materials" | "ask" | "test">("materials");

  async function refreshFiles() {
    const res = await fetch(`/api/kb/${kb.id}`);
    if (res.ok) {
      const data = await res.json();
      setFiles(data.files);
    }
  }

  const filesByFolder: Record<Folder, FileRow[]> = {
    notes: files.filter((f) => f.folder === "notes"),
    slides: files.filter((f) => f.folder === "slides"),
    practice: files.filter((f) => f.folder === "practice"),
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-2 flex items-center gap-2 text-sm opacity-60">
        <Link href="/" className="hover:underline">
          Knowledge Bases
        </Link>
        <span>/</span>
      </div>
      <h1 className="text-2xl font-bold mb-1">{kb.name}</h1>
      {kb.description && <p className="opacity-70 text-sm mb-1">{kb.description}</p>}
      <p className="text-xs opacity-40 mb-6 break-all">
        Shareable link: {typeof window !== "undefined" ? window.location.href : `/kb/${kb.id}`}
      </p>

      <div className="flex gap-1 border-b border-black/10 dark:border-white/10 mb-6">
        {(["materials", "ask", "test"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t
                ? "border-black dark:border-white"
                : "border-transparent opacity-50 hover:opacity-80"
            }`}
          >
            {t === "materials" ? "Materials" : t === "ask" ? "Ask" : "Practice Test"}
          </button>
        ))}
      </div>

      {tab === "materials" && (
        <div className="space-y-8">
          {(Object.keys(FOLDER_META) as Folder[]).map((folder) => (
            <FolderUploader
              key={folder}
              kbId={kb.id}
              folder={folder}
              files={filesByFolder[folder]}
              onUploaded={refreshFiles}
            />
          ))}
        </div>
      )}

      {tab === "ask" && <AskPanel kbId={kb.id} files={files} />}

      {tab === "test" && <TestPanel kbId={kb.id} hasPractice={filesByFolder.practice.length > 0} />}
    </div>
  );
}

function FolderUploader({
  kbId,
  folder,
  files,
  onUploaded,
}: {
  kbId: string;
  folder: Folder;
  files: FileRow[];
  onUploaded: () => void;
}) {
  const meta = FOLDER_META[folder];
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setErrors([]);

    const allFiles = Array.from(fileList);
    // Vercel's serverless functions reject a request outright (413, plain
    // text, not JSON) once the whole body crosses ~4.5MB — confirmed live.
    // MAX_UPLOAD_BYTES is a conservative per-file margin under that (the
    // multipart body carries some overhead, and a batch of several files
    // shares the same request). Filtering these out client-side means a
    // student uploading one oversized slide deck alongside several fine ones
    // still gets the good ones through, with a clear reason for the one that
    // didn't, instead of the whole batch failing opaquely.
    const tooLarge = allFiles.filter((f) => f.size > MAX_UPLOAD_BYTES);
    const uploadable = allFiles.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    const sizeErrors = tooLarge.map(
      (f) =>
        `${f.name}: too large to upload (${(f.size / 1024 / 1024).toFixed(1)}MB) — this deployment's limit is about ${MAX_UPLOAD_MB}MB per file. Try a smaller or compressed version.`
    );

    if (uploadable.length === 0) {
      setErrors(sizeErrors);
      setBusy(false);
      return;
    }

    const formData = new FormData();
    formData.append("folder", folder);
    uploadable.forEach((f) => formData.append("files", f));

    try {
      const res = await fetch(`/api/kb/${kbId}/files`, { method: "POST", body: formData });

      let data: { results?: Array<{ filename: string; ok: boolean; error?: string }>; error?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        // The response wasn't JSON at all — this happens when Vercel's own
        // platform rejects the request before it ever reaches our route
        // handler (e.g. a 413 "Request Entity Too Large" plain-text page for
        // a request that slipped past the client-side size check above,
        // such as several files that are each fine alone but too large
        // together). Surface something actionable instead of a raw parse error.
        throw new Error(
          res.status === 413
            ? `Upload failed: too large for this deployment (combined limit is about ${MAX_UPLOAD_MB}MB per request). Try uploading fewer files at once.`
            : `Upload failed (server returned ${res.status}).`
        );
      }

      if (!res.ok || !data) throw new Error(data?.error ?? "Upload failed.");
      const failed = (data.results ?? []).filter((r) => !r.ok);
      const combinedErrors = [...sizeErrors, ...failed.map((f) => `${f.filename}: ${f.error}`)];
      if (combinedErrors.length > 0) {
        setErrors(combinedErrors);
      }
      onUploaded();
    } catch (err) {
      setErrors([...sizeErrors, err instanceof Error ? err.message : "Upload failed."]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-black/10 dark:border-white/15 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{meta.label}</h3>
        <span className="text-xs opacity-50">{meta.hint}</span>
      </div>

      {files.length > 0 ? (
        <ul className="mb-3 space-y-1 text-sm">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2">
              <a
                href={`/api/files/${f.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted hover:decoration-solid truncate"
              >
                {f.filename}
              </a>
              <span className="text-xs opacity-50 whitespace-nowrap">{f.chunk_count} chunks</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm opacity-50 mb-3">No files yet.</p>
      )}

      <label className="inline-block px-3 py-1.5 text-sm rounded-md border border-black/20 dark:border-white/25 cursor-pointer hover:bg-black/5 dark:hover:bg-white/10">
        {busy ? "Uploading…" : `Upload to ${meta.label}`}
        <input
          type="file"
          multiple
          accept={meta.accept}
          className="hidden"
          disabled={busy}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {errors.length > 0 && (
        <ul className="mt-2 text-xs text-red-600 dark:text-red-400 space-y-0.5">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AskPanel({ kbId, files }: { kbId: string; files: FileRow[] }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<QAEntry[]>([]);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    setError(null);
    const q = question.trim();
    try {
      const res = await fetch(`/api/kb/${kbId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to get an answer.");
      setEntries((prev) => [
        {
          question: q,
          answer: data.answer,
          source: data.source,
          truncated: data.truncated,
          feedbackId: data.feedbackId,
          thumbs: null,
        },
        ...prev,
      ]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function rate(index: number, thumbs: "up" | "down") {
    const entry = entries[index];
    if (!entry.feedbackId) return;
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, thumbs } : e)));
    await fetch(`/api/feedback/${entry.feedbackId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thumbs }),
    });
  }

  return (
    <div>
      <form onSubmit={handleAsk} className="mb-6">
        <textarea
          className="w-full border border-black/15 dark:border-white/20 rounded-lg px-3 py-2 bg-transparent"
          rows={3}
          placeholder="Ask a question about this class's material…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {error && <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>}
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="mt-2 px-4 py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Thinking…" : "Ask"}
        </button>
      </form>

      <div className="space-y-6">
        {entries.map((entry, i) => (
          <div key={i} className="border border-black/10 dark:border-white/15 rounded-lg p-4">
            <p className="font-medium mb-2">{entry.question}</p>
            {entry.truncated && (
              <p className="text-xs mb-2 px-2 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 inline-block">
                Note: this class&apos;s material is large enough that some of it was truncated for this answer.
              </p>
            )}
            <p
              className={`whitespace-pre-wrap text-sm ${
                entry.source === "fallback" ? "italic opacity-70" : ""
              }`}
            >
              {linkifyCitations(entry.answer, files)}
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="opacity-50 text-xs">Helpful?</span>
              <button
                onClick={() => rate(i, "up")}
                className={`px-2 py-1 rounded ${
                  entry.thumbs === "up" ? "bg-green-100 dark:bg-green-900" : "hover:bg-black/5 dark:hover:bg-white/10"
                }`}
                aria-label="Thumbs up"
              >
                👍
              </button>
              <button
                onClick={() => rate(i, "down")}
                className={`px-2 py-1 rounded ${
                  entry.thumbs === "down" ? "bg-red-100 dark:bg-red-900" : "hover:bg-black/5 dark:hover:bg-white/10"
                }`}
                aria-label="Thumbs down"
              >
                👎
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TestPanel({ kbId, hasPractice }: { kbId: string; hasPractice: boolean }) {
  const [numQuestions, setNumQuestions] = useState(10);
  const [sections, setSections] = useState("");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ test: string; truncated: boolean } | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/kb/${kbId}/generate-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numQuestions, sections, focus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate test.");
      setResult({ test: data.test, truncated: data.truncated });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!hasPractice) {
    return (
      <div className="border border-black/10 dark:border-white/15 rounded-lg p-4 text-sm">
        <p className="opacity-80">
          This knowledge base has no <strong>Practice Problems</strong> uploaded yet. The test generator uses your
          real practice problems as its difficulty/style anchor and refuses to guess without them — upload some in
          the Materials tab first.
        </p>
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={handleGenerate} className="space-y-4 mb-6 border border-black/10 dark:border-white/15 rounded-lg p-4">
        <div>
          <label className="block text-sm font-medium mb-1">How many questions?</label>
          <input
            type="number"
            min={1}
            max={50}
            className="w-24 border border-black/15 dark:border-white/20 rounded-lg px-3 py-1.5 bg-transparent"
            value={numQuestions}
            onChange={(e) => setNumQuestions(parseInt(e.target.value, 10) || 1)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Which sections/topics to draw from?</label>
          <input
            className="w-full border border-black/15 dark:border-white/20 rounded-lg px-3 py-2 bg-transparent"
            placeholder="e.g. supply & demand, elasticity (leave blank for a mixed test)"
            value={sections}
            onChange={(e) => setSections(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Anything to focus on?</label>
          <input
            className="w-full border border-black/15 dark:border-white/20 rounded-lg px-3 py-2 bg-transparent"
            placeholder="e.g. more word problems, less definitional recall"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
          />
        </div>
        {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate practice test"}
        </button>
      </form>

      {result && (
        <div className="border border-black/10 dark:border-white/15 rounded-lg p-4">
          {result.truncated && (
            <p className="text-xs mb-3 px-2 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 inline-block">
              Note: this class&apos;s material is large enough that some of it was truncated for this test.
            </p>
          )}
          <pre className="whitespace-pre-wrap text-sm font-sans">{result.test}</pre>
        </div>
      )}
    </div>
  );
}
