# JARVIS Module D — Ingestion (tool-runner) — Implementation Plan

**Goal:** Esporre un tool locale `ingest_cerebro` che invoca lo script Python esistente `parse_cerebro.py` per produrre `cerebro_analysis.json`, più un helper riusabile `runPython`.

**Architecture:** JARVIS orchestra, non riscrive: `runPython` lancia script Python via child_process; `makeIngestCerebro` è una factory che inietta il runner (testabile senza Python). Config tiene il path allo script.

**Tech Stack:** Node/TS, vitest, `node:child_process`. Branch: `feat/module-d`. Codebase: `/Users/abstract/Documents/Claude/Projects/JARVIS/jarvis/`. Import con estensione `.js`. Nessuna nuova dipendenza npm.

**Precondizione:** Moduli A+B in `main` (40 test verdi).

---

## Task D1: Config — path allo script Cerebro

**Files:** Modify `jarvis/src/config.ts`; Modify `jarvis/test/config.test.ts`.

- [ ] **Step 1: Aggiungi test** in `test/config.test.ts` dentro il describe esistente:
```typescript
  it("espone il path dello script Cerebro (default skill)", () => {
    const c = loadConfig({});
    expect(c.cerebroScript).toContain("parse_cerebro.py");
    const c2 = loadConfig({ JARVIS_CEREBRO_SCRIPT: "/tmp/x.py" });
    expect(c2.cerebroScript).toBe("/tmp/x.py");
  });
```

- [ ] **Step 2: Run → FAIL**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npx vitest run test/config.test.ts`

- [ ] **Step 3: Modifica `config.ts`** — aggiungi il campo all'interface `Config`:
```typescript
  cerebroScript: string;
```
e nel return di `loadConfig` aggiungi:
```typescript
    cerebroScript:
      env.JARVIS_CEREBRO_SCRIPT ??
      "/Users/abstract/Documents/Claude/SKILLS/kdp-research-analyzer/scripts/parse_cerebro.py",
```

- [ ] **Step 4: Run → PASS**
Run: `npx vitest run test/config.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/config.ts jarvis/test/config.test.ts
git commit -m "feat(D): config cerebroScript path"
```

---

## Task D2: Python runner helper

**Files:** Create `jarvis/src/tools/runners/python.ts`.

Questo è thin glue I/O (come il fetch in ollama.ts): nessun unit test diretto, solo typecheck. Sarà testato indirettamente tramite il tool con runner mockato (Task D3).

- [ ] **Step 1: Crea la cartella e il file**
```bash
mkdir -p /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis/src/tools/runners
```
`jarvis/src/tools/runners/python.ts`:
```typescript
import { spawn } from "node:child_process";

export interface PythonResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type PythonRunner = (script: string, args: string[]) => Promise<PythonResult>;

export const runPython: PythonRunner = (script, args) =>
  new Promise<PythonResult>((resolve) => {
    const proc = spawn("python3", [script, ...args]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e) => resolve({ code: -1, stdout, stderr: stderr + String(e) }));
    proc.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
```

- [ ] **Step 2: Typecheck**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npm run typecheck` → pulito.

- [ ] **Step 3: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/tools/runners/python.ts
git commit -m "feat(D): runPython helper (child_process) riusabile"
```

---

## Task D3: Tool ingest_cerebro (factory, TDD)

**Files:** Create `jarvis/src/tools/builtins/ingestCerebro.ts`; Test `jarvis/test/ingestCerebro.test.ts`.

- [ ] **Step 1: Test che fallisce** `test/ingestCerebro.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { makeIngestCerebro } from "../src/tools/builtins/ingestCerebro.js";
import type { PythonResult } from "../src/tools/runners/python.js";

function tool(result: PythonResult) {
  const runner = vi.fn(async () => result);
  const def = makeIngestCerebro({ cerebroScript: "/scripts/parse_cerebro.py", runner });
  return { def, runner };
}

describe("ingest_cerebro", () => {
  it("successo: reply con path output e stdout", async () => {
    const { def } = tool({ code: 0, stdout: "42 keyword analizzate", stderr: "" });
    const out = String(await def.handler({ inputs: ["B01=a.xlsx"], output: "out.json" }));
    expect(out).toContain("out.json");
    expect(out).toContain("42 keyword");
  });

  it("default output cerebro_analysis.json se non specificato", async () => {
    const { def } = tool({ code: 0, stdout: "ok", stderr: "" });
    const out = String(await def.handler({ inputs: ["B01=a.xlsx"] }));
    expect(out).toContain("cerebro_analysis.json");
  });

  it("fallimento: exit code != 0 → Errore con stderr", async () => {
    const { def } = tool({ code: 1, stdout: "", stderr: "ERRORE: installa openpyxl" });
    const out = String(await def.handler({ inputs: ["B01=a.xlsx"] }));
    expect(out).toMatch(/errore/i);
    expect(out).toContain("openpyxl");
  });

  it("inputs vuoto → messaggio di errore dedicato", async () => {
    const { def } = tool({ code: 0, stdout: "", stderr: "" });
    const out = String(await def.handler({ inputs: [] }));
    expect(out).toMatch(/nessun input/i);
  });

  it("passa al runner gli argomenti corretti", async () => {
    const { def, runner } = tool({ code: 0, stdout: "ok", stderr: "" });
    await def.handler({ inputs: ["B01=a.xlsx", "B02=b.xlsx"], output: "o.json" });
    expect(runner).toHaveBeenCalledWith("/scripts/parse_cerebro.py", [
      "--input", "B01=a.xlsx", "B02=b.xlsx", "--output", "o.json",
    ]);
  });
});
```

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run test/ingestCerebro.test.ts` → "Cannot find module ingestCerebro.js".

- [ ] **Step 3: Implementa `ingestCerebro.ts`**:
```typescript
import type { ToolDef } from "../../llm/types.js";
import { runPython, type PythonRunner } from "../runners/python.js";

export interface IngestCerebroDeps {
  cerebroScript: string;
  runner?: PythonRunner;
}

export function makeIngestCerebro(deps: IngestCerebroDeps): ToolDef {
  const runner = deps.runner ?? runPython;
  return {
    name: "ingest_cerebro",
    description:
      "Analizza export XLSX Helium10 Cerebro di competitor e produce cerebro_analysis.json (keyword per titolo, backend, ads, A+).",
    parameters: {
      type: "object",
      properties: {
        inputs: {
          type: "array",
          items: { type: "string" },
          description: "Voci nel formato ASIN=percorso.xlsx",
        },
        output: { type: "string", description: "Path JSON di output (default cerebro_analysis.json)" },
      },
      required: ["inputs"],
    },
    handler: async (args) => {
      const inputs = Array.isArray(args.inputs) ? args.inputs.map(String) : [];
      if (inputs.length === 0) {
        return "Errore: nessun input. Fornisci voci ASIN=percorso.xlsx.";
      }
      const output =
        typeof args.output === "string" && args.output ? args.output : "cerebro_analysis.json";
      const res = await runner(deps.cerebroScript, ["--input", ...inputs, "--output", output]);
      if (res.code !== 0) {
        return `Errore ingest_cerebro (exit ${res.code}): ${res.stderr.trim() || res.stdout.trim()}`;
      }
      return `cerebro_analysis pronto in ${output}. ${res.stdout.trim()}`;
    },
  };
}
```

- [ ] **Step 4: Run → PASS** (5 test)
Run: `npx vitest run test/ingestCerebro.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/tools/builtins/ingestCerebro.ts jarvis/test/ingestCerebro.test.ts
git commit -m "feat(D): tool ingest_cerebro (wrap parse_cerebro.py via runner)"
```

---

## Task D4: Registrazione nel CLI

**Files:** Modify `jarvis/src/cli.ts`.

- [ ] **Step 1: Modifica `cli.ts`** — importa la factory e registrala. Aggiungi l'import in cima (vicino agli altri tool import):
```typescript
import { makeIngestCerebro } from "./tools/builtins/ingestCerebro.js";
```
Poi, dove i builtin vengono registrati (riga `for (const t of [getTime, getWeather, readFileTool]) registry.register(t);`), sostituiscila con:
```typescript
  const ingestCerebro = makeIngestCerebro({ cerebroScript: cfg.cerebroScript });
  for (const t of [getTime, getWeather, readFileTool, ingestCerebro]) registry.register(t);
```

- [ ] **Step 2: Typecheck**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npm run typecheck` → pulito.

- [ ] **Step 3: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/cli.ts
git commit -m "feat(D): registra ingest_cerebro tra i builtin CLI"
```

---

## Task D5: Verifica finale

- [ ] **Step 1: Suite intera + typecheck**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npm test && npm run typecheck`
Expected: tutti verdi (40 precedenti + 1 config + 5 ingest = 46), typecheck pulito.

- [ ] **Step 2: Smoke test reale opzionale** (se vuoi, richiede un XLSX Cerebro vero; salta se non disponibile):
Run: `cd jarvis && npm run dev` poi chiedi: `usa ingest_cerebro su B01=/path/cerebro.xlsx`
NON necessario per il merge.

- [ ] **Step 3: Commit finale (se servono fix)**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add -A && git commit -m "test(D): verifica finale module D verde" || echo "nulla da committare"
```

---

## Self-Review (eseguita)
- **Spec coverage:** §3 runPython → D2; §3 tool factory → D3; §3 config → D1; §3 cli → D4; §5 error handling → D3 (test 3,4); §8 testing → D3. ✓
- **Placeholder scan:** nessuno; codice reale ovunque. ✓
- **Type consistency:** `PythonResult`, `PythonRunner`, `runPython`, `makeIngestCerebro`, `IngestCerebroDeps`, `Config.cerebroScript` coerenti tra i task; la factory ritorna `ToolDef` (stesso tipo dei builtin esistenti, registrabile in `Registry`). ✓
