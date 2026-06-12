import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("ricarica da disco i run awaiting_approval dopo un riavvio", async () => {
    const dir = await mkdtemp(join(tmpdir(), "friday-run-store-"));
    const persistencePath = join(dir, "friday-runs.json");
    try {
      const store = new FridayRunStore({ persistencePath });
      const run = store.create(plan());
      store.setStatus(run.id, "architect_running");
      store.addStep(run.id, { step: "architect", ok: true, output: "PLAN" });
      store.setStatus(run.id, "awaiting_approval");

      const reloaded = new FridayRunStore({ persistencePath });

      expect(reloaded.get(run.id)?.status).toBe("awaiting_approval");
      expect(reloaded.get(run.id)?.steps).toHaveLength(1);
      expect(reloaded.latest("awaiting_approval")?.id).toBe(run.id);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
