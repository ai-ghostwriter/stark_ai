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

  for (const config of serverConfigs) {
    const server = new McpServerHandle(config);
    servers.push(server);
    try {
      const handles = await server.connect();
      for (const handle of handles) registry.registerHandle(handle);
    } catch (error) {
      console.warn(`[mcp] server '${config.name}' unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    servers,
    close: async () => {
      await Promise.all(servers.map((server) => server.close()));
    },
  };
}
