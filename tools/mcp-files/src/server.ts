import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createFileController, fileControllerSchema } from "./fileController.js";
import { createFileProcessor, fileProcessorSchema } from "./fileProcessor.js";
import { rootsFromEnv } from "./roots.js";

const roots = rootsFromEnv();
const tools = {
  file_controller: {
    description: "List, move, copy, rename, and delete files inside configured user-scoped roots.",
    inputSchema: fileControllerSchema,
    handler: createFileController({ roots }),
  },
  file_processor: {
    description: "Read and extract text/metadata from txt, md, json, csv, and best-effort pdf metadata.",
    inputSchema: fileProcessorSchema,
    handler: createFileProcessor({ roots }),
  },
};

const server = new Server({ name: "stark-ai-mcp-files", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })),
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
