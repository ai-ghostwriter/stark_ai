# Render-Event HUD (JARVIS AIOS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ogni risposta dei 5 tool dati viaggia su due binari dalla stessa tool call — la voce dice il sommario, la UI su :5173 anima il pannello corrispondente — replicando il sistema del PDF `jarvis-aios-setup-guide.pdf` dentro l'architettura STARK-AI esistente, tutto avviato da `./start.sh`.

**Architecture:** Il render event è un nuovo tipo nel contratto Zod (`render.event`) che viaggia sul bus WS :7710 già esistente (niente data channel LiveKit separato: la UI è in locale e il hub già fa `hudBroadcast` di ogni output del brain). I tool dati restituiscono `{ spoken, render }`; `RealBrain.dispatchTool` riconosce la forma e emette il render event, passando al modello solo lo `spoken`. La UI monta un `HudStage` al centro dell'AppShell che si collega al hub, fa routing per `render` type e rimonta il pannello a ogni `event.id` (animazioni che ripartono fresche). I dati vengono da `seed/*.json` (demo mode, default) con fallback automatico — il pannello non è mai vuoto.

**Tech Stack:** Zod (contracts, source of truth) → JSON Schema → Pydantic via `make codegen` · Node/TS core (vitest) · React 18 + Vite + SCSS modules (UI) · WS hub :7710.

**Convenzioni:** i 5 type string sono `stark.brief`, `stark.metrics`, `stark.pipeline`, `stark.intel`, `stark.actions`. Demo mode: `STARK_DEMO_MODE` (default `1`). Seed in `/seed` alla root del repo.

---

### Task 1: Contratto — RenderEvent + payload schemas

**Files:**
- Create: `packages/contracts/src/render.ts`
- Modify: `packages/contracts/src/events.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/scripts/gen-jsonschema.ts`
- Modify: `packages/contracts/test/events.test.ts:11-17` (lista dei type)
- Create: `packages/contracts/fixtures/events/valid/render.event.json`
- Create: `packages/contracts/fixtures/events/invalid/render.event-bad-render-type.json`

- [ ] **Step 1: Aggiungi le fixture (i test golden le caricano da directory, quindi sono loro il "failing test")**

`packages/contracts/fixtures/events/valid/render.event.json`:

```json
{
  "v": 1,
  "type": "render.event",
  "id": "evt-0001",
  "ts": 1765500000000,
  "tool": "get_daily_brief",
  "render": "stark.brief",
  "title": "Daily Brief",
  "spoken": "Tre segnali oggi: vendite in crescita, una recensione critica su Mia Meyer, scadenza outline Hashimoto.",
  "payload": { "summary": "Giornata in controllo." }
}
```

`packages/contracts/fixtures/events/invalid/render.event-bad-render-type.json`:

```json
{
  "v": 1,
  "type": "render.event",
  "id": "evt-0002",
  "ts": 1765500000000,
  "tool": "get_daily_brief",
  "render": "stark.unknown",
  "title": "Daily Brief",
  "spoken": "x",
  "payload": {}
}
```

- [ ] **Step 2: Aggiorna la lista attesa dei type nel test**

In `packages/contracts/test/events.test.ts`, la lista ordinata diventa:

```ts
    expect([...types].sort()).toEqual([
      "agent.done", "agent.token", "barge_in", "hello",
      "render.event", "route.info", "stt.final", "stt.partial", "sys.error",
      "tool.call", "tool.result", "tts.cancel", "tts.speak",
    ]);
```

- [ ] **Step 3: Verifica che i test falliscano**

Run: `cd packages/contracts && npm test`
Expected: FAIL — la fixture valida `render.event.json` non parsa (tipo sconosciuto nel discriminated union).

- [ ] **Step 4: Crea i payload schema**

`packages/contracts/src/render.ts`:

```ts
import { z } from "zod";

export const RenderType = z.enum([
  "stark.brief", "stark.metrics", "stark.pipeline", "stark.intel", "stark.actions",
]);
export type RenderType = z.infer<typeof RenderType>;

// Payload per pannello. La envelope (events.ts) tiene payload generico;
// la HUD valida con questi schemi e mostra fallback JSON se non conformi.
export const BriefPayload = z.object({
  summary: z.string(),
  signals: z.array(z.object({
    label: z.string(), value: z.string(), trend: z.enum(["up", "down", "flat"]),
  })),
  sections: z.array(z.object({ title: z.string(), line: z.string() })),
});
export type BriefPayload = z.infer<typeof BriefPayload>;

export const MetricsPayload = z.object({
  metric: z.string(),
  unit: z.string(),
  series: z.array(z.object({ date: z.string(), value: z.number() })).min(2),
});
export type MetricsPayload = z.infer<typeof MetricsPayload>;

export const PipelinePayload = z.object({
  stages: z.array(z.object({ name: z.string(), count: z.number().int().min(0) })),
  deals: z.array(z.object({
    name: z.string(), stage: z.string(), value: z.string(), atRisk: z.boolean(),
  })),
});
export type PipelinePayload = z.infer<typeof PipelinePayload>;

export const IntelPayload = z.object({
  query: z.string(),
  hits: z.array(z.object({ source: z.string(), date: z.string(), quote: z.string() })),
});
export type IntelPayload = z.infer<typeof IntelPayload>;

export const ActionsPayload = z.object({
  focus: z.string(),
  actions: z.array(z.object({ rank: z.number().int(), title: z.string(), why: z.string() })),
});
export type ActionsPayload = z.infer<typeof ActionsPayload>;
```

- [ ] **Step 5: Aggiungi RenderEvent alla envelope**

In `packages/contracts/src/events.ts`, dopo la riga `import { z } from "zod";` aggiungi:

```ts
import { RenderType } from "./render.js";
```

Dopo il blocco `SysError` (riga ~33) aggiungi:

```ts
// — agent-core → hud (pannelli) —
export const RenderEvent = z.object({ ...base, type: z.literal("render.event"),
  id: z.string(), ts: z.number().int(), tool: z.string(), render: RenderType,
  title: z.string(), spoken: z.string(), payload: z.record(z.unknown()) });
export type RenderEvent = z.infer<typeof RenderEvent>;
```

E nel discriminated union:

```ts
export const Event = z.discriminatedUnion("type", [
  Hello, SttPartial, SttFinal, BargeIn,
  TtsSpeak, TtsCancel,
  AgentToken, AgentDone, RouteInfo, ToolCall, ToolResult, SysError,
  RenderEvent,
]);
```

- [ ] **Step 6: Esporta da index e dal codegen**

`packages/contracts/src/index.ts`:

```ts
export * from "./events.js";
export * from "./persona.js";
export * from "./render.js";
```

In `packages/contracts/scripts/gen-jsonschema.ts` aggiungi `RenderEvent` all'import da `../src/events.js` e alla mappa `definitions`:

```ts
import {
  AgentDone, AgentToken, BargeIn, Event, Hello, RenderEvent, RouteInfo,
  SttFinal, SttPartial, SysError, ToolCall, ToolResult, TtsCancel, TtsSpeak,
} from "../src/events.js";
```

```ts
  definitions: {
    Hello, SttPartial, SttFinal, BargeIn, TtsSpeak, TtsCancel,
    AgentToken, AgentDone, RouteInfo, ToolCall, ToolResult, SysError, RenderEvent,
  },
```

- [ ] **Step 7: Verifica che i test passino**

Run: `cd packages/contracts && npm test && npm run typecheck`
Expected: PASS (fixture valida parsa, invalida rifiutata, lista type completa).

- [ ] **Step 8: Rigenera il lato Python e fai girare l'anti-deriva**

Run (dalla root): `make codegen && make test-contracts`
Expected: `contracts_gen/events.py` rigenerato con classe `RenderEvent`; pytest `packages/voice/tests/test_contracts.py` PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts packages/voice/contracts_gen
git commit -m "feat(contracts): render.event envelope + payload schemas per i 5 pannelli HUD"
```

---

### Task 2: Core — doppio binario in dispatchTool

**Files:**
- Create: `packages/core/src/tools/render.ts`
- Modify: `packages/core/src/brain/real.ts:13-23` (BrainOutput) e `:226-252` (dispatchTool)
- Modify: `packages/core/src/bus/hub.ts:28-38` (BrainOutput)
- Test: `packages/core/test/renderEvent.test.ts`

- [ ] **Step 1: Scrivi il test fallente**

`packages/core/test/renderEvent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Event } from "@stark-ai/contracts";
import { RealBrain, type ModelEvent, type ModelProvider } from "../src/brain/real.js";
import { Registry } from "../src/tools/registry.js";
import { isRenderResult } from "../src/tools/render.js";

function makeProvider(): ModelProvider {
  let calls = 0;
  return async () => {
    calls += 1;
    const first = calls === 1;
    async function* run(): AsyncGenerator<ModelEvent> {
      if (first) {
        yield { type: "tool_call", id: "call-1", name: "get_daily_brief", args: {} };
      } else {
        yield { type: "token", delta: "Fatto, signore." };
      }
    }
    return run();
  };
}

describe("isRenderResult", () => {
  it("accepts the dual-output shape", () => {
    expect(isRenderResult({
      spoken: "ok",
      render: { type: "stark.brief", title: "Daily Brief", payload: { a: 1 } },
    })).toBe(true);
  });

  it("rejects plain strings and bad render types", () => {
    expect(isRenderResult("Milano: 21°C")).toBe(false);
    expect(isRenderResult({ spoken: "x", render: { type: "nope", title: "t", payload: {} } })).toBe(false);
  });
});

describe("RealBrain dual output", () => {
  it("emits render.event + tool.result from the same tool call, model sees spoken only", async () => {
    const registry = new Registry();
    registry.register({
      name: "get_daily_brief",
      description: "test brief",
      parameters: { type: "object", properties: {} },
      handler: async () => ({
        spoken: "Tre segnali oggi.",
        render: { type: "stark.brief", title: "Daily Brief", payload: { summary: "ok" } },
      }),
    });

    const provider = makeProvider();
    const brain = new RealBrain({
      registry,
      online: false,
      localProvider: provider,
      apiProvider: provider,
    });

    const events: Event[] = [];
    await brain.handle(
      { v: 1, type: "stt.final", text: "fammi il rundown della giornata", lang: "auto" },
      (event) => events.push(event),
    );

    const render = events.find((event) => event.type === "render.event");
    expect(render).toMatchObject({
      tool: "get_daily_brief",
      render: "stark.brief",
      title: "Daily Brief",
      spoken: "Tre segnali oggi.",
      payload: { summary: "ok" },
    });

    const toolResult = events.find((event) => event.type === "tool.result");
    expect(toolResult).toMatchObject({ ok: true, data: { spoken: "Tre segnali oggi." } });

    const speak = events.find((event) => event.type === "tts.speak");
    expect(speak).toMatchObject({ text: "Fatto, signore." });
  });
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `cd packages/core && npm test -- renderEvent`
Expected: FAIL with "Cannot find module '../src/tools/render.js'".

- [ ] **Step 3: Implementa il riconoscitore**

`packages/core/src/tools/render.ts`:

```ts
import { RenderType } from "@stark-ai/contracts";

export type RenderResult = {
  spoken: string;
  render: { type: RenderType; title: string; payload: Record<string, unknown> };
};

export function isRenderResult(value: unknown): value is RenderResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { spoken?: unknown; render?: unknown };
  if (typeof candidate.spoken !== "string") return false;
  if (typeof candidate.render !== "object" || candidate.render === null) return false;
  const render = candidate.render as { type?: unknown; title?: unknown; payload?: unknown };
  return (
    RenderType.safeParse(render.type).success &&
    typeof render.title === "string" &&
    typeof render.payload === "object" &&
    render.payload !== null &&
    !Array.isArray(render.payload)
  );
}
```

- [ ] **Step 4: Estendi BrainOutput e dispatchTool**

In `packages/core/src/brain/real.ts` aggiungi l'import:

```ts
import { isRenderResult } from "../tools/render.js";
```

In **entrambe** le union `BrainOutput` (`real.ts:13-23` e `hub.ts:28-38`) aggiungi la riga `| "render.event"` all'elenco dei type:

```ts
type BrainOutput = Extract<Event, {
  type:
    | "route.info"
    | "agent.token"
    | "agent.done"
    | "tts.speak"
    | "tts.cancel"
    | "tool.call"
    | "tool.result"
    | "render.event"
    | "sys.error";
}>;
```

In `dispatchTool` (real.ts), dentro il `try`, sostituisci:

```ts
      const data = await tool.handler(args);
      const ok = typeof data === "object" && data !== null && "ok" in data ? Boolean((data as { ok: unknown }).ok) : true;
      emit({ v: 1, type: "tool.result", id, ok, data });
      working.push({ role: "tool", content: stringifyToolResult(data), tool_name: name });
```

con:

```ts
      const data = await tool.handler(args);
      if (isRenderResult(data)) {
        // Doppio binario: pannello alla HUD, solo lo spoken al modello —
        // nessuno vuole sentir leggere sedici numeri ad alta voce.
        emit({
          v: 1, type: "render.event", id, ts: Date.now(), tool: name,
          render: data.render.type, title: data.render.title,
          spoken: data.spoken, payload: data.render.payload,
        });
        emit({ v: 1, type: "tool.result", id, ok: true, data: { spoken: data.spoken } });
        working.push({ role: "tool", content: data.spoken, tool_name: name });
        return;
      }
      const ok = typeof data === "object" && data !== null && "ok" in data ? Boolean((data as { ok: unknown }).ok) : true;
      emit({ v: 1, type: "tool.result", id, ok, data });
      working.push({ role: "tool", content: stringifyToolResult(data), tool_name: name });
```

- [ ] **Step 5: Verifica che passi**

Run: `cd packages/core && npm test && npm run typecheck`
Expected: PASS, incluse le suite esistenti (hub/brain).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/tools/render.ts packages/core/src/brain/real.ts packages/core/src/bus/hub.ts packages/core/test/renderEvent.test.ts
git commit -m "feat(core): dispatchTool emette render.event dal doppio output dei tool"
```

---

### Task 3: Seed data + test anti-deriva seed↔contratto

**Files:**
- Create: `seed/daily_brief.json`, `seed/metrics.json`, `seed/pipeline.json`, `seed/intel.json`, `seed/actions.json`
- Test: `packages/core/test/seedContract.test.ts`

Tutti i dati sono **fittizi** (principio del PDF: il sistema è reale, i dati demo sono inventati così niente di privato finisce in video).

- [ ] **Step 1: Scrivi il test fallente**

`packages/core/test/seedContract.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ActionsPayload, BriefPayload, IntelPayload, MetricsPayload, PipelinePayload,
} from "@stark-ai/contracts";

const seed = (name: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../seed/${name}`, import.meta.url)), "utf8"));

const MetricsSeed = z.object({
  default: z.string(),
  series: z.record(MetricsPayload),
}).refine((s) => s.default in s.series, { message: "default deve esistere in series" });

const IntelSeed = z.object({ hits: IntelPayload.shape.hits });

describe("seed files conform to render payload contracts", () => {
  it("daily_brief.json is a BriefPayload", () => {
    expect(() => BriefPayload.parse(seed("daily_brief.json"))).not.toThrow();
  });
  it("metrics.json has valid series with an existing default", () => {
    expect(() => MetricsSeed.parse(seed("metrics.json"))).not.toThrow();
  });
  it("pipeline.json is a PipelinePayload", () => {
    expect(() => PipelinePayload.parse(seed("pipeline.json"))).not.toThrow();
  });
  it("intel.json has valid hits", () => {
    expect(() => IntelSeed.parse(seed("intel.json"))).not.toThrow();
  });
  it("actions.json is an ActionsPayload", () => {
    expect(() => ActionsPayload.parse(seed("actions.json"))).not.toThrow();
  });
});
```

Nota: `zod` va aggiunto alle devDependencies di core se non risolve: `cd packages/core && npm install -D zod@^3.23.0`.

- [ ] **Step 2: Verifica che fallisca**

Run: `cd packages/core && npm test -- seedContract`
Expected: FAIL with ENOENT su `seed/daily_brief.json`.

- [ ] **Step 3: Crea i 5 seed**

`seed/daily_brief.json`:

```json
{
  "summary": "Giornata in controllo: vendite DACH in crescita, una recensione critica da gestire, outline Hashimoto in scadenza domani.",
  "signals": [
    { "label": "Vendite ieri", "value": "47 copie", "trend": "up" },
    { "label": "KENP ieri", "value": "12.480 pagine", "trend": "up" },
    { "label": "Recensioni nuove", "value": "3 (una da 2 stelle)", "trend": "down" },
    { "label": "ACOS medio", "value": "31%", "trend": "flat" }
  ],
  "sections": [
    { "title": "Pubblicazioni", "line": "Ricettario Diabetici T2 in revisione QA, capitoli 8/12 approvati." },
    { "title": "Ads", "line": "Campagna DE 'Darmgesundheit' sopra target: +18% click, ACOS stabile." },
    { "title": "Da gestire", "line": "Recensione 2 stelle su 'Hormonbalance': lamenta tabelle poco leggibili su Kindle." },
    { "title": "Scadenze", "line": "Outline Hashimoto FR da consegnare entro domani sera." }
  ]
}
```

`seed/metrics.json`:

```json
{
  "default": "kdp_sales",
  "series": {
    "kdp_sales": {
      "metric": "Vendite KDP",
      "unit": "copie/giorno",
      "series": [
        { "date": "01/06", "value": 28 }, { "date": "02/06", "value": 31 },
        { "date": "03/06", "value": 26 }, { "date": "04/06", "value": 35 },
        { "date": "05/06", "value": 38 }, { "date": "06/06", "value": 33 },
        { "date": "07/06", "value": 41 }, { "date": "08/06", "value": 44 },
        { "date": "09/06", "value": 40 }, { "date": "10/06", "value": 45 },
        { "date": "11/06", "value": 47 }, { "date": "12/06", "value": 52 }
      ]
    },
    "kenp_pages": {
      "metric": "Pagine KENP",
      "unit": "pagine/giorno",
      "series": [
        { "date": "01/06", "value": 8200 }, { "date": "02/06", "value": 9100 },
        { "date": "03/06", "value": 8800 }, { "date": "04/06", "value": 9600 },
        { "date": "05/06", "value": 10300 }, { "date": "06/06", "value": 9900 },
        { "date": "07/06", "value": 11200 }, { "date": "08/06", "value": 10800 },
        { "date": "09/06", "value": 11700 }, { "date": "10/06", "value": 12100 },
        { "date": "11/06", "value": 12480 }, { "date": "12/06", "value": 12900 }
      ]
    },
    "reviews": {
      "metric": "Recensioni cumulative",
      "unit": "totale",
      "series": [
        { "date": "01/06", "value": 214 }, { "date": "02/06", "value": 216 },
        { "date": "03/06", "value": 219 }, { "date": "04/06", "value": 221 },
        { "date": "05/06", "value": 224 }, { "date": "06/06", "value": 227 },
        { "date": "07/06", "value": 229 }, { "date": "08/06", "value": 233 },
        { "date": "09/06", "value": 236 }, { "date": "10/06", "value": 240 },
        { "date": "11/06", "value": 243 }, { "date": "12/06", "value": 247 }
      ]
    }
  }
}
```

`seed/pipeline.json`:

```json
{
  "stages": [
    { "name": "Ricerca", "count": 2 },
    { "name": "Outline", "count": 1 },
    { "name": "Scrittura", "count": 2 },
    { "name": "Revisione", "count": 1 },
    { "name": "Pubblicato", "count": 14 }
  ],
  "deals": [
    { "name": "Anxiety Toolkit (EN)", "stage": "Ricerca", "value": "stima 900€/anno", "atRisk": false },
    { "name": "Nicchia KDP.de — Schlaf", "stage": "Ricerca", "value": "da validare", "atRisk": false },
    { "name": "Hashimoto FR", "stage": "Outline", "value": "stima 1.400€/anno", "atRisk": true },
    { "name": "Ricettario Diabetici T2", "stage": "Scrittura", "value": "stima 2.100€/anno", "atRisk": false },
    { "name": "Darmgesundheit Vol. 2", "stage": "Scrittura", "value": "stima 1.700€/anno", "atRisk": false },
    { "name": "Hormonbalance — fix tabelle", "stage": "Revisione", "value": "retention recensioni", "atRisk": true }
  ]
}
```

`seed/intel.json`:

```json
{
  "hits": [
    { "source": "QA Pepper", "date": "09/06", "quote": "Le tabelle del capitolo 5 del Ricettario vanno rifatte: su Kindle Paperwhite si spezzano male." },
    { "source": "Sessione JARVIS", "date": "08/06", "quote": "Helium 10: 'hashimoto ernährung' regge 4.400 ricerche/mese con competizione media — finestra buona." },
    { "source": "Brief Cowork", "date": "07/06", "quote": "Per il mercato FR il sottotitolo deve promettere un protocollo in 30 giorni, non teoria." },
    { "source": "QA Pepper", "date": "05/06", "quote": "La copertina di Darmgesundheit Vol. 2 vince il thumbnail test contro le tre varianti Ideogram." },
    { "source": "Sessione FRIDAY", "date": "03/06", "quote": "L'ACOS sopra 35% sulle campagne FR non è sostenibile: tagliare le keyword generiche." },
    { "source": "Nota Ricky", "date": "02/06", "quote": "Valutare bundle dei 3 libri Mia Meyer per il Q4: margine migliore del lancio singolo." }
  ]
}
```

`seed/actions.json`:

```json
{
  "focus": "Chiudere l'outline Hashimoto FR prima che la finestra keyword si raffreddi.",
  "actions": [
    { "rank": 1, "title": "Consegnare outline Hashimoto FR", "why": "Scadenza domani sera; la nicchia regge 4.400 ricerche/mese." },
    { "rank": 2, "title": "Fix tabelle Hormonbalance", "why": "Recensione 2 stelle attiva: ogni giorno di ritardo pesa sul ranking." },
    { "rank": 3, "title": "Approvare capitoli 9-10 Ricettario", "why": "QA Pepper in attesa; sblocca la pipeline di scrittura." },
    { "rank": 4, "title": "Tagliare keyword generiche campagne FR", "why": "ACOS oltre 35% non sostenibile, deciso in sessione FRIDAY." }
  ]
}
```

- [ ] **Step 4: Verifica che passi**

Run: `cd packages/core && npm test -- seedContract`
Expected: PASS (5 test verdi).

- [ ] **Step 5: Commit**

```bash
git add seed packages/core/test/seedContract.test.ts packages/core/package.json packages/core/package-lock.json
git commit -m "feat(seed): dati demo fittizi per i 5 pannelli + test anti-deriva seed-contratto"
```

---

### Task 4: Data layer — demo mode e fallback seed

**Files:**
- Create: `packages/core/src/data/aiosData.ts`
- Test: `packages/core/test/aiosData.test.ts`

- [ ] **Step 1: Scrivi il test fallente**

`packages/core/test/aiosData.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { loadDataset } from "../src/data/aiosData.js";

const originalDemoMode = process.env.STARK_DEMO_MODE;

afterEach(() => {
  if (originalDemoMode === undefined) delete process.env.STARK_DEMO_MODE;
  else process.env.STARK_DEMO_MODE = originalDemoMode;
});

describe("aiosData", () => {
  it("demo mode (default) reads from seed", async () => {
    delete process.env.STARK_DEMO_MODE;
    const { source, data } = await loadDataset("brief");
    expect(source).toBe("seed");
    expect(data).toHaveProperty("summary");
  });

  it("live mode without live adapters falls back to seed — panel never blank", async () => {
    process.env.STARK_DEMO_MODE = "0";
    const { source, data } = await loadDataset("pipeline");
    expect(source).toBe("seed");
    expect(data).toHaveProperty("stages");
  });

  it("loads every dataset", async () => {
    for (const dataset of ["brief", "metrics", "pipeline", "intel", "actions"] as const) {
      const { data } = await loadDataset(dataset);
      expect(Object.keys(data).length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `cd packages/core && npm test -- aiosData`
Expected: FAIL with "Cannot find module '../src/data/aiosData.js'".

- [ ] **Step 3: Implementa**

`packages/core/src/data/aiosData.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Unico modulo che tocca le sorgenti dati AIOS: i tool restano puliti.
const here = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = process.env.STARK_SEED_DIR ?? path.resolve(here, "../../../../seed");

const SEED_FILES = {
  brief: "daily_brief.json",
  metrics: "metrics.json",
  pipeline: "pipeline.json",
  intel: "intel.json",
  actions: "actions.json",
} as const;

export type AiosDataset = keyof typeof SEED_FILES;
export type AiosSource = "seed" | "live";

const demoMode = (): boolean => process.env.STARK_DEMO_MODE !== "0";

async function readSeed(dataset: AiosDataset): Promise<Record<string, unknown>> {
  const raw = await readFile(path.join(SEED_DIR, SEED_FILES[dataset]), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

// Gli adapter live (DB workspace reali) atterrano qui; null = "usa il seed".
async function readLive(_dataset: AiosDataset): Promise<Record<string, unknown> | null> {
  return null;
}

export async function loadDataset(
  dataset: AiosDataset,
): Promise<{ source: AiosSource; data: Record<string, unknown> }> {
  if (!demoMode()) {
    try {
      const live = await readLive(dataset);
      if (live && Object.keys(live).length > 0) return { source: "live", data: live };
    } catch {
      // live fallita: si scende al seed, il pannello non resta mai vuoto
    }
  }
  return { source: "seed", data: await readSeed(dataset) };
}
```

- [ ] **Step 4: Verifica che passi**

Run: `cd packages/core && npm test -- aiosData`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/data/aiosData.ts packages/core/test/aiosData.test.ts
git commit -m "feat(core): data layer AIOS con STARK_DEMO_MODE e fallback seed"
```

---

### Task 5: I cinque tool dati + registrazione

**Files:**
- Create: `packages/core/src/tools/builtins/aios/getDailyBrief.ts`
- Create: `packages/core/src/tools/builtins/aios/queryMetrics.ts`
- Create: `packages/core/src/tools/builtins/aios/getPipeline.ts`
- Create: `packages/core/src/tools/builtins/aios/searchIntel.ts`
- Create: `packages/core/src/tools/builtins/aios/planMyDay.ts`
- Create: `packages/core/src/tools/builtins/aios/index.ts`
- Modify: `packages/core/src/tools/runtime.ts:20-32`
- Test: `packages/core/test/aiosTools.test.ts`

- [ ] **Step 1: Scrivi il test fallente**

`packages/core/test/aiosTools.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aiosTools } from "../src/tools/builtins/aios/index.js";
import { isRenderResult } from "../src/tools/render.js";
import { Registry } from "../src/tools/registry.js";
import { loadConfig } from "../src/config.js";
import { registerBuiltInTools } from "../src/tools/runtime.js";

const byName = (name: string) => {
  const tool = aiosTools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} non trovato`);
  return tool;
};

describe("aios tools — doppio output", () => {
  it("expose the five PDF tools", () => {
    expect(aiosTools.map((t) => t.name).sort()).toEqual([
      "get_daily_brief", "get_pipeline", "plan_my_day", "query_metrics", "search_intel",
    ]);
  });

  it("get_daily_brief returns a stark.brief render result", async () => {
    const result = await byName("get_daily_brief").handler({});
    expect(isRenderResult(result)).toBe(true);
    expect((result as { render: { type: string } }).render.type).toBe("stark.brief");
  });

  it("query_metrics falls back to the default series on unknown metric", async () => {
    const result = await byName("query_metrics").handler({ metric: "non_esiste" });
    expect(isRenderResult(result)).toBe(true);
    const payload = (result as { render: { payload: { metric: string } } }).render.payload;
    expect(payload.metric).toBe("Vendite KDP");
  });

  it("search_intel filters hits by query", async () => {
    const result = await byName("search_intel").handler({ query: "tabelle" });
    const payload = (result as { render: { payload: { hits: unknown[]; query: string } } }).render.payload;
    expect(payload.query).toBe("tabelle");
    expect(payload.hits.length).toBeGreaterThan(0);
    expect(payload.hits.length).toBeLessThanOrEqual(6);
  });

  it("get_pipeline and plan_my_day return their panel types", async () => {
    const pipeline = await byName("get_pipeline").handler({});
    const plan = await byName("plan_my_day").handler({});
    expect((pipeline as { render: { type: string } }).render.type).toBe("stark.pipeline");
    expect((plan as { render: { type: string } }).render.type).toBe("stark.actions");
  });

  it("registerBuiltInTools registers all five", () => {
    const registry = new Registry();
    registerBuiltInTools(registry, loadConfig({}));
    for (const name of ["get_daily_brief", "query_metrics", "get_pipeline", "search_intel", "plan_my_day"]) {
      expect(registry.get(name)).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `cd packages/core && npm test -- aiosTools`
Expected: FAIL with "Cannot find module .../builtins/aios/index.js".

- [ ] **Step 3: Implementa i cinque tool**

`packages/core/src/tools/builtins/aios/getDailyBrief.ts`:

```ts
import type { ToolDef } from "../../../llm/types.js";
import { loadDataset } from "../../../data/aiosData.js";
import type { RenderResult } from "../../render.js";

export const getDailyBrief: ToolDef = {
  name: "get_daily_brief",
  description:
    "Briefing del giorno: sintesi, segnali chiave (vendite, KENP, recensioni, ads) e sezioni operative. Usa quando l'utente chiede 'brief', 'rundown', 'aggiornami', 'come va oggi'.",
  parameters: { type: "object", properties: {}, required: [] },
  handler: async (): Promise<RenderResult> => {
    const { data } = await loadDataset("brief");
    return {
      spoken: typeof data.summary === "string" ? data.summary : "Briefing pronto sul pannello.",
      render: { type: "stark.brief", title: "Daily Brief", payload: data },
    };
  },
};
```

`packages/core/src/tools/builtins/aios/queryMetrics.ts`:

```ts
import type { ToolDef } from "../../../llm/types.js";
import { loadDataset } from "../../../data/aiosData.js";
import type { RenderResult } from "../../render.js";

type Series = { metric: string; unit: string; series: Array<{ date: string; value: number }> };
type MetricsData = { default: string; series: Record<string, Series> };

export const queryMetrics: ToolDef = {
  name: "query_metrics",
  description:
    "Trend di una metrica nel tempo come grafico. Metriche: 'kdp_sales' (vendite), 'kenp_pages' (pagine lette), 'reviews' (recensioni). Usa per 'come vanno le vendite', 'trend', 'andamento'.",
  parameters: {
    type: "object",
    properties: {
      metric: { type: "string", enum: ["kdp_sales", "kenp_pages", "reviews"] },
    },
    required: [],
  },
  handler: async (args): Promise<RenderResult> => {
    const { data } = await loadDataset("metrics");
    const metrics = data as unknown as MetricsData;
    const key = typeof args.metric === "string" && args.metric in metrics.series
      ? args.metric
      : metrics.default;
    const chosen = metrics.series[key];
    const first = chosen.series[0].value;
    const last = chosen.series[chosen.series.length - 1].value;
    const deltaPct = first === 0 ? 0 : Math.round(((last - first) / first) * 100);
    const direction = deltaPct >= 0 ? "su" : "giù";
    return {
      spoken: `${chosen.metric}: ${direction} del ${Math.abs(deltaPct)}% nel periodo, ultimo valore ${last} ${chosen.unit}. Dettaglio sul pannello.`,
      render: { type: "stark.metrics", title: chosen.metric, payload: chosen as unknown as Record<string, unknown> },
    };
  },
};
```

`packages/core/src/tools/builtins/aios/getPipeline.ts`:

```ts
import type { ToolDef } from "../../../llm/types.js";
import { loadDataset } from "../../../data/aiosData.js";
import type { RenderResult } from "../../render.js";

export const getPipeline: ToolDef = {
  name: "get_pipeline",
  description:
    "Pipeline dei libri KDP per fase (ricerca, outline, scrittura, revisione, pubblicato) con i progetti a rischio. Usa per 'pipeline', 'a che punto sono i libri', 'cosa è a rischio'.",
  parameters: { type: "object", properties: {}, required: [] },
  handler: async (): Promise<RenderResult> => {
    const { data } = await loadDataset("pipeline");
    const deals = Array.isArray(data.deals) ? (data.deals as Array<{ name?: unknown; atRisk?: unknown }>) : [];
    const atRisk = deals.filter((deal) => deal.atRisk === true);
    const spoken = atRisk.length > 0
      ? `${deals.length} progetti in pipeline, ${atRisk.length} a rischio: ${atRisk.map((deal) => String(deal.name)).join(", ")}. Dettaglio sul pannello.`
      : `${deals.length} progetti in pipeline, nessuno a rischio. Dettaglio sul pannello.`;
    return { spoken, render: { type: "stark.pipeline", title: "Pipeline Libri", payload: data } };
  },
};
```

`packages/core/src/tools/builtins/aios/searchIntel.ts`:

```ts
import type { ToolDef } from "../../../llm/types.js";
import { loadDataset } from "../../../data/aiosData.js";
import type { RenderResult } from "../../render.js";

const MAX_HITS = 6;

export const searchIntel: ToolDef = {
  name: "search_intel",
  description:
    "Cerca cosa è stato detto su un argomento in note, sessioni QA e brief recenti. Usa per 'cosa è stato detto su X', 'cosa avevamo deciso su X', 'note su X'.",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "argomento da cercare" } },
    required: ["query"],
  },
  handler: async (args): Promise<RenderResult> => {
    const query = String(args.query ?? "").trim();
    const { data } = await loadDataset("intel");
    const all = Array.isArray(data.hits)
      ? (data.hits as Array<{ source: string; date: string; quote: string }>)
      : [];
    const needle = query.toLowerCase();
    const hits = (needle
      ? all.filter((hit) =>
          hit.quote.toLowerCase().includes(needle) || hit.source.toLowerCase().includes(needle))
      : all
    ).slice(0, MAX_HITS);
    const spoken = hits.length > 0
      ? `Trovati ${hits.length} riferimenti a ${query || "tutto"}: il più recente da ${hits[0].source}. Timeline sul pannello.`
      : `Nessun riferimento trovato per ${query}. Mostro le note recenti sul pannello.`;
    return {
      spoken,
      render: {
        type: "stark.intel",
        title: `Intel: ${query || "note recenti"}`,
        payload: { query, hits: hits.length > 0 ? hits : all.slice(0, MAX_HITS) },
      },
    };
  },
};
```

`packages/core/src/tools/builtins/aios/planMyDay.ts`:

```ts
import type { ToolDef } from "../../../llm/types.js";
import { loadDataset } from "../../../data/aiosData.js";
import type { RenderResult } from "../../render.js";

export const planMyDay: ToolDef = {
  name: "plan_my_day",
  description:
    "Lista prioritizzata delle azioni di oggi con motivazione. Usa per 'su cosa lavoro oggi', 'priorità', 'pianifica la giornata'.",
  parameters: { type: "object", properties: {}, required: [] },
  handler: async (): Promise<RenderResult> => {
    const { data } = await loadDataset("actions");
    const actions = Array.isArray(data.actions)
      ? (data.actions as Array<{ title?: unknown }>)
      : [];
    const focus = typeof data.focus === "string" ? data.focus : "Priorità sul pannello.";
    const first = actions[0]?.title;
    const spoken = first
      ? `${focus} Prima azione: ${String(first)}. Lista completa sul pannello.`
      : focus;
    return { spoken, render: { type: "stark.actions", title: "Piano di Oggi", payload: data } };
  },
};
```

`packages/core/src/tools/builtins/aios/index.ts`:

```ts
import type { ToolDef } from "../../../llm/types.js";
import { getDailyBrief } from "./getDailyBrief.js";
import { queryMetrics } from "./queryMetrics.js";
import { getPipeline } from "./getPipeline.js";
import { searchIntel } from "./searchIntel.js";
import { planMyDay } from "./planMyDay.js";

export const aiosTools: ToolDef[] = [getDailyBrief, queryMetrics, getPipeline, searchIntel, planMyDay];
```

- [ ] **Step 4: Registra nel runtime**

In `packages/core/src/tools/runtime.ts` aggiungi l'import:

```ts
import { aiosTools } from "./builtins/aios/index.js";
```

e cambia il loop di registrazione:

```ts
  for (const tool of [getTime, getWeather, readFileTool, ingestCerebro, bookStatus, runPhase, newBook, kbIndex, kbSearch, ...aiosTools]) {
    registry.register(tool);
  }
```

- [ ] **Step 5: Verifica che passi**

Run: `cd packages/core && npm test && npm run typecheck`
Expected: PASS (aiosTools + tutte le suite esistenti).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/tools/builtins/aios packages/core/src/tools/runtime.ts packages/core/test/aiosTools.test.ts
git commit -m "feat(core): cinque tool dati AIOS con doppio output spoken+render"
```

---

### Task 6: UI — dipendenza contracts + hook useRenderEvents

**Files:**
- Modify: `packages/ui/package.json` (dependencies)
- Create: `packages/ui/src/hooks/useRenderEvents.ts`

- [ ] **Step 1: Aggiungi la dipendenza contracts**

Run: `cd packages/ui && npm install ../contracts`
Expected: `"@stark-ai/contracts": "file:../contracts"` appare in dependencies. La UI importa gli stessi schemi Zod del core: zero deriva possibile sul contratto render.

- [ ] **Step 2: Implementa l'hook**

`packages/ui/src/hooks/useRenderEvents.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { RenderEvent } from "@stark-ai/contracts";

const HUB_URL = "ws://127.0.0.1:7710";
const RETRY_MS = 3000;

export type { RenderEvent };

export function useRenderEvents(): { event: RenderEvent | null; clear: () => void } {
  const [event, setEvent] = useState<RenderEvent | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;

    const connect = () => {
      const socket = new WebSocket(HUB_URL);
      socketRef.current = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({ v: 1, type: "hello", role: "hud", client: "friday-ui-stage" }));
      };
      socket.onmessage = (message) => {
        try {
          const parsed = RenderEvent.safeParse(JSON.parse(String(message.data)));
          if (parsed.success) setEvent(parsed.data);
        } catch {
          // frame non-JSON dal hub: ignorato
        }
      };
      socket.onclose = () => {
        if (!disposed) timer = window.setTimeout(connect, RETRY_MS);
      };
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      socketRef.current?.close();
    };
  }, []);

  const clear = useCallback(() => setEvent(null), []);
  return { event, clear };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/ui && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/package.json packages/ui/package-lock.json packages/ui/src/hooks/useRenderEvents.ts
git commit -m "feat(ui): hook useRenderEvents collegato al hub con contratto condiviso"
```

---

### Task 7: UI — HudStage, BriefCard e integrazione in AppShell

**Files:**
- Create: `packages/ui/src/components/HudStage/HudStage.tsx`
- Create: `packages/ui/src/components/HudStage/HudStage.module.scss`
- Create: `packages/ui/src/components/panels/useTypeIn.ts`
- Create: `packages/ui/src/components/panels/BriefCard.tsx`
- Create: `packages/ui/src/components/panels/panels.module.scss`
- Modify: `packages/ui/src/components/AppShell/AppShell.tsx:41-45`

- [ ] **Step 1: Hook type-in (il "si scrive da solo" del PDF)**

`packages/ui/src/components/panels/useTypeIn.ts`:

```ts
import { useEffect, useState } from "react";

export function useTypeIn(text: string, charsPerSecond = 45): { shown: string; done: boolean } {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
    const id = window.setInterval(() => {
      setCount((current) => {
        if (current >= text.length) {
          window.clearInterval(id);
          return current;
        }
        return current + 1;
      });
    }, 1000 / charsPerSecond);
    return () => window.clearInterval(id);
  }, [text, charsPerSecond]);

  return { shown: text.slice(0, count), done: count >= text.length };
}
```

- [ ] **Step 2: BriefCard**

`packages/ui/src/components/panels/BriefCard.tsx`:

```tsx
import { BriefPayload } from "@stark-ai/contracts";
import { useTypeIn } from "./useTypeIn";
import styles from "./panels.module.scss";

export function BriefCard({ payload }: { payload: Record<string, unknown> }) {
  const parsed = BriefPayload.safeParse(payload);
  if (!parsed.success) {
    return <pre className={styles.fallback}>{JSON.stringify(payload, null, 2)}</pre>;
  }
  return <BriefBody data={parsed.data} />;
}

function BriefBody({ data }: { data: BriefPayload }) {
  const { shown, done } = useTypeIn(data.summary);
  return (
    <div className={styles.panel}>
      <p className={styles.summary}>
        {shown}
        {!done && <span className={styles.cursor}>▌</span>}
      </p>
      <div className={styles.chips}>
        {data.signals.map((signal, index) => (
          <span
            key={signal.label}
            className={`${styles.chip} ${done ? styles.chipIn : ""}`}
            style={{ animationDelay: `${index * 120}ms` }}
          >
            <span className={styles.chipLabel}>{signal.label}</span>
            <span className={styles.chipValue}>
              {signal.value} {signal.trend === "up" ? "▲" : signal.trend === "down" ? "▼" : "◆"}
            </span>
          </span>
        ))}
      </div>
      <ul className={styles.sections}>
        {data.sections.map((section, index) => (
          <li
            key={section.title}
            className={done ? styles.lineIn : styles.lineHidden}
            style={{ animationDelay: `${300 + index * 160}ms` }}
          >
            <span className={styles.sectionTitle}>{section.title}</span> {section.line}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: SCSS condiviso dei pannelli**

`packages/ui/src/components/panels/panels.module.scss`:

```scss
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  height: 100%;
  overflow-y: auto;
  font-family: var(--font-mono);
  color: var(--color-text);
}

.fallback {
  font-size: 11px;
  color: var(--color-text-dim);
  overflow: auto;
  white-space: pre-wrap;
}

.summary {
  font-size: 16px;
  line-height: 1.5;
  color: var(--color-text-bright);
  text-shadow: var(--glow-cyan);
  min-height: 3em;
  margin: 0;
}

.cursor { animation: blink 0.7s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }

.chips { display: flex; flex-wrap: wrap; gap: var(--space-sm); }

.chip {
  border: 1px solid var(--color-border);
  border-radius: var(--panel-radius);
  padding: var(--space-xs) var(--space-sm);
  font-size: 11px;
  opacity: 0;
  display: inline-flex;
  gap: var(--space-sm);
}

.chipIn { animation: fadeUp 0.4s ease forwards; }
.chipLabel { color: var(--color-text-dim); }
.chipValue { color: var(--color-bright); }

.sections { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-sm); }
.lineHidden { opacity: 0; }
.lineIn { opacity: 0; animation: fadeUp 0.45s ease forwards; font-size: 13px; line-height: 1.45; }
.sectionTitle { color: var(--color-cyan); text-transform: uppercase; margin-right: var(--space-sm); }

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* — metrics — */
.metricName { font-size: 12px; color: var(--color-text-dim); text-transform: uppercase; }
.chartSvg { width: 100%; height: auto; }
.chartLine {
  fill: none;
  stroke: var(--color-cyan);
  stroke-width: 2;
  filter: drop-shadow(0 0 6px rgba(0, 212, 245, 0.8));
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: draw 1.6s ease forwards;
}
@keyframes draw { to { stroke-dashoffset: 0; } }
/* Asse date come layer HTML separato: le label restano nitide quando il grafico si stira. */
.axis { display: flex; justify-content: space-between; font-size: 10px; color: var(--color-text-dim); }

/* — pipeline — */
.stageRow { display: grid; grid-template-columns: 110px 1fr 36px; align-items: center; gap: var(--space-sm); font-size: 12px; }
.stageBarTrack { background: rgba(0, 212, 245, 0.08); height: 14px; border-radius: var(--panel-radius); overflow: hidden; }
.stageBar {
  height: 100%;
  background: var(--color-cyan-dim);
  box-shadow: var(--glow-cyan);
  transform-origin: left;
  animation: growBar 0.7s ease forwards;
}
@keyframes growBar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.dealRow { display: flex; justify-content: space-between; gap: var(--space-sm); font-size: 12px; padding: var(--space-xs) 0; border-bottom: 1px solid var(--color-border); }
.dealAtRisk { color: #ff5d5d; animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.45; } }

/* — intel — */
.timeline { list-style: none; margin: 0; padding: 0 0 0 var(--space-lg); border-left: 1px solid var(--color-border-bright); display: flex; flex-direction: column; gap: var(--space-md); }
.timelineItem { position: relative; opacity: 0; animation: fadeUp 0.45s ease forwards; font-size: 13px; line-height: 1.45; }
.timelineItem::before {
  content: "";
  position: absolute;
  left: calc(-1 * var(--space-lg) - 4px);
  top: 5px;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--color-cyan);
  box-shadow: var(--glow-cyan);
}
.timelineMeta { color: var(--color-text-dim); font-size: 11px; }

/* — actions — */
.focus { font-size: 14px; color: var(--color-text-bright); text-shadow: var(--glow-cyan); margin: 0; }
.actionRow { display: grid; grid-template-columns: 28px 1fr; gap: var(--space-sm); opacity: 0; animation: fadeUp 0.45s ease forwards; font-size: 13px; }
.actionRank { color: var(--color-cyan); text-shadow: var(--glow-cyan); }
.actionWhy { color: var(--color-text-dim); font-size: 11px; }
```

- [ ] **Step 4: HudStage (router + idle)**

`packages/ui/src/components/HudStage/HudStage.tsx`:

```tsx
import type { ReactNode } from "react";
import { useRenderEvents, type RenderEvent } from "../../hooks/useRenderEvents";
import { BriefCard } from "../panels/BriefCard";
import styles from "./HudStage.module.scss";

export function HudStage({ idle }: { idle: ReactNode }) {
  const { event, clear } = useRenderEvents();
  if (!event) return <>{idle}</>;
  return (
    // key sull'event id: il pannello rimonta e le animazioni ripartono a ogni risposta
    <div className={styles.stage} key={event.id}>
      <header className={styles.stageHeader}>
        <span className={styles.stageTitle}>{event.title}</span>
        <button type="button" className={styles.stageClose} onClick={clear}>
          CHIUDI
        </button>
      </header>
      <div className={styles.stageBody}>
        <PanelRouter event={event} />
      </div>
    </div>
  );
}

function PanelRouter({ event }: { event: RenderEvent }) {
  switch (event.render) {
    case "stark.brief":
      return <BriefCard payload={event.payload} />;
    default:
      return <pre className={styles.fallback}>{JSON.stringify(event.payload, null, 2)}</pre>;
  }
}
```

(I case `stark.metrics`, `stark.pipeline`, `stark.intel`, `stark.actions` arrivano nei Task 8-9; fino ad allora il fallback JSON garantisce pannello mai vuoto.)

`packages/ui/src/components/HudStage/HudStage.module.scss`:

```scss
.stage {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: var(--font-mono);
  animation: stageIn 0.35s ease;
}

@keyframes stageIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.stageHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--color-border-bright);
  margin-bottom: var(--space-md);
}

.stageTitle {
  color: var(--color-bright);
  text-shadow: var(--glow-cyan);
  text-transform: uppercase;
  letter-spacing: 2px;
  font-size: 14px;
}

.stageClose {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-dim);
  font-family: var(--font-mono);
  font-size: 10px;
  padding: var(--space-xs) var(--space-sm);
  cursor: pointer;

  &:hover { color: var(--color-bright); border-color: var(--color-border-bright); }
}

.stageBody { flex: 1; min-height: 0; overflow-y: auto; }

.fallback { font-size: 11px; color: var(--color-text-dim); white-space: pre-wrap; }
```

- [ ] **Step 5: Integra nel centro dell'AppShell**

In `packages/ui/src/components/AppShell/AppShell.tsx` aggiungi l'import:

```tsx
import { HudStage } from "../HudStage/HudStage";
```

e sostituisci il blocco `<main>`:

```tsx
      <main className={styles.center}>
        <HudPanel glowIntensity="strong" className={styles.voicePanel}>
          <HudStage idle={<VoicePanel />} />
        </HudPanel>
      </main>
```

(L'arc reactor di UI.png resta lo stato idle; il pannello dati lo sostituisce all'arrivo di un render event e "CHIUDI" lo riporta.)

- [ ] **Step 6: Typecheck**

Run: `cd packages/ui && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/HudStage packages/ui/src/components/panels packages/ui/src/components/AppShell/AppShell.tsx
git commit -m "feat(ui): HudStage con routing render-event e pannello BriefCard type-in"
```

---

### Task 8: UI — MetricsChart e PipelineFunnel

**Files:**
- Create: `packages/ui/src/components/panels/MetricsChart.tsx`
- Create: `packages/ui/src/components/panels/PipelineFunnel.tsx`
- Modify: `packages/ui/src/components/HudStage/HudStage.tsx` (PanelRouter)

- [ ] **Step 1: MetricsChart (la linea si disegna da sola)**

`packages/ui/src/components/panels/MetricsChart.tsx`:

```tsx
import { MetricsPayload } from "@stark-ai/contracts";
import styles from "./panels.module.scss";

const W = 560;
const H = 220;
const PAD = 18;

export function MetricsChart({ payload }: { payload: Record<string, unknown> }) {
  const parsed = MetricsPayload.safeParse(payload);
  if (!parsed.success) {
    return <pre className={styles.fallback}>{JSON.stringify(payload, null, 2)}</pre>;
  }
  const { metric, unit, series } = parsed.data;

  const min = Math.min(...series.map((point) => point.value));
  const max = Math.max(...series.map((point) => point.value));
  const span = Math.max(1, max - min);
  const x = (index: number) => PAD + (index * (W - 2 * PAD)) / (series.length - 1);
  const y = (value: number) => H - PAD - ((value - min) / span) * (H - 2 * PAD);
  const d = series
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`)
    .join(" ");

  return (
    <div className={styles.panel}>
      <div className={styles.metricName}>
        {metric} ({unit}) · min {min} · max {max}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg} role="img" aria-label={metric}>
        {/* pathLength=1 normalizza la lunghezza: dash 1→0 disegna la linea senza misurare il path */}
        <path d={d} pathLength={1} className={styles.chartLine} />
      </svg>
      <div className={styles.axis}>
        {series.map((point) => (
          <span key={point.date}>{point.date}</span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: PipelineFunnel (barre che crescono, rischio che pulsa)**

`packages/ui/src/components/panels/PipelineFunnel.tsx`:

```tsx
import { PipelinePayload } from "@stark-ai/contracts";
import styles from "./panels.module.scss";

export function PipelineFunnel({ payload }: { payload: Record<string, unknown> }) {
  const parsed = PipelinePayload.safeParse(payload);
  if (!parsed.success) {
    return <pre className={styles.fallback}>{JSON.stringify(payload, null, 2)}</pre>;
  }
  const { stages, deals } = parsed.data;
  const maxCount = Math.max(1, ...stages.map((stage) => stage.count));

  return (
    <div className={styles.panel}>
      <div>
        {stages.map((stage, index) => (
          <div className={styles.stageRow} key={stage.name}>
            <span>{stage.name}</span>
            <div className={styles.stageBarTrack}>
              <div
                className={styles.stageBar}
                style={{ width: `${(stage.count / maxCount) * 100}%`, animationDelay: `${index * 110}ms` }}
              />
            </div>
            <span>{stage.count}</span>
          </div>
        ))}
      </div>
      <div>
        {deals.map((deal) => (
          <div className={styles.dealRow} key={deal.name}>
            <span className={deal.atRisk ? styles.dealAtRisk : undefined}>
              {deal.atRisk ? "⚠ " : ""}{deal.name}
            </span>
            <span>{deal.stage} · {deal.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Aggancia al router**

In `packages/ui/src/components/HudStage/HudStage.tsx` aggiungi gli import:

```tsx
import { MetricsChart } from "../panels/MetricsChart";
import { PipelineFunnel } from "../panels/PipelineFunnel";
```

e i case nel `PanelRouter`:

```tsx
    case "stark.metrics":
      return <MetricsChart payload={event.payload} />;
    case "stark.pipeline":
      return <PipelineFunnel payload={event.payload} />;
```

- [ ] **Step 4: Typecheck**

Run: `cd packages/ui && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/panels/MetricsChart.tsx packages/ui/src/components/panels/PipelineFunnel.tsx packages/ui/src/components/HudStage/HudStage.tsx
git commit -m "feat(ui): pannelli MetricsChart (linea autodisegnante) e PipelineFunnel"
```

---

### Task 9: UI — IntelTimeline, ActionList e riga [render] nel debug

**Files:**
- Create: `packages/ui/src/components/panels/IntelTimeline.tsx`
- Create: `packages/ui/src/components/panels/ActionList.tsx`
- Modify: `packages/ui/src/components/HudStage/HudStage.tsx` (PanelRouter)
- Modify: `packages/ui/src/components/OfflineDebugView/OfflineDebugView.tsx` (`appendTranscript`)

- [ ] **Step 1: IntelTimeline**

`packages/ui/src/components/panels/IntelTimeline.tsx`:

```tsx
import { IntelPayload } from "@stark-ai/contracts";
import styles from "./panels.module.scss";

export function IntelTimeline({ payload }: { payload: Record<string, unknown> }) {
  const parsed = IntelPayload.safeParse(payload);
  if (!parsed.success) {
    return <pre className={styles.fallback}>{JSON.stringify(payload, null, 2)}</pre>;
  }
  const { hits } = parsed.data;
  return (
    <div className={styles.panel}>
      <ul className={styles.timeline}>
        {hits.map((hit, index) => (
          <li
            className={styles.timelineItem}
            key={`${hit.source}-${hit.date}-${index}`}
            style={{ animationDelay: `${index * 140}ms` }}
          >
            <div className={styles.timelineMeta}>{hit.date} · {hit.source}</div>
            {hit.quote}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: ActionList**

`packages/ui/src/components/panels/ActionList.tsx`:

```tsx
import { ActionsPayload } from "@stark-ai/contracts";
import styles from "./panels.module.scss";

export function ActionList({ payload }: { payload: Record<string, unknown> }) {
  const parsed = ActionsPayload.safeParse(payload);
  if (!parsed.success) {
    return <pre className={styles.fallback}>{JSON.stringify(payload, null, 2)}</pre>;
  }
  const { focus, actions } = parsed.data;
  return (
    <div className={styles.panel}>
      <p className={styles.focus}>{focus}</p>
      <div>
        {actions.map((action, index) => (
          <div className={styles.actionRow} key={action.rank} style={{ animationDelay: `${index * 150}ms` }}>
            <span className={styles.actionRank}>{String(action.rank).padStart(2, "0")}</span>
            <span>
              {action.title}
              <div className={styles.actionWhy}>{action.why}</div>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Completa il router**

In `packages/ui/src/components/HudStage/HudStage.tsx` aggiungi gli import:

```tsx
import { IntelTimeline } from "../panels/IntelTimeline";
import { ActionList } from "../panels/ActionList";
```

e i case:

```tsx
    case "stark.intel":
      return <IntelTimeline payload={event.payload} />;
    case "stark.actions":
      return <ActionList payload={event.payload} />;
```

- [ ] **Step 4: Riga [render] nell'Offline Debug**

In `packages/ui/src/components/OfflineDebugView/OfflineDebugView.tsx`, dentro `appendTranscript`, dopo il blocco `route.info` aggiungi:

```ts
  if (event.type === "render.event") {
    const title = textValue((event as { title?: unknown }).title);
    const render = textValue((event as { render?: unknown }).render);
    return [...lines, { id: Date.now() + lines.length, type: "route", text: `render · ${render} · ${title}` }];
  }
```

- [ ] **Step 5: Typecheck**

Run: `cd packages/ui && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/panels/IntelTimeline.tsx packages/ui/src/components/panels/ActionList.tsx packages/ui/src/components/HudStage/HudStage.tsx packages/ui/src/components/OfflineDebugView/OfflineDebugView.tsx
git commit -m "feat(ui): pannelli IntelTimeline e ActionList, render event nel debug view"
```

---

### Task 10: start.sh, docs, runbook e verifica end-to-end

**Files:**
- Modify: `start.sh:39-43` (export env)
- Create: `seed/DEMO_RUNBOOK.md`
- Modify: `docs/QUICKSTART.md` (sezione pannelli)

- [ ] **Step 1: Demo mode di default in start.sh**

In `start.sh`, dopo la riga `export TOKEN_SERVER_URL=...` aggiungi:

```bash
export STARK_DEMO_MODE="${STARK_DEMO_MODE:-1}"
```

- [ ] **Step 2: Runbook on-camera**

`seed/DEMO_RUNBOOK.md`:

```markdown
# Demo Runbook — pannelli HUD

Avvio: `./start.sh` → http://localhost:5173 → Engage → consenti il microfono.
`STARK_DEMO_MODE=1` (default): i pannelli leggono i seed di questa cartella, dati fittizi, demo a prova di fumble.

Domande, in ordine:

1. "FRIDAY, fammi il brief." — la brief card si scrive da sola, chips e sezioni in cascata.
2. "Come vanno le vendite?" — la linea del grafico si disegna sull'asse date.
3. "Cosa c'è in pipeline? Qualcosa a rischio?" — il funnel cresce, Hashimoto FR pulsa in rosso.
4. "Cosa è stato detto sulle tabelle?" — timeline delle note QA.
5. "Su cosa lavoro oggi?" — la action list si rivela riga per riga.

Se la voce risponde ma il pannello non cambia: il hub :7710 non è raggiungibile dalla
UI (controlla la console browser) o il modello non ha scelto il tool — riformula citando
"brief" / "pipeline" / "vendite".
```

- [ ] **Step 3: Sezione in QUICKSTART**

In `docs/QUICKSTART.md`, in fondo alla sezione "Mode 3 — Full online UI", aggiungi:

```markdown
### Pannelli HUD (render events)

Ogni risposta dei 5 tool dati viaggia su due binari dalla stessa tool call: la voce
dice il sommario, il centro della HUD anima il pannello (`render.event` sul bus :7710,
contratto in `packages/contracts/src/render.ts`).

| Chiedi... | Tool | Pannello |
|---|---|---|
| "fammi il brief" | `get_daily_brief` | Brief card (type-in + chips) |
| "come vanno le vendite / KENP / recensioni" | `query_metrics` | Line chart che si disegna |
| "cosa c'è in pipeline / a rischio" | `get_pipeline` | Funnel + progetti a rischio in rosso |
| "cosa è stato detto su X" | `search_intel` | Timeline note |
| "su cosa lavoro oggi" | `plan_my_day` | Action list prioritizzata |

`STARK_DEMO_MODE=1` (default da `./start.sh`): dati da `seed/*.json`, fittizi e stabili.
`STARK_DEMO_MODE=0`: sorgenti live quando esisteranno gli adapter; oggi ricade sul seed,
il pannello non è mai vuoto. Script demo: `seed/DEMO_RUNBOOK.md`.
```

- [ ] **Step 4: Suite completa**

Run (dalla root): `cd packages/contracts && npm test && cd ../core && npm test && npm run typecheck && cd ../ui && npx tsc --noEmit && cd ../.. && make test-contracts`
Expected: tutto PASS.

- [ ] **Step 5: Verifica end-to-end da start.sh (manuale, serve Ricky)**

Run: `./start.sh` → aprire http://localhost:5173 → Engage → microfono → seguire `seed/DEMO_RUNBOOK.md`.
Expected: per ogni domanda la voce risponde col sommario E il centro della HUD passa dall'arc reactor al pannello animato; "CHIUDI" torna all'idle. In alternativa senza microfono: `make dev-offline` + UI in modalità Offline Debug → digitare "fammi il brief" → nel log appare `render · stark.brief · Daily Brief`.

- [ ] **Step 6: Commit finale**

```bash
git add start.sh seed/DEMO_RUNBOOK.md docs/QUICKSTART.md
git commit -m "docs: demo runbook pannelli HUD, STARK_DEMO_MODE in start.sh e QUICKSTART"
```

---

## Fuori scope (deliberato)

- **Adapter live** (`readLive` in `aiosData.ts` ritorna `null`): i DB workspace reali (vendite KDP vere, note vere) sono un progetto a parte; la struttura demo→live→fallback è già pronta a riceverli.
- **Voce cloud Deepgram/ElevenLabs del PDF**: STARK-AI ha già il suo stack voce (Whisper+Kokoro offline, LiveKit online) — non si tocca.
- **Persona instruction sui pannelli**: il modello sceglie i tool dalle description; se in pratica non li sceglie, si aggiunge un hint alle persona (decisione da prendere coi dati alla mano).
