import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@stark-ai/contracts";
import { RealBrain, type ModelProvider } from "../src/brain/real.js";
import { OllamaDownError } from "../src/llm/ollama.js";
import { loadConfig } from "../src/config.js";
import { createActivePersonaState } from "../src/personas/active.js";
import { personaRegistry } from "../src/personas/registry.js";
import { Registry } from "../src/tools/registry.js";

const cfg = loadConfig({ ANTHROPIC_API_KEY: "sk-test" });

function collect() {
  const emitted: Event[] = [];
  return { emitted, emit: (event: Event) => emitted.push(event) };
}

async function* chunks(...events: Awaited<ReturnType<ModelProvider>> extends AsyncIterable<infer T> ? T[] : never) {
  for (const event of events) {
    yield event;
  }
}

function brain(options: Partial<ConstructorParameters<typeof RealBrain>[0]> = {}) {
  return new RealBrain({
    cfg,
    registry: new Registry(),
    activePersonas: createActivePersonaState(personaRegistry),
    personas: personaRegistry,
    online: true,
    localProvider: vi.fn(async () => chunks({ type: "token", delta: "ok" })),
    apiProvider: vi.fn(async () => chunks({ type: "token", delta: "api ok" })),
    ...options,
  });
}

describe("RealBrain", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("emits route info, streams model tokens, completes, and speaks the final text", async () => {
    const localProvider = vi.fn(async () => chunks(
      { type: "token", delta: "Ciao " },
      { type: "token", delta: "Ricky." },
    ));
    const realBrain = brain({ localProvider });
    const { emitted, emit } = collect();

    await realBrain.handle({ v: 1, type: "stt.final", text: "ciao", lang: "it" }, emit);

    expect(emitted).toEqual([
      { v: 1, type: "route.info", provider: "local", model: cfg.modelLocal, reason: "persona prefers local" },
      { v: 1, type: "agent.token", delta: "Ciao " },
      { v: 1, type: "agent.token", delta: "Ricky." },
      { v: 1, type: "agent.done" },
      { v: 1, type: "tts.speak", text: "Ciao Ricky.", persona: "jarvis" },
    ]);
    expect(localProvider).toHaveBeenCalledWith(expect.objectContaining({
      model: cfg.modelLocal,
      tools: [],
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("Sistemi operativi al 100%"),
        }),
        { role: "user", content: "ciao" },
      ]),
    }));
  });

  it("dispatches a requested tool, emits tool events, feeds the result back, and speaks the final model text", async () => {
    const registry = new Registry();
    registry.register({
      name: "weather_report",
      description: "weather",
      parameters: { type: "object", properties: { city: { type: "string" } } },
      handler: async (args) => ({ ok: true, data: { summary: `Meteo per ${args.city}: sole` } }),
    });
    const localProvider = vi
      .fn()
      .mockImplementationOnce(async () => chunks({ type: "tool_call", id: "tool-1", name: "weather_report", args: { city: "Milano" } }))
      .mockImplementationOnce(async () => chunks({ type: "token", delta: "A Milano c'e sole." }));
    const realBrain = brain({ registry, localProvider });
    const { emitted, emit } = collect();

    await realBrain.handle({ v: 1, type: "stt.final", text: "che tempo fa a Milano?", lang: "it" }, emit);

    expect(emitted).toEqual([
      expect.objectContaining({ v: 1, type: "route.info", provider: "local", model: cfg.modelLocal }),
      { v: 1, type: "tool.call", id: "tool-1", name: "weather_report", args: { city: "Milano" } },
      { v: 1, type: "tool.result", id: "tool-1", ok: true, data: { ok: true, data: { summary: "Meteo per Milano: sole" } } },
      { v: 1, type: "agent.token", delta: "A Milano c'e sole." },
      { v: 1, type: "agent.done" },
      { v: 1, type: "tts.speak", text: "A Milano c'e sole.", persona: "jarvis" },
    ]);
    expect(localProvider).toHaveBeenCalledTimes(2);
    expect(localProvider).toHaveBeenLastCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        { role: "assistant", content: "", tool_calls: [{ function: { name: "weather_report", arguments: { city: "Milano" } } }] },
        { role: "tool", content: JSON.stringify({ ok: true, data: { summary: "Meteo per Milano: sole" } }), tool_name: "weather_report" },
      ]),
    }));
  });

  it("barge_in aborts in-flight generation, emits tts.cancel, and drops the truncated turn from history", async () => {
    vi.useFakeTimers();
    const localProvider = vi
      .fn()
      .mockImplementationOnce(async ({ signal }) => (async function* () {
        yield { type: "token" as const, delta: "Parziale " };
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        });
      })())
      .mockImplementationOnce(async () => chunks({ type: "token", delta: "turno successivo" }));
    const realBrain = brain({ localProvider });
    const { emitted, emit } = collect();

    const running = realBrain.handle({ v: 1, type: "stt.final", text: "risposta lunga", lang: "it" }, emit);
    await vi.advanceTimersByTimeAsync(1);
    await realBrain.handle({ v: 1, type: "barge_in" }, emit);
    await running;

    await realBrain.handle({ v: 1, type: "stt.final", text: "dopo", lang: "it" }, emit);

    expect(emitted).toContainEqual({ v: 1, type: "tts.cancel" });
    expect(emitted.some((event) => event.type === "tts.speak" && event.text.includes("Parziale"))).toBe(false);
    expect(localProvider).toHaveBeenLastCalledWith(expect.objectContaining({
      messages: expect.not.arrayContaining([{ role: "user", content: "risposta lunga" }]),
    }));
  });

  it("keeps conversation history when switching persona", async () => {
    const localProvider = vi.fn(async () => chunks({ type: "token", delta: "prima risposta" }));
    const apiProvider = vi.fn(async () => chunks({ type: "token", delta: "seconda risposta" }));
    const realBrain = brain({ localProvider, apiProvider });
    const { emit } = collect();

    await realBrain.handle({ v: 1, type: "stt.final", text: "prima", lang: "it" }, emit);
    await realBrain.handle({ v: 1, type: "stt.final", text: "passa a friday", lang: "it" }, emit);
    await realBrain.handle({ v: 1, type: "stt.final", text: "seconda", lang: "it" }, emit);

    expect(apiProvider).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        { role: "user", content: "prima" },
        { role: "assistant", content: "prima risposta" },
        expect.objectContaining({ role: "system", content: expect.stringContaining("FRIDAY") }),
        { role: "user", content: "seconda" },
      ]),
    }));
  });

  it("falls back from local to api when Ollama is unreachable and online API is configured", async () => {
    const localProvider = vi.fn(async () => {
      throw new OllamaDownError();
    });
    const apiProvider = vi.fn(async () => chunks({ type: "token", delta: "fallback api" }));
    const realBrain = brain({ localProvider, apiProvider });
    const { emitted, emit } = collect();

    await realBrain.handle({ v: 1, type: "stt.final", text: "ciao", lang: "it" }, emit);

    expect(emitted).toEqual([
      { v: 1, type: "route.info", provider: "local", model: cfg.modelLocal, reason: "persona prefers local" },
      { v: 1, type: "route.info", provider: "api", model: cfg.modelApi, reason: "fallback: Ollama unreachable, using API" },
      { v: 1, type: "agent.token", delta: "fallback api" },
      { v: 1, type: "agent.done" },
      { v: 1, type: "tts.speak", text: "fallback api", persona: "jarvis" },
    ]);
  });
});
