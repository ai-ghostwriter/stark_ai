import type { Event } from "@stark-ai/contracts";
import { randomUUID } from "node:crypto";
import { loadConfig, type Config } from "../config.js";
import { decide } from "../core/router.js";
import { OllamaDownError } from "../llm/ollama.js";
import type { Message, RouteCtx, ToolCall } from "../llm/types.js";
import { activePersona, type ActivePersonaState } from "../personas/active.js";
import { personaRegistry, type PersonaId, type PersonaRegistry } from "../personas/registry.js";
import { detectPersonaSwitch } from "../personas/switchIntent.js";
import { Registry } from "../tools/registry.js";
import { isRenderResult } from "../tools/render.js";

type BrainInput = Extract<Event, { type: "stt.final" | "barge_in" }>;
type BrainOutput = Extract<Event, {
  type:
    | "route.info"
    | "agent.token"
    | "agent.done"
    | "tts.speak"
    | "tts.cancel"
    | "tool.call"
    | "tool.result"
    | "render.event"
    | "sys.error";
}>;

export type RealBrainEmitter = (event: BrainOutput) => void;

export type ModelEvent =
  | { type: "token"; delta: string }
  | { type: "tool_call"; id?: string; name: string; args: Record<string, unknown> };

export type ModelProviderArgs = {
  cfg: Config;
  model: string;
  messages: Message[];
  tools: ReturnType<Registry["schemas"]>;
  signal: AbortSignal;
};

export type ModelProvider = (args: ModelProviderArgs) => Promise<AsyncIterable<ModelEvent>>;

export type RealBrainOptions = {
  cfg?: Config;
  registry?: Registry;
  personas?: PersonaRegistry;
  activePersonas?: ActivePersonaState;
  online?: boolean;
  localProvider?: ModelProvider;
  apiProvider?: ModelProvider;
  maxToolIterations?: number;
};

type ProviderTarget = "local" | "api";

const FALLBACK_TTS = "Mi dispiace, Signore. Il cervello non e raggiungibile in questo momento.";

export class RealBrain {
  private readonly cfg: Config;
  private readonly registry: Registry;
  private readonly personas: PersonaRegistry;
  private readonly activePersonas: ActivePersonaState;
  private readonly online: boolean;
  private readonly localProvider: ModelProvider;
  private readonly apiProvider: ModelProvider;
  private readonly maxToolIterations: number;
  private history: Message[] = [];
  private primed = false;
  private runId = 0;
  private currentAbort: AbortController | null = null;

  constructor(options: RealBrainOptions = {}) {
    this.cfg = options.cfg ?? loadConfig({});
    this.registry = options.registry ?? new Registry();
    this.personas = options.personas ?? personaRegistry;
    this.activePersonas = options.activePersonas ?? activePersona;
    this.online = options.online ?? true;
    this.localProvider = options.localProvider ?? streamOllama;
    this.apiProvider = options.apiProvider ?? streamAnthropic;
    this.maxToolIterations = options.maxToolIterations ?? 5;
  }

  async handle(event: BrainInput, emit: RealBrainEmitter): Promise<void> {
    if (event.type === "barge_in") {
      this.runId += 1;
      this.currentAbort?.abort();
      this.currentAbort = null;
      emit({ v: 1, type: "tts.cancel" });
      return;
    }

    const switchTarget = detectPersonaSwitch(event.text, this.personas);
    if (switchTarget) {
      const profile = this.personas.get(switchTarget);
      this.activePersonas.switch(switchTarget);
      emit({
        v: 1,
        type: "route.info",
        provider: "persona",
        model: switchTarget,
        reason: `Persona switched to ${switchTarget} from voice intent.`,
      });
      emit({
        v: 1,
        type: "tts.speak",
        text: `${profile.displayName} ${["jarvis", "warmachine"].includes(switchTarget) ? "attivo" : "attiva"}.`,
        persona: switchTarget,
      });
      return;
    }

    this.currentAbort?.abort();
    const controller = new AbortController();
    this.currentAbort = controller;
    const activeRun = this.runId + 1;
    this.runId = activeRun;

    const profile = this.personas.get(this.activePersonas.current());
    const ctx: RouteCtx = {
      online: this.online,
      sensitive: false,
      personaHints: profile.routingHints,
    };
    const route = decide(event.text, ctx, this.cfg);
    emit({ v: 1, type: "route.info", provider: route.target, model: route.model, reason: route.reason });

    const turnUser: Message = { role: "user", content: event.text };
    let target: ProviderTarget = route.target;
    let model = route.model;
    let emittedFallback = false;

    try {
      const reply = await this.runLoop({
        target,
        model,
        user: turnUser,
        signal: controller.signal,
        emit,
      });
      if (this.isStale(activeRun, controller.signal)) return;
      this.history.push(turnUser, { role: "assistant", content: reply });
      this.primed = true;
      emit({ v: 1, type: "agent.done" });
      emit({ v: 1, type: "tts.speak", text: reply, persona: this.activePersonas.current() });
    } catch (error) {
      if (isAbort(error) || this.isStale(activeRun, controller.signal)) return;

      if (target === "local" && error instanceof OllamaDownError && this.online && this.cfg.anthropicApiKey) {
        target = "api";
        model = this.cfg.modelApi;
        emittedFallback = true;
        emit({
          v: 1,
          type: "route.info",
          provider: "api",
          model,
          reason: "fallback: Ollama unreachable, using API",
        });
        try {
          const reply = await this.runLoop({ target, model, user: turnUser, signal: controller.signal, emit });
          if (this.isStale(activeRun, controller.signal)) return;
          this.history.push(turnUser, { role: "assistant", content: reply });
          this.primed = true;
          emit({ v: 1, type: "agent.done" });
          emit({ v: 1, type: "tts.speak", text: reply, persona: this.activePersonas.current() });
          return;
        } catch (fallbackError) {
          if (isAbort(fallbackError) || this.isStale(activeRun, controller.signal)) return;
          this.emitFailure(fallbackError, emit, emittedFallback);
          return;
        }
      }

      this.emitFailure(error, emit, emittedFallback);
    } finally {
      if (this.currentAbort === controller) this.currentAbort = null;
    }
  }

  private async runLoop(args: {
    target: ProviderTarget;
    model: string;
    user: Message;
    signal: AbortSignal;
    emit: RealBrainEmitter;
  }): Promise<string> {
    const provider = args.target === "local" ? this.localProvider : this.apiProvider;
    const tools = this.registry.schemas();
    const working: Message[] = [...this.history, args.user];
    let finalText = "";

    for (let iteration = 0; iteration < this.maxToolIterations; iteration += 1) {
      throwIfAborted(args.signal);
      let text = "";
      const toolCalls: ToolCall[] = [];
      let assistantToolMessageAdded = false;
      const iterable = await provider({
        cfg: this.cfg,
        model: args.model,
        messages: this.withSystem(working),
        tools,
        signal: args.signal,
      });

      for await (const chunk of iterable) {
        throwIfAborted(args.signal);
        if (chunk.type === "token") {
          text += chunk.delta;
          finalText += chunk.delta;
          args.emit({ v: 1, type: "agent.token", delta: chunk.delta });
        } else {
          if (!assistantToolMessageAdded) {
            working.push({ role: "assistant", content: text, tool_calls: toolCalls });
            assistantToolMessageAdded = true;
          }
          toolCalls.push({ function: { name: chunk.name, arguments: chunk.args } });
          await this.dispatchTool(chunk.id ?? randomUUID(), chunk.name, chunk.args, working, args.emit);
        }
      }

      if (toolCalls.length === 0) return finalText.trimEnd();
      finalText = "";
    }

    return finalText.trimEnd() || "Ho raggiunto il limite di iterazioni degli strumenti.";
  }

  private async dispatchTool(
    id: string,
    name: string,
    args: Record<string, unknown>,
    working: Message[],
    emit: RealBrainEmitter,
  ): Promise<void> {
    emit({ v: 1, type: "tool.call", id, name, args });
    const tool = this.registry.get(name);
    if (!tool) {
      const data = { ok: false, error: { code: "TOOL_UNAVAILABLE", message: `${name} is not registered.` } };
      emit({ v: 1, type: "tool.result", id, ok: false, data });
      working.push({ role: "tool", content: JSON.stringify(data), tool_name: name });
      return;
    }

    try {
      const data = await tool.handler(args);
      if (isRenderResult(data)) {
        // Doppio binario: pannello alla HUD, solo lo spoken al modello —
        // nessuno vuole sentir leggere sedici numeri ad alta voce.
        emit({
          v: 1, type: "render.event", id, ts: Date.now(), tool: name,
          render: data.render.type, title: data.render.title,
          spoken: data.spoken, payload: data.render.payload,
        });
        emit({ v: 1, type: "tool.result", id, ok: true, data: { spoken: data.spoken } });
        working.push({ role: "tool", content: data.spoken, tool_name: name });
        return;
      }
      const ok = typeof data === "object" && data !== null && "ok" in data ? Boolean((data as { ok: unknown }).ok) : true;
      emit({ v: 1, type: "tool.result", id, ok, data });
      working.push({ role: "tool", content: stringifyToolResult(data), tool_name: name });
    } catch (error) {
      const data = { ok: false, error: { code: "TOOL_ERROR", message: errorMessage(error) } };
      emit({ v: 1, type: "tool.result", id, ok: false, data });
      working.push({ role: "tool", content: JSON.stringify(data), tool_name: name });
    }
  }

  private withSystem(messages: Message[]): Message[] {
    const profile = this.personas.get(this.activePersonas.current());
    const priming = this.primed ? "" : `\n\n# Session priming\n${profile.sessionInstruction.trim()}`;
    return [{ role: "system", content: `${profile.agentInstruction.trim()}${priming}` }, ...messages];
  }


  private isStale(activeRun: number, signal: AbortSignal): boolean {
    return signal.aborted || this.runId !== activeRun;
  }

  private emitFailure(error: unknown, emit: RealBrainEmitter, _fallbackAlreadyEmitted: boolean): void {
    emit({ v: 1, type: "sys.error", scope: "brain", message: errorMessage(error) });
    emit({ v: 1, type: "tts.speak", text: FALLBACK_TTS, persona: this.activePersonas.current() });
  }
}

export const streamOllama: ModelProvider = async ({ cfg, model, messages, tools, signal }) => {
  async function* run(): AsyncGenerator<ModelEvent> {
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
      options: { temperature: 0.4 },
    };
    if (tools.length > 0) body.tools = tools;

    let response: Response;
    try {
      response = await fetch(`${cfg.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (isAbort(error)) throw error;
      throw new OllamaDownError();
    }
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    if (!response.body) throw new Error("Ollama stream body missing.");

    for await (const line of readNdjson(response.body)) {
      const data = JSON.parse(line) as { message?: Message; done?: boolean };
      const message = data.message;
      if (message?.content) yield { type: "token", delta: message.content };
      for (const call of message?.tool_calls ?? []) {
        yield {
          type: "tool_call",
          name: call.function.name,
          args: normalizeToolArgs(call.function.arguments),
        };
      }
      if (data.done) return;
    }
  }

  return run();
};

export const streamAnthropic: ModelProvider = async ({ cfg, model, messages, tools, signal }) => {
  if (!cfg.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY non impostata.");

  async function* run(): AsyncGenerator<ModelEvent> {
    const { system, convo } = toAnthropicMessages(messages);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.anthropicApiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        stream: true,
        system,
        messages: convo,
        tools: tools.map((tool) => ({
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters,
        })),
      }),
      signal,
    });
    if (!response.ok) throw new Error(`Anthropic HTTP ${response.status}`);
    if (!response.body) throw new Error("Anthropic stream body missing.");

    const toolBlocks = new Map<number, { id: string; name: string; json: string }>();
    for await (const line of readSseData(response.body)) {
      if (line === "[DONE]") return;
      const data = JSON.parse(line) as Record<string, unknown>;
      if (data.type === "content_block_start") {
        const index = Number(data.index ?? 0);
        const block = data.content_block as { type?: string; id?: string; name?: string } | undefined;
        if (block?.type === "tool_use" && block.id && block.name) {
          toolBlocks.set(index, { id: block.id, name: block.name, json: "" });
        }
      }
      if (data.type === "content_block_delta") {
        const delta = data.delta as { type?: string; text?: string; partial_json?: string } | undefined;
        if (delta?.type === "text_delta" && delta.text) yield { type: "token", delta: delta.text };
        if (delta?.type === "input_json_delta") {
          const index = Number(data.index ?? 0);
          const block = toolBlocks.get(index);
          if (block) block.json += delta.partial_json ?? "";
        }
      }
      if (data.type === "content_block_stop") {
        const index = Number(data.index ?? 0);
        const block = toolBlocks.get(index);
        if (block) {
          yield { type: "tool_call", id: block.id, name: block.name, args: normalizeToolArgs(block.json) };
          toolBlocks.delete(index);
        }
      }
    }
  }

  return run();
};

async function* readNdjson(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) yield line;
    }
  }
  const rest = buffer.trim();
  if (rest) yield rest;
}

async function* readSseData(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  for await (const line of readNdjson(stream)) {
    if (line.startsWith("data:")) yield line.slice("data:".length).trim();
  }
}

function toAnthropicMessages(messages: Message[]): { system: string; convo: Array<{ role: "user" | "assistant"; content: string }> } {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
  const convo = messages
    .filter((message) => message.role !== "system")
    .map((message) => {
      if (message.role === "assistant") return { role: "assistant" as const, content: message.content || "[tool call requested]" };
      if (message.role === "tool") return { role: "user" as const, content: `Tool ${message.tool_name ?? "unknown"} result: ${message.content}` };
      return { role: "user" as const, content: message.content };
    });
  return { system, convo };
}

function normalizeToolArgs(args: unknown): Record<string, unknown> {
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args) as unknown;
      return normalizeToolArgs(parsed);
    } catch {
      return {};
    }
  }
  if (typeof args === "object" && args !== null && !Array.isArray(args)) return args as Record<string, unknown>;
  return {};
}

function stringifyToolResult(data: unknown): string {
  return typeof data === "string" ? data : JSON.stringify(data);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("aborted", "AbortError");
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
