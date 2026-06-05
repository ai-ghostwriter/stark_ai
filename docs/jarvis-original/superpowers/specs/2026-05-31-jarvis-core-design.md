# JARVIS Core — Design Spec

> Spec di fondazione. Sotto-progetto **A — Core (Hybrid Brain)**.
> Data: 2026-05-31 · Stato: approvato per implementazione

---

## 1. Visione

JARVIS è un **assistente AI personale generale**, non una pipeline KDP.

Il suo cuore è un'**architettura ibrida**:
- **LLM locale** (Ollama) per il lavoro quotidiano — gratis, illimitato, nessun consumo di token API o finestre Pro.
- **API Anthropic** solo per ciò che il locale non regge — qualità/ragionamento di frontiera, a pagamento a token.

KDP è **uno dei domini** di tool che JARVIS saprà gestire, montato sopra il Core — non il fine del sistema.

### Le tre "valute" (invariato dal brief originale)
| Sistema | Come si paga | Dove si usa |
|---|---|---|
| Pro (abbonamento) | Fisso/mese, a finestre di messaggi | claude.ai + Claude Code (uso personale) |
| API (`api.anthropic.com`) | A token (input/output separati) | Dentro JARVIS, in runtime |
| Locale (Ollama) | Gratis, illimitato | Dentro JARVIS, in runtime |

Il Pro **non** è usabile dentro JARVIS in runtime: il software attinge solo a API (a pagamento) o locale (gratis). Ogni task spostato sul locale non consuma né token API né finestre Pro.

---

## 2. Decomposizione del sistema (contesto)

Il sistema completo è decomposto in 6 sotto-progetti indipendenti, ognuno con il proprio ciclo spec → plan → build:

| # | Sotto-progetto | Valore | Dipende da |
|---|---|---|---|
| **A** | **Core (Hybrid Brain)** — router locale↔API, conversazione, tool-calling, sessione | fondazione | nulla |
| B | Model Routing — tiering Haiku/Sonnet/Opus + prompt caching | risparmio API | A |
| C | KDP Orchestrator — guida le fasi richiamando le skill, tiene lo stato libro | automazione workflow | A, B |
| D | Ingestion — parser export (XLSX Cerebro) → JSON canonici | stop copiaincolla | A |
| E | Brand Memory — Pinecone, 14 libri come corpus | coerenza cross-libro | C |
| F | NL Router + Voce (Whisper/TTS) + Frontend React | esperienza "Stark" | tutti |

**Questo spec copre solo il sotto-progetto A.** Gli altri sono fuori scope qui.

### Strati architetturali
- **Core** — brain ibrido, indipendente dal dominio (questo spec)
- **Capabilities** — tool/skill: sistema, web, conoscenza (RAG)
- **Domini** — KDP e altri, come plugin di tool
- **Interfacce** — CLI → API server → voce → frontend React

---

## 3. Stack

**Core in Node/TypeScript.** Sidecar Python opzionale solo se/quando servono embedding locali o Whisper (STT) — non nell'MVP.

Motivazione:
- È il linguaggio forte del manutentore (Node/TS/React/Redux/RTK-Query).
- JARVIS a runtime è quasi tutto **I/O-bound** (HTTP a Ollama e Anthropic, file, streaming): terreno naturale di Node.
- Il "lavoro AI pesante" non è in-process: lo fanno Ollama (processo separato) e l'API (HTTP). JARVIS è un **orchestratore di chiamate**.
- Ecosistema AI maturo su TS: SDK Anthropic ufficiale, libreria Ollama JS, SDK Pinecone TS, LlamaIndex.TS/LangChain.js.
- Stack unificato con il futuro frontend React (type condivisi).

Il prototipo Python esistente (`project/src/`) è conservato come **reference spec** (sposta in `reference/`), non codice vivo.

---

## 4. Architettura del Core

### Struttura del package (singolo package TS per l'MVP)
```
jarvis/
  src/
    core/
      router.ts        # decisione locale/API — Tier 0-2, funzione PURA (no I/O)
      orchestrator.ts  # il loop: handle(input, session) → risposta
      session.ts       # storia conversazione (in-memory ora, interfaccia pronta per persistenza)
    llm/
      ollama.ts        # client locale (HTTP localhost:11434)
      anthropic.ts     # client API (SDK TS ufficiale)
      types.ts         # Message, ToolCall, Route — type condivisi
    tools/
      registry.ts      # name → { schema, handler }
      builtins/        # tool GENERALI: time, weather, read-file
    config.ts          # modelli, soglie, env
    cli.ts             # entry: REPL chat + comandi + flag --api/--local
  package.json
  tsconfig.json
```

### Unità e responsabilità (ognuna una cosa sola)
| Unità | Cosa fa | Interfaccia | Dipende da |
|---|---|---|---|
| `ollama.ts` | isola HTTP verso Ollama | `chat(messages, opts) → Promise<Message>` con streaming | fetch |
| `anthropic.ts` | isola SDK Anthropic | `chat(messages, opts) → Promise<string>` | SDK ufficiale |
| `router.ts` | decide la rotta, **funzione pura** | `decide(input, ctx) → Route` | types |
| `registry.ts` | registra tool generali | `register(tool)`, `get(name)`, `schemas()` | types |
| `orchestrator.ts` | orchestra il flusso completo | `handle(input, session) → Result` | tutti |
| `session.ts` | tiene la conversazione | `append(msg)`, `messages()` | types |
| `cli.ts` | interfaccia ibrida | entry point | orchestrator |

### Type condivisi (`types.ts`)
- `Message` = `{ role: 'system'|'user'|'assistant'|'tool', content: string, tool_calls?, name? }`
- `ToolCall` = `{ name: string, arguments: Record<string, unknown> }`
- `Route` = `{ target: 'local'|'api', model: string, reason: string }`
- `Result` = `{ route: 'local'|'api', model: string, tool: string|null, reply: string }`

---

## 5. Router — il cuore

Il routing sono **due decisioni distinte**, da non confondere:
1. **Serve un tool?** (capacità) → gestita nativamente dal tool-calling del modello locale.
2. **Serve la qualità dell'API?** (il locale non regge) → la decisione che costa soldi.

Per l'MVP la decisione #2 è **a regole certe + override**, non a classificatore LLM (un modello da 8B è inaffidabile nel giudicare i propri limiti, e aggiunge latenza a ogni richiesta).

### Logica `decide(input, ctx) → Route`
```
Tier 0 — override esplicito (--api / --local nel ctx)   → vince sempre
Tier 1 — regole deterministiche → API:
           · dimensione input oltre soglia (config: HEAVY_INPUT_CHARS)
           · tag "heavy" dichiarato dal contesto/dominio
           · verbi di task generativo lungo (config: HEAVY_PATTERNS,
             es. "scrivi il capitolo", "scrivi il libro", "manoscritto")
Tier 2 — default LOCALE con tool-calling nativo
```

`router.ts` è **puro**: nessun I/O, decisione derivata solo da `input` + `ctx` + `config`. Questo lo rende interamente testabile con unit test deterministici.

### Rimandato (non MVP)
- Tier 3 — escalation-on-doubt: il locale risponde, un check di qualità segnala bassa confidenza → ritenta su API.
- Classificatore LLM locale come triage.
Si aggiungono solo se le regole si rivelano insufficienti, **misurando** sull'uso reale.

---

## 6. Flusso dati

```
input
 → cli (parsa comando/chat + flag override)
 → orchestrator.handle(input, session)
     → router.decide(input, ctx) → Route
        ├─ target=local:
        │     ollama.chat(messages, tools=registry.schemas())
        │     se tool_calls: esegui handler → ollama.chat 2ª passata (risposta naturale)
        │     altrimenti: risposta conversazionale
        └─ target=api:
              anthropic.chat(messages)
     → Result { route, model, tool, reply }
 → cli render: "jarvis [route · tool] > reply"
```

Nota: a differenza del prototipo Python (che esegue solo la prima tool call e usa `httpx` sync nel loop async), il Core gestisce gli errori di ogni tool call e usa I/O async nativo.

---

## 7. Configurazione (`config.ts`) — allineata alla realtà

| Chiave | Valore MVP | Note |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | env override |
| `MODEL_LOCAL` | `qwen3:8b` | **presente sul Mac** (non `qwen2.5:14b` del brief) |
| `MODEL_API` | `claude-sonnet-4-6` | un solo path API per l'MVP; tiering = sotto-progetto B |
| `ANTHROPIC_API_KEY` | da env | richiesta solo su rotta API |
| `HEAVY_INPUT_CHARS` | soglia da tarare | Tier 1 |
| `HEAVY_PATTERNS` | lista verbi task lungo | Tier 1 |

Realtà ambiente al 2026-05-31: Ollama v0.23.0 installato ma non in esecuzione; modelli presenti `qwen3:8b` e `glm-ocr`; nessun `.venv`; `ANTHROPIC_API_KEY` non in shell.

---

## 8. Tool builtin (MVP — generali, non KDP)

| Tool | Firma | Note |
|---|---|---|
| `get_time` | `(timezone='Europe/Rome') → string` | ora locale, locale-aware |
| `get_weather` | `(city) → string` | Open-Meteo, no API key (geocoding + forecast) |
| `read_file` | `(path) → string` | legge file di sistema; validazione path |

Ogni tool = handler + schema in `registry.ts`. I tool di dominio KDP arrivano in C.

---

## 9. Error handling (chiude i buchi del prototipo)

| Caso | Comportamento |
|---|---|
| Ollama non in esecuzione | messaggio chiaro + suggerisce `ollama serve`, niente crash |
| Tool lancia eccezione | catturato, errore riportato al modello/utente, niente crash |
| JSON argomenti tool invalido | catturato, gestito con messaggio |
| `ANTHROPIC_API_KEY` mancante su rotta API | messaggio esplicito |
| Errore HTTP API | catturato e mostrato |
| Input vuoto | ignorato (CLI) / 400 (futuro server) |

---

## 10. Interfaccia CLI (ibrida)

- `jarvis` (no args) → REPL chat interattiva (come il prototipo, esce con `quit`/`exit`/`esci`).
- Flag `--api` / `--local` → override Tier 0 sulla singola richiesta.
- Comandi espliciti (es. `jarvis <task> <args>`) → scaffold predisposto, popolato dai domini successivi.
- Render mostra route scelta e tool usato: `jarvis [local · get_weather] > ...`.

NL router (capire l'intento dal linguaggio naturale) = sotto-progetto F, non MVP.

---

## 11. Testing

| Livello | Cosa | Come |
|---|---|---|
| Unit | `router.decide` | deterministico: input → rotta attesa (TDD, copertura Tier 0-2) |
| Unit | tool handler | isolati, input → output |
| Unit | client LLM | HTTP/SDK mockato |
| Integrazione | `orchestrator.handle` | con client LLM mockati, verifica il loop tool-calling |

Il router è il punto a più alto valore di test: è puro e le sue decisioni governano il costo.

---

## 12. Scope MVP

**Dentro:**
- Core Node/TS: client `ollama` + `anthropic`
- Router a regole + override (Tier 0–2)
- Tool registry + 3 builtin generali (`get_time`, `get_weather`, `read_file`)
- CLI ibrida (REPL + flag override)
- Session in-memory
- Error handling robusto
- Unit test sul router + tool + integrazione orchestrator
- Config allineata alla realtà (`qwen3:8b`, Sonnet 4.6)

**Fuori (sotto-progetti successivi):** tiering modelli + caching (B), ingestion export (D), orchestratore + tool KDP (C), Pinecone (E), classificatore NL/voce/React/persistenza (F).

---

## 13. Aggiornamento documenti (deliverable)

1. `JARVIS_KDP_BRIEF.md` → rifondato come `JARVIS_BRIEF.md`: visione assistente generale, stack Node/TS, modelli reali, decomposizione 6 sotto-progetti, KDP come dominio.
2. `project/README.md` → allineato a Node/TS (oggi documenta `jarvis.*` Python inesistente).
3. Prototipo Python `project/src/` → spostato in `reference/` come spec eseguibile.
4. Questo spec → fonte di verità del sotto-progetto A.
