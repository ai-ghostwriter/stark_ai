import { describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import type { Event } from "@stark-ai/contracts";
import { handleToolsCall, handleToolsList } from "../src/server.js";
import { Registry } from "../src/tools/registry.js";

function makeRegistry(options: { includeRenderTool?: boolean } = {}): Registry {
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
  if (options.includeRenderTool) {
    registry.register({
      name: "brief_tool",
      description: "Returns spoken text and a render payload.",
      parameters: { type: "object", properties: {} },
      handler: async () => ({
        spoken: "Tre segnali oggi.",
        render: { type: "stark.brief", title: "Daily Brief", payload: { summary: "ok" } },
      }),
    });
  }
  return registry;
}

function waitForRenderEvent(events: Event[]): Promise<Event> {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error("render.event was not published")), 500);
    const timer = setInterval(() => {
      const event = events.find((candidate) => candidate.type === "render.event");
      if (event) {
        clearTimeout(deadline);
        clearInterval(timer);
        resolve(event);
      }
    }, 5);
  });
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

  it("publishes RenderResult payloads to the hub and returns spoken text only", async () => {
    const hub = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    const events: Event[] = [];
    const sockets = new Set<WebSocket>();
    hub.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("message", (data) => events.push(JSON.parse(data.toString()) as Event));
    });
    await new Promise<void>((resolve) => hub.once("listening", resolve));
    const address = hub.address();
    if (!address || typeof address === "string") throw new Error("fake hub did not expose a port");
    const previousHubUrl = process.env.STARK_HUB_URL;
    process.env.STARK_HUB_URL = `ws://127.0.0.1:${address.port}`;

    try {
      const result = await handleToolsCall(makeRegistry({ includeRenderTool: true }), JSON.stringify({ name: "brief_tool", args: {} }));

      expect(result.status).toBe(200);
      expect(result.json).toEqual({ ok: true, data: "Tre segnali oggi." });
      await expect(waitForRenderEvent(events)).resolves.toMatchObject({
        type: "render.event",
        tool: "brief_tool",
        render: "stark.brief",
        title: "Daily Brief",
        spoken: "Tre segnali oggi.",
        payload: { summary: "ok" },
      });
    } finally {
      if (previousHubUrl === undefined) {
        delete process.env.STARK_HUB_URL;
      } else {
        process.env.STARK_HUB_URL = previousHubUrl;
      }
      for (const socket of sockets) socket.terminate();
      await new Promise<void>((resolve, reject) => hub.close((error) => error ? reject(error) : resolve()));
    }
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
