import { describe, it, expect, vi } from "vitest";
import { makeKbIndex } from "../src/tools/builtins/kbIndex.js";
import type { KbIndex } from "../src/core/vectorStore.js";

const embed = vi.fn(async (input: string[]) => input.map(() => [0.1, 0.2, 0.3]));

describe("kb_index", () => {
  it("path vuoto -> errore", async () => {
    const def = makeKbIndex({ embed, model: "bge-m3", readCorpus: () => [], writeIndex: vi.fn() });
    expect(String(await def.handler({ path: "" }))).toMatch(/errore/i);
  });

  it("nessun documento -> messaggio dedicato", async () => {
    const def = makeKbIndex({ embed, model: "bge-m3", readCorpus: () => [], writeIndex: vi.fn() });
    expect(String(await def.handler({ path: "/corpus" }))).toMatch(/nessun documento/i);
  });

  it("successo -> writeIndex con indice popolato, reply con conteggio", async () => {
    let written: KbIndex | null = null;
    const def = makeKbIndex({
      embed,
      model: "bge-m3",
      readCorpus: () => [{ source: "libro.txt", text: "contenuto breve" }],
      writeIndex: (_p, idx) => { written = idx; },
    });
    const r = String(await def.handler({ path: "/corpus", output: "idx.json" }));
    expect(written).not.toBeNull();
    expect(written!.entries.length).toBeGreaterThanOrEqual(1);
    expect(written!.model).toBe("bge-m3");
    expect(r).toMatch(/idx\.json/);
  });
});
