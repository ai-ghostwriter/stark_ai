import type { Registry } from "../registry.js";
import { loadMcpConfig } from "./config.js";
import { McpServerHandle } from "./serverHandle.js";
import type { McpServerConfig } from "./types.js";

export type McpRuntime = {
  servers: McpServerHandle[];
  close: () => Promise<void>;
};

export async function registerMcpTools(registry: Registry, configs?: McpServerConfig[]): Promise<McpRuntime> {
  const serverConfigs = configs ?? await loadMcpConfig();
  const servers: McpServerHandle[] = [];
  const counts: Array<{ name: string; count: number }> = [];

  for (const config of serverConfigs) {
    const server = new McpServerHandle(config);
    servers.push(server);
    try {
      const handles = await server.connect();
      for (const handle of handles) registry.registerHandle(handle);
      counts.push({ name: config.name, count: handles.length });
    } catch (error) {
      console.warn(`[mcp] server '${config.name}' unavailable: ${error instanceof Error ? error.message : String(error)}`);
      counts.push({ name: config.name, count: 0 });
    }
  }
  if (serverConfigs.length > 0) {
    const total = counts.reduce((sum, entry) => sum + entry.count, 0);
    console.info(`[mcp] registered ${total} tool(s) from ${counts.length} server(s): ${counts.map((entry) => `${entry.name}=${entry.count}`).join(", ")}`);
  }

  return {
    servers,
    close: async () => {
      await Promise.all(servers.map((server) => server.close()));
    },
  };
}
