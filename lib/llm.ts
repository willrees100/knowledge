import { GoogleGenerativeAI } from "@google/generative-ai";

// Single-function seam so swapping LLM providers later is a one-line change
// at the call sites, not a rewrite. Everything provider-specific lives here.
const MODEL_NAME = "gemini-3.6-flash";

export interface GenerateArgs {
  systemPrompt: string;
  userPrompt: string;
}

export async function generate({ systemPrompt, userPrompt }: GenerateArgs): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env.local (see README.md).");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(userPrompt);
  return result.response.text();
}
