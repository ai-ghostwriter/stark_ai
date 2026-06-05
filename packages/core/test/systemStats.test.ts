import { describe, expect, it } from "vitest";
import { collectStats } from "../src/core/systemStats.js";

describe("collectStats", () => {
  it("costruisce lo snapshot sidebar con memoria usata calcolata", () => {
    const stats = collectStats({
      uptime: () => 42.5,
      cpus: () => [{ model: "Apple M-test" }, { model: "Apple M-test" }],
      loadAvg: () => [1.25, 0.5, 0.25],
      totalmem: () => 8 * 1024 * 1024,
      freemem: () => 3 * 1024 * 1024,
      models: { local: "qwen3:8b", api: "claude-sonnet-4-6" },
      toolNames: ["time", "weather"],
    });

    expect(stats).toEqual({
      status: "online",
      uptimeSeconds: 42.5,
      cpu: { model: "Apple M-test", cores: 2, loadAvg1m: 1.25 },
      memory: { totalMB: 8, freeMB: 3, usedMB: 5 },
      models: { local: "qwen3:8b", api: "claude-sonnet-4-6" },
      tools: 2,
      toolNames: ["time", "weather"],
    });
  });
});
