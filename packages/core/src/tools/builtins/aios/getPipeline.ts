import type { ToolDef } from "../../../llm/types.js";
import { loadDataset } from "../../../data/aiosData.js";
import type { RenderResult } from "../../render.js";

export const getPipeline: ToolDef = {
  name: "get_pipeline",
  description:
    "Pipeline dei libri KDP per fase (ricerca, outline, scrittura, revisione, pubblicato) con i progetti a rischio. Usa per 'pipeline', 'a che punto sono i libri', 'cosa è a rischio'.",
  parameters: { type: "object", properties: {}, required: [] },
  handler: async (): Promise<RenderResult> => {
    const { data } = await loadDataset("pipeline");
    const deals = Array.isArray(data.deals) ? (data.deals as Array<{ name?: unknown; atRisk?: unknown }>) : [];
    const atRisk = deals.filter((deal) => deal.atRisk === true);
    const spoken = atRisk.length > 0
      ? `${deals.length} progetti in pipeline, ${atRisk.length} a rischio: ${atRisk.map((deal) => String(deal.name)).join(", ")}. Dettaglio sul pannello.`
      : `${deals.length} progetti in pipeline, nessuno a rischio. Dettaglio sul pannello.`;
    return { spoken, render: { type: "stark.pipeline", title: "Pipeline Libri", payload: data } };
  },
};
