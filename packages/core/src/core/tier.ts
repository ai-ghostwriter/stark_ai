import type { ApiTier, RouteCtx, TaskType } from "../llm/types.js";
import type { Config } from "../config.js";

const TASK_TIER: Record<TaskType, ApiTier> = {
  extract: "haiku",
  classify: "haiku",
  summarize: "haiku",
  translate: "haiku",
  write: "sonnet",
  analyze: "sonnet",
  copy: "sonnet",
  manuscript: "opus",
  strategy: "opus",
  critical: "sonnet",
  creative: "sonnet",
};

export interface TierPick {
  tier: ApiTier;
  model: string;
  reason: string;
}

export function pickApiModel(input: string, ctx: RouteCtx, cfg: Config): TierPick {
  // 1. override esplicito
  if (ctx.apiTier) {
    return { tier: ctx.apiTier, model: modelFor(ctx.apiTier, cfg), reason: `tier override: ${ctx.apiTier}` };
  }
  // 2. taskType dichiarato dal chiamante
  if (ctx.taskType) {
    const tier = TASK_TIER[ctx.taskType];
    return { tier, model: modelFor(tier, cfg), reason: `taskType ${ctx.taskType} → ${tier}` };
  }
  // 3. pattern opus-grade nel testo
  const lower = input.toLowerCase();
  const hit = cfg.opusPatterns.find((p) => lower.includes(p));
  if (hit) {
    return { tier: "opus", model: cfg.modelApiOpus, reason: `pattern opus-grade: "${hit}"` };
  }
  // 4. default sonnet
  return { tier: "sonnet", model: cfg.modelApi, reason: "default sonnet" };
}

function modelFor(tier: ApiTier, cfg: Config): string {
  if (tier === "haiku") return cfg.modelApiHaiku;
  if (tier === "opus") return cfg.modelApiOpus;
  return cfg.modelApi;
}
