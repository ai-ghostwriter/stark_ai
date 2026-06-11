export type ToolFailure = {
  code: string;
  message: string;
  details?: unknown;
};

export type ToolResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: ToolFailure };

export function success<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

export function failure<T = unknown>(code: string, message: string, details?: unknown): ToolResult<T> {
  return { ok: false, error: { code, message, details } };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
