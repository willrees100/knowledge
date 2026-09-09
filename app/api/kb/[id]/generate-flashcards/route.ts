import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getKB, getFileChunks, insertFlashcardGeneration } from "@/lib/db";
import { buildCorpus } from "@/lib/corpus";
import { generate } from "@/lib/llm";
import type { Flashcard } from "@/lib/types";

// Unlike the practice-test generator, flashcards draw from ALL uploaded
// material (notes, slides, and practice problems alike) rather than
// requiring — and anchoring to — practice problems specifically. A flashcard
// is a recall aid for concepts/definitions/facts, not a worked-problem
// simulation, so there's no "style/difficulty" to anchor to a particular
// folder the way the test generator's core constraint requires.
const FLASHCARDS_SYSTEM_PROMPT = `You generate flashcards for a student, grounded ONLY in the source material provided below. Do not use outside knowledge to invent facts not present in the material — if the material doesn't contain enough distinct, flashcard-worthy content to reach the requested count, generate fewer rather than inventing filler.

Respond with ONLY a single JSON object (no markdown fences, no prose before or after) matching exactly this shape:

{
  "cards": [
    {
      "id": "c1",
      "front": "a short question, term, or prompt",
      "back": "the concise answer or definition",
      "topic": "a 2-4 word topic tag, e.g. 'market equilibrium'",
      "citation": "(exact-filename.ext, Label)"
    }
  ]
}

Each card should test ONE discrete fact, definition, or concept — not a multi-part question. The "citation" field must copy the filename and label verbatim from the "### <filename> ... — <Label>" header shown directly above the excerpt each card is drawn from — omit it (or use null) only if a card is genuinely synthesized from general topic coverage rather than one specific excerpt. Never invent a page/slide/section number that isn't shown in the material below.`;

function sanitizeCards(raw: unknown, max: number): Flashcard[] {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { cards?: unknown }).cards)) {
    return [];
  }
  const arr = (raw as { cards: unknown[] }).cards;
  const out: Flashcard[] = [];

  arr.forEach((item, i) => {
    if (out.length >= max) return;
    if (!item || typeof item !== "object") return;
    const c = item as Record<string, unknown>;
    const id = typeof c.id === "string" && c.id.trim() ? c.id.trim() : `c${i + 1}`;
    const front = typeof c.front === "string" ? c.front.trim() : "";
    const back = typeof c.back === "string" ? c.back.trim() : "";
    if (!front || !back) return;
    const topic = typeof c.topic === "string" && c.topic.trim() ? c.topic.trim() : undefined;
    const citation = typeof c.citation === "string" && c.citation.trim() ? c.citation.trim() : undefined;
    out.push({ id, front, back, topic, citation });
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
  const numCards = Math.max(1, Math.min(50, parseInt(body.numCards, 10) || 15));
  const sections = (body.sections ?? "").trim();
  const focus = (body.focus ?? "").trim();

  const [notesFiles, slidesFiles, practiceFiles] = await Promise.all([
    getFileChunks(kbId, "notes"),
    getFileChunks(kbId, "slides"),
    getFileChunks(kbId, "practice"),
  ]);
  const allFiles = [...notesFiles, ...slidesFiles, ...practiceFiles];
  if (allFiles.length === 0) {
    return NextResponse.json(
      { error: "This knowledge base has no material uploaded yet. Upload something in the Materials tab first." },
      { status: 400 }
    );
  }

  const { text: corpus, truncated } = buildCorpus(allFiles);

  const systemPrompt = [
    FLASHCARDS_SYSTEM_PROMPT,
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
    `Generate up to ${numCards} flashcards.`,
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
    console.error("Failed to parse generated flashcards JSON:", err, raw.slice(0, 500));
    return NextResponse.json(
      { error: "The assistant returned something we couldn't read as flashcards. Please try generating again." },
      { status: 502 }
    );
  }

  const cards = sanitizeCards(parsed, numCards);
  if (cards.length === 0) {
    return NextResponse.json(
      { error: "The assistant didn't return any usable flashcards. Please try generating again." },
      { status: 502 }
    );
  }

  await insertFlashcardGeneration({
    id: randomUUID(),
    kb_id: kbId,
    config: { numCards, sections, focus },
    card_count: cards.length,
  });

  return NextResponse.json({ cards, truncated });
}
