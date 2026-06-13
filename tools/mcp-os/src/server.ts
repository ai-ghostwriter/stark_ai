import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "./exec.js";
import { createOpenApp, openAppSchema } from "./openApp.js";
import { createComputerControl, computerControlSchema } from "./computerControl.js";
import { createComputerSettings, computerSettingsSchema } from "./computerSettings.js";
import { createDesktop, desktopSchema } from "./desktop.js";

const tools = {
  open_app: {
    description: "Launch or focus an application by name. macOS uses open -a with fallback.",
    inputSchema: openAppSchema,
    handler: createOpenApp({ execFile, which: () => undefined }),
  },
  computer_control: {
    description: "Safe OS controls: output volume, microphone volume, display sleep, lock screen. Shutdown/restart are excluded by design.",
    inputSchema: computerControlSchema,
    handler: createComputerControl({ execFile }),
  },
  computer_settings: {
    description: "Read system information: memory, disk, CPU and battery where available.",
    inputSchema: computerSettingsSchema,
    handler: createComputerSettings(),
  },
  desktop: {
    description: "Desktop utilities: screenshot to file and best-effort window listing.",
    inputSchema: desktopSchema,
    handler: createDesktop({ execFile }),
  },
};

const server = new Server({ name: "stark-ai-mcp-os", version: "0.1.0" }, { capabilities: { tools: {} } });

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
