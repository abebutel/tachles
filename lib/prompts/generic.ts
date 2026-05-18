import type { MessagesRequest } from "@/lib/proxy/anthropic-client";
import { TRANSLATION_MODEL } from "@/lib/proxy/anthropic-client";
import { OUTPUT_SHAPE_SPEC } from "./shared";

// Generic fallback when the classifier returns "unknown" or the letter
// doesn't fit one of the four specialists. The handoff (§8) lists this as
// buildPrompt_TranslateDocument.

const SYSTEM_PROMPT = `You translate Hebrew letters from Israeli institutions into plain, friendly language. You don't know exactly which institution sent this one (the classifier wasn't confident), so use general best practices:

- Identify the sender as best you can and put it in "institution". If unclear, use a descriptive label like "Israeli government office" or "Insurance company".
- Identify what kind of letter it is: bill, notice, decision, request for information, demand, etc.
- Pull out any reference numbers, amounts, and dates exactly as written.
- Flag any deadlines clearly.
- Tone: like a friend explaining over coffee. Lead with what the user needs to DO.

${OUTPUT_SHAPE_SPEC}`;

export function buildPrompt_TranslateDocument(ocrText: string): MessagesRequest {
  return {
    model: TRANSLATION_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: `Translate this letter:\n\n${ocrText}`,
      },
    ],
  };
}
