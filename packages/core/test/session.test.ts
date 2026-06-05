import { describe, it, expect } from "vitest";
import { Session } from "../src/core/session.js";
import type { Message } from "../src/llm/types.js";

describe("Session", () => {
  it("accumula messaggi in ordine", () => {
    const s = new Session();
    s.append({ role: "user", content: "a" });
    s.append({ role: "assistant", content: "b" });
    expect(s.messages().map((m) => m.content)).toEqual(["a", "b"]);
  });

  it("messages() restituisce una copia (no mutazione esterna)", () => {
    const s = new Session();
    s.append({ role: "user", content: "a" });
    s.messages().push({ role: "user", content: "x" });
    expect(s.messages()).toHaveLength(1);
  });

  it("può inizializzare la cronologia caricata da disco senza esporre mutazioni", () => {
    const s = new Session();
    const history: Message[] = [{ role: "user", content: "già detto" }];

    s.setHistory(history);
    history.push({ role: "assistant" as const, content: "mutazione esterna" });

    expect(s.messages()).toEqual([{ role: "user", content: "già detto" }]);
  });
});
