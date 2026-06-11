import { createEventHub } from "./hub.js";

async function detectOnlineOnce(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);

  try {
    const response = await fetch("https://api.anthropic.com", {
      method: "HEAD",
      signal: controller.signal,
    });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

const online = await detectOnlineOnce();
const hub = createEventHub({ host: "127.0.0.1", port: 7710, brainOptions: { online } });

await hub.start();
console.log(`STARK-AI offline event hub listening on ws://127.0.0.1:${hub.port} (online=${online})`);

async function shutdown(): Promise<void> {
  await hub.stop();
  process.exit(0);
}

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
