import { assertAllowedCommand } from "../../policy/commandPolicy.js";
import { spawnCommand, type CommandResult } from "./spawnCommand.js";

export interface ClaudeRunOptions {
  cwd: string;
  timeoutMs?: number;
}

export function buildClaudeArgs(): string[] {
  assertAllowedCommand(["claude"]);
  // Spike 2026-06-12: i settings utente pre-approvano i permessi di scrittura,
  // quindi il deny va reso esplicito — architect e reviewer non devono mai modificare file.
  // Il prompt viaggia su stdin: --disallowedTools è variadico e mangerebbe un argomento successivo.
  return ["-p", "--disallowedTools", "Edit,Write,NotebookEdit,Bash"];
}

export type ClaudeRunner = (prompt: string, opts: ClaudeRunOptions) => Promise<CommandResult>;

export const runClaude: ClaudeRunner = (prompt, opts) =>
  spawnCommand("claude", buildClaudeArgs(), {
    cwd: opts.cwd,
    stdin: prompt,
    timeoutMs: opts.timeoutMs ?? 900_000,
  });
