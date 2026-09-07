import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getKB, getFileChunks, insertTestGeneration } from "@/lib/db";
import { buildCorpus } from "@/lib/corpus";
import { generate } from "@/lib/llm";

const TEST_SYSTEM_PROMPT = `You generate a practice test for a student, grounded ONLY in the source material provided below. Do not use outside knowledge to invent facts not present in the material.

The material below is split into two kinds:
1. PRACTICE PROBLEMS — this is the ANCHOR for difficulty and style. The question format, phrasing conventions, difficulty level, and mix of question types in the test you generate MUST match what's actually in the practice problems. Mimic their structure (e.g. multiple choice, short answer, word problems) as closely as possible.
2. NOTES/SLIDES — use these ONLY for topic coverage context (making sure questions touch the right concepts). NEVER copy their tone or difficulty as the anchor — the practice problems set that, not the notes.

Number the questions. After all questions, include an "Answer Key" section with brief answers/solutions. Do not fabricate citations or reference material that isn't provided below.`;

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

  let test: string;
  try {
    test = (await generate({ systemPrompt, userPrompt })).trim();
  } catch (err) {
    console.error("Gemini call failed:", err);
    return NextResponse.json(
      { error: "The assistant is temporarily unavailable. Check the server's GEMINI_API_KEY and try again." },
      { status: 502 }
    );
  }

  await insertTestGeneration({
    id: randomUUID(),
    kb_id: kbId,
    config: { numQuestions, sections, focus },
    question_count: numQuestions,
  });

  return NextResponse.json({ test, truncated });
}
