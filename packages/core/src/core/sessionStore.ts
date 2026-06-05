import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Message } from "../llm/types.js";

export interface SessionStore {
  saveSession(history: Message[]): Promise<void>;
  loadSession(): Promise<Message[]>;
}

function isMessage(value: unknown): value is Message {
  if (typeof value !== "object" || value === null) return false;
  const maybe = value as Partial<Message>;
  return (
    (maybe.role === "system" || maybe.role === "user" || maybe.role === "assistant" || maybe.role === "tool") &&
    typeof maybe.content === "string"
  );
}

export class JsonSessionStore implements SessionStore {
  constructor(private readonly filePath: string) {}

  async saveSession(history: Message[]): Promise<void> {
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(history, null, 2), "utf8");
    } catch (e) {
      process.stderr.write(`Errore salvataggio sessione JARVIS: ${(e as Error).message}\n`);
    }
  }

  async loadSession(): Promise<Message[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.every(isMessage) ? parsed : [];
    } catch {
      return [];
    }
  }
}
