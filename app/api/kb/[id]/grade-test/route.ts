import { NextRequest, NextResponse } from "next/server";
import { getKB, getTestGeneration } from "@/lib/db";
import { generate } from "@/lib/llm";
import { pickPraise } from "@/lib/praise";
import type { TestQuestion } from "@/lib/types";

const GRADING_SYSTEM_PROMPT = `You are grading a student's answers on a practice test for this class, comparing each answer to the reference answer already established for that question. Mark an answer correct if it demonstrates the same understanding as the reference answer, even if worded differently or less formally — it does not need to match word-for-word, and a calculation with the right final answer and sound reasoning counts even if shown differently. Mark it incorrect if it's wrong, missing the key point, or clearly guessing.

For each question, write one short sentence (max ~20 words) of feedback specific to the student's own answer — what they got right, or what they got wrong or missed — not just a restatement of the reference answer.

Respond with ONLY a single JSON object (no markdown fences, no prose before or after) matching exactly this shape:
{"results": [{"id": "q2", "correct": true, "feedback": "one short sentence"}]}`;

interface GradedResult {
  id: string;
  correct: boolean;
  feedback: string;
  citation?: string;
  praise?: string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: kbId } = await params;
  const kb = await getKB(kbId);
  if (!kb) {
    return NextResponse.json({ error: "Knowledge base not found." }, { status: 404 });
  }

  const body = await req.json();
  const testId = typeof body.testId === "string" ? body.testId : "";
  const answers = (body.answers ?? {}) as Record<string, unknown>;

  const testRow = testId ? await getTestGeneration(testId) : undefined;
  if (!testRow || testRow.kb_id !== kbId || !testRow.test_json) {
    return NextResponse.json({ error: "That test wasn't found — try generating a new one." }, { status: 404 });
  }

  let questions: TestQuestion[];
  try {
    questions = (JSON.parse(testRow.test_json) as { questions: TestQuestion[] }).questions;
  } catch {
    return NextResponse.json({ error: "That test's data is corrupted — try generating a new one." }, { status: 500 });
  }

  const results: GradedResult[] = [];
  const toGradeByLLM: Array<{ q: Extract<TestQuestion, { type: "short_answer" }>; studentAnswer: string }> = [];

  for (const q of questions) {
    if (q.type === "multiple_choice") {
      const given = answers[q.id];
      const correct = typeof given === "number" && given === q.correctIndex;
      results.push({
        id: q.id,
        correct,
        feedback: q.explanation,
        citation: q.citation,
        praise: correct ? pickPraise(q.topic) : undefined,
      });
    } else {
      const studentAnswer = typeof answers[q.id] === "string" ? (answers[q.id] as string).trim() : "";
      if (!studentAnswer) {
        results.push({
          id: q.id,
          correct: false,
          feedback: `You left this blank. Reference answer: ${q.referenceAnswer}`,
          citation: q.citation,
        });
      } else {
        toGradeByLLM.push({ q, studentAnswer });
      }
    }
  }

  if (toGradeByLLM.length > 0) {
    const userPrompt = toGradeByLLM
      .map(
        ({ q, studentAnswer }) =>
          `Question ${q.id}: ${q.prompt}\nReference answer: ${q.referenceAnswer}\nStudent's answer: ${studentAnswer}`
      )
      .join("\n\n");

    try {
      const raw = (
        await generate({ systemPrompt: GRADING_SYSTEM_PROMPT, userPrompt, jsonMode: true })
      ).trim();
      const parsed = JSON.parse(raw) as { results?: Array<{ id?: unknown; correct?: unknown; feedback?: unknown }> };
      const byId = new Map((parsed.results ?? []).map((r) => [r.id, r]));

      for (const { q } of toGradeByLLM) {
        const r = byId.get(q.id);
        const correct = Boolean(r && r.correct === true);
        const feedback = r && typeof r.feedback === "string" && r.feedback.trim() ? r.feedback.trim() : q.explanation;
        results.push({
          id: q.id,
          correct,
          feedback,
          citation: q.citation,
          praise: correct ? pickPraise(q.topic) : undefined,
        });
      }
    } catch (err) {
      console.error("Grading call failed:", err);
      // Degrade gracefully rather than fail the whole submission: fall back
      // to "ungraded" for the open-ended questions the LLM couldn't judge,
      // showing the reference answer so the student isn't left with nothing.
      for (const { q } of toGradeByLLM) {
        results.push({
          id: q.id,
          correct: false,
          feedback: `Couldn't auto-grade this one — reference answer: ${q.referenceAnswer}`,
          citation: q.citation,
        });
      }
    }
  }

  // Preserve the original question order rather than the grouping above.
  const order = new Map(questions.map((q, i) => [q.id, i]));
  results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const score = results.filter((r) => r.correct).length;
  return NextResponse.json({ results, score, total: results.length });
}
