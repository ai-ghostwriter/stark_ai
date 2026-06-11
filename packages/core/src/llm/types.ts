import type { PersonaProfile } from "@stark-ai/contracts";

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

export interface Message {
  role: Role;
  content: string;
  tool_calls?: ToolCall[];
  name?: string;
  tool_name?: string;
}

export type Target = "local" | "api";

export type ApiTier = "haiku" | "sonnet" | "opus";

export type TaskType =
  | "extract" | "classify" | "summarize" | "translate"
  | "write" | "analyze" | "copy"
  | "manuscript" | "strategy" | "critical" | "creative";

export interface Route {
  target: Target;
  model: string;
  reason: string;
}

export interface Result {
  route: Target;
  model: string;
  tool: string | null;
  reply: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface RouteCtx {
  override?: Target;
  heavy?: boolean;
  taskType?: TaskType;
  apiTier?: ApiTier;
  online?: boolean;
  sensitive?: boolean;
  personaHints?: PersonaProfile["routingHints"];
}
