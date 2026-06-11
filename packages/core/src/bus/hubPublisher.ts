import { Event, type RenderEvent } from "@stark-ai/contracts";
import WebSocket from "ws";

const DEFAULT_HUB_URL = "ws://127.0.0.1:7710";
const CONNECT_TIMEOUT_MS = 300;
const CLIENT_HELLO = { v: 1, type: "hello", role: "voice", client: "core-tools-http" } as const;

let socket: WebSocket | null = null;
let socketUrl: string | null = null;

function hubUrl(): string {
  return process.env.STARK_HUB_URL ?? DEFAULT_HUB_URL;
}

function resetSocket(): void {
  socket?.removeAllListeners();
  socket?.close();
  socket = null;
  socketUrl = null;
}

function connect(url: string): Promise<WebSocket> {
  if (socket && socketUrl === url && socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);
  if (socket && socketUrl !== url) resetSocket();

  return new Promise((resolve, reject) => {
    const nextSocket = new WebSocket(url);
    socket = nextSocket;
    socketUrl = url;

    const timeout = setTimeout(() => {
      nextSocket.terminate();
      reject(new Error(`Timed out connecting to hub at ${url}`));
    }, CONNECT_TIMEOUT_MS);

    nextSocket.once("open", () => {
      clearTimeout(timeout);
      nextSocket.send(JSON.stringify(CLIENT_HELLO));
      resolve(nextSocket);
    });
    nextSocket.once("error", (error) => {
      clearTimeout(timeout);
      resetSocket();
      reject(error);
    });
    nextSocket.once("close", () => {
      if (socket === nextSocket) resetSocket();
    });
  });
}

export async function publishRenderEvent(event: RenderEvent): Promise<void> {
  const parsed = Event.parse(event);
  const url = hubUrl();
  try {
    const currentSocket = await connect(url);
    await new Promise<void>((resolve, reject) => {
      currentSocket.send(JSON.stringify(parsed), (error) => error ? reject(error) : resolve());
    });
  } catch (error) {
    console.warn(`[hub-publisher] could not publish render.event to ${url}: ${(error as Error).message}`);
  }
}
