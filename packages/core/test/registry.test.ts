import { describe, it, expect } from "vitest";
import { Registry } from "../src/tools/registry.js";

describe("Registry", () => {
  it("registra e recupera un tool", () => {
    const r = new Registry();
    r.register({ name: "echo", description: "d", parameters: {}, handler: () => "ok" });
    expect(r.get("echo")?.name).toBe("echo");
  });

  it("schemas() restituisce gli schemi in formato tool-calling", () => {
    const r = new Registry();
    r.register({ name: "echo", description: "d", parameters: { type: "object", properties: {} }, handler: () => "ok" });
    const s = r.schemas();
    expect(s[0]).toEqual({
      type: "function",
      function: { name: "echo", description: "d", parameters: { type: "object", properties: {} } },
    });
  });

  it("get() su tool sconosciuto restituisce undefined", () => {
    expect(new Registry().get("nope")).toBeUndefined();
  });
});
