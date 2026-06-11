import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { OpenUrl } from "./types.js";

const execFileAsync = promisify(execFile);

export const openUrl: OpenUrl = async (url) => {
  if (process.platform === "darwin") {
    await execFileAsync("open", [url]);
    return;
  }
  if (process.platform === "win32") {
    await execFileAsync("cmd", ["/c", "start", "", url]);
    return;
  }
  await execFileAsync("xdg-open", [url]);
};

export const fetchText: (url: string) => Promise<string> = async (url) => {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 STARK-AI/0.1" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
};
