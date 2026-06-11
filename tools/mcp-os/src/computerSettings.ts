import os from "node:os";
import { execFile } from "./exec.js";
import type { ToolResult } from "./types.js";
import { success } from "./types.js";

export type ComputerSettingsDeps = {
  totalmem?: () => number;
  freemem?: () => number;
  cpus?: () => Array<{ model: string }>;
  diskUsage?: () => Promise<{ total: number; free: number }>;
  batteryInfo?: () => Promise<Record<string, unknown>>;
};

export const computerSettingsSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

async function defaultDiskUsage(): Promise<{ total: number; free: number }> {
  if (process.platform === "darwin" || process.platform === "linux") {
    const { stdout } = await execFile("df", ["-k", os.homedir()], { timeout: 5000 });
    const line = stdout.trim().split("\n").at(-1) ?? "";
    const parts = line.trim().split(/\s+/);
    const total = Number(parts[1] ?? 0) * 1024;
    const free = Number(parts[3] ?? 0) * 1024;
    return { total, free };
  }
  return { total: 0, free: 0 };
}

async function defaultBatteryInfo(): Promise<Record<string, unknown>> {
  if (process.platform !== "darwin") return { available: false };
  try {
    const { stdout } = await execFile("pmset", ["-g", "batt"], { timeout: 5000 });
    const percent = /(\d+)%/.exec(stdout)?.[1];
    return { available: true, percent: percent ? Number(percent) : null, raw: stdout.trim() };
  } catch {
    return { available: false };
  }
}

export function createComputerSettings(deps: ComputerSettingsDeps = {}) {
  return async (_args: Record<string, unknown>): Promise<ToolResult> => {
    const totalBytes = (deps.totalmem ?? os.totalmem)();
    const freeBytes = (deps.freemem ?? os.freemem)();
    const disk = await (deps.diskUsage ?? defaultDiskUsage)();
    const battery = await (deps.batteryInfo ?? defaultBatteryInfo)();
    return success({
      platform: process.platform,
      arch: process.arch,
      cpuCount: (deps.cpus ?? os.cpus)().length,
      memory: { totalBytes, freeBytes, usedBytes: totalBytes - freeBytes },
      disk: { totalBytes: disk.total, freeBytes: disk.free, usedBytes: disk.total - disk.free },
      battery,
    });
  };
}
