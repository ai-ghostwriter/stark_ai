# JARVIS Module E — Brand Memory (RAG locale) — Implementation Plan

**Goal:** Tool `kb_index` e `kb_search` per memoria semantica locale (embedding Ollama bge-m3 + vector store puro-JS).

**Architecture:** Client embeddings (Ollama) + chunk (puro) + vectorStore cosine/topK (puro) + due tool factory con embed/fs iniettabili.

**Tech Stack:** Node/TS, vitest, `node:fs`/`node:path`, `fetch`. Branch: `feat/module-e`. Codebase: `/Users/abstract/Documents/Claude/Projects/JARVIS/jarvis/`. Import `.js`. Nessuna nuova dipendenza npm.

**Precondizione:** A+B+D+C in `main` (69 test verdi).

---

## Task E1: Config embedModel

**Files:** Modify `jarvis/src/config.ts`; Modify `jarvis/test/config.test.ts`.

- [ ] **Step 1: Aggiungi test** in `test/config.test.ts` (nel describe esistente):
```typescript
  it("espone il modello di embedding (default bge-m3)", () => {
    expect(loadConfig({}).embedModel).toBe("bge-m3");
    expect(loadConfig({ JARVIS_EMBED_MODEL: "nomic" }).embedModel).toBe("nomic");
  });
```

- [ ] **Step 2: Run → FAIL**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npx vitest run test/config.test.ts`

- [ ] **Step 3: Modifica `config.ts`** — aggiungi a `interface Config`:
```typescript
  embedModel: string;
```
e nel return di `loadConfig`:
```typescript
    embedModel: env.JARVIS_EMBED_MODEL ?? "bge-m3",
```

- [ ] **Step 4: Run → PASS**
Run: `npx vitest run test/config.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/config.ts jarvis/test/config.test.ts
git commit -m "feat(E): config embedModel (default bge-m3)"
```

---

## Task E2: Client embeddings (Ollama)

**Files:** Create `jarvis/src/llm/embeddings.ts`; Test `jarvis/test/embeddings.test.ts`.

- [ ] **Step 1: Test che fallisce** `test/embeddings.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { embed, EmbedderError } from "../src/llm/embeddings.js";

afterEach(() => vi.restoreAllMocks());

describe("embed", () => {
  it("ritorna i vettori dalla risposta Ollama", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ embeddings: [[1, 2, 3]] }) }) as Response));
    const v = await embed({ url: "http://x", model: "bge-m3", input: ["ciao"] });
    expect(v).toEqual([[1, 2, 3]]);
  });

  it("connessione fallita → EmbedderError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fail"); }));
    await expect(embed({ url: "http://x", model: "bge-m3", input: ["x"] })).rejects.toBeInstanceOf(EmbedderError);
  });

  it("risposta vuota → EmbedderError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ embeddings: [] }) }) as Response));
    await expect(embed({ url: "http://x", model: "bge-m3", input: ["x"] })).rejects.toBeInstanceOf(EmbedderError);
  });
});
```

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run test/embeddings.test.ts`

- [ ] **Step 3: Implementa `embeddings.ts`**:
```typescript
export class EmbedderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbedderError";
  }
}

export type Embedder = (input: string[]) => Promise<number[][]>;

interface EmbedArgs {
  url: string;
  model: string;
  input: string[];
}

export async function embed(args: EmbedArgs): Promise<number[][]> {
  let res: Response;
  try {
    res = await fetch(`${args.url}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: args.model, input: args.input }),
    });
  } catch {
    throw new EmbedderError(
      `Ollama non raggiungibile per embeddings. Avvia 'ollama serve' e 'ollama pull ${args.model}'.`,
    );
  }
  if (!res.ok) throw new EmbedderError(`Embeddings HTTP ${res.status} (modello ${args.model} installato?)`);
  const data = (await res.json()) as { embeddings?: number[][] };
  if (!data.embeddings || data.embeddings.length === 0) throw new EmbedderError("Risposta embeddings vuota.");
  return data.embeddings;
}
```

- [ ] **Step 4: Run → PASS** (3 test)
Run: `npx vitest run test/embeddings.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/llm/embeddings.ts jarvis/test/embeddings.test.ts
git commit -m "feat(E): client embeddings Ollama (/api/embed) + EmbedderError"
```

---

## Task E3: chunkText (puro)

**Files:** Create `jarvis/src/core/chunk.ts`; Test `jarvis/test/chunk.test.ts`.

- [ ] **Step 1: Test che fallisce** `test/chunk.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { chunkText } from "../src/core/chunk.js";

describe("chunkText", () => {
  it("testo vuoto → []", () => {
    expect(chunkText("   ")).toEqual([]);
  });

  it("testo più corto di size → un solo chunk", () => {
    expect(chunkText("ciao mondo", 100, 20)).toEqual(["ciao mondo"]);
  });

  it("testo lungo → più chunk con overlap", () => {
    const text = "a".repeat(2500);
    const chunks = chunkText(text, 1000, 200);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]!.length).toBe(1000);
    // il secondo chunk inizia a size-overlap = 800
    expect(chunks[1]).toBe(text.slice(800, 1800));
  });
});
```

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run test/chunk.test.ts`

- [ ] **Step 3: Implementa `chunk.ts`**:
```typescript
export function chunkText(text: string, size = 1000, overlap = 200): string[] {
  const clean = text.trim();
  if (clean.length === 0) return [];
  if (clean.length <= size) return [clean];
  const step = Math.max(1, size - overlap);
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += step) {
    chunks.push(clean.slice(i, i + size));
    if (i + size >= clean.length) break;
  }
  return chunks;
}
```

- [ ] **Step 4: Run → PASS** (3 test)
Run: `npx vitest run test/chunk.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/core/chunk.ts jarvis/test/chunk.test.ts
git commit -m "feat(E): chunkText puro con overlap"
```

---

## Task E4: vectorStore (puro)

**Files:** Create `jarvis/src/core/vectorStore.ts`; Test `jarvis/test/vectorStore.test.ts`.

- [ ] **Step 1: Test che fallisce** `test/vectorStore.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { cosineSimilarity, topK, type IndexEntry } from "../src/core/vectorStore.js";

describe("cosineSimilarity", () => {
  it("vettori identici → 1", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });
  it("ortogonali → 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
  it("vettore nullo → 0", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("topK", () => {
  const entries: IndexEntry[] = [
    { id: "a", text: "A", source: "s", vector: [1, 0] },
    { id: "b", text: "B", source: "s", vector: [0, 1] },
    { id: "c", text: "C", source: "s", vector: [0.9, 0.1] },
  ];
  it("ordina per score e taglia a k", () => {
    const hits = topK([1, 0], entries, 2);
    expect(hits.length).toBe(2);
    expect(hits[0]!.id).toBe("a");
    expect(hits[1]!.id).toBe("c");
    expect(hits[0]!.score).toBeGreaterThanOrEqual(hits[1]!.score);
  });
});
```

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run test/vectorStore.test.ts`

- [ ] **Step 3: Implementa `vectorStore.ts`**:
```typescript
export interface IndexEntry {
  id: string;
  text: string;
  source: string;
  vector: number[];
}

export interface KbIndex {
  model: string;
  dim: number;
  entries: IndexEntry[];
}

export interface SearchHit {
  id: string;
  text: string;
  source: string;
  score: number;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function topK(query: number[], entries: IndexEntry[], k: number): SearchHit[] {
  return entries
    .map((e) => ({ id: e.id, text: e.text, source: e.source, score: cosineSimilarity(query, e.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, k));
}
```

- [ ] **Step 4: Run → PASS** (4 test)
Run: `npx vitest run test/vectorStore.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/core/vectorStore.ts jarvis/test/vectorStore.test.ts
git commit -m "feat(E): vectorStore puro (cosine + topK)"
```

---

## Task E5: Tool kb_index

**Files:** Create `jarvis/src/tools/builtins/kbIndex.ts`; Test `jarvis/test/kbIndex.test.ts`.

- [ ] **Step 1: Test che fallisce** `test/kbIndex.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { makeKbIndex } from "../src/tools/builtins/kbIndex.js";
import type { KbIndex } from "../src/core/vectorStore.js";

const embed = vi.fn(async (input: string[]) => input.map(() => [0.1, 0.2, 0.3]));

describe("kb_index", () => {
  it("path vuoto → errore", async () => {
    const def = makeKbIndex({ embed, model: "bge-m3", readCorpus: () => [], writeIndex: vi.fn() });
    expect(String(await def.handler({ path: "" }))).toMatch(/errore/i);
  });

  it("nessun documento → messaggio dedicato", async () => {
    const def = makeKbIndex({ embed, model: "bge-m3", readCorpus: () => [], writeIndex: vi.fn() });
    expect(String(await def.handler({ path: "/corpus" }))).toMatch(/nessun documento/i);
  });

  it("successo → writeIndex con indice popolato, reply con conteggio", async () => {
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
```

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run test/kbIndex.test.ts`

- [ ] **Step 3: Implementa `kbIndex.ts`**:
```typescript
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
      return `Indice creato: ${entries.length} chunk da ${docs.length} documenti → ${output} (modello ${deps.model}, dim ${dim}).`;
    },
  };
}
```

- [ ] **Step 4: Run → PASS** (3 test)
Run: `npx vitest run test/kbIndex.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/tools/builtins/kbIndex.ts jarvis/test/kbIndex.test.ts
git commit -m "feat(E): tool kb_index (chunk+embed+scrittura indice JSON)"
```

---

## Task E6: Tool kb_search

**Files:** Create `jarvis/src/tools/builtins/kbSearch.ts`; Test `jarvis/test/kbSearch.test.ts`.

- [ ] **Step 1: Test che fallisce** `test/kbSearch.test.ts`:
```typescript
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
  it("query vuota → errore", async () => {
    const def = makeKbSearch({ embed, loadIndex: () => index });
    expect(String(await def.handler({ query: "" }))).toMatch(/errore/i);
  });

  it("indice non caricabile → messaggio", async () => {
    const def = makeKbSearch({ embed, loadIndex: () => { throw new Error("ENOENT"); } });
    expect(String(await def.handler({ query: "ansia" }))).toMatch(/indice non caricabile/i);
  });

  it("successo → reply col passaggio più rilevante in cima", async () => {
    const def = makeKbSearch({ embed, loadIndex: () => index });
    const r = String(await def.handler({ query: "ansia", k: 2 }));
    expect(r).toMatch(/a\.txt/);
    expect(r.indexOf("a.txt")).toBeLessThan(r.indexOf("b.txt"));
  });
});
```

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run test/kbSearch.test.ts`

- [ ] **Step 3: Implementa `kbSearch.ts`**:
```typescript
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
```

- [ ] **Step 4: Run → PASS** (3 test)
Run: `npx vitest run test/kbSearch.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/tools/builtins/kbSearch.ts jarvis/test/kbSearch.test.ts
git commit -m "feat(E): tool kb_search (RAG retrieval top-k)"
```

---

## Task E7: Registrazione CLI + verifica finale

**Files:** Modify `jarvis/src/cli.ts`.

- [ ] **Step 1: Modifica `cli.ts`** — import in cima:
```typescript
import { embed as embedRaw, type Embedder } from "./llm/embeddings.js";
import { makeKbIndex } from "./tools/builtins/kbIndex.js";
import { makeKbSearch } from "./tools/builtins/kbSearch.js";
```
Poi, dove si costruiscono i tool (dopo `const newBook = makeNewBook();`), aggiungi:
```typescript
  const embedder: Embedder = (input) => embedRaw({ url: cfg.ollamaUrl, model: cfg.embedModel, input });
  const kbIndex = makeKbIndex({ embed: embedder, model: cfg.embedModel });
  const kbSearch = makeKbSearch({ embed: embedder });
```
e aggiorna la registrazione builtin includendo i due nuovi tool:
```typescript
  for (const t of [getTime, getWeather, readFileTool, ingestCerebro, bookStatus, runPhase, newBook, kbIndex, kbSearch])
    registry.register(t);
```

- [ ] **Step 2: Typecheck**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npm run typecheck` → pulito.

- [ ] **Step 3: Suite intera**
Run: `npm test`
Expected: tutti verdi (69 precedenti + 1 config + 3 embeddings + 3 chunk + 4 vectorStore + 3 kbIndex + 3 kbSearch = 86).

- [ ] **Step 4: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/cli.ts
git commit -m "feat(E): registra kb_index + kb_search; brand memory completa"
```

---

## Self-Review (eseguita)
- **Spec coverage:** §3 embeddings → E2; chunk → E3; vectorStore → E4; kb_index → E5; kb_search → E6; config → E1; cli → E7; §5 error handling → E2/E5/E6; §8 testing → ogni task. ✓
- **Placeholder scan:** nessuno; codice reale ovunque. ✓
- **Type consistency:** `Embedder`, `EmbedderError`, `IndexEntry`, `KbIndex`, `SearchHit`, `cosineSimilarity`, `topK`, `chunkText`, `makeKbIndex`/`KbIndexDeps`, `makeKbSearch`/`KbSearchDeps`, `Config.embedModel` coerenti tra i task. Le factory ritornano `ToolDef` registrabile. ✓
