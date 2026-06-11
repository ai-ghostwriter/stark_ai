import { describe, expect, it } from "vitest";
import { handleToolsCall, handleToolsList } from "../src/server.js";
import { Registry } from "../src/tools/registry.js";

function makeRegistry(): Registry {
  const registry = new Registry();
  registry.register({
    name: "echo_tool",
    description: "Echoes its input back.",
    parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    handler: async (args) => ({ echoed: (args as { text: string }).text }),
  });
  registry.register({
    name: "structured_tool",
    description: "Already returns a structured ToolResult.",
    parameters: { type: "object", properties: {} },
    handler: async () => ({ ok: true, data: { value: 42 } }),
  });
  registry.register({
    name: "broken_tool",
    description: "Always throws.",
    parameters: { type: "object", properties: {} },
    handler: async () => {
      throw new Error("boom");
    },
  });
  return registry;
}

describe("GET /tools — unified tool plane", () => {
  it("lists every registry tool with name, description and parameters", () => {
    const result = handleToolsList(makeRegistry());
    expect(result.status).toBe(200);
    const tools = (result.json as { tools: Array<{ name: string; description: string; parameters: object }> }).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(["broken_tool", "echo_tool", "structured_tool"]);
    const echo = tools.find((t) => t.name === "echo_tool")!;
    expect(echo.description).toBe("Echoes its input back.");
    expect(echo.parameters).toMatchObject({ type: "object" });
  });
});

describe("POST /tools/call — unified dispatch", () => {
  it("dispatches and wraps a plain result as ok/data", async () => {
    const result = await handleToolsCall(makeRegistry(), JSON.stringify({ name: "echo_tool", args: { text: "hi" } }));
    expect(result.status).toBe(200);
    expect(result.json).toEqual({ ok: true, data: { echoed: "hi" } });
  });

  it("passes through a result that is already a ToolResult", async () => {
    const result = await handleToolsCall(makeRegistry(), JSON.stringify({ name: "structured_tool", args: {} }));
    expect(result.status).toBe(200);
    expect(result.json).toEqual({ ok: true, data: { value: 42 } });
  });

  it("returns 404 with a structured error for an unknown tool", async () => {
    const result = await handleToolsCall(makeRegistry(), JSON.stringify({ name: "ghost", args: {} }));
    expect(result.status).toBe(404);
    expect(result.json).toMatchObject({ ok: false, error: { code: "UNKNOWN_TOOL" } });
  });

  it("shapes a thrown tool error as a structured failure, status 200", async () => {
    const result = await handleToolsCall(makeRegistry(), JSON.stringify({ name: "broken_tool", args: {} }));
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ ok: false, error: { code: "TOOL_ERROR", message: "boom" } });
  });

  it("rejects malformed bodies", async () => {
    expect((await handleToolsCall(makeRegistry(), "not json")).status).toBe(400);
    expect((await handleToolsCall(makeRegistry(), JSON.stringify({ args: {} }))).status).toBe(400);
    expect((await handleToolsCall(makeRegistry(), JSON.stringify({ name: "echo_tool", args: "x" }))).status).toBe(400);
  });
});
