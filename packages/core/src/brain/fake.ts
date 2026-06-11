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

    const weatherCity = this.detectWeather(event.text);
    if (weatherCity) {
      await this.handleToolIntent("weather_report", { city: weatherCity }, (ok, data) => {
        if (!ok) return `Non sono riuscita a recuperare il meteo per ${weatherCity}.`;
        return this.summaryFromToolData(data) ?? `Meteo recuperato per ${weatherCity}.`;
      }, emit);
      return;
    }

    const searchQuery = this.detectSearch(event.text);
    if (searchQuery) {
      await this.handleToolIntent("web_search", { query: searchQuery, maxResults: 3 }, (ok, data) => {
        if (!ok) return `Non sono riuscita a cercare ${searchQuery}.`;
        return this.summaryFromToolData(data) ?? `Ho trovato risultati per ${searchQuery}.`;
      }, emit);
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

  private detectWeather(text: string): string | null {
    const normalized = text.trim();
    const match = /^(?:che tempo fa|weather)(?:\s+(?:a|in|for))?\s*(.*?)\s*$/i.exec(normalized);
    if (!match) return null;
    return match[1]?.trim() || "Roma";
  }

  private detectSearch(text: string): string | null {
    const match = /^(?:cerca|search)\s+(.+?)\s*$/i.exec(text.trim());
    return match?.[1]?.trim() || null;
  }

  private async handleOpenApp(appName: string, emit: BrainEmitter): Promise<void> {
    await this.handleToolIntent("open_app", { appName }, (ok) => (
      ok ? `Ho aperto ${appName}.` : `Non sono riuscita ad aprire ${appName}.`
    ), emit, `Non ho il tool open_app disponibile per aprire ${appName}.`);
  }

  private async handleToolIntent(
    name: string,
    args: Record<string, unknown>,
    speakText: (ok: boolean, data: unknown) => string,
    emit: BrainEmitter,
    unavailableText = `Non ho il tool ${name} disponibile.`,
  ): Promise<void> {
    const callId = randomUUID();
    emit({ v: 1, type: "tool.call", id: callId, name, args });

    const tool = this.tools?.get(name);
    if (!tool) {
      const data = { ok: false, error: { code: "TOOL_UNAVAILABLE", message: `${name} is not registered.` } };
      emit({ v: 1, type: "tool.result", id: callId, ok: false, data });
      emit({ v: 1, type: "tts.speak", text: unavailableText, persona: this.activePersonas.current() });
      return;
    }

    const data = await tool.handler(args);
    const ok = typeof data === "object" && data !== null && "ok" in data ? Boolean((data as { ok: unknown }).ok) : true;
    emit({ v: 1, type: "tool.result", id: callId, ok, data });
    emit({ v: 1, type: "tts.speak", text: speakText(ok, data), persona: this.activePersonas.current() });
  }

  private summaryFromToolData(data: unknown): string | null {
    if (typeof data !== "object" || data === null) return typeof data === "string" ? data : null;
    const maybeData = "data" in data ? (data as { data?: unknown }).data : data;
    if (typeof maybeData !== "object" || maybeData === null) return typeof maybeData === "string" ? maybeData : null;
    const summary = (maybeData as { summary?: unknown }).summary;
    return typeof summary === "string" && summary.trim() ? summary : null;
  }
}
