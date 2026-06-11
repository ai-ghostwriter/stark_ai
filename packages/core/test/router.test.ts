import { describe, it, expect } from "vitest";
import { decide, ROUTING_ESCALATION_MAP } from "../src/core/router.js";
import { loadConfig } from "../src/config.js";
import type { RouteCtx } from "../src/llm/types.js";

const cfg = loadConfig({});

type Case = {
  name: string;
  input: string;
  ctx: RouteCtx;
  target: "local" | "api";
  model?: string;
  reason: RegExp;
};

describe("decide", () => {
  const precedenceCases: Case[] = [
    {
      name: "override api wins over offline",
      input: "ciao",
      ctx: { override: "api", online: false },
      target: "api",
      reason: /override: api/i,
    },
    {
      name: "override local wins over heavy input",
      input: "x".repeat(9999),
      ctx: { override: "local" },
      target: "local",
      reason: /override: local/i,
    },
    {
      name: "offline wins over sensitive and heavy",
      input: "scrivi il capitolo 3 del libro",
      ctx: { online: false, sensitive: true, personaHints: { preferred: "cloud", escalateOn: ["critical_review"] } },
      target: "local",
      reason: /^offline$/,
    },
    {
      name: "sensitive wins over heavy",
      input: "scrivi il capitolo 3 del libro",
      ctx: { sensitive: true },
      target: "local",
      reason: /privacy/i,
    },
    {
      name: "sensitive wins over cloud-preferred persona",
      input: "status",
      ctx: { sensitive: true, personaHints: { preferred: "cloud", escalateOn: [] } },
      target: "local",
      reason: /privacy/i,
    },
    {
      name: "heavy flag routes to API before persona local preference",
      input: "qualcosa",
      ctx: { heavy: true, personaHints: { preferred: "local", escalateOn: [] } },
      target: "api",
      reason: /contesto heavy/i,
    },
    {
      name: "heavy input routes to API",
      input: "x".repeat(5000),
      ctx: {},
      target: "api",
      reason: /input lungo|char/i,
    },
    {
      name: "heavy pattern routes to API",
      input: "ora scrivi il capitolo 3 del libro",
      ctx: {},
      target: "api",
      reason: /pattern pesante/i,
    },
    {
      name: "persona escalation by taskType routes to API",
      input: "valuta questo piano",
      ctx: { taskType: "critical", personaHints: { preferred: "local", escalateOn: ["critical_review"] } },
      target: "api",
      model: cfg.modelApi,
      reason: /persona escalation: critical_review/i,
    },
    {
      name: "persona escalation by pattern routes to API",
      input: "serve una analisi approfondita dell'architettura",
      ctx: { personaHints: { preferred: "local", escalateOn: ["deep_analysis"] } },
      target: "api",
      model: cfg.modelApi,
      reason: /persona escalation: deep_analysis/i,
    },
    {
      name: "unknown persona escalation label can match taskType directly",
      input: "prepara un testo",
      ctx: { taskType: "write", personaHints: { preferred: "local", escalateOn: ["write"] } },
      target: "api",
      model: cfg.modelApi,
      reason: /persona escalation: write/i,
    },
    {
      name: "cloud-preferred persona biases default to API",
      input: "status",
      ctx: { personaHints: { preferred: "cloud", escalateOn: [] } },
      target: "api",
      model: cfg.modelApi,
      reason: /persona prefers cloud/i,
    },
    {
      name: "local-preferred persona keeps default local",
      input: "status",
      ctx: { personaHints: { preferred: "local", escalateOn: [] } },
      target: "local",
      model: cfg.modelLocal,
      reason: /persona prefers local/i,
    },
    {
      name: "default conversational turn is local",
      input: "che tempo fa a Roma?",
      ctx: {},
      target: "local",
      model: cfg.modelLocal,
      reason: /default local/i,
    },
  ];

  it.each(precedenceCases)("$name", ({ input, ctx, target, model, reason }) => {
    const r = decide(input, ctx, cfg);
    expect(r.target).toBe(target);
    if (model) expect(r.model).toBe(model);
    expect(r.reason).toMatch(reason);
  });

  it("heavy pattern matching is case-insensitive", () => {
    const r = decide("SCRIVI IL CAPITOLO uno", {}, cfg);
    expect(r.target).toBe("api");
  });

  it("API branch keeps existing tier selection from taskType", () => {
    const r = decide("estrai i dati", { override: "api", taskType: "extract" }, cfg);
    expect(r.target).toBe("api");
    expect(r.model).toBe(cfg.modelApiHaiku);
  });

  it("API branch keeps existing opus-grade pattern selection", () => {
    const r = decide("scrivi il capitolo 1", {}, cfg);
    expect(r.target).toBe("api");
    expect(r.model).toBe(cfg.modelApiOpus);
  });

  it("documents the supported persona escalation labels", () => {
    expect(Object.keys(ROUTING_ESCALATION_MAP).sort()).toEqual([
      "creative",
      "critical_review",
      "deep_analysis",
      "planning",
    ]);
  });
});
