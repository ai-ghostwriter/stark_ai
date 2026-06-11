import type { ToolDef } from "../llm/types.js";
import type { ToolHandle } from "./mcp/types.js";

export class Registry {
  private tools = new Map<string, ToolDef>();

  register(tool: ToolDef): void {
    this.tools.set(tool.name, tool);
  }

  registerHandle(handle: ToolHandle): void {
    if (this.tools.has(handle.name)) {
      console.warn(`[tools] MCP tool '${handle.name}' overrides an existing in-process tool.`);
    }
    this.tools.set(handle.name, {
      name: handle.name,
      description: handle.description,
      parameters: handle.schema,
      handler: (args) => handle.invoke(args),
    });
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  schemas(): Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
    return [...this.tools.values()].map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
}
