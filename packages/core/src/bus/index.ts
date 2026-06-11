import { createEventHub } from "./hub.js";

const hub = createEventHub({ host: "127.0.0.1", port: 7710 });

await hub.start();
console.log(`STARK-AI offline event hub listening on ws://127.0.0.1:${hub.port}`);

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
