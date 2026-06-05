# JARVIS Module E — Brand Memory (RAG locale) — Design Spec

> Sotto-progetto **E**. Estende il Core (A). Data: 2026-05-31 · Stato: approvato.

## 1. Obiettivo

Dare a JARVIS una **memoria semantica locale** sui contenuti di brand (libri, persone): indicizzare
un corpus di documenti e recuperare i passaggi più rilevanti per una query. Due tool:
`kb_index` (costruisce l'indice) e `kb_search` (RAG retrieval).

## 2. Decisioni (confermate)

- **Embedding locale via Ollama** endpoint `/api/embed`, modello default **`bge-m3`** (multilingue
  forte per DE/FR/IT). Gratis, privato (manoscritti non pubblicati restano locali).
- **Vector store puro-JS**: indice in JSON + cosine similarity brute-force in JS. Zero dipendenze
  npm. Alla scala (~14 libri, ≤ ~10k chunk) una query è pochi ms.
- Niente Pinecone (cloud a pagamento), niente LanceDB (binari nativi).

## 3. Architettura (unità isolate)

- **`llm/embeddings.ts`** (nuovo): client Ollama embeddings.
  - `type Embedder = (input: string[]) => Promise<number[][]>`
  - `embed({ url, model, input }) → number[][]` (POST `/api/embed`); `EmbedderError` con messaggio
    chiaro (serve `ollama serve` + `ollama pull bge-m3`). Thin glue, testato con fetch mockato.
- **`core/chunk.ts`** (nuovo, **puro**): `chunkText(text, size=1000, overlap=200) → string[]`.
- **`core/vectorStore.ts`** (nuovo, **puro**): tipi `IndexEntry`, `KbIndex`, `SearchHit`;
  `cosineSimilarity(a,b)`; `topK(query, entries, k) → SearchHit[]`.
- **`tools/builtins/kbIndex.ts`** (nuovo): factory `makeKbIndex(deps)` — legge i file `.md`/`.txt`
  di una cartella, chunka, embedda, scrive l'indice JSON. `embed`/`readCorpus`/`writeIndex` iniettabili.
- **`tools/builtins/kbSearch.ts`** (nuovo): factory `makeKbSearch(deps)` — carica l'indice, embedda
  la query, ritorna i top-k passaggi. `embed`/`loadIndex` iniettabili.
- **`config.ts`**: aggiunge `embedModel` (env `JARVIS_EMBED_MODEL`, default `bge-m3`).
- **`cli.ts`**: costruisce l'`Embedder` reale (url+model da config) e registra `kb_index` + `kb_search`.

## 4. Formato indice (JSON)
```json
{ "model": "bge-m3", "dim": 1024,
  "entries": [ { "id": "libro.md#0", "text": "...", "source": "libro.md", "vector": [/* dim float */] } ] }
```

## 5. Error handling
| Caso | Comportamento |
|---|---|
| Ollama giù / modello mancante | `EmbedderError` con istruzioni (`ollama serve`, `ollama pull bge-m3`) |
| `kb_index` path vuoto / nessun `.md`/`.txt` | messaggio dedicato, niente crash |
| `kb_search` query vuota | "Errore: specifica la query." |
| `kb_search` indice non caricabile/assente | "indice non caricabile … esegui prima kb_index" |
| indice vuoto | "Indice vuoto." |

## 6. Scope
**Dentro:** embeddings client, chunk (puro), vectorStore (puro), tool `kb_index` + `kb_search`, config, registrazione, test.
**Fuori (futuro):** indicizzazione di `bookPayload.json` strutturati, metadati per-libro/persona,
re-rank, persistenza incrementale, auto-RAG nel router (iniezione contesto automatica), chunking semantico.

## 7. Caveat runtime
Richiede `ollama serve` + `ollama pull bge-m3` e un corpus di documenti. La validazione end-to-end
avverrà quando corpus e modello saranno disponibili; i test usano embed/fs mockati (niente Ollama reale).

## 8. Testing
- `embeddings`: fetch mockato → ritorna `number[][]`; fetch fallito → `EmbedderError`.
- `chunkText` (puro): vuoto → []; corto → [text]; lungo → più chunk con overlap corretto.
- `vectorStore` (puro): cosine identici = 1, ortogonali = 0, vettore nullo = 0; `topK` ordina e taglia a k.
- `kb_index` (embed/readCorpus/writeIndex mockati): path vuoto → errore; nessun doc → messaggio; successo → writeIndex chiamato con indice popolato, reply con conteggio chunk.
- `kb_search` (embed/loadIndex mockati): query vuota → errore; loadIndex fallisce → messaggio; successo → reply coi top passaggi.
- Regressione: i 69 test esistenti restano verdi.
