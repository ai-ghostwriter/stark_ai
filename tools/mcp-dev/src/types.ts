export type ToolFailure = { code: string; message: string; details?: unknown };
export type ToolResult<T = unknown> = { ok: true; data: T } | { ok: false; error: ToolFailure };
export type CommandResult = { code: number; stdout: string; stderr: string };
export type RunFile = (filePath: string, args: string[], timeoutMs: number) => Promise<CommandResult>;
export type RunCommand = (command: string[], cwd: string, timeoutMs: number) => Promise<CommandResult>;

export function success<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

export function failure<T = unknown>(code: string, message: string, details?: unknown): ToolResult<T> {
  return { ok: false, error: { code, message, details } };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
