export type ToolFailure = {
  code: string;
  message: string;
  details?: unknown;
};

export type ToolResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: ToolFailure };

export interface ToolHandle {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  invoke(args: unknown): Promise<ToolResult>;
}

export type McpServerConfig = {
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
  retryBackoffMs?: number;
};

export type McpConfigFile = {
  servers: McpServerConfig[];
};

export function failure(code: string, message: string, details?: unknown): ToolResult {
  return { ok: false, error: { code, message, details } };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
