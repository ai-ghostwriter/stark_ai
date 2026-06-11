import type { ToolDef } from "../../../llm/types.js";
import { loadDataset } from "../../../data/aiosData.js";
import type { RenderResult } from "../../render.js";

const MAX_HITS = 6;

export const searchIntel: ToolDef = {
  name: "search_intel",
  description:
    "Cerca cosa è stato detto su un argomento in note, sessioni QA e brief recenti. Usa per 'cosa è stato detto su X', 'cosa avevamo deciso su X', 'note su X'.",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "argomento da cercare" } },
    required: ["query"],
  },
  handler: async (args): Promise<RenderResult> => {
    const query = String(args.query ?? "").trim();
    const { data } = await loadDataset("intel");
    const all = Array.isArray(data.hits)
      ? (data.hits as Array<{ source: string; date: string; quote: string }>)
      : [];
    const needle = query.toLowerCase();
    const hits = (needle
      ? all.filter((hit) =>
          hit.quote.toLowerCase().includes(needle) || hit.source.toLowerCase().includes(needle))
      : all
    ).slice(0, MAX_HITS);
    const spoken = hits.length > 0
      ? `Trovati ${hits.length} riferimenti a ${query || "tutto"}: il più recente da ${hits[0]!.source}. Timeline sul pannello.`
      : `Nessun riferimento trovato per ${query}. Mostro le note recenti sul pannello.`;
    return {
      spoken,
      render: {
        type: "stark.intel",
        title: `Intel: ${query || "note recenti"}`,
        payload: { query, hits: hits.length > 0 ? hits : all.slice(0, MAX_HITS) },
      },
    };
  },
};
