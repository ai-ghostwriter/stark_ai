# FRIDAY Real Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare il workflow FRIDAY da pianificatore a esecutore reale: architect (Claude CLI) → approval umana → implementer (Codex CLI) → git diff → reviewer (Claude CLI), confinato in `workspaces/`.

**Architecture:** Una macchina a stati (`FridayRunStore` + `FridayExecutor`) orchestra i tre agenti come processi CLI locali. Le autorizzazioni native dei CLI fanno da enforcement: `claude -p` non-interattivo nega le scritture di default (perfetto per architect/reviewer che non devono mai modificare codice), `codex exec -s workspace-write` scrive solo nella sua cwd (perfetto per l'implementer). `assertWorkspaceAllowed` viene cablata nel percorso di esecuzione così ogni run è confinato sotto `workspaces/`. Ogni transizione di stato logga su `logs/friday.jsonl` e pubblica un `render.event` sull'HUD.

**Tech Stack:** Node/TypeScript (packages/core), vitest, `claude` CLI (print mode), `codex` CLI (exec + sandbox workspace-write), React (packages/ui).

---

## Contesto per chi esegue

Stato attuale (già committato o in working tree):
- `packages/core/src/workflows/fridayWorkflow.ts` — genera il **piano** (step, ruoli, approval flag). Non esegue nulla.
- `packages/core/src/policy/commandPolicy.ts` — whitelist comandi (`git npm pnpm yarn python pytest codex claude`).
- `packages/core/src/policy/workspacePolicy.ts` — `assertWorkspaceAllowed(cwd, root)` e `defaultWorkspaceRoot()` (= `<repo>/workspaces`). **Esiste ma nessun call site runtime la usa.**
- `packages/core/src/logging/fridayLogger.ts` — `writeFridayLog(record)` su `logs/friday.jsonl`.
- `packages/core/src/tools/runners/codex.ts` — `runCodex(prompt, {cwd, unsafe?})`, sandbox bypass solo opt-in.
- `packages/core/src/server.ts` — endpoint `POST /workflow` (solo piano), pattern `HttpJsonResult`, `publishRenderEvent`.
- `packages/ui/src/components/WorkflowPanel/WorkflowPanel.tsx` — pannello HUD che chiama `POST /workflow`.
- Test: vitest in `packages/core/test/`, pattern dependency-injection (vedi `runPhase.test.ts`: runner finto via `vi.fn()`).

Comandi utili:
- Test core: `cd packages/core && npm test` (oppure `npx vitest run test/<file>.test.ts`)
- App completa: `./start.sh` dalla root (unico entrypoint, non usare altri comandi di avvio)

Convenzioni: descrizioni tool e messaggi in italiano, codice/identificatori in inglese, ESM con import `.js`, niente dipendenze nuove.

---

## File Structure

**Create:**
- `packages/core/src/tools/runners/spawnCommand.ts` — helper condiviso spawn+timeout (DRY per codex/claude/git)
- `packages/core/src/tools/runners/claude.ts` — runner Claude CLI print-mode
- `packages/core/src/tools/runners/git.ts` — runner git read-only (diff/status/branch/log) con workspace policy
- `packages/core/src/workflows/fridayPrompts.ts` — prompt architect/implementer/reviewer (da spec §47-49)
- `packages/core/src/workflows/fridayRun.ts` — tipi run, transizioni, `FridayRunStore`, `runToRender`
- `packages/core/src/workflows/fridayExecutor.ts` — `FridayExecutor` + singleton `getFridayExecutor()`
- `packages/core/src/tools/builtins/fridayRun.ts` — tool vocali `friday_run`, `friday_run_status`, `friday_approve`
- Test: `claudeRunner.test.ts`, `gitRunner.test.ts`, `fridayRun.test.ts`, `fridayExecutor.test.ts`, `fridayRunEndpoints.test.ts`

**Modify:**
- `packages/core/src/tools/runners/codex.ts` — opzione `sandbox`, uso di spawnCommand
- `packages/core/src/tools/builtins/runPhase.ts` — passa `sandbox: "workspace-write"` (fix regressione scrittura)
- `packages/core/test/runPhase.test.ts` — assert sulla sandbox
- `packages/core/src/server.ts` — endpoint `POST /workflow/run`, `GET /workflow/run/:id`, `POST /workflow/run/:id/approve|reject`
- `packages/core/src/tools/runtime.ts` — registra i tool fridayRun
- `packages/core/personas/profiles/friday.json`, `jarvis.json` — menzione dei nuovi tool
- `packages/ui/src/components/WorkflowPanel/WorkflowPanel.tsx` + `.module.scss` — esecuzione live con polling e bottoni approve/reject

---

### Task 0: Spike — verifica autorizzazioni reali dei CLI

**ESEGUITO il 2026-06-12.** Risultati (il resto del piano li incorpora già):

- [x] **Codex `workspace-write` SCRIVE nella workdir** (re-test post-quota ore 05:27 del 12/06: `hello.txt` creato con contenuto `ciao`). Header confermato: `sandbox: workspace-write [workdir, /tmp, $TMPDIR]`, `approval: never`. Assunzione del piano confermata.
- [x] **`claude -p` NON è read-only in questo ambiente**: i settings utente pre-approvano i permessi, il file di test è stato creato. → Il runner Claude DEVE passare `--disallowedTools "Edit,Write,NotebookEdit,Bash"`.
- [x] **Fallback verificato**: con `echo "<prompt>" | claude -p --disallowedTools "Edit,Write,NotebookEdit,Bash"` Claude risponde "PERMESSO NEGATO" e nessun file viene creato. Nota bene: `--disallowedTools` è variadico e si mangia gli argomenti successivi → **il prompt va passato via stdin**, mai come argomento dopo il flag.
- [x] Pulizia eseguita (`workspaces/sandbox-test` rimossa).

---

### Task 1: Helper condiviso `spawnCommand`

**Files:**
- Create: `packages/core/src/tools/runners/spawnCommand.ts`
- Modify: `packages/core/src/tools/runners/codex.ts`
- Test: `packages/core/test/codexRunner.test.ts` (resta verde, nessun nuovo test: il comportamento è coperto dai test runner esistenti e dai task successivi)

- [ ] **Step 1: Scrivi `spawnCommand.ts`**

```typescript
import { spawn } from "node:child_process";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface SpawnCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Contenuto scritto su stdin e poi chiuso. Necessario per claude -p:
   *  --disallowedTools è variadico e mangerebbe un prompt passato come argomento. */
  stdin?: string;
}

export function spawnCommand(
  executable: string,
  args: string[],
  opts: SpawnCommandOptions = {},
): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve) => {
    const proc = spawn(executable, args, opts.cwd ? { cwd: opts.cwd } : {});
    if (opts.stdin !== undefined) {
      proc.stdin.write(opts.stdin);
    }
    proc.stdin.end();
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = opts.timeoutMs
      ? setTimeout(() => {
          stderr += `\n[spawnCommand] timeout dopo ${opts.timeoutMs}ms, processo terminato.`;
          proc.kill("SIGKILL");
        }, opts.timeoutMs)
      : null;

    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve(result);
    };

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e) => finish({ code: -1, stdout, stderr: stderr + String(e) }));
    proc.on("close", (code) => finish({ code: code ?? -1, stdout, stderr }));
  });
}
```

- [ ] **Step 2: Riscrivi `codex.ts` usando l'helper (stessa API, `CommandResult` ri-esportato)**

```typescript
import { assertAllowedCommand } from "../../policy/commandPolicy.js";
import { spawnCommand, type CommandResult } from "./spawnCommand.js";

export type { CommandResult } from "./spawnCommand.js";

export type CodexSandbox = "read-only" | "workspace-write";

export interface CodexRunOptions {
  cwd: string;
  sandbox?: CodexSandbox;
  unsafe?: boolean;
  timeoutMs?: number;
}

export function buildCodexArgs(prompt: string, opts: CodexRunOptions): string[] {
  assertAllowedCommand(["codex"]);

  const args = ["exec", "--skip-git-repo-check", "--ephemeral"];
  if (opts.unsafe) {
    args.push("--dangerously-bypass-approvals-and-sandbox", "-s", "danger-full-access");
  } else if (opts.sandbox) {
    args.push("-s", opts.sandbox);
  }
  args.push("-C", opts.cwd, prompt);
  return args;
}

export type CodexRunner = (prompt: string, opts: CodexRunOptions) => Promise<CommandResult>;

export const runCodex: CodexRunner = (prompt, opts) =>
  spawnCommand("codex", buildCodexArgs(prompt, opts), {
    timeoutMs: opts.timeoutMs ?? 900_000,
  });
```

Nota: niente `cwd` nello spawn di codex — il confinamento lo fa `-C`.

- [ ] **Step 3: Esegui i test esistenti del runner**

Run: `cd packages/core && npx vitest run test/codexRunner.test.ts`
Expected: PASS (2 test esistenti, API invariata)

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/tools/runners/spawnCommand.ts packages/core/src/tools/runners/codex.ts
git commit -m "refactor(core): spawnCommand condiviso con timeout per i runner CLI"
```

---

### Task 2: Sandbox `workspace-write` per Codex + fix regressione `run_phase`

**Files:**
- Modify: `packages/core/src/tools/builtins/runPhase.ts:50`
- Test: `packages/core/test/codexRunner.test.ts`, `packages/core/test/runPhase.test.ts`

- [ ] **Step 1: Scrivi i test falliti**

In `codexRunner.test.ts` aggiungi:

```typescript
it("aggiunge la sandbox workspace-write quando richiesta", () => {
  const args = buildCodexArgs("hello", { cwd: "/tmp/workspace", sandbox: "workspace-write" });
  expect(args).toEqual([
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "-s",
    "workspace-write",
    "-C",
    "/tmp/workspace",
    "hello",
  ]);
});
```

In `runPhase.test.ts` aggiungi (usa gli helper già nel file: `existsFromSet`, `out`):

```typescript
it("invoca il runner con sandbox workspace-write", async () => {
  const present = new Set([out("01"), out("02")]);
  const runner = vi.fn(async () => {
    present.add(out("03a"));
    return { code: 0, stdout: "ok", stderr: "" };
  });
  const def = makeRunPhase({ exists: existsFromSet(present), runner });
  await def.handler({ path: "/proj", phase: "03a" });
  expect(runner).toHaveBeenCalledWith(expect.any(String), {
    cwd: "/proj",
    sandbox: "workspace-write",
  });
});
```

(Adatta gli id fase/requires a quelli reali in `KDP_PHASES` se `03a` non richiede esattamente `01`+`02`: guarda `kdpPhases.ts` e usa una fase con requires soddisfacibili.)

- [ ] **Step 2: Verifica che il test runPhase fallisca**

Run: `npx vitest run test/runPhase.test.ts test/codexRunner.test.ts`
Expected: il nuovo test runPhase FAIL (chiamata con `{ cwd: "/proj" }` senza sandbox); il test codexRunner PASS già dal Task 1.

- [ ] **Step 3: Fix in `runPhase.ts`**

Sostituisci la riga `const res = await runner(prompt, { cwd: root });` con:

```typescript
const res = await runner(prompt, { cwd: root, sandbox: "workspace-write" });
```

- [ ] **Step 4: Verifica verde**

Run: `npx vitest run test/runPhase.test.ts test/codexRunner.test.ts`
Expected: PASS tutti

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tools/builtins/runPhase.ts packages/core/test/runPhase.test.ts packages/core/test/codexRunner.test.ts
git commit -m "fix(core): run_phase esegue Codex con sandbox workspace-write (ripristina la scrittura output)"
```

---

### Task 3: Runner Claude CLI (print mode, read-only by default)

**Files:**
- Create: `packages/core/src/tools/runners/claude.ts`
- Test: `packages/core/test/claudeRunner.test.ts`

- [ ] **Step 1: Scrivi il test fallito**

```typescript
import { describe, expect, it } from "vitest";
import { buildClaudeArgs } from "../src/tools/runners/claude.js";

describe("buildClaudeArgs", () => {
  it("print mode con tool di scrittura esplicitamente negati (spike 2026-06-12: i settings utente pre-approvano Write)", () => {
    expect(buildClaudeArgs()).toEqual(["-p", "--disallowedTools", "Edit,Write,NotebookEdit,Bash"]);
  });
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npx vitest run test/claudeRunner.test.ts`
Expected: FAIL — modulo `claude.js` inesistente

- [ ] **Step 3: Implementa `claude.ts`**

```typescript
import { assertAllowedCommand } from "../../policy/commandPolicy.js";
import { spawnCommand, type CommandResult } from "./spawnCommand.js";

export interface ClaudeRunOptions {
  cwd: string;
  timeoutMs?: number;
}

export function buildClaudeArgs(): string[] {
  assertAllowedCommand(["claude"]);
  // Spike 2026-06-12: i settings utente pre-approvano i permessi di scrittura,
  // quindi il deny va reso esplicito — architect e reviewer non devono mai modificare file.
  // Il prompt viaggia su stdin: --disallowedTools è variadico e mangerebbe un argomento successivo.
  return ["-p", "--disallowedTools", "Edit,Write,NotebookEdit,Bash"];
}

export type ClaudeRunner = (prompt: string, opts: ClaudeRunOptions) => Promise<CommandResult>;

export const runClaude: ClaudeRunner = (prompt, opts) =>
  spawnCommand("claude", buildClaudeArgs(), {
    cwd: opts.cwd,
    stdin: prompt,
    timeoutMs: opts.timeoutMs ?? 900_000,
  });
```

- [ ] **Step 4: Verifica verde**

Run: `npx vitest run test/claudeRunner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tools/runners/claude.ts packages/core/test/claudeRunner.test.ts
git commit -m "feat(core): runner Claude CLI print-mode per architect e reviewer"
```

---

### Task 4: Runner git read-only con workspace policy cablata

**Files:**
- Create: `packages/core/src/tools/runners/git.ts`
- Test: `packages/core/test/gitRunner.test.ts`

- [ ] **Step 1: Scrivi i test falliti**

```typescript
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runGit } from "../src/tools/runners/git.js";

// realpathSync: su macOS tmpdir() è un symlink (/var → /private/var) e la
// workspace policy normalizza i path — i fixture devono già essere risolti.
const root = realpathSync(mkdtempSync(join(tmpdir(), "friday-git-")));
const inside = join(root, "proj");
mkdirSync(inside);

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("runGit", () => {
  it("rifiuta sottocomandi fuori whitelist", async () => {
    await expect(runGit(["push", "--force"], inside, { root })).rejects.toThrow(/non consentito/i);
  });

  it("rifiuta cwd fuori dal workspace root", async () => {
    await expect(runGit(["status"], tmpdir(), { root })).rejects.toThrow(/outside allowed root/i);
  });

  it("esegue git status in un repo dentro il root", async () => {
    const { spawnCommand } = await import("../src/tools/runners/spawnCommand.js");
    await spawnCommand("git", ["init", "-q"], { cwd: inside });
    const res = await runGit(["status", "--short"], inside, { root });
    expect(res.code).toBe(0);
  });
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npx vitest run test/gitRunner.test.ts`
Expected: FAIL — modulo `git.js` inesistente

- [ ] **Step 3: Implementa `git.ts`**

```typescript
import { assertAllowedCommand } from "../../policy/commandPolicy.js";
import { assertWorkspaceAllowed, defaultWorkspaceRoot } from "../../policy/workspacePolicy.js";
import { spawnCommand, type CommandResult } from "./spawnCommand.js";

const SAFE_SUBCOMMANDS = new Set(["status", "diff", "branch", "log", "show"]);

export interface GitRunOptions {
  root?: string;
  timeoutMs?: number;
}

export type GitRunner = (args: string[], cwd: string, opts?: GitRunOptions) => Promise<CommandResult>;

export const runGit: GitRunner = async (args, cwd, opts = {}) => {
  assertAllowedCommand(["git"]);
  const sub = args[0];
  if (!sub || !SAFE_SUBCOMMANDS.has(sub)) {
    throw new Error(`Sottocomando git non consentito: ${sub ?? "(vuoto)"}.`);
  }
  const workdir = assertWorkspaceAllowed(cwd, opts.root ?? defaultWorkspaceRoot());
  return spawnCommand("git", args, { cwd: workdir, timeoutMs: opts.timeoutMs ?? 60_000 });
};
```

- [ ] **Step 4: Verifica verde**

Run: `npx vitest run test/gitRunner.test.ts`
Expected: PASS (3 test)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tools/runners/git.ts packages/core/test/gitRunner.test.ts
git commit -m "feat(core): runner git read-only con enforcement workspace policy"
```

---

### Task 5: Stato del run — tipi, transizioni, store, render

**Files:**
- Create: `packages/core/src/workflows/fridayRun.ts`
- Test: `packages/core/test/fridayRun.test.ts`

- [ ] **Step 1: Scrivi i test falliti**

```typescript
import { describe, expect, it } from "vitest";
import { FridayRunStore, runToRender } from "../src/workflows/fridayRun.js";
import { planFridayWorkflow } from "../src/workflows/fridayWorkflow.js";

const plan = () => planFridayWorkflow({ request: "add jwt auth", workspace: "/ws/proj", kind: "implementation" });

describe("FridayRunStore", () => {
  it("crea un run in stato planned con id univoco", () => {
    const store = new FridayRunStore();
    const run = store.create(plan());
    expect(run.status).toBe("planned");
    expect(run.id).toMatch(/[0-9a-f-]{36}/);
    expect(store.get(run.id)).toBe(run);
  });

  it("applica una transizione valida", () => {
    const store = new FridayRunStore();
    const run = store.create(plan());
    store.setStatus(run.id, "architect_running");
    expect(store.get(run.id)!.status).toBe("architect_running");
  });

  it("rifiuta una transizione non valida", () => {
    const store = new FridayRunStore();
    const run = store.create(plan());
    expect(() => store.setStatus(run.id, "completed")).toThrow(/transizione/i);
  });

  it("accumula gli step con timestamp", () => {
    const store = new FridayRunStore();
    const run = store.create(plan());
    store.addStep(run.id, { step: "architect", ok: true, output: "PIANO" });
    const saved = store.get(run.id)!;
    expect(saved.steps).toHaveLength(1);
    expect(saved.steps[0]!.finishedAt).toBeTruthy();
  });

  it("latest(status) restituisce il run più recente in quello stato", () => {
    const store = new FridayRunStore();
    const a = store.create(plan());
    const b = store.create(plan());
    store.setStatus(a.id, "architect_running");
    store.setStatus(a.id, "awaiting_approval");
    store.setStatus(b.id, "architect_running");
    store.setStatus(b.id, "awaiting_approval");
    expect(store.latest("awaiting_approval")!.id).toBe(b.id);
  });
});

describe("runToRender", () => {
  it("produce un RenderResult stark.actions con runId e status", () => {
    const store = new FridayRunStore();
    const run = store.create(plan());
    const render = runToRender(run);
    expect(render.render.type).toBe("stark.actions");
    expect(render.render.payload.runId).toBe(run.id);
    expect(render.render.payload.status).toBe("planned");
    expect(typeof render.spoken).toBe("string");
  });
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npx vitest run test/fridayRun.test.ts`
Expected: FAIL — modulo `fridayRun.js` inesistente

- [ ] **Step 3: Implementa `fridayRun.ts`**

```typescript
import { randomUUID } from "node:crypto";
import type { RenderResult } from "../tools/render.js";
import type { FridayWorkflowPlan } from "./fridayWorkflow.js";

export type FridayRunStatus =
  | "planned"
  | "architect_running"
  | "awaiting_approval"
  | "implementer_running"
  | "reviewer_running"
  | "completed"
  | "failed"
  | "rejected";

export type FridayRunStepId = "architect" | "implementer" | "git_diff" | "reviewer";

export interface FridayStepResult {
  step: FridayRunStepId;
  ok: boolean;
  output: string;
  finishedAt: string;
}

export interface FridayRun {
  id: string;
  plan: FridayWorkflowPlan;
  status: FridayRunStatus;
  steps: FridayStepResult[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const TRANSITIONS: Record<FridayRunStatus, readonly FridayRunStatus[]> = {
  planned: ["architect_running", "reviewer_running", "failed"],
  architect_running: ["awaiting_approval", "completed", "failed"],
  awaiting_approval: ["implementer_running", "rejected", "failed"],
  implementer_running: ["reviewer_running", "failed"],
  reviewer_running: ["completed", "failed"],
  completed: [],
  failed: [],
  rejected: [],
};

export class FridayRunStore {
  private readonly runs = new Map<string, FridayRun>();

  create(plan: FridayWorkflowPlan): FridayRun {
    const now = new Date().toISOString();
    const run: FridayRun = {
      id: randomUUID(),
      plan,
      status: "planned",
      steps: [],
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(run.id, run);
    return run;
  }

  get(id: string): FridayRun | undefined {
    return this.runs.get(id);
  }

  list(): FridayRun[] {
    return [...this.runs.values()];
  }

  latest(status?: FridayRunStatus): FridayRun | undefined {
    const all = this.list().filter((run) => !status || run.status === status);
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).at(0);
  }

  setStatus(id: string, status: FridayRunStatus): FridayRun {
    const run = this.mustGet(id);
    if (!TRANSITIONS[run.status].includes(status)) {
      throw new Error(`Transizione non valida: ${run.status} → ${status}.`);
    }
    run.status = status;
    run.updatedAt = new Date().toISOString();
    return run;
  }

  addStep(id: string, step: Omit<FridayStepResult, "finishedAt">): FridayRun {
    const run = this.mustGet(id);
    run.steps.push({ ...step, finishedAt: new Date().toISOString() });
    run.updatedAt = new Date().toISOString();
    return run;
  }

  setError(id: string, message: string): FridayRun {
    const run = this.mustGet(id);
    run.error = message;
    run.updatedAt = new Date().toISOString();
    return run;
  }

  private mustGet(id: string): FridayRun {
    const run = this.runs.get(id);
    if (!run) throw new Error(`Run '${id}' non trovato.`);
    return run;
  }
}

const SPOKEN: Record<FridayRunStatus, string> = {
  planned: "Run registrato, signore.",
  architect_running: "Claude Architect al lavoro, signore.",
  awaiting_approval: "Piano pronto. Attendo la sua approvazione, signore.",
  implementer_running: "Codex sta implementando, signore.",
  reviewer_running: "Review del diff in corso, signore.",
  completed: "Workflow completato, signore.",
  failed: "Workflow fallito, signore. Log disponibili.",
  rejected: "Workflow annullato come richiesto, signore.",
};

const STEP_OUTPUT_PREVIEW_CHARS = 4000;

export function runToRender(run: FridayRun): RenderResult {
  return {
    spoken: SPOKEN[run.status],
    render: {
      type: "stark.actions",
      title: "FRIDAY / JARVIS Workflow",
      payload: {
        runId: run.id,
        status: run.status,
        kind: run.plan.kind,
        workspace: run.plan.workspace,
        focus: `${run.status.toUpperCase()} // ${run.plan.request}`,
        error: run.error ?? null,
        actions: run.plan.steps.map((step, index) => ({
          rank: index + 1,
          title: step.title,
          why: `${step.role.toUpperCase()}${step.requiresApproval ? " • approval required" : ""}`,
        })),
        steps: run.steps.map((step) => ({
          step: step.step,
          ok: step.ok,
          finishedAt: step.finishedAt,
          preview: step.output.slice(0, STEP_OUTPUT_PREVIEW_CHARS),
        })),
      },
    },
  };
}
```

- [ ] **Step 4: Verifica verde**

Run: `npx vitest run test/fridayRun.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/workflows/fridayRun.ts packages/core/test/fridayRun.test.ts
git commit -m "feat(core): stato run FRIDAY con store, transizioni e render HUD"
```

---

### Task 6: Prompt degli agenti (spec §47-49)

**Files:**
- Create: `packages/core/src/workflows/fridayPrompts.ts`
- Test: nessuno dedicato (stringhe pure, coperte dai test executor del Task 7-8)

- [ ] **Step 1: Implementa `fridayPrompts.ts`**

```typescript
export function architectPrompt(request: string): string {
  return `You are Friday Architect.

Responsibilities:
- analyze this repository
- understand requirements
- identify risks
- generate an implementation plan

Rules:
- never modify files
- never commit
- never execute destructive commands

Output (in italiano, testo semplice):
1. Obiettivo
2. File coinvolti
3. Considerazioni architetturali
4. Rischi
5. Piano operativo
6. Test
7. Criteri di completamento

Richiesta:
${request}`;
}

export function implementerPrompt(plan: string): string {
  return `You are Friday Implementer.

Responsibilities:
- implement the approved plan below
- modify code
- create tests
- update documentation

Rules:
- minimal changes
- preserve architecture
- no overengineering
- do NOT commit

Output (in italiano):
1. File modificati
2. Riepilogo
3. Limitazioni residue

Piano approvato:
${plan}`;
}

export function reviewerPrompt(diff: string): string {
  return `You are Friday Reviewer.

Responsibilities:
- review the git diff below
- identify regressions
- identify security issues
- identify missing tests

Rules:
- never modify files
- never commit

Output (in italiano):
BLOCKERS
WARNINGS
SUGGESTIONS

Diff:
${diff || "(diff vuoto: nessuna modifica rilevata)"}`;
}
```

- [ ] **Step 2: Verifica che compili**

Run: `npx vitest run test/fridayRun.test.ts` (smoke: la suite importa ancora tutto correttamente)
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/workflows/fridayPrompts.ts
git commit -m "feat(core): prompt architect/implementer/reviewer da FRIDAY_MASTER_SPEC"
```

---

### Task 7: FridayExecutor — percorsi analysis e review

**Files:**
- Create: `packages/core/src/workflows/fridayExecutor.ts`
- Test: `packages/core/test/fridayExecutor.test.ts`

- [ ] **Step 1: Scrivi i test falliti (percorso analysis + review + workspace fuori root)**

```typescript
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { FridayExecutor } from "../src/workflows/fridayExecutor.js";
import { FridayRunStore } from "../src/workflows/fridayRun.js";
import { planFridayWorkflow } from "../src/workflows/fridayWorkflow.js";

// realpathSync: la workspace policy normalizza i path (symlink /var su macOS)
const root = realpathSync(mkdtempSync(join(tmpdir(), "friday-exec-")));
const ws = join(root, "proj");
mkdirSync(ws);
afterAll(() => rmSync(root, { recursive: true, force: true }));

const okResult = (stdout: string) => ({ code: 0, stdout, stderr: "" });

function makeExecutor(overrides: Partial<ConstructorParameters<typeof FridayExecutor>[0]> = {}) {
  return new FridayExecutor({
    claude: vi.fn(async () => okResult("ANALISI COMPLETA")),
    codex: vi.fn(async () => okResult("IMPLEMENTATO")),
    git: vi.fn(async () => okResult("diff --git a/x b/x")),
    store: new FridayRunStore(),
    publish: vi.fn(async () => {}),
    log: vi.fn(() => "/tmp/friday.jsonl"),
    workspaceRoot: root,
    ...overrides,
  });
}

describe("FridayExecutor — analysis", () => {
  it("architect gira nel workspace e il run termina completed", async () => {
    const claude = vi.fn(async () => okResult("ANALISI COMPLETA"));
    const executor = makeExecutor({ claude });
    const plan = planFridayWorkflow({ request: "analyze repo", workspace: ws, kind: "analysis" });
    const { run, completion } = executor.start(plan);
    const final = await completion;
    expect(claude).toHaveBeenCalledWith(expect.stringContaining("analyze repo"), { cwd: ws });
    expect(final.status).toBe("completed");
    expect(final.steps.map((s) => s.step)).toEqual(["architect"]);
    expect(executor.get(run.id)!.steps[0]!.output).toBe("ANALISI COMPLETA");
  });

  it("claude fallito → run failed con errore", async () => {
    const executor = makeExecutor({ claude: vi.fn(async () => ({ code: 1, stdout: "", stderr: "boom" })) });
    const plan = planFridayWorkflow({ request: "analyze repo", workspace: ws, kind: "analysis" });
    const { completion } = executor.start(plan);
    const final = await completion;
    expect(final.status).toBe("failed");
    expect(final.error).toMatch(/boom/);
  });
});

describe("FridayExecutor — review", () => {
  it("genera il diff e lo passa al reviewer", async () => {
    const claude = vi.fn(async () => okResult("BLOCKERS: nessuno"));
    const git = vi.fn(async () => okResult("diff --git a/x b/x"));
    const executor = makeExecutor({ claude, git });
    const plan = planFridayWorkflow({ request: "review code", workspace: ws, kind: "review" });
    const { completion } = executor.start(plan);
    const final = await completion;
    expect(git).toHaveBeenCalledWith(["diff"], ws, { root });
    expect(claude).toHaveBeenCalledWith(expect.stringContaining("diff --git a/x b/x"), { cwd: ws });
    expect(final.status).toBe("completed");
    expect(final.steps.map((s) => s.step)).toEqual(["git_diff", "reviewer"]);
  });
});

describe("FridayExecutor — workspace policy", () => {
  it("rifiuta un workspace fuori dal root", () => {
    const executor = makeExecutor();
    const plan = planFridayWorkflow({ request: "analyze repo", workspace: tmpdir(), kind: "analysis" });
    expect(() => executor.start(plan)).toThrow(/outside allowed root/i);
  });
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npx vitest run test/fridayExecutor.test.ts`
Expected: FAIL — modulo `fridayExecutor.js` inesistente

- [ ] **Step 3: Implementa `fridayExecutor.ts`**

```typescript
import { randomUUID } from "node:crypto";
import type { RenderEvent } from "@stark-ai/contracts";
import { publishRenderEvent } from "../bus/hubPublisher.js";
import { writeFridayLog, type FridayLogRecord } from "../logging/fridayLogger.js";
import { assertWorkspaceAllowed, defaultWorkspaceRoot } from "../policy/workspacePolicy.js";
import { runClaude, type ClaudeRunner } from "../tools/runners/claude.js";
import { runCodex, type CodexRunner } from "../tools/runners/codex.js";
import { runGit, type GitRunner } from "../tools/runners/git.js";
import type { CommandResult } from "../tools/runners/spawnCommand.js";
import { architectPrompt, implementerPrompt, reviewerPrompt } from "./fridayPrompts.js";
import { FridayRunStore, runToRender, type FridayRun, type FridayRunStatus, type FridayRunStepId } from "./fridayRun.js";
import type { FridayWorkflowPlan } from "./fridayWorkflow.js";

export interface FridayExecutorDeps {
  claude?: ClaudeRunner;
  codex?: CodexRunner;
  git?: GitRunner;
  store?: FridayRunStore;
  publish?: (event: RenderEvent) => Promise<void>;
  log?: (record: FridayLogRecord) => string;
  workspaceRoot?: string;
}

export interface FridayRunHandle {
  run: FridayRun;
  completion: Promise<FridayRun>;
}

export class FridayExecutor {
  private readonly claude: ClaudeRunner;
  private readonly codex: CodexRunner;
  private readonly git: GitRunner;
  private readonly store: FridayRunStore;
  private readonly publish: (event: RenderEvent) => Promise<void>;
  private readonly log: (record: FridayLogRecord) => string;
  private readonly workspaceRoot: string;

  constructor(deps: FridayExecutorDeps = {}) {
    this.claude = deps.claude ?? runClaude;
    this.codex = deps.codex ?? runCodex;
    this.git = deps.git ?? runGit;
    this.store = deps.store ?? new FridayRunStore();
    this.publish = deps.publish ?? publishRenderEvent;
    this.log = deps.log ?? writeFridayLog;
    this.workspaceRoot = deps.workspaceRoot ?? defaultWorkspaceRoot();
  }

  get(id: string): FridayRun | undefined {
    return this.store.get(id);
  }

  list(): FridayRun[] {
    return this.store.list();
  }

  latestAwaiting(): FridayRun | undefined {
    return this.store.latest("awaiting_approval");
  }

  start(plan: FridayWorkflowPlan): FridayRunHandle {
    const workspace = assertWorkspaceAllowed(plan.workspace, this.workspaceRoot);
    const run = this.store.create({ ...plan, workspace });
    this.log({ agent: "friday-executor", event: "run.created", payload: { runId: run.id, kind: plan.kind, workspace } });
    const completion = this.executeInitial(run.id).catch((e) => this.fail(run.id, e));
    return { run, completion };
  }

  approve(id: string): FridayRunHandle {
    const run = this.mustGet(id);
    if (run.status !== "awaiting_approval") {
      throw new Error(`Run '${id}' non è in attesa di approvazione (stato: ${run.status}).`);
    }
    const completion = this.executeApproved(id).catch((e) => this.fail(id, e));
    return { run: this.mustGet(id), completion };
  }

  reject(id: string): FridayRun {
    const run = this.mustGet(id);
    if (run.status !== "awaiting_approval") {
      throw new Error(`Run '${id}' non è in attesa di approvazione (stato: ${run.status}).`);
    }
    return this.transition(id, "rejected");
  }

  private async executeInitial(id: string): Promise<FridayRun> {
    const run = this.mustGet(id);
    if (run.plan.kind === "review") return this.runReview(id);

    this.transition(id, "architect_running");
    const res = await this.claude(architectPrompt(run.plan.request), { cwd: run.plan.workspace });
    this.recordStep(id, "architect", res);
    if (res.code !== 0) throw new Error(res.stderr.trim() || "Claude Architect terminato con errore.");

    if (run.plan.kind === "analysis") return this.transition(id, "completed");
    return this.transition(id, "awaiting_approval");
  }

  private async executeApproved(id: string): Promise<FridayRun> {
    const run = this.mustGet(id);
    this.transition(id, "implementer_running");

    const architectOutput = run.steps.find((s) => s.step === "architect")?.output ?? run.plan.request;
    const impl = await this.codex(implementerPrompt(architectOutput), {
      cwd: run.plan.workspace,
      sandbox: "workspace-write",
    });
    this.recordStep(id, "implementer", impl);
    if (impl.code !== 0) throw new Error(impl.stderr.trim() || "Codex Implementer terminato con errore.");

    return this.runReview(id);
  }

  private async runReview(id: string): Promise<FridayRun> {
    const run = this.mustGet(id);
    this.transition(id, "reviewer_running");

    const diff = await this.git(["diff"], run.plan.workspace, { root: this.workspaceRoot });
    this.recordStep(id, "git_diff", diff);
    if (diff.code !== 0) throw new Error(diff.stderr.trim() || "git diff terminato con errore.");

    const review = await this.claude(reviewerPrompt(diff.stdout), { cwd: run.plan.workspace });
    this.recordStep(id, "reviewer", review);
    if (review.code !== 0) throw new Error(review.stderr.trim() || "Claude Reviewer terminato con errore.");

    return this.transition(id, "completed");
  }

  private recordStep(id: string, step: FridayRunStepId, res: CommandResult): void {
    const ok = res.code === 0;
    this.store.addStep(id, { step, ok, output: ok ? res.stdout : `${res.stdout}\n${res.stderr}`.trim() });
    this.log({
      agent: `friday-${step}`,
      event: "step.finished",
      level: ok ? "info" : "error",
      payload: { runId: id, step, code: res.code, stdout: res.stdout, stderr: res.stderr },
    });
  }

  private transition(id: string, status: FridayRunStatus): FridayRun {
    const run = this.store.setStatus(id, status);
    this.log({ agent: "friday-executor", event: `run.${status}`, payload: { runId: id } });
    void this.publish(this.renderEvent(run));
    return run;
  }

  private fail(id: string, e: unknown): FridayRun {
    const message = e instanceof Error ? e.message : String(e);
    this.store.setError(id, message);
    let run = this.mustGet(id);
    if (run.status !== "failed") {
      try {
        run = this.store.setStatus(id, "failed");
      } catch {
        // stato terminale raggiunto da un altro percorso: l'errore resta registrato
      }
    }
    this.log({ agent: "friday-executor", event: "run.failed", level: "error", payload: { runId: id, error: message } });
    void this.publish(this.renderEvent(run));
    return run;
  }

  private renderEvent(run: FridayRun): RenderEvent {
    const render = runToRender(run);
    return {
      v: 1,
      type: "render.event",
      id: randomUUID(),
      ts: Date.now(),
      tool: "friday_run",
      render: render.render.type,
      title: render.render.title,
      spoken: render.spoken,
      payload: render.render.payload,
    };
  }

  private mustGet(id: string): FridayRun {
    const run = this.store.get(id);
    if (!run) throw new Error(`Run '${id}' non trovato.`);
    return run;
  }
}

let singleton: FridayExecutor | null = null;

export function getFridayExecutor(): FridayExecutor {
  if (!singleton) singleton = new FridayExecutor();
  return singleton;
}
```

Nota su `RenderEvent`: copia la forma esatta usata in `server.ts:269-279` (`{ v: 1, type: "render.event", ... }`). Se il tipo zod di `@stark-ai/contracts` richiede campi diversi, allineati a quello — il contratto è la fonte di verità.

- [ ] **Step 4: Verifica verde**

Run: `npx vitest run test/fridayExecutor.test.ts`
Expected: PASS (4 test)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/workflows/fridayExecutor.ts packages/core/test/fridayExecutor.test.ts
git commit -m "feat(core): FridayExecutor con percorsi analysis e review reali"
```

---

### Task 8: FridayExecutor — approval gate, implementer, reject

**Files:**
- Modify: `packages/core/test/fridayExecutor.test.ts` (l'implementazione del Task 7 copre già questi percorsi: qui si aggiungono i test che li bloccano)

- [ ] **Step 1: Aggiungi i test del percorso implementation**

In `fridayExecutor.test.ts` aggiungi:

```typescript
describe("FridayExecutor — implementation", () => {
  it("si ferma in awaiting_approval dopo l'architect", async () => {
    const codex = vi.fn(async () => okResult("IMPLEMENTATO"));
    const executor = makeExecutor({ codex });
    const plan = planFridayWorkflow({ request: "add jwt", workspace: ws, kind: "implementation" });
    const { completion } = executor.start(plan);
    const afterArchitect = await completion;
    expect(afterArchitect.status).toBe("awaiting_approval");
    expect(codex).not.toHaveBeenCalled();
  });

  it("approve esegue codex con sandbox workspace-write, poi diff e reviewer", async () => {
    const codex = vi.fn(async () => okResult("IMPLEMENTATO"));
    const claude = vi.fn(async () => okResult("PIANO / REVIEW OK"));
    const git = vi.fn(async () => okResult("diff --git a/y b/y"));
    const executor = makeExecutor({ codex, claude, git });
    const plan = planFridayWorkflow({ request: "add jwt", workspace: ws, kind: "implementation" });
    const started = executor.start(plan);
    await started.completion;

    const approved = executor.approve(started.run.id);
    const final = await approved.completion;

    expect(codex).toHaveBeenCalledWith(expect.stringContaining("PIANO / REVIEW OK"), {
      cwd: ws,
      sandbox: "workspace-write",
    });
    expect(final.status).toBe("completed");
    expect(final.steps.map((s) => s.step)).toEqual(["architect", "implementer", "git_diff", "reviewer"]);
  });

  it("reject porta il run in rejected senza eseguire codex", async () => {
    const codex = vi.fn(async () => okResult("IMPLEMENTATO"));
    const executor = makeExecutor({ codex });
    const plan = planFridayWorkflow({ request: "add jwt", workspace: ws, kind: "implementation" });
    const started = executor.start(plan);
    await started.completion;

    const rejected = executor.reject(started.run.id);
    expect(rejected.status).toBe("rejected");
    expect(codex).not.toHaveBeenCalled();
  });

  it("approve su run non in attesa → errore", async () => {
    const executor = makeExecutor();
    const plan = planFridayWorkflow({ request: "analyze repo", workspace: ws, kind: "analysis" });
    const started = executor.start(plan);
    await started.completion;
    expect(() => executor.approve(started.run.id)).toThrow(/non è in attesa/i);
  });

  it("codex fallito durante approve → run failed", async () => {
    const codex = vi.fn(async () => ({ code: 1, stdout: "", stderr: "codex crash" }));
    const executor = makeExecutor({ codex });
    const plan = planFridayWorkflow({ request: "add jwt", workspace: ws, kind: "implementation" });
    const started = executor.start(plan);
    await started.completion;
    const final = await executor.approve(started.run.id).completion;
    expect(final.status).toBe("failed");
    expect(final.error).toMatch(/codex crash/);
  });
});
```

- [ ] **Step 2: Esegui i test**

Run: `npx vitest run test/fridayExecutor.test.ts`
Expected: PASS (9 test) — l'executor del Task 7 implementa già questi percorsi; se qualcosa fallisce, correggi l'executor finché la suite è verde.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/fridayExecutor.test.ts
git commit -m "test(core): approval gate, reject e failure path dell'executor FRIDAY"
```

---

### Task 9: Endpoint HTTP run/approve/reject/status

**Files:**
- Modify: `packages/core/src/server.ts`
- Test: `packages/core/test/fridayRunEndpoints.test.ts`

- [ ] **Step 1: Scrivi i test falliti**

```typescript
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { handleWorkflowRunStart, handleWorkflowRunGet, handleWorkflowRunDecision } from "../src/server.js";
import { FridayExecutor } from "../src/workflows/fridayExecutor.js";
import { FridayRunStore } from "../src/workflows/fridayRun.js";

const root = realpathSync(mkdtempSync(join(tmpdir(), "friday-http-")));
const ws = join(root, "proj");
mkdirSync(ws);
afterAll(() => rmSync(root, { recursive: true, force: true }));

const okResult = (stdout: string) => ({ code: 0, stdout, stderr: "" });

function makeExecutor() {
  return new FridayExecutor({
    claude: vi.fn(async () => okResult("PIANO")),
    codex: vi.fn(async () => okResult("FATTO")),
    git: vi.fn(async () => okResult("diff")),
    store: new FridayRunStore(),
    publish: vi.fn(async () => {}),
    log: vi.fn(() => "/tmp/friday.jsonl"),
    workspaceRoot: root,
  });
}

describe("workflow run endpoints", () => {
  it("POST /workflow/run avvia un run e risponde 202 con runId", async () => {
    const executor = makeExecutor();
    const res = await handleWorkflowRunStart(
      executor,
      JSON.stringify({ request: "add jwt", workspace: ws, kind: "implementation" }),
    );
    expect(res.status).toBe(202);
    expect((res.json as { run: { id: string } }).run.id).toBeTruthy();
  });

  it("body senza request → 400", async () => {
    const res = await handleWorkflowRunStart(makeExecutor(), JSON.stringify({}));
    expect(res.status).toBe(400);
  });

  it("workspace fuori root → 400", async () => {
    const res = await handleWorkflowRunStart(
      makeExecutor(),
      JSON.stringify({ request: "x", workspace: tmpdir(), kind: "analysis" }),
    );
    expect(res.status).toBe(400);
  });

  it("GET dello stato run: 200 se esiste, 404 se no", async () => {
    const executor = makeExecutor();
    const started = await handleWorkflowRunStart(
      executor,
      JSON.stringify({ request: "add jwt", workspace: ws, kind: "implementation" }),
    );
    const runId = (started.json as { run: { id: string } }).run.id;
    expect(handleWorkflowRunGet(executor, runId).status).toBe(200);
    expect(handleWorkflowRunGet(executor, "missing-id").status).toBe(404);
  });

  it("approve su run in attesa → 202; approve doppio → 409", async () => {
    const executor = makeExecutor();
    const started = await handleWorkflowRunStart(
      executor,
      JSON.stringify({ request: "add jwt", workspace: ws, kind: "implementation" }),
    );
    const runId = (started.json as { run: { id: string } }).run.id;
    // attesa che l'architect (fake, istantaneo) porti il run in awaiting_approval
    await vi.waitFor(() => {
      expect(executor.get(runId)!.status).toBe("awaiting_approval");
    });

    const approved = handleWorkflowRunDecision(executor, runId, "approve");
    expect(approved.status).toBe(202);

    await vi.waitFor(() => {
      expect(executor.get(runId)!.status).toBe("completed");
    });
    expect(handleWorkflowRunDecision(executor, runId, "approve").status).toBe(409);
  });

  it("reject su run in attesa → 200 rejected", async () => {
    const executor = makeExecutor();
    const started = await handleWorkflowRunStart(
      executor,
      JSON.stringify({ request: "add jwt", workspace: ws, kind: "implementation" }),
    );
    const runId = (started.json as { run: { id: string } }).run.id;
    await vi.waitFor(() => {
      expect(executor.get(runId)!.status).toBe("awaiting_approval");
    });
    const res = handleWorkflowRunDecision(executor, runId, "reject");
    expect(res.status).toBe(200);
    expect((res.json as { run: { status: string } }).run.status).toBe("rejected");
  });
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npx vitest run test/fridayRunEndpoints.test.ts`
Expected: FAIL — handler non esportati da server.ts

- [ ] **Step 3: Implementa gli handler in `server.ts`**

Aggiungi gli import:

```typescript
import { getFridayExecutor, type FridayExecutor } from "./workflows/fridayExecutor.js";
```

Aggiungi gli handler (dopo `handleFridayWorkflow`):

```typescript
export async function handleWorkflowRunStart(executor: FridayExecutor, body: string): Promise<HttpJsonResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: 400, json: { error: "Body JSON non valido." } };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("request" in parsed) ||
    typeof parsed.request !== "string" ||
    parsed.request.trim().length === 0
  ) {
    return { status: 400, json: { error: "Campo 'request' mancante." } };
  }

  try {
    const plan = planFridayWorkflow({
      request: parsed.request,
      workspace: "workspace" in parsed && typeof parsed.workspace === "string" ? parsed.workspace : undefined,
      kind:
        "kind" in parsed && (parsed.kind === "analysis" || parsed.kind === "implementation" || parsed.kind === "review")
          ? parsed.kind
          : undefined,
    });
    const { run } = executor.start(plan);
    return { status: 202, json: { run } };
  } catch (e) {
    return { status: 400, json: { error: (e as Error).message } };
  }
}

export function handleWorkflowRunGet(executor: FridayExecutor, runId: string): HttpJsonResult {
  const run = executor.get(runId);
  if (!run) return { status: 404, json: { error: `Run '${runId}' non trovato.` } };
  return { status: 200, json: { run } };
}

export function handleWorkflowRunDecision(
  executor: FridayExecutor,
  runId: string,
  decision: "approve" | "reject",
): HttpJsonResult {
  if (!executor.get(runId)) return { status: 404, json: { error: `Run '${runId}' non trovato.` } };
  try {
    if (decision === "approve") {
      const { run } = executor.approve(runId);
      return { status: 202, json: { run } };
    }
    return { status: 200, json: { run: executor.reject(runId) } };
  } catch (e) {
    return { status: 409, json: { error: (e as Error).message } };
  }
}
```

Aggiungi il routing in `createJarvisServer` (dopo il blocco `POST /workflow` esistente):

```typescript
    if (req.method === "POST" && url.pathname === "/workflow/run") {
      await ready;
      const body = await readBody(req);
      const result = await handleWorkflowRunStart(getFridayExecutor(), body);
      sendJson(res, result.status, result.json);
      return;
    }

    const runDecision = url.pathname.match(/^\/workflow\/run\/([0-9a-f-]+)\/(approve|reject)$/);
    if (req.method === "POST" && runDecision) {
      await ready;
      const result = handleWorkflowRunDecision(getFridayExecutor(), runDecision[1]!, runDecision[2] as "approve" | "reject");
      sendJson(res, result.status, result.json);
      return;
    }

    const runStatus = url.pathname.match(/^\/workflow\/run\/([0-9a-f-]+)$/);
    if (req.method === "GET" && runStatus) {
      const result = handleWorkflowRunGet(getFridayExecutor(), runStatus[1]!);
      sendJson(res, result.status, result.json);
      return;
    }
```

Attenzione all'ordine: il match `POST /workflow` esistente usa uguaglianza esatta sul pathname, quindi non cattura `/workflow/run` — ma verifica che il nuovo blocco stia comunque PRIMA di eventuali catch-all.

- [ ] **Step 4: Verifica verde + suite intera**

Run: `npx vitest run test/fridayRunEndpoints.test.ts && npm test`
Expected: PASS tutti (la suite intera resta verde)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/server.ts packages/core/test/fridayRunEndpoints.test.ts
git commit -m "feat(core): endpoint HTTP per run FRIDAY con approval gate"
```

---

### Task 10: Tool vocali friday_run / friday_run_status / friday_approve

**Files:**
- Create: `packages/core/src/tools/builtins/fridayRun.ts`
- Modify: `packages/core/src/tools/runtime.ts`
- Modify: `packages/core/personas/profiles/friday.json`, `packages/core/personas/profiles/jarvis.json`
- Test: `packages/core/test/fridayRunTools.test.ts`

- [ ] **Step 1: Scrivi i test falliti**

```typescript
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { makeFridayRunTools } from "../src/tools/builtins/fridayRun.js";
import { FridayExecutor } from "../src/workflows/fridayExecutor.js";
import { FridayRunStore } from "../src/workflows/fridayRun.js";

const root = realpathSync(mkdtempSync(join(tmpdir(), "friday-tools-")));
const ws = join(root, "proj");
mkdirSync(ws);
afterAll(() => rmSync(root, { recursive: true, force: true }));

const okResult = (stdout: string) => ({ code: 0, stdout, stderr: "" });

function makeExecutor() {
  return new FridayExecutor({
    claude: vi.fn(async () => okResult("PIANO")),
    codex: vi.fn(async () => okResult("FATTO")),
    git: vi.fn(async () => okResult("diff")),
    store: new FridayRunStore(),
    publish: vi.fn(async () => {}),
    log: vi.fn(() => "/tmp/friday.jsonl"),
    workspaceRoot: root,
  });
}

const toolByName = (tools: ReturnType<typeof makeFridayRunTools>, name: string) =>
  tools.find((t) => t.name === name)!;

describe("friday run tools", () => {
  it("friday_run avvia un run e risponde con RenderResult", async () => {
    const executor = makeExecutor();
    const tools = makeFridayRunTools(executor);
    const result = await toolByName(tools, "friday_run").handler({ request: "add jwt", workspace: ws, kind: "implementation" });
    const render = result as { spoken: string; render: { payload: { runId: string } } };
    expect(render.spoken).toBeTruthy();
    expect(render.render.payload.runId).toBeTruthy();
  });

  it("friday_approve senza runId approva l'ultimo run in attesa", async () => {
    const executor = makeExecutor();
    const tools = makeFridayRunTools(executor);
    const started = (await toolByName(tools, "friday_run").handler({ request: "add jwt", workspace: ws, kind: "implementation" })) as {
      render: { payload: { runId: string } };
    };
    const runId = started.render.payload.runId;
    await vi.waitFor(() => expect(executor.get(runId)!.status).toBe("awaiting_approval"));

    const approved = (await toolByName(tools, "friday_approve").handler({ decision: "approve" })) as { spoken: string };
    expect(approved.spoken).toBeTruthy();
    await vi.waitFor(() => expect(executor.get(runId)!.status).toBe("completed"));
  });

  it("friday_approve senza run in attesa → messaggio di errore parlabile", async () => {
    const tools = makeFridayRunTools(makeExecutor());
    const result = await toolByName(tools, "friday_approve").handler({ decision: "approve" });
    expect(String(result)).toMatch(/nessun run/i);
  });

  it("friday_run_status restituisce lo stato dell'ultimo run", async () => {
    const executor = makeExecutor();
    const tools = makeFridayRunTools(executor);
    await toolByName(tools, "friday_run").handler({ request: "analyze", workspace: ws, kind: "analysis" });
    const status = (await toolByName(tools, "friday_run_status").handler({})) as { render: { payload: { status: string } } };
    expect(status.render.payload.status).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npx vitest run test/fridayRunTools.test.ts`
Expected: FAIL — modulo inesistente

- [ ] **Step 3: Implementa `builtins/fridayRun.ts`**

```typescript
import type { ToolDef } from "../../llm/types.js";
import { getFridayExecutor, type FridayExecutor } from "../../workflows/fridayExecutor.js";
import { runToRender } from "../../workflows/fridayRun.js";
import { planFridayWorkflow, type FridayRequestKind } from "../../workflows/fridayWorkflow.js";

const KINDS = ["analysis", "implementation", "review"] as const;

export function makeFridayRunTools(executor: FridayExecutor = getFridayExecutor()): ToolDef[] {
  const fridayRun: ToolDef = {
    name: "friday_run",
    description:
      "Avvia l'ESECUZIONE reale del workflow FRIDAY in un workspace: architect (Claude), approval, implementer (Codex), reviewer (Claude). Usa friday_workflow solo per pianificare, friday_run per eseguire.",
    parameters: {
      type: "object",
      properties: {
        request: { type: "string", description: "Richiesta naturale da eseguire" },
        workspace: { type: "string", description: "Sottocartella di workspaces/ (default: root workspaces)" },
        kind: { type: "string", enum: [...KINDS], description: "Tipo di workflow opzionale" },
      },
      required: ["request"],
    },
    handler: async (args) => {
      const request = typeof args.request === "string" ? args.request.trim() : "";
      if (!request) return "Errore: specifica 'request'.";
      try {
        const plan = planFridayWorkflow({
          request,
          workspace: typeof args.workspace === "string" ? args.workspace.trim() : undefined,
          kind: typeof args.kind === "string" && (KINDS as readonly string[]).includes(args.kind)
            ? (args.kind as FridayRequestKind)
            : undefined,
        });
        const { run } = executor.start(plan);
        return runToRender(run);
      } catch (e) {
        return `Errore avvio workflow: ${(e as Error).message}`;
      }
    },
  };

  const fridayRunStatus: ToolDef = {
    name: "friday_run_status",
    description: "Stato dell'ultimo run FRIDAY (o di un runId specifico): step completati, attesa approvazione, esito.",
    parameters: {
      type: "object",
      properties: {
        runId: { type: "string", description: "Id del run, opzionale (default: il più recente)" },
      },
    },
    handler: async (args) => {
      const runId = typeof args.runId === "string" ? args.runId.trim() : "";
      const run = runId ? executor.get(runId) : executor.list().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).at(0);
      if (!run) return "Nessun run FRIDAY trovato.";
      return runToRender(run);
    },
  };

  const fridayApprove: ToolDef = {
    name: "friday_approve",
    description:
      "Approva o rifiuta il run FRIDAY in attesa di approvazione. Senza runId agisce sull'ultimo run in attesa. decision: approve | reject.",
    parameters: {
      type: "object",
      properties: {
        runId: { type: "string", description: "Id del run, opzionale" },
        decision: { type: "string", enum: ["approve", "reject"], description: "Decisione" },
      },
      required: ["decision"],
    },
    handler: async (args) => {
      const decision = args.decision === "reject" ? "reject" : args.decision === "approve" ? "approve" : null;
      if (!decision) return "Errore: 'decision' deve essere approve o reject.";

      const requested = typeof args.runId === "string" ? args.runId.trim() : "";
      const target = requested ? executor.get(requested) : executor.latestAwaiting();
      if (!target) return "Nessun run in attesa di approvazione, signore.";

      try {
        if (decision === "approve") {
          const { run } = executor.approve(target.id);
          return runToRender(run);
        }
        return runToRender(executor.reject(target.id));
      } catch (e) {
        return `Errore decisione workflow: ${(e as Error).message}`;
      }
    },
  };

  return [fridayRun, fridayRunStatus, fridayApprove];
}
```

- [ ] **Step 4: Registra i tool in `runtime.ts`**

Aggiungi l'import:

```typescript
import { makeFridayRunTools } from "./builtins/fridayRun.js";
```

e nel ciclo di registrazione:

```typescript
  for (const tool of [getTime, getWeather, readFileTool, ingestCerebro, bookStatus, runPhase, newBook, kbIndex, kbSearch, fridayWorkflowTool, ...makeFridayRunTools(), ...aiosTools]) {
```

- [ ] **Step 5: Aggiorna le persona (frase aggiuntiva, NON rimuovere la menzione di friday_workflow: il test Python la verifica)**

In `friday.json`, dentro `sessionInstruction`, dopo la frase su `friday_workflow` aggiungi:

```text
Per eseguire davvero il lavoro usa `friday_run`; quando il Signore approva o rifiuta un piano usa `friday_approve`; per lo stato usa `friday_run_status`.
```

Stessa frase in `jarvis.json` (adattando il registro se serve).

- [ ] **Step 6: Verifica verde + suite intera + test voice**

Run: `npx vitest run test/fridayRunTools.test.ts && npm test`
Expected: PASS. Poi: `cd ../voice && python -m pytest tests/test_persona_profiles.py -q` (se l'ambiente Python è attivo; altrimenti segnalalo senza bloccare)
Expected: PASS — la stringa `friday_workflow` è ancora presente nelle sessionInstruction.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/tools/builtins/fridayRun.ts packages/core/src/tools/runtime.ts packages/core/personas/profiles/friday.json packages/core/personas/profiles/jarvis.json packages/core/test/fridayRunTools.test.ts
git commit -m "feat(core): tool vocali friday_run/friday_approve/friday_run_status"
```

---

### Task 11: UI — WorkflowPanel con esecuzione live e approval

**Files:**
- Modify: `packages/ui/src/components/WorkflowPanel/WorkflowPanel.tsx`
- Modify: `packages/ui/src/components/WorkflowPanel/WorkflowPanel.module.scss`

Nessun test UI automatico nel progetto: verifica manuale nel Task 12. Il proxy vite `"/workflow": "http://localhost:8787"` copre già i sottopath `/workflow/run/...` (match per prefisso), nessuna modifica a vite.config.ts.

- [ ] **Step 1: Sostituisci `WorkflowPanel.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./WorkflowPanel.module.scss";

type WorkflowKind = "analysis" | "implementation" | "review";

type RunStatus =
  | "planned"
  | "architect_running"
  | "awaiting_approval"
  | "implementer_running"
  | "reviewer_running"
  | "completed"
  | "failed"
  | "rejected";

type FridayRun = {
  id: string;
  status: RunStatus;
  error?: string | null;
  plan: {
    workspace: string;
    request: string;
    kind: WorkflowKind;
    steps: Array<{ id: string; role: string; title: string; requiresApproval: boolean }>;
  };
  steps: Array<{ step: string; ok: boolean; output: string; finishedAt: string }>;
};

const kindLabels: Record<WorkflowKind, string> = {
  analysis: "ANALYSIS",
  implementation: "IMPLEMENTATION",
  review: "REVIEW",
};

const ACTIVE_STATUSES: RunStatus[] = ["planned", "architect_running", "implementer_running", "reviewer_running"];

const statusLabels: Record<RunStatus, string> = {
  planned: "IN CODA",
  architect_running: "ARCHITECT...",
  awaiting_approval: "ATTESA APPROVAZIONE",
  implementer_running: "CODEX...",
  reviewer_running: "REVIEW...",
  completed: "COMPLETATO",
  failed: "FALLITO",
  rejected: "RIFIUTATO",
};

export function WorkflowPanel() {
  const [request, setRequest] = useState("analyze this repository");
  const [workspace, setWorkspace] = useState("");
  const [kind, setKind] = useState<WorkflowKind>("analysis");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<FridayRun | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshRun = useCallback(async (runId: string) => {
    const res = await fetch(`/workflow/run/${runId}`);
    if (!res.ok) return;
    const payload = (await res.json()) as { run: FridayRun };
    setRun(payload.run);
  }, []);

  useEffect(() => {
    if (!run) return stopPolling;
    if (ACTIVE_STATUSES.includes(run.status)) {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => void refreshRun(run.id), 2000);
      }
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [run, refreshRun, stopPolling]);

  const startRun = async () => {
    const trimmed = request.trim();
    if (!trimmed) {
      setError("Scrivi una richiesta prima di eseguire.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/workflow/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: trimmed,
          kind,
          ...(workspace.trim() ? { workspace: workspace.trim() } : {}),
        }),
      });
      const payload = (await res.json()) as { run: FridayRun; error?: string };
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
      setRun(payload.run);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Workflow request failed.");
      setRun(null);
    } finally {
      setLoading(false);
    }
  };

  const decide = async (decision: "approve" | "reject") => {
    if (!run) return;
    setError(null);
    try {
      const res = await fetch(`/workflow/run/${run.id}/${decision}`, { method: "POST" });
      const payload = (await res.json()) as { run: FridayRun; error?: string };
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
      setRun(payload.run);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Decisione fallita.");
    }
  };

  const stepOutputs = useMemo(() => run?.steps ?? [], [run]);
  const isActive = run ? ACTIVE_STATUSES.includes(run.status) : false;

  return (
    <div className={styles.workflow}>
      <div className={styles.toolbar}>
        <div className={styles.kindGroup} role="tablist" aria-label="Workflow kind">
          {(Object.keys(kindLabels) as WorkflowKind[]).map((value) => (
            <button
              key={value}
              type="button"
              className={value === kind ? styles.kindActive : styles.kind}
              onClick={() => setKind(value)}
              aria-pressed={value === kind}
            >
              {kindLabels[value]}
            </button>
          ))}
        </div>
        <button type="button" className={styles.runButton} onClick={() => void startRun()} disabled={loading || isActive}>
          {loading || isActive ? "RUNNING..." : "EXECUTE"}
        </button>
      </div>

      <label className={styles.label}>
        <span>Request</span>
        <textarea
          className={styles.textarea}
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          rows={3}
          spellCheck={false}
        />
      </label>

      <label className={styles.label}>
        <span>Workspace (sottocartella di workspaces/, opzionale)</span>
        <input
          className={styles.input}
          value={workspace}
          onChange={(event) => setWorkspace(event.target.value)}
          placeholder="workspaces/<progetto>"
          spellCheck={false}
        />
      </label>

      {error ? <div className={styles.error}>{error}</div> : null}

      {run ? (
        <div className={styles.result}>
          <div className={styles.resultHeader}>
            <span>{statusLabels[run.status]}</span>
            <strong>{run.plan.workspace}</strong>
          </div>
          {run.error ? <div className={styles.error}>{run.error}</div> : null}

          {run.status === "awaiting_approval" ? (
            <div className={styles.approvalBar}>
              <button type="button" className={styles.approveButton} onClick={() => void decide("approve")}>
                APPROVE
              </button>
              <button type="button" className={styles.rejectButton} onClick={() => void decide("reject")}>
                REJECT
              </button>
            </div>
          ) : null}

          <div className={styles.steps}>
            {run.plan.steps.map((step, index) => (
              <div className={styles.step} key={step.id}>
                <span className={styles.stepIndex}>{String(index + 1).padStart(2, "0")}</span>
                <div className={styles.stepBody}>
                  <strong>{step.title}</strong>
                  <span>
                    {step.role.toUpperCase()} {step.requiresApproval ? "• APPROVAL REQUIRED" : "• NO APPROVAL"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {stepOutputs.map((step) => (
            <details className={styles.output} key={`${step.step}-${step.finishedAt}`}>
              <summary>
                {step.step.toUpperCase()} {step.ok ? "✓" : "✗"}
              </summary>
              <pre>{step.output}</pre>
            </details>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Aggiungi gli stili mancanti in `WorkflowPanel.module.scss`**

In coda al file (riusa i token/colori già presenti nel file per coerenza — qui i nomi classe richiesti):

```scss
.input {
  width: 100%;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(105, 220, 255, 0.25);
  color: inherit;
  font: inherit;
  padding: 6px 8px;
}

.approvalBar {
  display: flex;
  gap: 8px;
  margin: 8px 0;
}

.approveButton,
.rejectButton {
  flex: 1;
  padding: 6px 0;
  font: inherit;
  letter-spacing: 0.08em;
  cursor: pointer;
  background: transparent;
}

.approveButton {
  border: 1px solid rgba(120, 255, 160, 0.6);
  color: rgb(120, 255, 160);
}

.rejectButton {
  border: 1px solid rgba(255, 110, 110, 0.6);
  color: rgb(255, 110, 110);
}

.output {
  margin-top: 6px;
  font-size: 11px;

  pre {
    max-height: 160px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
}
```

- [ ] **Step 3: Build UI come smoke test**

Run: `cd packages/ui && npm run build`
Expected: build verde senza errori TypeScript

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/WorkflowPanel/
git commit -m "feat(ui): WorkflowPanel esegue i run FRIDAY con polling e approval gate"
```

---

### Task 12: Verifica end-to-end con l'app reale

Manuale, via `./start.sh` (unico entrypoint). Serve un progetto demo dentro `workspaces/`.

- [ ] **Step 1: Crea il progetto demo**

```bash
mkdir -p workspaces/demo-project
cd workspaces/demo-project
git init -q
cat > utils.js <<'EOF'
function greet(name) {
  return `Hello, ${name}!`;
}
module.exports = { greet };
EOF
git add -A && git commit -qm "init demo project"
cd ../..
```

- [ ] **Step 2: Avvia l'app**

```bash
./start.sh
```

- [ ] **Step 3: Test ANALYSIS dal pannello**

Nel WorkflowPanel: kind `ANALYSIS`, workspace `workspaces/demo-project`, request `descrivi la struttura di questo progetto`. EXECUTE.
Atteso: stato `ARCHITECT...` → `COMPLETATO`; output architect visibile nel dettaglio; evento sul pannello HUD; riga `run.completed` in `logs/friday.jsonl`.

- [ ] **Step 4: Test IMPLEMENTATION con approval**

Kind `IMPLEMENTATION`, request `aggiungi una funzione sum(a, b) in utils.js`. EXECUTE.
Atteso: si ferma in `ATTESA APPROVAZIONE` con il piano dell'architect leggibile. Premi APPROVE.
Atteso: `CODEX...` → `REVIEW...` → `COMPLETATO`; `workspaces/demo-project/utils.js` contiene `sum`; il diff e la review (BLOCKERS/WARNINGS/SUGGESTIONS) sono nei dettagli step; nessun commit creato in demo-project (`git -C workspaces/demo-project log --oneline | wc -l` → ancora 1).

- [ ] **Step 5: Test REJECT**

Nuovo run IMPLEMENTATION (`rinomina greet in salute`), poi REJECT.
Atteso: stato `RIFIUTATO`, `utils.js` invariato.

- [ ] **Step 6: Test guardrail workspace**

```bash
curl -s -X POST localhost:8787/workflow/run -H 'Content-Type: application/json' \
  -d '{"request":"test","workspace":"/tmp","kind":"analysis"}'
```

Atteso: HTTP 400 con messaggio `outside allowed root`.

- [ ] **Step 7: Test vocale (opzionale ma consigliato)**

A voce con FRIDAY: "Friday, analizza il progetto demo-project" → deve usare `friday_run`; poi "approva" su un run di implementazione → `friday_approve`.

- [ ] **Step 8: Commit finale**

```bash
git add -A
git commit -m "feat(friday): esecuzione reale del workflow con approval gate end-to-end"
```

---

## Decisioni di design (perché così)

1. **Enforcement a doppio strato.** Il confinamento non si affida solo alla nostra policy: `codex -s workspace-write` e `claude -p` (deny di default) sono enforcement a livello CLI. `assertWorkspaceAllowed` + whitelist comandi sono il secondo strato nel nostro codice. Se uno dei due strati ha un bug, l'altro tiene.
2. **Run in-memory, log su JSONL.** Niente database (YAGNI, spec §62 lo mette nel futuro): i run vivono in memoria nel processo server, la storia persistente è `logs/friday.jsonl`. Al riavvio i run attivi si perdono — accettabile in v1, documentato.
3. **`start()`/`approve()` restituiscono `{run, completion}`.** Gli endpoint HTTP rispondono subito (202) e la UI fa polling; i test attendono `completion` con runner finti. Niente WebSocket dedicato: l'HUD riceve già i `render.event` dal hub a ogni transizione.
4. **L'output dell'architect È il piano passato a Codex** (spec §17: `implement_task(plan["stdout"])`). Nessuna ri-elaborazione intermedia in v1.
5. **`run_phase` (KDP) resta fuori dal workspace enforcement** ma guadagna la sandbox `workspace-write`: i progetti libro non stanno sotto `workspaces/` e hanno il loro gating di fase. Confinamento via sandbox Codex sulla cwd del progetto.

## Fuori scope (v2+)

- Esecuzione test/build automatica dopo l'implementer (spec §16) — aggiungere uno step `tests` all'executor.
- Qwen router locale per l'intent (oggi: regex `inferFridayRequestKind`).
- Persistenza run su database, retention log 30 giorni, metriche.
- Multi-agent (backend/frontend/qa agents, spec §25-31).
