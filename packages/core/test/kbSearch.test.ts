import { describe, it, expect, vi } from "vitest";
import { makeKbSearch } from "../src/tools/builtins/kbSearch.js";
import type { KbIndex } from "../src/core/vectorStore.js";

const index: KbIndex = {
  model: "bge-m3",
  dim: 2,
  entries: [
    { id: "a#0", text: "passaggio su ansia", source: "a.txt", vector: [1, 0] },
    { id: "b#0", text: "passaggio su cucina", source: "b.txt", vector: [0, 1] },
  ],
};
const embed = vi.fn(async () => [[1, 0]]);

describe("kb_search", () => {
  it("query vuota -> errore", async () => {
    const def = makeKbSearch({ embed, loadIndex: () => index });
    expect(String(await def.handler({ query: "" }))).toMatch(/errore/i);
  });

  it("indice non caricabile -> messaggio", async () => {
    const def = makeKbSearch({ embed, loadIndex: () => { throw new Error("ENOENT"); } });
    expect(String(await def.handler({ query: "ansia" }))).toMatch(/indice non caricabile/i);
  });

  it("successo -> reply col passaggio più rilevante in cima", async () => {
    const def = makeKbSearch({ embed, loadIndex: () => index });
    const r = String(await def.handler({ query: "ansia", k: 2 }));
    expect(r).toMatch(/a\.txt/);
    expect(r.indexOf("a.txt")).toBeLessThan(r.indexOf("b.txt"));
  });
});
