import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServerConfig, ToolHandle, ToolResult } from "./types.js";
import { errorMessage, failure } from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_BACKOFF_MS = 100;

type ClientState = {
  client: Client;
  transport: StdioClientTransport;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error("Tool timed out."), { code: "TOOL_TIMEOUT" })), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function parseCallResult(result: CallToolResult): ToolResult {
  const first = result.content?.[0];
  if (first?.type === "text" && typeof first.text === "string") {
    try {
      return JSON.parse(first.text) as ToolResult;
    } catch {
      return { ok: true, data: first.text };
    }
  }
  return { ok: true, data: result };
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "TOOL_TIMEOUT";
}

export class McpServerHandle {
  private state: ClientState | null = null;
  private handles: ToolHandle[] = [];
  private unavailable = false;

  constructor(private readonly config: McpServerConfig) {}

  async connect(): Promise<ToolHandle[]> {
    await this.close();
    const transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args ?? [],
      cwd: this.config.cwd,
    });
    const client = new Client({ name: `stark-ai-core:${this.config.name}`, version: "0.1.0" }, { capabilities: {} });
    await client.connect(transport);
    this.state = { client, transport };
    this.unavailable = false;

    const listed = await client.listTools();
    this.handles = listed.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? `${tool.name} MCP tool`,
      schema: (tool.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
      invoke: (args: unknown) => this.invoke(tool.name, args),
    }));
    return this.handles;
  }

  tools(): ToolHandle[] {
    return this.handles;
  }

  async close(): Promise<void> {
    if (!this.state) return;
    const current = this.state;
    this.state = null;
    try {
      await current.client.close();
    } catch {
      // Closing a crashed MCP transport should never escape into core shutdown.
    }
  }

  private async ensureConnected(): Promise<ClientState> {
    if (this.state && !this.unavailable) return this.state;
    await this.connect();
    if (!this.state) throw new Error("MCP server did not connect.");
    return this.state;
  }

  private async invoke(name: string, args: unknown): Promise<ToolResult> {
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retryBackoffMs = this.config.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;

    try {
      const state = await this.ensureConnected();
      const result = await withTimeout(
        state.client.callTool({ name, arguments: (args ?? {}) as Record<string, unknown> }) as Promise<CallToolResult>,
        timeoutMs,
      );
      return parseCallResult(result);
    } catch (error) {
      await this.close();
      this.unavailable = true;
      if (isTimeout(error)) return failure("TOOL_TIMEOUT", `MCP tool '${name}' timed out after ${timeoutMs}ms.`);

      await delay(retryBackoffMs);
      try {
        await this.connect();
      } catch {
        // The first failing call still returns a structured transport error; the respawn is best effort.
      }
      return failure("MCP_TRANSPORT_ERROR", `MCP tool '${name}' transport failed.`, errorMessage(error));
    }
  }
}
