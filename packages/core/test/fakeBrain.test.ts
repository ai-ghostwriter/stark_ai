import { describe, expect, it, vi } from "vitest";
import type { Event } from "@stark-ai/contracts";
import { FakeBrain } from "../src/brain/fake.js";
import { loadConfig } from "../src/config.js";
import { createActivePersonaState } from "../src/personas/active.js";
import { personaRegistry } from "../src/personas/registry.js";
import { Registry } from "../src/tools/registry.js";

const cfg = loadConfig({});

function brain(options: ConstructorParameters<typeof FakeBrain>[0] = {}) {
  return new FakeBrain({
    tokenDelayMs: 0,
    activePersonas: createActivePersonaState(personaRegistry),
    config: cfg,
    ...options,
  });
}

describe("FakeBrain", () => {
  it("emits route info, streamed tokens, done, and echo TTS for stt.final", async () => {
    const fakeBrain = brain();
    const emitted: Event[] = [];

    await fakeBrain.handle(
      { v: 1, type: "stt.final", text: "ciao JARVIS", lang: "it" },
      (event) => emitted.push(event),
    );

    expect(emitted[0]).toEqual({
      v: 1,
      type: "route.info",
      provider: "local",
      model: cfg.modelLocal,
      reason: "persona prefers local",
    });
    expect(emitted.filter((event) => event.type === "agent.token").length).toBeGreaterThanOrEqual(5);
    expect(emitted.filter((event) => event.type === "agent.token").length).toBeLessThanOrEqual(10);
    expect(emitted.at(-2)).toEqual({ v: 1, type: "agent.done" });
    expect(emitted.at(-1)).toEqual({
      v: 1,
      type: "tts.speak",
      text: 'Ho ricevuto: "ciao JARVIS"',
      persona: "jarvis",
    });
  });

  it("switches persona from an Italian intent without streaming tokens", async () => {
    const fakeBrain = brain();
    const emitted: Event[] = [];

    await fakeBrain.handle(
      { v: 1, type: "stt.final", text: "passa a friday", lang: "it" },
      (event) => emitted.push(event),
    );

    expect(emitted).toEqual([
      {
        v: 1,
        type: "route.info",
        provider: "persona",
        model: "friday",
        reason: "Persona switched to friday from voice intent.",
      },
      {
        v: 1,
        type: "tts.speak",
        text: "FRIDAY attiva.",
        persona: "friday",
      },
    ]);
  });

  it("switches persona from an English intent and keeps it for normal turns", async () => {
    const fakeBrain = brain();
    const switchEvents: Event[] = [];
    const normalEvents: Event[] = [];

    await fakeBrain.handle(
      { v: 1, type: "stt.final", text: "switch to JARVIS", lang: "en" },
      (event) => switchEvents.push(event),
    );
    await fakeBrain.handle(
      { v: 1, type: "stt.final", text: "status", lang: "en" },
      (event) => normalEvents.push(event),
    );

    expect(switchEvents).toEqual([
      {
        v: 1,
        type: "route.info",
        provider: "persona",
        model: "jarvis",
        reason: "Persona switched to jarvis from voice intent.",
      },
      {
        v: 1,
        type: "tts.speak",
        text: "JARVIS attivo.",
        persona: "jarvis",
      },
    ]);
    expect(normalEvents.at(-1)).toEqual({
      v: 1,
      type: "tts.speak",
      text: 'Ho ricevuto: "status"',
      persona: "jarvis",
    });
  });

  it("treats unknown persona switch phrases as normal echo turns", async () => {
    const fakeBrain = brain();
    const emitted: Event[] = [];

    await fakeBrain.handle(
      { v: 1, type: "stt.final", text: "passa a ultron", lang: "it" },
      (event) => emitted.push(event),
    );

    expect(emitted[0]).toEqual({
      v: 1,
      type: "route.info",
      provider: "local",
      model: cfg.modelLocal,
      reason: "persona prefers local",
    });
    expect(emitted.some((event) => event.type === "agent.token")).toBe(true);
    expect(emitted.at(-1)).toEqual({
      v: 1,
      type: "tts.speak",
      text: 'Ho ricevuto: "passa a ultron"',
      persona: "jarvis",
    });
  });

  it("cancels in-flight streaming and emits tts.cancel on barge_in", async () => {
    vi.useFakeTimers();
    const fakeBrain = brain({ tokenDelayMs: 50 });
    const emitted: Event[] = [];

    const streaming = fakeBrain.handle(
      { v: 1, type: "stt.final", text: "test cancellazione", lang: "it" },
      (event) => emitted.push(event),
    );

    await vi.advanceTimersByTimeAsync(60);
    await fakeBrain.handle({ v: 1, type: "barge_in" }, (event) => emitted.push(event));
    await vi.runAllTimersAsync();
    await streaming;
    vi.useRealTimers();

    expect(emitted).toContainEqual({ v: 1, type: "tts.cancel" });
    expect(emitted.some((event) => event.type === "tts.speak")).toBe(false);
  });

  it("uses active FRIDAY hints to bias a normal online turn to API", async () => {
    const fakeBrain = brain({ online: true });
    const emitted: Event[] = [];

    await fakeBrain.handle({ v: 1, type: "stt.final", text: "passa a friday", lang: "it" }, () => undefined);
    await fakeBrain.handle(
      { v: 1, type: "stt.final", text: "valuta questa idea", lang: "it" },
      (event) => emitted.push(event),
    );

    expect(emitted[0]).toMatchObject({
      v: 1,
      type: "route.info",
      provider: "api",
      model: cfg.modelApi,
    });
    expect(emitted[0]).toMatchObject({ reason: expect.stringMatching(/persona/i) });
  });

  it("keeps active JARVIS normal turns local when online", async () => {
    const fakeBrain = brain({ online: true });
    const emitted: Event[] = [];

    await fakeBrain.handle(
      { v: 1, type: "stt.final", text: "status", lang: "it" },
      (event) => emitted.push(event),
    );

    expect(emitted[0]).toEqual({
      v: 1,
      type: "route.info",
      provider: "local",
      model: cfg.modelLocal,
      reason: "persona prefers local",
    });
  });

  it("hard offline rule beats active FRIDAY cloud preference", async () => {
    const fakeBrain = brain({ online: false });
    const emitted: Event[] = [];

    await fakeBrain.handle({ v: 1, type: "stt.final", text: "passa a friday", lang: "it" }, () => undefined);
    await fakeBrain.handle(
      { v: 1, type: "stt.final", text: "valuta questa idea", lang: "it" },
      (event) => emitted.push(event),
    );

    expect(emitted[0]).toEqual({
      v: 1,
      type: "route.info",
      provider: "local",
      model: cfg.modelLocal,
      reason: "offline",
    });
  });

  it("dispatches open_app for apri/open voice intents and emits tool events", async () => {
    const registry = new Registry();
    registry.register({
      name: "open_app",
      description: "open app",
      parameters: {},
      handler: async (args) => ({ ok: true, data: { launched: true, requested: args.appName } }),
    });
    const fakeBrain = brain({ tools: registry });
    const emitted: Event[] = [];

    await fakeBrain.handle(
      { v: 1, type: "stt.final", text: "apri Calculator", lang: "it" },
      (event) => emitted.push(event),
    );

    expect(emitted).toEqual([
      expect.objectContaining({ v: 1, type: "tool.call", name: "open_app", args: { appName: "Calculator" } }),
      expect.objectContaining({ v: 1, type: "tool.result", ok: true }),
      { v: 1, type: "tts.speak", text: "Ho aperto Calculator.", persona: "jarvis" },
    ]);
  });

  it("dispatches weather_report for weather voice intents", async () => {
    const registry = new Registry();
    registry.register({
      name: "weather_report",
      description: "weather",
      parameters: {},
      handler: async () => ({ ok: true, data: { summary: "Rome: 24°C, humidity 55%, wind 8 km/h" } }),
    });
    const fakeBrain = brain({ tools: registry });
    const emitted: Event[] = [];

    await fakeBrain.handle({ v: 1, type: "stt.final", text: "che tempo fa a Roma", lang: "it" }, (event) => emitted.push(event));

    expect(emitted).toEqual([
      expect.objectContaining({ v: 1, type: "tool.call", name: "weather_report", args: { city: "Roma" } }),
      expect.objectContaining({ v: 1, type: "tool.result", ok: true }),
      { v: 1, type: "tts.speak", text: "Rome: 24°C, humidity 55%, wind 8 km/h", persona: "jarvis" },
    ]);
  });

  it("dispatches web_search for search voice intents and speaks top results", async () => {
    const registry = new Registry();
    registry.register({
      name: "web_search",
      description: "search",
      parameters: {},
      handler: async () => ({ ok: true, data: { summary: "1. Ricette per diabetici: idee a basso indice glicemico" } }),
    });
    const fakeBrain = brain({ tools: registry });
    const emitted: Event[] = [];

    await fakeBrain.handle({ v: 1, type: "stt.final", text: "cerca ricette diabetici", lang: "it" }, (event) => emitted.push(event));

    expect(emitted).toEqual([
      expect.objectContaining({ v: 1, type: "tool.call", name: "web_search", args: { query: "ricette diabetici", maxResults: 3 } }),
      expect.objectContaining({ v: 1, type: "tool.result", ok: true }),
      { v: 1, type: "tts.speak", text: "1. Ricette per diabetici: idee a basso indice glicemico", persona: "jarvis" },
    ]);
  });
});
