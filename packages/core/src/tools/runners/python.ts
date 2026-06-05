import { spawn } from "node:child_process";

export interface PythonResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type PythonRunner = (script: string, args: string[]) => Promise<PythonResult>;

export const runPython: PythonRunner = (script, args) =>
  new Promise<PythonResult>((resolve) => {
    const proc = spawn("python3", [script, ...args]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e) => resolve({ code: -1, stdout, stderr: stderr + String(e) }));
    proc.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
