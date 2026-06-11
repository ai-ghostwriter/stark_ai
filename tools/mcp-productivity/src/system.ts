import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { ExecFile, FetchJson, OpenTarget } from "./types.js";

const execFileAsync = promisify(execFileCb);

export const execFile: ExecFile = async (file, args, options) => {
  const result = await execFileAsync(file, args, { timeout: options?.timeout, encoding: "utf8" });
  return { stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") };
};

export const openTarget: OpenTarget = async (target) => {
  if (process.platform === "darwin") return void await execFileAsync("open", [target]);
  if (process.platform === "win32") return void await execFileAsync("cmd", ["/c", "start", "", target]);
  return void await execFileAsync("xdg-open", [target]);
};

export const fetchJson: FetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};
