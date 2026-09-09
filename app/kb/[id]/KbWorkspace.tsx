"use client";

import { useState } from "react";
import Link from "next/link";
import type { FileRow, Flashcard, Folder, KB, PublicTestQuestion } from "@/lib/types";
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
  const [tab, setTab] = useState<"materials" | "ask" | "test" | "flashcards">("materials");
  const [linkCopied, setLinkCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked (permissions, non-HTTPS, older
      // browsers) — the link text is already visible on the page as a
      // fallback, so failing silently here just means "select it manually."
    }
  }

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
      <div className="text-xs opacity-40 mb-6 flex items-center gap-2 flex-wrap">
        <span className="break-all">
          Shareable link: {typeof window !== "undefined" ? window.location.href : `/kb/${kb.id}`}
        </span>
        <button
          onClick={copyLink}
          className="shrink-0 px-2 py-0.5 rounded border border-black/20 dark:border-white/25 opacity-100 hover:bg-black/5 dark:hover:bg-white/10"
        >
          {linkCopied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div className="flex gap-1 border-b border-black/10 dark:border-white/10 mb-6">
        {(["materials", "ask", "test", "flashcards"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t
                ? "border-black dark:border-white"
                : "border-transparent opacity-50 hover:opacity-80"
            }`}
          >
            {t === "materials" ? "Materials" : t === "ask" ? "Ask" : t === "test" ? "Practice Test" : "Flashcards"}
          </button>
        ))}
      </div>

      {/*
        All three panels stay mounted all the time — only visibility toggles
        with the `hidden` attribute — instead of conditionally rendering
        (unmounting) whichever tab isn't active. Conditional rendering was
        the original approach, and it meant switching away from a tab mid
        upload or mid test-generation destroyed that panel's component
        instance — and with it, whatever was in progress — which is exactly
        the "switching tabs loses all progress" bug reported in
        REVISION_RECEIPT.md. Keeping every panel alive means its own local
        state (an in-flight upload, a generated-but-not-yet-submitted test,
        prior Q&A history) survives a tab switch.
      */}
      <div hidden={tab !== "materials"} className="space-y-8">
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

      <div hidden={tab !== "ask"}>
        <AskPanel kbId={kb.id} files={files} />
      </div>

      <div hidden={tab !== "test"}>
        <TestPanel kbId={kb.id} files={files} hasPractice={filesByFolder.practice.length > 0} />
      </div>

      <div hidden={tab !== "flashcards"}>
        <FlashcardPanel kbId={kb.id} files={files} hasAnyFiles={files.length > 0} />
      </div>
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
  return <QuestionBox kbId={kbId} files={files} />;
}

// Shared by the full-page Ask tab and the compact version embedded in the
// Practice Test tab (per user request: being able to ask the material a
// question without leaving the test you're taking). Each mounted instance
// keeps its own independent question/answer history — asking something
// while on the Ask tab doesn't show up inside the test view or vice versa,
// which is the right behavior since they're separate conversations, but
// worth knowing if it ever looks like "my question disappeared."
function QuestionBox({ kbId, files, compact }: { kbId: string; files: FileRow[]; compact?: boolean }) {
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
      <form onSubmit={handleAsk} className={compact ? "mb-4" : "mb-6"}>
        <textarea
          className="w-full border border-black/15 dark:border-white/20 rounded-lg px-3 py-2 bg-transparent text-sm"
          rows={compact ? 2 : 3}
          placeholder="Ask a question about this class's material…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {error && <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>}
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="mt-2 px-4 py-1.5 text-sm rounded-lg bg-black text-white dark:bg-white dark:text-black font-medium hover:opacity-90 disabled:opacity-50"
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

type GradedResult = {
  id: string;
  correct: boolean;
  feedback: string;
  citation?: string;
  praise?: string;
  correctIndex?: number;
};

function TestPanel({ kbId, files, hasPractice }: { kbId: string; files: FileRow[]; hasPractice: boolean }) {
  const [numQuestions, setNumQuestions] = useState(10);
  const [sections, setSections] = useState("");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [testId, setTestId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PublicTestQuestion[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});

  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, GradedResult> | null>(null);
  const [score, setScore] = useState<{ correct: number; total: number } | null>(null);

  // User-requested feature: ask the material a question without leaving the
  // test. Collapsed by default to keep the test itself the focus.
  const [askOpen, setAskOpen] = useState(false);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setTestId(null);
    setQuestions(null);
    setAnswers({});
    setResults(null);
    setScore(null);
    setGradeError(null);
    try {
      const res = await fetch(`/api/kb/${kbId}/generate-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numQuestions, sections, focus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate test.");
      setTestId(data.testId);
      setQuestions(data.questions);
      setTruncated(data.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitAnswers(e: React.FormEvent) {
    e.preventDefault();
    if (!testId) return;
    setGrading(true);
    setGradeError(null);
    try {
      const res = await fetch(`/api/kb/${kbId}/grade-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId, answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to grade your answers.");
      const byId: Record<string, GradedResult> = {};
      for (const r of data.results as GradedResult[]) byId[r.id] = r;
      setResults(byId);
      setScore({ correct: data.score, total: data.total });
    } catch (err) {
      setGradeError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setGrading(false);
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

  const allAnswered = questions !== null && questions.every((q) => {
    const a = answers[q.id];
    return q.type === "multiple_choice" ? typeof a === "number" : typeof a === "string" && a.trim().length > 0;
  });

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
          {busy ? "Generating…" : questions ? "Generate a new test" : "Generate practice test"}
        </button>
      </form>

      {questions && (
        <div className="space-y-4">
          <div className="border border-black/10 dark:border-white/15 rounded-lg">
            <button
              type="button"
              onClick={() => setAskOpen((v) => !v)}
              className="w-full text-left px-4 py-3 text-sm font-medium flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 rounded-lg"
            >
              <span>💬 Ask about this material</span>
              <span className="opacity-50 text-xs">{askOpen ? "Hide" : "Ask a question without leaving the test"}</span>
            </button>
            {askOpen && (
              <div className="px-4 pb-4 pt-1 border-t border-black/10 dark:border-white/15">
                <QuestionBox kbId={kbId} files={files} compact />
              </div>
            )}
          </div>

          <form onSubmit={handleSubmitAnswers} className="space-y-4">
          {truncated && (
            <p className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 inline-block">
              Note: this class&apos;s material is large enough that some of it was truncated for this test.
            </p>
          )}

          {score && (
            <div className="border border-black/10 dark:border-white/15 rounded-lg p-4 font-semibold">
              Score: {score.correct} / {score.total}
            </div>
          )}

          {questions.map((q, i) => {
            const result = results?.[q.id];
            const graded = result !== undefined;
            return (
              <div
                key={q.id}
                className={`border rounded-lg p-4 ${
                  graded
                    ? result.correct
                      ? "border-green-400 dark:border-green-700 bg-green-50 dark:bg-green-950/30"
                      : "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20"
                    : "border-black/10 dark:border-white/15"
                }`}
              >
                <p className="font-medium mb-3">
                  {i + 1}. {q.prompt}
                </p>

                {q.type === "multiple_choice" ? (
                  <div className="space-y-2">
                    {q.choices.map((choice, ci) => {
                      const isCorrectChoice = graded && result.correctIndex === ci;
                      return (
                        <label
                          key={ci}
                          className={`flex items-start gap-2 text-sm cursor-pointer ${
                            isCorrectChoice ? "font-semibold text-green-700 dark:text-green-400" : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            disabled={graded}
                            checked={answers[q.id] === ci}
                            onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: ci }))}
                            className="mt-1"
                          />
                          <span>
                            {choice}
                            {isCorrectChoice && " ✓ correct answer"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <textarea
                    className="w-full border border-black/15 dark:border-white/20 rounded-lg px-3 py-2 bg-transparent text-sm disabled:opacity-70"
                    rows={3}
                    disabled={graded}
                    placeholder="Your answer…"
                    value={(answers[q.id] as string) ?? ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  />
                )}

                {graded && (
                  <div className="mt-3 text-sm">
                    <p className={result.correct ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
                      {result.correct ? "✅ Correct" : "❌ Not quite"}
                      {result.praise && <span className="font-semibold"> — {result.praise}</span>}
                    </p>
                    <p className="opacity-80 mt-1">{linkifyCitations(withCitation(result), files)}</p>
                  </div>
                )}
              </div>
            );
          })}

          {gradeError && <p className="text-red-600 dark:text-red-400 text-sm">{gradeError}</p>}

          {!results && (
            <button
              type="submit"
              disabled={grading || !allAnswered}
              className="px-4 py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black font-medium hover:opacity-90 disabled:opacity-50"
            >
              {grading ? "Grading…" : allAnswered ? "Submit answers" : "Answer every question to submit"}
            </button>
          )}
          </form>
        </div>
      )}
    </div>
  );
}

function withCitation(result: GradedResult): string {
  return result.citation ? `${result.feedback} ${result.citation}` : result.feedback;
}

function withCardCitation(card: Flashcard): string {
  return card.citation ? `${card.back} ${card.citation}` : card.back;
}

function FlashcardPanel({ kbId, files, hasAnyFiles }: { kbId: string; files: FileRow[]; hasAnyFiles: boolean }) {
  const [numCards, setNumCards] = useState(15);
  const [sections, setSections] = useState("");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState<Record<string, "know" | "learning">>({});

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCards(null);
    setIndex(0);
    setFlipped(false);
    setTally({});
    try {
      const res = await fetch(`/api/kb/${kbId}/generate-flashcards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numCards, sections, focus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate flashcards.");
      setCards(data.cards);
      setTruncated(data.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function go(delta: number) {
    if (!cards) return;
    setIndex((i) => Math.max(0, Math.min(cards.length - 1, i + delta)));
    setFlipped(false);
  }

  function shuffle() {
    if (!cards) return;
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setCards(shuffled);
    setIndex(0);
    setFlipped(false);
  }

  function mark(cardId: string, verdict: "know" | "learning") {
    setTally((prev) => ({ ...prev, [cardId]: verdict }));
    if (cards && index < cards.length - 1) {
      setIndex(index + 1);
      setFlipped(false);
    }
  }

  if (!hasAnyFiles) {
    return (
      <div className="border border-black/10 dark:border-white/15 rounded-lg p-4 text-sm">
        <p className="opacity-80">
          This knowledge base has no material uploaded yet. Upload something in the Materials tab first, then come
          back here to generate flashcards from it.
        </p>
      </div>
    );
  }

  const knownCount = Object.values(tally).filter((v) => v === "know").length;
  const learningCount = Object.values(tally).filter((v) => v === "learning").length;

  return (
    <div>
      <form onSubmit={handleGenerate} className="space-y-4 mb-6 border border-black/10 dark:border-white/15 rounded-lg p-4">
        <div>
          <label className="block text-sm font-medium mb-1">How many cards?</label>
          <input
            type="number"
            min={1}
            max={50}
            className="w-24 border border-black/15 dark:border-white/20 rounded-lg px-3 py-1.5 bg-transparent"
            value={numCards}
            onChange={(e) => setNumCards(parseInt(e.target.value, 10) || 1)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Which sections/topics to draw from?</label>
          <input
            className="w-full border border-black/15 dark:border-white/20 rounded-lg px-3 py-2 bg-transparent"
            placeholder="e.g. supply & demand, elasticity (leave blank for a mixed set)"
            value={sections}
            onChange={(e) => setSections(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Anything to focus on?</label>
          <input
            className="w-full border border-black/15 dark:border-white/20 rounded-lg px-3 py-2 bg-transparent"
            placeholder="e.g. definitions over formulas"
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
          {busy ? "Generating…" : cards ? "Generate a new set" : "Generate flashcards"}
        </button>
      </form>

      {cards && cards.length > 0 && (
        <div className="space-y-4">
          {truncated && (
            <p className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 inline-block">
              Note: this class&apos;s material is large enough that some of it was truncated for this set.
            </p>
          )}

          <div className="flex items-center justify-between text-sm opacity-60">
            <span>
              Card {index + 1} of {cards.length}
              {cards[index].topic ? ` — ${cards[index].topic}` : ""}
            </span>
            {(knownCount > 0 || learningCount > 0) && (
              <span>
                👍 {knownCount} &nbsp; 🔁 {learningCount}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="w-full min-h-[10rem] border border-black/15 dark:border-white/20 rounded-xl p-6 flex items-center justify-center text-center hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
          >
            {!flipped ? (
              <p className="text-lg font-medium">{cards[index].front}</p>
            ) : (
              <p className="text-sm whitespace-pre-wrap">{linkifyCitations(withCardCitation(cards[index]), files)}</p>
            )}
          </button>
          <p className="text-center text-xs opacity-40">{flipped ? "Click to see the question" : "Click to reveal the answer"}</p>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={index === 0}
              className="px-3 py-1.5 text-sm rounded-lg border border-black/20 dark:border-white/25 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
            >
              ← Prev
            </button>

            {flipped ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => mark(cards[index].id, "learning")}
                  className="px-3 py-1.5 text-sm rounded-lg border border-amber-400 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                >
                  🔁 Still learning
                </button>
                <button
                  type="button"
                  onClick={() => mark(cards[index].id, "know")}
                  className="px-3 py-1.5 text-sm rounded-lg border border-green-500 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30"
                >
                  👍 I know this
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={shuffle}
                className="px-3 py-1.5 text-sm rounded-lg border border-black/20 dark:border-white/25 hover:bg-black/5 dark:hover:bg-white/10"
              >
                🔀 Shuffle
              </button>
            )}

            <button
              type="button"
              onClick={() => go(1)}
              disabled={index === cards.length - 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-black/20 dark:border-white/25 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
