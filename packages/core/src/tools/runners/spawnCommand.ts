import { spawn } from "node:child_process";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface SpawnCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Contenuto scritto su stdin e poi chiuso. Necessario per claude -p:
   *  --disallowedTools è variadico e mangerebbe un prompt passato come argomento. */
  stdin?: string;
}

export function spawnCommand(
  executable: string,
  args: string[],
  opts: SpawnCommandOptions = {},
): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve) => {
    const proc = spawn(executable, args, opts.cwd ? { cwd: opts.cwd } : {});
    if (opts.stdin !== undefined) {
      proc.stdin.write(opts.stdin);
    }
    proc.stdin.end();
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = opts.timeoutMs
      ? setTimeout(() => {
          stderr += `\n[spawnCommand] timeout dopo ${opts.timeoutMs}ms, processo terminato.`;
          proc.kill("SIGKILL");
        }, opts.timeoutMs)
      : null;

    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve(result);
    };

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e) => finish({ code: -1, stdout, stderr: stderr + String(e) }));
    proc.on("close", (code) => finish({ code: code ?? -1, stdout, stderr }));
  });
}
