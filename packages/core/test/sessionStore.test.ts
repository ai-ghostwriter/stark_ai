import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonSessionStore } from "../src/core/sessionStore.js";

describe("JsonSessionStore", () => {
  it("salva e ricarica la cronologia da disco", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jarvis-session-"));
    const file = join(dir, "nested", "session.json");

    try {
      const store = new JsonSessionStore(file);
      const history = [
        { role: "user" as const, content: "ciao" },
        { role: "assistant" as const, content: "Pronto." },
      ];

      await store.saveSession(history);

      expect(await store.loadSession()).toEqual(history);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ritorna cronologia vuota se il file manca", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jarvis-session-"));

    try {
      const store = new JsonSessionStore(join(dir, "missing", "session.json"));

      expect(await store.loadSession()).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
