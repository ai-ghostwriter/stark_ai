import { Event } from "@stark-ai/contracts";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { FakeBrain, type FakeBrainOptions } from "../brain/fake.js";
import { RealBrain, type RealBrainOptions } from "../brain/real.js";

type Role = "voice" | "hud";

type ClientRecord = {
  socket: WebSocket;
  role: Role | null;
  client: string | null;
};

export type EventHubOptions = {
  host?: string;
  port?: number;
  brain?: Brain;
  brainOptions?: FakeBrainOptions & RealBrainOptions;
};

export type EventHub = {
  readonly port: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

type BrainInput = Extract<Event, { type: "stt.final" | "barge_in" }>;
type BrainOutput = Extract<Event, {
  type:
    | "route.info"
    | "agent.token"
    | "agent.done"
    | "tts.speak"
    | "tts.cancel"
    | "tool.call"
    | "tool.result"
    | "sys.error";
}>;

export type Brain = {
  handle(event: BrainInput, emit: (event: BrainOutput) => void): Promise<void>;
};

function selectBrain(options: EventHubOptions): Brain {
  if (options.brain) return options.brain;
  const requested = (process.env.STARK_BRAIN ?? (process.env.NODE_ENV === "test" ? "fake" : "real")).toLowerCase();
  if (requested === "fake") return new FakeBrain(options.brainOptions);
  if (requested === "real") return new RealBrain(options.brainOptions);
  console.warn(`[hub] unknown STARK_BRAIN='${requested}', falling back to real`);
  return new RealBrain(options.brainOptions);
}

export function createEventHub(options: EventHubOptions = {}): EventHub {
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port ?? 7710;
  const brain = selectBrain(options);
  const clients = new Map<WebSocket, ClientRecord>();
  let server: WebSocketServer | null = null;
  let activePort = requestedPort;

  function send(socket: WebSocket, event: Event): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  }

  function sendHubError(socket: WebSocket, message: string): void {
    send(socket, { v: 1, type: "sys.error", scope: "hub", message });
  }

  function hudBroadcast(event: Event): void {
    for (const client of clients.values()) {
      if (client.role === "hud") send(client.socket, event);
    }
  }

  function voiceBroadcast(event: Event): void {
    for (const client of clients.values()) {
      if (client.role === "voice") send(client.socket, event);
    }
  }

  async function handleEvent(sender: ClientRecord, event: Event): Promise<void> {
    if (event.type === "hello") {
      sender.role = event.role;
      sender.client = event.client;
      hudBroadcast(event);
      return;
    }

    hudBroadcast(event);

    if (sender.role !== "voice") return;

    if (event.type === "stt.final" || event.type === "barge_in") {
      await brain.handle(event, (output) => {
        hudBroadcast(output);
        if (output.type === "tts.speak" || output.type === "tts.cancel") {
          voiceBroadcast(output);
        }
      });
    }
  }

  function parseMessage(data: RawData): Event {
    const raw = typeof data === "string" ? data : data.toString();
    return Event.parse(JSON.parse(raw));
  }

  return {
    get port() {
      return activePort;
    },

    async start() {
      if (server) return;

      server = new WebSocketServer({ host, port: requestedPort });
      server.on("connection", (socket) => {
        const record: ClientRecord = { socket, role: null, client: null };
        clients.set(socket, record);

        socket.on("message", (data) => {
          let event: Event;
          try {
            event = parseMessage(data);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Invalid event.";
            sendHubError(socket, message);
            return;
          }

          void handleEvent(record, event).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "Hub handler failed.";
            sendHubError(socket, message);
          });
        });

        socket.on("close", () => clients.delete(socket));
      });

      await new Promise<void>((resolve) => server?.once("listening", resolve));
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Unable to resolve hub address.");
      }
      activePort = address.port;
    },

    async stop() {
      if (!server) return;

      for (const socket of clients.keys()) {
        socket.close();
      }
      clients.clear();

      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
      server = null;
    },
  };
}
