import { z } from "zod";

export const RenderType = z.enum([
  "stark.brief", "stark.metrics", "stark.pipeline", "stark.intel", "stark.actions",
]);
export type RenderType = z.infer<typeof RenderType>;

// Payload per pannello. La envelope (events.ts) tiene payload generico;
// la HUD valida con questi schemi e mostra fallback JSON se non conformi.
export const BriefPayload = z.object({
  summary: z.string(),
  signals: z.array(z.object({
    label: z.string(), value: z.string(), trend: z.enum(["up", "down", "flat"]),
  })),
  sections: z.array(z.object({ title: z.string(), line: z.string() })),
});
export type BriefPayload = z.infer<typeof BriefPayload>;

export const MetricsPayload = z.object({
  metric: z.string(),
  unit: z.string(),
  series: z.array(z.object({ date: z.string(), value: z.number() })).min(2),
});
export type MetricsPayload = z.infer<typeof MetricsPayload>;

export const PipelinePayload = z.object({
  stages: z.array(z.object({ name: z.string(), count: z.number().int().min(0) })),
  deals: z.array(z.object({
    name: z.string(), stage: z.string(), value: z.string(), atRisk: z.boolean(),
  })),
});
export type PipelinePayload = z.infer<typeof PipelinePayload>;

export const IntelPayload = z.object({
  query: z.string(),
  hits: z.array(z.object({ source: z.string(), date: z.string(), quote: z.string() })),
});
export type IntelPayload = z.infer<typeof IntelPayload>;

export const ActionsPayload = z.object({
  focus: z.string(),
  actions: z.array(z.object({ rank: z.number().int(), title: z.string(), why: z.string() })),
});
export type ActionsPayload = z.infer<typeof ActionsPayload>;
