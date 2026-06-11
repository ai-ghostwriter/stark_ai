import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PersonaProfile } from "@stark-ai/contracts";
import { createActivePersonaState } from "../src/personas/active.js";
import { createPersonaRegistry, personaRegistry } from "../src/personas/registry.js";

describe("persona registry", () => {
  it("loads and validates bundled persona profiles", () => {
    const profiles = personaRegistry.list();

    expect(profiles.map((profile) => profile.id).sort()).toEqual(["friday", "jarvis", "veronica", "warmachine"]);
    for (const profile of profiles) {
      expect(() => PersonaProfile.parse(profile)).not.toThrow();
      expect(profile.agentInstruction.length).toBeGreaterThan(0);
      expect(profile.sessionInstruction.length).toBeGreaterThan(0);
    }
  });

  it("gets personas by id and rejects unknown ids", () => {
    expect(personaRegistry.get("jarvis").displayName).toBe("JARVIS");
    expect(personaRegistry.get("friday").voice).toEqual({
      kokoro: "af_sky",
      edgetts: "en-IE-EmilyNeural",
    });
    expect(() => personaRegistry.get("default")).toThrow("Unknown persona profile: default");
  });

  it("fails fast with a clear error for a corrupted profile", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stark-personas-"));
    try {
      await writeFile(join(dir, "broken.json"), JSON.stringify({ id: "jarvis" }), "utf-8");

      expect(() => createPersonaRegistry(dir)).toThrow(/Invalid persona profile broken\.json:/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("active persona state", () => {
  it("defaults to jarvis and switches to a known persona", () => {
    const state = createActivePersonaState(personaRegistry);

    expect(state.current()).toBe("jarvis");
    expect(state.switch("friday")).toBe("friday");
    expect(state.current()).toBe("friday");
  });

  it("rejects an unknown persona without changing state", () => {
    const state = createActivePersonaState(personaRegistry);

    expect(() => state.switch("default")).toThrow("Unknown persona profile: default");
    expect(state.current()).toBe("jarvis");
  });
});
