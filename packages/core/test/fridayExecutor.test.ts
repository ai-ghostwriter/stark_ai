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
