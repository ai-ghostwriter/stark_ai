import { describe, expect, it, vi } from "vitest";
import { voiceTurn } from "../src/voice/pipeline.js";

describe("voiceTurn", () => {
  it("trascrive audio, chiede una risposta e sintetizza l'audio in uscita", async () => {
    const ask = vi.fn().mockResolvedValue("Ciao Ricky.");
    const deps = {
      stt: { transcribe: vi.fn().mockResolvedValue("Ciao JARVIS") },
      tts: { speak: vi.fn().mockResolvedValue("/tmp/jarvis-out.wav") },
      ask,
    };

    const result = await voiceTurn(deps, "/tmp/jarvis-in.wav");

    expect(result).toEqual({
      transcript: "Ciao JARVIS",
      reply: "Ciao Ricky.",
      audioOut: "/tmp/jarvis-out.wav",
    });
    expect(deps.stt.transcribe).toHaveBeenCalledWith("/tmp/jarvis-in.wav");
    expect(ask).toHaveBeenCalledWith("Ciao JARVIS");
    expect(deps.tts.speak).toHaveBeenCalledWith("Ciao Ricky.");
  });

  it("risponde con fallback se il transcript e' vuoto senza chiamare ask", async () => {
    const ask = vi.fn();
    const deps = {
      stt: { transcribe: vi.fn().mockResolvedValue("   ") },
      tts: { speak: vi.fn().mockResolvedValue("(audio fallback)") },
      ask,
    };

    const result = await voiceTurn(deps, "/tmp/silenzio.wav");

    expect(result).toEqual({
      transcript: "   ",
      reply: "Non ho capito.",
      audioOut: "(audio fallback)",
    });
    expect(ask).not.toHaveBeenCalled();
    expect(deps.tts.speak).toHaveBeenCalledWith("Non ho capito.");
  });
});
