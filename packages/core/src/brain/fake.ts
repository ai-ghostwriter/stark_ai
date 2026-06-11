import type { Event } from "@stark-ai/contracts";

type BrainInput = Extract<Event, { type: "stt.final" | "barge_in" }>;
type BrainOutput = Extract<Event, { type: "route.info" | "agent.token" | "agent.done" | "tts.speak" | "tts.cancel" }>;

export type BrainEmitter = (event: BrainOutput) => void;

export type FakeBrainOptions = {
  tokenDelayMs?: number;
};

const defaultTokens = ["Ho ", "ricevuto ", "il ", "tuo ", "messaggio", "."];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FakeBrain {
  private readonly tokenDelayMs: number;
  private streamId = 0;

  constructor(options: FakeBrainOptions = {}) {
    this.tokenDelayMs = options.tokenDelayMs ?? 50;
  }

  async handle(event: BrainInput, emit: BrainEmitter): Promise<void> {
    if (event.type === "barge_in") {
      this.streamId += 1;
      emit({ v: 1, type: "tts.cancel" });
      return;
    }

    const streamId = this.streamId + 1;
    this.streamId = streamId;

    emit({ v: 1, type: "route.info", provider: "fake", model: "fake-1", reason: "slice1" });

    for (const delta of defaultTokens) {
      await delay(this.tokenDelayMs);
      if (this.streamId !== streamId) return;
      emit({ v: 1, type: "agent.token", delta });
    }

    if (this.streamId !== streamId) return;
    emit({ v: 1, type: "agent.done" });
    emit({ v: 1, type: "tts.speak", text: `Ho ricevuto: "${event.text}"`, persona: "default" });
  }
}
