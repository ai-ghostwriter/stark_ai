import type { ToolResult } from "./types.js";
import { errorMessage, failure, success } from "./types.js";

const musicActions = ["set", "mute", "unmute", "play", "pause"] as const;
type MusicAction = typeof musicActions[number];

const DEFAULT_HUB_URL = "ws://127.0.0.1:7710";
const HELLO = { v: 1, type: "hello", role: "voice", client: "mcp-os-music" } as const;

export type Publisher = (url: string, messages: string[]) => Promise<void>;

export type MusicControlDeps = {
  hubUrl?: string;
  publish?: Publisher;
};

export const musicControlSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: musicActions },
    value: { type: "number", minimum: 0, maximum: 100 },
  },
  required: ["action"],
  additionalProperties: false,
};

function clampPercent(value: unknown, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

// Usa la WebSocket globale di Node 22 (undici): nessuna dipendenza extra.
// Fire-and-forget best-effort: undici svuota i frame dati già accodati prima del
// frame di close, quindi su loopback i messaggi arrivano. Un comando musica perso
// è non-critico e ritentabile dall'utente; NON stringere il timeout pensando di
// "risolvere" un race — il close dopo send è intenzionale.
function defaultPublish(url: string, messages: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out connecting to hub at ${url}`));
    }, 1000);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      for (const message of messages) socket.send(message);
      socket.close();
      resolve();
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`Could not reach hub at ${url}`));
    });
  });
}

export function createMusicControl(deps: MusicControlDeps = {}) {
  const publish = deps.publish ?? defaultPublish;
  const hubUrl = deps.hubUrl ?? process.env.STARK_HUB_URL ?? DEFAULT_HUB_URL;

  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const action = String(args.action ?? "").trim().toLowerCase();
    if (!musicActions.includes(action as MusicAction)) {
      return failure("UNSUPPORTED_ACTION", `Music action '${action || "(empty)"}' is not supported.`);
    }

    const value = action === "set" ? clampPercent(args.value, 50) : undefined;
    const event = {
      v: 1,
      type: "ui.control",
      target: "music",
      action,
      ...(value !== undefined ? { value } : {}),
    };

    try {
      await publish(hubUrl, [JSON.stringify(HELLO), JSON.stringify(event)]);
      return success({ target: "music", action, value });
    } catch (error) {
      return failure("HUB_UNAVAILABLE", `Could not reach UI hub for music ${action}.`, errorMessage(error));
    }
  };
}
