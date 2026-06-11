import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createBrowserControl, browserControlSchema } from "./browserControl.js";
import { createFlightFinder, flightFinderSchema } from "./flightFinder.js";
import { fetchText, openUrl } from "./open.js";
import { createWebSearch, webSearchSchema } from "./webSearch.js";
import { createYoutubeVideo, youtubeVideoSchema } from "./youtubeVideo.js";

const tools = {
  browser_control: { description: "Open normalized URLs and search pages through the system browser. DOM automation is intentionally excluded.", inputSchema: browserControlSchema, handler: createBrowserControl({ open: openUrl }) },
  web_search: { description: "Fetch and lightly parse DuckDuckGo HTML search results without LLM summarization.", inputSchema: webSearchSchema, handler: createWebSearch({ fetchText }) },
  youtube_video: { description: "Open YouTube videos/searches and fetch lightweight deterministic video metadata.", inputSchema: youtubeVideoSchema, handler: createYoutubeVideo({ open: openUrl, fetchText }) },
  flight_finder: { description: "Build and optionally open Google Flights deep links. No fragile scraping.", inputSchema: flightFinderSchema, handler: createFlightFinder({ open: openUrl }) },
};

const server = new Server({ name: "stark-ai-mcp-web", version: "0.1.0" }, { capabilities: { tools: {} } });

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
