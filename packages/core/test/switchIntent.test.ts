import { describe, expect, it } from "vitest";
import { detectPersonaSwitch } from "../src/personas/switchIntent.js";
import { personaRegistry } from "../src/personas/registry.js";

describe("persona switch intent", () => {
  it.each([
    ["passa a friday", "friday"],
    ["switch to jarvis", "jarvis"],
    ["passa a veronica", "veronica"],
    ["switch to veronica", "veronica"],
    ["passa a warmachine", "warmachine"],
    ["passa a war machine", "warmachine"],
    ["switch to war machine", "warmachine"],
    ["Passa a War Machine", "warmachine"],
  ])("recognizes %s → %s", (text, expected) => {
    expect(detectPersonaSwitch(text, personaRegistry)).toBe(expected);
  });

  it.each([
    "passa a ultron",
    "passa a war",
    "che tempo fa",
    "switch to",
    "passa a friday adesso per favore",
  ])("ignores non-switch or unknown: %s", (text) => {
    expect(detectPersonaSwitch(text, personaRegistry)).toBeNull();
  });
});
