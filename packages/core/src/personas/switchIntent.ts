import type { PersonaId, PersonaRegistry } from "./registry.js";

/**
 * Detects an explicit persona-switch utterance ("passa a X" / "switch to X").
 * Multi-word names are normalized by removing spaces/hyphens, so
 * "war machine" and "war-machine" both resolve to the "warmachine" profile.
 * Returns null for anything that is not an exact switch phrase or that names
 * an unknown persona — those flow through as normal turns.
 */
export function detectPersonaSwitch(text: string, registry: PersonaRegistry): PersonaId | null {
  const normalized = text.trim().toLowerCase();
  const match = /^(?:passa a|switch to)\s+([a-z][a-z\s-]*)$/i.exec(normalized);
  if (!match || !match[1]) return null;

  const candidate = match[1].trim().replace(/[\s-]+/g, "");
  if (!registry.has(candidate)) return null;
  return candidate;
}
