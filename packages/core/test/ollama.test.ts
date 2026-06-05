import { describe, it, expect, vi, afterEach } from "vitest";
import { chatLocal, OllamaDownError } from "../src/llm/ollama.js";

afterEach(() => vi.restoreAllMocks());

describe("chatLocal", () => {
  it("invia messaggi e ritorna il message", async () => {
    const stub = { message: { role: "assistant", content: "ciao" } };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => stub }) as Response));
    const msg = await chatLocal({ url: "http://x", model: "m", messages: [{ role: "user", content: "hi" }] });
    expect(msg.content).toBe("ciao");
  });

  it("lancia OllamaDownError se la connessione fallisce", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(
      chatLocal({ url: "http://x", model: "m", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toBeInstanceOf(OllamaDownError);
  });
});
