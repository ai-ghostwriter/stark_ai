import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "./types.js";

export class MissingApiKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY non impostata: task pesante non instradabile.");
    this.name = "MissingApiKeyError";
  }
}

interface ChatApiArgs {
  apiKey: string | undefined;
  model: string;
  messages: Message[];
}

interface AnthropicLike {
  messages: { create: (req: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }> };
}

export async function chatApi(args: ChatApiArgs, client?: AnthropicLike): Promise<string> {
  if (!args.apiKey) throw new MissingApiKeyError();
  const c: AnthropicLike = client ?? (new Anthropic({ apiKey: args.apiKey }) as unknown as AnthropicLike);

  const systemText = args.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const convo = args.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

  const system = systemText
    ? [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }]
    : undefined;

  const resp = await c.messages.create({
    model: args.model,
    max_tokens: 4096,
    system,
    messages: convo,
  });
  return resp.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trimEnd();
}
