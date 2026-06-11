import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { ExecFile, ToolResult } from "./types.js";
import { errorMessage, failure, success } from "./types.js";

export const reminderSchema = {
  type: "object",
  properties: {
    date: { type: "string", description: "YYYY-MM-DD" },
    time: { type: "string", description: "HH:MM" },
    message: { type: "string" },
  },
  required: ["date", "time"],
};

export type ReminderEntry = { id: string; due: string; message: string; createdAt: string };
export type NativeScheduleResult = { ok: true; id: string } | { ok: false; reason: string };

function sanitize(text: string): string {
  return text.replace(/[\\'"\r\n]/g, " ").trim().slice(0, 200) || "Reminder";
}

export async function appendLocalReminder(entry: ReminderEntry, storePath = process.env.STARK_AI_REMINDERS_PATH ?? join(homedir(), ".stark-ai", "reminders.jsonl")): Promise<void> {
  await mkdir(dirname(storePath), { recursive: true });
  await appendFile(storePath, `${JSON.stringify(entry)}\n`, "utf8");
}

export function nativeScheduler(execFile: ExecFile) {
  return async (entry: ReminderEntry): Promise<NativeScheduleResult> => {
    if (process.platform !== "darwin") return { ok: false, reason: "native scheduler only implemented for macOS osascript" };
    const due = new Date(entry.due);
    const script = [
      "tell application \"Reminders\"",
      "set newReminder to make new reminder",
      `set name of newReminder to ${JSON.stringify(entry.message)}`,
      `set remind me date of newReminder to date ${JSON.stringify(due.toLocaleString("en-US"))}`,
      "end tell",
    ].join("\n");
    try {
      await execFile("osascript", ["-e", script], { timeout: 5000 });
      return { ok: true, id: entry.id };
    } catch (error) {
      return { ok: false, reason: errorMessage(error) };
    }
  };
}

export function createReminder(deps: { now?: () => Date; scheduleNative: (entry: ReminderEntry) => Promise<NativeScheduleResult>; appendLocal: (entry: ReminderEntry) => Promise<void> }) {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const date = String(args.date ?? "").trim();
    const time = String(args.time ?? "").trim();
    if (!date || !time) return failure("MISSING_DUE_TIME", "I need both a date and a time to set a reminder.");
    const due = new Date(`${date}T${time}:00`);
    if (Number.isNaN(due.getTime())) return failure("INVALID_DUE_TIME", "Use YYYY-MM-DD and HH:MM.");
    const now = deps.now?.() ?? new Date();
    if (due <= now) return failure("PAST_DUE_TIME", "That time has already passed.");
    const entry: ReminderEntry = { id: `rem_${due.getTime()}`, due: due.toISOString(), message: sanitize(String(args.message ?? "Reminder")), createdAt: now.toISOString() };
    try {
      const native = await deps.scheduleNative(entry);
      if (native.ok) return success({ backend: "macos_reminders", id: native.id, due: entry.due, message: entry.message });
      await deps.appendLocal(entry);
      return success({ backend: "local_json", id: entry.id, due: entry.due, message: entry.message, nativeError: native.reason });
    } catch (error) {
      return failure("REMINDER_FAILED", "Could not schedule reminder.", errorMessage(error));
    }
  };
}
