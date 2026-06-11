import type { ToolDef } from "../../../llm/types.js";
import { loadDataset } from "../../../data/aiosData.js";
import type { RenderResult } from "../../render.js";

export const getDailyBrief: ToolDef = {
  name: "get_daily_brief",
  description:
    "Briefing del giorno: sintesi, segnali chiave (vendite, KENP, recensioni, ads) e sezioni operative. Usa quando l'utente chiede 'brief', 'rundown', 'aggiornami', 'come va oggi'.",
  parameters: { type: "object", properties: {}, required: [] },
  handler: async (): Promise<RenderResult> => {
    const { data } = await loadDataset("brief");
    return {
      spoken: typeof data.summary === "string" ? data.summary : "Briefing pronto sul pannello.",
      render: { type: "stark.brief", title: "Daily Brief", payload: data },
    };
  },
};
