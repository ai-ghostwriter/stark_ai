import { assertAllowedCommand } from "../../policy/commandPolicy.js";
import { spawnCommand, type CommandResult } from "./spawnCommand.js";

export type { CommandResult } from "./spawnCommand.js";

export type CodexSandbox = "read-only" | "workspace-write";

export interface CodexRunOptions {
  cwd: string;
  sandbox?: CodexSandbox;
  unsafe?: boolean;
  timeoutMs?: number;
}

export function buildCodexArgs(prompt: string, opts: CodexRunOptions): string[] {
  assertAllowedCommand(["codex"]);

  const args = ["exec", "--skip-git-repo-check", "--ephemeral"];
  if (opts.unsafe) {
    args.push("--dangerously-bypass-approvals-and-sandbox", "-s", "danger-full-access");
  } else if (opts.sandbox) {
    args.push("-s", opts.sandbox);
  }
  args.push("-C", opts.cwd, prompt);
  return args;
}

export type CodexRunner = (prompt: string, opts: CodexRunOptions) => Promise<CommandResult>;

export const runCodex: CodexRunner = (prompt, opts) =>
  spawnCommand("codex", buildCodexArgs(prompt, opts), {
    timeoutMs: opts.timeoutMs ?? 900_000,
  });
