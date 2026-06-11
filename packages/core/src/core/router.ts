import type { Route, RouteCtx } from "../llm/types.js";
import type { Config } from "../config.js";
import { pickApiModel } from "./tier.js";

type EscalationRule = {
  taskTypes?: string[];
  patterns?: RegExp[];
};

// Persona routing hints are soft. These labels map persona language to either
// explicit task types or small, deterministic text patterns.
export const ROUTING_ESCALATION_MAP: Record<string, EscalationRule> = {
  critical_review: {
    taskTypes: ["critical"],
    patterns: [/\b(review|critique|audit|risk|rischi|critica|valuta)\b/i],
  },
  deep_analysis: {
    taskTypes: ["analyze"],
    patterns: [/\b(deep analysis|analisi approfondita|technical analysis|architecture|architettura|debug)\b/i],
  },
  creative: {
    taskTypes: ["creative", "write", "copy"],
    patterns: [/\b(draft|write|story|outline|scrivi|bozza|racconto)\b/i],
  },
  planning: {
    taskTypes: ["strategy"],
    patterns: [/\b(plan|roadmap|strategy|piano|strategia)\b/i],
  },
};

export function decide(input: string, ctx: RouteCtx, cfg: Config): Route {
  // 1. Explicit override wins over every other constraint.
  if (ctx.override === "local") {
    return { target: "local", model: cfg.modelLocal, reason: "override: local" };
  }
  if (ctx.override === "api") {
    const t = pickApiModel(input, ctx, cfg);
    return { target: "api", model: t.model, reason: `override: api (${t.reason})` };
  }

  // 2-3. Hard local constraints: no data leaves the machine.
  if (ctx.online === false) {
    return { target: "local", model: cfg.modelLocal, reason: "offline" };
  }
  if (ctx.sensitive === true) {
    return { target: "local", model: cfg.modelLocal, reason: "privacy: sensitive data stays local" };
  }

  // 4. Existing heavy/task classification keeps its API behavior.
  const apiReason = heavyReason(input, ctx, cfg);
  if (apiReason) {
    const t = pickApiModel(input, ctx, cfg);
    return { target: "api", model: t.model, reason: `${apiReason} (${t.reason})` };
  }

  // 5. Persona hints bias only the default path.
  const hintReason = personaHintReason(input, ctx);
  if (hintReason) {
    const t = pickApiModel(input, ctx, cfg);
    return { target: "api", model: t.model, reason: `${hintReason} (${t.reason})` };
  }
  if (ctx.personaHints?.preferred === "cloud") {
    const t = pickApiModel(input, ctx, cfg);
    return { target: "api", model: t.model, reason: `persona prefers cloud (${t.reason})` };
  }
  if (ctx.personaHints?.preferred === "local") {
    return { target: "local", model: cfg.modelLocal, reason: "persona prefers local" };
  }

  // 6. Default local.
  return { target: "local", model: cfg.modelLocal, reason: "default local" };
}

function heavyReason(input: string, ctx: RouteCtx, cfg: Config): string | null {
  if (ctx.heavy) return "contesto heavy";
  if (input.length > cfg.heavyInputChars) return `input lungo (>${cfg.heavyInputChars} char)`;
  const lower = input.toLowerCase();
  const hit = cfg.heavyPatterns.find((p) => lower.includes(p));
  if (hit) return `pattern pesante: "${hit}"`;
  return null;
}

function personaHintReason(input: string, ctx: RouteCtx): string | null {
  for (const label of ctx.personaHints?.escalateOn ?? []) {
    if (matchesEscalation(label, input, ctx)) {
      return `persona escalation: ${label}`;
    }
  }
  return null;
}

function matchesEscalation(label: string, input: string, ctx: RouteCtx): boolean {
  const rule = ROUTING_ESCALATION_MAP[label];
  if (rule) {
    if (ctx.taskType && rule.taskTypes?.includes(ctx.taskType)) return true;
    if (rule.patterns?.some((pattern) => pattern.test(input))) return true;
    return false;
  }

  if (ctx.taskType === label) return true;
  return input.toLowerCase().includes(label.toLowerCase());
}
