import { RenderType } from "@stark-ai/contracts";

export type RenderResult = {
  spoken: string;
  render: { type: RenderType; title: string; payload: Record<string, unknown> };
};

export function isRenderResult(value: unknown): value is RenderResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { spoken?: unknown; render?: unknown };
  if (typeof candidate.spoken !== "string") return false;
  if (typeof candidate.render !== "object" || candidate.render === null) return false;
  const render = candidate.render as { type?: unknown; title?: unknown; payload?: unknown };
  return (
    RenderType.safeParse(render.type).success &&
    typeof render.title === "string" &&
    typeof render.payload === "object" &&
    render.payload !== null &&
    !Array.isArray(render.payload)
  );
}
