# MARK-R — Architettura di un voice agent JARVIS-style, riprogettato

> Reimplementazione "solida" di Mark-XL: stesso scope (agente vocale/visivo locale con
> tool-calling e HUD), ma con confini architetturali netti, codice testabile e
> **routing LLM ibrido local↔cloud**.
> Nome di lavoro: **MARK-R** (sostituiscilo col tuo branding — es. un nuovo modulo
> dell'ecosistema WAR-MACHINE).

Documento di design tecnico. Pensato per essere dato in input ad agenti (Claude Code /
Codex CLI) come `ARCHITECTURE.md` / `AGENTS.md`.

---

## 0. Critica dell'originale (Mark-XL) — cosa NON replicare

Mark-XL funziona ed è un ottimo progetto-passione, ma soffre dei problemi tipici del
monolite single-dev:

| Problema | Conseguenza |
|---|---|
| Tutto in un processo Python, logica + UI + audio + tool accoppiati | Niente test unitari reali; un crash dell'audio porta giù l'HUD |
| Tool hardcoded "18 built-in" dentro il core | Aggiungere/rimuovere un tool tocca il core; nessun isolamento di fallimento |
| LLM unico (Ollama locale) | Nessun fallback su ragionamento complesso; offline-only per scelta, non per policy |
| UI PyQt6 intrecciata con la business logic | UI non riusabile, non testabile headless |
| Auto-installazione pacchetti a runtime + restart | Stato non riproducibile; antipattern per CI/CD e per un portfolio |
| Nessun contratto esplicito tra i sottosistemi | Refactor rischiosi; impossibile sostituire un layer senza toccarne altri |

**Tesi di MARK-R**: il difetto non è il linguaggio, è l'**assenza di confini**.
La riprogettazione vende i confini come feature primaria.

---

## 1. Requisiti

### 1.1 Funzionali
- **F1** — Input vocale always-listening con VAD (rilevamento del parlato) e wake-word opzionale.
- **F2** — STT streaming offline (Whisper/Vosk) con auto-rilevamento lingua o locale forzato.
- **F3** — Risposta dell'agente con **tool-calling** + streaming token.
- **F4** — TTS multi-engine (offline e cloud), barge-in (l'utente interrompe il parlato).
- **F5** — Esecuzione tool: OS, browser, file, screen analysis, ecc. — **estendibile a plugin**.
- **F6** — HUD: system monitor, transcript live, log panel, file drop zone, config dinamica.
- **F7** — **Routing LLM ibrido**: stesso turno può andare local (Ollama) o cloud
  (OpenRouter/Anthropic) secondo policy.

### 1.2 Non-funzionali
- **N1 — Latenza**: voice-to-first-token < 700 ms su task locale; il confine di linguaggio
  non deve aggiungere latenza percepibile (vedi §4, audio non attraversa il confine).
- **N2 — Privacy**: un flag `sensitive` forza il routing locale; i dati audio grezzi
  non lasciano mai `voice-core`.
- **N3 — Testabilità**: ogni processo testabile in isolamento; coverage logico ≥ 80% su
  router + dispatch + FSM conversazione.
- **N4 — Riproducibilità**: nessuna installazione a runtime; lockfile (pnpm + uv/poetry),
  build deterministica.
- **N5 — Resilienza**: il crash di un tool non abbatte l'agente; il crash di `voice-core`
  non abbatte l'`agent-core`. Failure isolation per processo.
- **N6 — Offline-first, cloud-capable**: deve funzionare senza rete (degradando a local),
  e sfruttare il cloud quando disponibile e conveniente.

### 1.3 Vincoli
- Team: 1 (tu) + agenti AI. → privilegiare convenzioni note, monorepo singolo.
- Stack noto: JS/TS/React/Node (forte) + Python (solido). → assegnare i layer di conseguenza.
- Hardware target: laptop dev (es. M3 Pro), GPU non garantita. → modelli locali piccoli + cloud per il pesante.

---

## 2. Decisione di stack (ADR-style)

### ADR-001 — Architettura poliglotta a tre processi

**Stato**: accettata.

**Contesto**: serve audio real-time (dominio Python ML), orchestrazione/tool-calling
testabile (dominio TS), e una UI HUD (dominio web/React). Un solo linguaggio costringe
un layer a vivere fuori dal suo ecosistema ideale.

**Decisione**: tre processi, ognuno nel suo linguaggio ottimale, separati da **un unico
contratto a eventi tipizzato**.

```
┌──────────────────┐   eventi JSON/WS    ┌──────────────────┐
│   voice-core     │ ◄─────────────────► │   agent-core     │
│   (Python)       │  (NO audio bytes)   │   (TypeScript)   │
│  VAD·STT·TTS     │                     │  router·FSM·tool │
└──────────────────┘                     └────────┬─────────┘
                                                  │ MCP (stdio/ws)
                          eventi WS               ▼
┌──────────────────┐               ┌──────────────────────────┐
│   hud (React)    │ ◄──────────── │   tool servers (MCP)     │
│   in Tauri       │   state push  │   os · browser · files…  │
└──────────────────┘               └──────────────────────────┘
```

**Argomento decisivo (perno)**: *l'audio non attraversa il confine di linguaggio*. I frame
PCM, lo streaming STT e la sintesi TTS restano interni a `voice-core`. Sul confine passano
solo **eventi semantici a bassa banda** (testo del transcript, "pronuncia questa stringa",
chiamate tool). Quindi il costo classico del poliglotta (serializzazione di stream pesanti)
**non si applica**: paghi solo qualche KB di JSON per turno.

**Conseguenze**:
- (+) Ogni layer testabile in isolamento; failure isolation per processo.
- (+) Tipi condivisi tra `agent-core` e `hud` (monorepo TS).
- (+) Router LLM nel linguaggio con i migliori SDK vendor.
- (−) Due runtime da gestire (Node + Python) → mitigato da monorepo + lockfile + un solo `make dev`.
- (−) Un contratto da versionare → è esattamente ciò che lo rende solido (vedi §4).

### ADR-002 — Orchestratore in TypeScript

**Decisione**: il cervello (`agent-core`) è TS/Node, non Python.

**Perché**:
1. SDK LLM di prima classe (Anthropic, OpenAI/OpenRouter) con streaming e tool-use nativi.
2. **Tool-schema con Zod** → validazione runtime + tipi compile-time dalla stessa fonte.
3. Event-driven/async: Node è nel suo elemento per un orchestratore a eventi.
4. Tipi condivisi col HUD React (monorepo, package `@contracts`).
5. È la tua forza professionale → manutenibile e portfolio-relevant.

**Scartato**: orchestratore Python (`pydantic-ai`/`instructor`). Valido, ma perde la
condivisione tipi col HUD e ti porta fuori dalla tua corsia di punta.

### ADR-003 — Tool come server MCP

**Decisione**: i tool non sono funzioni hardcoded nel core; sono **server MCP** (Model
Context Protocol), in-process (TS) per i leggeri o out-of-process (Python/qualsiasi) per
i pesanti.

**Perché**:
- Modularità reale: aggiungere un tool = aggiungere un server, zero modifiche al core.
- Failure isolation (N5): un tool che esplode non tocca l'agente.
- Standard di settore, riusabile fuori dal progetto, e **si allinea al lavoro MCP che stai
  già pianificando** (KDP Google Drive, ecc.).
- Un tool pesante in Python (es. screen analysis con OpenCV) vive in Python senza inquinare il core TS.

### ADR-004 — HUD web in Tauri (non Electron, non PyQt6)

**Decisione**: HUD in React, impacchettato con **Tauri**.

**Perché**: footprint ~10× inferiore a Electron, binario nativo, webview di sistema; il
core resta un processo separato a cui il HUD si connette via WS. PyQt6 scartato perché
intreccia UI e logica e non è la tua corsia.

---

## 3. High-Level Design

### 3.1 Componenti e responsabilità

| Processo | Linguaggio | Responsabilità unica | NON fa |
|---|---|---|---|
| `voice-core` | Python | Audio real-time: VAD, STT streaming, TTS, barge-in | Non decide *cosa* dire; non chiama LLM né tool |
| `agent-core` | TypeScript | Stato conversazione, **routing LLM**, dispatch tool, policy | Non tocca audio; non implementa i tool |
| `tool servers` | TS o Python | Eseguire una capability isolata (OS/browser/file/screen) | Non conosce l'LLM né la conversazione |
| `hud` | React/Tauri | Presentazione: transcript, log, monitor, config, drop | Nessuna business logic |
| `@contracts` | TS (+ gen Python) | Schemi degli eventi: **unica fonte di verità** | — |

### 3.2 Flusso di un turno (happy path)

```
1. voice-core: VAD rileva parlato → STT streaming → emette {type:"stt.partial"} … {type:"stt.final", text}
2. agent-core: riceve stt.final → RoutingPolicy classifica il task → sceglie provider (local|cloud)
3. agent-core: LLMProvider.stream(messages, tools) → token streaming → emette {type:"agent.token"} (→ HUD)
4. Se il modello chiede un tool → agent-core: ToolRegistry.dispatch(call) via MCP → {type:"tool.call"/"tool.result"} (→ HUD)
5. agent-core: testo finale → emette {type:"tts.speak", text, voice} verso voice-core
6. voice-core: TTS sintetizza e riproduce; se l'utente parla → {type:"barge_in"} → agent-core annulla/tronca
```

---

## 4. Deep Dive — Il contratto (cuore della solidità)

Il contratto è **l'artefatto più importante** del progetto. È un protocollo a eventi
versionato, con **unica fonte di verità in Zod** (TS), da cui si generano i modelli
Pydantic (Python) — niente schemi duplicati a mano che divergono.

### 4.1 Trasporto
- **WebSocket locale** (loopback) tra i processi. Alternativa: Unix domain socket per i nativi.
- Messaggi **JSON**, uno per frame, con campo `type` discriminante e `v` di versione.
- Backpressure: i `*.partial` sono droppable; i `*.final`, `tool.*`, `tts.speak` sono garantiti.

### 4.2 Schema eventi (estratto, Zod — fonte di verità)

```ts
// packages/contracts/src/events.ts
import { z } from "zod";

export const Lang = z.enum(["auto","it","en","de","fr"]);

// voice-core → agent-core
export const SttPartial = z.object({ type: z.literal("stt.partial"), v: z.literal(1), text: z.string() });
export const SttFinal   = z.object({ type: z.literal("stt.final"),   v: z.literal(1), text: z.string(), lang: Lang });
export const BargeIn    = z.object({ type: z.literal("barge_in"),    v: z.literal(1) });

// agent-core → voice-core
export const TtsSpeak   = z.object({ type: z.literal("tts.speak"), v: z.literal(1), text: z.string(), voice: z.string().optional() });
export const TtsCancel  = z.object({ type: z.literal("tts.cancel"), v: z.literal(1) });

// agent-core → hud
export const AgentToken = z.object({ type: z.literal("agent.token"), v: z.literal(1), delta: z.string() });
export const ToolCall   = z.object({ type: z.literal("tool.call"),   v: z.literal(1), id: z.string(), name: z.string(), args: z.record(z.unknown()) });
export const ToolResult = z.object({ type: z.literal("tool.result"), v: z.literal(1), id: z.string(), ok: z.boolean(), data: z.unknown() });
export const RouteInfo  = z.object({ type: z.literal("route.info"),  v: z.literal(1), provider: z.string(), model: z.string(), reason: z.string() });

export const Event = z.discriminatedUnion("type", [
  SttPartial, SttFinal, BargeIn, TtsSpeak, TtsCancel,
  AgentToken, ToolCall, ToolResult, RouteInfo,
]);
export type Event = z.infer<typeof Event>;
```

### 4.3 Generazione lato Python
Pipeline: `zod-to-json-schema` → JSON Schema → `datamodel-code-generator` → modelli Pydantic.
Risultato: `voice-core` valida/serializza con gli **stessi** schemi. Un test di contratto
(golden JSON) gira su entrambi i lati per impedire la deriva (vedi §7).

> Regola d'oro: **nessuno** dei due processi conosce i dettagli interni dell'altro. Conoscono
> solo `@contracts`. Sostituire Whisper con un altro STT, o Ollama con un altro LLM, non
> tocca il contratto.

---

## 5. Deep Dive — Router LLM ibrido (local↔cloud)

Il pezzo che ti interessa di più, ed è gemello del tuo routing WAR-MACHINE
(Haiku→Sonnet→Opus) e di `stark-debate`.

### 5.1 Astrazione provider

```ts
// packages/agent-core/src/llm/provider.ts
export interface LLMProvider {
  id: string;                                  // "ollama:qwen2.5", "openrouter:anthropic/claude-…"
  capabilities: { vision: boolean; toolUse: boolean; maxContext: number; };
  stream(req: ChatRequest): AsyncIterable<ChatChunk>;   // token + tool_calls
}
```
Implementazioni: `OllamaProvider` (locale), `OpenRouterProvider` (cloud multi-vendor),
eventualmente `AnthropicProvider` diretto. Sono **intercambiabili**: il router ne sceglie uno.

### 5.2 Policy di routing (deterministica prima, LLM-classifier dopo)

```ts
export interface RoutingDecision { provider: string; reason: string; }

export function route(ctx: RoutingContext): RoutingDecision {
  // 1) Vincoli forti (override)
  if (!ctx.online)            return { provider: "ollama",     reason: "offline" };
  if (ctx.flags.sensitive)    return { provider: "ollama",     reason: "privacy: dato sensibile, resta locale" };
  if (ctx.needs.vision)       return { provider: "openrouter", reason: "richiede vision, non disponibile in locale" };
  if (ctx.needs.context > 32_000) return { provider: "openrouter", reason: "long-context oltre la soglia locale" };

  // 2) Classificazione del task (dispatcher stile Haiku)
  switch (ctx.taskClass) {
    case "trivial":    // comandi OS, risposte brevi, latenza-critiche
      return { provider: "ollama", reason: "task triviale/latenza-critica → locale" };
    case "reasoning":  // pianificazione, multi-step, tool-chain complessa
      return { provider: "openrouter", reason: "ragionamento complesso → cloud" };
    default:
      return { provider: ctx.budget.cloudOk ? "openrouter" : "ollama",
               reason: "default secondo budget" };
  }
}
```

**Proprietà chiave**: `route()` è una **funzione pura** → test table-driven banali e
deterministici (N3). La classificazione del task può essere un classificatore LLM piccolo
e locale (un Haiku-locale), ma le **regole forti** restano deterministiche e prioritarie.
Ogni decisione emette un `route.info` visibile nel HUD (trasparenza/debug).

### 5.3 Estensione naturale
La stessa astrazione abilita, in futuro, il pattern `stark-debate` (più provider che
deliberano + giudice) come `EnsembleProvider` che implementa `LLMProvider`. Il core non
se ne accorge.

---

## 6. Deep Dive — Tool system (MCP)

```ts
// agent-core: registry agnostico al trasporto
export interface ToolHandle {
  name: string;
  schema: JSONSchema;                       // esposto all'LLM
  invoke(args: unknown): Promise<ToolResult>;
}
```
- Tool leggeri (TS): in-process, registrati come `ToolHandle`.
- Tool pesanti (Python: screen analysis, automazione OS): **server MCP separato**, l'`agent-core`
  ci parla via stdio/ws. Crash isolato (N5), timeout per-tool, retry con backoff.
- Lo schema del tool è la fonte per il `tool-use` dell'LLM: una sola definizione, niente drift
  tra "cosa sa fare il tool" e "cosa crede l'LLM".

Esempi di tool come server MCP: `mcp-os` (shell/app), `mcp-browser` (Playwright),
`mcp-files`, `mcp-screen` (vision/OCR, Python), `mcp-system-monitor`.

---

## 7. Strategia di test

| Livello | Cosa | Come |
|---|---|---|
| **Unit (agent-core)** | `route()`, dispatch tool, FSM conversazione | Vitest, table-driven; provider e tool **mockati** |
| **Unit (voice-core)** | handler eventi, gestione barge-in | Pytest; audio sintetico/fixture WAV |
| **Contract test** | gli schemi non divergono tra TS e Python | Golden JSON in `@contracts/fixtures/`, validati da entrambi i lati in CI |
| **Integration (voice-core)** | STT/TTS reali su clip registrate | Pytest + fixture audio, asserzioni su `stt.final` |
| **E2E** | turno completo senza microfono | Inietti un `stt.final` finto nel WS → asserisci `tool.call`/`tts.speak` emessi |

Il **contract test** è l'assicurazione che rende il poliglotta sicuro: se qualcuno cambia
uno schema in Zod e non rigenera il Pydantic, la CI fallisce sul golden JSON. La deriva
silenziosa — il vero killer dei sistemi multi-linguaggio — diventa impossibile.

---

## 8. Struttura del monorepo

```
mark-r/
├─ package.json            # pnpm workspaces
├─ pnpm-workspace.yaml
├─ Makefile                # `make dev` avvia voice-core + agent-core + hud
├─ packages/
│  ├─ contracts/           # Zod (fonte di verità) + gen JSON-Schema + golden fixtures
│  │  └─ src/events.ts
│  ├─ agent-core/          # TS — router, FSM, tool registry, LLM providers
│  │  └─ src/{llm,tools,conversation,bus}/
│  └─ hud/                 # React + Tauri
├─ services/
│  └─ voice-core/          # Python — VAD/STT/TTS  (uv o poetry, pyproject.toml)
│     └─ src/voice_core/
├─ tools/                  # server MCP
│  ├─ mcp-os/      (TS)
│  ├─ mcp-browser/ (TS, Playwright)
│  └─ mcp-screen/  (Python, OpenCV/OCR)
└─ docs/
   └─ ARCHITECTURE.md      # questo file
```

Un solo `make dev`. Lockfile su entrambi gli ecosistemi (N4). CI: lint + unit + contract
test su ogni push.

---

## 9. Roadmap incrementale (vertical slices, non big-bang)

Ogni fase è uno **slice verticale funzionante**, così hai sempre qualcosa di dimostrabile.

1. **Slice 0 — Scheletro + contratto**: monorepo, `@contracts`, WS bus, un `route.info`
   end-to-end con eventi finti. Niente audio, niente LLM. → dimostra i confini.
2. **Slice 1 — Loop testo**: `agent-core` + `OllamaProvider` locale, un tool (`mcp-os`),
   input da CLI (niente voce). → dimostra tool-calling e routing (solo locale).
3. **Slice 2 — Hybrid routing**: aggiungi `OpenRouterProvider` + `route()` completa +
   `route.info` nel HUD. → dimostra il pezzo distintivo.
4. **Slice 3 — Voce**: `voice-core` con VAD+STT+TTS, barge-in. → l'assistente parla.
5. **Slice 4 — HUD Tauri**: transcript live, log, system monitor, drop zone, config.
6. **Slice 5 — Tool fleet**: browser (Playwright), screen analysis (Python), files.
7. **Slice 6 — Hardening**: contract test in CI, timeout/retry sui tool, telemetria.

---

## 10. Trade-off espliciti e cosa rivedere a scala

| Decisione | Vantaggio | Costo / Rischio | Da rivedere quando… |
|---|---|---|---|
| Poliglotta 3 processi | Ogni layer nel suo ottimo; failure isolation | 2 runtime da gestire | Se resti 1 dev e l'ops pesa → valuta variante all-Python (vedi sotto) |
| Contratto WS + Zod→Pydantic | Niente drift; layer sostituibili | Un contratto da versionare | Mai: è il valore portante |
| Tool via MCP | Modularità, isolamento | Overhead per tool banali | Se un tool è triviale e hot-path → inline in-process |
| Router con regole + classifier | Deterministico e trasparente | Il classifier va calibrato | Se le regole forti bastano → togli il classifier |
| Tauri HUD | Footprint minimo | Webview di sistema variabile per OS | Se serve uniformità pixel-perfect cross-OS → Electron |

### Variante "Plan B" — all-Python pulito
Se preferisci **operatività minima** rispetto alla separazione poliglotta: stessa
architettura a confini netti, ma `agent-core` in Python (`pydantic-ai` + `asyncio`), HUD
sempre web servito via WS. Perdi la condivisione tipi col HUD e la tua corsia TS di punta,
guadagni un solo runtime. È un trade-off legittimo: la **solidità non sta nel numero di
linguaggi, sta nei confini**. Anche il Plan B li mantiene.

---

## Appendice A — Confronto sintetico Mark-XL → MARK-R

| Dimensione | Mark-XL | MARK-R |
|---|---|---|
| Confini | Monolite | 3 processi + contratto tipizzato |
| LLM | Solo Ollama locale | Hybrid local↔cloud con policy |
| Tool | Hardcoded nel core | Server MCP isolati |
| UI | PyQt6 accoppiata | React/Tauri disaccoppiata |
| Testabilità | Bassa | Unit + contract + e2e |
| Riproducibilità | Auto-install a runtime | Lockfile + build deterministica |
| Sostituibilità layer | Difficile | Per design (contratto) |
