# JARVIS Module C2 — Phase Executor — Implementation Plan

**Goal:** Tool `run_phase(path, phase)` che esegue una singola fase KDP delegando alla skill via Codex, gated da stato/requires e con verifica dell'output.

**Architecture:** `runCodex` (runner parallelo a runPython) + `buildPhasePrompt` (puro) + `makeRunPhase` (factory: gate via exists, delega via runner, verifica output). Tutto iniettabile per test.

**Tech Stack:** Node/TS, vitest, `node:child_process`/`node:fs`/`node:path`. Branch: `feat/module-c2`. Codebase: `/Users/abstract/Documents/Claude/Projects/JARVIS/jarvis/`. Import `.js`. Nessuna nuova dipendenza npm.

**Precondizione:** A+B+D+C1 in `main` (57 test verdi).

---

## Task C2-1: Runner Codex

**Files:** Create `jarvis/src/tools/runners/codex.ts`.

Thin glue I/O (come `python.ts`): nessun unit test diretto, solo typecheck.

- [ ] **Step 1: Crea `codex.ts`**:
```typescript
import { spawn } from "node:child_process";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CodexRunner = (prompt: string, opts: { cwd: string }) => Promise<CommandResult>;

export const runCodex: CodexRunner = (prompt, opts) =>
  new Promise<CommandResult>((resolve) => {
    const proc = spawn("codex", [
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--dangerously-bypass-approvals-and-sandbox",
      "-s",
      "danger-full-access",
      "-C",
      opts.cwd,
      prompt,
    ]);
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
git add jarvis/src/tools/runners/codex.ts
git commit -m "feat(C2): runCodex helper (child_process) parallelo a runPython"
```

---

## Task C2-2: buildPhasePrompt (puro)

**Files:** Create `jarvis/src/core/phasePrompt.ts`; Test `jarvis/test/phasePrompt.test.ts`.

- [ ] **Step 1: Test che fallisce** `test/phasePrompt.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { buildPhasePrompt } from "../src/core/phasePrompt.js";
import { KDP_PHASES } from "../src/core/kdpPhases.js";

const phase = (id: string) => KDP_PHASES.find((p) => p.id === id)!;

describe("buildPhasePrompt", () => {
  it("contiene skill, output atteso, root", () => {
    const p = phase("03c"); // brief, skill kdp-book-brief
    const out = buildPhasePrompt("/proj", p, ["PRODUCTION/dati/hooks-usp.json"]);
    expect(out).toContain("kdp-book-brief");
    expect(out).toContain("/proj/PRODUCTION/dati/brief.json");
    expect(out).toContain("/proj");
    expect(out).toContain("hooks-usp.json");
  });

  it("gestisce fase senza requires", () => {
    const p = phase("01");
    const out = buildPhasePrompt("/proj", p, []);
    expect(out).toContain("kdp-research-analyzer");
    expect(out).toMatch(/nessun input/i);
  });
});
```

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run test/phasePrompt.test.ts`

- [ ] **Step 3: Implementa `phasePrompt.ts`**:
```typescript
import type { Phase } from "./kdpPhases.js";

export function buildPhasePrompt(root: string, phase: Phase, reqOutputs: string[]): string {
  const inputs = reqOutputs.length > 0 ? reqOutputs.join(", ") : "(nessun input formale)";
  return [
    `Sei un esecutore di fase KDP. Usa la skill ${phase.skill}.`,
    `Progetto: ${root}`,
    `Fase: ${phase.id} (${phase.name}).`,
    `File di input disponibili nel progetto: ${inputs}.`,
    `Esegui ESATTAMENTE la skill e scrivi il risultato in: ${root}/${phase.output}.`,
    `Esegui SOLO questa fase. Al termine conferma il file prodotto.`,
  ].join("\n");
}
```

- [ ] **Step 4: Run → PASS** (2 test)
Run: `npx vitest run test/phasePrompt.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/core/phasePrompt.ts jarvis/test/phasePrompt.test.ts
git commit -m "feat(C2): buildPhasePrompt puro per delega Codex"
```

---

## Task C2-3: Tool run_phase (factory)

**Files:** Create `jarvis/src/tools/builtins/runPhase.ts`; Test `jarvis/test/runPhase.test.ts`.

- [ ] **Step 1: Test che fallisce** `test/runPhase.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { makeRunPhase } from "../src/tools/builtins/runPhase.js";
import { KDP_PHASES } from "../src/core/kdpPhases.js";

const out = (id: string) => KDP_PHASES.find((p) => p.id === id)!.output;

// exists basato su un set MUTABILE di path relativi (match per suffisso)
function existsFromSet(set: Set<string>) {
  return (abs: string) => [...set].some((rel) => abs.endsWith(rel));
}

describe("run_phase", () => {
  it("path/phase mancanti → errore", async () => {
    const def = makeRunPhase({ exists: () => false, runner: vi.fn() });
    expect(String(await def.handler({ path: "", phase: "01" }))).toMatch(/errore/i);
  });

  it("fase sconosciuta → errore, runner non chiamato", async () => {
    const runner = vi.fn();
    const def = makeRunPhase({ exists: () => false, runner });
    const r = String(await def.handler({ path: "/proj", phase: "ZZ" }));
    expect(r).toMatch(/sconosciut/i);
    expect(runner).not.toHaveBeenCalled();
  });

  it("output già presente → già completata, runner non chiamato", async () => {
    const runner = vi.fn();
    const def = makeRunPhase({ exists: existsFromSet(new Set([out("01")])), runner });
    const r = String(await def.handler({ path: "/proj", phase: "01" }));
    expect(r).toMatch(/già completata/i);
    expect(runner).not.toHaveBeenCalled();
  });

  it("requires mancanti → BLOCCATA, runner non chiamato", async () => {
    const runner = vi.fn();
    const def = makeRunPhase({ exists: existsFromSet(new Set()), runner });
    const r = String(await def.handler({ path: "/proj", phase: "03a" }));
    expect(r).toMatch(/bloccata/i);
    expect(runner).not.toHaveBeenCalled();
  });

  it("azionabile + runner crea output → completata, prompt con la skill", async () => {
    const set = new Set<string>(); // 01 ha requires [] → azionabile
    const runner = vi.fn(async () => {
      set.add(out("01"));
      return { code: 0, stdout: "ok", stderr: "" };
    });
    const def = makeRunPhase({ exists: existsFromSet(set), runner });
    const r = String(await def.handler({ path: "/proj", phase: "01" }));
    expect(runner).toHaveBeenCalledTimes(1);
    expect(String(runner.mock.calls[0]![0])).toContain("kdp-research-analyzer");
    expect(r).toMatch(/completata/i);
  });

  it("runner ok ma output non creato → segnala", async () => {
    const runner = vi.fn(async () => ({ code: 0, stdout: "boh", stderr: "" }));
    const def = makeRunPhase({ exists: existsFromSet(new Set()), runner });
    const r = String(await def.handler({ path: "/proj", phase: "01" }));
    expect(r).toMatch(/non risulta creato/i);
  });
});
```

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run test/runPhase.test.ts`

- [ ] **Step 3: Implementa `runPhase.ts`**:
```typescript
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolDef } from "../../llm/types.js";
import { KDP_PHASES } from "../../core/kdpPhases.js";
import { buildPhasePrompt } from "../../core/phasePrompt.js";
import { runCodex, type CodexRunner } from "../runners/codex.js";

export interface RunPhaseDeps {
  exists?: (absPath: string) => boolean;
  runner?: CodexRunner;
}

export function makeRunPhase(deps: RunPhaseDeps = {}): ToolDef {
  const exists = deps.exists ?? existsSync;
  const runner = deps.runner ?? runCodex;
  return {
    name: "run_phase",
    description:
      "Esegue UNA fase KDP delegando alla skill via Codex. Gated: la fase deve essere azionabile. Verifica l'output e si ferma per review.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "root del progetto book_writer_system" },
        phase: { type: "string", description: "id fase (es. 03c)" },
      },
      required: ["path", "phase"],
    },
    handler: async (args) => {
      const root = typeof args.path === "string" ? args.path.trim() : "";
      const phaseId = typeof args.phase === "string" ? args.phase.trim() : "";
      if (!root || !phaseId) return "Errore: servono 'path' e 'phase'.";

      const phase = KDP_PHASES.find((p) => p.id === phaseId);
      if (!phase) return `Errore: fase '${phaseId}' sconosciuta.`;

      const has = (rel: string) => exists(join(root, rel));
      if (has(phase.output)) {
        return `Fase ${phaseId} (${phase.name}) già completata: ${phase.output} esiste.`;
      }

      const reqOutputs = phase.requires.map(
        (rid) => KDP_PHASES.find((p) => p.id === rid)!.output,
      );
      const missing = reqOutputs.filter((rel) => !has(rel));
      if (missing.length > 0) {
        return `Fase ${phaseId} (${phase.name}) BLOCCATA — mancano: ${missing.join(", ")}.`;
      }

      const prompt = buildPhasePrompt(root, phase, reqOutputs);
      const res = await runner(prompt, { cwd: root });
      if (res.code !== 0) {
        return `Errore esecuzione fase ${phaseId} (exit ${res.code}): ${res.stderr.trim() || res.stdout.trim()}`;
      }
      if (!has(phase.output)) {
        return `Fase ${phaseId} eseguita ma l'output ${phase.output} non risulta creato. Output Codex: ${res.stdout.trim()}`;
      }
      return `Fase ${phaseId} (${phase.name}) completata: ${phase.output} creato. Rivedi prima di proseguire.`;
    },
  };
}
```

- [ ] **Step 4: Run → PASS** (6 test)
Run: `npx vitest run test/runPhase.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/tools/builtins/runPhase.ts jarvis/test/runPhase.test.ts
git commit -m "feat(C2): tool run_phase (delega Codex, gate, verifica output)"
```

---

## Task C2-4: Registrazione nel CLI

**Files:** Modify `jarvis/src/cli.ts`.

- [ ] **Step 1: Modifica `cli.ts`** — import in cima vicino agli altri tool:
```typescript
import { makeRunPhase } from "./tools/builtins/runPhase.js";
```
Poi nella registrazione builtin (riga che registra `... ingestCerebro, bookStatus`), aggiungi `runPhase`:
```typescript
  const bookStatus = makeBookStatus();
  const runPhase = makeRunPhase();
  for (const t of [getTime, getWeather, readFileTool, ingestCerebro, bookStatus, runPhase]) registry.register(t);
```

- [ ] **Step 2: Typecheck**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npm run typecheck` → pulito.

- [ ] **Step 3: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/cli.ts
git commit -m "feat(C2): registra run_phase tra i builtin CLI"
```

---

## Task C2-5: Verifica finale

- [ ] **Step 1: Suite intera + typecheck**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npm test && npm run typecheck`
Expected: tutti verdi (57 precedenti + 2 phasePrompt + 6 runPhase = 65), typecheck pulito.

- [ ] **Step 2: Commit finale (se servono fix)**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add -A && git commit -m "test(C2): verifica finale module C2 verde" || echo "nulla da committare"
```

---

## Self-Review (eseguita)
- **Spec coverage:** §4 runCodex → C2-1; §4 buildPhasePrompt → C2-2; §4 run_phase → C2-3; §4 cli → C2-4; §5 error handling → C2-3 (tutti i rami testati); §7 testing → C2-2/3. ✓
- **Placeholder scan:** nessuno; codice reale ovunque. ✓
- **Type consistency:** `CommandResult`, `CodexRunner`, `runCodex`, `buildPhasePrompt`, `makeRunPhase`, `RunPhaseDeps` coerenti; factory ritorna `ToolDef` registrabile. Nessun campo `executor` introdotto (hook solo documentato → nessun branch morto). ✓
