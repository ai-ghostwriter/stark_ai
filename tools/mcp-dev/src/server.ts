import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createCodeHelper, codeHelperSchema } from "./codeHelper.js";
import { createDevAgent, devAgentSchema } from "./devAgent.js";
import { createGameUpdater, gameUpdaterSchema } from "./gameUpdater.js";

const tools = {
  code_helper: { description: "Deterministic code helper: run supported files with captured output. LLM write/edit/explain is excluded.", inputSchema: codeHelperSchema, handler: createCodeHelper() },
  dev_agent: { description: "Deterministic dev helper: project scaffolding and command execution. LLM project planning is excluded.", inputSchema: devAgentSchema, handler: createDevAgent() },
  game_updater: { description: "Deterministic game helper: known Steam app id resolution and local manifest status. Launcher mutation is excluded.", inputSchema: gameUpdaterSchema, handler: createGameUpdater() },
};

const server = new Server({ name: "stark-ai-mcp-dev", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(tools).map(([name, tool]) => ({ name, description: tool.description, inputSchema: tool.inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools[request.params.name as keyof typeof tools];
  if (!tool) {
    const result = { ok: false, error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${request.params.name}` } };
    return { isError: true, content: [{ type: "text", text: JSON.stringify(result) }] };
  }
  const result = await tool.handler((request.params.arguments ?? {}) as Record<string, unknown>);
  return { isError: !result.ok, content: [{ type: "text", text: JSON.stringify(result) }] };
});

await server.connect(new StdioServerTransport());
