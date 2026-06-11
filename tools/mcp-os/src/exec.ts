import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { ExecFile } from "./types.js";

const execFileAsync = promisify(execFileCb);

export const execFile: ExecFile = async (file, args, options) => {
  const result = await execFileAsync(file, args, {
    timeout: options?.timeout,
    encoding: options?.encoding ?? "utf8",
  });
  return {
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
};
