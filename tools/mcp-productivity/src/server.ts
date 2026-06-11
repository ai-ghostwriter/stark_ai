import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createReminder, appendLocalReminder, nativeScheduler, reminderSchema } from "./reminder.js";
import { createSendMessage, sendMessageSchema } from "./sendMessage.js";
import { execFile, fetchJson, openTarget } from "./system.js";
import { createWeatherReport, weatherReportSchema } from "./weatherReport.js";

const tools = {
  reminder: { description: "Schedule a reminder through macOS Reminders when available, otherwise append to a local JSONL reminder store.", inputSchema: reminderSchema, handler: createReminder({ scheduleNative: nativeScheduler(execFile), appendLocal: appendLocalReminder }) },
  weather_report: { description: "Open-Meteo weather report. This MCP tool intentionally overrides overlapping in-process weather tools.", inputSchema: weatherReportSchema, handler: createWeatherReport({ fetchJson }) },
  send_message: { description: "Safe message draft helper: opens target app/link but never auto-sends to a recipient.", inputSchema: sendMessageSchema, handler: createSendMessage({ open: openTarget }) },
};

const server = new Server({ name: "stark-ai-mcp-productivity", version: "0.1.0" }, { capabilities: { tools: {} } });

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
