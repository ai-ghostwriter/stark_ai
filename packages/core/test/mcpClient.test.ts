import { join } from "node:path";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { McpServerHandle } from "../src/tools/mcp/serverHandle.js";

const fakeServer = join(process.cwd(), "test", "support", "fake-mcp-server.mjs");

describe("McpServerHandle", () => {
  it("returns a structured timeout error and keeps the core alive", async () => {
    const server = new McpServerHandle({
      name: "slow",
      command: process.execPath,
      args: [fakeServer, "slow"],
      timeoutMs: 20,
      retryBackoffMs: 1,
    });
    await server.connect();
    const tool = server.tools().find((entry) => entry.name === "slow_tool");

    await expect(tool?.invoke({})).resolves.toMatchObject({ ok: false, error: { code: "TOOL_TIMEOUT" } });
    await server.close();
  });

  it("isolates a crashed transport and respawns once for the next call", async () => {
    const marker = join(tmpdir(), `stark-fake-mcp-${Date.now()}.marker`);
    const server = new McpServerHandle({
      name: "crashy",
      command: process.execPath,
      args: [fakeServer, "crash-once", marker],
      timeoutMs: 500,
      retryBackoffMs: 1,
    });
    await server.connect();
    const tool = server.tools().find((entry) => entry.name === "crash_tool");

    await expect(tool?.invoke({})).resolves.toMatchObject({ ok: false, error: { code: "MCP_TRANSPORT_ERROR" } });
    await expect(tool?.invoke({})).resolves.toMatchObject({ ok: true, data: { recovered: true } });
    await server.close();
    await rm(marker, { force: true });
  });
});
