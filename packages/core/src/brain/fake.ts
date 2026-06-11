import type { Event } from "@stark-ai/contracts";
import { loadConfig, type Config } from "../config.js";
import { decide } from "../core/router.js";
import { activePersona, type ActivePersonaState } from "../personas/active.js";
import { personaRegistry, type PersonaId, type PersonaRegistry } from "../personas/registry.js";

type BrainInput = Extract<Event, { type: "stt.final" | "barge_in" }>;
type BrainOutput = Extract<Event, { type: "route.info" | "agent.token" | "agent.done" | "tts.speak" | "tts.cancel" }>;

export type BrainEmitter = (event: BrainOutput) => void;

export type FakeBrainOptions = {
  tokenDelayMs?: number;
  personas?: PersonaRegistry;
  activePersonas?: ActivePersonaState;
  config?: Config;
  online?: boolean;
};

const defaultTokens = ["Ho ", "ricevuto ", "il ", "tuo ", "messaggio", "."];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FakeBrain {
  private readonly tokenDelayMs: number;
  private readonly personas: PersonaRegistry;
  private readonly activePersonas: ActivePersonaState;
  private readonly cfg: Config;
  private readonly online: boolean;
  private streamId = 0;

  constructor(options: FakeBrainOptions = {}) {
    this.tokenDelayMs = options.tokenDelayMs ?? 50;
    this.personas = options.personas ?? personaRegistry;
    this.activePersonas = options.activePersonas ?? activePersona;
    this.cfg = options.config ?? loadConfig({});
    this.online = options.online ?? true;
  }

  async handle(event: BrainInput, emit: BrainEmitter): Promise<void> {
    if (event.type === "barge_in") {
      this.streamId += 1;
      emit({ v: 1, type: "tts.cancel" });
      return;
    }

    const switchTarget = this.detectPersonaSwitch(event.text);
    if (switchTarget) {
      const profile = this.personas.get(switchTarget);
      this.activePersonas.switch(switchTarget);
      emit({
        v: 1,
        type: "route.info",
        provider: "persona",
        model: switchTarget,
        reason: `Persona switched to ${switchTarget} from voice intent.`,
      });
      emit({
        v: 1,
        type: "tts.speak",
        text: `${profile.displayName} ${switchTarget === "jarvis" ? "attivo" : "attiva"}.`,
        persona: switchTarget,
      });
      return;
    }

    const streamId = this.streamId + 1;
    this.streamId = streamId;

    const active = this.personas.get(this.activePersonas.current());
    const route = decide(
      event.text,
      {
        online: this.optsOnline(),
        sensitive: false,
        personaHints: active.routingHints,
      },
      this.cfg,
    );

    emit({ v: 1, type: "route.info", provider: route.target, model: route.model, reason: route.reason });

    for (const delta of defaultTokens) {
      await delay(this.tokenDelayMs);
      if (this.streamId !== streamId) return;
      emit({ v: 1, type: "agent.token", delta });
    }

    if (this.streamId !== streamId) return;
    emit({ v: 1, type: "agent.done" });
    emit({ v: 1, type: "tts.speak", text: `Ho ricevuto: "${event.text}"`, persona: this.activePersonas.current() });
  }

  private detectPersonaSwitch(text: string): PersonaId | null {
    const normalized = text.trim().toLowerCase();
    const match = /^(?:passa a|switch to)\s+([a-z]+)\s*$/i.exec(normalized);
    if (!match) return null;

    const target = match[1];
    if (!target || !this.personas.has(target)) return null;
    return target;
  }

  private optsOnline(): boolean {
    return this.online;
  }
}
