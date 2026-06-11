import { describe, expect, it } from "vitest";
import { PersonaProfile } from "../src/persona.js";
import { loadFixtures } from "./helpers.js";

const valid = loadFixtures("persona", "valid");
const invalid = loadFixtures("persona", "invalid");

describe("PersonaProfile contract — golden fixtures", () => {
  it.each(valid.map((f) => [f.name, f.raw] as const))(
    "valid fixture %s parses",
    (_name, raw) => {
      expect(() => PersonaProfile.parse(JSON.parse(raw))).not.toThrow();
    },
  );

  it.each(invalid.map((f) => [f.name, f.raw] as const))(
    "invalid fixture %s is rejected",
    (_name, raw) => {
      expect(() => PersonaProfile.parse(JSON.parse(raw))).toThrow();
    },
  );

  it("applies the language default", () => {
    const { language, ...rest } = JSON.parse(valid[0]!.raw);
    expect(PersonaProfile.parse(rest)).toMatchObject({ language: "auto" });
  });
});
