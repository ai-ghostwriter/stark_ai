import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolDef } from "../../llm/types.js";
import { chunkText } from "../../core/chunk.js";
import type { KbIndex, IndexEntry } from "../../core/vectorStore.js";
import type { Embedder } from "../../llm/embeddings.js";

export interface KbIndexDeps {
  embed: Embedder;
  model: string;
  readCorpus?: (dir: string) => { source: string; text: string }[];
  writeIndex?: (path: string, index: KbIndex) => void;
}

function defaultReadCorpus(dir: string): { source: string; text: string }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") || f.endsWith(".txt"))
    .map((f) => ({ source: f, text: readFileSync(join(dir, f), "utf8") }));
}

export function makeKbIndex(deps: KbIndexDeps): ToolDef {
  const readCorpus = deps.readCorpus ?? defaultReadCorpus;
  const writeIndex = deps.writeIndex ?? ((p: string, idx: KbIndex) => writeFileSync(p, JSON.stringify(idx)));
  return {
    name: "kb_index",
    description: "Indicizza una cartella di documenti (.md/.txt) nella brand memory (embeddings locali).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "cartella del corpus" },
        output: { type: "string", description: "file indice (default kb_index.json)" },
      },
      required: ["path"],
    },
    handler: async (args) => {
      const dir = typeof args.path === "string" ? args.path.trim() : "";
      if (!dir) return "Errore: specifica la cartella del corpus.";
      const output = typeof args.output === "string" && args.output ? args.output : "kb_index.json";

      let docs: { source: string; text: string }[];
      try {
        docs = readCorpus(dir);
      } catch (e) {
        return `Errore lettura corpus: ${(e as Error).message}`;
      }
      if (docs.length === 0) return `Nessun documento .md/.txt in ${dir}.`;

      const entries: IndexEntry[] = [];
      let dim = 0;
      for (const doc of docs) {
        const chunks = chunkText(doc.text);
        if (chunks.length === 0) continue;
        const vectors = await deps.embed(chunks);
        chunks.forEach((text, i) => {
          const vector = vectors[i] ?? [];
          dim = vector.length;
          entries.push({ id: `${doc.source}#${i}`, text, source: doc.source, vector });
        });
      }
      const index: KbIndex = { model: deps.model, dim, entries };
      try {
        writeIndex(output, index);
      } catch (e) {
        return `Errore scrittura indice: ${(e as Error).message}`;
      }
      return `Indice creato: ${entries.length} chunk da ${docs.length} documenti -> ${output} (modello ${deps.model}, dim ${dim}).`;
    },
  };
}
