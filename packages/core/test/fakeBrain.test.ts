import { describe, expect, it, vi } from "vitest";
import type { Event } from "@stark-ai/contracts";
import { FakeBrain } from "../src/brain/fake.js";

describe("FakeBrain", () => {
  it("emits route info, streamed tokens, done, and echo TTS for stt.final", async () => {
    const brain = new FakeBrain({ tokenDelayMs: 0 });
    const emitted: Event[] = [];

    await brain.handle(
      { v: 1, type: "stt.final", text: "ciao JARVIS", lang: "it" },
      (event) => emitted.push(event),
    );

    expect(emitted[0]).toEqual({ v: 1, type: "route.info", provider: "fake", model: "fake-1", reason: "slice1" });
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
    const brain = new FakeBrain({ tokenDelayMs: 0 });
    const emitted: Event[] = [];

    await brain.handle(
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
    const brain = new FakeBrain({ tokenDelayMs: 0 });
    const switchEvents: Event[] = [];
    const normalEvents: Event[] = [];

    await brain.handle(
      { v: 1, type: "stt.final", text: "switch to JARVIS", lang: "en" },
      (event) => switchEvents.push(event),
    );
    await brain.handle(
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
    const brain = new FakeBrain({ tokenDelayMs: 0 });
    const emitted: Event[] = [];

    await brain.handle(
      { v: 1, type: "stt.final", text: "passa a veronica", lang: "it" },
      (event) => emitted.push(event),
    );

    expect(emitted[0]).toEqual({ v: 1, type: "route.info", provider: "fake", model: "fake-1", reason: "slice1" });
    expect(emitted.some((event) => event.type === "agent.token")).toBe(true);
    expect(emitted.at(-1)).toEqual({
      v: 1,
      type: "tts.speak",
      text: 'Ho ricevuto: "passa a veronica"',
      persona: "jarvis",
    });
  });

  it("cancels in-flight streaming and emits tts.cancel on barge_in", async () => {
    vi.useFakeTimers();
    const brain = new FakeBrain({ tokenDelayMs: 50 });
    const emitted: Event[] = [];

    const streaming = brain.handle(
      { v: 1, type: "stt.final", text: "test cancellazione", lang: "it" },
      (event) => emitted.push(event),
    );

    await vi.advanceTimersByTimeAsync(60);
    await brain.handle({ v: 1, type: "barge_in" }, (event) => emitted.push(event));
    await vi.runAllTimersAsync();
    await streaming;
    vi.useRealTimers();

    expect(emitted).toContainEqual({ v: 1, type: "tts.cancel" });
    expect(emitted.some((event) => event.type === "tts.speak")).toBe(false);
  });
});
