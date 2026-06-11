import { z } from "zod";
import { Lang, PersonaId } from "./events.js";

export const RoutingHints = z.object({
  preferred: z.enum(["local", "cloud"]),
  escalateOn: z.array(z.string()).default([]),
});

export const PersonaProfile = z.object({
  id: PersonaId,
  displayName: z.string(),
  voice: z.record(z.string()), // TTS engine id → voice id (e.g. kokoro → am_adam)
  agentInstruction: z.string(),
  sessionInstruction: z.string(),
  routingHints: RoutingHints,
  language: Lang.default("auto"),
});
export type PersonaProfile = z.infer<typeof PersonaProfile>;
