import { describe, it, expect, vi } from "vitest";
import { Orchestrator } from "../src/core/orchestrator.js";
import { Registry } from "../src/tools/registry.js";
import { Session } from "../src/core/session.js";
import { loadConfig } from "../src/config.js";

const cfg = loadConfig({});

function makeOrch(over: Partial<ConstructorParameters<typeof Orchestrator>[0]> = {}) {
  const registry = new Registry();
  registry.register({ name: "get_time", description: "d", parameters: {}, handler: () => "ORA_FINTA" });
  return new Orchestrator({
    cfg,
    registry,
    chatLocal: vi.fn(async () => ({ role: "assistant" as const, content: "risposta locale" })),
    chatApi: vi.fn(async () => "risposta API"),
    ...over,
  });
}

describe("Orchestrator.handle", () => {
  it("rotta API quando override api", async () => {
    const o = makeOrch();
    const res = await o.handle("ciao", new Session(), { override: "api" });
    expect(res.route).toBe("api");
    expect(res.reply).toBe("risposta API");
  });

  it("rotta locale conversazionale senza tool", async () => {
    const o = makeOrch();
    const res = await o.handle("ciao", new Session(), {});
    expect(res.route).toBe("local");
    expect(res.tool).toBeNull();
    expect(res.reply).toBe("risposta locale");
  });

  it("esegue il tool e fa la seconda passata", async () => {
    const chatLocal = vi
      .fn()
      .mockResolvedValueOnce({
        role: "assistant" as const,
        content: "",
        tool_calls: [{ function: { name: "get_time", arguments: {} } }],
      })
      .mockResolvedValueOnce({ role: "assistant" as const, content: "Sono le ORA_FINTA" });
    const o = makeOrch({ chatLocal });
    const session = new Session();
    session.append({ role: "user", content: "ricordati il contesto" });
    session.append({ role: "assistant", content: "contesto salvato" });
    const res = await o.handle("che ore sono", session, {});
    expect(res.tool).toBe("get_time");
    expect(res.reply).toBe("Sono le ORA_FINTA");
    expect(chatLocal).toHaveBeenCalledTimes(2);
    expect(chatLocal).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({ role: "system" }),
          { role: "user", content: "ricordati il contesto" },
          { role: "assistant", content: "contesto salvato" },
          { role: "user", content: "che ore sono" },
          { role: "assistant", content: "", tool_calls: [{ function: { name: "get_time", arguments: {} } }] },
          { role: "tool", content: "ORA_FINTA", tool_name: "get_time" },
        ],
      }),
    );
  });

  it("tool sconosciuto → messaggio chiaro, niente crash", async () => {
    const chatLocal = vi
      .fn()
      .mockResolvedValueOnce({
        role: "assistant" as const,
        content: "",
        tool_calls: [{ function: { name: "ignoto", arguments: {} } }],
      });
    const o = makeOrch({ chatLocal });
    const res = await o.handle("x", new Session(), {});
    expect(res.reply).toMatch(/sconosciut/i);
  });

  it("se il tool lancia ritorna un errore senza crash e fa la seconda passata", async () => {
    const registry = new Registry();
    registry.register({
      name: "boom",
      description: "d",
      parameters: {},
      handler: () => {
        throw new Error("fallito");
      },
    });
    const chatLocal = vi
      .fn()
      .mockResolvedValueOnce({
        role: "assistant" as const,
        content: "",
        tool_calls: [{ function: { name: "boom", arguments: {} } }],
      })
      .mockResolvedValueOnce({ role: "assistant" as const, content: "" });
    const o = makeOrch({ registry, chatLocal });
    const res = await o.handle("usa boom", new Session(), {});
    expect(chatLocal).toHaveBeenCalledTimes(2);
    expect(res.reply).toMatch(/errore/i);
    expect(res.reply).toContain("fallito");
  });
});
