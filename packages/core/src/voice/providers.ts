import type { SttProvider, TtsProvider } from "./types.js";

// I provider reali (whisper.cpp / ElevenLabs) si agganciano qui implementando
// le stesse interfacce SttProvider e TtsProvider.
export class EchoStt implements SttProvider {
  async transcribe(_audioPath: string): Promise<string> {
    return "(trascrizione dev non disponibile)";
  }
}

export class NoopTts implements TtsProvider {
  async speak(_text: string): Promise<string> {
    return "(audio non sintetizzato in dev)";
  }
}
