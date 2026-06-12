import type { ToolDef } from "../../llm/types.js";
import { logFridayWorkflow } from "../../workflows/fridayLoggerBridge.js";
import { planFridayWorkflow, type FridayRequestKind, workflowPlanToRender } from "../../workflows/fridayWorkflow.js";

export interface FridayWorkflowArgs {
  request?: unknown;
  workspace?: unknown;
  kind?: unknown;
}

export const fridayWorkflowTool: ToolDef = {
  name: "friday_workflow",
  description:
    "Pianifica il flusso FRIDAY/JARVIS per una richiesta: analisi, implementazione o review. Usa per preparare piano, ruoli e approval gate.",
  parameters: {
    type: "object",
    properties: {
      request: { type: "string", description: "Richiesta naturale da pianificare" },
      workspace: { type: "string", description: "Workspace target opzionale" },
      kind: { type: "string", enum: ["analysis", "implementation", "review"], description: "Tipo di workflow opzionale" },
    },
    required: ["request"],
  },
  handler: async (args: FridayWorkflowArgs) => {
    const request = typeof args.request === "string" ? args.request.trim() : "";
    if (!request) return "Errore: specifica 'request'.";

    const workspace = typeof args.workspace === "string" ? args.workspace.trim() : undefined;
    const kind = typeof args.kind === "string" && ["analysis", "implementation", "review"].includes(args.kind)
      ? (args.kind as FridayRequestKind)
      : undefined;

    const plan = planFridayWorkflow({ request, workspace, kind });
    const logPath = logFridayWorkflow(plan);
    const render = workflowPlanToRender(plan);
    return {
      ...render,
      render: {
        ...render.render,
        payload: {
          ...render.render.payload,
          logPath,
          workspace: plan.workspace,
          kind: plan.kind,
        },
      },
    };
  },
};
