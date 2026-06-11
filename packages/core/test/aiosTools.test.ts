import { describe, expect, it } from "vitest";
import { aiosTools } from "../src/tools/builtins/aios/index.js";
import { isRenderResult } from "../src/tools/render.js";
import { Registry } from "../src/tools/registry.js";
import { loadConfig } from "../src/config.js";
import { registerBuiltInTools } from "../src/tools/runtime.js";

const byName = (name: string) => {
  const tool = aiosTools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} non trovato`);
  return tool;
};

describe("aios tools — doppio output", () => {
  it("expose the five PDF tools", () => {
    expect(aiosTools.map((t) => t.name).sort()).toEqual([
      "get_daily_brief", "get_pipeline", "plan_my_day", "query_metrics", "search_intel",
    ]);
  });

  it("get_daily_brief returns a stark.brief render result", async () => {
    const result = await byName("get_daily_brief").handler({});
    expect(isRenderResult(result)).toBe(true);
    expect((result as { render: { type: string } }).render.type).toBe("stark.brief");
  });

  it("query_metrics falls back to the default series on unknown metric", async () => {
    const result = await byName("query_metrics").handler({ metric: "non_esiste" });
    expect(isRenderResult(result)).toBe(true);
    const payload = (result as { render: { payload: { metric: string } } }).render.payload;
    expect(payload.metric).toBe("Vendite KDP");
  });

  it("search_intel filters hits by query", async () => {
    const result = await byName("search_intel").handler({ query: "tabelle" });
    const payload = (result as { render: { payload: { hits: unknown[]; query: string } } }).render.payload;
    expect(payload.query).toBe("tabelle");
    expect(payload.hits.length).toBeGreaterThan(0);
    expect(payload.hits.length).toBeLessThanOrEqual(6);
  });

  it("get_pipeline and plan_my_day return their panel types", async () => {
    const pipeline = await byName("get_pipeline").handler({});
    const plan = await byName("plan_my_day").handler({});
    expect((pipeline as { render: { type: string } }).render.type).toBe("stark.pipeline");
    expect((plan as { render: { type: string } }).render.type).toBe("stark.actions");
  });

  it("registerBuiltInTools registers all five", () => {
    const registry = new Registry();
    registerBuiltInTools(registry, loadConfig({}));
    for (const name of ["get_daily_brief", "query_metrics", "get_pipeline", "search_intel", "plan_my_day"]) {
      expect(registry.get(name)).toBeDefined();
    }
  });
});
