import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { translate } from "../src/core/translate.js";

describe("translate", () => {
  it("usa il modello locale per tradurre in inglese", async () => {
    const chatLocal = vi.fn(async () => ({ role: "assistant" as const, content: "System online." }));

    const translated = await translate({ chatLocal, cfg: loadConfig({}) }, "Sistema online.", "en");

    expect(translated).toBe("System online.");
    expect(chatLocal).toHaveBeenCalledWith({
      url: "http://localhost:11434",
      model: "qwen3:8b",
      messages: [
        {
          role: "system",
          content:
            "You are a translation engine. Translate the user's message to English. Output ONLY the translation, no preamble, no quotes.",
        },
        { role: "user", content: "Sistema online." },
      ],
      temperature: 0,
    });
  });

  it("restituisce il testo originale se Ollama non risponde", async () => {
    const chatLocal = vi.fn(async () => {
      throw new Error("Ollama down");
    });

    const translated = await translate({ chatLocal, cfg: loadConfig({}) }, "Ciao Ricky.", "en");

    expect(translated).toBe("Ciao Ricky.");
  });
});
