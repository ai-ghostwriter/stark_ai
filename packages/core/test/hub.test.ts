import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { Event } from "@stark-ai/contracts";
import { createEventHub, type EventHub } from "../src/bus/hub.js";

const openHubs: EventHub[] = [];

function readJson(socket: WebSocket): Promise<Event> {
  return new Promise((resolve) => {
    socket.once("message", (data) => resolve(JSON.parse(data.toString()) as Event));
  });
}

function connectClient(port: number, hello: Event): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.once("open", () => {
      socket.send(JSON.stringify(hello));
      resolve(socket);
    });
    socket.once("error", reject);
  });
}

async function startHub(): Promise<EventHub> {
  const hub = createEventHub({ port: 0, host: "127.0.0.1", brainOptions: { tokenDelayMs: 0 } });
  await hub.start();
  openHubs.push(hub);
  return hub;
}

describe("event hub", () => {
  afterEach(async () => {
    await Promise.all(openHubs.splice(0).map((hub) => hub.stop()));
  });

  it("accepts voice and hud hello clients", async () => {
    const hub = await startHub();

    const voice = await connectClient(hub.port, { v: 1, type: "hello", role: "voice", client: "voice-test" });
    const hud = await connectClient(hub.port, { v: 1, type: "hello", role: "hud", client: "hud-test" });

    expect(voice.readyState).toBe(WebSocket.OPEN);
    expect(hud.readyState).toBe(WebSocket.OPEN);

    voice.close();
    hud.close();
  });

  it("sends sys.error to sender for malformed JSON and keeps running", async () => {
    const hub = await startHub();
    const voice = await connectClient(hub.port, { v: 1, type: "hello", role: "voice", client: "voice-test" });

    voice.send("{bad json");

    await expect(readJson(voice)).resolves.toMatchObject({ v: 1, type: "sys.error", scope: "hub" });
    expect(voice.readyState).toBe(WebSocket.OPEN);

    voice.close();
  });

  it("broadcasts voice-originated traffic and FakeBrain output to hud clients", async () => {
    const hub = await startHub();
    const hud = await connectClient(hub.port, { v: 1, type: "hello", role: "hud", client: "hud-test" });
    const voice = await connectClient(hub.port, { v: 1, type: "hello", role: "voice", client: "voice-test" });
    const seen: Event[] = [];
    hud.on("message", (data) => seen.push(JSON.parse(data.toString()) as Event));

    voice.send(JSON.stringify({ v: 1, type: "stt.final", text: "prova hub", lang: "it" }));

    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (seen.some((event) => event.type === "tts.speak")) {
          clearInterval(timer);
          resolve();
        }
      }, 5);
    });

    expect(seen.map((event) => event.type)).toEqual(
      expect.arrayContaining(["stt.final", "route.info", "agent.token", "agent.done", "tts.speak"]),
    );

    voice.close();
    hud.close();
  });
});
