import type { Route, RouteCtx } from "../llm/types.js";
import type { Config } from "../config.js";
import { pickApiModel } from "./tier.js";

export function decide(input: string, ctx: RouteCtx, cfg: Config): Route {
  // Tier 0 — override esplicito
  if (ctx.override === "local") {
    return { target: "local", model: cfg.modelLocal, reason: "override esplicito: local" };
  }
  if (ctx.override === "api") {
    const t = pickApiModel(input, ctx, cfg);
    return { target: "api", model: t.model, reason: `override esplicito: api (${t.reason})` };
  }

  // Tier 1 — regole deterministiche → API
  const apiReason = heavyReason(input, ctx, cfg);
  if (apiReason) {
    const t = pickApiModel(input, ctx, cfg);
    return { target: "api", model: t.model, reason: `${apiReason} (${t.reason})` };
  }

  // Tier 2 — default locale
  return { target: "local", model: cfg.modelLocal, reason: "default locale" };
}

function heavyReason(input: string, ctx: RouteCtx, cfg: Config): string | null {
  if (ctx.heavy) return "contesto heavy";
  if (input.length > cfg.heavyInputChars) return `input lungo (>${cfg.heavyInputChars} char)`;
  const lower = input.toLowerCase();
  const hit = cfg.heavyPatterns.find((p) => lower.includes(p));
  if (hit) return `pattern pesante: "${hit}"`;
  return null;
}
