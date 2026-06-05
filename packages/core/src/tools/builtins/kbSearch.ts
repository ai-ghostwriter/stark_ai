import { readFileSync } from "node:fs";
import type { ToolDef } from "../../llm/types.js";
import { topK, type KbIndex } from "../../core/vectorStore.js";
import type { Embedder } from "../../llm/embeddings.js";

export interface KbSearchDeps {
  embed: Embedder;
  loadIndex?: (path: string) => KbIndex;
}

export function makeKbSearch(deps: KbSearchDeps): ToolDef {
  const loadIndex = deps.loadIndex ?? ((p: string) => JSON.parse(readFileSync(p, "utf8")) as KbIndex);
  return {
    name: "kb_search",
    description: "Cerca nella brand memory (RAG) i passaggi più rilevanti per una query.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        index: { type: "string", description: "file indice (default kb_index.json)" },
        k: { type: "number", description: "numero risultati (default 5)" },
      },
      required: ["query"],
    },
    handler: async (args) => {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (!query) return "Errore: specifica la query.";
      const indexPath = typeof args.index === "string" && args.index ? args.index : "kb_index.json";
      const k = typeof args.k === "number" && args.k > 0 ? Math.floor(args.k) : 5;

      let index: KbIndex;
      try {
        index = loadIndex(indexPath);
      } catch (e) {
        return `Errore: indice non caricabile (${indexPath}). Esegui prima kb_index. ${(e as Error).message}`;
      }
      if (!index.entries || index.entries.length === 0) return "Indice vuoto.";

      const vectors = await deps.embed([query]);
      const qv = vectors[0];
      if (!qv) return "Errore: embedding della query fallito.";
      const hits = topK(qv, index.entries, k);
      return hits
        .map((h, i) => `${i + 1}. [${h.source}] (score ${h.score.toFixed(3)})\n${h.text.slice(0, 200)}`)
        .join("\n\n");
    },
  };
}
