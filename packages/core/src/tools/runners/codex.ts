import { spawn } from "node:child_process";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CodexRunner = (prompt: string, opts: { cwd: string }) => Promise<CommandResult>;

export const runCodex: CodexRunner = (prompt, opts) =>
  new Promise<CommandResult>((resolve) => {
    const proc = spawn("codex", [
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--dangerously-bypass-approvals-and-sandbox",
      "-s",
      "danger-full-access",
      "-C",
      opts.cwd,
      prompt,
    ]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e) => resolve({ code: -1, stdout, stderr: stderr + String(e) }));
    proc.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
