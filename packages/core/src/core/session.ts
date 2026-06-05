import type { Message } from "../llm/types.js";

export class Session {
  private history: Message[] = [];

  append(msg: Message): void {
    this.history.push(msg);
  }

  messages(): Message[] {
    return [...this.history];
  }

  setHistory(history: Message[]): void {
    this.history = [...history];
  }
}
