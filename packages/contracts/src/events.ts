import { z } from "zod";
import { RenderType } from "./render.js";

export const Lang = z.enum(["auto", "it", "en", "de", "fr"]);
export const PersonaId = z.enum(["jarvis", "friday", "veronica", "warmachine", "default"]);

const base = { v: z.literal(1) };

// — handshake —
export const Hello = z.object({ ...base, type: z.literal("hello"),
  role: z.enum(["voice", "hud"]), client: z.string() });

// — voice-core → agent-core —
export const SttPartial = z.object({ ...base, type: z.literal("stt.partial"), text: z.string() });
export const SttFinal   = z.object({ ...base, type: z.literal("stt.final"),
  text: z.string(), lang: Lang.default("auto") });
export const BargeIn    = z.object({ ...base, type: z.literal("barge_in") });

// — agent-core → voice-core —
export const TtsSpeak  = z.object({ ...base, type: z.literal("tts.speak"),
  text: z.string(), voice: z.string().optional(), persona: PersonaId.default("default") });
export const TtsCancel = z.object({ ...base, type: z.literal("tts.cancel") });

// — agent-core → hud (and log) —
export const AgentToken = z.object({ ...base, type: z.literal("agent.token"), delta: z.string() });
export const AgentDone  = z.object({ ...base, type: z.literal("agent.done") });
export const RouteInfo  = z.object({ ...base, type: z.literal("route.info"),
  provider: z.string(), model: z.string(), reason: z.string() });
export const ToolCall   = z.object({ ...base, type: z.literal("tool.call"),
  id: z.string(), name: z.string(), args: z.record(z.unknown()) });
export const ToolResult = z.object({ ...base, type: z.literal("tool.result"),
  id: z.string(), ok: z.boolean(), data: z.unknown() });
export const SysError   = z.object({ ...base, type: z.literal("sys.error"),
  scope: z.string(), message: z.string() });

// — agent-core → hud (pannelli) —
export const RenderEvent = z.object({ ...base, type: z.literal("render.event"),
  id: z.string(), ts: z.number().int(), tool: z.string(), render: RenderType,
  title: z.string(), spoken: z.string(), payload: z.record(z.unknown()) });
export type RenderEvent = z.infer<typeof RenderEvent>;

// — agent-core → hud (controllo UI) —
export const UiControl = z.object({ ...base, type: z.literal("ui.control"),
  target: z.literal("music"),
  action: z.enum(["set", "mute", "unmute", "play", "pause"]),
  value: z.number().min(0).max(100).optional() });
export type UiControl = z.infer<typeof UiControl>;

export const Event = z.discriminatedUnion("type", [
  Hello, SttPartial, SttFinal, BargeIn,
  TtsSpeak, TtsCancel,
  AgentToken, AgentDone, RouteInfo, ToolCall, ToolResult, SysError,
  RenderEvent, UiControl,
]);
export type Event = z.infer<typeof Event>;

export const parseEvent = (raw: string): Event => Event.parse(JSON.parse(raw));
