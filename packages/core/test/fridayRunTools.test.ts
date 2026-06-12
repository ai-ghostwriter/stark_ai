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
