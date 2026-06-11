import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFile as defaultExecFile } from "./exec.js";
import type { ExecFile, PlatformName, ToolResult } from "./types.js";
import { errorMessage, failure, success } from "./types.js";

export type DesktopDeps = {
  platform?: PlatformName;
  execFile?: ExecFile;
  screenshot?: (path: string) => Promise<void>;
};

export const desktopSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["screenshot", "list_windows"] },
    path: { type: "string" },
  },
  required: ["action"],
  additionalProperties: false,
};

async function screencapture(path: string, execFile: ExecFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  if (process.platform === "darwin") await execFile("screencapture", ["-x", path], { timeout: 10000 });
  else if (process.platform === "linux") await execFile("gnome-screenshot", ["-f", path], { timeout: 10000 });
  else throw new Error("Screenshot is not implemented for this platform.");
}

export function createDesktop(deps: DesktopDeps = {}) {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const action = String(args.action ?? "").trim();
    const platform = deps.platform ?? process.platform;
    const execFile = deps.execFile ?? defaultExecFile;

    if (action === "screenshot") {
      const path = resolve(String(args.path ?? `${process.cwd()}/desktop-screenshot.png`));
      try {
        await (deps.screenshot ?? ((target) => screencapture(target, execFile)))(path);
        return success({ path });
      } catch (error) {
        return failure("SCREENSHOT_FAILED", "Could not capture screenshot.", errorMessage(error));
      }
    }

    if (action === "list_windows") {
      if (platform !== "darwin") return success({ windows: [], unavailableReason: `Window listing not implemented for ${platform}.` });
      try {
        const { stdout } = await execFile("osascript", [
          "-e",
          'tell application "System Events" to get name of every process whose background only is false',
        ], { timeout: 5000 });
        return success({ windows: stdout.split(",").map((entry) => entry.trim()).filter(Boolean) });
      } catch (error) {
        return success({ windows: [], unavailableReason: errorMessage(error) });
      }
    }

    return failure("UNSUPPORTED_ACTION", `Unknown desktop action '${action}'.`);
  };
}
