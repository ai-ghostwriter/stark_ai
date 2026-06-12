import { writeFridayLog } from "../logging/fridayLogger.js";
import type { FridayWorkflowPlan } from "./fridayWorkflow.js";

export function logFridayWorkflow(plan: FridayWorkflowPlan): string {
  return writeFridayLog({
    agent: "friday-workflow",
    event: "workflow.planned",
    payload: {
      request: plan.request,
      kind: plan.kind,
      workspace: plan.workspace,
      steps: plan.steps,
    },
  });
}
