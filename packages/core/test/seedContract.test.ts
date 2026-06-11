import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ActionsPayload, BriefPayload, IntelPayload, MetricsPayload, PipelinePayload,
} from "@stark-ai/contracts";

const seed = (name: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../seed/${name}`, import.meta.url)), "utf8"));

const MetricsSeed = z.object({
  default: z.string(),
  series: z.record(MetricsPayload),
}).refine((s) => s.default in s.series, { message: "default deve esistere in series" });

const IntelSeed = z.object({ hits: IntelPayload.shape.hits });

describe("seed files conform to render payload contracts", () => {
  it("daily_brief.json is a BriefPayload", () => {
    expect(() => BriefPayload.parse(seed("daily_brief.json"))).not.toThrow();
  });
  it("metrics.json has valid series with an existing default", () => {
    expect(() => MetricsSeed.parse(seed("metrics.json"))).not.toThrow();
  });
  it("pipeline.json is a PipelinePayload", () => {
    expect(() => PipelinePayload.parse(seed("pipeline.json"))).not.toThrow();
  });
  it("intel.json has valid hits", () => {
    expect(() => IntelSeed.parse(seed("intel.json"))).not.toThrow();
  });
  it("actions.json is an ActionsPayload", () => {
    expect(() => ActionsPayload.parse(seed("actions.json"))).not.toThrow();
  });
});
