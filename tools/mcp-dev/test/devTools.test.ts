import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCodeHelper } from "../src/codeHelper.js";
import { createDevAgent } from "../src/devAgent.js";
import { createGameUpdater } from "../src/gameUpdater.js";

describe("mcp-dev code_helper", () => {
  it("runs supported files with captured output", async () => {
    const runFile = vi.fn(async () => ({ code: 0, stdout: "ok\n", stderr: "" }));
    const tool = createCodeHelper({ runFile });

    await expect(tool({ action: "run", file_path: "/tmp/app.js", args: ["--x"] })).resolves.toMatchObject({
      ok: true,
      data: { exitCode: 0, stdout: "ok\n" },
    });
  });

  it("drops LLM-only write/edit/explain actions", async () => {
    const tool = createCodeHelper();
    await expect(tool({ action: "write", description: "make an app" })).resolves.toMatchObject({
      ok: false,
      error: { code: "LLM_ACTION_UNSUPPORTED" },
    });
  });
});

describe("mcp-dev dev_agent", () => {
  it("scaffolds a deterministic Node project", async () => {
    const root = await mkdtemp(join(tmpdir(), "stark-dev-agent-"));
    try {
      const tool = createDevAgent();
      await expect(tool({ action: "scaffold", target_dir: root, project_name: "demo", template: "node-cli" })).resolves.toMatchObject({
        ok: true,
        data: { projectName: "demo" },
      });
      await expect(readFile(join(root, "demo", "package.json"), "utf8")).resolves.toContain("\"type\": \"module\"");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("mcp-dev game_updater", () => {
  it("lists known app ids deterministically", async () => {
    const tool = createGameUpdater();
    await expect(tool({ action: "resolve", game_name: "cs2" })).resolves.toMatchObject({
      ok: true,
      data: { appId: "730", name: "Counter-Strike 2" },
    });
  });
});
