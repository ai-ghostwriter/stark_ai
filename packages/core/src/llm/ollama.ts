import type { Message } from "./types.js";

export class OllamaDownError extends Error {
  constructor() {
    super("Ollama non raggiungibile. Avvialo con: ollama serve");
    this.name = "OllamaDownError";
  }
}

interface ChatLocalArgs {
  url: string;
  model: string;
  messages: Message[];
  tools?: unknown[];
  temperature?: number;
}

export async function chatLocal(args: ChatLocalArgs): Promise<Message> {
  const body: Record<string, unknown> = {
    model: args.model,
    messages: args.messages,
    stream: false,
    options: { temperature: args.temperature ?? 0.4 },
  };
  if (args.tools && args.tools.length > 0) body.tools = args.tools;

  let res: Response;
  try {
    res = await fetch(`${args.url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new OllamaDownError();
  }
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = (await res.json()) as { message: Message };
  return data.message;
}
