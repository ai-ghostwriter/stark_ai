import type { ToolDef } from "../../../llm/types.js";
import { loadDataset } from "../../../data/aiosData.js";
import type { RenderResult } from "../../render.js";

export const planMyDay: ToolDef = {
  name: "plan_my_day",
  description:
    "Lista prioritizzata delle azioni di oggi con motivazione. Usa per 'su cosa lavoro oggi', 'priorità', 'pianifica la giornata'.",
  parameters: { type: "object", properties: {}, required: [] },
  handler: async (): Promise<RenderResult> => {
    const { data } = await loadDataset("actions");
    const actions = Array.isArray(data.actions)
      ? (data.actions as Array<{ title?: unknown }>)
      : [];
    const focus = typeof data.focus === "string" ? data.focus : "Priorità sul pannello.";
    const first = actions[0]?.title;
    const spoken = first
      ? `${focus} Prima azione: ${String(first)}. Lista completa sul pannello.`
      : focus;
    return { spoken, render: { type: "stark.actions", title: "Piano di Oggi", payload: data } };
  },
};
