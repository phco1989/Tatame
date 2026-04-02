import type { Locale } from "@/lib/i18n";
import { getAiCoachSystemPrompt, LANGUAGE_NAMES } from "./aiCoachLanguage";

export interface AiCoachMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Builds the full message array to send to the AI API.
 * Prepends the language-aware system prompt, then injects history, then the new user input.
 *
 * @param input        The user's latest message text
 * @param lang         The app's current locale
 * @param history      Prior messages (role: user | assistant) for context
 */
export function buildAiCoachPrompt(
  input: string,
  lang: Locale,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): AiCoachMessage[] {
  const systemPrompt = getAiCoachSystemPrompt(lang);
  const langName = LANGUAGE_NAMES[lang];

  // Reinforce the language at the top of every request so the model never drifts
  const reinforcedSystem = `${systemPrompt}\n\nIMPORTANT REMINDER: Respond ONLY in ${langName}. Do not switch languages under any circumstance unless the user explicitly requests it.`;

  return [
    { role: "system", content: reinforcedSystem },
    ...history,
    { role: "user", content: input.trim() },
  ];
}
