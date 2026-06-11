import { afterEach, describe, expect, it } from "vitest";
import { loadDataset } from "../src/data/aiosData.js";

const originalDemoMode = process.env.STARK_DEMO_MODE;

afterEach(() => {
  if (originalDemoMode === undefined) delete process.env.STARK_DEMO_MODE;
  else process.env.STARK_DEMO_MODE = originalDemoMode;
});

describe("aiosData", () => {
  it("demo mode (default) reads from seed", async () => {
    delete process.env.STARK_DEMO_MODE;
    const { source, data } = await loadDataset("brief");
    expect(source).toBe("seed");
    expect(data).toHaveProperty("summary");
  });

  it("live mode without live adapters falls back to seed — panel never blank", async () => {
    process.env.STARK_DEMO_MODE = "0";
    const { source, data } = await loadDataset("pipeline");
    expect(source).toBe("seed");
    expect(data).toHaveProperty("stages");
  });

  it("loads every dataset", async () => {
    for (const dataset of ["brief", "metrics", "pipeline", "intel", "actions"] as const) {
      const { data } = await loadDataset(dataset);
      expect(Object.keys(data).length).toBeGreaterThan(0);
    }
  });
});
