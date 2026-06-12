import { describe, expect, it } from "vitest";
import { FRIDAY_ROLES } from "../src/agents/roles.js";
import { buildFridayWorkflow, inferFridayRequestKind, planFridayWorkflow } from "../src/workflows/fridayWorkflow.js";

describe("buildFridayWorkflow", () => {
  it("fornisce un flusso di analisi con il solo architect", () => {
    const plan = buildFridayWorkflow({ request: "analizza il repo", kind: "analysis", workspace: "/tmp/x" });
    expect(plan.steps).toEqual([
      {
        id: "architect",
        role: "architect",
        title: FRIDAY_ROLES.architect.title,
        requiresApproval: true,
      },
    ]);
    expect(plan.kind).toBe("analysis");
  });

  it("richiede approval prima dell'implementazione e poi passa a implementer e reviewer", () => {
    const plan = buildFridayWorkflow({ request: "aggiungi auth", kind: "implementation", workspace: "/tmp/x" });
    expect(plan.steps.map((step) => step.id)).toEqual(["architect", "approval", "implementer", "reviewer"]);
    expect(plan.steps[1]?.requiresApproval).toBe(true);
    expect(plan.steps[2]?.role).toBe("implementer");
    expect(plan.steps[2]?.title).toBe(FRIDAY_ROLES.implementer.title);
    expect(plan.steps[3]?.requiresApproval).toBe(false);
  });

  it("per review include architect e reviewer", () => {
    const plan = buildFridayWorkflow({ request: "review diff", kind: "review", workspace: "/tmp/x" });
    expect(plan.steps.map((step) => step.id)).toEqual(["architect", "reviewer"]);
  });

  it("inferisce il kind quando arriva una richiesta naturale", () => {
    expect(inferFridayRequestKind("fix the auth bug")).toBe("implementation");
    expect(inferFridayRequestKind("review this diff")).toBe("review");
    expect(inferFridayRequestKind("analyze the repo")).toBe("analysis");
  });

  it("crea un piano runtime con workspace di default quando non è fornito", () => {
    const plan = planFridayWorkflow({ request: "analyze the repo" });
    expect(plan.kind).toBe("analysis");
    expect(plan.workspace).toContain("workspaces");
  });
});
