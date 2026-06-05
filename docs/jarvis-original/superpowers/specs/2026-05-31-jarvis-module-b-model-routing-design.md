# JARVIS Module B — Model Routing & Prompt Caching — Design Spec

> Sotto-progetto **B**. Estende il Core (A). Data: 2026-05-31 · Stato: approvato.

## 1. Obiettivo

Quando una richiesta è instradata all'**API**, scegliere il **tier giusto** (Haiku/Sonnet/Opus)
invece di mandare tutto su un unico modello, e attivare il **prompt caching** sul system prompt.
Effetto: meno spesa API a parità di qualità.

## 2. Principio (coerente con A)

Il tier dipende dal **tipo di lavoro cognitivo**. Non si inferisce dal testo libero (inaffidabile,
stesso Dunning-Kruger di A). Le sorgenti del tier sono, in ordine:

1. **Override esplicito** (`--haiku`/`--sonnet`/`--opus`) → vince sempre.
2. **`ctx.taskType`** dichiarato dal **chiamante** (es. in C il KDP Orchestrator passa `manuscript`).
   È il path ad alto valore: il chiamante conosce il contesto, niente da indovinare.
3. **Pattern Opus-grade** nel testo (sottoinsieme degli HEAVY_PATTERNS) → Opus.
4. **Default** → Sonnet.

## 3. Mappa tipo-task → tier

| TaskType | Tier | Razionale |
|---|---|---|
| `extract`, `classify`, `summarize`, `translate` | **Haiku** | trasformazioni meccaniche |
| `write`, `analyze`, `copy` | **Sonnet** | produzione standard |
| `manuscript`, `strategy` | **Opus** | premium che si vede in classifica |

## 4. Modelli (ID reali)

| Tier | Model ID | Env override |
|---|---|---|
| Haiku 4.5 | `claude-haiku-4-5-20251001` | `JARVIS_MODEL_API_HAIKU` |
| Sonnet 4.6 | `claude-sonnet-4-6` | `JARVIS_MODEL_API` (default già esistente) |
| Opus 4.8 | `claude-opus-4-8` | `JARVIS_MODEL_API_OPUS` |

## 5. Modifiche per file

- **`llm/types.ts`**: aggiungere
  - `export type ApiTier = "haiku" | "sonnet" | "opus";`
  - `export type TaskType = "extract"|"classify"|"summarize"|"translate"|"write"|"analyze"|"copy"|"manuscript"|"strategy";`
  - in `RouteCtx`: `taskType?: TaskType; apiTier?: ApiTier;`
- **`config.ts`**: aggiungere `modelApiHaiku`, `modelApiOpus`, e `opusPatterns: string[]`
  (sottoinsieme: `"scrivi il capitolo"`, `"scrivi il libro"`, `"manoscritto"`, `"brief strategico"`, `"outline completo"`). `modelApi` resta = Sonnet default.
- **`core/tier.ts`** (nuovo): funzione **pura** `pickApiModel(input, ctx, cfg) → { tier, model, reason }`
  con la precedenza della §2.
- **`core/router.ts`**: nel ramo `target: "api"`, il `model` proviene da `pickApiModel`; il `reason`
  riporta il tier scelto. `decide` resta pura.
- **`llm/anthropic.ts`**: il `system` viene passato come blocco con `cache_control: { type: "ephemeral" }`
  (prompt caching). Comportamento invariato se system vuoto.
- **`cli.ts`**: parse flag `--haiku`/`--sonnet`/`--opus` → `ctx.apiTier`.

## 6. Scope

**Dentro:** tier selection (pura, regole+override+taskType), prompt caching su system, flag CLI, test.
**Fuori:** wiring effettivo dei taskType KDP (→ C), sub-tiering del modello locale, caching dei blocchi
persona (arriva con C/E), batch processing.

## 7. Testing

- `pickApiModel`: override apiTier vince; ogni taskType → tier atteso; opus-pattern → Opus; default → Sonnet. (puro, TDD)
- `decide`: ramo API restituisce il model corretto secondo ctx.
- `anthropic`: la request inviata contiene `cache_control` sul system (verifica via client mock che cattura la richiesta).
- Regressione: i 30 test esistenti restano verdi.
