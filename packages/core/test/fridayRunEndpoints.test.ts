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
