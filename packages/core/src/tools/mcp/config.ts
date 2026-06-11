import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { McpConfigFile, McpServerConfig } from "./types.js";

export async function loadMcpConfig(path = resolve(process.cwd(), "..", "..", "tools", "mcp.config.json")): Promise<McpServerConfig[]> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as McpConfigFile;
    if (!Array.isArray(parsed.servers)) return [];
    return parsed.servers;
  } catch {
    return [];
  }
}
