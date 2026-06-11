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
      persona: "default",
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
