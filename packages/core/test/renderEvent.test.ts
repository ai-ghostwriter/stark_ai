import { describe, expect, it } from "vitest";
import type { Event } from "@stark-ai/contracts";
import { RealBrain, type ModelEvent, type ModelProvider } from "../src/brain/real.js";
import { Registry } from "../src/tools/registry.js";
import { isRenderResult } from "../src/tools/render.js";

function makeProvider(): ModelProvider {
  let calls = 0;
  return async () => {
    calls += 1;
    const first = calls === 1;
    async function* run(): AsyncGenerator<ModelEvent> {
      if (first) {
        yield { type: "tool_call", id: "call-1", name: "get_daily_brief", args: {} };
      } else {
        yield { type: "token", delta: "Fatto, signore." };
      }
    }
    return run();
  };
}

describe("isRenderResult", () => {
  it("accepts the dual-output shape", () => {
    expect(isRenderResult({
      spoken: "ok",
      render: { type: "stark.brief", title: "Daily Brief", payload: { a: 1 } },
    })).toBe(true);
  });

  it("rejects plain strings and bad render types", () => {
    expect(isRenderResult("Milano: 21°C")).toBe(false);
    expect(isRenderResult({ spoken: "x", render: { type: "nope", title: "t", payload: {} } })).toBe(false);
  });
});

describe("RealBrain dual output", () => {
  it("emits render.event + tool.result from the same tool call, model sees spoken only", async () => {
    const registry = new Registry();
    registry.register({
      name: "get_daily_brief",
      description: "test brief",
      parameters: { type: "object", properties: {} },
      handler: async () => ({
        spoken: "Tre segnali oggi.",
        render: { type: "stark.brief", title: "Daily Brief", payload: { summary: "ok" } },
      }),
    });

    const provider = makeProvider();
    const brain = new RealBrain({
      registry,
      online: false,
      localProvider: provider,
      apiProvider: provider,
    });

    const events: Event[] = [];
    await brain.handle(
      { v: 1, type: "stt.final", text: "fammi il rundown della giornata", lang: "auto" },
      (event) => events.push(event),
    );

    const render = events.find((event) => event.type === "render.event");
    expect(render).toMatchObject({
      tool: "get_daily_brief",
      render: "stark.brief",
      title: "Daily Brief",
      spoken: "Tre segnali oggi.",
      payload: { summary: "ok" },
    });

    const toolResult = events.find((event) => event.type === "tool.result");
    expect(toolResult).toMatchObject({ ok: true, data: { spoken: "Tre segnali oggi." } });

    const speak = events.find((event) => event.type === "tts.speak");
    expect(speak).toMatchObject({ text: "Fatto, signore." });
  });
});
