# SLICE-0-SPEC.md — Scheletro + contratto end-to-end con eventi finti

> Spec operativa per Claude Code e Codex CLI. Obiettivo: dimostrare i **confini** prima
> di toccare audio o LLM. A fine slice: tre processi che si parlano via WS con eventi
> tipizzati, contract test in CI, un solo `make dev`.
> Il codice qui dentro è **riferimento normativo**: implementatelo così salvo migliorie
> motivate (da annotare in `.session/notes/`).

## 1. Scope

IN scope:
- Monorepo pnpm + struttura directory definitiva.
- `packages/contracts`: schemi Zod completi, export JSON Schema, golden fixtures.
- Codegen: Zod → JSON Schema → Pydantic (`make codegen`).
- `packages/agent-core`: WS hub (server), validazione eventi, **FakeBrain** (risponde a
  `stt.final` con `route.info` + `agent.token` finti + `tts.speak`).
- `services/voice-core`: client WS stub (**FakeVoice**) che emette `stt.final` da stdin
  e logga i `tts.speak` ricevuti (stampa, non sintetizza).
- `packages/hud`: per Slice 0 basta un **client web minimale** (Vite + React, NO Tauri)
  che mostra il transcript degli eventi in tempo reale.
- Contract test golden-JSON su entrambi i lati. CI GitHub Actions.
- `Makefile` con `dev`, `test`, `codegen`, `lint`.

OUT of scope (slice successivi): audio reale, Ollama/OpenRouter, MCP tools, Tauri, persona
runtime completo (ma il campo `persona` è GIÀ nel contratto, vedi §3 — costa zero ora e
abilita l'integrazione JARVIS/FRIDAY dopo).

## 2. Topologia Slice 0

```
voice-core (Python, WS client) ──┐
                                 ├──► agent-core (TS, WS hub :7710) ──► broadcast a hud
hud (React, WS client) ──────────┘
```
- agent-core è il **server** WS (porta 7710, loopback). voice-core e hud sono client.
- Ogni client si presenta con un evento `hello` (`role: "voice" | "hud"`).
- L'hub instrada: eventi da voice → FakeBrain; output del brain → voice (tts.*) e hud (tutto).

## 3. Contratto — `packages/contracts/src/events.ts`

```ts
import { z } from "zod";

export const Lang = z.enum(["auto", "it", "en", "de", "fr"]);
export const PersonaId = z.enum(["jarvis", "friday", "veronica", "default"]);

const base = { v: z.literal(1) };

// — handshake —
export const Hello = z.object({ ...base, type: z.literal("hello"),
  role: z.enum(["voice", "hud"]), client: z.string() });

// — voice-core → agent-core —
export const SttPartial = z.object({ ...base, type: z.literal("stt.partial"), text: z.string() });
export const SttFinal   = z.object({ ...base, type: z.literal("stt.final"),
  text: z.string(), lang: Lang.default("auto") });
export const BargeIn    = z.object({ ...base, type: z.literal("barge_in") });

// — agent-core → voice-core —
export const TtsSpeak  = z.object({ ...base, type: z.literal("tts.speak"),
  text: z.string(), voice: z.string().optional(), persona: PersonaId.default("default") });
export const TtsCancel = z.object({ ...base, type: z.literal("tts.cancel") });

// — agent-core → hud (e log) —
export const AgentToken = z.object({ ...base, type: z.literal("agent.token"), delta: z.string() });
export const AgentDone  = z.object({ ...base, type: z.literal("agent.done") });
export const RouteInfo  = z.object({ ...base, type: z.literal("route.info"),
  provider: z.string(), model: z.string(), reason: z.string() });
export const ToolCall   = z.object({ ...base, type: z.literal("tool.call"),
  id: z.string(), name: z.string(), args: z.record(z.unknown()) });
export const ToolResult = z.object({ ...base, type: z.literal("tool.result"),
  id: z.string(), ok: z.boolean(), data: z.unknown() });
export const SysError   = z.object({ ...base, type: z.literal("sys.error"),
  scope: z.string(), message: z.string() });

export const Event = z.discriminatedUnion("type", [
  Hello, SttPartial, SttFinal, BargeIn,
  TtsSpeak, TtsCancel,
  AgentToken, AgentDone, RouteInfo, ToolCall, ToolResult, SysError,
]);
export type Event = z.infer<typeof Event>;

export const parseEvent = (raw: string): Event => Event.parse(JSON.parse(raw));
```

Nota: `persona` è già nel contratto (vedi `INTEGRATION-JARVIS-FRIDAY.md`). In Slice 0
FakeBrain usa sempre `"default"`.

## 4. Codegen — Zod → Pydantic

`packages/contracts/scripts/gen-jsonschema.ts`:
```ts
import { zodToJsonSchema } from "zod-to-json-schema";
import { Event } from "../src/events.js";
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("dist-schema", { recursive: true });
writeFileSync("dist-schema/events.schema.json",
  JSON.stringify(zodToJsonSchema(Event, "Event"), null, 2));
```

Lato Python (responsabilità Codex):
```bash
datamodel-codegen \
  --input packages/contracts/dist-schema/events.schema.json \
  --input-file-type jsonschema \
  --output services/voice-core/src/voice_core/contracts_gen/events.py \
  --output-model-type pydantic_v2.BaseModel
```
Il file generato porta header "GENERATED — DO NOT EDIT" ed è incluso in repo (così la CI
può verificare che sia sincronizzato: rigenera e fa `git diff --exit-code`).

## 5. Golden fixtures + contract test

`packages/contracts/fixtures/*.json` — un file per tipo evento, esempi validi e una
cartella `invalid/` con esempi che DEVONO fallire. Esempio `stt.final.json`:
```json
{ "v": 1, "type": "stt.final", "text": "accendi le luci dello studio", "lang": "it" }
```

- Test TS (Vitest): ogni fixture valida passa `Event.parse`; ogni invalida lancia.
- Test Python (pytest): le stesse fixture validano contro i modelli Pydantic generati.
- CI: job `contract` esegue entrambi + verifica sync del codegen.

**Questo è il lucchetto anti-deriva del sistema poliglotta. Non è negoziabile.**

## 6. Implementazioni Slice 0

### 6.1 agent-core (Claude Code)
- `src/bus/hub.ts` — WS server (`ws` package): registry client per ruolo, broadcast a hud,
  routing voice→brain, brain→voice/hud. Ogni messaggio in ingresso: `parseEvent` in
  try/catch → su errore emette `sys.error` e droppa.
- `src/brain/fake.ts` — FakeBrain:
  - su `stt.final`: emette `route.info` ({provider:"fake", model:"fake-1", reason:"slice0"}),
    poi 5–10 `agent.token` con delay 50ms (simula streaming), poi `agent.done`,
    poi `tts.speak` con il testo completo (echo: `Ho ricevuto: "<testo>"`).
  - su `barge_in`: emette `tts.cancel`.
- `src/index.ts` — bootstrap: avvia hub su `ws://127.0.0.1:7710`.
- Test: hub (connessione, validazione, broadcast) e FakeBrain (sequenza eventi attesa)
  con client WS finti in-process.

### 6.2 voice-core stub (Codex)
- `src/voice_core/main.py` — client WS asyncio:
  - al connect invia `hello {role:"voice"}`;
  - loop stdin: ogni riga digitata → `stt.final` (lang "auto");
  - riga speciale `!barge` → `barge_in`;
  - su `tts.speak` ricevuto: stampa `🔊 [persona/voice] testo`; su `tts.cancel`: stampa cancel.
- Validazione in ingresso con i Pydantic generati; messaggi sconosciuti → warning + drop.
- Test: handler eventi con messaggi fixture (niente WS reale necessario nei unit test).

### 6.3 hud minimale (Claude Code)
- Vite + React + TS. Si connette al WS, invia `hello {role:"hud"}`, e rende:
  colonna transcript (stt.final / agent.token accumulati / tts.speak) + colonna log raw
  (tutti gli eventi, JSON pretty). Nessuno stile elaborato: è uno strumento di debug.

### 6.4 Makefile (root)
```make
dev:        ## avvia hub+brain, voice stub e hud in parallelo
	npx concurrently -n agent,voice,hud -c blue,green,magenta \
	  "pnpm --filter @mark-r/agent-core dev" \
	  "cd services/voice-core && uv run python -m voice_core.main" \
	  "pnpm --filter @mark-r/hud dev"

codegen:
	pnpm --filter @mark-r/contracts gen
	cd services/voice-core && uv run datamodel-codegen \
	  --input ../../packages/contracts/dist-schema/events.schema.json \
	  --input-file-type jsonschema \
	  --output src/voice_core/contracts_gen/events.py \
	  --output-model-type pydantic_v2.BaseModel

test:
	pnpm -r test
	cd services/voice-core && uv run pytest

lint:
	pnpm -r lint
	cd services/voice-core && uv run ruff check . && uv run mypy src
```

## 7. Criteri di accettazione (vincolanti)

1. `make dev` avvia i tre processi senza errori, con un solo comando.
2. Digitando una frase nello stub voice, entro 2s il hud mostra: `route.info`, lo
   streaming `agent.token`, e lo stub stampa il `tts.speak` di echo.
3. `!barge` durante lo streaming produce `tts.cancel` visibile su stub e hud.
4. Un messaggio JSON malformato inviato all'hub produce `sys.error` e NON crasha nulla.
5. `make test` verde: unit TS + unit Python + contract test su tutte le golden fixtures
   (valide passano, invalide falliscono su entrambi i lati).
6. Modificare un campo in `events.ts` senza `make codegen` fa fallire la CI (diff check).
7. Zero installazioni a runtime; clone + `pnpm i` + `uv sync` + `make dev` è tutto.

## 8. Divisione del lavoro proposta (seme per stark-forge)

| Area | Owner default | Reviewer |
|---|---|---|
| contracts (Zod, fixtures, gen-jsonschema) | Claude Code | Codex |
| agent-core (hub, FakeBrain, test) | Claude Code | Codex |
| voice-core stub + codegen Pydantic + pytest | Codex | Claude Code |
| hud minimale | Claude Code | Codex |
| Makefile + CI | Claude Code | Codex |

La negoziazione formale dei ruoli avviene via stark-forge: vedi `STARK-FORGE-BRIEF.md`.
