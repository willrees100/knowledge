import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getKB, getFileChunks, insertFeedback } from "@/lib/db";
import { buildCorpus } from "@/lib/corpus";
import { generate } from "@/lib/llm";
import { FALLBACK_ANSWER } from "@/lib/types";

const BASE_GROUNDING_PROMPT = `You answer ONLY using the provided source material below. Do not use outside knowledge, even if you know the answer. If the source material does not contain the answer, respond exactly with: "${FALLBACK_ANSWER}" Never fabricate a citation. Every factual claim in your answer must map to a specific cited source.

Cite sources inline using EXACTLY this format: (exact-filename.ext, Label) — for example (Lecture4Slides.pptx, Slide 12) or (Week3Notes.docx, Section: Introduction). The filename and label must be copied verbatim from the "### <filename> ... — <Label>" header shown directly above the excerpt you're citing. Never invent a page/slide/section number that isn't shown in the material below, and never alter the filename.`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: kbId } = await params;
  const kb = await getKB(kbId);
  if (!kb) {
    return NextResponse.json({ error: "Knowledge base not found." }, { status: 404 });
  }

  const body = await req.json();
  const question = (body.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "Question is required." }, { status: 400 });
  }

  const allFiles = await getFileChunks(kbId);
  if (allFiles.length === 0) {
    return NextResponse.json({
      answer: FALLBACK_ANSWER,
      source: "fallback",
      truncated: false,
      feedbackId: null,
      note: "No files have been uploaded to this knowledge base yet.",
    });
  }

  const { text: corpus, truncated } = buildCorpus(allFiles);

  const systemPrompt = [
    BASE_GROUNDING_PROMPT,
    "",
    `Class: ${kb.name}`,
    kb.description ? `What this class covers: ${kb.description}` : "",
    kb.focus ? `Special focus for this assistant: ${kb.focus}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt = `SOURCE MATERIAL:\n\n${corpus}\n\n---\n\nSTUDENT QUESTION: ${question}`;

  let answer: string;
  try {
    answer = (await generate({ systemPrompt, userPrompt })).trim();
  } catch (err) {
    console.error("Gemini call failed:", err);
    return NextResponse.json(
      { error: "The assistant is temporarily unavailable. Check the server's GEMINI_API_KEY and try again." },
      { status: 502 }
    );
  }

  const isFallback = answer.trim() === FALLBACK_ANSWER;
  const feedbackId = randomUUID();
  await insertFeedback({
    id: feedbackId,
    kb_id: kbId,
    question,
    answer_source: isFallback ? "fallback" : "source",
  });

  return NextResponse.json({
    answer,
    source: isFallback ? "fallback" : "source",
    truncated,
    feedbackId,
  });
}
