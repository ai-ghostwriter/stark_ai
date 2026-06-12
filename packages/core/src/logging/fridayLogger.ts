import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface FridayLogRecord {
  agent: string;
  event: string;
  payload: Record<string, unknown>;
  level?: "info" | "warn" | "error";
  timestamp?: string;
}

export interface FridayLogOptions {
  filePath?: string;
  timestamp?: string;
}

export function defaultFridayLogPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../../logs/friday.jsonl");
}

export function writeFridayLog(record: FridayLogRecord, opts: FridayLogOptions = {}): string {
  const filePath = opts.filePath ?? defaultFridayLogPath();
  const timestamp = opts.timestamp ?? record.timestamp ?? new Date().toISOString();
  const entry = {
    timestamp,
    level: record.level ?? "info",
    agent: record.agent,
    event: record.event,
    payload: record.payload,
  };

  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  return filePath;
}
