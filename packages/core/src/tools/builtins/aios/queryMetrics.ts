import type { ToolDef } from "../../../llm/types.js";
import { loadDataset } from "../../../data/aiosData.js";
import type { RenderResult } from "../../render.js";

type Series = { metric: string; unit: string; series: Array<{ date: string; value: number }> };
type MetricsData = { default: string; series: Record<string, Series> };

export const queryMetrics: ToolDef = {
  name: "query_metrics",
  description:
    "Trend di una metrica nel tempo come grafico. Metriche: 'kdp_sales' (vendite), 'kenp_pages' (pagine lette), 'reviews' (recensioni). Usa per 'come vanno le vendite', 'trend', 'andamento'.",
  parameters: {
    type: "object",
    properties: {
      metric: { type: "string", enum: ["kdp_sales", "kenp_pages", "reviews"] },
    },
    required: [],
  },
  handler: async (args): Promise<RenderResult> => {
    const { data } = await loadDataset("metrics");
    const metrics = data as unknown as MetricsData;
    const key = typeof args.metric === "string" && args.metric in metrics.series
      ? args.metric
      : metrics.default;
    const chosen = metrics.series[key]!;
    const first = chosen.series[0]!.value;
    const last = chosen.series[chosen.series.length - 1]!.value;
    const deltaPct = first === 0 ? 0 : Math.round(((last - first) / first) * 100);
    const direction = deltaPct >= 0 ? "su" : "giù";
    return {
      spoken: `${chosen.metric}: ${direction} del ${Math.abs(deltaPct)}% nel periodo, ultimo valore ${last} ${chosen.unit}. Dettaglio sul pannello.`,
      render: { type: "stark.metrics", title: chosen.metric, payload: chosen as unknown as Record<string, unknown> },
    };
  },
};
