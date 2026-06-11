import readline from "node:readline";
import { existsSync, writeFileSync } from "node:fs";

const mode = process.argv[2] ?? "slow";
const marker = process.argv[3];

const rl = readline.createInterface({ input: process.stdin });

function send(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.method === "initialize") {
    send(msg.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "0.0.0" } });
    return;
  }
  if (msg.method === "notifications/initialized") return;
  if (msg.method === "tools/list") {
    const name = mode === "slow" ? "slow_tool" : "crash_tool";
    send(msg.id, { tools: [{ name, description: name, inputSchema: { type: "object", properties: {} } }] });
    return;
  }
  if (msg.method === "tools/call") {
    if (mode === "slow") {
      setTimeout(() => send(msg.id, { content: [{ type: "text", text: "{\"ok\":true,\"data\":{\"late\":true}}" }] }), 200);
      return;
    }
    if (marker && !existsSync(marker)) {
      writeFileSync(marker, "crashed", "utf8");
      process.exit(42);
      return;
    }
    send(msg.id, { content: [{ type: "text", text: "{\"ok\":true,\"data\":{\"recovered\":true}}" }] });
  }
});
