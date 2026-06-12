import { describe, expect, it } from "vitest";
import { fridayWorkflowTool } from "../src/tools/builtins/fridayWorkflow.js";
import { Registry } from "../src/tools/registry.js";
import { loadConfig } from "../src/config.js";
import { registerBuiltInTools } from "../src/tools/runtime.js";

describe("friday_workflow tool", () => {
  it("plans and logs a workflow request", async () => {
    const result = await fridayWorkflowTool.handler({ request: "fix the auth bug" });

    expect(result).toMatchObject({
      spoken: "Workflow implementation pronto.",
      render: {
        type: "stark.actions",
        title: "FRIDAY / JARVIS Workflow",
        payload: {
          kind: "implementation",
          workspace: expect.stringContaining("workspaces"),
          logPath: expect.stringContaining("logs"),
        },
      },
    });
  });

  it("registers in the unified core registry", () => {
    const registry = new Registry();
    registerBuiltInTools(registry, loadConfig({}));
    expect(registry.get("friday_workflow")).toBeDefined();
  });
});
