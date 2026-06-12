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
