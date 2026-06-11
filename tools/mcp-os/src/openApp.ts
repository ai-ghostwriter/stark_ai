import { spawn } from "node:child_process";
import type { ExecFile, PlatformName, ToolResult } from "./types.js";
import { errorMessage, failure, success } from "./types.js";

type Which = (binary: string) => string | undefined;

export type OpenAppDeps = {
  platform?: PlatformName;
  execFile: ExecFile;
  which: Which;
};

const aliases: Record<string, Partial<Record<PlatformName, string>>> = {
  chrome: { win32: "chrome", darwin: "Google Chrome", linux: "google-chrome" },
  "google chrome": { win32: "chrome", darwin: "Google Chrome", linux: "google-chrome" },
  firefox: { win32: "firefox", darwin: "Firefox", linux: "firefox" },
  safari: { darwin: "Safari" },
  vscode: { win32: "code", darwin: "Visual Studio Code", linux: "code" },
  "visual studio code": { win32: "code", darwin: "Visual Studio Code", linux: "code" },
  code: { win32: "code", darwin: "Visual Studio Code", linux: "code" },
  terminal: { win32: "wt", darwin: "Terminal", linux: "gnome-terminal" },
  finder: { win32: "explorer.exe", darwin: "Finder", linux: "nautilus" },
  explorer: { win32: "explorer.exe", darwin: "Finder", linux: "nautilus" },
  calculator: { win32: "calc.exe", darwin: "Calculator", linux: "gnome-calculator" },
  settings: { win32: "ms-settings:", darwin: "System Settings", linux: "gnome-control-center" },
  slack: { win32: "Slack", darwin: "Slack", linux: "slack" },
  zoom: { win32: "Zoom", darwin: "zoom.us", linux: "zoom" },
  figma: { win32: "Figma", darwin: "Figma", linux: "figma" },
};

export const openAppSchema = {
  type: "object",
  properties: {
    appName: { type: "string", minLength: 1, description: "Application name or known alias." },
  },
  required: ["appName"],
  additionalProperties: false,
};

function normalize(raw: string, platform: PlatformName): string {
  const key = raw.trim().toLowerCase();
  if (aliases[key]?.[platform]) return aliases[key][platform]!;

  for (const [alias, perOs] of Object.entries(aliases)) {
    if ((alias.includes(key) || key.includes(alias)) && perOs[platform]) return perOs[platform]!;
  }
  return raw.trim();
}

async function launchMac(appName: string, deps: OpenAppDeps): Promise<void> {
  try {
    await deps.execFile("open", ["-a", appName], { timeout: 8000 });
    return;
  } catch {
    await deps.execFile("open", ["-a", `${appName}.app`], { timeout: 8000 });
  }
}

async function launchLinux(appName: string, deps: OpenAppDeps): Promise<void> {
  const binary =
    deps.which(appName) ??
    deps.which(appName.toLowerCase()) ??
    deps.which(appName.toLowerCase().replaceAll(" ", "-")) ??
    deps.which(appName.toLowerCase().replaceAll(" ", "_"));
  if (binary) {
    spawn(binary, { detached: true, stdio: "ignore" }).unref();
    return;
  }
  await deps.execFile("xdg-open", [appName], { timeout: 5000 });
}

async function launchWindows(appName: string, deps: OpenAppDeps): Promise<void> {
  if (appName.includes(":")) {
    await deps.execFile("cmd.exe", ["/c", "start", "", appName], { timeout: 5000 });
    return;
  }
  await deps.execFile(appName, [], { timeout: 5000 });
}

export function createOpenApp(deps: OpenAppDeps) {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const appName = String(args.appName ?? "").trim();
    if (!appName) return failure("INVALID_ARGUMENTS", "appName is required.");

    const platform = deps.platform ?? process.platform;
    const resolved = normalize(appName, platform);
    try {
      if (platform === "darwin") await launchMac(resolved, deps);
      else if (platform === "linux") await launchLinux(resolved, deps);
      else if (platform === "win32") await launchWindows(resolved, deps);
      else return failure("UNSUPPORTED_PLATFORM", `Unsupported platform: ${platform}`);
      return success({ requested: appName, resolved, platform, launched: true });
    } catch (error) {
      return failure("APP_LAUNCH_FAILED", `Could not launch ${appName}.`, {
        resolved,
        platform,
        cause: errorMessage(error),
      });
    }
  };
}
