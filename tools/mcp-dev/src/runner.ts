import { spawn } from "node:child_process";
import type { CommandResult, RunCommand, RunFile } from "./types.js";

const interpreters: Record<string, string[]> = {
  ".py": ["python3"],
  ".js": ["node"],
  ".mjs": ["node"],
  ".ts": ["npx", "tsx"],
  ".sh": ["bash"],
};

function suffix(path: string): string {
  const match = /\.[^./]+$/.exec(path);
  return match?.[0]?.toLowerCase() ?? "";
}

function run(command: string[], cwd: string | undefined, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    const proc = spawn(command[0]!, command.slice(1), { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      resolve({ code: -1, stdout, stderr: `${stderr}\nTimed out after ${timeoutMs}ms.`.trim() });
    }, timeoutMs);
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}${String(e)}` });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

export const runFile: RunFile = async (filePath, args, timeoutMs) => {
  const interp = interpreters[suffix(filePath)];
  if (!interp) return { code: -1, stdout: "", stderr: `No interpreter for ${suffix(filePath)}.` };
  return run([...interp, filePath, ...args], undefined, timeoutMs);
};

export const runCommand: RunCommand = async (command, cwd, timeoutMs) => run(command, cwd, timeoutMs);
