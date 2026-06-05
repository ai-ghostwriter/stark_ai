import type { Config } from "../config.js";
import type { Message } from "../llm/types.js";

type ChatLocal = (args: {
  url: string;
  model: string;
  messages: Message[];
  temperature?: number;
}) => Promise<Message>;

type TranslateDeps = {
  chatLocal: ChatLocal;
  cfg: Pick<Config, "ollamaUrl" | "modelLocal">;
};

const TRANSLATE_SYSTEM_PROMPT =
  "You are a translation engine. Translate the user's message to English. Output ONLY the translation, no preamble, no quotes.";

export async function translate(deps: TranslateDeps, text: string, to: "en" = "en"): Promise<string> {
  try {
    const response = await deps.chatLocal({
      url: deps.cfg.ollamaUrl,
      model: deps.cfg.modelLocal,
      messages: [
        { role: "system", content: TRANSLATE_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      temperature: 0,
    });
    const translated = response.content.trim();
    return translated.length > 0 ? translated : text;
  } catch {
    return text;
  }
}
