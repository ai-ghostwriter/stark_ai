import { describe, it, expect, vi, afterEach } from "vitest";
import { embed, EmbedderError } from "../src/llm/embeddings.js";

afterEach(() => vi.restoreAllMocks());

describe("embed", () => {
  it("ritorna i vettori dalla risposta Ollama", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ embeddings: [[1, 2, 3]] }) }) as Response));
    const v = await embed({ url: "http://x", model: "bge-m3", input: ["ciao"] });
    expect(v).toEqual([[1, 2, 3]]);
  });

  it("connessione fallita -> EmbedderError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fail"); }));
    await expect(embed({ url: "http://x", model: "bge-m3", input: ["x"] })).rejects.toBeInstanceOf(EmbedderError);
  });

  it("risposta vuota -> EmbedderError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ embeddings: [] }) }) as Response));
    await expect(embed({ url: "http://x", model: "bge-m3", input: ["x"] })).rejects.toBeInstanceOf(EmbedderError);
  });
});
