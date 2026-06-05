export interface SttProvider {
  transcribe(audioPath: string): Promise<string>;
}

export interface TtsProvider {
  speak(text: string): Promise<string>;
}
