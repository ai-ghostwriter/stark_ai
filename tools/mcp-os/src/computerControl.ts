import type { ExecFile, PlatformName, ToolResult } from "./types.js";
import { errorMessage, failure, success } from "./types.js";

export type ComputerControlDeps = {
  platform?: PlatformName;
  execFile: ExecFile;
};

const safeActions = [
  "volume_set",
  "volume_up",
  "volume_down",
  "mute",
  "mic_set",
  "mic_mute",
  "sleep_display",
  "lock_screen",
] as const;

type SafeAction = typeof safeActions[number];

export const computerControlSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: safeActions },
    value: { type: "number", minimum: 0, maximum: 100 },
  },
  required: ["action"],
  additionalProperties: false,
};

function clampPercent(value: unknown, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

async function runMac(action: SafeAction, value: unknown, execFile: ExecFile): Promise<void> {
  if (action === "volume_set") {
    await execFile("osascript", ["-e", `set volume output volume ${clampPercent(value, 50)}`], { timeout: 5000 });
    return;
  }
  if (action === "volume_up") {
    await execFile("osascript", ["-e", "set volume output volume (output volume of (get volume settings) + 10)"], { timeout: 5000 });
    return;
  }
  if (action === "volume_down") {
    await execFile("osascript", ["-e", "set volume output volume (output volume of (get volume settings) - 10)"], { timeout: 5000 });
    return;
  }
  if (action === "mute") {
    await execFile("osascript", ["-e", "set volume with output muted"], { timeout: 5000 });
    return;
  }
  if (action === "mic_set") {
    await execFile("osascript", ["-e", `set volume input volume ${clampPercent(value, 50)}`], { timeout: 5000 });
    return;
  }
  if (action === "mic_mute") {
    // AppleScript has no reliable input-muted flag, so mute = input volume 0
    // (unlike Linux which uses a real mute flag). Recover with mic_set <n>.
    await execFile("osascript", ["-e", "set volume input volume 0"], { timeout: 5000 });
    return;
  }
  if (action === "sleep_display" || action === "lock_screen") {
    await execFile("pmset", ["displaysleepnow"], { timeout: 5000 });
  }
}

async function runLinux(action: SafeAction, value: unknown, execFile: ExecFile): Promise<void> {
  if (action === "volume_set") await execFile("pactl", ["set-sink-volume", "@DEFAULT_SINK@", `${clampPercent(value, 50)}%`], { timeout: 5000 });
  else if (action === "volume_up") await execFile("pactl", ["set-sink-volume", "@DEFAULT_SINK@", "+10%"], { timeout: 5000 });
  else if (action === "volume_down") await execFile("pactl", ["set-sink-volume", "@DEFAULT_SINK@", "-10%"], { timeout: 5000 });
  else if (action === "mute") await execFile("pactl", ["set-sink-mute", "@DEFAULT_SINK@", "toggle"], { timeout: 5000 });
  else if (action === "mic_set") await execFile("pactl", ["set-source-volume", "@DEFAULT_SOURCE@", `${clampPercent(value, 50)}%`], { timeout: 5000 });
  else if (action === "mic_mute") await execFile("pactl", ["set-source-mute", "@DEFAULT_SOURCE@", "1"], { timeout: 5000 });
  else if (action === "lock_screen") await execFile("loginctl", ["lock-session"], { timeout: 5000 });
  else if (action === "sleep_display") await execFile("xset", ["dpms", "force", "off"], { timeout: 5000 });
}

async function runWindows(action: SafeAction, value: unknown, execFile: ExecFile): Promise<void> {
  if (action === "volume_set") {
    const script = `(New-Object -ComObject WScript.Shell).SendKeys([char]173); Start-Sleep -Milliseconds 50;`;
    await execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 5000 });
    return;
  }
  if (action === "lock_screen") await execFile("rundll32.exe", ["user32.dll,LockWorkStation"], { timeout: 5000 });
  else await execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Write-Output '${action}:${clampPercent(value, 50)}'`], { timeout: 5000 });
}

export function createComputerControl(deps: ComputerControlDeps) {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const action = String(args.action ?? "").trim().toLowerCase();
    if (!safeActions.includes(action as SafeAction)) {
      return failure("UNSUPPORTED_ACTION", `Action '${action || "(empty)"}' is not supported. Destructive actions are excluded by design.`);
    }

    const platform = deps.platform ?? process.platform;
    try {
      if (platform === "darwin") await runMac(action as SafeAction, args.value, deps.execFile);
      else if (platform === "linux") await runLinux(action as SafeAction, args.value, deps.execFile);
      else if (platform === "win32") await runWindows(action as SafeAction, args.value, deps.execFile);
      else return failure("UNSUPPORTED_PLATFORM", `Unsupported platform: ${platform}`);
      return success({ action, platform });
    } catch (error) {
      return failure("CONTROL_FAILED", `Computer control action failed: ${action}`, errorMessage(error));
    }
  };
}
