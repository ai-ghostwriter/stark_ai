import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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

export interface FridayRunStoreOptions {
  persistencePath?: string;
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
  private readonly persistencePath?: string;

  constructor(options: FridayRunStoreOptions = {}) {
    this.persistencePath = options.persistencePath ?? defaultPersistencePath();
    this.load();
  }

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
    this.save();
    return run;
  }

  get(id: string): FridayRun | undefined {
    return this.runs.get(id);
  }

  list(): FridayRun[] {
    return [...this.runs.values()];
  }

  latest(status?: FridayRunStatus): FridayRun | undefined {
    let found: FridayRun | undefined;
    for (const run of this.runs.values()) {
      if (status && run.status !== status) continue;
      // >= : a parità di timestamp vince l'inserimento più recente
      if (!found || run.updatedAt >= found.updatedAt) found = run;
    }
    return found;
  }

  setStatus(id: string, status: FridayRunStatus): FridayRun {
    const run = this.mustGet(id);
    if (!TRANSITIONS[run.status].includes(status)) {
      throw new Error(`Transizione non valida: ${run.status} → ${status}.`);
    }
    run.status = status;
    run.updatedAt = new Date().toISOString();
    this.save();
    return run;
  }

  addStep(id: string, step: Omit<FridayStepResult, "finishedAt">): FridayRun {
    const run = this.mustGet(id);
    run.steps.push({ ...step, finishedAt: new Date().toISOString() });
    run.updatedAt = new Date().toISOString();
    this.save();
    return run;
  }

  setError(id: string, message: string): FridayRun {
    const run = this.mustGet(id);
    run.error = message;
    run.updatedAt = new Date().toISOString();
    this.save();
    return run;
  }

  private mustGet(id: string): FridayRun {
    const run = this.runs.get(id);
    if (!run) throw new Error(`Run '${id}' non trovato.`);
    return run;
  }

  private load(): void {
    if (!this.persistencePath || !existsSync(this.persistencePath)) return;
    const raw = readFileSync(this.persistencePath, "utf8").trim();
    if (!raw) return;
    const parsed = JSON.parse(raw) as { runs?: FridayRun[] };
    for (const run of parsed.runs ?? []) {
      this.runs.set(run.id, run);
    }
  }

  private save(): void {
    if (!this.persistencePath) return;
    mkdirSync(dirname(this.persistencePath), { recursive: true });
    const payload = JSON.stringify({ runs: this.list() }, null, 2);
    const tmpPath = `${this.persistencePath}.${process.pid}.tmp`;
    writeFileSync(tmpPath, `${payload}\n`, "utf8");
    renameSync(tmpPath, this.persistencePath);
  }
}

function defaultPersistencePath(): string | undefined {
  if (process.env.NODE_ENV === "test") return undefined;
  return resolve(process.env.FRIDAY_RUN_STORE_PATH ?? "logs/friday-runs.json");
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
