import { describe, expect, it, vi } from "vitest";
import {
  createJarvisServer,
  handleAsk,
  handleSpeak,
  handleTranslate,
  normalizeSpeechText,
  splitSpeechTextForSystem,
} from "../src/server.js";
import { Session } from "../src/core/session.js";
import type { Result } from "../src/llm/types.js";

const result: Result = { route: "local", model: "llama-test", tool: null, reply: "ciao da JARVIS" };

describe("handleAsk", () => {
  it("returns orchestrator result for a valid text body", async () => {
    const orchestrator = { handle: vi.fn(async () => result) };
    const session = new Session();

    const res = await handleAsk(orchestrator, session, JSON.stringify({ text: "ciao" }));

    expect(res.status).toBe(200);
    expect(res.json).toEqual(result);
    expect(res.json).toHaveProperty("reply", "ciao da JARVIS");
    expect(orchestrator.handle).toHaveBeenCalledWith("ciao", session, {});
  });

  it("persiste la cronologia dopo una richiesta valida", async () => {
    const orchestrator = {
      handle: vi.fn(async (_input: string, session: Session) => {
        session.append({ role: "user", content: "ciao" });
        session.append({ role: "assistant", content: "salvato" });
        return result;
      }),
    };
    const session = new Session();
    const saveSession = vi.fn(async () => undefined);

    const res = await handleAsk(orchestrator, session, JSON.stringify({ text: "ciao" }), saveSession);

    expect(res.status).toBe(200);
    expect(saveSession).toHaveBeenCalledWith([
      { role: "user", content: "ciao" },
      { role: "assistant", content: "salvato" },
    ]);
  });

  it("returns 400 when text is missing", async () => {
    const orchestrator = { handle: vi.fn(async () => result) };

    const res = await handleAsk(orchestrator, new Session(), "{}");

    expect(res.status).toBe(400);
    expect(res.json).toHaveProperty("error");
    expect(orchestrator.handle).not.toHaveBeenCalled();
  });

  it("returns 400 when body is not JSON", async () => {
    const orchestrator = { handle: vi.fn(async () => result) };

    const res = await handleAsk(orchestrator, new Session(), "xxx");

    expect(res.status).toBe(400);
    expect(res.json).toHaveProperty("error");
    expect(orchestrator.handle).not.toHaveBeenCalled();
  });
});

describe("handleTranslate", () => {
  it("returns translated text for a valid request", async () => {
    const translateText = vi.fn(async () => "System online.");

    const res = await handleTranslate(translateText, JSON.stringify({ text: "Sistema online." }));

    expect(res.status).toBe(200);
    expect(res.json).toEqual({ translated: "System online." });
    expect(translateText).toHaveBeenCalledWith("Sistema online.", "en");
  });

  it("returns 400 when text is missing", async () => {
    const translateText = vi.fn(async () => "ignored");

    const res = await handleTranslate(translateText, "{}");

    expect(res.status).toBe(400);
    expect(res.json).toHaveProperty("error");
    expect(translateText).not.toHaveBeenCalled();
  });
});

describe("handleSpeak", () => {
  it("invoca il TTS locale per un testo valido", async () => {
    const speakText = vi.fn(async () => undefined);

    const res = await handleSpeak(speakText, JSON.stringify({ text: "Signore." }));

    expect(res.status).toBe(200);
    expect(res.json).toEqual({ status: "speaking" });
    expect(speakText).toHaveBeenCalledWith("Signore.");
  });

  it("returns 400 quando manca il testo", async () => {
    const speakText = vi.fn(async () => undefined);

    const res = await handleSpeak(speakText, "{}");

    expect(res.status).toBe(400);
    expect(res.json).toHaveProperty("error");
    expect(speakText).not.toHaveBeenCalled();
  });
});

describe("speech text helpers", () => {
  it("normalizza markdown, emoji e unità prima del TTS di sistema", () => {
    const text = normalizeSpeechText(
      "A Milano, **oggi sera** ci sono **28.8°C**, vento **11.3 km/h** e umidità **69%**. 🌙 😊",
    );

    expect(text).toBe(
      "A Milano, oggi sera ci sono 28.8 gradi, vento 11.3 chilometri orari e umidità 69 percento.",
    );
  });

  it("spezza risposte lunghe in blocchi brevi per macOS say", () => {
    const chunks = splitSpeechTextForSystem(
      "Prima frase abbastanza lunga. Seconda frase abbastanza lunga. Terza frase abbastanza lunga.",
      42,
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 42)).toBe(true);
  });
});

describe("createJarvisServer CORS", () => {
  it("adds CORS headers to browser-facing JSON responses", async () => {
    const server = createJarvisServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));

    try {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("Server address non valido.");

      const response = await fetch(`http://127.0.0.1:${address.port}/health`, {
        headers: { Origin: "http://localhost:5173" },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("access-control-allow-methods")).toContain("POST");
      expect(response.headers.get("access-control-allow-headers")).toContain("Content-Type");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it("answers CORS preflight requests before routing", async () => {
    const server = createJarvisServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));

    try {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("Server address non valido.");

      const response = await fetch(`http://127.0.0.1:${address.port}/ask`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type",
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});

describe("createJarvisServer /stats", () => {
  it("returns runtime stats for the Stark sidebar", async () => {
    const server = createJarvisServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));

    try {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("Server address non valido.");

      const response = await fetch(`http://127.0.0.1:${address.port}/stats`);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.status).toBe("online");
      expect(json.uptimeSeconds).toEqual(expect.any(Number));
      expect(json.cpu).toEqual({
        model: expect.any(String),
        cores: expect.any(Number),
        loadAvg1m: expect.any(Number),
      });
      expect(json.memory.totalMB).toEqual(expect.any(Number));
      expect(json.memory.freeMB).toEqual(expect.any(Number));
      expect(json.memory.usedMB).toEqual(expect.any(Number));
      expect(json.models).toHaveProperty("local");
      expect(json.models).toHaveProperty("api");
      expect(json.tools).toBe(json.toolNames.length);
      expect(json.toolNames).toContain("get_time");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
