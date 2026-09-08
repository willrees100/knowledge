import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getKB, getFileChunks, insertTestGeneration } from "@/lib/db";
import { buildCorpus } from "@/lib/corpus";
import { generate } from "@/lib/llm";
import { toPublicQuestion, type TestQuestion } from "@/lib/types";

const TEST_SYSTEM_PROMPT = `You generate an interactive practice test for a student, grounded ONLY in the source material provided below. Do not use outside knowledge to invent facts not present in the material.

The material below is split into two kinds:
1. PRACTICE PROBLEMS — this is the ANCHOR for difficulty and style. The question format, phrasing conventions, difficulty level, and mix of question types in the test you generate MUST match what's actually in the practice problems. Mimic their structure as closely as possible.
2. NOTES/SLIDES — use these ONLY for topic coverage context (making sure questions touch the right concepts). NEVER copy their tone or difficulty as the anchor — the practice problems set that, not the notes.

Respond with ONLY a single JSON object (no markdown fences, no prose before or after) matching exactly this shape:

{
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "prompt": "the question text",
      "topic": "a 2-4 word topic tag, e.g. 'market equilibrium'",
      "choices": ["choice text", "choice text", "choice text", "choice text"],
      "correctIndex": 0,
      "explanation": "one short sentence on why that's correct",
      "citation": "(exact-filename.ext, Label)"
    },
    {
      "id": "q2",
      "type": "short_answer",
      "prompt": "the question text",
      "topic": "a 2-4 word topic tag",
      "referenceAnswer": "a concise correct answer or worked solution a grader can check a student's free-text answer against",
      "explanation": "one short sentence expanding on the reference answer",
      "citation": "(exact-filename.ext, Label)"
    }
  ]
}

Only use "multiple_choice" for questions the practice problems' own style actually uses that format for, and "short_answer" for anything else (including word problems and calculations — the reference answer should include the worked steps/final numeric answer when it's a calculation). The "citation" field must copy the filename and label verbatim from the "### <filename> ... — <Label>" header shown directly above the excerpt each question is drawn from — omit it (or use null) only if a question is genuinely synthesized from general topic coverage rather than one specific excerpt. Never invent a page/slide/section number that isn't shown in the material below.`;

function sanitizeQuestions(raw: unknown, max: number): TestQuestion[] {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { questions?: unknown }).questions)) {
    return [];
  }
  const arr = (raw as { questions: unknown[] }).questions;
  const out: TestQuestion[] = [];

  arr.forEach((item, i) => {
    if (out.length >= max) return;
    if (!item || typeof item !== "object") return;
    const q = item as Record<string, unknown>;
    const id = typeof q.id === "string" && q.id.trim() ? q.id.trim() : `q${i + 1}`;
    const prompt = typeof q.prompt === "string" ? q.prompt.trim() : "";
    if (!prompt) return;
    const topic = typeof q.topic === "string" && q.topic.trim() ? q.topic.trim() : undefined;
    const explanation = typeof q.explanation === "string" ? q.explanation.trim() : "";
    const citation = typeof q.citation === "string" && q.citation.trim() ? q.citation.trim() : undefined;

    if (q.type === "multiple_choice") {
      const choices = Array.isArray(q.choices) ? q.choices.filter((c): c is string => typeof c === "string") : [];
      if (choices.length < 2) return;
      let correctIndex = typeof q.correctIndex === "number" ? Math.round(q.correctIndex) : 0;
      if (correctIndex < 0 || correctIndex >= choices.length) correctIndex = 0;
      out.push({ id, type: "multiple_choice", prompt, topic, choices, correctIndex, explanation, citation });
    } else if (q.type === "short_answer") {
      const referenceAnswer = typeof q.referenceAnswer === "string" ? q.referenceAnswer.trim() : "";
      if (!referenceAnswer) return;
      out.push({ id, type: "short_answer", prompt, topic, referenceAnswer, explanation, citation });
    }
  });

  return out;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: kbId } = await params;
  const kb = await getKB(kbId);
  if (!kb) {
    return NextResponse.json({ error: "Knowledge base not found." }, { status: 404 });
  }

  const body = await req.json();
  const numQuestions = Math.max(1, Math.min(50, parseInt(body.numQuestions, 10) || 10));
  const sections = (body.sections ?? "").trim();
  const focus = (body.focus ?? "").trim();

  const practiceFiles = await getFileChunks(kbId, "practice");
  if (practiceFiles.length === 0) {
    return NextResponse.json(
      {
        error:
          "This knowledge base has no Practice Problems uploaded. The test generator requires real practice problems as its difficulty/style anchor and refuses to guess — upload some practice problems first.",
      },
      { status: 400 }
    );
  }

  const [notesFiles, slidesFiles] = await Promise.all([getFileChunks(kbId, "notes"), getFileChunks(kbId, "slides")]);
  const contextFiles = [...notesFiles, ...slidesFiles];
  const { text: corpus, truncated } = buildCorpus(practiceFiles, contextFiles);

  const systemPrompt = [
    TEST_SYSTEM_PROMPT,
    "",
    `Class: ${kb.name}`,
    kb.description ? `What this class covers: ${kb.description}` : "",
    kb.focus ? `Special focus for this assistant: ${kb.focus}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt = [
    `SOURCE MATERIAL:\n\n${corpus}`,
    "---",
    `Generate exactly ${numQuestions} questions.`,
    sections ? `Focus on these sections/topics: ${sections}.` : "Cover a representative mix of topics from the material.",
    focus ? `Additional emphasis requested by the student: ${focus}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  let raw: string;
  try {
    raw = (await generate({ systemPrompt, userPrompt, jsonMode: true })).trim();
  } catch (err) {
    console.error("Gemini call failed:", err);
    return NextResponse.json(
      { error: "The assistant is temporarily unavailable. Check the server's GEMINI_API_KEY and try again." },
      { status: 502 }
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("Failed to parse generated test JSON:", err, raw.slice(0, 500));
    return NextResponse.json(
      { error: "The assistant returned something we couldn't read as a test. Please try generating again." },
      { status: 502 }
    );
  }

  const questions = sanitizeQuestions(parsed, numQuestions);
  if (questions.length === 0) {
    return NextResponse.json(
      { error: "The assistant didn't return any usable questions. Please try generating again." },
      { status: 502 }
    );
  }

  const testId = randomUUID();
  await insertTestGeneration({
    id: testId,
    kb_id: kbId,
    config: { numQuestions, sections, focus },
    question_count: questions.length,
    test_json: { questions },
  });

  return NextResponse.json({
    testId,
    questions: questions.map(toPublicQuestion),
    truncated,
  });
}
