import type { Event } from "@stark-ai/contracts";
import { randomUUID } from "node:crypto";
import { loadConfig, type Config } from "../config.js";
import { decide } from "../core/router.js";
import { activePersona, type ActivePersonaState } from "../personas/active.js";
import { personaRegistry, type PersonaId, type PersonaRegistry } from "../personas/registry.js";
import type { Registry } from "../tools/registry.js";

type BrainInput = Extract<Event, { type: "stt.final" | "barge_in" }>;
type BrainOutput = Extract<Event, { type: "route.info" | "agent.token" | "agent.done" | "tts.speak" | "tts.cancel" | "tool.call" | "tool.result" }>;

export type BrainEmitter = (event: BrainOutput) => void;

export type FakeBrainOptions = {
  tokenDelayMs?: number;
  personas?: PersonaRegistry;
  activePersonas?: ActivePersonaState;
  config?: Config;
  online?: boolean;
  tools?: Registry;
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
  private readonly tools: Registry | null;
  private streamId = 0;

  constructor(options: FakeBrainOptions = {}) {
    this.tokenDelayMs = options.tokenDelayMs ?? 50;
    this.personas = options.personas ?? personaRegistry;
    this.activePersonas = options.activePersonas ?? activePersona;
    this.cfg = options.config ?? loadConfig({});
    this.online = options.online ?? true;
    this.tools = options.tools ?? null;
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

    const openApp = this.detectOpenApp(event.text);
    if (openApp) {
      await this.handleOpenApp(openApp, emit);
      return;
    }

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

  private detectOpenApp(text: string): string | null {
    const match = /^(?:apri|open)\s+(.+?)\s*$/i.exec(text.trim());
    return match?.[1]?.trim() || null;
  }

  private async handleOpenApp(appName: string, emit: BrainEmitter): Promise<void> {
    const callId = randomUUID();
    const args = { appName };
    emit({ v: 1, type: "tool.call", id: callId, name: "open_app", args });

    const tool = this.tools?.get("open_app");
    if (!tool) {
      const data = { ok: false, error: { code: "TOOL_UNAVAILABLE", message: "open_app is not registered." } };
      emit({ v: 1, type: "tool.result", id: callId, ok: false, data });
      emit({ v: 1, type: "tts.speak", text: `Non ho il tool open_app disponibile per aprire ${appName}.`, persona: this.activePersonas.current() });
      return;
    }

    const data = await tool.handler(args);
    const ok = typeof data === "object" && data !== null && "ok" in data ? Boolean((data as { ok: unknown }).ok) : true;
    emit({ v: 1, type: "tool.result", id: callId, ok, data });
    emit({
      v: 1,
      type: "tts.speak",
      text: ok ? `Ho aperto ${appName}.` : `Non sono riuscita ad aprire ${appName}.`,
      persona: this.activePersonas.current(),
    });
  }
}
