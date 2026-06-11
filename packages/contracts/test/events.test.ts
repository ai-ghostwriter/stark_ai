import { describe, expect, it } from "vitest";
import { Event, parseEvent } from "../src/events.js";
import { loadFixtures } from "./helpers.js";

const valid = loadFixtures("events", "valid");
const invalid = loadFixtures("events", "invalid");

describe("event contract — golden fixtures", () => {
  it("covers every event type with at least one valid fixture", () => {
    const types = new Set(valid.map(({ raw }) => JSON.parse(raw).type as string));
    expect([...types].sort()).toEqual([
      "agent.done", "agent.token", "barge_in", "hello",
      "render.event", "route.info", "stt.final", "stt.partial", "sys.error",
      "tool.call", "tool.result", "tts.cancel", "tts.speak",
    ]);
  });

  it.each(valid.map((f) => [f.name, f.raw] as const))(
    "valid fixture %s parses",
    (_name, raw) => {
      expect(() => parseEvent(raw)).not.toThrow();
    },
  );

  it.each(invalid.map((f) => [f.name, f.raw] as const))(
    "invalid fixture %s is rejected",
    (_name, raw) => {
      expect(() => parseEvent(raw)).toThrow();
    },
  );

  it("applies defaults: stt.final lang, tts.speak persona", () => {
    expect(Event.parse({ v: 1, type: "stt.final", text: "ciao" })).toMatchObject({ lang: "auto" });
    expect(Event.parse({ v: 1, type: "tts.speak", text: "hello" })).toMatchObject({ persona: "default" });
  });
});
