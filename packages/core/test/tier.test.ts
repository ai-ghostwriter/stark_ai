import { describe, it, expect } from "vitest";
import { pickApiModel } from "../src/core/tier.js";
import { loadConfig } from "../src/config.js";

const cfg = loadConfig({});

describe("pickApiModel", () => {
  it("override apiTier vince su tutto", () => {
    const r = pickApiModel("scrivi il libro", { apiTier: "haiku" }, cfg);
    expect(r.tier).toBe("haiku");
    expect(r.model).toBe(cfg.modelApiHaiku);
  });

  it("taskType extract/classify/summarize/translate → haiku", () => {
    for (const t of ["extract", "classify", "summarize", "translate"] as const) {
      expect(pickApiModel("x", { taskType: t }, cfg).tier).toBe("haiku");
    }
  });

  it("taskType write/analyze/copy → sonnet", () => {
    for (const t of ["write", "analyze", "copy"] as const) {
      expect(pickApiModel("x", { taskType: t }, cfg).tier).toBe("sonnet");
    }
  });

  it("taskType manuscript/strategy → opus", () => {
    for (const t of ["manuscript", "strategy"] as const) {
      expect(pickApiModel("x", { taskType: t }, cfg).tier).toBe("opus");
    }
  });

  it("pattern opus-grade nel testo → opus", () => {
    const r = pickApiModel("per favore scrivi il capitolo 2", {}, cfg);
    expect(r.tier).toBe("opus");
    expect(r.model).toBe(cfg.modelApiOpus);
  });

  it("default → sonnet", () => {
    const r = pickApiModel("riformula questa frase", {}, cfg);
    expect(r.tier).toBe("sonnet");
    expect(r.model).toBe(cfg.modelApi);
  });
});
