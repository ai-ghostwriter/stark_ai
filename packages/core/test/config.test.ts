import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("usa i default quando le env non sono impostate", () => {
    const c = loadConfig({});
    expect(c.ollamaUrl).toBe("http://localhost:11434");
    expect(c.modelLocal).toBe("qwen3:8b");
    expect(c.modelApi).toBe("claude-sonnet-4-6");
    expect(c.heavyInputChars).toBe(4000);
    expect(c.heavyPatterns).toContain("scrivi il capitolo");
  });

  it("le env sovrascrivono i default", () => {
    const c = loadConfig({ OLLAMA_URL: "http://x:1", JARVIS_MODEL_LOCAL: "m" });
    expect(c.ollamaUrl).toBe("http://x:1");
    expect(c.modelLocal).toBe("m");
  });

  it("espone i model id dei tre tier API", () => {
    const c = loadConfig({});
    expect(c.modelApi).toBe("claude-sonnet-4-6");
    expect(c.modelApiHaiku).toBe("claude-haiku-4-5-20251001");
    expect(c.modelApiOpus).toBe("claude-opus-4-8");
    expect(c.opusPatterns).toContain("manoscritto");
  });

  it("espone il path dello script Cerebro (default skill)", () => {
    const c = loadConfig({});
    expect(c.cerebroScript).toContain("parse_cerebro.py");
    const c2 = loadConfig({ JARVIS_CEREBRO_SCRIPT: "/tmp/x.py" });
    expect(c2.cerebroScript).toBe("/tmp/x.py");
  });

  it("espone il modello di embedding (default bge-m3)", () => {
    expect(loadConfig({}).embedModel).toBe("bge-m3");
    expect(loadConfig({ JARVIS_EMBED_MODEL: "nomic" }).embedModel).toBe("nomic");
  });

  it("espone il file sessione persistente con override env", () => {
    expect(loadConfig({}).sessionFile).toContain(".jarvis/session.json");
    expect(loadConfig({ JARVIS_SESSION_FILE: "/tmp/jarvis-session.json" }).sessionFile).toBe("/tmp/jarvis-session.json");
  });
});
