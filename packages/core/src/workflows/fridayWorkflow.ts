import { FRIDAY_ROLES, type FridayRoleId } from "../agents/roles.js";
import { defaultWorkspaceRoot } from "../policy/workspacePolicy.js";
import type { RenderResult } from "../tools/render.js";

export type FridayRequestKind = "analysis" | "implementation" | "review";

export interface FridayWorkflowInput {
  request: string;
  kind: FridayRequestKind;
  workspace: string;
}

export interface FridayWorkflowStep {
  id: string;
  role: FridayRoleId;
  title: string;
  requiresApproval: boolean;
}

export interface FridayWorkflowPlan {
  workspace: string;
  request: string;
  kind: FridayRequestKind;
  steps: FridayWorkflowStep[];
}

export function workflowPlanToRender(plan: FridayWorkflowPlan): RenderResult {
  return {
    spoken: `Workflow ${plan.kind} pronto.`,
    render: {
      type: "stark.actions",
      title: "FRIDAY / JARVIS Workflow",
      payload: {
        focus: `${plan.kind.toUpperCase()} // ${plan.request}`,
        actions: plan.steps.map((step, index) => ({
          rank: index + 1,
          title: step.title,
          why: `${step.role.toUpperCase()}${step.requiresApproval ? " • approval required" : ""}`,
        })),
      },
    },
  };
}

export function buildFridayWorkflow(input: FridayWorkflowInput): FridayWorkflowPlan {
  const steps: FridayWorkflowStep[] = [
    {
      id: "architect",
      role: "architect",
      title: FRIDAY_ROLES.architect.title,
      requiresApproval: true,
    },
  ];

  if (input.kind === "implementation") {
    steps.push(
      {
        id: "approval",
        role: "architect",
        title: "Human approval gate",
        requiresApproval: true,
      },
      {
        id: "implementer",
        role: "implementer",
        title: FRIDAY_ROLES.implementer.title,
        requiresApproval: true,
      },
      {
        id: "reviewer",
        role: "reviewer",
        title: FRIDAY_ROLES.reviewer.title,
        requiresApproval: false,
      },
    );
  } else if (input.kind === "review") {
    steps.push({
      id: "reviewer",
      role: "reviewer",
      title: FRIDAY_ROLES.reviewer.title,
      requiresApproval: false,
    });
  }

  return {
    workspace: input.workspace,
    request: input.request,
    kind: input.kind,
    steps,
  };
}

export function inferFridayRequestKind(request: string): FridayRequestKind {
  const lower = request.toLowerCase();
  if (/\b(review|revis(?:ion|are)|audit|diff)\b/i.test(request)) return "review";
  if (/\b(fix|bug|implement|add|create|build|modify|change|update)\b/i.test(request)) return "implementation";
  if (lower.includes("anal") || lower.includes("architett") || lower.includes("analyze") || lower.includes("analysis")) {
    return "analysis";
  }
  return "analysis";
}

export function planFridayWorkflow(input: {
  request: string;
  workspace?: string;
  kind?: FridayRequestKind;
}): FridayWorkflowPlan {
  const request = input.request.trim();
  if (!request) {
    throw new Error("Workflow request is empty.");
  }

  return buildFridayWorkflow({
    request,
    workspace: input.workspace?.trim() || defaultWorkspaceRoot(),
    kind: input.kind ?? inferFridayRequestKind(request),
  });
}
