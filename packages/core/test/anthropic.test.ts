import { describe, it, expect } from "vitest";
import { chatApi, MissingApiKeyError } from "../src/llm/anthropic.js";

describe("chatApi", () => {
  it("lancia MissingApiKeyError se manca la key", async () => {
    await expect(
      chatApi({ apiKey: undefined, model: "claude-sonnet-4-6", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toBeInstanceOf(MissingApiKeyError);
  });

  it("estrae il testo dai blocchi della risposta", async () => {
    const fakeClient = {
      messages: {
        create: async () => ({ content: [{ type: "text", text: "ok " }, { type: "text", text: "due" }] }),
      },
    };
    const out = await chatApi(
      { apiKey: "sk-x", model: "claude-sonnet-4-6", messages: [{ role: "user", content: "hi" }] },
      fakeClient as never,
    );
    expect(out).toBe("ok due");
  });

  it("invia il system come blocco con cache_control ephemeral", async () => {
    let captured: any = null;
    const fakeClient = {
      messages: {
        create: async (req: unknown) => {
          captured = req;
          return { content: [{ type: "text", text: "ok" }] };
        },
      },
    };
    await chatApi(
      { apiKey: "sk-x", model: "claude-sonnet-4-6", messages: [
        { role: "system", content: "persona" },
        { role: "user", content: "hi" },
      ] },
      fakeClient as never,
    );
    expect(Array.isArray(captured.system)).toBe(true);
    expect(captured.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(captured.system[0].text).toBe("persona");
  });
});
