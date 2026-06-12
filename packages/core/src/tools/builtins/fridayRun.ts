import type { ToolDef } from "../../llm/types.js";
import { getFridayExecutor, type FridayExecutor } from "../../workflows/fridayExecutor.js";
import { runToRender } from "../../workflows/fridayRun.js";
import { planFridayWorkflow, type FridayRequestKind } from "../../workflows/fridayWorkflow.js";

const KINDS = ["analysis", "implementation", "review"] as const;

export function makeFridayRunTools(executor: FridayExecutor = getFridayExecutor()): ToolDef[] {
  const fridayRun: ToolDef = {
    name: "friday_run",
    description:
      "Avvia l'ESECUZIONE reale del workflow FRIDAY in un workspace: architect (Claude), approval, implementer (Codex), reviewer (Claude). Usa friday_workflow solo per pianificare, friday_run per eseguire.",
    parameters: {
      type: "object",
      properties: {
        request: { type: "string", description: "Richiesta naturale da eseguire" },
        workspace: { type: "string", description: "Sottocartella di workspaces/ (default: root workspaces)" },
        kind: { type: "string", enum: [...KINDS], description: "Tipo di workflow opzionale" },
      },
      required: ["request"],
    },
    handler: async (args) => {
      const request = typeof args.request === "string" ? args.request.trim() : "";
      if (!request) return "Errore: specifica 'request'.";
      try {
        const plan = planFridayWorkflow({
          request,
          workspace: typeof args.workspace === "string" ? args.workspace.trim() : undefined,
          kind: typeof args.kind === "string" && (KINDS as readonly string[]).includes(args.kind)
            ? (args.kind as FridayRequestKind)
            : undefined,
        });
        const { run } = executor.start(plan);
        return runToRender(run);
      } catch (e) {
        return `Errore avvio workflow: ${(e as Error).message}`;
      }
    },
  };

  const fridayRunStatus: ToolDef = {
    name: "friday_run_status",
    description: "Stato dell'ultimo run FRIDAY (o di un runId specifico): step completati, attesa approvazione, esito.",
    parameters: {
      type: "object",
      properties: {
        runId: { type: "string", description: "Id del run, opzionale (default: il più recente)" },
      },
    },
    handler: async (args) => {
      const runId = typeof args.runId === "string" ? args.runId.trim() : "";
      const run = runId
        ? executor.get(runId)
        : executor.list().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).at(0);
      if (!run) return "Nessun run FRIDAY trovato.";
      return runToRender(run);
    },
  };

  const fridayApprove: ToolDef = {
    name: "friday_approve",
    description:
      "Approva o rifiuta il run FRIDAY in attesa di approvazione. Senza runId agisce sull'ultimo run in attesa. decision: approve | reject.",
    parameters: {
      type: "object",
      properties: {
        runId: { type: "string", description: "Id del run, opzionale" },
        decision: { type: "string", enum: ["approve", "reject"], description: "Decisione" },
      },
      required: ["decision"],
    },
    handler: async (args) => {
      const decision = args.decision === "reject" ? "reject" : args.decision === "approve" ? "approve" : null;
      if (!decision) return "Errore: 'decision' deve essere approve o reject.";

      const requested = typeof args.runId === "string" ? args.runId.trim() : "";
      const target = requested ? executor.get(requested) : executor.latestAwaiting();
      if (!target) return "Nessun run in attesa di approvazione, signore.";

      try {
        if (decision === "approve") {
          const { run } = executor.approve(target.id);
          return runToRender(run);
        }
        return runToRender(executor.reject(target.id));
      } catch (e) {
        return `Errore decisione workflow: ${(e as Error).message}`;
      }
    },
  };

  return [fridayRun, fridayRunStatus, fridayApprove];
}
