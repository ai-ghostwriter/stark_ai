import { describe, expect, it, vi } from "vitest";
import { Registry } from "../src/tools/registry.js";
import type { ToolHandle } from "../src/tools/mcp/types.js";

function handle(name: string, value: string): ToolHandle {
  return {
    name,
    description: `${name} desc`,
    schema: { type: "object", properties: {} },
    invoke: vi.fn(async () => ({ ok: true as const, data: value })),
  };
}

describe("Registry MCP merge", () => {
  it("lets MCP handles override in-process tools with the same name", async () => {
    const registry = new Registry();
    registry.register({ name: "echo", description: "builtin", parameters: {}, handler: () => "builtin" });

    registry.registerHandle(handle("echo", "mcp"));

    await expect(registry.get("echo")?.handler({})).resolves.toEqual({ ok: true, data: "mcp" });
    expect(registry.schemas()[0]?.function.description).toBe("echo desc");
  });
});
