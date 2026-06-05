import type { SttProvider, TtsProvider } from "./types.js";

export interface VoiceDeps {
  stt: SttProvider;
  tts: TtsProvider;
  ask: (text: string) => Promise<string>;
}

export async function voiceTurn(
  deps: VoiceDeps,
  audioInPath: string,
): Promise<{ transcript: string; reply: string; audioOut: string }> {
  const transcript = await deps.stt.transcribe(audioInPath);
  const reply = transcript.trim() ? await deps.ask(transcript) : "Non ho capito.";
  const audioOut = await deps.tts.speak(reply);

  return { transcript, reply, audioOut };
}
