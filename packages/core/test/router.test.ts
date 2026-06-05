import { describe, it, expect } from "vitest";
import { decide } from "../src/core/router.js";
import { loadConfig } from "../src/config.js";

const cfg = loadConfig({});

describe("decide", () => {
  it("Tier 0: override --api vince sempre", () => {
    const r = decide("che ore sono", { override: "api" }, cfg);
    expect(r.target).toBe("api");
    expect(r.reason).toMatch(/override/i);
  });

  it("Tier 0: override --local vince anche su input pesante", () => {
    const big = "x".repeat(9999);
    const r = decide(big, { override: "local" }, cfg);
    expect(r.target).toBe("local");
  });

  it("Tier 1: input oltre soglia → api", () => {
    const r = decide("x".repeat(5000), {}, cfg);
    expect(r.target).toBe("api");
    expect(r.reason).toMatch(/lung|soglia|char/i);
  });

  it("Tier 1: pattern pesante → api", () => {
    const r = decide("ora scrivi il capitolo 3 del libro", {}, cfg);
    expect(r.target).toBe("api");
    expect(r.reason).toMatch(/pattern/i);
  });

  it("Tier 1: heavy flag dal contesto → api", () => {
    const r = decide("qualcosa", { heavy: true }, cfg);
    expect(r.target).toBe("api");
  });

  it("Tier 2: default conversazionale → local", () => {
    const r = decide("che tempo fa a Roma?", {}, cfg);
    expect(r.target).toBe("local");
    expect(r.model).toBe(cfg.modelLocal);
  });

  it("il match pattern è case-insensitive", () => {
    const r = decide("SCRIVI IL CAPITOLO uno", {}, cfg);
    expect(r.target).toBe("api");
  });

  it("ramo API: usa il tier da taskType", () => {
    const r = decide("estrai i dati", { override: "api", taskType: "extract" }, cfg);
    expect(r.target).toBe("api");
    expect(r.model).toBe(cfg.modelApiHaiku);
  });

  it("ramo API: pattern opus-grade → modello Opus", () => {
    const r = decide("scrivi il capitolo 1", {}, cfg);
    expect(r.target).toBe("api");
    expect(r.model).toBe(cfg.modelApiOpus);
  });
});
