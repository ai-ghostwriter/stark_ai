# JARVIS Module B — Model Routing & Prompt Caching — Implementation Plan

**Goal:** Scegliere il tier API (Haiku/Sonnet/Opus) per tipo-task con regole+override, e attivare prompt caching sul system prompt.

**Architecture:** Nuova funzione pura `pickApiModel` (core/tier.ts). `decide` (router) la usa nel ramo API. `anthropic.ts` invia il system come blocco cacheable. CLI espone flag tier.

**Tech Stack:** Node/TS, vitest. Branch: `feat/module-b`. Codebase: `/Users/abstract/Documents/Claude/Projects/JARVIS/jarvis/`. Import con estensione `.js`.

**Precondizione:** Modulo A in `main` (30 test verdi).

---

## Task B1: Tipi + config

**Files:** Modify `jarvis/src/llm/types.ts`, `jarvis/src/config.ts`; Modify `jarvis/test/config.test.ts`.

- [ ] **Step 1: Estendi `types.ts`** — aggiungi dopo `Target`:
```typescript
export type ApiTier = "haiku" | "sonnet" | "opus";

export type TaskType =
  | "extract" | "classify" | "summarize" | "translate"
  | "write" | "analyze" | "copy"
  | "manuscript" | "strategy";
```
E in `RouteCtx` aggiungi i due campi opzionali:
```typescript
export interface RouteCtx {
  override?: Target;
  heavy?: boolean;
  taskType?: TaskType;
  apiTier?: ApiTier;
}
```

- [ ] **Step 2: Estendi il test config** — aggiungi a `test/config.test.ts` dentro il describe esistente:
```typescript
  it("espone i model id dei tre tier API", () => {
    const c = loadConfig({});
    expect(c.modelApi).toBe("claude-sonnet-4-6");
    expect(c.modelApiHaiku).toBe("claude-haiku-4-5-20251001");
    expect(c.modelApiOpus).toBe("claude-opus-4-8");
    expect(c.opusPatterns).toContain("manoscritto");
  });
```

- [ ] **Step 3: Run → FAIL**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npx vitest run test/config.test.ts`
Expected: FAIL (proprietà mancanti).

- [ ] **Step 4: Estendi `config.ts`** — aggiungi i campi all'interface `Config` e al return di `loadConfig`:
```typescript
// in interface Config, aggiungi:
  modelApiHaiku: string;
  modelApiOpus: string;
  opusPatterns: string[];
```
```typescript
// costante a livello modulo, vicino a DEFAULT_HEAVY_PATTERNS:
const DEFAULT_OPUS_PATTERNS = [
  "scrivi il capitolo",
  "scrivi il libro",
  "manoscritto",
  "brief strategico",
  "outline completo",
];
```
```typescript
// nel return di loadConfig, aggiungi:
    modelApiHaiku: env.JARVIS_MODEL_API_HAIKU ?? "claude-haiku-4-5-20251001",
    modelApiOpus: env.JARVIS_MODEL_API_OPUS ?? "claude-opus-4-8",
    opusPatterns: DEFAULT_OPUS_PATTERNS,
```

- [ ] **Step 5: Run → PASS** (3 test config)
Run: `npx vitest run test/config.test.ts`

- [ ] **Step 6: Typecheck**
Run: `npm run typecheck` → nessun errore.

- [ ] **Step 7: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/llm/types.ts jarvis/src/config.ts jarvis/test/config.test.ts
git commit -m "feat(B): tipi ApiTier/TaskType + config model id tre tier"
```

---

## Task B2: pickApiModel (funzione pura)

**Files:** Create `jarvis/src/core/tier.ts`; Test `jarvis/test/tier.test.ts`.

- [ ] **Step 1: Test che fallisce** `test/tier.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { pickApiModel } from "../src/core/tier.js";
import { loadConfig } from "../src/config.js";

const cfg = loadConfig({});

describe("pickApiModel", () => {
  it("override apiTier vince su tutto", () => {
    const r = pickApiModel("scrivi il libro", { apiTier: "haiku" }, cfg);
    expect(r.tier).toBe("haiku");
    expect(r.model).toBe(cfg.modelApiHaiku);
  });

  it("taskType extract/classify/summarize/translate → haiku", () => {
    for (const t of ["extract", "classify", "summarize", "translate"] as const) {
      expect(pickApiModel("x", { taskType: t }, cfg).tier).toBe("haiku");
    }
  });

  it("taskType write/analyze/copy → sonnet", () => {
    for (const t of ["write", "analyze", "copy"] as const) {
      expect(pickApiModel("x", { taskType: t }, cfg).tier).toBe("sonnet");
    }
  });

  it("taskType manuscript/strategy → opus", () => {
    for (const t of ["manuscript", "strategy"] as const) {
      expect(pickApiModel("x", { taskType: t }, cfg).tier).toBe("opus");
    }
  });

  it("pattern opus-grade nel testo → opus", () => {
    const r = pickApiModel("per favore scrivi il capitolo 2", {}, cfg);
    expect(r.tier).toBe("opus");
    expect(r.model).toBe(cfg.modelApiOpus);
  });

  it("default → sonnet", () => {
    const r = pickApiModel("riformula questa frase", {}, cfg);
    expect(r.tier).toBe("sonnet");
    expect(r.model).toBe(cfg.modelApi);
  });
});
```

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run test/tier.test.ts` → "Cannot find module tier.js".

- [ ] **Step 3: Implementa `tier.ts`**:
```typescript
import type { ApiTier, RouteCtx, TaskType } from "../llm/types.js";
import type { Config } from "../config.js";

const TASK_TIER: Record<TaskType, ApiTier> = {
  extract: "haiku",
  classify: "haiku",
  summarize: "haiku",
  translate: "haiku",
  write: "sonnet",
  analyze: "sonnet",
  copy: "sonnet",
  manuscript: "opus",
  strategy: "opus",
};

export interface TierPick {
  tier: ApiTier;
  model: string;
  reason: string;
}

export function pickApiModel(input: string, ctx: RouteCtx, cfg: Config): TierPick {
  // 1. override esplicito
  if (ctx.apiTier) {
    return { tier: ctx.apiTier, model: modelFor(ctx.apiTier, cfg), reason: `tier override: ${ctx.apiTier}` };
  }
  // 2. taskType dichiarato dal chiamante
  if (ctx.taskType) {
    const tier = TASK_TIER[ctx.taskType];
    return { tier, model: modelFor(tier, cfg), reason: `taskType ${ctx.taskType} → ${tier}` };
  }
  // 3. pattern opus-grade nel testo
  const lower = input.toLowerCase();
  const hit = cfg.opusPatterns.find((p) => lower.includes(p));
  if (hit) {
    return { tier: "opus", model: cfg.modelApiOpus, reason: `pattern opus-grade: "${hit}"` };
  }
  // 4. default sonnet
  return { tier: "sonnet", model: cfg.modelApi, reason: "default sonnet" };
}

function modelFor(tier: ApiTier, cfg: Config): string {
  if (tier === "haiku") return cfg.modelApiHaiku;
  if (tier === "opus") return cfg.modelApiOpus;
  return cfg.modelApi;
}
```

- [ ] **Step 4: Run → PASS** (6 test)
Run: `npx vitest run test/tier.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/core/tier.ts jarvis/test/tier.test.ts
git commit -m "feat(B): pickApiModel — tier API per regole+override+taskType"
```

---

## Task B3: Wire decide() al tier

**Files:** Modify `jarvis/src/core/router.ts`; Modify `jarvis/test/router.test.ts`.

- [ ] **Step 1: Aggiungi test al router** in `test/router.test.ts`:
```typescript
  it("ramo API: usa il tier da taskType", () => {
    const r = decide("estrai i dati", { override: "api", taskType: "extract" }, cfg);
    expect(r.target).toBe("api");
    expect(r.model).toBe(cfg.modelApiHaiku);
  });

  it("ramo API: pattern opus-grade → modello Opus", () => {
    const r = decide("scrivi il capitolo 1", {}, cfg);
    expect(r.target).toBe("api");
    expect(r.model).toBe(cfg.modelApiOpus);
  });
```

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run test/router.test.ts` → i due nuovi test falliscono (model è ancora il sonnet generico).

- [ ] **Step 3: Modifica `router.ts`** — importa pickApiModel e usalo per ogni ramo `api`. Nuova versione completa:
```typescript
import type { Route, RouteCtx } from "../llm/types.js";
import type { Config } from "../config.js";
import { pickApiModel } from "./tier.js";

export function decide(input: string, ctx: RouteCtx, cfg: Config): Route {
  // Tier 0 — override esplicito
  if (ctx.override === "local") {
    return { target: "local", model: cfg.modelLocal, reason: "override esplicito: local" };
  }
  if (ctx.override === "api") {
    const t = pickApiModel(input, ctx, cfg);
    return { target: "api", model: t.model, reason: `override esplicito: api (${t.reason})` };
  }

  // Tier 1 — regole deterministiche → API
  const apiReason = heavyReason(input, ctx, cfg);
  if (apiReason) {
    const t = pickApiModel(input, ctx, cfg);
    return { target: "api", model: t.model, reason: `${apiReason} (${t.reason})` };
  }

  // Tier 2 — default locale
  return { target: "local", model: cfg.modelLocal, reason: "default locale" };
}

function heavyReason(input: string, ctx: RouteCtx, cfg: Config): string | null {
  if (ctx.heavy) return "contesto heavy";
  if (input.length > cfg.heavyInputChars) return `input lungo (>${cfg.heavyInputChars} char)`;
  const lower = input.toLowerCase();
  const hit = cfg.heavyPatterns.find((p) => lower.includes(p));
  if (hit) return `pattern pesante: "${hit}"`;
  return null;
}
```

- [ ] **Step 4: Run → PASS** — l'INTERA suite router (9 test: 7 originali + 2 nuovi).
Run: `npx vitest run test/router.test.ts`
Nota: i 7 test originali devono restare verdi. La reason ora contiene info extra ma i match regex (`/override/i`, `/lung|soglia|char/i`, `/pattern/i`) restano soddisfatti.

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/core/router.ts jarvis/test/router.test.ts
git commit -m "feat(B): decide() seleziona il tier API via pickApiModel"
```

---

## Task B4: Prompt caching in anthropic.ts

**Files:** Modify `jarvis/src/llm/anthropic.ts`; Modify `jarvis/test/anthropic.test.ts`.

- [ ] **Step 1: Aggiungi test** in `test/anthropic.test.ts`:
```typescript
  it("invia il system come blocco con cache_control ephemeral", async () => {
    let captured: any = null;
    const fakeClient = {
      messages: {
        create: async (req: unknown) => {
          captured = req;
          return { content: [{ type: "text", text: "ok" }] };
        },
      },
    };
    await chatApi(
      { apiKey: "sk-x", model: "claude-sonnet-4-6", messages: [
        { role: "system", content: "persona" },
        { role: "user", content: "hi" },
      ] },
      fakeClient as never,
    );
    expect(Array.isArray(captured.system)).toBe(true);
    expect(captured.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(captured.system[0].text).toBe("persona");
  });
```

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run test/anthropic.test.ts`

- [ ] **Step 3: Modifica `anthropic.ts`** — sostituisci la costruzione del campo `system` e la chiamata create. La funzione `chatApi` resta con la stessa firma; cambia solo come passa `system`:
```typescript
  const systemText = args.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const convo = args.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

  const system = systemText
    ? [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }]
    : undefined;

  const resp = await c.messages.create({
    model: args.model,
    max_tokens: 4096,
    system,
    messages: convo,
  });
```
Nota: l'interface `AnthropicLike.messages.create` accetta `(req: unknown)`, quindi il blocco system tipizzato non rompe il mock. Se TS si lamenta del tipo `system`, usa `system: system as never` SOLO nella chiamata create (il client reale Anthropic accetta i blocchi con cache_control).

- [ ] **Step 4: Run → PASS** (3 test anthropic: 2 esistenti + 1 nuovo)
Run: `npx vitest run test/anthropic.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/llm/anthropic.ts jarvis/test/anthropic.test.ts
git commit -m "feat(B): prompt caching sul system prompt (cache_control ephemeral)"
```

---

## Task B5: Flag CLI tier

**Files:** Modify `jarvis/src/cli.ts`.

- [ ] **Step 1: Modifica `parseOverride` in `cli.ts`** — estendila per gestire anche i tier. Sostituisci la funzione con:
```typescript
function parseOverride(args: string[]): RouteCtx {
  const ctx: RouteCtx = {};
  if (args.includes("--api")) ctx.override = "api";
  if (args.includes("--local")) ctx.override = "local";
  if (args.includes("--haiku")) ctx.apiTier = "haiku";
  if (args.includes("--sonnet")) ctx.apiTier = "sonnet";
  if (args.includes("--opus")) ctx.apiTier = "opus";
  return ctx;
}
```
Nota: se viene passato un flag tier (`--opus`) senza `--api`, e la richiesta resta locale, il tier è semplicemente ignorato dal router (si applica solo al ramo API). Comportamento corretto e voluto.

- [ ] **Step 2: Typecheck**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npm run typecheck` → pulito.

- [ ] **Step 3: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/cli.ts
git commit -m "feat(B): flag CLI --haiku/--sonnet/--opus per il tier API"
```

---

## Task B6: Verifica finale

- [ ] **Step 1: Suite intera verde + typecheck**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npm test && npm run typecheck`
Expected: tutti i test passano (30 di A + 1 config + 6 tier + 2 router + 1 anthropic = 40), zero errori di tipo.

- [ ] **Step 2: Commit finale (se servono fix)**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add -A && git commit -m "test(B): verifica finale module B verde" || echo "nulla da committare"
```

---

## Self-Review (eseguita)
- **Spec coverage:** §3 mappa task→tier → B2; §2 precedenza → B2/B3; §4 model id → B1; caching §5 → B4; CLI §5 → B5. ✓
- **Placeholder scan:** nessuno; codice reale ovunque. ✓
- **Type consistency:** `ApiTier`, `TaskType`, `RouteCtx.{taskType,apiTier}`, `pickApiModel`, `TierPick`, `Config.{modelApiHaiku,modelApiOpus,opusPatterns}` coerenti tra i task. ✓
