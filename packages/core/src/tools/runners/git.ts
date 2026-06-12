import { assertAllowedCommand } from "../../policy/commandPolicy.js";
import { assertWorkspaceAllowed, defaultWorkspaceRoot } from "../../policy/workspacePolicy.js";
import { spawnCommand, type CommandResult } from "./spawnCommand.js";

const SAFE_SUBCOMMANDS = new Set(["status", "diff", "branch", "log", "show"]);

export interface GitRunOptions {
  root?: string;
  timeoutMs?: number;
}

export type GitRunner = (args: string[], cwd: string, opts?: GitRunOptions) => Promise<CommandResult>;

export const runGit: GitRunner = async (args, cwd, opts = {}) => {
  assertAllowedCommand(["git"]);
  const sub = args[0];
  if (!sub || !SAFE_SUBCOMMANDS.has(sub)) {
    throw new Error(`Sottocomando git non consentito: ${sub ?? "(vuoto)"}.`);
  }
  const workdir = assertWorkspaceAllowed(cwd, opts.root ?? defaultWorkspaceRoot());
  return spawnCommand("git", args, { cwd: workdir, timeoutMs: opts.timeoutMs ?? 60_000 });
};
